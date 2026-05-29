/**
 * PolynomialSolver.ts — Polynomial system solving via resultants, Gaussian
 * elimination, and Bareiss fraction-free determinant.
 */

import {
  type SymExpr,
  symConst,
  symAdd,
  symMul,
  symNeg,
  symDiv,
  symPow,
  simplify,
  evaluate,
  collectTerms,
  substitute,
  freeVariables,
} from './SymbolicExpr';

// ─── Symbolic Determinant (Bareiss fraction-free) ────────────────────────────

/**
 * Compute the determinant of a square matrix of symbolic expressions using the
 * Bareiss algorithm (fraction-free Gaussian elimination).
 */
export function symbolicDeterminant(matrix: SymExpr[][]): SymExpr {
  const n = matrix.length;
  if (n === 0) return symConst(1);
  if (n === 1) return matrix[0][0];
  if (n === 2) {
    return simplify(
      symAdd(
        symMul(matrix[0][0], matrix[1][1]),
        symNeg(symMul(matrix[0][1], matrix[1][0]))
      )
    );
  }

  // Deep-clone the matrix
  const M: SymExpr[][] = matrix.map(row => [...row]);
  let sign = 1;

  // Bareiss algorithm
  for (let k = 0; k < n - 1; k++) {
    // Partial pivoting: find non-zero pivot
    let pivotRow = -1;
    for (let i = k; i < n; i++) {
      if (!_isZeroExpr(M[i][k])) {
        pivotRow = i;
        break;
      }
    }
    if (pivotRow === -1) return symConst(0); // singular

    if (pivotRow !== k) {
      [M[k], M[pivotRow]] = [M[pivotRow], M[k]];
      sign *= -1;
    }

    const pivot = M[k][k];
    const prevPivot = k > 0 ? M[k - 1][k - 1] : symConst(1);

    for (let i = k + 1; i < n; i++) {
      for (let j = k + 1; j < n; j++) {
        // Bareiss: M[i][j] = (M[k][k]*M[i][j] - M[i][k]*M[k][j]) / prevPivot
        const numerator = simplify(
          symAdd(
            symMul(pivot, M[i][j]),
            symNeg(symMul(M[i][k], M[k][j]))
          )
        );
        if (k > 0) {
          M[i][j] = simplify(symDiv(numerator, prevPivot));
        } else {
          M[i][j] = numerator;
        }
      }
      // Zero out below pivot (not strictly needed but keeps things clean)
      M[i][k] = symConst(0);
    }
  }

  const det = M[n - 1][n - 1];
  return sign === -1 ? simplify(symNeg(det)) : simplify(det);
}

function _isZeroExpr(e: SymExpr): boolean {
  const s = simplify(e);
  return s.kind === 'const' && s.value === 0;
}

// ─── Resultant via Sylvester matrix ──────────────────────────────────────────

/**
 * Compute the resultant of two univariate polynomials f and g in a given variable.
 * The resultant is the determinant of the Sylvester matrix.
 *
 * @param f Polynomial coefficients [c0, c1, ..., cm] (degree m, f = c0 + c1*x + ... + cm*x^m)
 * @param g Polynomial coefficients [c0, c1, ..., cn] (degree n)
 * @returns The resultant as a SymExpr
 */
export function resultant(
  f: SymExpr[],
  g: SymExpr[]
): SymExpr {
  // Trim trailing zero coefficients
  while (f.length > 1 && _isZeroExpr(f[f.length - 1])) f = f.slice(0, -1);
  while (g.length > 1 && _isZeroExpr(g[g.length - 1])) g = g.slice(0, -1);

  const m = f.length - 1; // degree of f
  const n = g.length - 1; // degree of g

  if (m === 0 && n === 0) return symConst(1);
  if (m === 0) return simplify(symPow(f[0], n));
  if (n === 0) return simplify(symPow(g[0], m));

  const size = m + n;
  // Build Sylvester matrix (size x size)
  // Rows 0..n-1: coefficients of f shifted
  // Rows n..n+m-1: coefficients of g shifted
  const S: SymExpr[][] = [];
  for (let i = 0; i < size; i++) {
    const row: SymExpr[] = new Array(size).fill(null).map(() => symConst(0));
    S.push(row);
  }

  // n rows for f (one per x^(n-1), x^(n-2), ..., x^0 factor)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= m; j++) {
      S[i][i + j] = f[m - j]; // leading coefficient first
    }
  }

  // m rows for g
  for (let i = 0; i < m; i++) {
    for (let j = 0; j <= n; j++) {
      S[n + i][i + j] = g[n - j]; // leading coefficient first
    }
  }

  return symbolicDeterminant(S);
}

