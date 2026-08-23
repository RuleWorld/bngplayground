import { NetworkGenerationLimitError } from '@bngplayground/engine';
import { ToolArgs, ToolResult } from '../types/index.js';
import { generateNetworkArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, applyNetworkOptions, parseModelOrThrow, expandModel } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleGenerateNetwork(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('generate_network', generateNetworkArgsSchema, args);
        const model = applyNetworkOptions(parseModelOrThrow(parsedArgs.code), parsedArgs);
        const expandedModel = await expandModel(model);
        return createToolResult(expandedModel);
    } catch (error: any) {
        if (error instanceof NetworkGenerationLimitError) {
            return createToolResult({
                success: false,
                stage: 'network_expansion',
                error: error.message,
                species_generated: error.speciesCount,
                reactions_generated: error.reactionCount,
                last_rule: error.lastRule,
            });
        }
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
