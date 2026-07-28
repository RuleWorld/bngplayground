import { ToolArgs, ToolResult } from '../types/index.js';
import { createToolResult, parseModelOrThrow, expandModel } from '../services/engine.js';
import { structureError } from '../services/errors.js';
import { simulate, loadEvaluator, compareModels } from '@bngplayground/engine';

export async function handleCompareModels(args: ToolArgs): Promise<ToolResult<any>> {
  const parsedArgs = (args ?? {}) as any;
  try {
    await loadEvaluator();

    const simulatorFn = async (code: string, options: any) => {
      const model = parseModelOrThrow(code);
      const expanded = await expandModel(model);
      return await simulate(0, expanded, {
        method: 'ode',
        t_end: parsedArgs.t_end || 100,
        n_steps: parsedArgs.n_steps || 200,
        ...options,
      }, { checkCancelled: () => {}, postMessage: () => {} });
    };

    const result = await compareModels(
      {
        variants: parsedArgs.variants,
        divergenceThreshold: parsedArgs.divergence_threshold || 0.1,
      },
      simulatorFn,
    );

    return createToolResult({
      summary: `Compared ${result.variants.length} model variants. ` +
        (result.firstDivergenceTime !== null
          ? `First divergence at t=${result.firstDivergenceTime.toFixed(2)}.`
          : 'No significant divergence detected.'),
      divergenceCount: result.divergences.length,
      firstDivergenceTime: result.firstDivergenceTime,
      topDivergences: result.divergences.slice(0, 5).map((d: any) => ({
        time: d.time,
        observable: d.observable,
        maxDifference: d.maxDifference,
        relativeDeviation: d.relativeDeviation,
      })),
      attributions: result.attributions?.slice(0, 5),
      sharedRules: result.sharedRules?.length || 0,
      uniqueRules: result.uniqueRules,
      technical: `Simulated ${result.variants.length} variants. ${result.divergences.length} divergence points detected.`,
      biological: result.firstDivergenceTime !== null
        ? `Models diverge at t=${result.firstDivergenceTime.toFixed(2)}. ${result.attributions?.length > 0 ? `Primary driver: ${result.attributions[0]?.rule}` : ''}`
        : 'All variants produce equivalent behavior within the specified threshold.',
      strategic: 'Multi-model comparison identifies which specific rules cause behavioral differences between competing hypotheses.',
    });
  } catch (error: any) {
    return createToolResult(structureError(error instanceof Error ? error : new Error(String(error), { cause: error })));
  }
}
