import { z } from 'zod';
import { ToolArgs, ToolResult } from '../types/index.js';
import { diagnoseModelArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs } from '../services/engine.js';
import { diagnoseModelDeep } from '../services/intelligence.js';
import { suggestModelFixes } from '../services/intelligence.js';
import { handleAnalyzeResiduals } from './analyzeResiduals.js';
import { handleAssessModelMaturity } from './assessModelMaturity.js';
import { handleDiagnose } from './diagnose.js';
import { structureError } from '../services/errors.js';

const diagnoseModelUnifiedArgsSchema = diagnoseModelArgsSchema.extend({
    mode: z.enum(['quick', 'deep']).default('deep').describe('Quick mode runs lightweight checks; deep mode runs full causal diagnostics.'),
    include_fix_suggestions: z.boolean().default(false).describe('Include structured fix suggestions.'),
    include_residuals: z.boolean().default(false).describe('Include residual analysis when experimental_data is provided.'),
    include_maturity: z.boolean().default(false).describe('Include model maturity scoring.'),
    residual_parameters: z.record(z.string(), z.number()).optional().describe('Optional parameter overrides for residual analysis.'),
    validation_history: z.array(z.object({
        dataset: z.string(),
        source: z.string(),
        date: z.string().optional(),
        fit_quality: z.enum(['good', 'moderate', 'poor']).optional(),
    })).optional(),
    parameter_sources: z.record(z.string(), z.object({
        source: z.string(),
        citation: z.string().optional(),
        value: z.number(),
        uncertainty: z.number().optional(),
    })).optional(),
}).strict();

type DiagnoseModelArgs = z.infer<typeof diagnoseModelUnifiedArgsSchema>;

export async function handleDiagnoseModel(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('diagnose_model', diagnoseModelUnifiedArgsSchema, args) as DiagnoseModelArgs;

        const core = parsedArgs.mode === 'quick'
            ? (await handleDiagnose({ code: parsedArgs.code })).structuredContent
            : await diagnoseModelDeep({
                code: parsedArgs.code,
                method: parsedArgs.method,
                t_end: parsedArgs.t_end,
                n_steps: parsedArgs.n_steps,
                n_samples: parsedArgs.n_samples,
                n_bootstrap: parsedArgs.n_bootstrap,
                max_parameters: parsedArgs.max_parameters,
                experimental_data: parsedArgs.experimental_data?.map((datum) => ({
                    time: datum.time as number,
                    observables: (datum.observables ?? {}) as Record<string, number>,
                    ...(datum.errors ? { errors: datum.errors as Record<string, number> } : {}),
                })),
            });

        const result: Record<string, unknown> = {
            mode: parsedArgs.mode,
            ...((core ?? {}) as Record<string, unknown>),
        };

        if (parsedArgs.include_fix_suggestions) {
            result.fix_suggestions = suggestModelFixes(parsedArgs.code, false);
        }

        if (parsedArgs.include_residuals && parsedArgs.experimental_data && parsedArgs.experimental_data.length > 0) {
            const residuals = await handleAnalyzeResiduals({
                code: parsedArgs.code,
                experimental_data: parsedArgs.experimental_data,
                parameters: parsedArgs.residual_parameters,
                method: parsedArgs.method === 'nf' ? 'ode' : (parsedArgs.method ?? 'ode'),
                t_end: parsedArgs.t_end,
            });
            result.residual_analysis = residuals.structuredContent;
        }

        if (parsedArgs.include_maturity) {
            const maturity = await handleAssessModelMaturity({
                code: parsedArgs.code,
                validation_history: parsedArgs.validation_history,
                parameter_sources: parsedArgs.parameter_sources,
                n_observables: parsedArgs.experimental_data && parsedArgs.experimental_data.length > 0
                    ? Object.keys(parsedArgs.experimental_data[0].observables ?? {}).length
                    : undefined,
            });
            result.maturity = maturity.structuredContent;
        }

        return createToolResult(result);
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error)));
        return createToolResult(structured);
    }
}
