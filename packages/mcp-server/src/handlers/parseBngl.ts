import { parseBNGLWithANTLR } from '@bngplayground/engine';
import { ToolArgs, ToolResult } from '../types/index.js';
import { parseBnglArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleParseBngl(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('parse_bngl', parseBnglArgsSchema, args);
        const result = parseBNGLWithANTLR(parsedArgs.code);
        return createToolResult(result);
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
