/**
 * LinearNoiseApproximation.ts -- Compute mean and covariance of species
 * fluctuations analytically from the stoichiometry matrix and Jacobian
 * using van Kampen's system-size expansion.
 *
 * Steady-state LNA:
 *   1. Find deterministic steady state x* via Newton-Raphson.
 *   2. Build stoichiometry matrix S and propensity vector a(x*).
 *   3. Compute Jacobian A = df/dx at x*.
 *   4. Build diffusion matrix D = S * diag(a(x*)) * S^T.
 *   5. Solve Lyapunov equation  A*C + C*A^T + D = 0  for covariance C.
 *
 * Time-dependent LNA:
 *   Augment the ODE with the covariance equations:
 *     dC/dt = A(t)*C(t) + C(t)*A(t)^T + D(t)
 *   and integrate the combined system with RK4.
 */

import { findSteadyState } from './SteadyStateFinder';
import type { SteadyStateConfig } from './SteadyStateFinder';
import type { BNGLModel, BNGLReaction, BNGLSpecies } from '../../types';
import { buildStoichiometryMatrix as buildStoichiometry } from '../../utils/stoichiometry';

// ── Public interfaces ──────────────────────────────────────────────

export interface LNAConfig {
  model: BNGLModel;
  reactions: BNGLReaction[];
  species: BNGLSpecies[];
  /** System volume (default 1).  Covariance scales as 1/V. */
  volume?: number;
  /** If true, compute time-dependent LNA instead of steady-state. */
  timeDependent?: boolean;
  /** End time for time-dependent LNA. */
  t_end?: number;
  /** Number of output time-steps for time-dependent LNA. */
  n_steps?: number;
}

export interface LNASteadyStateResult {
  mean: number[];
  covariance: number[][];
  /** Coefficient of variation (std / mean) per species. */
  cv: number[];
  /** Fano factor (variance / mean) per species. */
  fano: number[];
  speciesNames: string[];
  converged: boolean;
}

export interface LNATimeResult {
  times: number[];
  /** means[t][i] = mean of species i at time t */
  means: number[][];
  /** variances[t][i] = variance of species i at time t */
  variances: number[][];
  /** covariances[t][i][j] = C(i,j) at time t */
  covariances?: number[][][];
  speciesNames: string[];
}


interface PrecomputedPropensity {
  rateConstant: number;
  reactants: { idx: number; count: number }[];
}

// ── Helper: build stoichiometry matrix (n x m) ────────────────────

function buildStoichiometryMatrix(
  species: BNGLSpecies[],
  reactions: BNGLReaction[],
): number[][] {
  const speciesIndex = new Map<string, number>();
  for (let i = 0; i < species.length; i++) speciesIndex.set(species[i].name, i);
  return buildStoichiometry(reactions, species.length, (name) => speciesIndex.get(name));
}

// ── Helper: propensity vector precomputation ──────────────────────

function precomputePropensities(
  reactions: BNGLReaction[],
  species: BNGLSpecies[],
): PrecomputedPropensity[] {
  const speciesIndex = new Map<string, number>();
  for (let i = 0; i < species.length; i++) speciesIndex.set(species[i].name, i);

  return reactions.map((rxn) => {
    const reactantCounts = new Map<string, number>();
    for (const name of rxn.reactants) {
      reactantCounts.set(name, (reactantCounts.get(name) ?? 0) + 1);
    }

    const reactants: { idx: number; count: number }[] = [];
    reactantCounts.forEach((count, name) => {
      const idx = speciesIndex.get(name);
      if (idx !== undefined) {
        reactants.push({ idx, count });
      }
    });

    return {
      rateConstant: rxn.rateConstant,
      reactants,
    };
  });
}

