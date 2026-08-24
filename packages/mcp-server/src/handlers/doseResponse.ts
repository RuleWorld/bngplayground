import { computeDoseResponse, loadEvaluator } from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { doseResponseArgsSchema } from '../schemas/index.js';
import {
    createToolResult,
    parseArgs,
    parseModelOrThrow,
    expandModel,
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
 * The engine function handles parameter validation, observable resolution,
 * simulation method execution, rootfind-to-simulate fallbacks, Hill fitting,
 * and bifurcation detection directly.
 */
export async function handleDoseResponse(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('dose_response', doseResponseArgsSchema, args);
        await loadEvaluator();

        if (!parsedArgs.code || parsedArgs.code.trim() === '') {
            return createToolResult(structureError(
                new Error(`Model code must be a non-empty string. Received: '${parsedArgs.code}'`),
            ));
        }

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

        const fullModel = {
            ...model,
            reactions: expanded.reactions ?? [],
            species: expanded.species ?? [],
            ...(expanded.concreteObservables ? { concreteObservables: expanded.concreteObservables } : {}),
        };

        const result = await computeDoseResponse({
            model: fullModel,
            reactions: expanded.reactions ?? [],
            species: expanded.species,
            inputParameter: parsedArgs.input_parameter,
            inputRange: { min: parsedArgs.input_min, max: parsedArgs.input_max },
            nPoints: parsedArgs.n_points,
            logScale: parsedArgs.log_scale,
            observables: parsedArgs.observables,
            method: parsedArgs.method,
            t_end: parsedArgs.t_end,
            tolerance: parsedArgs.tolerance,
            detectBifurcations: parsedArgs.detect_bifurcations,
        });

        const totalPoints = result.curves.reduce((acc, curve) => acc + curve.responses.length, 0);
        if (totalPoints === 0) {
            return createToolResult(structureError(
                new Error(
                    `dose_response analysis failed: both steady-state root-finding and fallback simulation failed to converge for input parameter '${parsedArgs.input_parameter}' over range [${parsedArgs.input_min}, ${parsedArgs.input_max}]. ` +
                    'Check that your parameter ranges, rate constants, or initial species concentrations are physically reasonable.'
                )
            ));
        }

        return createToolResult(result);
    } catch (error) {
        return createToolResult(structureError(error instanceof Error ? error : new Error(String(error), { cause: error })));
    }
}
