import { ToolArgs, ToolResult } from '../types/index.js';
import { z } from 'zod';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel, cloneExpandedModel, updateMassActionRates } from '../services/engine.js';
import { loadEvaluator, analyzeOptimalExperiment } from '@bngplayground/engine';
import { structureError } from '../services/errors.js';

const optimalExperimentArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    observables: z.array(z.string()).optional().describe('Observables to measure (default: all)'),
    candidate_times: z.array(z.number()).optional().describe('Candidate time points to sample'),
    n_samples: z.number().int().positive().optional().describe('Number of samples per experiment (default: 10)'),
    method: z.enum(['ode', 'ssa']).default('ode').describe('Simulation method'),
    t_end: z.number().positive().optional().describe('End time (default: 100)'),
}).strict();

type OptimalExperimentArgs = z.infer<typeof optimalExperimentArgsSchema>;

export async function handleOptimalExperiment(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('optimal_experiment', optimalExperimentArgsSchema, args) as OptimalExperimentArgs;
        const model = parseModelOrThrow(parsedArgs.code);
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
