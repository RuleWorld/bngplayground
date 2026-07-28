import { ToolArgs, ToolResult } from '../types/index.js';
import { getContactMapArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, parseModelOrThrow, buildContactMap } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleGetContactMap(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('get_contact_map', getContactMapArgsSchema, args);
        const model = parseModelOrThrow(parsedArgs.code);
        return createToolResult(buildContactMap(model.reactionRules ?? [], model.moleculeTypes ?? []));
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
