import { ToolArgs, ToolResult, MCPErrorResult } from '../types/index.js';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel } from '../services/engine.js';
import { temporalAnalysisArgsSchema } from '../schemas/index.js';
import { structureError } from '../services/errors.js';
import {
  simulate,
  loadEvaluator,
  analyzeReactionInformation,
  MutualInformationResult,
  TransferEntropyResult,
} from '@bngplayground/engine';

interface ReactionFiringEvent {
  reactionIndex: number;
  time: number;
  ruleName?: string;
  propensity: number;
}

interface EntropyItem {
  reactionIndex: number;
  name?: string;
  entropy: number;
}

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

    const firingLog: ReactionFiringEvent[] = results.firingLog;

    // Analyze information flow
    const nReactions = new Set(firingLog.map((e) => e.reactionIndex)).size;
    const itResult = analyzeReactionInformation({
      firingLog,
      nReactions,
      binWidth: parsedArgs.bin_width,
    });

    // Get top results
    const topMI = (itResult.mutualInformation as MutualInformationResult[])
      .sort((a, b) => b.normalizedMI - a.normalizedMI)
      .slice(0, 10);
    const topTE = (itResult.transferEntropy as TransferEntropyResult[])
      .sort((a, b) => Math.abs(b.netInformationFlow) - Math.abs(a.netInformationFlow))
      .slice(0, 10);

    return createToolResult({
      firingEvents: firingLog.length,
      reactionsAnalyzed: nReactions,
      topCoupledPairs: topMI.map((mi) => ({
        reactions: `${mi.pair.reaction1Name || `R${mi.pair.reaction1 + 1}`} \u2194 ${mi.pair.reaction2Name || `R${mi.pair.reaction2 + 1}`}`,
        normalizedMI: mi.normalizedMI,
        pValue: mi.pValue,
      })),
      topCausalFlows: topTE.map((te) => ({
        flow: `${te.sourceName || `R${te.source + 1}`} \u2192 ${te.targetName || `R${te.target + 1}`}`,
        netInformationFlow: te.netInformationFlow,
        pValue: te.pValue,
      })),
      perReactionEntropy: (itResult.entropy as EntropyItem[]).map((e) => ({
        reaction: e.name || `R${e.reactionIndex + 1}`,
        entropy: e.entropy,
      })),
      technical: `Analyzed ${firingLog.length} firing events across ${nReactions} reactions. Top MI pair: ${topMI[0]?.normalizedMI?.toFixed(3) || 'N/A'}.`,
      biological: topTE.length > 0
        ? `Strongest causal flow: ${topTE[0]?.sourceName || `R${topTE[0]?.source + 1}`} \u2192 ${topTE[0]?.targetName || `R${topTE[0]?.target + 1}`} (${topTE[0]?.netInformationFlow?.toFixed(3)} bits).`
        : 'No significant directional information flow detected between reactions.',
      strategic: 'Transfer entropy reveals which reactions drive others \u2014 emergent couplings not in any single rule are particularly interesting.',
    });
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error), { cause: error });
    return createToolResult(structureError(errObj));
  }
}
