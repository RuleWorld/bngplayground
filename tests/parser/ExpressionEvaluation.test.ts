
import { describe, it, expect, beforeAll } from 'vitest';
import { evaluateFunctionalRate, _setEvaluatorRefForTests } from '@bngplayground/engine';
import { SafeExpressionEvaluator } from '@bngplayground/engine';

// Enable features for testing
import { setFeatureFlags } from '../../services/featureFlags';

describe('ExpressionEvaluation', () => {
    beforeAll(() => {
        // Setup direct reference to evaluator to bypass dynamic import issues in test environment
        _setEvaluatorRefForTests(SafeExpressionEvaluator);
        setFeatureFlags({ functionalRatesEnabled: true });
    });

    const context = {
        k: 10,
        zero: 0,
        pi: Math.PI
    };

    const emptyObs = {};

    // 1. Evaluate sin(0) -> 0
    it('should evaluate sin(0)', () => {
        expect(evaluateFunctionalRate('sin(0)', context, emptyObs)).toBeCloseTo(0);
    });

    // 2. Evaluate cos(0) -> 1
    it('should evaluate cos(0)', () => {
        expect(evaluateFunctionalRate('cos(0)', context, emptyObs)).toBeCloseTo(1);
    });

    // 3. Evaluate tan(0) -> 0
    it('should evaluate tan(0)', () => {
        expect(evaluateFunctionalRate('tan(0)', context, emptyObs)).toBeCloseTo(0);
    });

    // 4. Evaluate log(e) -> 1
    it('should evaluate log of e', () => {
        // Assuming log is natural log in BNG
        expect(evaluateFunctionalRate('log(2.718281828)', context, emptyObs)).toBeCloseTo(1);
    });

    // 5. Evaluate exp(1) -> e
    it('should evaluate exp(1)', () => {
        expect(evaluateFunctionalRate('exp(1)', context, emptyObs)).toBeCloseTo(Math.E);
    });

    // 6. Evaluate sqrt(4) -> 2
    it('should evaluate sqrt(4)', () => {
        expect(evaluateFunctionalRate('sqrt(4)', context, emptyObs)).toBeCloseTo(2);
    });

    // 7. Evaluate min(1, 2) -> 1
    it('should evaluate min(1, 2)', () => {
        expect(evaluateFunctionalRate('min(1, 2)', context, emptyObs)).toBe(1);
    });

    // 8. Evaluate max(1, 2) -> 2
    it('should evaluate max(1, 2)', () => {
        expect(evaluateFunctionalRate('max(1, 2)', context, emptyObs)).toBe(2);
    });

    // 9. Evaluate abs(-5) -> 5
    it('should evaluate abs(-5)', () => {
        expect(evaluateFunctionalRate('abs(-5)', context, emptyObs)).toBe(5);
    });

    // 10. Evaluate complex precedence: 1 + 2 * 3 -> 7
    it('should handle operator precedence', () => {
        expect(evaluateFunctionalRate('1 + 2 * 3', context, emptyObs)).toBe(7);
    });

    // 11. Evaluate parenthesis precedence: (1 + 2) * 3 -> 9
    it('should handle parenthesis precedence', () => {
        expect(evaluateFunctionalRate('(1 + 2) * 3', context, emptyObs)).toBe(9);
    });

    // 12. Evaluate power operator: 2^3 -> 8
    it('should handle power operator', () => {
        expect(evaluateFunctionalRate('2^3', context, emptyObs)).toBe(8);
    });

    // 13. Evaluate divide by zero (should handle/throw)
    it('should return 0 (safe fallback) for divide by zero', () => {
        // Our evaluator returns 0 for non-finite results to prevent simulation crashes
        expect(evaluateFunctionalRate('1/0', context, emptyObs)).toBe(0);
    });

    // 14. Evaluate user parameter access: k where k=10
    it('should resolve user parameter', () => {
        expect(evaluateFunctionalRate('k', context, emptyObs)).toBe(10);
    });

    // 15. Evaluate missing parameter access (should throw or return NaN/0)
    it('should probably throw or fail on missing parameter', () => {
        // evaluateFunctionalRate returns 0 on failure/error and logs error
        // checking the mock console might be better, but return 0 is the behavior
        // Or it might throw depending on implementation of `compile`.
        // SafeExpressionEvaluator usually throws if variable is missing from `usedVars` logic?
        // Let's expect it to fail gracefully to 0 based on catch block or throw.
        // Actually, evaluateFunctionalRate catches and returns 0.
        expect(evaluateFunctionalRate('missing_param', context, emptyObs)).toBe(0);
    });
});
