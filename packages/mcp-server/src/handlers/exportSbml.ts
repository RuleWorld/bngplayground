import { SBMLWriter, generateExpandedNetwork } from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { exportSbmlArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, parseModelOrThrow } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleExportSbml(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('export_sbml', exportSbmlArgsSchema, args);
        const model = parseModelOrThrow(parsedArgs.code);
        
        // Attempt expansion to provide a full reaction network SBML
        let network = undefined;
        try {
            const resultModel = await generateExpandedNetwork(model, () => {}, () => {});
            network = {
                species: resultModel.species,
                reactions: resultModel.reactions || [],
                observableExpressions: new Map(),
                parameterValues: new Map(Object.entries(resultModel.parameters))
            };
        } catch (e) {
            // Fallback to skeleton if expansion fails or model too large
        }

        const xml = SBMLWriter.write(model, network, {
            includeAnnotations: parsedArgs.annotate ?? true,
            includeSBO: parsedArgs.annotate ?? true,
            modelName: model.name,
        });

        return createToolResult({
            xml,
            format: 'SBML Level 3 Version 2 (Enriched)',
            isNetworkExpanded: !!network,
            size: xml.length,
            note: 'Includes SBO and MIRIAM annotations. Exported from web simulation engine.',
        });
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
