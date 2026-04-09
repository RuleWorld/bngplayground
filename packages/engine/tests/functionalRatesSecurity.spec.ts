// @ts-nocheck
import { beforeEach, describe, expect, it } from 'vitest';
import { getFeatureFlags, setFeatureFlags } from '../src/featureFlags';
import { evaluateFunctionalRate, getCompiledRateFunction } from '../src/services/simulation/ExpressionEvaluator';

describe('Functional Rates Security', () => {
  beforeEach(() => {
    setFeatureFlags({ functionalRatesEnabled: false });
  });

  it('should be disabled after beforeEach reset (test isolation)', () => {
    expect(getFeatureFlags().functionalRatesEnabled).toBe(false);
  });

  it('should throw an error when evaluateFunctionalRate is called while disabled', () => {
    expect(() => {
      evaluateFunctionalRate('k*A', { k: 1 }, { A: 10 });
    }).toThrow('Functional rates temporarily disabled pending security review');
  });

  it('should throw an error when getCompiledRateFunction is called while disabled', () => {
    expect(() => {
      getCompiledRateFunction('k*A', ['k', 'A']);
    }).toThrow('Functional rates temporarily disabled pending security review');
  });

  it('should allow functional rates when enabled', async () => {
    const mockEvaluator = {
      evaluateConstant: (_expression: string) => 1.0,
      getReferencedVariables: (_expression: string) => [],
      compile: (_expression: string, _variables: string[]) => (_context: unknown) => 1.0,
      isSafe: (expression: string, _variables: string[]) => expression === '1.0', // Basic valid check
    };

    setFeatureFlags({ functionalRatesEnabled: true });

    expect(getFeatureFlags().functionalRatesEnabled).toBe(true);
    const result = evaluateFunctionalRate('1.0', {}, {}, [], undefined, mockEvaluator);
    expect(result).toBe(1.0);
  });

  it('integration: should correctly use prebuilt context for optimization', () => {
    const mockEvaluator = {
      evaluateConstant: (_expression: string) => 1.0,
      getReferencedVariables: (_expression: string) => ['A'],
      compile: (_expression: string, _variables: string[]) => (context: { A: number }) => context.A * 2,
      isSafe: (expression: string, _variables: string[]) => expression === 'A*2',
    };

    setFeatureFlags({ functionalRatesEnabled: true });

    const params = { k: 1 };
    const observables = { A: 10 };
    const context = { ...params, ...observables };

    const result = evaluateFunctionalRate('A*2', params, observables, [], context, mockEvaluator);
    expect(result).toBe(20);
  });
});