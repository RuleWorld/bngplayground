import { runBifurcationAnalysis, RunBifurcationAnalysisResult } from '@bngplayground/engine';
import { ToolArgs, ToolResult, MCPErrorResult } from '../types/index.js';
import { bifurcationAnalysisArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleBifurcationAnalysis(args: ToolArgs): Promise<ToolResult<RunBifurcationAnalysisResult | MCPErrorResult>> {
  try {
    const parsedArgs = parseArgs('bifurcation_analysis', bifurcationAnalysisArgsSchema, args);

    if (!parsedArgs.code || parsedArgs.code.trim().length === 0) {
      throw new Error('Model code must be a non-empty string.');
    }

    const model = parseModelOrThrow(parsedArgs.code);
    if (!model.species || model.species.length === 0) {
      throw new Error('BNGL parse failed: Model must define at least one species.');
    }

    const paramName = parsedArgs.parameter.trim();
    if (paramName.length === 0) {
      throw new Error('Parameter name must be a non-empty string.');
    }

    if (!model.parameters || !(paramName in model.parameters)) {
      throw new Error(`Unknown parameter for bifurcation_analysis: ${paramName}`);
    }

    if (
      parsedArgs.start_value !== undefined &&
      parsedArgs.end_value !== undefined &&
      parsedArgs.start_value === parsedArgs.end_value
    ) {
      throw new Error('start_value and end_value must be distinct.');
    }

    const expandedModel = await expandModel(model);

    const result = runBifurcationAnalysis({
      model,
      expandedModel,
      parameter: paramName,
      startValue: parsedArgs.start_value,
      endValue: parsedArgs.end_value,
      maxSteps: parsedArgs.max_steps,
    });

    return createToolResult(result);
  } catch (error: unknown) {
    const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
    return createToolResult(structured);
  }
}
