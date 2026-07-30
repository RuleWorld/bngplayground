import { ToolArgs, ToolResult, MCPErrorResult } from '../types/index.js';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel } from '../services/engine.js';
import { temporalAnalysisArgsSchema } from '../schemas/index.js';
import { structureError } from '../services/errors.js';
import { simulate, loadEvaluator, analyzeReactionInformation, summarizeTemporalAnalysis } from '@bngplayground/engine';

export async function handleTemporalAnalysis(args: ToolArgs): Promise<ToolResult<Record<string, unknown> | MCPErrorResult>> {
  try {
    const parsedArgs = parseArgs('temporal_analysis', temporalAnalysisArgsSchema, args);
    const model = parseModelOrThrow(parsedArgs.code);
    const expandedModel = await expandModel(model);

    await loadEvaluator();

    // Run SSA with firing log
    const results = await simulate(0, expandedModel, {
      method: 'ssa',
      t_end: parsedArgs.t_end ?? 100,
      n_steps: parsedArgs.n_steps ?? 200,
      recordFirings: true,
      maxFiringEvents: 100000,
    }, {
      checkCancelled: () => {},
      postMessage: () => {},
    });

    if (!results.firingLog || results.firingLog.length === 0) {
      const errRes: MCPErrorResult = {
        error: 'No firing events recorded. The model may not have stochastic reactions or the simulation may be too short.',
        diagnosis: 'SSA simulation completed but no reactions were fired.',
        recovery: 'Increase t_end, check that the model has valid reaction rules with non-zero rate constants, and verify that seed species concentrations are positive.',
        severity: 'recoverable',
        relatedTools: ['simulate', 'validate_model'],
      };
      return createToolResult(errRes);
    }

    const firingLog = results.firingLog;
    // Analyze information flow
    const nReactions = new Set(firingLog.map((e) => e.reactionIndex)).size;
    const itResult = analyzeReactionInformation({
      firingLog,
      nReactions,
      binWidth: parsedArgs.bin_width,
    });

    const summary = summarizeTemporalAnalysis(itResult, results.firingLog.length, nReactions);
    return createToolResult(summary);
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error), { cause: error });
    return createToolResult(structureError(errObj));
  }
}
