import { computeFirstPassageTimes, simulate, loadEvaluator } from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { firstPassageTimeArgsSchema } from '../schemas/index.js';
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
 * first_passage_time
 *
 * From an SSA trajectory ensemble, compute first-passage-time distributions
 * for any set of above/below threshold conditions on declared observables.
 *
 * Engine entry point: `computeFirstPassageTimes(config)` from
 * `packages/engine/src/services/analysis/FirstPassageTime.ts` (already
 * exported from the engine barrel at line 238 of packages/engine/src/index.ts).
 *
 * The engine function is pure (takes raw trajectory data, no simulator
 * dependency). The handler's work is:
 *   1. Validate thresholds reference real observables.
 *   2. Run N seeded SSA trajectories.
 *   3. Reshape the SSA output into the function's expected layout.
 *   4. Call computeFirstPassageTimes.
 *
 * Serial SSA for n_trajectories ≤ 100 on a ~10-species model finishes in
 * seconds. For larger ensembles the handler should route through BnglWorkerPool;
 * that routing is deferred to a follow-up (the worker-pool API is
 * browser-worker-coupled and the MCP server runs in Node).
 */
export async function handleFirstPassageTime(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('first_passage_time', firstPassageTimeArgsSchema, args);
        await loadEvaluator();

        const model = parseModelOrThrow(parsedArgs.code);
        const expanded = await expandModel(model);

        const requiredObs = new Set(parsedArgs.thresholds.map((t) => t.observable));
        const modelObsNames = new Set((model.observables ?? []).map((o) => o.name));
        const missing = [...requiredObs].filter((o) => !modelObsNames.has(o));
        if (missing.length > 0) {
            return createToolResult(structureError(
                new Error(`Thresholds reference observables not in model: ${missing.join(', ')}`),
            ));
        }

        if (parsedArgs.n_trajectories > 500) {
            return createToolResult(structureError(
                new Error('n_trajectories > 500 not supported by this handler (serial SSA). ' +
                          'Split the request or use the UI-side worker-pool path.'),
            ));
        }

        const baseSeed = parsedArgs.seed ?? 42;
        const trajectories: Array<{ times: number[]; values: Record<string, number[]> }> = [];
        let nFailed = 0;

        for (let i = 0; i < parsedArgs.n_trajectories; i++) {
            try {
                const runModel = cloneExpandedModel(expanded);
                updateMassActionRates(runModel);
                const simResult = await simulate(0, runModel, {
                    method: 'ssa',
                    t_end: parsedArgs.t_end,
                    n_steps: parsedArgs.n_steps,
                    seed: baseSeed + i,
                } as any, { checkCancelled: () => {}, postMessage: () => {} });

                const times = simResult.data.map((d) => Number(d.time));
                const values: Record<string, number[]> = {};
                for (const obsName of requiredObs) {
                    values[obsName] = simResult.data.map((d) => Number(d[obsName] ?? NaN));
                }
                trajectories.push({ times, values });
            } catch (e) {
                nFailed++;
            }
        }

        if (trajectories.length === 0) {
            return createToolResult(structureError(
                new Error(`All ${parsedArgs.n_trajectories} SSA trajectories failed.`),
            ));
        }

        const distributions = computeFirstPassageTimes({
            trajectories,
            thresholds: parsedArgs.thresholds,
        });

        return createToolResult({
            summary: {
                nTrajectoriesRequested: parsedArgs.n_trajectories,
                nTrajectoriesSuccessful: trajectories.length,
                nTrajectoriesFailed: nFailed,
                nThresholds: parsedArgs.thresholds.length,
            },
            distributions: distributions.map((d) => ({
                label: d.label,
                observable: d.observable,
                threshold: d.threshold,
                direction: d.direction,
                crossingFraction: d.crossingFraction,
                nCrossings: d.times.length,
                mean: d.mean,
                median: d.median,
                std: d.std,
                cv: d.cv,
                percentiles: d.percentiles,
            })),
        });
    } catch (error) {
        return createToolResult(structureError(error instanceof Error ? error : new Error(String(error))));
    }
}