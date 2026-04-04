import { describe, it, expect } from 'vitest';
import {
  symConst,
  symVar,
  symAdd,
  symMul,
  symDiv,
  symPow,
  symNeg,
  simplify,
  evaluate,
  differentiate,
  expand,
  exprToString,
  exprToLatex,
  collectTerms,
  factor,
  isPolynomial,
  degree,
  substitute,
  freeVariables,
  type SymExpr,
} from '../../src/services/symbolic/SymbolicExpr';
import {
  symbolicDeterminant,
  symbolicGaussianElimination,
  resultant,
  resultantOfExprs,
  solvePolynomialSystem,
} from '../../src/services/symbolic/PolynomialSolver';
import {
  buildSymbolicODESystem,
  solveSymbolicSteadyState,
  symbolicSensitivity,
  symbolicBifurcationConditions,
} from '../../src/services/symbolic/SymbolicODE';
import type { BNGLReaction } from '../../src/types';

// ──────────────────────────────────────────────────────────────────────────────
// 1. SymbolicExpr tests
// ──────────────────────────────────────────────────────────────────────────────

describe('SymbolicExpr', () => {
  describe('simplify', () => {
    it('should evaluate constant expressions', () => {
      const expr = symAdd(symConst(2), symConst(3));
      const result = simplify(expr);
      expect(result).toEqual(symConst(5));
    });

    it('should remove identity: x + 0 = x', () => {
      const expr = symAdd(symVar('x'), symConst(0));
      const result = simplify(expr);
      expect(evaluate(result, { x: 7 })).toBe(7);
    });

    it('should remove identity: x * 1 = x', () => {
      const expr = symMul(symVar('x'), symConst(1));
      const result = simplify(expr);
      expect(evaluate(result, { x: 5 })).toBe(5);
    });

    it('should evaluate x * 0 = 0', () => {
      const expr = symMul(symVar('x'), symConst(0));
      const result = simplify(expr);
      expect(result).toEqual(symConst(0));
    });

    it('should combine like terms: 2*x + 3*x = 5*x', () => {
      const expr = symAdd(
        symMul(symConst(2), symVar('x')),
        symMul(symConst(3), symVar('x'))
      );
      const result = simplify(expr);
      expect(evaluate(result, { x: 10 })).toBe(50);
    });

    it('should flatten nested additions', () => {
      const expr = symAdd(symAdd(symConst(1), symConst(2)), symConst(3));
      const result = simplify(expr);
      expect(result).toEqual(symConst(6));
    });

    it('should flatten nested multiplications', () => {
      const expr = symMul(symMul(symConst(2), symConst(3)), symConst(4));
      const result = simplify(expr);
      expect(result).toEqual(symConst(24));
    });

    it('should simplify x^1 = x', () => {
      const expr = symPow(symVar('x'), 1);
      const result = simplify(expr);
      expect(evaluate(result, { x: 7 })).toBe(7);
    });

    it('should simplify x^0 = 1', () => {
      const expr = symPow(symVar('x'), 0);
      const result = simplify(expr);
      expect(result).toEqual(symConst(1));
    });

    it('should simplify double negation', () => {
      const expr = symNeg(symNeg(symVar('x')));
      const result = simplify(expr);
      expect(evaluate(result, { x: 42 })).toBe(42);
    });

    it('should simplify x/x = 1', () => {
      const expr = symDiv(symVar('x'), symVar('x'));
      const result = simplify(expr);
      expect(result).toEqual(symConst(1));
    });

    it('should combine like bases in mul: x * x = x^2', () => {
      const expr = symMul(symVar('x'), symVar('x'));
      const result = simplify(expr);
      expect(evaluate(result, { x: 3 })).toBe(9);
    });
  });

  describe('evaluate', () => {
    it('should evaluate complex expressions', () => {
      // (x + 2) * (y - 1) with x=3, y=5
      const expr = symMul(
        symAdd(symVar('x'), symConst(2)),
        symAdd(symVar('y'), symNeg(symConst(1)))
      );
      expect(evaluate(expr, { x: 3, y: 5 })).toBe(20);
    });

    it('should throw on unbound variable', () => {
      expect(() => evaluate(symVar('z'), {})).toThrow('Unbound variable: z');
    });

    it('should evaluate divisions', () => {
      const expr = symDiv(symConst(10), symConst(2));
      expect(evaluate(expr, {})).toBe(5);
    });

    it('should evaluate powers', () => {
      const expr = symPow(symVar('x'), 3);
      expect(evaluate(expr, { x: 2 })).toBe(8);
    });
  });

  describe('differentiate', () => {
    it('should differentiate x^2 + 3*x*y w.r.t. x → 2*x + 3*y', () => {
      // f = x^2 + 3*x*y
      const f = symAdd(
        symPow(symVar('x'), 2),
        symMul(symConst(3), symVar('x'), symVar('y'))
      );
      const df = differentiate(f, 'x');

      // Evaluate at x=1, y=2: should be 2*1 + 3*2 = 8
      expect(evaluate(df, { x: 1, y: 2 })).toBe(8);
      // Evaluate at x=5, y=3: should be 2*5 + 3*3 = 19
      expect(evaluate(df, { x: 5, y: 3 })).toBe(19);
    });

    it('should differentiate constants to 0', () => {
      const df = differentiate(symConst(42), 'x');
      expect(evaluate(df, { x: 999 })).toBe(0);
    });

    it('should differentiate y w.r.t. x to 0', () => {
      const df = differentiate(symVar('y'), 'x');
      expect(evaluate(df, { x: 1, y: 5 })).toBe(0);
    });

    it('should differentiate x w.r.t. x to 1', () => {
      const df = differentiate(symVar('x'), 'x');
      expect(evaluate(df, { x: 99 })).toBe(1);
    });

    it('should differentiate product: d(x*y)/dx = y', () => {
      const df = differentiate(symMul(symVar('x'), symVar('y')), 'x');
      expect(evaluate(df, { x: 10, y: 7 })).toBe(7);
    });

    it('should differentiate quotient: d(x/y)/dx = 1/y', () => {
      const df = differentiate(symDiv(symVar('x'), symVar('y')), 'x');
      expect(evaluate(df, { x: 3, y: 4 })).toBeCloseTo(0.25);
    });

    it('should differentiate power: d(x^3)/dx = 3*x^2', () => {
      const df = differentiate(symPow(symVar('x'), 3), 'x');
      expect(evaluate(df, { x: 2 })).toBe(12);
    });

    it('should differentiate negation: d(-x)/dx = -1', () => {
      const df = differentiate(symNeg(symVar('x')), 'x');
      expect(evaluate(df, { x: 5 })).toBe(-1);
    });
  });

  describe('expand', () => {
    it('should expand (x+1)*(x+2) = x^2 + 3*x + 2', () => {
      const expr = symMul(
        symAdd(symVar('x'), symConst(1)),
        symAdd(symVar('x'), symConst(2))
      );
      const expanded = expand(expr);
      // Evaluate at x=3: (3+1)*(3+2) = 20, and 9+9+2 = 20
      expect(evaluate(expanded, { x: 3 })).toBe(20);
      expect(evaluate(expanded, { x: 0 })).toBe(2);
    });

    it('should expand (x+y)^2 = x^2 + 2*x*y + y^2', () => {
      const expr = symPow(symAdd(symVar('x'), symVar('y')), 2);
      const expanded = expand(expr);
      // At x=2, y=3: (2+3)^2 = 25, and 4 + 12 + 9 = 25
      expect(evaluate(expanded, { x: 2, y: 3 })).toBe(25);
    });
  });

  describe('exprToString and exprToLatex', () => {
    it('should render addition', () => {
      const e = symAdd(symVar('x'), symConst(1));
      const s = exprToString(simplify(e));
      expect(s).toContain('x');
      expect(s).toContain('1');
    });

    it('should render LaTeX fraction', () => {
      const e = symDiv(symVar('x'), symVar('y'));
      const s = exprToLatex(e);
      expect(s).toContain('\\frac');
    });
  });

  describe('collectTerms', () => {
    it('should collect x^2 + 3*x + 2 in x', () => {
      const expr = symAdd(symPow(symVar('x'), 2), symMul(symConst(3), symVar('x')), symConst(2));
      const { coefficients, degree: deg } = collectTerms(expr, 'x');
      expect(deg).toBe(2);
      expect(evaluate(coefficients[0], {})).toBe(2);  // constant term
      expect(evaluate(coefficients[1], {})).toBe(3);  // linear term
      expect(evaluate(coefficients[2], {})).toBe(1);  // quadratic term
    });
  });

  describe('factor', () => {
    it('should factor out common factor: 2*x + 2*y → 2*(x+y)', () => {
      const expr = symAdd(symMul(symConst(2), symVar('x')), symMul(symConst(2), symVar('y')));
      const factored = factor(expr);
      // Should evaluate the same
      expect(evaluate(factored, { x: 3, y: 4 })).toBe(14);
    });
  });

  describe('isPolynomial', () => {
    it('should return true for polynomial expressions', () => {
      const expr = symAdd(symPow(symVar('x'), 2), symMul(symConst(3), symVar('y')));
      expect(isPolynomial(expr, ['x', 'y'])).toBe(true);
    });

    it('should return false for division by variable', () => {
      const expr = symDiv(symConst(1), symVar('x'));
      expect(isPolynomial(expr, ['x'])).toBe(false);
    });
  });

  describe('degree', () => {
    it('should return correct degree', () => {
      const expr = symAdd(symPow(symVar('x'), 3), symMul(symConst(2), symVar('x')));
      expect(degree(expr, 'x')).toBe(3);
    });

    it('should return 0 for absent variable', () => {
      expect(degree(symConst(5), 'x')).toBe(0);
    });
  });

  describe('freeVariables', () => {
    it('should collect all variables', () => {
      const expr = symAdd(symMul(symVar('x'), symVar('y')), symVar('z'));
      const vars = freeVariables(expr);
      expect(vars).toEqual(new Set(['x', 'y', 'z']));
    });
  });

  describe('substitute', () => {
    it('should substitute variable with expression', () => {
      const expr = symAdd(symVar('x'), symVar('y'));
      const result = substitute(expr, 'x', symConst(3));
      expect(evaluate(simplify(result), { y: 2 })).toBe(5);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Gaussian Elimination tests
// ──────────────────────────────────────────────────────────────────────────────

describe('Symbolic Gaussian Elimination', () => {
  it('should solve a 3x3 symbolic linear system', () => {
    // System:
    //   2x + y - z = 8
    //   -3x - y + 2z = -11
    //   -2x + y + 2z = -3
    // Solution: x=2, y=3, z=-1

    const augmented: SymExpr[][] = [
      [symConst(2), symConst(1), symConst(-1), symConst(8)],
      [symConst(-3), symConst(-1), symConst(2), symConst(-11)],
      [symConst(-2), symConst(1), symConst(2), symConst(-3)],
    ];
    const vars = ['x', 'y', 'z'];
    const solution = symbolicGaussianElimination(augmented, vars);

    expect(evaluate(solution.get('x')!, {})).toBeCloseTo(2, 10);
    expect(evaluate(solution.get('y')!, {})).toBeCloseTo(3, 10);
    expect(evaluate(solution.get('z')!, {})).toBeCloseTo(-1, 10);
  });

  it('should solve a 2x2 system with symbolic coefficients', () => {
    // a*x + b*y = c
    // d*x + e*y = f
    // x = (c*e - b*f) / (a*e - b*d)
    const a = symVar('a'), b = symVar('b'), c = symVar('c');
    const d = symVar('d'), e = symVar('e'), f = symVar('f');

    const augmented: SymExpr[][] = [
      [a, b, c],
      [d, e, f],
    ];
    const solution = symbolicGaussianElimination(augmented, ['x', 'y']);

    // Verify with specific values: a=1,b=0,c=5,d=0,e=1,f=3 → x=5,y=3
    const bindings = { a: 1, b: 0, c: 5, d: 0, e: 1, f: 3 };
    expect(evaluate(solution.get('x')!, bindings)).toBeCloseTo(5, 10);
    expect(evaluate(solution.get('y')!, bindings)).toBeCloseTo(3, 10);

    // a=2,b=1,c=5,d=1,e=3,f=7 → 2x+y=5, x+3y=7 → x=8/5,y=9/5
    const bindings2 = { a: 2, b: 1, c: 5, d: 1, e: 3, f: 7 };
    expect(evaluate(solution.get('x')!, bindings2)).toBeCloseTo(8 / 5, 10);
    expect(evaluate(solution.get('y')!, bindings2)).toBeCloseTo(9 / 5, 10);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Resultant tests
// ──────────────────────────────────────────────────────────────────────────────

describe('Resultant', () => {
  it('should compute resultant of two univariate polynomials', () => {
    // f(x) = x^2 - 1 = (x-1)(x+1), coeffs: [-1, 0, 1]
    // g(x) = x - 1, coeffs: [-1, 1]
    // Resultant = f(1) = 0 (they share root x=1)
    const f = [symConst(-1), symConst(0), symConst(1)];
    const g = [symConst(-1), symConst(1)];
    const res = resultant(f, g);
    expect(evaluate(simplify(res), {})).toBeCloseTo(0, 10);
  });

  it('should compute non-zero resultant when polynomials share no roots', () => {
    // f(x) = x - 1, coeffs: [-1, 1]
    // g(x) = x - 2, coeffs: [-2, 1]
    // Resultant = f(2) = 1 (or g(1) = -1, up to sign)
    const f = [symConst(-1), symConst(1)];
    const g = [symConst(-2), symConst(1)];
    const res = resultant(f, g);
    const val = evaluate(simplify(res), {});
    // Resultant of (x-1) and (x-2) is 1 or -1
    expect(Math.abs(val)).toBeCloseTo(1, 10);
  });

  it('should compute resultant of (x^2 + y - 1) and (x + y^2 - 1) in x', () => {
    // f(x) = x^2 + (y-1), g(x) = x + (y^2-1)
    // Resultant eliminates x, leaving a polynomial in y.
    const fExpr = symAdd(symPow(symVar('x'), 2), symVar('y'), symConst(-1));
    const gExpr = symAdd(symVar('x'), symPow(symVar('y'), 2), symConst(-1));

    const res = resultantOfExprs(fExpr, gExpr, 'x');
    const simplified = simplify(res);

    // At y=0: f(x)=x^2-1, g(x)=x-1. Resultant should be 0 (shared root x=1)
    expect(evaluate(simplified, { y: 0 })).toBeCloseTo(0, 8);

    // At y=1: f(x)=x^2, g(x)=x. Resultant should be 0 (shared root x=0)
    expect(evaluate(simplified, { y: 1 })).toBeCloseTo(0, 8);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Symbolic Determinant tests
// ──────────────────────────────────────────────────────────────────────────────

describe('Symbolic Determinant', () => {
  it('should compute 2x2 determinant', () => {
    const M: SymExpr[][] = [
      [symConst(1), symConst(2)],
      [symConst(3), symConst(4)],
    ];
    const det = symbolicDeterminant(M);
    expect(evaluate(det, {})).toBe(-2);
  });

  it('should compute 3x3 determinant', () => {
    const M: SymExpr[][] = [
      [symConst(6), symConst(1), symConst(1)],
      [symConst(4), symConst(-2), symConst(5)],
      [symConst(2), symConst(8), symConst(7)],
    ];
    const det = symbolicDeterminant(M);
    // det = 6(-14-40) -1(28-10) +1(32+4) = 6(-54) -18 +36 = -324-18+36 = -306
    expect(evaluate(det, {})).toBeCloseTo(-306, 8);
  });

  it('should compute symbolic determinant', () => {
    const M: SymExpr[][] = [
      [symVar('a'), symVar('b')],
      [symVar('c'), symVar('d')],
    ];
    const det = symbolicDeterminant(M);
    // a*d - b*c
    expect(evaluate(det, { a: 3, b: 2, c: 1, d: 4 })).toBeCloseTo(10, 8);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. End-to-end: A ⇌ B steady state
// ──────────────────────────────────────────────────────────────────────────────

describe('A ⇌ B Symbolic Steady State', () => {
  it('should compute correct steady state for reversible reaction', () => {
    // A → B with rate kf*[A]
    // B → A with rate kr*[B]
    // Conservation: [A] + [B] = total
    // Steady state: kf*[A] = kr*[B]
    // [A]* = kr*total/(kf+kr), [B]* = kf*total/(kf+kr)

    const speciesNames = ['A', 'B'];
    const reactions: BNGLReaction[] = [
      {
        reactants: ['A'],
        products: ['B'],
        rate: 'kf',
        rateConstant: 0.1,
        name: 'fwd',
      },
      {
        reactants: ['B'],
        products: ['A'],
        rate: 'kr',
        rateConstant: 0.05,
        name: 'rev',
      },
    ];
    const parameterNames = ['kf', 'kr'];
    const initialConcentrations = [1.0, 0.0]; // total = 1.0

    const system = buildSymbolicODESystem(
      speciesNames,
      reactions,
      parameterNames,
      initialConcentrations
    );

    // Verify RHS structure
    expect(system.rhs.length).toBe(2);
    expect(system.conservationLaws.length).toBeGreaterThanOrEqual(1);

    // Check conservation law: [A] + [B] = 1
    const law = system.conservationLaws[0];
    expect(law.coefficients[0]).toBeCloseTo(1, 10);
    expect(law.coefficients[1]).toBeCloseTo(1, 10);
    expect(law.total).toBeCloseTo(1, 10);

    // Solve steady state
    const ss = solveSymbolicSteadyState(system);

    // Verify with specific parameter values
    const kf = 0.1;
    const kr = 0.05;
    const total = 1.0;
    const expectedA = kr * total / (kf + kr); // 0.05/0.15 = 1/3
    const expectedB = kf * total / (kf + kr); // 0.1/0.15 = 2/3

    const aExpr = ss.values.get('A')!;
    const bExpr = ss.values.get('B')!;

    const aVal = evaluate(aExpr, { kf, kr });
    const bVal = evaluate(bExpr, { kf, kr });

    expect(aVal).toBeCloseTo(expectedA, 8);
    expect(bVal).toBeCloseTo(expectedB, 8);

    // Verify conservation: A + B = total
    expect(aVal + bVal).toBeCloseTo(total, 10);
  });

  it('should handle different initial concentrations', () => {
    const speciesNames = ['A', 'B'];
    const reactions: BNGLReaction[] = [
      { reactants: ['A'], products: ['B'], rate: 'kf', rateConstant: 0.3, name: 'fwd' },
      { reactants: ['B'], products: ['A'], rate: 'kr', rateConstant: 0.7, name: 'rev' },
    ];
    const parameterNames = ['kf', 'kr'];
    const initialConcentrations = [5.0, 3.0]; // total = 8.0

    const system = buildSymbolicODESystem(speciesNames, reactions, parameterNames, initialConcentrations);
    const ss = solveSymbolicSteadyState(system);

    const kf = 0.3, kr = 0.7, total = 8.0;
    const expectedA = kr * total / (kf + kr);
    const expectedB = kf * total / (kf + kr);

    const aVal = evaluate(ss.values.get('A')!, { kf, kr });
    const bVal = evaluate(ss.values.get('B')!, { kf, kr });

    expect(aVal).toBeCloseTo(expectedA, 8);
    expect(bVal).toBeCloseTo(expectedB, 8);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. Sensitivity: symbolic vs numerical finite-difference
// ──────────────────────────────────────────────────────────────────────────────

describe('Symbolic Sensitivity', () => {
  it('should match numerical finite-difference for A ⇌ B', () => {
    const speciesNames = ['A', 'B'];
    const reactions: BNGLReaction[] = [
      { reactants: ['A'], products: ['B'], rate: 'kf', rateConstant: 0.1, name: 'fwd' },
      { reactants: ['B'], products: ['A'], rate: 'kr', rateConstant: 0.05, name: 'rev' },
    ];
    const parameterNames = ['kf', 'kr'];
    const initialConcentrations = [1.0, 0.0];

    const system = buildSymbolicODESystem(speciesNames, reactions, parameterNames, initialConcentrations);
    const ss = solveSymbolicSteadyState(system);

    const sens = symbolicSensitivity(system, ss, ['kf', 'kr']);

    const kf = 0.1, kr = 0.05;
    const total = 1.0;

    // Analytical: A* = kr/(kf+kr), B* = kf/(kf+kr) (for total=1)
    // ∂A*/∂kf = -kr / (kf+kr)^2
    // ∂A*/∂kr = kf / (kf+kr)^2
    const expectedDAdkf = -kr * total / ((kf + kr) * (kf + kr));
    const expectedDAdkr = kf * total / ((kf + kr) * (kf + kr));

    // Get symbolic sensitivity values
    const dA_dkf_expr = sens.sensitivities.get('kf')?.get('A');
    const dA_dkr_expr = sens.sensitivities.get('kr')?.get('A');

    if (dA_dkf_expr && dA_dkr_expr) {
      const dAdkf = evaluate(dA_dkf_expr, { kf, kr });
      const dAdkr = evaluate(dA_dkr_expr, { kf, kr });

      expect(dAdkf).toBeCloseTo(expectedDAdkf, 4);
      expect(dAdkr).toBeCloseTo(expectedDAdkr, 4);
    }

    // Numerical finite-difference verification
    const eps = 1e-6;

    // Perturb kf
    const aAtKf = evaluate(ss.values.get('A')!, { kf, kr });
    const aAtKfPlus = evaluate(ss.values.get('A')!, { kf: kf + eps, kr });
    const numDAdkf = (aAtKfPlus - aAtKf) / eps;

    // Perturb kr
    const aAtKr = evaluate(ss.values.get('A')!, { kf, kr });
    const aAtKrPlus = evaluate(ss.values.get('A')!, { kf, kr: kr + eps });
    const numDAdkr = (aAtKrPlus - aAtKr) / eps;

    expect(numDAdkf).toBeCloseTo(expectedDAdkf, 3);
    expect(numDAdkr).toBeCloseTo(expectedDAdkr, 3);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. Bifurcation conditions
// ──────────────────────────────────────────────────────────────────────────────

describe('Bifurcation Conditions', () => {
  it('should compute Jacobian and determinant condition for A ⇌ B', () => {
    const speciesNames = ['A', 'B'];
    const reactions: BNGLReaction[] = [
      { reactants: ['A'], products: ['B'], rate: 'kf', rateConstant: 0.1, name: 'fwd' },
      { reactants: ['B'], products: ['A'], rate: 'kr', rateConstant: 0.05, name: 'rev' },
    ];
    const parameterNames = ['kf', 'kr'];
    const initialConcentrations = [1.0, 0.0];

    const system = buildSymbolicODESystem(speciesNames, reactions, parameterNames, initialConcentrations);
    const ss = solveSymbolicSteadyState(system);
    const bif = symbolicBifurcationConditions(system, ss);

    // For A ⇌ B:
    // J = [[-kf, kr], [kf, -kr]]
    // det(J) = kf*kr - kf*kr = 0 (always singular due to conservation law!)
    expect(bif.jacobian.length).toBe(2);
    expect(bif.jacobian[0].length).toBe(2);

    // det should be 0 for any kf, kr (singular due to conservation law)
    const detVal = evaluate(bif.determinantCondition, { kf: 0.1, kr: 0.05 });
    expect(detVal).toBeCloseTo(0, 8);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 8. Polynomial Solver
// ──────────────────────────────────────────────────────────────────────────────

describe('Polynomial Solver', () => {
  it('should solve linear univariate system', () => {
    // 2x - 6 = 0 → x = 3
    const eq = symAdd(symMul(symConst(2), symVar('x')), symConst(-6));
    const solutions = solvePolynomialSystem([eq], ['x']);
    expect(solutions.length).toBeGreaterThan(0);
    expect(evaluate(solutions[0].values.get('x')!, {})).toBeCloseTo(3, 10);
  });

  it('should solve quadratic system', () => {
    // x^2 - 5x + 6 = 0 → x = 2 or x = 3
    const eq = symAdd(symPow(symVar('x'), 2), symMul(symConst(-5), symVar('x')), symConst(6));
    const solutions = solvePolynomialSystem([eq], ['x']);
    expect(solutions.length).toBe(2);
    const vals = solutions.map(s => evaluate(s.values.get('x')!, {})).sort((a, b) => a - b);
    expect(vals[0]).toBeCloseTo(2, 8);
    expect(vals[1]).toBeCloseTo(3, 8);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 9. ODE system building
// ──────────────────────────────────────────────────────────────────────────────

describe('ODE System Building', () => {
  it('should build correct stoichiometry matrix', () => {
    const speciesNames = ['A', 'B', 'C'];
    const reactions: BNGLReaction[] = [
      { reactants: ['A', 'B'], products: ['C'], rate: 'k1', rateConstant: 0.01, name: 'binding' },
      { reactants: ['C'], products: ['A', 'B'], rate: 'k2', rateConstant: 0.1, name: 'unbinding' },
    ];
    const parameterNames = ['k1', 'k2'];
    const initialConcentrations = [1.0, 1.0, 0.0];

    const system = buildSymbolicODESystem(speciesNames, reactions, parameterNames, initialConcentrations);

    // Stoichiometry:
    // Reaction 0 (A+B→C): A: -1, B: -1, C: +1
    // Reaction 1 (C→A+B): A: +1, B: +1, C: -1
    expect(system.stoichiometryMatrix[0]).toEqual([-1, 1]); // A
    expect(system.stoichiometryMatrix[1]).toEqual([-1, 1]); // B
    expect(system.stoichiometryMatrix[2]).toEqual([1, -1]);  // C
  });

  it('should detect conservation laws in A + B ⇌ C system', () => {
    const speciesNames = ['A', 'B', 'C'];
    const reactions: BNGLReaction[] = [
      { reactants: ['A', 'B'], products: ['C'], rate: 'k1', rateConstant: 0.01, name: 'binding' },
      { reactants: ['C'], products: ['A', 'B'], rate: 'k2', rateConstant: 0.1, name: 'unbinding' },
    ];
    const parameterNames = ['k1', 'k2'];
    const initialConcentrations = [1.0, 1.0, 0.0];

    const system = buildSymbolicODESystem(speciesNames, reactions, parameterNames, initialConcentrations);

    // Should find conservation laws: [A]+[C]=const, [B]+[C]=const
    expect(system.conservationLaws.length).toBeGreaterThanOrEqual(1);
  });

  it('should evaluate RHS correctly at a given point', () => {
    const speciesNames = ['A', 'B'];
    const reactions: BNGLReaction[] = [
      { reactants: ['A'], products: ['B'], rate: 'kf', rateConstant: 0.1, name: 'fwd' },
    ];
    const parameterNames = ['kf'];
    const initialConcentrations = [1.0, 0.0];

    const system = buildSymbolicODESystem(speciesNames, reactions, parameterNames, initialConcentrations);

    // d[A]/dt = -kf*[A], d[B]/dt = kf*[A]
    const bindings = { A: 2.0, B: 0.5, kf: 0.3 };
    expect(evaluate(system.rhs[0], bindings)).toBeCloseTo(-0.6, 10); // -0.3*2
    expect(evaluate(system.rhs[1], bindings)).toBeCloseTo(0.6, 10);  // 0.3*2
  });
});
