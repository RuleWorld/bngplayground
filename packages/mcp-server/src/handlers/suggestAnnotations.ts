import { resolveAnnotations, createUniProtResolver } from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { suggestAnnotationsArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, parseModelOrThrow } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleSuggestAnnotations(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('suggest_annotations', suggestAnnotationsArgsSchema, args);
        const model = parseModelOrThrow(parsedArgs.code);
        
        // Collect all molecule names from species and reaction rules
        const moleculeNames = new Set<string>();
        
        // From molecule types
        model.moleculeTypes?.forEach(mt => moleculeNames.add(mt.name));
        
        // From species (parse them briefly if possible, or just use the names)
        model.species?.forEach(s => {
            // Extract molecule names from species string e.g. "A(a!1).B(b!1)" -> ["A", "B"]
            const matches = s.name.match(/[A-Za-z_][A-Za-z0-9_]*(?=\(|\.|$)/g);
            matches?.forEach(m => moleculeNames.add(m));
        });

        const nameList = Array.from(moleculeNames);
        
        // Create resolver and call engine logic
        const resolver = createUniProtResolver(fetch);
        const annotations = await resolveAnnotations(
            nameList, 
            resolver, 
            parsedArgs.organism ?? 'Homo sapiens'
        );

        return createToolResult({
            annotations,
            count: Object.keys(annotations).length,
            note: 'Annotations found via built-in dictionary and UniProt REST API.'
        });
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error)));
        return createToolResult(structured);
    }
}
