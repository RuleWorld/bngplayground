/**
 * SymbolicODE.ts — Build symbolic ODE systems from BioNetGen expanded reaction
 * networks, solve for steady state symbolically, compute symbolic sensitivity
 * and bifurcation conditions.
 */

import type { BNGLReaction } from '../../types';
import {
  type SymExpr,
  symConst,
  symVar,
  symAdd,
  symMul,
  symNeg,
  symDiv,
  symPow,
  simplify,
  evaluate,
  expand,
  differentiate,
  substitute,
  freeVariables,
  collectTerms,
} from './SymbolicExpr';
import {
  symbolicGaussianElimination,
  symbolicDeterminant,
  solvePolynomialSystem,
} from './PolynomialSolver';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SymbolicODESystem {
  /** Species variable names */
  speciesNames: string[];
  /** Parameter names (rate constants) */
  parameterNames: string[];
  /** Parameter numeric values (for numeric fallback solver) */
  parameterValues?: number[];
  /** Initial concentrations for each species */
  initialConcentrations: number[];
  /** RHS of dy_i/dt = f_i(y, k) for each species */
  rhs: SymExpr[];
  /** Stoichiometry matrix: stoich[species][reaction] */
  stoichiometryMatrix: number[][];
  /** Rate expressions for each reaction */
  rateExpressions: SymExpr[];
  /** Conservation laws: each law is { coefficients, total } where sum(coeff_i * y_i) = total */
  conservationLaws: { coefficients: number[]; total: number }[];
}

export interface SymbolicSteadyState {
  /** Maps species name → steady-state expression in terms of parameters */
  values: Map<string, SymExpr>;
  /** Whether the solution is exact (symbolic) or approximate (numeric) */
  isExact: boolean;
  /** Conservation law constraints used */
  conservationLaws: { coefficients: number[]; total: number }[];
}

export interface SymbolicSensitivityResult {
  /** ∂y*_i / ∂k_j as symbolic expressions */
  sensitivities: Map<string, Map<string, SymExpr>>;
}

export interface BifurcationConditions {
  /** det(J) = 0 expressed symbolically */
  determinantCondition: SymExpr;
  /** Jacobian matrix at steady state */
  jacobian: SymExpr[][];
}

// ─── Build Symbolic ODE System ───────────────────────────────────────────────

/**
 * Build a symbolic ODE system from the expanded reaction network.
 *
 * For each reaction r with reactants and products, the mass-action rate is:
 *   rate_r = k_r * product(y[reactant_i])
 *
 * The RHS for species i is:
 *   dy_i/dt = sum_r stoich(i, r) * rate_r
 */