function evaluatePropensities(
  y: Float64Array | number[],
  precomputed: PrecomputedPropensity[],
  out: number[] | Float64Array,
): void {
  for (let r = 0; r < precomputed.length; r++) {
    const propDef = precomputed[r];
    let prop = propDef.rateConstant;
    for (let i = 0; i < propDef.reactants.length; i++) {
      const { idx, count } = propDef.reactants[i];
      const conc = y[idx] ?? 0;
      prop *= Math.pow(Math.max(conc, 0), count);
    }
    out[r] = prop;
  }
}

// ── Helper: build RHS from stoichiometry and propensities ─────────

function buildRhsFn(
  species: BNGLSpecies[],
  reactions: BNGLReaction[],
  S: number[][],
): (y: Float64Array, dydt: Float64Array) => void {
  const n = species.length;
  const m = reactions.length;
  const precomputed = precomputePropensities(reactions, species);
  const a = new Float64Array(m);

  return (y: Float64Array, dydt: Float64Array): void => {
    evaluatePropensities(y, precomputed, a);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let r = 0; r < m; r++) {
        sum += S[i][r] * a[r];
      }
      dydt[i] = sum;
    }
  };
}

// ── Helper: numerical Jacobian via central finite differences ─────

function numericalJacobian(
  rhsFn: (y: Float64Array, dydt: Float64Array) => void,
  y: Float64Array,
  n: number,
  J: number[][],
  fp: Float64Array,
  fm: Float64Array,
  yp: Float64Array,
  ym: Float64Array
): void {
  const eps = 1e-8;
  yp.set(y);
  ym.set(y);

  for (let j = 0; j < n; j++) {
    const h = Math.max(eps, Math.abs(y[j]) * eps);
    yp[j] = y[j] + h;
    ym[j] = y[j] - h;

    rhsFn(yp, fp);
    rhsFn(ym, fm);

    for (let i = 0; i < n; i++) {
      J[i][j] = (fp[i] - fm[i]) / (2 * h);
    }

    yp[j] = y[j];
    ym[j] = y[j];
  }
}

// ── Helper: diffusion matrix D = S * diag(a) * S^T ───────────────

function buildDiffusionMatrix(
  S: number[][],
  a: number[] | Float64Array,
  n: number,
  m: number,
  D: number[][]
): void {

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let r = 0; r < m; r++) {
        sum += S[i][r] * a[r] * S[j][r];
      }
      D[i][j] = sum;
    }
  }
}

// ── Helper: solve Lyapunov  A*C + C*A^T + D = 0  ─────────────────
//    Vectorize: (I kron A + A kron I) * vec(C) = -vec(D)

function solveLyapunov(A: number[][], D: number[][], n: number): number[][] {
  const n2 = n * n;

  // Build M = I kron A + A kron I  (n^2 x n^2)
  const M = new Float64Array(n2 * n2);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const row_ij = i * n + j; // vec index for (i,j)
      for (let k = 0; k < n; k++) {
        // I kron A: delta(i,i2) * A[j][k] => row (i,j), col (i,k)
        const col_ik = i * n + k;
        M[row_ij * n2 + col_ik] += A[j][k];

        // A kron I: A[i][k] * delta(j,j2) => row (i,j), col (k,j)
        const col_kj = k * n + j;
        M[row_ij * n2 + col_kj] += A[i][k];
      }
    }
  }

  // Build rhs = -vec(D)
  const rhs = new Float64Array(n2);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      rhs[i * n + j] = -D[i][j];
    }
  }

  // Solve via Gaussian elimination with partial pivoting (dense LU)
  gaussianElimination(M, rhs, n2);

  // Unpack vec(C) into matrix
  const C: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      C[i][j] = rhs[i * n + j];
    }
  }

  // Symmetrize (numerical cleanup)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const avg = (C[i][j] + C[j][i]) / 2;
      C[i][j] = avg;
      C[j][i] = avg;
    }
  }

  return C;
}

// ── Helper: Gaussian elimination with partial pivoting ────────────

