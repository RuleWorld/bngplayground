import { ToolArgs, ToolResult } from '../types/index.js';
import { z } from 'zod';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel, updateMassActionRates } from '../services/engine.js';
import { simulate, loadEvaluator, analyzeResiduals } from '@bngplayground/engine';
import { structureError } from '../services/errors.js';

const analyzeResidualsArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    experimental_data: z.array(z.object({
        time: z.number(),
        observables: z.record(z.string(), z.number()),
    })).describe('Experimental data points'),
    parameters: z.record(z.string(), z.number()).optional().describe('Model parameters to use (default: from model)'),
    method: z.enum(['ode', 'ssa']).default('ode').describe('Simulation method'),
    t_end: z.number().positive().optional().describe('End time (default: max experimental time)'),
}).strict();

type AnalyzeResidualsArgs = z.infer<typeof analyzeResidualsArgsSchema>;

export async function handleAnalyzeResiduals(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('analyze_residuals', analyzeResidualsArgsSchema, args) as AnalyzeResidualsArgs;
        const model = parseModelOrThrow(parsedArgs.code);
        const expandedModel = await expandModel(model);
        
        // Override parameters if provided
        if (parsedArgs.parameters) {
            for (const [name, value] of Object.entries(parsedArgs.parameters)) {
                expandedModel.parameters[name] = value;
            }
            updateMassActionRates(expandedModel);
        }
        
        const tEnd = parsedArgs.t_end ?? Math.max(...parsedArgs.experimental_data.map(d => d.time));
        
        await loadEvaluator();
        
        const simResult = await simulate(0, expandedModel, {
            method: parsedArgs.method ?? 'ode',
            t_end: tEnd,
            n_steps: Math.max(100, parsedArgs.experimental_data.length * 2),
        }, {
            checkCancelled: () => {},
            postMessage: () => {},
        });
        
        const result = analyzeResiduals(simResult, parsedArgs.experimental_data, tEnd);
        return createToolResult(result);
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error)));
        return createToolResult(structured);
    }
}
