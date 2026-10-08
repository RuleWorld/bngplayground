/**
 * ExpressionBytecodeArity.spec.ts
 *
 * Covers the single expression bytecode compiler
 * (`ExpressionBytecodeCompiler.compileExpressionToBytecode`) and the TS
 * bytecode VM that executes its output:
 *  - function arity is enforced (A3)
 *  - `y[N]` indices are range-checked (A2, TS producer half)
 *  - the bytecode VM agrees with the `new Function` Math.* reference path (A6)
 *  - rounding follows BNG2's `floor(v + 0.5)` (A5)
 */

import { describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { jitCompiler } from '../../src/services/analysis/JITCompiler';
import { compileExpressionToBytecode } from '../../src/services/analysis/ExpressionBytecodeCompiler';
import { buildBytecodeEvaluator, compileRateToJIT } from '../../src/services/simulation/ExpressionEvaluator';
import { SafeExpressionEvaluator } from '../../src/utils/safeExpressionEvaluator';
import { ExpressionTranslator } from '../../src/services/graph/core/ExpressionTranslator';
import { evaluateExpressionHighPrecision } from '../../src/services/graph/core/highPrecisionEvaluator';

/** BNG2's muParser rounding: round half UP. Deliberately not `Math.round`. */
const roundHalfUp = (v: number): number => Math.floor(v + 0.5);

/** The `Math.*` reference table the JS path is defined against. */
const JS_FUNCTIONS: Record<string, (...args: number[]) => number> = {
    abs: Math.abs,
    acos: Math.acos,
    asin: Math.asin,
    atan: Math.atan,
    ceil: Math.ceil,
    cos: Math.cos,
    exp: Math.exp,
    floor: Math.floor,
    ln: Math.log,
    log: Math.log,
    log10: Math.log10,
    max: Math.max,
    min: Math.min,
    not: (x: number) => (x === 0 ? 1 : 0),
    pow: Math.pow,
    rint: roundHalfUp,
    round: roundHalfUp,
    sin: Math.sin,
    sqrt: Math.sqrt,
    tan: Math.tan
};

/**
 * Evaluate `expr` the way the generated-JS path would: `new Function` over the
 * `Math.*` table. `if` is a JS keyword, so it is emitted as `IF`.
 *
 * JS returns booleans for comparisons and `!` (and an operand for `&&`/`||`),
 * while BNGL returns 1/0, so boolean-valued expressions are compared through
 * `evalViaJsTruthy` instead of this helper.
 */
function evalViaJsReference(expr: string, vars: Record<string, number>): number {
    const src = `return (${expr.replace(/\bif\(/g, 'IF(')});`;
     
    const fn = new Function('IF', ...Object.keys(JS_FUNCTIONS), ...Object.keys(vars), src);
    return fn(
        (c: number, a: number, b: number) => (c !== 0 ? a : b),
        ...Object.values(JS_FUNCTIONS),
        ...Object.values(vars)
    ) as number;
}

/** BNGL semantics for boolean-valued expressions: truthy -> 1, falsy -> 0. */
function evalViaJsTruthy(expr: string, vars: Record<string, number>): number {
    const src = `return (${expr}) ? 1 : 0;`;
     
    const fn = new Function(...Object.keys(vars), src);
    return fn(...Object.values(vars)) as number;
}

/** Evaluate `expr` through the production TS bytecode VM. */
function evalViaBytecode(expr: string, vars: Record<string, number>): number {
    const fn = compileRateToJIT(expr, Object.keys(vars));
    expect(fn, `expected '${expr}' to compile to bytecode`).not.toBeNull();
    return fn!(vars);
}

function withSilencedWarnings<T>(fn: () => T): T {
    const spy: MockInstance = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
        return fn();
    } finally {
        spy.mockRestore();
    }
}

function capturedConsoleError(run: () => void): string {
    const spy: MockInstance = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
        run();
        return spy.mock.calls.map(c => c.map(String).join(' ')).join('\n');
    } finally {
        spy.mockRestore();
    }
}

/** The compiler reports failures via console.warn and returns null. */
function capturedCompileWarnings(expr: string, speciesNames: string[]): string {
    const spy: MockInstance = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
        compileExpressionToBytecode(expr, {}, speciesNames, []);
        return spy.mock.calls.map(c => c.map(String).join(' ')).join('\n');
    } finally {
        spy.mockRestore();
    }
}

/**
 * True when `compileRateToJIT` could NOT use the bytecode VM for `expr`.
 * `compileRateToJIT` falls back to the AST evaluator when bytecode
 * compilation is refused, so a non-null result does not imply bytecode ran.
 */
