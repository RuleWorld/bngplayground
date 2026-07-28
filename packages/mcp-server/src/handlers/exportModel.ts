import { z } from 'zod';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { createToolResult, parseArgs } from '../services/engine.js';
import { handleExportSedml } from './exportSedml.js';
import { handleExportOmex } from './exportOmex.js';
import { handleExportSbml } from './exportSbml.js';
import { handleSuggestAnnotations } from './suggestAnnotations.js';
import { structureError } from '../services/errors.js';

const exportModelArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    format: z.enum(['sedml', 'omex', 'sbml', 'annotations']).describe('Export target format'),
    method: z.enum(['ode', 'ssa', 'nf']).optional().describe('Simulation method for SED-ML/OMEX export'),
    t_end: z.number().optional(),
    n_steps: z.number().optional(),
    observables: z.array(z.string()).optional(),
    model_name: z.string().optional(),
    metadata: z.object({
        title: z.string().optional(),
        creators: z.array(z.string()).optional(),
        description: z.string().optional(),
    }).optional(),
    annotate: z.boolean().optional().describe('Include SBO/MIRIAM annotations for SBML export'),
    organism: z.string().optional().describe('Target organism for annotation suggestion mode'),
}).strict();

export async function handleExportModel(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('export_model', exportModelArgsSchema, args);

        if (parsedArgs.format === 'sedml') {
            return handleExportSedml({
                code: parsedArgs.code,
                method: parsedArgs.method,
                t_end: parsedArgs.t_end,
                n_steps: parsedArgs.n_steps,
                observables: parsedArgs.observables,
                model_name: parsedArgs.model_name,
            });
        }

        if (parsedArgs.format === 'omex') {
            return handleExportOmex({
                code: parsedArgs.code,
                method: parsedArgs.method,
                t_end: parsedArgs.t_end,
                n_steps: parsedArgs.n_steps,
                model_name: parsedArgs.model_name,
                metadata: parsedArgs.metadata,
            });
        }

        if (parsedArgs.format === 'sbml') {
            return handleExportSbml({
                code: parsedArgs.code,
                annotate: parsedArgs.annotate,
            });
        }

        if (parsedArgs.format === 'annotations') {
            return handleSuggestAnnotations({
                code: parsedArgs.code,
                organism: parsedArgs.organism,
            });
        }

        return createToolResult({ error: `Unsupported export format: ${parsedArgs.format}` });
    } catch (error) {
        return createToolResult(structureError(error instanceof Error ? error : new Error(String(error), { cause: error })));
    }
}
