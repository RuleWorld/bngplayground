import { beforeAll, describe, expect, it } from 'vitest';
import { setFeatureFlags } from '../../src/featureFlags';
import { _setEvaluatorRefForTests, evaluateFunctionalRate } from '../../src/services/simulation/ExpressionEvaluator';
import { SafeExpressionEvaluator } from '../../src/utils/safeExpressionEvaluator';

describe('ExpressionEvaluation', () => {
  beforeAll(() => {
    _setEvaluatorRefForTests(SafeExpressionEvaluator);
    setFeatureFlags({ functionalRatesEnabled: true });
  });

  const context = {
    k: 10,
    zero: 0,
    pi: Math.PI,
  };

  const emptyObs = {};

  it('should evaluate sin(0)', () => {
    expect(evaluateFunctionalRate('sin(0)', context, emptyObs)).toBeCloseTo(0);
  });

  it('should evaluate cos(0)', () => {
    expect(evaluateFunctionalRate('cos(0)', context, emptyObs)).toBeCloseTo(1);
  });

  it('should evaluate tan(0)', () => {
    expect(evaluateFunctionalRate('tan(0)', context, emptyObs)).toBeCloseTo(0);
  });

  it('should evaluate log of e', () => {
    expect(evaluateFunctionalRate('log(2.718281828)', context, emptyObs)).toBeCloseTo(1);
  });

  it('should evaluate exp(1)', () => {
    expect(evaluateFunctionalRate('exp(1)', context, emptyObs)).toBeCloseTo(Math.E);
  });

  it('should evaluate sqrt(4)', () => {
    expect(evaluateFunctionalRate('sqrt(4)', context, emptyObs)).toBeCloseTo(2);
  });

  it('should evaluate min(1, 2)', () => {
    expect(evaluateFunctionalRate('min(1, 2)', context, emptyObs)).toBe(1);
  });

  it('should evaluate max(1, 2)', () => {
    expect(evaluateFunctionalRate('max(1, 2)', context, emptyObs)).toBe(2);
  });

  it('should evaluate abs(-5)', () => {
    expect(evaluateFunctionalRate('abs(-5)', context, emptyObs)).toBe(5);
  });

  it('should handle operator precedence', () => {
    expect(evaluateFunctionalRate('1 + 2 * 3', context, emptyObs)).toBe(7);
  });

  it('should handle parenthesis precedence', () => {
    expect(evaluateFunctionalRate('(1 + 2) * 3', context, emptyObs)).toBe(9);
  });

  it('should handle power operator', () => {
    expect(evaluateFunctionalRate('2^3', context, emptyObs)).toBe(8);
  });

  it('should propagate +Infinity for divide by zero, matching BNG2', () => {
    // BNG2 evaluates rate laws and functions with mu::Parser, which follows
    // IEEE-754: 1/0 is +inf and ln(0) is -inf, and those values reach the .gdat.
    // Collapsing them to 0 made pt403/pt409 report lnV=0 where BNG2 reports -inf.
    expect(evaluateFunctionalRate('1/0', context, emptyObs)).toBe(Infinity);
    expect(evaluateFunctionalRate('ln(0)', context, emptyObs)).toBe(-Infinity);
  });

  it('should still return 0 (safe fallback) for a genuine NaN', () => {
    expect(evaluateFunctionalRate('0/0', context, emptyObs)).toBe(0);
  });

  it('should resolve user parameter', () => {
    expect(evaluateFunctionalRate('k', context, emptyObs)).toBe(10);
  });

  it('should probably throw or fail on missing parameter', () => {
    expect(evaluateFunctionalRate('missing_param', context, emptyObs)).toBe(0);
  });
});