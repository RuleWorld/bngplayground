import { describe, it, expect } from 'vitest';
import { checkDeficiencyZeroTheorem } from '../../src/services/analysis/NetworkAnalysis';

describe('NetworkAnalysis - checkDeficiencyZeroTheorem', () => {
  it('should apply and return true when deficiency is 0 and is weakly reversible', () => {
    const analysis: any = {
      deficiency: 0,
      isWeaklyReversible: true
    };

    const result = checkDeficiencyZeroTheorem(analysis);

    expect(result.applies).toBe(true);
    expect(result.hasUniqueStableSSS).toBe(true);
    expect(result.explanation).toContain('unique, asymptotically stable');
  });

  it('should not apply when deficiency is 0 but is not weakly reversible', () => {
    const analysis: any = {
      deficiency: 0,
      isWeaklyReversible: false
    };

    const result = checkDeficiencyZeroTheorem(analysis);

    expect(result.applies).toBe(false);
    expect(result.hasUniqueStableSSS).toBe(false);
    expect(result.explanation).toContain('not weakly reversible');
  });

  it('should not apply when deficiency is non-zero', () => {
    const analysis: any = {
      deficiency: 1,
      isWeaklyReversible: true
    };

    const result = checkDeficiencyZeroTheorem(analysis);

    expect(result.applies).toBe(false);
    expect(result.hasUniqueStableSSS).toBe(false);
    expect(result.explanation).toContain('Deficiency is 1');
  });
});
