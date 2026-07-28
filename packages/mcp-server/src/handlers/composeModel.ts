import { z } from 'zod';
import { ToolArgs, ToolResult } from '../types/index.js';
import { composeModelArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs } from '../services/engine.js';
import { composeModel } from '../services/intelligence.js';
import { structureError } from '../services/errors.js';
import type { ComposeModelArgs } from '../services/intelligence/compose.js';

type ParsedComposeModelArgs = z.infer<typeof composeModelArgsSchema>;

export async function handleComposeModel(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('compose_model', composeModelArgsSchema, args) as ParsedComposeModelArgs;
        const composed = await composeModel(parsedArgs as ComposeModelArgs);
        return createToolResult(composed);
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
