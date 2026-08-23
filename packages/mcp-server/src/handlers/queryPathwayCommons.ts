import { z } from 'zod';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { createToolResult, parseArgs } from '../services/engine.js';
import { structureError } from '../services/errors.js';
import { queryPathwayCommons } from '../services/pathwayCommons/pathwayCommonsService.js';

const queryPathwayCommonsArgsSchema = z.object({
    code: z.string().describe('BNGL model code. Molecule names are extracted and queried against Pathway Commons.'),
}).strict();

export async function handleQueryPathwayCommons(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('query_pathway_commons', queryPathwayCommonsArgsSchema, args);
        const result = await queryPathwayCommons(parsedArgs.code);

        return createToolResult({
            summary: result.summary,
            confirmed_interactions: result.confirmedInteractions.map((interaction) => ({
                source: interaction.source,
                type: interaction.type,
                target: interaction.target,
            })),
            missing_interactions: result.missingInteractions.map((interaction) => ({
                source: interaction.source,
                type: interaction.type,
                target: interaction.target,
                suggestion: `Consider adding a rule for ${interaction.source} ${interaction.type} ${interaction.target}`,
            })),
            shared_pathways: result.pathways
                .filter((pathway) => pathway.matchedMolecules.length > 1)
                .map((pathway) => ({
                    name: pathway.name,
                    source: pathway.dataSource,
                    molecules: pathway.matchedMolecules,
                })),
            unknown_molecules: result.unknownMolecules,
        });
    } catch (error) {
        return createToolResult(structureError(error instanceof Error ? error : new Error(String(error), { cause: error })));
    }
}
