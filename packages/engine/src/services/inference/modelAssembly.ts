/**
 * modelAssembly.ts — build a complete BNGL model string from a set of selected
 * rules, parameters, and declarations.
 *
 * This was previously duplicated as `assembleModelCode` (StructureScorer) and
 * `assembleModel` (StructureABCSMC). The two differed only in how they handled
 * an active rule whose rate parameter was not supplied by the caller, which is
 * now controlled by the `missingRate` option:
 *
 *   - The scorer passes an empty parameter map on purpose and fits the rates
 *     afterwards, so it needs missing rates declared with a placeholder value
 *     (`missingRate: 'default'`, the default).
 *   - ABC-SMC samples a rate for every active rule before assembling, so a
 *     missing rate indicates a bug in the sampler rather than a rule to
 *     default; it opts into `missingRate: 'error'` to surface that loudly
 *     instead of silently simulating with a wrong rate.
 */
import type { CandidateRule } from '../verification/RuleEnumerator';
import type { BNGLMoleculeType } from '../../types';

/**
 * Extract the rate-parameter name from a rule string (its last whitespace
 * token), or null if the rule is too short to carry a rate.
 */
export function extractRateName(rule: string): string | null {
  const tokens = rule.trim().split(/\s+/);
  if (tokens.length < 3) return null;
  return tokens[tokens.length - 1];
}

export interface AssembleModelOptions {
  /**
   * How to handle an active rule whose rate parameter is absent from
   * `parameters`. `'default'` declares it at 1.0 (a placeholder intended to be
   * fitted later); `'error'` throws, for callers that guarantee complete
   * parameters and want a missing rate to fail loudly.
   */
  missingRate?: 'default' | 'error';
}

/**
 * Assemble a complete BNGL model string from selected rules, parameters, and
 * declarations.
 */
export function assembleModel(
  activeRules: CandidateRule[],
  parameters: Record<string, number>,
  moleculeTypes: BNGLMoleculeType[],
  seedSpecies: Array<{ name: string; initialConcentration: number }>,
  observables: Array<{ type: string; name: string; pattern: string }>,
  options: AssembleModelOptions = {},
): string {
  const missingRate = options.missingRate ?? 'default';
  const lines: string[] = [];
  lines.push('begin model');
  lines.push('');

  // Parameters
  lines.push('begin parameters');
  for (const [name, value] of Object.entries(parameters)) {
    lines.push(`  ${name} ${value}`);
  }
  // Rate parameters for active rules not already supplied by the caller.
  for (const rule of activeRules) {
    const rateName = extractRateName(rule.rule);
    if (rateName && !Object.prototype.hasOwnProperty.call(parameters, rateName)) {
      if (missingRate === 'error') {
        throw new Error(
          `assembleModel: active rule references rate parameter "${rateName}" ` +
            `that is not present in the supplied parameters: ${rule.rule}`,
        );
      }
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