function gaussianElimination(
  A: Float64Array,
  b: Float64Array,
  n: number,
): void {
  // Forward elimination
  for (let col = 0; col < n; col++) {
    // Partial pivoting: find max in column
    let maxVal = Math.abs(A[col * n + col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(A[row * n + col]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }

    // Swap rows
    if (maxRow !== col) {
      for (let k = col; k < n; k++) {
        const tmp = A[col * n + k];
        A[col * n + k] = A[maxRow * n + k];
        A[maxRow * n + k] = tmp;
      }
      const tmp = b[col];
      b[col] = b[maxRow];
      b[maxRow] = tmp;
    }

    const pivot = A[col * n + col];
    if (Math.abs(pivot) < 1e-30) continue;

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = A[row * n + col] / pivot;
      for (let k = col + 1; k < n; k++) {
        A[row * n + k] -= factor * A[col * n + k];
      }
      A[row * n + col] = 0;
      b[row] -= factor * b[col];
    }
  }

  // Back substitution
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let k = row + 1; k < n; k++) {
      sum -= A[row * n + k] * b[k];
    }
    const diag = A[row * n + row];
    b[row] = Math.abs(diag) > 1e-30 ? sum / diag : 0;
  }
}

// ── Steady-state LNA ──────────────────────────────────────────────

export function computeLNASteadyState(config: LNAConfig): LNASteadyStateResult {
  const { species, reactions, volume = 1 } = config;
  const n = species.length;
  const m = reactions.length;
  const speciesNames = species.map((s) => s.name);

  // Build stoichiometry matrix
  const S = buildStoichiometryMatrix(species, reactions);

  // Build RHS function
  const rhsFn = buildRhsFn(species, reactions, S);

  // Initial guess from initial concentrations
  const initialGuess = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    initialGuess[i] = species[i].initialConcentration;
  }

  // Find deterministic steady state
  const ssConfig: SteadyStateConfig = {
    nSpecies: n,
    parameters: config.model.parameters,
    rhsFn,
    tolerance: 1e-10,
    maxIterations: 500,
  };

  const ss = findSteadyState(ssConfig, initialGuess);
  const xStar = ss.y;

  // Propensity at steady state
  const precomputed = precomputePropensities(reactions, species);
  const aStar = new Float64Array(m);
  evaluatePropensities(xStar, precomputed, aStar);

  // Jacobian at steady state (numerical)
  const A: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const fp = new Float64Array(n);
  const fm = new Float64Array(n);
  const yp = new Float64Array(n);
  const ym = new Float64Array(n);
  numericalJacobian(rhsFn, xStar, n, A, fp, fm, yp, ym);

  // Diffusion matrix D = S * diag(a*) * S^T
  const D: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  buildDiffusionMatrix(S, aStar, n, m, D);

  // Solve Lyapunov equation A*C + C*A^T + D = 0
  const C = solveLyapunov(A, D, n);

  // Apply volume scaling: covariance scales as 1/V
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      C[i][j] /= volume;
    }
  }

  // Compute derived quantities
  const mean = Array.from(xStar);
  const cv = new Array<number>(n);
  const fano = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const variance = C[i][i];
    const std = Math.sqrt(Math.max(variance, 0));
    cv[i] = mean[i] > 1e-30 ? std / mean[i] : 0;
    fano[i] = mean[i] > 1e-30 ? variance / mean[i] : 0;
  }

  return {
    mean,
    covariance: C,
    cv,
    fano,
    speciesNames,
    converged: ss.converged,
  };
}

// ── Time-dependent LNA ────────────────────────────────────────────