export function buildSymbolicODESystem(
  speciesNames: string[],
  reactions: BNGLReaction[],
  parameterNames: string[],
  initialConcentrations: number[],
  parameterValues?: number[],
): SymbolicODESystem {
  const nSpecies = speciesNames.length;
  const nReactions = reactions.length;

  // Build species index
  const speciesIndex = new Map<string, number>();
  for (let i = 0; i < nSpecies; i++) {
    speciesIndex.set(speciesNames[i], i);
  }

  // Build stoichiometry matrix
  const stoich: number[][] = Array.from({ length: nSpecies }, () =>
    new Array(nReactions).fill(0)
  );

  for (let r = 0; r < nReactions; r++) {
    const rxn = reactions[r];

    // Count reactant stoichiometries
    const reactantCounts = new Map<string, number>();
    for (const sp of rxn.reactants) {
      if (sp === '0' || sp === 'Null' || sp === 'Trash' || sp === '') continue;
      reactantCounts.set(sp, (reactantCounts.get(sp) || 0) + 1);
    }

    // Count product stoichiometries
    const productCounts = new Map<string, number>();
    for (let pi = 0; pi < rxn.products.length; pi++) {
      const sp = rxn.products[pi];
      if (sp === '0' || sp === 'Null' || sp === 'Trash' || sp === '') continue;
      const stoichVal = rxn.productStoichiometries?.[pi] ?? 1;
      productCounts.set(sp, (productCounts.get(sp) || 0) + stoichVal);
    }

    // Net stoichiometry for each species
    const allSpeciesInRxn = new Set([...reactantCounts.keys(), ...productCounts.keys()]);
    for (const sp of allSpeciesInRxn) {
      const idx = speciesIndex.get(sp);
      if (idx === undefined) continue;
      const produced = productCounts.get(sp) || 0;
      const consumed = reactantCounts.get(sp) || 0;
      stoich[idx][r] = produced - consumed;
    }
  }

  // Build rate expressions (mass action)
  const rateExpressions: SymExpr[] = [];
  for (let r = 0; r < nReactions; r++) {
    const rxn = reactions[r];
    // Rate constant: use the rate string as parameter name if it's in parameterNames,
    // otherwise use the numeric rateConstant
    let kExpr: SymExpr;
    if (parameterNames.includes(rxn.rate)) {
      kExpr = symVar(rxn.rate);
    } else {
      kExpr = symConst(rxn.rateConstant);
    }

    // Mass action: k * prod(y_i^s_i) for each reactant
    const factors: SymExpr[] = [kExpr];
    const reactantCounts = new Map<string, number>();
    for (const sp of rxn.reactants) {
      if (sp === '0' || sp === 'Null' || sp === 'Trash' || sp === '') continue;
      reactantCounts.set(sp, (reactantCounts.get(sp) || 0) + 1);
    }
    for (const [sp, count] of reactantCounts) {
      const idx = speciesIndex.get(sp);
      if (idx === undefined) continue;
      if (count === 1) {
        factors.push(symVar(sp));
      } else {
        factors.push(symPow(symVar(sp), count));
      }
    }

    rateExpressions.push(factors.length === 1 ? factors[0] : symMul(...factors));
  }

  // Build RHS: dy_i/dt = sum_r stoich[i][r] * rate[r]
  const rhs: SymExpr[] = [];
  for (let i = 0; i < nSpecies; i++) {
    const terms: SymExpr[] = [];
    for (let r = 0; r < nReactions; r++) {
      if (stoich[i][r] === 0) continue;
      const coeff = stoich[i][r];
      if (coeff === 1) {
        terms.push(rateExpressions[r]);
      } else if (coeff === -1) {
        terms.push(symNeg(rateExpressions[r]));
      } else {
        terms.push(symMul(symConst(coeff), rateExpressions[r]));
      }
    }
    rhs.push(terms.length === 0 ? symConst(0) : simplify(symAdd(...terms)));
  }

  // Find conservation laws (left null space of stoichiometry matrix)
  const conservationLaws = _findConservationLaws(stoich, initialConcentrations);

  return {
    speciesNames,
    parameterNames,
    parameterValues,
    initialConcentrations,
    rhs,
    stoichiometryMatrix: stoich,
    rateExpressions,
    conservationLaws,
  };
}

/**
 * Find conservation laws by computing the left null space of the stoichiometry
 * matrix using row reduction.
 *
 * A conservation law is a vector c such that c^T * S = 0, meaning
 * sum(c_i * y_i) is constant over time.
 */
