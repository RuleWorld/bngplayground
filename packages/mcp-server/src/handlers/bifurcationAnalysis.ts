import { ToolArgs, ToolResult } from '../types/index.js';
import { createToolResult, parseModelOrThrow, expandModel } from '../services/engine.js';
import { structureError } from '../services/errors.js';
import { runBifurcationAnalysis } from '@bngplayground/engine';

type BifurcationAnalysisArgs = {
  code?: string;
  max_steps?: number;
  parameter?: string;
  start_value?: number;
  end_value?: number;
};

export async function handleBifurcationAnalysis(args: ToolArgs): Promise<ToolResult<any>> {
  const parsedArgs: BifurcationAnalysisArgs = (args ?? {}) as BifurcationAnalysisArgs;
  try {
    const model = parseModelOrThrow(parsedArgs.code ?? '');
    const expandedModel = await expandModel(model);

    const result = runBifurcationAnalysis({
      model,
      expandedModel,
      parameter: parsedArgs.parameter!,
      startValue: parsedArgs.start_value,
      endValue: parsedArgs.end_value,
      maxSteps: parsedArgs.max_steps,
    });

    return createToolResult(result);
  } catch (error: any) {
    return createToolResult(structureError(error instanceof Error ? error : new Error(String(error), { cause: error })));
  }
}