export function computeLNATimeCourse(config: LNAConfig): LNATimeResult {
  const { species, reactions, volume = 1, t_end = 10, n_steps = 100 } = config;
  const n = species.length;
  const m = reactions.length;
  const speciesNames = species.map((s) => s.name);

  // Build stoichiometry matrix
  const S = buildStoichiometryMatrix(species, reactions);

  // Build RHS function
  const rhsFn = buildRhsFn(species, reactions, S);

  const dt = t_end / n_steps;

  const precomputed = precomputePropensities(reactions, species);
  const aCurr = new Float64Array(m);
  const A_tmp: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const D_tmp: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const fp_tmp = new Float64Array(n);
  const fm_tmp = new Float64Array(n);
  const yp_tmp = new Float64Array(n);
  const ym_tmp = new Float64Array(n);
  const dydt_tmp = new Float64Array(n);

  // Augmented state: [y_1,...,y_n, C_11, C_12,...,C_1n, C_21,...,C_nn]
  // Total dimension: n + n*n
  const augDim = n + n * n;
  const state = new Float64Array(augDim);

  // Initialize concentrations
  for (let i = 0; i < n; i++) {
    state[i] = species[i].initialConcentration;
  }
  // Initialize covariance to zero (no initial fluctuations)

  // Output storage
  const times: number[] = [0];
  const means: number[][] = [species.map((s) => s.initialConcentration)];
  const variances: number[][] = [new Array(n).fill(0)];
  const covariances: number[][][] = [
    Array.from({ length: n }, () => new Array(n).fill(0)),
  ];

  // RHS for the augmented system
  function augmentedRHS(s: Float64Array, dsdt: Float64Array): void {
    // Extract y
    const y = s.subarray(0, n);
    rhsFn(y, dydt_tmp);

    // Copy dy/dt
    for (let i = 0; i < n; i++) dsdt[i] = dydt_tmp[i];

    // Extract C (n x n, row-major starting at index n)
    // Compute A(t) and D(t) at current y
    evaluatePropensities(y, precomputed, aCurr);
    numericalJacobian(rhsFn, y, n, A_tmp, fp_tmp, fm_tmp, yp_tmp, ym_tmp);
    buildDiffusionMatrix(S, aCurr, n, m, D_tmp);
    const A = A_tmp;
    const D = D_tmp;

    // dC/dt = A*C + C*A^T + D
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const cIdx = n + i * n + j;
        let val = D[i][j];

        for (let k = 0; k < n; k++) {
          // A*C term: sum_k A[i][k] * C[k][j]
          val += A[i][k] * s[n + k * n + j];
          // C*A^T term: sum_k C[i][k] * A[j][k]
          val += s[n + i * n + k] * A[j][k];
        }

        dsdt[cIdx] = val;
      }
    }
  }

  // RK4 integration
  const k1 = new Float64Array(augDim);
  const k2 = new Float64Array(augDim);
  const k3 = new Float64Array(augDim);
  const k4 = new Float64Array(augDim);
  const tmp = new Float64Array(augDim);

  for (let step = 0; step < n_steps; step++) {
    // k1
    augmentedRHS(state, k1);

    // k2
    for (let i = 0; i < augDim; i++) tmp[i] = state[i] + 0.5 * dt * k1[i];
    augmentedRHS(tmp, k2);

    // k3
    for (let i = 0; i < augDim; i++) tmp[i] = state[i] + 0.5 * dt * k2[i];
    augmentedRHS(tmp, k3);

    // k4
    for (let i = 0; i < augDim; i++) tmp[i] = state[i] + dt * k3[i];
    augmentedRHS(tmp, k4);

    // Update
    for (let i = 0; i < augDim; i++) {
      state[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }

    // Enforce non-negative concentrations
    for (let i = 0; i < n; i++) {
      if (state[i] < 0) state[i] = 0;
    }

    // Record output
    const t = (step + 1) * dt;
    times.push(t);

    const meanVec = new Array<number>(n);
    const varVec = new Array<number>(n);
    const covMat: number[][] = Array.from({ length: n }, () =>
      new Array(n).fill(0),
    );

    for (let i = 0; i < n; i++) {
      meanVec[i] = state[i];
      // Apply volume scaling
      varVec[i] = state[n + i * n + i] / volume;
      for (let j = 0; j < n; j++) {
        covMat[i][j] = state[n + i * n + j] / volume;
      }
    }

    means.push(meanVec);
    variances.push(varVec);
    covariances.push(covMat);
  }

  return {
    times,
    means,
    variances,
    covariances,
    speciesNames,
  };
}
