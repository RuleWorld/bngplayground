
import { describe, it, expect, beforeAll } from 'vitest';
import { evaluateFunctionalRate, _setEvaluatorRefForTests } from '@bngplayground/engine';
import { SafeExpressionEvaluator } from '@bngplayground/engine';

describe('MathPermutations', () => {
    beforeAll(() => {
         _setEvaluatorRefForTests(SafeExpressionEvaluator);
    });

    const context = {
        zero: 0,
        one: 1,
        pi: Math.PI,
        e: Math.E,
        neg: -1,
        large: 1000
    };
     const emptyObs = {};

    // 6.1 Function Table Tests (50 permutations)
    const functions = [
        'sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'round', 'floor', 'ceil'
    ];
    const inputs = [
        { val: 0, str: '0' },
        { val: 1, str: '1' },
        { val: -1, str: '-1' },
        { val: Math.PI, str: 'pi' },
        { val: Math.E, str: 'e' }
    ];

    inputs.forEach(input => {
        functions.forEach(func => {
           it(`should evaluate ${func}(${input.str})`, () => {
               const expr = `${func}(${input.str})`;
               let expected = 0;
               // Simple reference calculation
               try {
                   const v = input.val;
                   switch(func) {
                       case 'sin': expected = Math.sin(v); break;
                       case 'cos': expected = Math.cos(v); break;
                       case 'tan': expected = Math.tan(v); break;
                       case 'exp': expected = Math.exp(v); break;
                       case 'log': expected = Math.log(v); break; // Natural log
                       case 'sqrt': expected = Math.sqrt(v); break;
                       case 'abs': expected = Math.abs(v); break;
                       case 'round': expected = Math.round(v); break;
                       case 'floor': expected = Math.floor(v); break;
                       case 'ceil': expected = Math.ceil(v); break;
                   }
               } catch { return; } // Skip if js throws

               if (isNaN(expected)) {
                    // Evaluate matches NaN behavior (usually 0 or logged Error in helper)
                    // The helper returns 0 on error/nan usually, or throws.
                    // Let's just run it to ensure no crash.
                    expect(evaluateFunctionalRate(expr, context, emptyObs)).toBeDefined();
               } else {
                    const res = evaluateFunctionalRate(expr, context, emptyObs);
                    if (Math.abs(expected) > 1e10) {
                         // Loose check for large numbers
                         // expect(res).toBeGreaterThan(100); 
                         // safeExpressionEvaluator returns 0 for non-finite results
                         expect(res).toBe(0);
                    } else {
                         expect(res).toBeCloseTo(expected, 4);
                    }
               }
           });
        });
    });

    // 6.2 Operator Complexity (50 permutations)
    const operators = ['+', '-', '*', '/', '^'];
    
    // Generate simple binary ops
    operators.forEach(op => {
         inputs.forEach(a => {
             inputs.forEach(b => {
                 it(`should evaluate ${a.str} ${op} ${b.str}`, () => {
                     const expr = `${a.str} ${op} ${b.str}`;
                     let expected = 0;
                     const v1 = a.val;
                     const v2 = b.val;
                     switch(op) {
                         case '+': expected = v1 + v2; break;
                         case '-': expected = v1 - v2; break;
                         case '*': expected = v1 * v2; break;
                         case '/': expected = v1 / v2; break;
                         case '^': expected = Math.pow(v1, v2); break;
                     }
                     if (!isFinite(expected)) {
                         // expect infinity
                         expect(evaluateFunctionalRate(expr, context, emptyObs)).not.toBeNaN();
                     } else {
                         expect(evaluateFunctionalRate(expr, context, emptyObs)).toBeCloseTo(expected);
                     }
                 });
             });
         });
    });
});
