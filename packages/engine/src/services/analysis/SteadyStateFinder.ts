/**
 * SteadyStateFinder.ts -- Newton-Raphson steady-state solver with stability
 * classification via eigenvalue analysis.
 *
 * Algorithm:
 *   y_{k+1} = y_k - J^{-1} * f(y_k)
 * where J is the Jacobian.  If no analytic Jacobian is provided, one is
 * computed via central finite differences.  Stability is determined by the
 * eigenvalues of J evaluated at the steady state.
 */

import { qrEigenvalues, solveLU, type ComplexNumber } from './EigenSolver';

// ── Types ───────────────────────────────────────────────────────────

export interface SteadyStateConfig {
  /** Number of dynamic species */
  nSpecies: number;
  /** Parameter name → value map (or Float64Array of values) */
  parameters: Record<string, number> | Float64Array;
  /** Right-hand-side function: f(y, dydt) => void  (fills dydt) */
  rhsFn: (y: Float64Array, dydt: Float64Array) => void;
  /** Optional analytic Jacobian: jacobianFn(y, J) => void (fills row-major J) */
  jacobianFn?: (y: Float64Array, J: Float64Array) => void;
  /** Newton convergence tolerance (default 1e-10) */
  tolerance?: number;
  /** Maximum Newton iterations (default 200) */
  maxIterations?: number;
}

export interface SteadyState {
  /** Steady-state concentration vector */
  y: Float64Array;
  /** True if all eigenvalues have negative real part */
  stable: boolean;
  /** Whether Newton iteration converged within tolerance */
  converged: boolean;
  /** Eigenvalues of the Jacobian at the steady state */
  eigenvalues: Array<ComplexNumber>;
  /** Associated parameter value (used by continuation) */
  parameterValue: number;
}

// ── Newton-Raphson solver ───────────────────────────────────────────

/**
 * Find a steady state starting from an initial guess using damped
 * Newton-Raphson iteration.
 */
export function findSteadyState(
  config: SteadyStateConfig,
  initialGuess: Float64Array,
): SteadyState {
  const { nSpecies, rhsFn, tolerance = 1e-10, maxIterations = 200 } = config;

  const y = new Float64Array(initialGuess);
  const f = new Float64Array(nSpecies);
  const J = new Float64Array(nSpecies * nSpecies);

  let converged = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Evaluate RHS
    rhsFn(y, f);

    // Check convergence
    let residualNorm = 0;
    for (let i = 0; i < nSpecies; i++) residualNorm += f[i] * f[i];
    residualNorm = Math.sqrt(residualNorm);

    if (residualNorm < tolerance) {
      converged = true;
      break;
    }

    // Compute Jacobian
    if (config.jacobianFn) {
      config.jacobianFn(y, J);
    } else {
      numericalJacobian(rhsFn, y, nSpecies, J);
    }

    // Solve J * delta = -f  =>  delta = -J^{-1} f
    // Negate f for the RHS
    const negF = new Float64Array(nSpecies);
    for (let i = 0; i < nSpecies; i++) negF[i] = -f[i];

    const delta = solveLU(J, nSpecies, negF);

    // Damped line search
    let alpha = 1.0;
    const yTrial = new Float64Array(nSpecies);
    const fTrial = new Float64Array(nSpecies);

    for (let ls = 0; ls < 20; ls++) {
      for (let i = 0; i < nSpecies; i++) {
        yTrial[i] = y[i] + alpha * delta[i];
      }

      rhsFn(yTrial, fTrial);

      let trialNorm = 0;
      for (let i = 0; i < nSpecies; i++) trialNorm += fTrial[i] * fTrial[i];
      trialNorm = Math.sqrt(trialNorm);

      if (trialNorm < residualNorm || alpha < 1e-4) {
        break;
      }
      alpha *= 0.5;
    }

    // Update y
    for (let i = 0; i < nSpecies; i++) {
      y[i] += alpha * delta[i];
      // Enforce non-negativity for concentrations
      if (y[i] < 0) y[i] = 0;
    }
  }

  // Compute Jacobian at final point for stability analysis
  if (config.jacobianFn) {
    config.jacobianFn(y, J);
  } else {
    numericalJacobian(rhsFn, y, nSpecies, J);
  }

  const eigenvalues = computeEigenvalues(J, nSpecies);

  // Stability: all eigenvalues must have strictly negative real part
  const stable = eigenvalues.every(ev => ev.real < -1e-12);

  // Default parameter value 0 when not used from continuation
  const parameterValue = 0;

  if (!converged) {
    // Return best approximation even if not converged; caller can check residual
  }

  return { y, stable, converged, eigenvalues, parameterValue };
}

// ── Eigenvalue wrapper ──────────────────────────────────────────────

/**
 * Compute eigenvalues of a Jacobian matrix.
 */
export function computeEigenvalues(
  jacobian: Float64Array,
  nSpecies: number,
): Array<ComplexNumber> {
  return qrEigenvalues(jacobian, nSpecies);
}

// ── Numerical Jacobian via central differences ──────────────────────

/**
 * Compute J[i][j] = df_i/dy_j using central finite differences.
 */
function numericalJacobian(
  rhsFn: (y: Float64Array, dydt: Float64Array) => void,
  y: Float64Array,
  n: number,
  J: Float64Array,
): void {
  const fPlus = new Float64Array(n);
  const fMinus = new Float64Array(n);
  const yPerturbed = new Float64Array(y);

  for (let j = 0; j < n; j++) {
    const h = Math.max(1e-8 * Math.abs(y[j]), 1e-10);

    yPerturbed[j] = y[j] + h;
    rhsFn(yPerturbed, fPlus);

    yPerturbed[j] = y[j] - h;
    rhsFn(yPerturbed, fMinus);

    yPerturbed[j] = y[j]; // restore

    const inv2h = 1 / (2 * h);
    for (let i = 0; i < n; i++) {
      J[i * n + j] = (fPlus[i] - fMinus[i]) * inv2h;
    }
  }
}