/**
 * Convenience: compute resultant of two polynomial expressions in a given variable.
 */
export function resultantOfExprs(
  fExpr: SymExpr,
  gExpr: SymExpr,
  varName: string
): SymExpr {
  const fColl = collectTerms(fExpr, varName);
  const gColl = collectTerms(gExpr, varName);
  return resultant(fColl.coefficients, gColl.coefficients);
}

// ─── Symbolic Gaussian Elimination ───────────────────────────────────────────

/**
 * Solve a symbolic linear system A*x = b using Gaussian elimination with
 * back-substitution. Returns the solution as a map from variable name to SymExpr.
 *
 * @param matrix  Augmented matrix [A | b], size n x (n+1), entries are SymExpr.
 * @param variables  Variable names, length n.
 */
export function symbolicGaussianElimination(
  matrix: SymExpr[][],
  variables: string[]
): Map<string, SymExpr> {
  const n = variables.length;
  // Deep clone
  const M: SymExpr[][] = matrix.map(row => row.map(e => e));

  // Forward elimination
  for (let col = 0; col < n; col++) {
    // Find pivot
    let pivotRow = -1;
    for (let row = col; row < n; row++) {
      if (!_isZeroExpr(M[row][col])) {
        pivotRow = row;
        break;
      }
    }
    if (pivotRow === -1) {
      // Singular — skip this column (under-determined)
      continue;
    }
    if (pivotRow !== col) {
      [M[col], M[pivotRow]] = [M[pivotRow], M[col]];
    }

    const pivot = M[col][col];
    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      if (_isZeroExpr(M[row][col])) continue;
      const factor = M[row][col];
      for (let j = col; j <= n; j++) {
        // M[row][j] = M[row][j]*pivot - factor*M[col][j]
        M[row][j] = simplify(
          symAdd(
            symMul(M[row][j], pivot),
            symNeg(symMul(factor, M[col][j]))
          )
        );
      }
    }
  }

  // Back substitution
  const solution = new Map<string, SymExpr>();
  for (let row = n - 1; row >= 0; row--) {
    if (_isZeroExpr(M[row][row])) {
      solution.set(variables[row], symConst(0));
      continue;
    }
    let rhs = M[row][n];
    for (let col = row + 1; col < n; col++) {
      const val = solution.get(variables[col]);
      if (val) {
        rhs = simplify(
          symAdd(rhs, symNeg(symMul(M[row][col], val)))
        );
      }
    }
    solution.set(variables[row], simplify(symDiv(rhs, M[row][row])));
  }

  return solution;
}

// ─── Polynomial System Solver (via sequential elimination) ───────────────────

export interface PolynomialSolution {
  values: Map<string, SymExpr>;
  isExact: boolean;
}

/**
 * Solve a system of polynomial equations by sequential elimination using
 * resultants. Works for small systems (<=5 variables).
 *
 * Strategy:
 * 1. Pick a variable to eliminate.
 * 2. Compute pairwise resultants of equations w.r.t. that variable.
 * 3. Recurse on the reduced system.
 * 4. Back-substitute to find eliminated variables.
 *
 * Falls back to numeric approximation for difficult cases.
 */
