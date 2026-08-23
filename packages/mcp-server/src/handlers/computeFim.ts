import { computeFIM, computeCollinearity, simulate, loadEvaluator } from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { computeFimArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, applyNetworkOptions, parseModelOrThrow, expandModel, buildSimulationOptions, withDataOnlySimulationOutput, cloneExpandedModel, updateMassActionRates } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleComputeFim(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('compute_fim', computeFimArgsSchema, args);
        const model = applyNetworkOptions(parseModelOrThrow(parsedArgs.code), parsedArgs);
        const expandedModel = await expandModel(model);

        const simOptions = withDataOnlySimulationOutput(buildSimulationOptions(parsedArgs));
        await loadEvaluator();

        const parameterNames = parsedArgs.parameters ?? Object.keys(model.parameters);
        const unknownParams = parameterNames.filter((name) => !(name in model.parameters));
        if (unknownParams.length > 0) {
            throw new Error(`Unknown parameter(s): ${unknownParams.join(', ')}. Available parameters: ${Object.keys(model.parameters).join(', ') || '(none)'}`);
        }
        const parameters: Record<string, number> = {};
        for (const name of parameterNames) {
            parameters[name] = model.parameters[name] ?? 1;
        }

        const result = await computeFIM({
            simulate: async (overrides) => {
                const runModel = cloneExpandedModel(expandedModel);
                Object.entries(overrides).forEach(([k, v]) => {
                    runModel.parameters[k] = v;
                });
                updateMassActionRates(runModel);
                return simulate(0, runModel, simOptions, {
                    checkCancelled: () => { },
                    postMessage: () => { },
                });
            },
            parameters,
            parameterNames,
            allTimepoints: parsedArgs.all_timepoints ?? true,
            logParameters: parsedArgs.log_parameters ?? false,
            approxProfile: parsedArgs.approx_profile ?? false,
        });

        // Also compute collinearity if requested
        let collinearity = undefined;
        if (parsedArgs.compute_collinearity) {
            collinearity = computeCollinearity(
                result.jacobian,
                result.paramNames,
                parsedArgs.collinearity_subset_size ?? 2,
            );
        }

        return createToolResult({ fim: result, collinearity });
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
