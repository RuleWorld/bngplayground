/**
 * Tests for functional rate pre-compilation and JIT optimization.
 *
 * Verifies that:
 *  - Pre-compiled rates produce identical results to evaluateFunctionalRate()
 *  - JIT-compiled (new Function()) rates match AST-walk evaluator
 *  - Mutable context produces same results as spread context
 *  - Edge cases: division by zero, negative concentrations, parameter-only expressions
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  evaluateFunctionalRate,
  getCompiledRateFunction,
  preCompileFunctionalRates,
  preCompileFunctionalRatesWithJIT,
  compileRateToJIT,
  isJITSafe,
  expandRateLawMacros,
  clearAllEvaluatorCaches,
  type PreCompiledRate,
  type PreCompiledRateWithJIT,
} from '../../src/services/simulation/ExpressionEvaluator';
import { setFeatureFlags } from '../../src/featureFlags';

// Ensure functional rates are enabled for all tests
beforeEach(() => {
  setFeatureFlags({ functionalRatesEnabled: true });
  clearAllEvaluatorCaches();
});

afterEach(() => {
  setFeatureFlags({ functionalRatesEnabled: true });
  clearAllEvaluatorCaches();
});

// ---------------------------------------------------------------------------
// Helper: evaluate via the original per-step path (evaluateFunctionalRate)
// ---------------------------------------------------------------------------
function evalOriginal(
  expr: string,
  params: Record<string, number>,
  obs: Record<string, number>,
  functions?: { name: string; args: string[]; expression: string }[],
  extraContext?: Record<string, number>
): number {
  const ctx = { ...params, ...obs, ...(extraContext || {}) };
  return evaluateFunctionalRate(expr, params, obs, functions, ctx);
}

// ---------------------------------------------------------------------------
// Test expressions covering common BNG rate law patterns
// ---------------------------------------------------------------------------
const TEST_PARAMS: Record<string, number> = {
  k1: 0.1,
  k2: 0.5,
  Km: 10,
  Vmax: 100,
  kcat: 5,
  n: 3,
  K: 20,
};

const TEST_OBS: Record<string, number> = {
  Active_Enzyme: 50,
  Active_Substrate: 25,
  Total_A: 100,
};

const ALL_VAR_NAMES = [
  ...Object.keys(TEST_PARAMS),
  ...Object.keys(TEST_OBS),
  'ridx0', 'ridx1', 'A', 'B', 'S', 'E',
];

const EXTRA_CONTEXT: Record<string, number> = {
  ridx0: 30,
  ridx1: 15,
  A: 30,
  B: 15,
  S: 30,
  E: 15,
};

// ---------------------------------------------------------------------------
// 1. Pre-compiled rate gives same result as evaluateFunctionalRate
// ---------------------------------------------------------------------------
describe('Pre-compiled rates (Optimization A) produce identical results', () => {
  const expressions = [
    // Simple parameter expression
    'k1',
    // Arithmetic
    'k1 * Active_Substrate + k2',
    // Hill-like (manually expanded)
    'Vmax * pow(ridx0, n) / (pow(K, n) + pow(ridx0, n))',
    // MM-like (manually expanded)
    'kcat * ridx1 / (Km + ridx0)',
    // Piecewise via BNG if()
    'if(Active_Enzyme - 10, k1, k2)',
    // Nested math
    'sqrt(k1 * k2) + exp(-k1 * ridx0)',
  ];

  for (const expr of expressions) {
    it(`matches evaluateFunctionalRate for: ${expr}`, () => {
      const original = evalOriginal(expr, TEST_PARAMS, TEST_OBS, undefined, EXTRA_CONTEXT);

      const compiled = preCompileFunctionalRates(
        [expr],
        ALL_VAR_NAMES,
        undefined
      );
      expect(compiled).toHaveLength(1);

      const fullCtx = { ...TEST_PARAMS, ...TEST_OBS, ...EXTRA_CONTEXT };
      const precompiled = compiled[0].fn(fullCtx);

      expect(precompiled).toBe(original);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. JIT-compiled (new Function()) matches AST-walk evaluator
// ---------------------------------------------------------------------------
describe('JIT compilation (Optimization B) matches AST-walk evaluator', () => {
  const jitSafeExprs = [
    'k1 * ridx0',
    'k1 * Active_Substrate + k2 * ridx0',
    'Vmax * pow(ridx0, n) / (pow(K, n) + pow(ridx0, n))',
    'kcat * ridx1 / (Km + ridx0)',
    'sqrt(k1 * k2) + exp(-k1 * ridx0)',
    'log(1 + ridx0) * k1',
    'abs(ridx0 - ridx1) * k2',
  ];

  for (const expr of jitSafeExprs) {
    it(`JIT matches AST-walk for: ${expr}`, () => {
      const fullCtx = { ...TEST_PARAMS, ...TEST_OBS, ...EXTRA_CONTEXT };

      const compiled = preCompileFunctionalRatesWithJIT(
        [expr],
        ALL_VAR_NAMES,
        undefined,
        true
      );
      expect(compiled).toHaveLength(1);

      const entry = compiled[0];
      const astResult = entry.astFn(fullCtx);

      if (entry.isJIT && entry.jitFn) {
        const jitResult = entry.jitFn(fullCtx);
        // Must be exactly the same floating-point value
        expect(jitResult).toBe(astResult);
      } else {
        // If JIT wasn't possible, the AST path should still work
        expect(typeof astResult).toBe('number');
        expect(isFinite(astResult)).toBe(true);
      }
    });
  }

  it('falls back to AST-walk for expressions using BNG if()', () => {
    const expr = 'if(Active_Enzyme - 10, k1, k2)';
    const fullCtx = { ...TEST_PARAMS, ...TEST_OBS, ...EXTRA_CONTEXT };

    const compiled = preCompileFunctionalRatesWithJIT(
      [expr],
      ALL_VAR_NAMES,
      undefined,
      true
    );
    expect(compiled).toHaveLength(1);

    // 'if' is not in JIT_ALLOWED_FUNCTIONS, so should fall back to AST
    const entry = compiled[0];
    const astResult = entry.astFn(fullCtx);
    expect(typeof astResult).toBe('number');

    // Original path should match
    const original = evalOriginal(expr, TEST_PARAMS, TEST_OBS, undefined, EXTRA_CONTEXT);
    expect(astResult).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// 3. compileRateToJIT unit tests
// ---------------------------------------------------------------------------
describe('compileRateToJIT', () => {
  it('compiles simple arithmetic expression', () => {
    const fn = compileRateToJIT('k1 * A + k2', ['k1', 'k2', 'A']);
    expect(fn).not.toBeNull();
    const result = fn!({ k1: 2, k2: 3, A: 5 });
    expect(result).toBe(13); // 2*5 + 3
  });

  it('compiles expression with pow/sqrt', () => {
    const fn = compileRateToJIT('pow(A, 2) + sqrt(B)', ['A', 'B']);
    expect(fn).not.toBeNull();
    const result = fn!({ A: 3, B: 16 });
    expect(result).toBe(13); // 9 + 4
  });

  it('compiles expression with ^ operator (exponentiation)', () => {
    const fn = compileRateToJIT('A ^ 2 + B', ['A', 'B']);
    expect(fn).not.toBeNull();
    const result = fn!({ A: 3, B: 1 });
    expect(result).toBe(10); // 3**2 + 1
  });

  it('returns null for expressions with unsupported functions', () => {
    const fn = compileRateToJIT('mratio(1, 2, A)', ['A']);
    expect(fn).toBeNull();
  });

  it('returns null when JIT is disabled', () => {
    const fn = compileRateToJIT('k1 * A', ['k1', 'A'], false);
    expect(fn).toBeNull();
  });

  it('returns null for expressions with property access', () => {
    const fn = compileRateToJIT('obj.prop', ['obj']);
    expect(fn).toBeNull();
  });

  it('returns null for expressions with assignment', () => {
    const fn = compileRateToJIT('A = 5', ['A']);
    expect(fn).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. isJITSafe unit tests
// ---------------------------------------------------------------------------
describe('isJITSafe', () => {
  const knownVars = new Set(['k1', 'k2', 'A', 'B', 'ridx0']);

  it('accepts simple arithmetic', () => {
    expect(isJITSafe('k1 * A + k2', knownVars)).toBe(true);
  });

  it('accepts expressions with allowed math functions', () => {
    expect(isJITSafe('sqrt(k1) + exp(A)', knownVars)).toBe(true);
    expect(isJITSafe('pow(A, k1) * log(B + 1)', knownVars)).toBe(true);
  });

  it('rejects expressions with unknown identifiers', () => {
    expect(isJITSafe('k1 * unknownVar', knownVars)).toBe(false);
  });

  it('rejects expressions with property access', () => {
    expect(isJITSafe('A.toString()', knownVars)).toBe(false);
  });

  it('rejects expressions with brackets', () => {
    expect(isJITSafe('A[0]', knownVars)).toBe(false);
  });

  it('rejects expressions with JS keywords', () => {
    expect(isJITSafe('function() { return A }', knownVars)).toBe(false);
    expect(isJITSafe('new Date()', knownVars)).toBe(false);
  });

  it('rejects expressions with semicolons', () => {
    expect(isJITSafe('A; B', knownVars)).toBe(false);
  });

  it('rejects expressions with the if function (not in JIT allowlist)', () => {
    // BNG 'if' is a special function not in JIT_ALLOWED_FUNCTIONS
    expect(isJITSafe('if(A, k1, k2)', knownVars)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Mutable context produces same results as spread context
// ---------------------------------------------------------------------------
describe('Mutable context vs spread context equivalence', () => {
  const expressions = [
    'k1 * ridx0 + k2 * Active_Enzyme',
    'Vmax * pow(ridx0, n) / (pow(K, n) + pow(ridx0, n))',
    'kcat * ridx1 / (Km + ridx0)',
  ];

  for (const expr of expressions) {
    it(`mutable context matches spread context for: ${expr}`, () => {
      const compiled = preCompileFunctionalRates([expr], ALL_VAR_NAMES);
      const fn = compiled[0].fn;

      // Spread context (old approach: creates new object every call)
      const spreadCtx = { ...TEST_PARAMS, ...TEST_OBS, ...EXTRA_CONTEXT };
      const spreadResult = fn(spreadCtx);

      // Mutable context (new approach: reuse same object, update in-place)
      const mutableCtx: Record<string, number> = {};
      // Initialize all slots
      for (const key of ALL_VAR_NAMES) {
        mutableCtx[key] = 0;
      }
      // Update in-place (mimics what the hot loop does)
      for (const [k, v] of Object.entries(TEST_PARAMS)) mutableCtx[k] = v;
      for (const [k, v] of Object.entries(TEST_OBS)) mutableCtx[k] = v;
      for (const [k, v] of Object.entries(EXTRA_CONTEXT)) mutableCtx[k] = v;
      const mutableResult = fn(mutableCtx);

      expect(mutableResult).toBe(spreadResult);
    });
  }

  it('mutable context correctly updates between consecutive evaluations', () => {
    const expr = 'k1 * ridx0';
    const compiled = preCompileFunctionalRates([expr], ALL_VAR_NAMES);
    const fn = compiled[0].fn;

    const ctx: Record<string, number> = { k1: 0.1, ridx0: 0 };

    // Step 1: ridx0 = 10
    ctx.ridx0 = 10;
    const r1 = fn(ctx);
    expect(r1).toBe(1.0); // 0.1 * 10

    // Step 2: ridx0 = 20 (in-place update)
    ctx.ridx0 = 20;
    const r2 = fn(ctx);
    expect(r2).toBe(2.0); // 0.1 * 20

    // Step 3: ridx0 = 0 (in-place update)
    ctx.ridx0 = 0;
    const r3 = fn(ctx);
    expect(r3).toBe(0); // 0.1 * 0
  });
});

// ---------------------------------------------------------------------------
// 6. Edge cases
// ---------------------------------------------------------------------------
describe('Edge cases', () => {
  it('handles division by zero gracefully', () => {
    const expr = 'k1 / ridx0';
    const compiled = preCompileFunctionalRates([expr], ALL_VAR_NAMES);
    const ctx = { ...TEST_PARAMS, ...TEST_OBS, ...EXTRA_CONTEXT, ridx0: 0 };
    const result = compiled[0].fn(ctx);
    // Division by zero produces Infinity or NaN; the evaluator should not throw
    expect(typeof result).toBe('number');
  });

  it('handles negative concentrations', () => {
    const expr = 'k1 * ridx0 + sqrt(abs(ridx0))';
    const compiled = preCompileFunctionalRates([expr], ALL_VAR_NAMES);
    const ctx = { ...TEST_PARAMS, ...TEST_OBS, ...EXTRA_CONTEXT, ridx0: -5 };
    const result = compiled[0].fn(ctx);
    // k1 * (-5) + sqrt(abs(-5)) = -0.5 + sqrt(5)
    const expected = 0.1 * (-5) + Math.sqrt(5);
    expect(result).toBeCloseTo(expected, 10);
  });

  it('handles parameter-only expressions (no species/observables)', () => {
    const expr = 'k1 * k2';
    const compiled = preCompileFunctionalRates([expr], ALL_VAR_NAMES);
    const ctx = { ...TEST_PARAMS, ...TEST_OBS, ...EXTRA_CONTEXT };
    const result = compiled[0].fn(ctx);
    expect(result).toBe(0.1 * 0.5);
  });

  it('handles zero-valued parameters', () => {
    const expr = 'k1 * ridx0';
    const compiled = preCompileFunctionalRates([expr], ALL_VAR_NAMES);
    const ctx = { ...TEST_PARAMS, ...TEST_OBS, ...EXTRA_CONTEXT, k1: 0, ridx0: 100 };
    const result = compiled[0].fn(ctx);
    expect(result).toBe(0);
  });

  it('handles very large concentrations', () => {
    const expr = 'k1 * ridx0';
    const compiled = preCompileFunctionalRates([expr], ALL_VAR_NAMES);
    const ctx = { ...TEST_PARAMS, ...TEST_OBS, ...EXTRA_CONTEXT, ridx0: 1e15 };
    const result = compiled[0].fn(ctx);
    expect(result).toBe(0.1 * 1e15);
  });

  it('handles very small concentrations', () => {
    const expr = 'k1 * ridx0';
    const compiled = preCompileFunctionalRates([expr], ALL_VAR_NAMES);
    const ctx = { ...TEST_PARAMS, ...TEST_OBS, ...EXTRA_CONTEXT, ridx0: 1e-20 };
    const result = compiled[0].fn(ctx);
    expect(result).toBeCloseTo(0.1 * 1e-20, 30);
  });
});

// ---------------------------------------------------------------------------
// 7. Rate law macro expansion + pre-compilation
// ---------------------------------------------------------------------------
describe('Rate law macro expansion with pre-compilation', () => {
  it('Hill macro expands and evaluates correctly via pre-compiled path', () => {
    const rawExpr = 'Hill(Vmax, K, n)';
    const expanded = expandRateLawMacros(rawExpr, 'ridx0');
    // Rate law macros are expanded during network generation, before reaching
    // the evaluator. So both paths use the expanded form.
    const ctx = { ...TEST_PARAMS, ...TEST_OBS, ...EXTRA_CONTEXT };

    // Evaluate via original evaluateFunctionalRate (with already-expanded expr)
    const original = evalOriginal(expanded, TEST_PARAMS, TEST_OBS, undefined, EXTRA_CONTEXT);

    // Evaluate via pre-compiled path
    const compiled = preCompileFunctionalRates([expanded], ALL_VAR_NAMES);
    const precomp = compiled[0].fn(ctx);

    // Must match exactly
    expect(precomp).toBe(original);
    // Sanity: result should be a sensible positive number
    expect(original).toBeGreaterThan(0);
  });

  it('Sat macro expands and evaluates correctly via pre-compiled path', () => {
    const rawExpr = 'Sat(k1, Km)';
    const expanded = expandRateLawMacros(rawExpr, 'ridx0');
    const ctx = { ...TEST_PARAMS, ...TEST_OBS, ...EXTRA_CONTEXT };

    const original = evalOriginal(expanded, TEST_PARAMS, TEST_OBS, undefined, EXTRA_CONTEXT);
    const compiled = preCompileFunctionalRates([expanded], ALL_VAR_NAMES);
    const precomp = compiled[0].fn(ctx);

    expect(precomp).toBe(original);
    expect(original).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 8. User-defined function expansion + pre-compilation
// ---------------------------------------------------------------------------
describe('User-defined function expansion with pre-compilation', () => {
  const userFunctions = [
    { name: 'myRate', args: [], expression: 'k1 * Active_Enzyme' },
    { name: 'compositeRate', args: [], expression: 'myRate() + k2' },
  ];

  it('single user function produces identical results', () => {
    const expr = 'myRate()';
    const ctx = { ...TEST_PARAMS, ...TEST_OBS, ...EXTRA_CONTEXT };

    const original = evalOriginal(expr, TEST_PARAMS, TEST_OBS, userFunctions, EXTRA_CONTEXT);
    const compiled = preCompileFunctionalRates([expr], ALL_VAR_NAMES, userFunctions);
    const precomp = compiled[0].fn(ctx);

    expect(precomp).toBe(original);
  });

  it('nested user function produces identical results', () => {
    const expr = 'compositeRate()';
    const ctx = { ...TEST_PARAMS, ...TEST_OBS, ...EXTRA_CONTEXT };

    const original = evalOriginal(expr, TEST_PARAMS, TEST_OBS, userFunctions, EXTRA_CONTEXT);
    const compiled = preCompileFunctionalRates([expr], ALL_VAR_NAMES, userFunctions);
    const precomp = compiled[0].fn(ctx);

    expect(precomp).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// 9. Multiple expressions compiled in batch
// ---------------------------------------------------------------------------
describe('Batch pre-compilation', () => {
  it('compiles multiple expressions at once and all match original', () => {
    const expressions = [
      'k1 * ridx0',
      'Vmax * pow(ridx0, n) / (pow(K, n) + pow(ridx0, n))',
      'k2',
      'sqrt(Active_Enzyme) * kcat',
    ];
    const ctx = { ...TEST_PARAMS, ...TEST_OBS, ...EXTRA_CONTEXT };

    const compiled = preCompileFunctionalRates(expressions, ALL_VAR_NAMES);
    expect(compiled).toHaveLength(expressions.length);

    for (let i = 0; i < expressions.length; i++) {
      const original = evalOriginal(expressions[i], TEST_PARAMS, TEST_OBS, undefined, EXTRA_CONTEXT);
      const precomp = compiled[i].fn(ctx);
      expect(precomp).toBe(original);
    }
  });

  it('batch JIT compilation reports correct JIT/AST counts', () => {
    const expressions = [
      'k1 * ridx0',           // JIT-safe
      'if(ridx0, k1, k2)',    // Not JIT-safe (uses BNG if)
      'sqrt(k1) + k2',        // JIT-safe
    ];

    const compiled = preCompileFunctionalRatesWithJIT(
      expressions,
      ALL_VAR_NAMES,
      undefined,
      true
    );
    expect(compiled).toHaveLength(3);

    // First and third should be JIT (if JIT is working)
    // Second should NOT be JIT (uses 'if' which is not in JIT allowlist)
    expect(compiled[1].isJIT).toBe(false);

    // All should have astFn regardless
    for (const entry of compiled) {
      expect(typeof entry.astFn).toBe('function');
    }
  });
});

// ---------------------------------------------------------------------------
// 10. JIT vs AST numerical equivalence across many contexts
// ---------------------------------------------------------------------------
describe('JIT vs AST numerical equivalence across varying contexts', () => {
  it('produces identical results for 100 random contexts', () => {
    const expr = 'k1 * ridx0 * ridx0 / (Km + ridx0) + k2 * Active_Enzyme';

    const compiled = preCompileFunctionalRatesWithJIT(
      [expr],
      ALL_VAR_NAMES,
      undefined,
      true
    );
    const entry = compiled[0];

    if (!entry.isJIT || !entry.jitFn) {
      // If JIT isn't available, skip the comparison but don't fail
      console.warn('JIT not available for this expression; skipping numerical comparison');
      return;
    }

    // Test with 100 different random contexts
    for (let trial = 0; trial < 100; trial++) {
      const ctx: Record<string, number> = {};
      for (const v of ALL_VAR_NAMES) {
        ctx[v] = Math.random() * 100;
      }
      // Ensure Km > 0 to avoid degenerate division
      ctx.Km = Math.random() * 100 + 0.01;

      const astResult = entry.astFn(ctx);
      const jitResult = entry.jitFn(ctx);

      expect(jitResult).toBe(astResult);
    }
  });
});
