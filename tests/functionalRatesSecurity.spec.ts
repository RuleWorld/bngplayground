// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest';
import { getFeatureFlags, setFeatureFlags } from '../services/featureFlags';
import { evaluateFunctionalRate, getCompiledRateFunction } from '../services/bnglWorker';

describe('Functional Rates Security', () => {
    beforeEach(() => {
        // Reset flags before each test
        setFeatureFlags({ functionalRatesEnabled: false });
    });

    it('should be disabled after beforeEach reset (test isolation)', () => {
        // Note: Default is true, but beforeEach sets to false for test isolation
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
        // Mock the SafeExpressionEvaluator since we are in a text environment
        // and dont want to rely on the dynamic import working perfectly in all test runners
        const mockEvaluator = {
            evaluateConstant: (_e: string) => 1.0,
            getReferencedVariables: (_e: string) => [],
            compile: (_e: string, _v: string[]) => (_ctx: any) => 1.0,
        };

        setFeatureFlags({ functionalRatesEnabled: true });

        expect(getFeatureFlags().functionalRatesEnabled).toBe(true);
        // Pass mockEvaluator explicitly
        const result = evaluateFunctionalRate('1.0', {}, {}, [], undefined, mockEvaluator);
        expect(result).toBe(1.0);
    });

    it('integration: should correctly use prebuilt context for optimization', () => {
        const mockEvaluator = {
            evaluateConstant: (_e: string) => 1.0,
            getReferencedVariables: (_e: string) => ['A'],
            compile: (_e: string, _v: string[]) => (ctx: any) => ctx.A * 2,
        };

        setFeatureFlags({ functionalRatesEnabled: true });

        const params = { k: 1 };
        const obs = { A: 10 };
        // Prebuild context like the worker does
        const context = { ...params, ...obs };

        // Should use the context to get value 20 (A * 2)
        const result = evaluateFunctionalRate('A*2', params, obs, [], context, mockEvaluator);
        expect(result).toBe(20);
    });
});

