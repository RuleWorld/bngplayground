import { profileLikelihood, simulate, loadEvaluator } from '@bngplayground/engine';
import type { ProfileLikelihoodResult } from '@bngplayground/engine';
import type { ToolArgs, ToolResult, MCPErrorResult } from '../types/index.js';
import { identifiabilityArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, applyNetworkOptions, parseModelOrThrow, expandModel, buildSimulationOptions, withDataOnlySimulationOutput, cloneExpandedModel, updateMassActionRates } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleIdentifiability(args: ToolArgs): Promise<ToolResult<ProfileLikelihoodResult | MCPErrorResult>> {
    try {
        const parsedArgs = parseArgs('identifiability_analysis', identifiabilityArgsSchema, args);

        if (!parsedArgs.code || parsedArgs.code.trim() === '') {
            return createToolResult(structureError(
                new Error('Model code must be a non-empty string.'),
            ));
        }

        if (!parsedArgs.data || parsedArgs.data.length === 0) {
            return createToolResult(structureError(
                new Error('Experimental data array must be non-empty.'),
            ));
        }

        const model = applyNetworkOptions(parseModelOrThrow(parsedArgs.code), parsedArgs);
        const expandedModel = await expandModel(model);

        const modelParamKeys = Object.keys(model.parameters);
        if (modelParamKeys.length === 0) {
            return createToolResult(structureError(
                new Error('Model defines no parameters for identifiability analysis.'),
            ));
        }

        if (parsedArgs.parameters) {
            if (parsedArgs.parameters.length === 0) {
                return createToolResult(structureError(
                    new Error('Parameters array must be non-empty when specified.'),
                ));
            }

            const modelParamSet = new Set(modelParamKeys);
            const unknownParameters = parsedArgs.parameters.filter((p) => !modelParamSet.has(p));
            if (unknownParameters.length > 0) {
                return createToolResult(structureError(
                    new Error(`Unknown parameters for identifiability analysis: ${unknownParameters.join(', ')}. Available parameters: ${modelParamKeys.join(', ')}`),
                ));
            }
        }

        const simOptions = withDataOnlySimulationOutput(buildSimulationOptions(parsedArgs));
        await loadEvaluator();

        const parameterNames = parsedArgs.parameters ?? modelParamKeys;
        const parameters: Record<string, number> = { ...model.parameters };

        const experimentalData = parsedArgs.data.map((d) => ({
            time: d.time,
            values: d.observables,
        }));

        const result = await profileLikelihood({
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
            experimentalData,
            nGrid: parsedArgs.n_grid ?? 20,
            rangeFactor: parsedArgs.range_factor ?? 10,
            reoptimize: parsedArgs.reoptimize ?? true,
            alpha: parsedArgs.alpha ?? 0.95,
            maxReoptEval: parsedArgs.max_reopt_eval ?? 50,
        });

        return createToolResult(result);
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
