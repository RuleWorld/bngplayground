import { ToolArgs, ToolResult } from '../types/index.js';
import { explainModelArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs } from '../services/engine.js';
import { explainModelNarrative } from '../services/intelligence.js';
import { structureError } from '../services/errors.js';

export async function handleExplainModel(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('explain_model', explainModelArgsSchema, args);
        const explanation = await explainModelNarrative(parsedArgs.code, parsedArgs.include_crux ?? false);
        return createToolResult(explanation);
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
