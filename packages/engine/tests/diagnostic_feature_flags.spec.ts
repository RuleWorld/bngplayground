import { beforeAll, describe, expect, it } from 'vitest';
import { getFeatureFlags, setFeatureFlags } from '../src/featureFlags';
import { _setEvaluatorRefForTests, evaluateFunctionalRate } from '../src/services/simulation/ExpressionEvaluator';
import { SafeExpressionEvaluator } from '../src/utils/safeExpressionEvaluator';

describe('Diagnostic: Feature Flags and Rate Evaluation', () => {
  beforeAll(() => {
    _setEvaluatorRefForTests(SafeExpressionEvaluator);
  });

  it('should have functionalRatesEnabled true by default', () => {
    const flags = getFeatureFlags();
    expect(flags.functionalRatesEnabled).toBe(true);
    expect(flags.enableJitFastPath).toBe(false);
  });

  it('should evaluate simple parameter ka=0.01', () => {
    setFeatureFlags({ functionalRatesEnabled: true });
    const result = evaluateFunctionalRate('ka', { ka: 0.01 }, {});
    expect(result).toBeCloseTo(0.01);
  });

  it('should evaluate expression 0.01 (constant)', () => {
    const result = evaluateFunctionalRate('0.01', {}, {});
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