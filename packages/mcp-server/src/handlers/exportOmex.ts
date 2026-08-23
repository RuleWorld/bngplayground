import { generateOMEX } from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { exportOmexArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, parseModelOrThrow } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleExportOmex(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('export_omex', exportOmexArgsSchema, args);
        const model = parseModelOrThrow(parsedArgs.code);

        const archive = generateOMEX(model, {
            bnglCode: parsedArgs.code,
            modelName: parsedArgs.model_name,
            simulationOptions: {
                method: parsedArgs.method ?? 'ode',
                t_end: parsedArgs.t_end ?? 100,
                n_steps: parsedArgs.n_steps ?? 100,
            },
            metadata: parsedArgs.metadata ? {
                title: parsedArgs.metadata.title,
                creators: parsedArgs.metadata.creators,
                description: parsedArgs.metadata.description,
                created: new Date().toISOString(),
            } : undefined,
        });

        // Encode to base64 for JSON transport
        const base64 = Buffer.from(archive).toString('base64');

        return createToolResult({
            archive_base64: base64,
            format: 'COMBINE/OMEX',
            size_bytes: archive.length,
            contents: ['manifest.xml', 'model.bngl', 'experiment.sedml',
                ...(parsedArgs.metadata ? ['metadata.rdf'] : [])],
        });
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
