
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
    evaluateFunctionalRate, 
    _setEvaluatorRefForTests, 
    clearAllEvaluatorCaches,
    evaluateExpressionOrParse,
    getCacheSizes
} from '@bngplayground/engine';

// Mock Evaluator
const mockEvaluator = {
    compile: vi.fn(),
    getReferencedVariables: vi.fn(),
    evaluateConstant: vi.fn()
};

describe('ExpressionEvaluator Service', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        clearAllEvaluatorCaches();
        _setEvaluatorRefForTests(mockEvaluator);
    });

    afterEach(() => {
        _setEvaluatorRefForTests(undefined);
    });

    describe('evaluateFunctionalRate', () => {
        it('should evaluate expression using compiled function', () => {
             const expr = '2*k1';
             const params = { k1: 5 };
             const context = { k1: 5 };
             
             mockEvaluator.getReferencedVariables.mockReturnValue(['k1']);
             mockEvaluator.compile.mockReturnValue((ctx: any) => 2 * ctx.k1);
             
             const res = evaluateFunctionalRate(expr, params, {});
             expect(res).toBe(10);
             expect(mockEvaluator.compile).toHaveBeenCalledWith(expr, ['k1']);
        });

        it('should cache compiled functions', () => {
             const expr = 'k1+k2';
             const params = { k1: 1, k2: 2 };
             
             mockEvaluator.getReferencedVariables.mockReturnValue(['k1', 'k2']);
             mockEvaluator.compile.mockReturnValue((ctx: any) => ctx.k1 + ctx.k2);
             
             evaluateFunctionalRate(expr, params, {});
             evaluateFunctionalRate(expr, params, {}); // Second call
             
             expect(mockEvaluator.compile).toHaveBeenCalledTimes(1);
             const sizes = getCacheSizes();
             expect(sizes.compiledRateFunctionsSize).toBe(1);
        });

        it('should expand function calls', () => {
             const expr = 'foo() + bar';
             const functions = [{ name: 'foo', args: [], expression: '10' }];
             const params = { bar: 5 };
             
             // Expected expansion: "(10) + bar"
             mockEvaluator.getReferencedVariables.mockReturnValue(['bar']);
             mockEvaluator.compile.mockReturnValue((ctx: any) => 10 + ctx.bar);
             
             const res = evaluateFunctionalRate(expr, params, {}, functions);
             expect(res).toBe(15);
             expect(mockEvaluator.compile).toHaveBeenCalledWith(expect.stringContaining('(10)'), ['bar']);
        });

        it('should handle evaluation errors gracefully (return 0)', () => {
             const expr = 'invalid';
             mockEvaluator.getReferencedVariables.mockReturnValue([]);
             mockEvaluator.compile.mockImplementation(() => { throw new Error('Compile error'); });
             
             const res = evaluateFunctionalRate(expr, {}, {});
             expect(res).toBe(0);
        });
    });

    describe('evaluateExpressionOrParse', () => {
         it('should use evaluator for constants', () => {
             mockEvaluator.evaluateConstant.mockReturnValue(42);
             const res = evaluateExpressionOrParse('meaning');
             expect(res).toBe(42);
             expect(mockEvaluator.evaluateConstant).toHaveBeenCalledWith('meaning');
         });

         it('should fallback to parseFloat if evaluator fails or missing', () => {
             mockEvaluator.evaluateConstant.mockImplementation(() => { throw new Error('Fail'); });
             const res = evaluateExpressionOrParse('3.14');
             expect(res).toBe(3.14);
         });

         it('should return 0 for NaN fallback', () => {
             mockEvaluator.evaluateConstant.mockImplementation(() => { throw new Error('Fail'); });
             const res = evaluateExpressionOrParse('not_a_number');
             expect(res).toBe(0);
         });
    });

});
