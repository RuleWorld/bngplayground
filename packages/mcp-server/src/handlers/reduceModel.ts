import { fitParameters, pruneModel, simulate, loadEvaluator } from '@bngplayground/engine';
import { z } from 'zod';
import type { ParamBounds, ExperimentalDataPoint, RegularizationConfig } from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { reduceModelArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel, cloneExpandedModel, updateMassActionRates } from '../services/engine.js';
import { structureError } from '../services/errors.js';

type ReduceModelArgs = z.infer<typeof reduceModelArgsSchema>;

export async function handleReduceModel(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('reduce_model', reduceModelArgsSchema, args) as ReduceModelArgs;
        const model = parseModelOrThrow(parsedArgs.code);
        const expandedModel = await expandModel(model);

        const paramBounds: ParamBounds[] = Object.entries(parsedArgs.parameters).map(([name, bound]) => ({
            name,
            min: bound.min,
            max: bound.max,
            initial: bound.initial ?? (model.parameters[name] || (bound.min + bound.max) / 2),
        }));

        const experimentalData: ExperimentalDataPoint[] = parsedArgs.data.map((datum) => ({
            time: datum.time,
            values: datum.observables,
        }));

        const regularization: RegularizationConfig = {
            type: parsedArgs.regularization,
            lambda: parsedArgs.lambda,
            pruneThreshold: parsedArgs.prune_threshold,
        };

        const tEnd = Math.max(...parsedArgs.data.map((datum) => datum.time));
        await loadEvaluator();

        const fitResult = await fitParameters({
            model: expandedModel,
            paramBounds,
            experimentalData,
            simulate: async (overrides, options) => {
                const runModel = cloneExpandedModel(expandedModel);
                Object.entries(overrides).forEach(([k, v]) => {
                    runModel.parameters[k] = v;
                });
                updateMassActionRates(runModel);
                return simulate(0, runModel, { ...options, method: parsedArgs.method, t_end: tEnd, n_steps: 100 }, {
                    checkCancelled: () => { },
                    postMessage: () => { },
                });
            },
            algorithm: 'sbplx',
            maxEval: parsedArgs.max_iterations,
            regularization,
        });

        const nominals = paramBounds.map((bound) => bound.initial);
        const reduction = pruneModel(
            parsedArgs.code,
            fitResult.params,
            fitResult.paramNames,
            nominals,
            regularization,
        );

        return createToolResult({
            fit: {
                sse: fitResult.sse,
                rSquared: fitResult.rSquared,
                nEval: fitResult.nEval,
                converged: fitResult.converged,
                params: Object.fromEntries(fitResult.paramNames.map((name, index) => [name, fitResult.params[index]])),
            },
            reduction: {
                reducedCode: reduction.reducedCode,
                prunedParameters: reduction.prunedParameters,
                prunedRules: reduction.prunedRules,
                keptRules: reduction.keptRules,
                reductionRatio: reduction.reductionRatio,
                summary: reduction.summary,
            },
        });
    } catch (error) {
        return createToolResult(structureError(error instanceof Error ? error : new Error(String(error))));
    }
}
