/**
 * StructureScorer.ts — Score a candidate model structure against
 * experimental data using information criteria (BIC, AIC).
 *
 * Relies on external simulator and fitter callbacks to remain decoupled
 * from specific simulation/optimization implementations.
 */

import type { CandidateRule } from './RuleEnumerator';
import type { BNGLMoleculeType } from '../../types';

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

/**
 * Assemble a complete BNGL model string from components.
 */
export function assembleModelCode(
  activeRules: CandidateRule[],
  parameters: Record<string, number>,
  moleculeTypes: BNGLMoleculeType[],
  seedSpecies: Array<{ name: string; initialConcentration: number }>,
  observables: Array<{ type: string; name: string; pattern: string }>,
): string {
  const lines: string[] = [];
  lines.push('begin model');
  lines.push('');

  // Parameters
  lines.push('begin parameters');
  for (const [name, value] of Object.entries(parameters)) {
    lines.push(`  ${name} ${value}`);
  }
  // Add rate parameters for active rules
  for (const rule of activeRules) {
    const rateName = extractRateName(rule.rule);
    if (rateName && !parameters.hasOwnProperty(rateName)) {
      lines.push(`  ${rateName} 1.0`);
    }
  }
  lines.push('end parameters');
  lines.push('');

  // Molecule types
  lines.push('begin molecule types');
  for (const mol of moleculeTypes) {
    const compStr = mol.components.length > 0 ? mol.components.join(',') : '';
    lines.push(`  ${mol.name}(${compStr})`);
  }
  lines.push('end molecule types');
  lines.push('');

  // Seed species
  lines.push('begin seed species');
  for (const sp of seedSpecies) {
    lines.push(`  ${sp.name} ${sp.initialConcentration}`);
  }
  lines.push('end seed species');
  lines.push('');

  // Observables
  lines.push('begin observables');
  for (const obs of observables) {
    lines.push(`  ${obs.type} ${obs.name} ${obs.pattern}`);
  }
  lines.push('end observables');
  lines.push('');

  // Reaction rules
  lines.push('begin reaction rules');
  for (const rule of activeRules) {
    lines.push(`  ${rule.rule}`);
  }
  lines.push('end reaction rules');
  lines.push('');

  lines.push('end model');
  return lines.join('\n');
}

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
  const code = assembleModelCode(activeRules, {}, moleculeTypes, seedSpecies, observables);

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

/**
 * Extract the rate constant name from a BNGL rule string.
 * The rate name is the last whitespace-separated token.
 */
function extractRateName(rule: string): string | null {
  const tokens = rule.trim().split(/\s+/);
  if (tokens.length < 3) return null;
  return tokens[tokens.length - 1];
}