function compileRateToBytecodeRejected(expr: string): boolean {
    const varNames = ['A', 'B', 'C'];
    return compileExpressionToBytecode(expr, {}, varNames, []) === null;
}
describe('expression bytecode VM malformed programs', () => {
    const makeEvaluator = (code: Uint8Array) => buildBytecodeEvaluator({
        code,
        view: new DataView(code.buffer, code.byteOffset, code.byteLength),
    }, []);

    it('throws for unknown opcodes', () => {
        expect(() => makeEvaluator(new Uint8Array([0xFE]))({})).toThrow(/Unknown bytecode opcode 254/);
    });
    it('throws for an out-of-range variable operand', () => {
        const code = new Uint8Array([1, 0, 0, 0, 0, 0xFF]);
        expect(() => makeEvaluator(code)({})).toThrow(/Bytecode variable index 0 out of range/);
    });

    it('throws when bytecode produces an empty stack', () => {
        expect(() => makeEvaluator(new Uint8Array())({})).toThrow(/Bytecode program produced no value/);
    });
});

describe('expression bytecode — function arity', () => {
    const vars = { A: 9, B: 5, C: 3 };

    it('max() folds every argument instead of only the last two', () => {
        // The bug: max(9,5,3) evaluated to 5 because a single MAX opcode was
        // emitted for three pushed arguments.
        expect(evalViaBytecode('max(A,B,C)', vars)).toBe(9);
        expect(evalViaBytecode('max(A,B)', vars)).toBe(9);
        expect(compileRateToJIT('max(9,5,3)', [])!({})).toBe(9);
    });

    it('min() folds every argument', () => {
        expect(evalViaBytecode('min(A,B,C)', vars)).toBe(3);
        expect(evalViaBytecode('min(4,1,7,2)', {})).toBe(1);
    });

    it('single-argument max/min emit no opcode and yield the argument', () => {
        expect(evalViaBytecode('max(A)', vars)).toBe(9);
        expect(evalViaBytecode('min(C)', vars)).toBe(3);
        // Exactly PUSH_SPEC 0 then STOP — no MAX/MIN op at all.
        const compiled = compileExpressionToBytecode('max(A)', {}, ['A'], [])!;
        expect([...compiled.bytecode]).toEqual([1, 0, 0, 0, 0, 0xFF]);
    });

    it('max/min with n arguments emit exactly n-1 fold opcodes', () => {
        const three = compileExpressionToBytecode('max(1,2,3)', {}, [], [])!.bytecode;
        // 3 x (PUSH_CONST + 8 bytes) + 2 x MAX + STOP
        expect(three.length).toBe(3 * 9 + 2 + 1);
        expect(three.filter(op => op === 23).length).toBe(2);

        const five = compileExpressionToBytecode('min(1,2,3,4,5)', {}, [], [])!.bytecode;
        expect(five.filter(op => op === 24).length).toBe(4);
    });

    it('rejects wrong arity: compilation returns null', () => {
        const bad = ['exp(1,2)', 'if(1,7)', 'sqrt()', 'max()', 'min()',
            'pow(2)', 'pow(2,3,4)', 'abs(1,2)', 'sin(1,2)', 'not(1,2)',
            'sat(1)', 'sat(1,2,3)', 'log10()', 'rint(1,2)', 'round(0.5,1)'];

        for (const expr of bad) {
            expect(withSilencedWarnings(() => compileExpressionToBytecode(expr, {}, [], [])), expr)
                .toBeNull();
        }
    });

    it('sat() expands to a/(a+b), matching the hand-written equivalent', () => {
        // sat() is not in the JIT function allowlist, so exercise the compiler
        // directly: its bytecode must equal that of A/(A+B).
        const sat = compileExpressionToBytecode('sat(A,B)', {}, ['A', 'B'], [])!;
        const manual = compileExpressionToBytecode('A/(A+B)', {}, ['A', 'B'], [])!;
        expect([...sat.bytecode]).toEqual([...manual.bytecode]);
    });

    it('a wrong-arity call never reaches the bytecode VM', () => {
        // compileRateToJIT falls back to the AST evaluator when the bytecode
        // compiler rejects an expression, so the guarantee we assert is that
        // the bytecode path is refused, not that no evaluator exists at all.
        expect(withSilencedWarnings(() => compileRateToBytecodeRejected('exp(1,2)'))).toBe(true);
        expect(withSilencedWarnings(() => compileRateToBytecodeRejected('sqrt()'))).toBe(true);
        expect(withSilencedWarnings(() => compileRateToBytecodeRejected('if(1,7)'))).toBe(true);
    });

    it('rejects wrong arity with a message naming the function and count', () => {
        expect(capturedCompileWarnings('exp(1,2,3)', [])).toMatch(/exp\(\) expects 1 argument\(s\), got 3/);
        expect(capturedCompileWarnings('if(A,B)', ['A', 'B'])).toMatch(/if\(\) expects 3 argument\(s\), got 2/);
        expect(capturedCompileWarnings('max()', [])).toMatch(/max\(\) expects at least 1 argument\(s\), got 0/);
        expect(capturedCompileWarnings('sqrt()', [])).toMatch(/sqrt\(\) expects 1 argument\(s\), got 0/);
        expect(capturedCompileWarnings('sat(1)', [])).toMatch(/sat\(\) expects 2 argument\(s\), got 1/);
    });
});