function _findConservationLaws(
  stoich: number[][],
  initialConcs: number[]
): { coefficients: number[]; total: number }[] {
  const nSpecies = stoich.length;
  if (nSpecies === 0) return [];
  const nReactions = stoich[0].length;

  // Row reduce S^T to find which columns are dependent
  // We actually need the left null space of S, which is null(S^T)
  // Augment S^T with identity to track transformations
  // Actually, simpler: just row-reduce S (nSpecies x nReactions) and find
  // rows that become zero → those give conservation laws.

  // Row reduce the stoichiometry matrix
  const M = stoich.map(row => [...row]);
  const pivotCols: number[] = [];
  const transform: number[][] = Array.from({ length: nSpecies }, (_, i) => {
    const row = new Array(nSpecies).fill(0);
    row[i] = 1;
    return row;
  });

  let pivotRow = 0;
  for (let col = 0; col < nReactions && pivotRow < nSpecies; col++) {
    // Find pivot
    let maxRow = pivotRow;
    let maxVal = Math.abs(M[pivotRow][col]);
    for (let row = pivotRow + 1; row < nSpecies; row++) {
      if (Math.abs(M[row][col]) > maxVal) {
        maxVal = Math.abs(M[row][col]);
        maxRow = row;
      }
    }
    if (maxVal < 1e-12) continue;

    // Swap
    [M[pivotRow], M[maxRow]] = [M[maxRow], M[pivotRow]];
    [transform[pivotRow], transform[maxRow]] = [transform[maxRow], transform[pivotRow]];

    const piv = M[pivotRow][col];
    // Normalize pivot row
    for (let j = 0; j < nReactions; j++) M[pivotRow][j] /= piv;
    for (let j = 0; j < nSpecies; j++) transform[pivotRow][j] /= piv;

    // Eliminate
    for (let row = 0; row < nSpecies; row++) {
      if (row === pivotRow) continue;
      const factor = M[row][col];
      if (Math.abs(factor) < 1e-14) continue;
      for (let j = 0; j < nReactions; j++) M[row][j] -= factor * M[pivotRow][j];
      for (let j = 0; j < nSpecies; j++) transform[row][j] -= factor * transform[pivotRow][j];
    }

    pivotCols.push(col);
    pivotRow++;
  }

  // Rows of M that are zero correspond to conservation laws
  const laws: { coefficients: number[]; total: number }[] = [];
  for (let row = pivotRow; row < nSpecies; row++) {
    const isZero = M[row].every(v => Math.abs(v) < 1e-12);
    if (isZero) {
      const coeffs = transform[row];
      // Normalize: make first non-zero coefficient 1
      const firstNonZero = coeffs.find(c => Math.abs(c) > 1e-12) || 1;
      const normalized = coeffs.map(c => c / firstNonZero);
      // Compute total from initial concentrations
      let total = 0;
      for (let i = 0; i < nSpecies; i++) {
        total += normalized[i] * initialConcs[i];
      }
      laws.push({ coefficients: normalized, total });
    }
  }

  return laws;
}

// ─── Solve Symbolic Steady State ─────────────────────────────────────────────

/**
 * Solve the steady-state system dy/dt = 0 symbolically.
 *
 * Strategy:
 * 1. Use conservation laws to eliminate dependent variables.
 * 2. If the resulting system is linear → symbolic Gaussian elimination.
 * 3. If quadratic → quadratic formula / sequential substitution.
 * 4. If small polynomial (<=5 vars) → resultant-based elimination.
 * 5. Otherwise → numeric approximation via Newton's method.
 */
export function solveSymbolicSteadyState(
  system: SymbolicODESystem
): SymbolicSteadyState {
  const { speciesNames, rhs, conservationLaws } = system;
  const n = speciesNames.length;

  if (n === 0) {
    return { values: new Map(), isExact: true, conservationLaws };
  }

  // Use conservation laws to identify dependent variables and eliminate them
  const dependentIndices = new Set<number>();
  const substitutions = new Map<string, SymExpr>();

  for (const law of conservationLaws) {
    // Find the last species with non-zero coefficient to eliminate
    let elimIdx = -1;
    for (let i = n - 1; i >= 0; i--) {
      if (Math.abs(law.coefficients[i]) > 1e-12 && !dependentIndices.has(i)) {
        elimIdx = i;
        break;
      }
    }
    if (elimIdx === -1) continue;
    dependentIndices.add(elimIdx);

    // Express y[elimIdx] in terms of other variables and the total
    // law.coefficients[elimIdx] * y[elimIdx] = total - sum_{j!=elimIdx} law.coefficients[j] * y[j]
    const coeff = law.coefficients[elimIdx];
    const terms: SymExpr[] = [symConst(law.total)];
    for (let j = 0; j < n; j++) {
      if (j === elimIdx || Math.abs(law.coefficients[j]) < 1e-12) continue;
      terms.push(symNeg(symMul(symConst(law.coefficients[j]), symVar(speciesNames[j]))));
    }
    const expr = simplify(symDiv(symAdd(...terms), symConst(coeff)));
    substitutions.set(speciesNames[elimIdx], expr);
  }

  // Build reduced system: eliminate dependent variables from RHS
  const independentIndices = [];
  for (let i = 0; i < n; i++) {
    if (!dependentIndices.has(i)) independentIndices.push(i);
  }

  // Substitute dependent variables in the RHS of independent equations
  const reducedRHS: SymExpr[] = independentIndices.map(i => {
    let expr = rhs[i];
    for (const [varName, subst] of substitutions) {
      expr = substitute(expr, varName, subst);
    }
    return simplify(expand(expr));
  });
  const reducedVars = independentIndices.map(i => speciesNames[i]);

  // Check if the system is linear
  const isLinear = _checkLinear(reducedRHS, reducedVars);

  let solution: Map<string, SymExpr>;
  let isExact = true;

  if (reducedVars.length === 0) {
    solution = new Map();
  } else if (isLinear) {
    solution = _solveLinearSteadyState(reducedRHS, reducedVars);
  } else if (reducedVars.length <= 2) {
    const result = _solveSmallPolynomial(reducedRHS, reducedVars);
    solution = result.solution;
    isExact = result.isExact;
  } else if (reducedVars.length <= 5) {
    const result = _solveViaResultants(reducedRHS, reducedVars);
    solution = result.solution;
    isExact = result.isExact;
  } else {
    const result = _solveNumeric(system);
    solution = result.solution;
    isExact = false;
  }

  // Back-substitute to find dependent variables
  for (const [depVar, expr] of substitutions) {
    let resolved = expr;
    for (const [v, val] of solution) {
      resolved = substitute(resolved, v, val);
    }
    solution.set(depVar, simplify(resolved));
  }

  return { values: solution, isExact, conservationLaws };
}

