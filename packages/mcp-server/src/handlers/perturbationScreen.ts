import { perturbationScreen, estimatePerturbationSimulations, simulate, loadEvaluator } from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { perturbationScreenArgsSchema } from '../schemas/index.js';
import {
    createToolResult,
    parseArgs,
    parseModelOrThrow,
    expandModel,
    cloneExpandedModel,
    updateMassActionRates,
} from '../services/engine.js';
import { structureError } from '../services/errors.js';

/**
 * perturbation_screen
 *
 * Runs a systematic in-silico perturbation screen over reaction rules,
 * seed species, and molecule types. For each perturbed model variant, runs
 * a full simulation and scores deviation from the wild-type trajectory.
 *
 * Engine entry point: `perturbationScreen(config)` from
 * `packages/engine/src/services/analysis/PerturbationScreen.ts` (already
 * exported from the engine barrel at line 246 of packages/engine/src/index.ts).
 *
 * The screen re-parses BNGL per perturbation because PerturbationScreen needs
 * to edit raw source (commenting out lines in `begin reaction rules`, etc.) —
 * it cannot operate on an already-expanded model.
 */
export async function handlePerturbationScreen(args: ToolArgs): Promise<ToolResult<unknown>> {
    try {
        const parsedArgs = parseArgs('perturbation_screen', perturbationScreenArgsSchema, args);

        if (!parsedArgs.code || parsedArgs.code.trim() === '') {
            return createToolResult(structureError(
                new Error('Model code must be a non-empty string.'),
            ));
        }

        if (parsedArgs.max_pairwise !== undefined && parsedArgs.max_pairwise > 1000) {
            return createToolResult(structureError(
                new Error('max_pairwise > 1000 is not supported to avoid excessive execution times.'),
            ));
        }

        await loadEvaluator();

        // Validate up-front that the BNGL parses, so the user gets a clean
        // error before we spawn N background simulations.
        const wtModel = parseModelOrThrow(parsedArgs.code);

        // Deduplicate observables and perturbations
        const uniqueObservables = Array.from(new Set(parsedArgs.observables));
        const uniquePerturbations = Array.from(new Set(parsedArgs.perturbations));

        const modelObsNames = new Set((wtModel.observables ?? []).map((o) => o.name));
        const missingObs = uniqueObservables.filter((o) => !modelObsNames.has(o));
        if (missingObs.length > 0) {
            return createToolResult(structureError(
                new Error(`Observables not defined in model: ${missingObs.join(', ')}`),
            ));
        }

        // Pre-estimate the number of simulations to prevent excessive resource utilization / timeout
        const expectedSimulations = estimatePerturbationSimulations(
            parsedArgs.code,
            uniquePerturbations,
            parsedArgs.max_pairwise,
        );

        if (expectedSimulations > 300) {
            return createToolResult(structureError(
                new Error(`The requested perturbation screen requires ${expectedSimulations} simulations, which exceeds the limit of 300. Please reduce the size of the model, decrease max_pairwise, or select fewer perturbation classes.`),
            ));
        }

        const result = await perturbationScreen({
            code: parsedArgs.code,
            t_end: parsedArgs.t_end,
            n_steps: parsedArgs.n_steps,
            observables: uniqueObservables,
            perturbations: uniquePerturbations,
            knockdownFraction: parsedArgs.knockdown_fraction,
            metric: parsedArgs.metric,
            maxPairwise: parsedArgs.max_pairwise,
            runSimulation: async (bnglCode, t_end, n_steps) => {
                // Each perturbed variant needs the full parse → expand pipeline
                // because commented-out rules change the expanded network.
                const model = parseModelOrThrow(bnglCode);
                const expanded = await expandModel(model);
                const runModel = cloneExpandedModel(expanded);
                updateMassActionRates(runModel);
                return simulate(0, runModel, {
                    method: parsedArgs.method ?? 'ode',
                    t_end,
                    n_steps,
                    strictFunctionalRates: true,
                    ...(parsedArgs.solver ? { solver: parsedArgs.solver } : {}),
                }, { checkCancelled: () => {}, postMessage: () => {} });
            },
        });

        // Check if zero perturbations could actually be applied
        if (result.results.length === 0) {
            return createToolResult(structureError(
                new Error('No perturbations could be applied. Check that the model contains elements (rules, species, or molecule types) matching the requested perturbation classes.'),
            ));
        }

        // Check if all perturbed simulations failed
        if (result.results.every((r) => !r.success)) {
            const errorMessages = Array.from(new Set(result.results.map((r) => r.error).filter(Boolean)));
            return createToolResult(structureError(
                new Error(`All perturbed simulations failed. Errors: ${errorMessages.join('; ')}`),
            ));
        }

        // Rank results by aggregate score (descending — biggest effects first).
        const rankedResults = [...result.results].sort((a, b) => b.aggregateScore - a.aggregateScore);

        return createToolResult({
            summary: {
                totalSimulations: result.totalSimulations,
                failedSimulations: result.failedSimulations,
                wallTimeMs: result.wallTimeMs,
                nResults: result.results.length,
                nSyntheticLethal: result.syntheticPairs?.length ?? 0,
                nFailed: result.results.filter((r) => !r.success).length,
            },
            wildTypeTrajectory: result.wildTypeTrajectory,
            results: rankedResults.map((r) => ({
                target: r.target,
                type: r.type,
                aggregateScore: r.aggregateScore,
                deviations: r.deviations,
                success: r.success,
                ...(r.error ? { error: r.error } : {}),
            })),
            ...(result.syntheticPairs ? {
                syntheticPairs: [...result.syntheticPairs].sort((a, b) => b.synergy - a.synergy),
            } : {}),
        });
    } catch (error) {
        return createToolResult(structureError(error instanceof Error ? error : new Error(String(error), { cause: error })));
    }
}
