import { parseBNGLWithANTLR } from '@bngplayground/engine';
import { ToolArgs, ToolResult, ValidateModelResult, MCPErrorResult } from '../types/index.js';
import { validateModelArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, validateModel } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleValidateModel(args: ToolArgs): Promise<ToolResult<ValidateModelResult | MCPErrorResult>> {
    try {
        const parsedArgs = parseArgs('validate_model', validateModelArgsSchema, args);
        const parseResult = parseBNGLWithANTLR(parsedArgs.code);
        if (!parseResult.success || !parseResult.model) {
            const result: ValidateModelResult = {
                valid: false,
                parseSuccess: false,
                parseErrors: parseResult.errors,
                errors: parseResult.errors.map((error: any) => ({
                    source: 'parse',
                    code: 'PARSE_ERROR',
                    severity: 'error',
                    message: `line ${error.line}:${error.column} ${error.message}`,
                })),
                warnings: [],
                info: [],
                summary: {
                    errors: parseResult.errors.length,
                    warnings: 0,
                    info: 0,
                },
                nfsim: null,
            };
            return createToolResult(result);
        }

        return createToolResult(validateModel(parseResult.model, parsedArgs.include_nfsim ?? true));
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