function _checkLinear(equations: SymExpr[], vars: string[]): boolean {
  for (const eq of equations) {
    for (const v of vars) {
      const coll = collectTerms(eq, v);
      if (coll.degree > 1) return false;
    }
  }
  return true;
}

function _solveLinearSteadyState(
  equations: SymExpr[],
  vars: string[]
): Map<string, SymExpr> {
  // Build augmented matrix [A | -b] for the system A*y + b = 0
  // Each equation is f_i(y) = 0; collect linear coefficients
  const augmented: SymExpr[][] = [];

  for (const eq of equations) {
    const row: SymExpr[] = [];
    // Collect coefficients of each variable
    const remainder = eq;
    for (const v of vars) {
      const coll = collectTerms(remainder, v);
      row.push(coll.degree >= 1 ? coll.coefficients[1] : symConst(0));
      // The constant term remains
    }
    // RHS = -constant term
    const expanded = expand(eq);
    let constTerm = expanded;
    for (const v of vars) {
      constTerm = substitute(constTerm, v, symConst(0));
    }
    row.push(simplify(symNeg(constTerm)));
    augmented.push(row);
  }

  return symbolicGaussianElimination(augmented, vars);
}

function _solveSmallPolynomial(
  equations: SymExpr[],
  vars: string[]
): { solution: Map<string, SymExpr>; isExact: boolean } {
  const solutions = solvePolynomialSystem(equations, vars);
  if (solutions.length > 0) {
    // Pick the first physically meaningful solution (non-negative if possible)
    for (const sol of solutions) {
      // Check if all values are non-negative (try numeric evaluation)
      let allNonNeg = true;
      for (const [, val] of sol.values) {
        const fv = freeVariables(val);
        if (fv.size === 0) {
          try {
            if (evaluate(val, {}) < -1e-10) { allNonNeg = false; break; }
          } catch { allNonNeg = false; }
        }
      }
      if (allNonNeg) return { solution: sol.values, isExact: sol.isExact };
    }
    return { solution: solutions[0].values, isExact: solutions[0].isExact };
  }
  // Fall back to setting all to zero
  const sol = new Map<string, SymExpr>();
  for (const v of vars) sol.set(v, symConst(0));
  return { solution: sol, isExact: false };
}

function _solveViaResultants(
  equations: SymExpr[],
  vars: string[]
): { solution: Map<string, SymExpr>; isExact: boolean } {
  return _solveSmallPolynomial(equations, vars);
}

