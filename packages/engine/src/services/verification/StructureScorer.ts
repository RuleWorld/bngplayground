/**
 * StructureScorer.ts — Score a candidate model structure against
 * experimental data using information criteria (BIC, AIC).
 *
 * Relies on external simulator and fitter callbacks to remain decoupled
 * from specific simulation/optimization implementations.
 */

import type { CandidateRule } from './RuleEnumerator';
import type { BNGLMoleculeType } from '../../types';
import { assembleModel, extractRateName } from '../inference/modelAssembly';

// ── Types ────────────────────────────────────────────────────────────

export interface StructureScore {
  logLikelihood: number;
  complexity: number;
  bic: number;
  aic: number;
  parameterCount: number;
  fittedParameters: Record<string, number>;
}

export type FitterFn = (
  code: string,
  data: any[],
  bounds: Record<string, [number, number]>,
) => Promise<{ bestFit: Record<string, number>; bestScore: number }>;

// ── Model assembly ───────────────────────────────────────────────────


// ── Scoring ──────────────────────────────────────────────────────────

/**
 * Score a candidate model structure against experimental data.
 *
 * 1. Assemble BNGL model from active rules + molecule types + seed species + observables
 * 2. Count free parameters (one rate constant per rule)
 * 3. Use fitter callback to fit parameters
 * 4. Compute BIC and AIC
 */
export async function scoreStructure(
  activeRules: CandidateRule[],
  moleculeTypes: BNGLMoleculeType[],
  seedSpecies: Array<{ name: string; initialConcentration: number }>,
  observables: Array<{ type: string; name: string; pattern: string }>,
  experimentalData: Array<{ time: number; observable: string; value: number; error?: number }>,
  parameterBounds: Record<string, [number, number]>,
  fitter: FitterFn,
): Promise<StructureScore> {
  // Count data points
  const n = experimentalData.length;

  // Count free parameters (one rate constant per rule)
  const k = activeRules.length;

  // Extract rate parameter names from rules
  const rateNames = activeRules.reduce<string[]>((acc, r) => {
    const name = extractRateName(r.rule);
    if (name) acc.push(name);
    return acc;
  }, []);

  // Build bounds for the rate parameters
  const bounds: Record<string, [number, number]> = {};
  for (const name of rateNames) {
    bounds[name] = parameterBounds[name] ?? [1e-6, 1e6];
  }

  // Assemble the model code
  const code = assembleModel(activeRules, {}, moleculeTypes, seedSpecies, observables);

  // Fit the model
  const fitResult = await fitter(code, experimentalData, bounds);

  // Compute log-likelihood from the best score (SSE-based)
  // Assuming Gaussian errors: logL = -n/2 * ln(2*pi*sigma^2) - SSE/(2*sigma^2)
  // With sigma^2 = SSE/n (MLE estimate):
  // logL = -n/2 * ln(2*pi*SSE/n) - n/2
  const sse = fitResult.bestScore;
  const sigma2 = sse / Math.max(n, 1);
  const logLikelihood = sigma2 > 0
    ? -n / 2 * Math.log(2 * Math.PI * sigma2) - n / 2
    : 0;

  // BIC = -2*logL + k*log(n)
  const bic = -2 * logLikelihood + k * Math.log(Math.max(n, 1));

  // AIC = -2*logL + 2*k
  const aic = -2 * logLikelihood + 2 * k;

  return {
    logLikelihood,
    complexity: k,
    bic,
    aic,
    parameterCount: k,
    fittedParameters: fitResult.bestFit,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

