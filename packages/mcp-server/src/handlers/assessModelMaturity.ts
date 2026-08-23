import { ToolArgs, ToolResult } from '../types/index.js';
import { z } from 'zod';
import { createToolResult, parseArgs, parseModelOrThrow } from '../services/engine.js';
import { assessModelMaturity } from '@bngplayground/engine';
import { structureError } from '../services/errors.js';

const assessModelMaturityArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    validation_history: z.array(z.object({
        dataset: z.string().describe('Dataset name or identifier'),
        source: z.string().describe('Citation or source'),
        date: z.string().optional().describe('Date of validation'),
        fit_quality: z.enum(['good', 'moderate', 'poor']).optional().describe('Quality of fit'),
    })).optional().describe('History of experimental validations'),
    parameter_sources: z.record(z.string(), z.object({
        source: z.string().describe('Source: "literature", "fit", "assumption", "measurement"'),
        citation: z.string().optional().describe('Citation if from literature'),
        value: z.number().describe('Parameter value'),
        uncertainty: z.number().optional().describe('Uncertainty if measured/fitted'),
    })).optional().describe('Per-parameter provenance information'),
    n_observables: z.number().int().positive().optional().describe('Number of measured observables'),
}).strict();

type AssessModelMaturityArgs = z.infer<typeof assessModelMaturityArgsSchema>;

export async function handleAssessModelMaturity(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('assess_model_maturity', assessModelMaturityArgsSchema, args) as AssessModelMaturityArgs;
        const model = parseModelOrThrow(parsedArgs.code);
        
        const result = assessModelMaturity(model, {
            validationHistory: parsedArgs.validation_history,
            parameterSources: parsedArgs.parameter_sources,
            nObservables: parsedArgs.n_observables,
        });
        
        return createToolResult(result);
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
