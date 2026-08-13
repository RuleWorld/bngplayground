import { profileLikelihood, simulate, loadEvaluator } from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { identifiabilityArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, applyNetworkOptions, parseModelOrThrow, expandModel, buildSimulationOptions, withDataOnlySimulationOutput, cloneExpandedModel, updateMassActionRates } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleIdentifiability(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('identifiability_analysis', identifiabilityArgsSchema, args);
        const model = applyNetworkOptions(parseModelOrThrow(parsedArgs.code), parsedArgs);
        const expandedModel = await expandModel(model);

        const simOptions = withDataOnlySimulationOutput(buildSimulationOptions(parsedArgs));
        await loadEvaluator();

        const parameterNames = parsedArgs.parameters ?? Object.keys(model.parameters);
        const parameters: Record<string, number> = {};
        for (const name of parameterNames) {
            parameters[name] = model.parameters[name] ?? 1;
        }

        const experimentalData = parsedArgs.data.map((d: any) => ({
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
        });

        return createToolResult(result);
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
