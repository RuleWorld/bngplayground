import { diagnoseModel } from '@bngplayground/engine';
import { ToolArgs, ToolResult } from '../types/index.js';
import { diagnoseArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, parseModelOrThrow, validateModel } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleDiagnose(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('diagnose', diagnoseArgsSchema, args);
        const model = parseModelOrThrow(parsedArgs.code);

        // 1. Structural Checks
        const validation = validateModel(model, false);

        // 2. Perform deep shared-engine diagnostics
        const diagnostics = diagnoseModel(model);

        return createToolResult({
            validation: {
                errors: validation.summary.errors,
                warnings: validation.summary.warnings
            },
            stiffness: diagnostics.stiffness,
            estimation: diagnostics.estimation
        });
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
