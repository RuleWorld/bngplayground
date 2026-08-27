import { ToolArgs, ToolResult } from '../types/index.js';
import { z } from 'zod';
import { optimalExperimentArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel, cloneExpandedModel, updateMassActionRates } from '../services/engine.js';
import { loadEvaluator, analyzeOptimalExperiment } from '@bngplayground/engine';
import { structureError } from '../services/errors.js';

type OptimalExperimentArgs = z.infer<typeof optimalExperimentArgsSchema>;

export async function handleOptimalExperiment(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('optimal_experiment', optimalExperimentArgsSchema, args) as OptimalExperimentArgs;

        if (!parsedArgs.code || parsedArgs.code.trim() === '') {
            return createToolResult(structureError(
                new Error('Model code must be a non-empty string.'),
            ));
        }

        if (parsedArgs.candidate_times && parsedArgs.candidate_times.some((t) => t <= 0 || !Number.isFinite(t))) {
            return createToolResult(structureError(
                new Error('candidate_times must contain only positive finite numbers.'),
            ));
        }

        const model = parseModelOrThrow(parsedArgs.code);

        const modelObsNames = new Set((model.observables ?? []).map((o) => o.name));
        if (parsedArgs.observables && parsedArgs.observables.length > 0) {
            const missing = parsedArgs.observables.filter((o) => !modelObsNames.has(o));
            if (missing.length > 0) {
                return createToolResult(structureError(
                    new Error(`observables references names not defined in model: ${missing.join(', ')}`),
                ));
            }
        }

        if (model.observables.length === 0 && (!parsedArgs.observables || parsedArgs.observables.length === 0)) {
            return createToolResult(structureError(
                new Error('Model does not define any observables to analyze for optimal design.'),
            ));
        }

        const expandedModel = await expandModel(model);
        
        const observables = parsedArgs.observables ?? model.observables.map(o => o.name);
        const candidateTimes = parsedArgs.candidate_times ?? [10, 25, 50, 75, 100];
        const nSamples = parsedArgs.n_samples ?? 10;
        const tEnd = parsedArgs.t_end ?? 100;
        
        await loadEvaluator();
        
        const result = await analyzeOptimalExperiment({
            model,
            expandedModel,
            observables,
            candidateTimes,
            nSamples,
            method: parsedArgs.method ?? 'ode',
            tEnd,
            cloneExpandedModel,
            updateMassActionRates,
        });

        return createToolResult(result);
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
