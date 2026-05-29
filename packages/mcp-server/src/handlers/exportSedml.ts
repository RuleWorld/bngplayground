import { generateSedML } from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { exportSedmlArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, parseModelOrThrow } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleExportSedml(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('export_sedml', exportSedmlArgsSchema, args);
        const model = parseModelOrThrow(parsedArgs.code);

        const xml = generateSedML(model, {
            method: parsedArgs.method ?? 'ode',
            t_end: parsedArgs.t_end ?? 100,
            n_steps: parsedArgs.n_steps ?? 100,
            t_start: parsedArgs.t_start ?? 0,
            observables: parsedArgs.observables,
            modelName: parsedArgs.model_name,
            modelSource: parsedArgs.model_source ?? 'model.bngl',
            atol: parsedArgs.atol,
            rtol: parsedArgs.rtol,
        });

        return createToolResult({ sedml: xml, format: 'SED-ML L1V4', size: xml.length });
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error)));
        return createToolResult(structured);
    }
}