function _solveNumeric(
  system: SymbolicODESystem
): { solution: Map<string, SymExpr> } {
  const { speciesNames, rhs, initialConcentrations, parameterNames } = system;
  const n = speciesNames.length;

  // Newton's method on the full system
  const y = [...initialConcentrations];
  const maxIter = 500;
  const tol = 1e-12;

  // We need parameter values to evaluate — extract them from the expressions
  // For now, the system rhs already contains symVar for parameters; we need bindings.
  // We'll evaluate with y substituted.
  const buildBindings = (yVals: number[]): Record<string, number> => {
    const b: Record<string, number> = {};
    // Bind species concentrations
    for (let i = 0; i < n; i++) {
      b[speciesNames[i]] = yVals[i];
    }
    // Bind parameter values (needed for evaluate to work on rate expressions)
    if (system.parameterValues) {
      for (let i = 0; i < parameterNames.length; i++) {
        b[parameterNames[i]] = system.parameterValues[i];
      }
    }
    return b;
  };

  for (let iter = 0; iter < maxIter; iter++) {
    const bindings = buildBindings(y);

    // Evaluate RHS
    let fVals: number[];
    try {
      fVals = rhs.map(r => evaluate(r, bindings));
    } catch {
      break; // Unbound parameter — can't do numeric
    }

    // Check convergence
    const norm = Math.sqrt(fVals.reduce((s, v) => s + v * v, 0));
    if (norm < tol) break;

    // Build Jacobian numerically
    const J: number[][] = [];
    const eps = 1e-8;
    for (let i = 0; i < n; i++) {
      J.push([]);
      for (let j = 0; j < n; j++) {
        const yp = [...y];
        yp[j] += eps;
        const bp = buildBindings(yp);
        try {
          const fp = evaluate(rhs[i], bp);
          J[i][j] = (fp - fVals[i]) / eps;
        } catch {
          J[i][j] = 0;
        }
      }
    }

    // Solve J * delta = -f
    const delta = _numericLinearSolve(J, fVals.map(v => -v));
    if (!delta) break;

    for (let i = 0; i < n; i++) {
      y[i] += delta[i];
      if (y[i] < 0) y[i] = 0; // enforce non-negativity
    }
  }

  const solution = new Map<string, SymExpr>();
  for (let i = 0; i < n; i++) {
    solution.set(speciesNames[i], symConst(y[i]));
  }
  return { solution };
}

function _numericLinearSolve(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > maxVal) {
        maxVal = Math.abs(M[row][col]);
        maxRow = row;
      }
    }
    if (maxVal < 1e-14) return null;
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    const piv = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= piv;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = M[row][col];
      for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j];
    }
  }

  return M.map(row => row[n]);
}

// ─── Symbolic Sensitivity ────────────────────────────────────────────────────

/**
 * Compute exact symbolic sensitivity dy_ss/dk for each species at steady state.
 *
 * At steady state f(y_ss, k) = 0:
 *   df/dy . dy_ss/dk + df/dk = 0
 *   dy_ss/dk = -(df/dy)^{-1} . df/dk
 *
 * We solve this via symbolic Gaussian elimination.
 */