export function solvePolynomialSystem(
  equations: SymExpr[],
  variables: string[]
): PolynomialSolution[] {
  if (variables.length === 0) {
    // Check if all equations are zero
    const allZero = equations.every(eq => _isZeroExpr(simplify(eq)));
    if (allZero) return [{ values: new Map(), isExact: true }];
    return [];
  }

  if (variables.length === 1) {
    return _solveUnivariate(equations, variables[0]);
  }

  // Eliminate last variable via resultants
  const elimVar = variables[variables.length - 1];
  const remainingVars = variables.slice(0, -1);

  // Compute resultants pairwise
  const newEquations: SymExpr[] = [];
  for (let i = 0; i < equations.length; i++) {
    for (let j = i + 1; j < equations.length; j++) {
      const res = resultantOfExprs(equations[i], equations[j], elimVar);
      const simplified = simplify(res);
      if (!_isZeroExpr(simplified)) {
        newEquations.push(simplified);
      }
    }
  }

  if (newEquations.length === 0) {
    // The variable may be free; set to 0 and solve the rest
    const reduced = equations.map(eq => simplify(substitute(eq, elimVar, symConst(0))));
    const subSolutions = solvePolynomialSystem(reduced, remainingVars);
    return subSolutions.map(sol => {
      sol.values.set(elimVar, symConst(0));
      return sol;
    });
  }

  // Recurse
  const subSolutions = solvePolynomialSystem(newEquations, remainingVars);

  // Back-substitute to find the eliminated variable
  const fullSolutions: PolynomialSolution[] = [];
  for (const subSol of subSolutions) {
    // Substitute known values into original equations
    let bestEq: SymExpr | null = null;
    let bestDeg = Infinity;
    for (const eq of equations) {
      let substEq = eq;
      for (const [v, val] of subSol.values) {
        substEq = substitute(substEq, v, val);
      }
      substEq = simplify(substEq);
      const coll = collectTerms(substEq, elimVar);
      if (coll.degree < bestDeg && coll.degree > 0) {
        bestDeg = coll.degree;
        bestEq = substEq;
      }
    }

    if (bestEq !== null) {
      const univSols = _solveUnivariate([bestEq], elimVar);
      for (const uSol of univSols) {
        const combined = new Map(subSol.values);
        const val = uSol.values.get(elimVar);
        if (val) combined.set(elimVar, val);
        fullSolutions.push({ values: combined, isExact: subSol.isExact && uSol.isExact });
      }
    } else {
      subSol.values.set(elimVar, symConst(0));
      fullSolutions.push(subSol);
    }
  }

  return fullSolutions;
}

function _solveUnivariate(equations: SymExpr[], varName: string): PolynomialSolution[] {
  // Find the simplest non-trivial equation
  let bestEq: SymExpr | null = null;
  let bestDeg = Infinity;
  for (const eq of equations) {
    const coll = collectTerms(eq, varName);
    if (coll.degree > 0 && coll.degree < bestDeg) {
      bestDeg = coll.degree;
      bestEq = eq;
    }
  }

  if (!bestEq) return [];

  const { coefficients } = collectTerms(bestEq, varName);

  if (bestDeg === 1) {
    // Linear: c0 + c1*x = 0 → x = -c0/c1
    const sol = simplify(symDiv(symNeg(coefficients[0]), coefficients[1]));
    return [{ values: new Map([[varName, sol]]), isExact: true }];
  }

  if (bestDeg === 2) {
    // Quadratic: c0 + c1*x + c2*x^2 = 0
    // x = (-c1 ± sqrt(c1^2 - 4*c0*c2)) / (2*c2)
    // For symbolic: try to evaluate discriminant; if perfect square, exact
    const c0 = coefficients[0];
    const c1 = coefficients[1];
    const c2 = coefficients[2];
    const disc = simplify(
      symAdd(symPow(c1, 2), symNeg(symMul(symConst(4), c0, c2)))
    );

    // Try numeric evaluation
    const allVars = freeVariables(disc);
    if (allVars.size === 0) {
      const discVal = evaluate(disc, {});
      if (discVal >= 0) {
        const sqrtDisc = Math.sqrt(discVal);
        // Two solutions
        const sol1 = simplify(
          symDiv(symAdd(symNeg(c1), symConst(sqrtDisc)), symMul(symConst(2), c2))
        );
        const sol2 = simplify(
          symDiv(symAdd(symNeg(c1), symConst(-sqrtDisc)), symMul(symConst(2), c2))
        );
        const solutions: PolynomialSolution[] = [
          { values: new Map([[varName, sol1]]), isExact: Number.isInteger(sqrtDisc) },
        ];
        if (Math.abs(sqrtDisc) > 1e-12) {
          solutions.push({ values: new Map([[varName, sol2]]), isExact: Number.isInteger(sqrtDisc) });
        }
        return solutions;
      }
      return []; // No real solutions
    }

    // Symbolic quadratic: return symbolic formula
    const sol = simplify(
      symDiv(symNeg(c1), symMul(symConst(2), c2))
    );
    return [{ values: new Map([[varName, sol]]), isExact: false }];
  }

  // Higher degree: try numeric root finding on constant-coefficient polynomials
  const allVars = new Set<string>();
  for (const c of coefficients) {
    for (const v of freeVariables(c)) allVars.add(v);
  }

  if (allVars.size === 0) {
    // Pure numeric polynomial — use companion matrix / Durand-Kerner
    const numCoeffs = coefficients.map(c => evaluate(c, {}));
    const roots = _numericPolyRoots(numCoeffs);
    return roots.map(r => ({
      values: new Map([[varName, symConst(r)]]),
      isExact: false,
    }));
  }

  // Cannot solve symbolically for degree > 2 with symbolic coefficients
  return [{ values: new Map([[varName, symConst(0)]]), isExact: false }];
}

