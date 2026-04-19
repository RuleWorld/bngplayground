import { perturbationScreen, simulate, loadEvaluator } from '@bngplayground/engine';
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
export async function handlePerturbationScreen(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('perturbation_screen', perturbationScreenArgsSchema, args);
        await loadEvaluator();

        // Validate up-front that the BNGL parses, so the user gets a clean
        // error before we spawn N background simulations.
        const wtModel = parseModelOrThrow(parsedArgs.code);
        const modelObsNames = new Set((wtModel.observables ?? []).map((o) => o.name));
        const missingObs = parsedArgs.observables.filter((o) => !modelObsNames.has(o));
        if (missingObs.length > 0) {
            return createToolResult(structureError(
                new Error(`Observables not defined in model: ${missingObs.join(', ')}`),
            ));
        }

        const result = await perturbationScreen({
            code: parsedArgs.code,
            t_end: parsedArgs.t_end,
            n_steps: parsedArgs.n_steps,
            observables: parsedArgs.observables,
            perturbations: parsedArgs.perturbations,
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
                    ...(parsedArgs.solver ? { solver: parsedArgs.solver } : {}),
                } as any, { checkCancelled: () => {}, postMessage: () => {} });
            },
        });

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
        return createToolResult(structureError(error instanceof Error ? error : new Error(String(error))));
    }
}