export function symbolicSensitivity(
  system: SymbolicODESystem,
  steadyState: SymbolicSteadyState,
  parameterNamesToAnalyze?: string[]
): SymbolicSensitivityResult {
  const { speciesNames, rhs, parameterNames, conservationLaws } = system;
  const n = speciesNames.length;
  const params = parameterNamesToAnalyze || parameterNames;

  const result: SymbolicSensitivityResult = {
    sensitivities: new Map(),
  };

  // Use conservation laws to eliminate dependent variables (same as solver)
  const dependentIndices = new Set<number>();
  const depSubstitutions = new Map<string, SymExpr>();

  for (const law of conservationLaws) {
    let elimIdx = -1;
    for (let i = n - 1; i >= 0; i--) {
      if (Math.abs(law.coefficients[i]) > 1e-12 && !dependentIndices.has(i)) {
        elimIdx = i;
        break;
      }
    }
    if (elimIdx === -1) continue;
    dependentIndices.add(elimIdx);

    const coeff = law.coefficients[elimIdx];
    const terms: SymExpr[] = [symConst(law.total)];
    for (let j = 0; j < n; j++) {
      if (j === elimIdx || Math.abs(law.coefficients[j]) < 1e-12) continue;
      terms.push(symNeg(symMul(symConst(law.coefficients[j]), symVar(speciesNames[j]))));
    }
    depSubstitutions.set(speciesNames[elimIdx], simplify(symDiv(symAdd(...terms), symConst(coeff))));
  }

  const independentIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!dependentIndices.has(i)) independentIndices.push(i);
  }

  // Build reduced RHS by substituting dependent variables
  const reducedRHS: SymExpr[] = independentIndices.map(i => {
    let expr = rhs[i];
    for (const [varName, subst] of depSubstitutions) {
      expr = substitute(expr, varName, subst);
    }
    return simplify(expand(expr));
  });
  const reducedVars = independentIndices.map(i => speciesNames[i]);
  const m = reducedVars.length;

  if (m === 0) {
    // All species are determined by conservation laws alone (no free parameters to differentiate)
    for (const k of params) {
      const speciesSens = new Map<string, SymExpr>();
      for (const sp of speciesNames) speciesSens.set(sp, symConst(0));
      result.sensitivities.set(k, speciesSens);
    }
    return result;
  }

  // Compute reduced Jacobian df_i/dy_j at steady state (only independent vars)
  const Jred: SymExpr[][] = [];
  for (let i = 0; i < m; i++) {
    Jred.push([]);
    for (let j = 0; j < m; j++) {
      let dfdyj = differentiate(reducedRHS[i], reducedVars[j]);
      // Substitute steady-state values for independent vars
      for (const [v, val] of steadyState.values) {
        dfdyj = substitute(dfdyj, v, val);
      }
      Jred[i][j] = simplify(dfdyj);
    }
  }

  // For each parameter k, compute df_i/dk at steady state
  for (const k of params) {
    const dfdk: SymExpr[] = [];
    for (let i = 0; i < m; i++) {
      let d = differentiate(reducedRHS[i], k);
      for (const [v, val] of steadyState.values) {
        d = substitute(d, v, val);
      }
      dfdk.push(simplify(d));
    }

    // Solve Jred * s = -dfdk
    const augmented: SymExpr[][] = [];
    for (let i = 0; i < m; i++) {
      const row = [...Jred[i], simplify(symNeg(dfdk[i]))];
      augmented.push(row);
    }

    const sensSolution = symbolicGaussianElimination(augmented, reducedVars.map(s => `d${s}_d${k}`));

    const speciesSens = new Map<string, SymExpr>();
    // Independent species sensitivities
    for (let i = 0; i < m; i++) {
      const val = sensSolution.get(`d${reducedVars[i]}_d${k}`);
      speciesSens.set(reducedVars[i], val || symConst(0));
    }

    // Dependent species sensitivities via conservation laws:
    // sum(c_j * dy_j/dk) = 0, so dy_dep/dk = -(1/c_dep) * sum_{j!=dep} c_j * dy_j/dk
    for (const law of conservationLaws) {
      let depIdx = -1;
      for (let i = n - 1; i >= 0; i--) {
        if (Math.abs(law.coefficients[i]) > 1e-12 && dependentIndices.has(i)) {
          depIdx = i;
          break;
        }
      }
      if (depIdx === -1) continue;
      const depCoeff = law.coefficients[depIdx];
      const terms: SymExpr[] = [];
      for (let j = 0; j < n; j++) {
        if (j === depIdx || Math.abs(law.coefficients[j]) < 1e-12) continue;
        const sjExpr = speciesSens.get(speciesNames[j]) || symConst(0);
        terms.push(symMul(symConst(law.coefficients[j]), sjExpr));
      }
      const depSens = simplify(
        symDiv(symNeg(terms.length > 0 ? symAdd(...terms) : symConst(0)), symConst(depCoeff))
      );
      speciesSens.set(speciesNames[depIdx], depSens);
    }

    result.sensitivities.set(k, speciesSens);
  }

  return result;
}

// ─── Symbolic Bifurcation Conditions ─────────────────────────────────────────

/**
 * Compute the condition for a saddle-node bifurcation: det(J) = 0
 * at the steady state, expressed symbolically.
 */
export function symbolicBifurcationConditions(
  system: SymbolicODESystem,
  steadyState: SymbolicSteadyState
): BifurcationConditions {
  const { speciesNames, rhs } = system;
  const n = speciesNames.length;

  // Build Jacobian df_i/dy_j
  const J: SymExpr[][] = [];
  for (let i = 0; i < n; i++) {
    J.push([]);
    for (let j = 0; j < n; j++) {
      let dfdyj = differentiate(rhs[i], speciesNames[j]);
      // Substitute steady-state expressions
      for (const [v, val] of steadyState.values) {
        dfdyj = substitute(dfdyj, v, val);
      }
      J[i][j] = simplify(dfdyj);
    }
  }

  // Compute det(J)
  const det = symbolicDeterminant(J);

  return {
    determinantCondition: simplify(det),
    jacobian: J,
  };
}