describe('expression bytecode — TS/JS path parity', () => {
    const vars = { A: 0.8, B: -0.35, C: 2.5, D: 0.49999999999999994 };

    const cases: string[] = [
        // variadic min/max — the divergence that started this
        'max(A,B,C)', 'max(B,A,C)', 'min(A,B,C)', 'max(A)', 'min(C)',
        'max(A,B,C,D)', 'min(A,B,C,D)',
        // unary math
        'exp(A)', 'ln(A)', 'log(A)', 'log10(A)', 'sqrt(C)', 'abs(B)',
        'sin(A)', 'cos(A)', 'tan(A)', 'asin(A)', 'acos(A)', 'atan(B)',
        'ceil(B)', 'floor(B)', 'rint(A)', 'round(A)', 'not(A)',
        // binary functions (sat() excluded: it is not in the JIT function
        // allowlist, so it never reaches the bytecode VM via compileRateToJIT)
        'pow(A,C)',
        // comparisons and logic are checked separately (see below): in JS they
        // are boolean-valued, in BNGL they are 1/0
        // if()
        'if(A,B,C)', 'if(B,A,C)', 'if(A > B, C, A)',
        // functions composed with arithmetic
        'max(A,B) + min(C,A)', 'sqrt(max(A,C)) * exp(B)',
        // rounding edges — BNG2 parity is floor(v + 0.5), NOT Math.round
        'rint(0.5)', 'round(0.5)', 'rint(1.5)', 'round(1.5)',
        'rint(2.5)', 'round(2.5)', 'rint(-0.5)', 'round(-0.5)',
        'rint(-1.5)', 'round(-1.5)', 'rint(-2.5)', 'round(-2.5)',
        'rint(0.49999999999999994)', 'round(0.49999999999999994)',
        'rint(D)', 'round(D)'
    ];

    it('bytecode VM matches the JS Math.* reference within 1e-15 relative', () => {
        for (const expr of cases) {
            const viaBytecode = evalViaBytecode(expr, vars);
            const viaJs = evalViaJsReference(expr, vars);
            if (!Number.isFinite(viaJs)) {
                expect(viaBytecode, expr).toBe(viaJs);
                continue;
            }
            const scale = Math.max(1, Math.abs(viaJs));
            expect(
                Math.abs(viaBytecode - viaJs) / scale,
                `${expr}: bytecode=${viaBytecode} js=${viaJs}`
            ).toBeLessThanOrEqual(1e-15);
        }
    });

    const booleanCases = ['A < B', 'A > B', 'A <= B', 'A >= B', 'A == B', 'A != B',
        'A && B', 'A || B', '!A'];

    it('boolean-valued expressions agree with BNGL 1/0 semantics', () => {
        for (const expr of booleanCases) {
            expect(evalViaBytecode(expr, vars), expr).toBe(evalViaJsTruthy(expr, vars));
        }
    });
});

describe('expression bytecode — rounding (BNG2 floor(v + 0.5))', () => {
    const values = [0.5, 1.5, 2.5, -0.5, -1.5, -2.5, 0.49999999999999994];

    it('rint/round follow floor(v + 0.5), not Math.round', () => {
        for (const v of values) {
            const expected = Math.floor(v + 0.5);
            expect(roundHalfUp(v), `roundHalfUp(${v})`).toBe(expected);
            expect(evalViaBytecode(`rint(${v})`, {}), `rint(${v})`).toBe(expected);
            expect(evalViaBytecode(`round(${v})`, {}), `round(${v})`).toBe(expected);
        }
    });

    it('ties agree with Math.round but the near-half case does not', () => {
        for (const v of [0.5, 1.5, 2.5, -0.5, -1.5, -2.5]) {
            // Numeric comparison: Math.round(-0.5) is -0, floor(-0.5 + 0.5) is +0.
            expect(roundHalfUp(v) - Math.round(v), `tie at ${v}`).toBe(0);
        }
        // The distinguishing case: Math.round gives 0, BNG2 gives 1.
        expect(Math.round(0.49999999999999994)).toBe(0);
        expect(roundHalfUp(0.49999999999999994)).toBe(1);
        expect(evalViaBytecode('round(0.49999999999999994)', {})).toBe(1);
        expect(evalViaBytecode('rint(0.49999999999999994)', {})).toBe(1);
    });
});

