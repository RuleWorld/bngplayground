import { ToolArgs, ToolResult } from '../types/index.js';
import { createToolResult, parseModelOrThrow, expandModel } from '../services/engine.js';
import { structureError } from '../services/errors.js';
import { simulate, loadEvaluator } from '@bngplayground/engine';

export async function handleSearchStructure(args: ToolArgs): Promise<ToolResult<any>> {
  const parsedArgs = (args ?? {}) as any;
  try {
    const engine = await import('@bngplayground/engine') as any;
    const model = parseModelOrThrow(parsedArgs.code);
    await loadEvaluator();

    // Enumerate candidate rules
    const candidates = engine.enumerateRules(model.moleculeTypes || []);

    // Set up simulator function for structure search
    const simulatorFn = async (code: string, options: any) => {
      const m = parseModelOrThrow(code);
      const expanded = await expandModel(m);
      return await simulate(0, expanded, {
        method: 'ode', t_end: 100, n_steps: 200, ...options,
      }, { checkCancelled: () => {}, postMessage: () => {} });
    };

    // Run structure search
    const result = await engine.structureSearch(
      {
        candidates,
        moleculeTypes: model.moleculeTypes || [],
        seedSpecies: model.species || [],
        observables: model.observables || [],
        experimentalData: parsedArgs.experimental_data,
        inclusionPrior: parsedArgs.inclusion_prior || 0.1,
        parameterBounds: Object.fromEntries(
          Object.keys(model.parameters || {}).map((k: string) => [k, [1e-4, 1e4] as [number, number]])
        ),
        nParticles: parsedArgs.n_particles || 100,
        nGenerations: parsedArgs.n_generations || 10,
      },
      simulatorFn,
    );

    return createToolResult({
      candidateRulesEnumerated: candidates.length,
      bestStructure: {
        rules: result.bestStructure.rules.map((r: any) => r.rule),
        score: result.bestStructure.score,
        nRules: result.bestStructure.rules.length,
      },
      topStructures: result.topK?.slice(0, 5).map((s: any) => ({
        nRules: s.rules.length,
        posteriorProbability: s.posteriorProbability,
        bic: s.bic,
        rules: s.rules.map((r: any) => r.humanDescription),
      })),
      ruleInclusionProbabilities: result.ruleInclusionProbabilities,
      convergence: result.convergenceDiagnostics,
      bnglCode: result.bestStructure.bnglCode,
      technical: `Searched ${candidates.length} candidate rules. Best structure has ${result.bestStructure.rules.length} rules with score ${result.bestStructure.score.toFixed(2)}.`,
      biological: `Top model hypothesis includes: ${result.bestStructure.rules.slice(0, 3).map((r: any) => r.humanDescription).join('; ')}.`,
      strategic: 'Structure search identifies which rules best explain the experimental data — answering "which mechanisms are active?" rather than just "what are the rates?"',
    });
  } catch (error: any) {
    return createToolResult(structureError(error instanceof Error ? error : new Error(String(error))));
  }
}
