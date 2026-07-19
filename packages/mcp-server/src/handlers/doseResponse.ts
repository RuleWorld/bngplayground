import { computeDoseResponse, computeDoseResponseBySimulation, loadEvaluator } from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { doseResponseArgsSchema } from '../schemas/index.js';
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
 * dose_response
 *
 * Steady-state dose–response analysis over a swept input parameter with
 * optional Hill fitting and bifurcation detection.
 *
 * Engine entry point: `computeDoseResponse(config)` from
 * `packages/engine/src/services/analysis/DoseResponse.ts` (already exported
 * from the engine barrel at line 242 of packages/engine/src/index.ts).
 *
 * The engine function is synchronous and takes the expanded BNGLReaction and
 * BNGLSpecies arrays directly; we extract those from expandModel().
 */
export async function handleDoseResponse(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('dose_response', doseResponseArgsSchema, args);
        await loadEvaluator();

        const model = parseModelOrThrow(parsedArgs.code);
        const expanded = await expandModel(model);

        if (!(parsedArgs.input_parameter in model.parameters)) {
            return createToolResult(structureError(
                new Error(
                    `input_parameter '${parsedArgs.input_parameter}' is not declared in the model. ` +
                    `Known parameters: ${Object.keys(model.parameters).join(', ')}`,
                ),
            ));
        }

        const modelObsNames = new Set((model.observables ?? []).map((o) => o.name));
        const missing = parsedArgs.observables.filter((o) => !modelObsNames.has(o));
        if (missing.length > 0) {
            return createToolResult(structureError(
                new Error(`Observables not declared in model: ${missing.join(', ')}`),
            ));
        }

        if (parsedArgs.input_min >= parsedArgs.input_max) {
            return createToolResult(structureError(
                new Error('input_min must be strictly less than input_max'),
            ));
        }

        const nPoints = parsedArgs.n_points ?? 50;
        const logScale = parsedArgs.log_scale ?? true;
        const tEnd = parsedArgs.t_end ?? 1e4;

        if (parsedArgs.method === 'simulate') {
            const simulated = await computeDoseResponseBySimulation(
                expanded,
                parsedArgs.input_parameter,
                parsedArgs.observables,
                parsedArgs.input_min,
                parsedArgs.input_max,
                nPoints,
                logScale,
                tEnd,
            );

            const totalPoints = simulated.curves.reduce((acc, curve) => acc + curve.responses.length, 0);
            if (totalPoints === 0) {
                return createToolResult(structureError(
                    new Error('dose_response produced no curve points using method="simulate". Try increasing t_end or checking model observables/parameter ranges.'),
                ));
            }

            return createToolResult({
                inputParameter: parsedArgs.input_parameter,
                methodUsed: 'simulate',
                failedDoses: simulated.failedDoses,
                summary: {
                    nCurves: simulated.curves.length,
                    nFailed: simulated.failedDoses.length,
                    nFitted: 0,
                    nBifurcationPoints: 0,
                },
                curves: simulated.curves,
            });
        }

        const requestedToEngineObservable = new Map<string, string>();
        const modelObservables = model.observables ?? [];
        const speciesNames = new Set((expanded.species ?? []).map((s) => s.name));
        for (const observable of parsedArgs.observables) {
            const modelObservable = modelObservables.find((o) => o.name === observable);
            const pattern = modelObservable?.pattern;
            // computeDoseResponse resolves by observable name only when speciesIndices are present;
            // otherwise it falls back to exact species-name matches.
            if (typeof pattern === 'string' && speciesNames.has(pattern)) {
                requestedToEngineObservable.set(observable, pattern);
            } else {
                requestedToEngineObservable.set(observable, observable);
            }
        }

        const result = await computeDoseResponse({
            model,
            reactions: expanded.reactions ?? [],
            species: expanded.species,
            inputParameter: parsedArgs.input_parameter,
            inputRange: { min: parsedArgs.input_min, max: parsedArgs.input_max },
            nPoints: parsedArgs.n_points,
            logScale: parsedArgs.log_scale,
            observables: [...requestedToEngineObservable.values()],
            method: parsedArgs.method,
            t_end: parsedArgs.t_end,
            tolerance: parsedArgs.tolerance,
            detectBifurcations: parsedArgs.detect_bifurcations,
        });

        const totalRootfindPoints = result.curves.reduce((acc, curve) => acc + curve.responses.length, 0);
        if (totalRootfindPoints === 0) {
            const simulated = await computeDoseResponseBySimulation(
                expanded,
                parsedArgs.input_parameter,
                parsedArgs.observables,
                parsedArgs.input_min,
                parsedArgs.input_max,
                nPoints,
                logScale,
                tEnd,
            );
            const totalSimPoints = simulated.curves.reduce((acc, curve) => acc + curve.responses.length, 0);

            if (totalSimPoints === 0) {
                return createToolResult({
                inputParameter: result.inputParameter,
                methodUsed: result.methodUsed,
                fallbackUsed: result.fallbackUsed,
                warning: result.warning,
                failedDoses: result.failedDoses,
                summary: result.summary,
                curves: result.curves,
            });
            }

            return createToolResult({
                inputParameter: parsedArgs.input_parameter,
                methodUsed: 'simulate',
                fallbackUsed: 'rootfind_to_simulate',
                warning: 'Root-finding produced no curve points; returned simulation-based fallback curves instead.',
                failedDoses: simulated.failedDoses,
                summary: {
                    nCurves: simulated.curves.length,
                    nFailed: simulated.failedDoses.length,
                    nFitted: 0,
                    nBifurcationPoints: 0,
                },
                curves: simulated.curves,
            });
        }

        const engineToRequestedObservable = new Map<string, string>();
        for (const [requested, engineObservable] of requestedToEngineObservable.entries()) {
            engineToRequestedObservable.set(engineObservable, requested);
        }

        return createToolResult({
            inputParameter: result.inputParameter,
            methodUsed: 'rootfind',
            failedDoses: result.failedDoses,
            summary: {
                nCurves: result.curves.length,
                nFailed: result.failedDoses.length,
                nFitted: result.curves.filter((c) => c.hillFit !== undefined).length,
                nBifurcationPoints: result.curves.reduce(
                    (acc, c) => acc + (c.bifurcationPoints?.length ?? 0),
                    0,
                ),
            },
            curves: result.curves.map((c) => ({
                observable: engineToRequestedObservable.get(c.observable) ?? c.observable,
                doses: c.doses,
                responses: c.responses,
                ...(c.hillFit ? { hillFit: c.hillFit } : {}),
                ...(c.bifurcationPoints && c.bifurcationPoints.length > 0
                    ? { bifurcationPoints: c.bifurcationPoints }
                    : {}),
            })),
        });
    } catch (error) {
        return createToolResult(structureError(error instanceof Error ? error : new Error(String(error))));
    }
}