/**
 * Find real roots of a polynomial with numeric coefficients using
 * Durand-Kerner (Weierstrass) iteration.
 * coeffs = [c0, c1, ..., cn]  where p(x) = c0 + c1*x + ... + cn*x^n
 */
function _numericPolyRoots(coeffs: number[]): number[] {
  const n = coeffs.length - 1;
  if (n <= 0) return [];

  const an = coeffs[n];
  // Normalize
  const c = coeffs.map(v => v / an);

  if (n === 1) return [-c[0]];
  if (n === 2) {
    const disc = c[1] * c[1] - 4 * c[0];
    if (disc < 0) return [];
    const sq = Math.sqrt(disc);
    return [(-c[1] + sq) / 2, (-c[1] - sq) / 2];
  }

  // Durand-Kerner method
  const maxIter = 200;
  const tol = 1e-12;

  // Initial guesses spread on a circle
  const radius = 1 + Math.max(...c.map(Math.abs));
  const zr: number[] = [];
  const zi: number[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n + 0.4;
    zr[i] = radius * Math.cos(angle);
    zi[i] = radius * Math.sin(angle);
  }

  for (let iter = 0; iter < maxIter; iter++) {
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      // Evaluate p(z_i)
      let pr = c[0], pi2 = 0;
      let zrPow = 1, ziPow = 0;
      for (let k = 1; k <= n; k++) {
        const newZr = zrPow * zr[i] - ziPow * zi[i];
        const newZi = zrPow * zi[i] + ziPow * zr[i];
        zrPow = newZr;
        ziPow = newZi;
        pr += c[k] * zrPow - 0 * ziPow; // c[k] is real
        pi2 += c[k] * ziPow;
      }

      // Product of (z_i - z_j) for j != i
      let dr = 1, di = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const diffR = zr[i] - zr[j];
        const diffI = zi[i] - zi[j];
        const newDr = dr * diffR - di * diffI;
        const newDi = dr * diffI + di * diffR;
        dr = newDr;
        di = newDi;
      }

      // delta = p(z_i) / prod(z_i - z_j)
      const denom = dr * dr + di * di;
      if (denom < 1e-30) continue;
      const deltaR = (pr * dr + pi2 * di) / denom;
      const deltaI = (pi2 * dr - pr * di) / denom;

      zr[i] -= deltaR;
      zi[i] -= deltaI;
      maxDelta = Math.max(maxDelta, Math.abs(deltaR) + Math.abs(deltaI));
    }
    if (maxDelta < tol) break;
  }

  // Collect real roots (imaginary part ~ 0)
  const realRoots: number[] = [];
  for (let i = 0; i < n; i++) {
    if (Math.abs(zi[i]) < 1e-8) {
      realRoots.push(zr[i]);
    }
  }
  return realRoots;
}
