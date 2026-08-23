import { ParamBounds, ExperimentalDataPoint, fitParameters, simulate, loadEvaluator } from '@bngplayground/engine';
import { z } from 'zod';
import { ToolArgs, ToolResult } from '../types/index.js';
import { fitParametersArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, applyNetworkOptions, parseModelOrThrow, expandModel, withDataOnlySimulationOutput, cloneExpandedModel, updateMassActionRates } from '../services/engine.js';
import { structureError } from '../services/errors.js';

type FitParametersArgs = z.infer<typeof fitParametersArgsSchema>;

export async function handleFitParameters(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('fit_parameters', fitParametersArgsSchema, args) as FitParametersArgs;
        const model = applyNetworkOptions(parseModelOrThrow(parsedArgs.code), parsedArgs);
        const expandedModel = await expandModel(model);

        const paramBounds: ParamBounds[] = Object.entries(parsedArgs.parameters).map(([name, b]) => ({
            name,
            min: b.min,
            max: b.max,
            initial: b.initial ?? (model.parameters[name] || (b.min + b.max) / 2)
        }));

        const experimentalData: ExperimentalDataPoint[] = parsedArgs.data.map((d: any) => ({
            time: d.time,
            values: d.observables
        }));

        const simulationOptions = {
            method: parsedArgs.method as any,
            t_end: Math.max(...parsedArgs.data.map((d: any) => d.time)),
            n_steps: Math.max(100, parsedArgs.data.length * 2), // Resolution (min 100 per Claude feedback)
        };

        await loadEvaluator();

        const result = await fitParameters({
            model: expandedModel,
            paramBounds,
            experimentalData,
            simulate: async (overrides, options) => {
                const runModel = cloneExpandedModel(expandedModel);
                Object.entries(overrides).forEach(([k, v]) => {
                    runModel.parameters[k] = v;
                });
                updateMassActionRates(runModel);
                return simulate(0, runModel, withDataOnlySimulationOutput({ ...simulationOptions, ...options }), {
                    checkCancelled: () => { },
                    postMessage: () => { },
                });
            },
            algorithm: parsedArgs.algorithm as any,
            maxEval: parsedArgs.max_iterations ?? 500,
            simOptions: simulationOptions as any
        });

        return createToolResult(result);
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
