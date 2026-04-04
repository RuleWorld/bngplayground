import { ToolArgs, ToolResult } from '../types/index.js';
import { createToolResult, parseModelOrThrow, expandModel } from '../services/engine.js';
import { structureError } from '../services/errors.js';
import { simulate, loadEvaluator, analyzeReactionInformation } from '@bngplayground/engine';

export async function handleTemporalAnalysis(args: ToolArgs): Promise<ToolResult<any>> {
  const parsedArgs = (args ?? {}) as any;
  try {
    const model = parseModelOrThrow(parsedArgs.code);
    const expandedModel = await expandModel(model);

    await loadEvaluator();

    // Run SSA with firing log
    const results = await simulate(0, expandedModel, {
      method: 'ssa',
      t_end: parsedArgs.t_end || 100,
      n_steps: parsedArgs.n_steps || 200,
      recordFirings: true,
      maxFiringEvents: 100000,
    }, {
      checkCancelled: () => {},
      postMessage: () => {},
    });

    if (!results.firingLog || results.firingLog.length === 0) {
      return createToolResult({
        error: 'No firing events recorded. The model may not have stochastic reactions or the simulation may be too short.',
        suggestion: 'Increase t_end or check that the model has reaction rules.',
      });
    }

    // Analyze information flow
    const nReactions = new Set(results.firingLog.map((e: any) => e.reactionIndex)).size;
    const itResult = analyzeReactionInformation({
      firingLog: results.firingLog,
      nReactions,
      binWidth: parsedArgs.bin_width,
    });

    // Get top results
    const topMI = itResult.mutualInformation
      .sort((a: any, b: any) => b.normalizedMI - a.normalizedMI)
      .slice(0, 10);
    const topTE = itResult.transferEntropy
      .sort((a: any, b: any) => Math.abs(b.netInformationFlow) - Math.abs(a.netInformationFlow))
      .slice(0, 10);

    return createToolResult({
      firingEvents: results.firingLog.length,
      reactionsAnalyzed: nReactions,
      topCoupledPairs: topMI.map((mi: any) => ({
        reactions: `${mi.reaction1Name || `R${mi.reaction1 + 1}`} \u2194 ${mi.reaction2Name || `R${mi.reaction2 + 1}`}`,
        normalizedMI: mi.normalizedMI,
        pValue: mi.pValue,
      })),
      topCausalFlows: topTE.map((te: any) => ({
        flow: `${te.sourceName || `R${te.source + 1}`} \u2192 ${te.targetName || `R${te.target + 1}`}`,
        netInformationFlow: te.netInformationFlow,
        pValue: te.pValue,
      })),
      perReactionEntropy: itResult.entropy.map((e: any) => ({
        reaction: e.name || `R${e.reactionIndex + 1}`,
        entropy: e.entropy,
      })),
      technical: `Analyzed ${results.firingLog.length} firing events across ${nReactions} reactions. Top MI pair: ${topMI[0]?.normalizedMI?.toFixed(3) || 'N/A'}.`,
      biological: topTE.length > 0
        ? `Strongest causal flow: ${topTE[0]?.sourceName || `R${topTE[0]?.source + 1}`} \u2192 ${topTE[0]?.targetName || `R${topTE[0]?.target + 1}`} (${topTE[0]?.netInformationFlow?.toFixed(3)} bits).`
        : 'No significant directional information flow detected between reactions.',
      strategic: 'Transfer entropy reveals which reactions drive others \u2014 emergent couplings not in any single rule are particularly interesting.',
    });
  } catch (error: any) {
    return createToolResult(structureError(error instanceof Error ? error : new Error(String(error))));
  }
}