describe('rounding semantics on actual JavaScript evaluation paths', () => {
    const values = [0.5, 1.5, 2.5, -0.5, -1.5, -2.5, 0.49999999999999994];

    it('SafeExpressionEvaluator uses BNG2 floor(v + 0.5) for round and rint', () => {
        for (const value of values) {
            const expected = Math.floor(value + 0.5);
            expect(SafeExpressionEvaluator.compile(`round(${value})`)({}), `round(${value})`).toBe(expected);
            expect(SafeExpressionEvaluator.compile(`rint(${value})`)({}), `rint(${value})`).toBe(expected);
        }
    });

    it('ExpressionTranslator emits executable round-half-up JavaScript', () => {
        for (const value of values) {
            for (const functionName of ['round', 'rint']) {
                const jsExpression = ExpressionTranslator.translate(`${functionName}(${value})`);
                const evaluate = new Function(`return ${jsExpression}`) as () => number;
                expect(evaluate(), `${functionName}(${value}) => ${jsExpression}`)
                    .toBe(Math.floor(value + 0.5));
            }
        }
        expect(ExpressionTranslator.translate('rint(round(x))'))
            .toBe('Math.floor((Math.floor((x) + 0.5)) + 0.5)');
    });

    it('high precision evaluation preserves BNG2 round/rint behavior', () => {
        for (const value of values) {
            const expected = Math.floor(value + 0.5);
            expect(evaluateExpressionHighPrecision('round(x)', { x: value }), `round(${value})`).toBe(expected);
            expect(evaluateExpressionHighPrecision('rint(x)', { x: value }), `rint(${value})`).toBe(expected);
        }
    });
});

describe('JITCompiler.compileToByteCode — index validation', () => {
    const baseRxns = [{
        reactantIndices: [0],
        reactantStoich: [1],
        productIndices: [1],
        productStoich: [1],
        rateConstant: 'k1*A',
        scalingVolume: 1
    }];

    it('rejects an observable index equal to nSpecies, naming the observable', () => {
        const log = capturedConsoleError(() => {
            const result = jitCompiler.compileToByteCode(
                baseRxns, 3, { k1: 1 }, undefined, undefined,
                [{ name: 'TotalThing', indices: [3], coefficients: [1] }],
                ['A', 'B', 'C']
            );
            expect(result).toBeNull();
        });
        expect(log).toMatch(/TotalThing/);
        expect(log).toMatch(/invalid species index 3/);
    });

    it('rejects a negative observable index', () => {
        const log = capturedConsoleError(() => {
            const result = jitCompiler.compileToByteCode(
                baseRxns, 3, { k1: 1 }, undefined, undefined,
                [{ name: 'BadObs', indices: [-1], coefficients: [1] }],
                ['A', 'B', 'C']
            );
            expect(result).toBeNull();
        });
        expect(log).toMatch(/BadObs/);
    });

    it('accepts in-range observable indices', () => {
        const result = jitCompiler.compileToByteCode(
            baseRxns, 3, { k1: 1 }, undefined, undefined,
            [{ name: 'OkObs', indices: [0, 2], coefficients: [1, 2] }],
            ['A', 'B', 'C']
        );
        expect(result).not.toBeNull();
    });

    it('rejects y[N] outside the species table instead of emitting a bad read', () => {
        for (const expr of ['k1*y[999]', 'k1*y[-1]', 'y[3]']) {
            expect(withSilencedWarnings(() => compileExpressionToBytecode(expr, { k1: 2 }, ['A', 'B', 'C'], [])), expr)
                .toBeNull();
        }
        const ok = compileExpressionToBytecode('k1*y[2]', { k1: 2 }, ['A', 'B', 'C'], []);
        expect(ok).not.toBeNull();
    });

    it('a network whose rate uses y[999] gets no bytecode at all', () => {
        capturedConsoleError(() => {
            const rxns = [{
                reactantIndices: [0],
                reactantStoich: [1],
                productIndices: [1],
                productStoich: [1],
                rateConstant: 'k1*y[999]',
                scalingVolume: 1
            }];
            expect(jitCompiler.compileToByteCode(rxns, 3, { k1: 1 }, undefined, undefined, undefined, ['A', 'B', 'C']))
                .toBeNull();
        });
    });
});