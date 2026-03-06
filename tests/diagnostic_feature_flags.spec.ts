import { describe, it, expect, beforeAll } from 'vitest';
import { getFeatureFlags, setFeatureFlags } from '../services/featureFlags';
import { evaluateFunctionalRate, _setEvaluatorRefForTests } from '@bngplayground/engine';
import { SafeExpressionEvaluator } from '@bngplayground/engine';

describe('Diagnostic: Feature Flags and Rate Evaluation', () => {
  beforeAll(() => {
    _setEvaluatorRefForTests(SafeExpressionEvaluator);
  });

  it('should have functionalRatesEnabled true by default', () => {
    const flags = getFeatureFlags();
    expect(flags.functionalRatesEnabled).toBe(true);
  });

  it('should evaluate simple parameter ka=0.01', () => {
    setFeatureFlags({ functionalRatesEnabled: true });
    const result = evaluateFunctionalRate('ka', { ka: 0.01 }, {});
    console.log('[Test] evaluateFunctionalRate("ka", {ka: 0.01}, {}) =', result);
    expect(result).toBeCloseTo(0.01);
  });

  it('should evaluate expression 0.01 (constant)', () => {
    const result = evaluateFunctionalRate('0.01', {}, {});
    console.log('[Test] evaluateFunctionalRate("0.01", {}, {}) =', result);
    expect(result).toBeCloseTo(0.01);
  });

  it('should fail with feature flag disabled', () => {
    setFeatureFlags({ functionalRatesEnabled: false });
    expect(() => {
      evaluateFunctionalRate('ka', { ka: 0.01 }, {});
    }).toThrow(/Functional rates temporarily disabled/);
  });

  it('should restore feature flag after test', () => {
    setFeatureFlags({ functionalRatesEnabled: true });
    const flags = getFeatureFlags();
    expect(flags.functionalRatesEnabled).toBe(true);
  });
});
