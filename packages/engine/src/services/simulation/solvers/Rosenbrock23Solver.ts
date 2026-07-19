/**
 * Rosenbrock23Solver - L-stable 2nd order method for stiff ODEs
 *
 * Extracted from ODESolver.ts. Includes the LUSolver helper class
 * (used only by Rosenbrock23) and the main Rosenbrock23Solver class.
 *
 * Based on the Shampine & Reichelt (1997) MATLAB ode23s implementation.
 */

import {
  errorNorm,
  hasInvalidValues,
  SOLVER_ERROR_STIFF_DETECTED,
  type SolverOptions,
  type SolverResult,
  type DerivativeFunction,
  DEFAULT_SOLVER_OPTIONS,
} from '../../../utils/solverUtils';

// Re-export for convenience
export { SOLVER_ERROR_STIFF_DETECTED };
export type { SolverOptions, SolverResult, DerivativeFunction };

/**
 * Simple LU decomposition for small dense matrices
 * Returns { L, U, P } where P*A = L*U
 */
class LUSolver {
  private n: number;
  private LU: Float64Array;
  private pivots: Int32Array;

  constructor(n: number) {
    this.n = n;
    this.LU = new Float64Array(n * n);
    this.pivots = new Int32Array(n);
  }

  /**
   * Factorize matrix A (stored row-major)
   * Returns false if singular
   */
  factorize(A: Float64Array): boolean {
    const n = this.n;
    const LU = this.LU;
    const pivots = this.pivots;

    // Copy A to LU
    LU.set(A);

    for (let k = 0; k < n; k++) {
      // Find pivot
      let maxVal = Math.abs(LU[k * n + k]);
      let maxIdx = k;
      for (let i = k + 1; i < n; i++) {
        const val = Math.abs(LU[i * n + k]);
        if (val > maxVal) {
          maxVal = val;
          maxIdx = i;
        }
      }

      pivots[k] = maxIdx;

      // Swap rows if needed
      if (maxIdx !== k) {
        for (let j = 0; j < n; j++) {
          const tmp = LU[k * n + j];
          LU[k * n + j] = LU[maxIdx * n + j];
          LU[maxIdx * n + j] = tmp;
        }
      }

      // Check for singularity
      const pivot = LU[k * n + k];
      if (Math.abs(pivot) < 1e-30) {
        return false; // Singular
      }

      // Eliminate
      for (let i = k + 1; i < n; i++) {
        const factor = LU[i * n + k] / pivot;
        LU[i * n + k] = factor;
        for (let j = k + 1; j < n; j++) {
          LU[i * n + j] -= factor * LU[k * n + j];
        }
      }
    }

    return true;
  }

  /**
   * Solve Ax = b using factorized matrix
   * b is overwritten with solution x
   */
  solve(b: Float64Array): void {
    const n = this.n;
    const LU = this.LU;
    const pivots = this.pivots;

    // Apply permutation
    for (let k = 0; k < n; k++) {
      const pk = pivots[k];
      if (pk !== k) {
        const tmp = b[k];
        b[k] = b[pk];
        b[pk] = tmp;
      }
    }

    // Forward substitution (L)
    for (let i = 1; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < i; j++) {
        sum += LU[i * n + j] * b[j];
      }
      b[i] -= sum;
    }

    // Back substitution (U)
    for (let i = n - 1; i >= 0; i--) {
      let sum = 0;
      for (let j = i + 1; j < n; j++) {
        sum += LU[i * n + j] * b[j];
      }
      b[i] = (b[i] - sum) / LU[i * n + i];
    }
  }
}

/**
 * Rosenbrock23 - L-stable 2nd order method for stiff ODEs
 *
 * Based on the Shampine & Reichelt (1997) MATLAB ode23s implementation
 */
export class Rosenbrock23Solver {
  private n: number;
  private f: DerivativeFunction;
  private options: SolverOptions;
  private externalJacobian?: (y: Float64Array, J: Float64Array) => void;  // Row-major external Jacobian

  // Reusable buffers
  private f0: Float64Array;
  private f1: Float64Array;
  private k1: Float64Array;
  private k2: Float64Array;
  private k3: Float64Array;
  private yTemp: Float64Array;
  private yNew: Float64Array;
  private err: Float64Array;
  private jacobian: Float64Array;
  private matrix: Float64Array;
  private luSolver: LUSolver;

  // Rosenbrock23 coefficients (Shampine's ode23s variant)
  private readonly d = 1 / (2 + Math.sqrt(2));  // γ = 1/(2+√2) ≈ 0.2929
  private readonly e32 = 6 + Math.sqrt(2);

  // Step size control
  private lastStepRejected = false;
  private jacobianAge = 0;
  private maxJacobianAge = 100;  // Reuse Jacobian for up to 100 steps (stiff systems change slowly)

  // Adaptive Jacobian age tracking: monitors step acceptance rate
  // to dynamically adjust maxJacobianAge for stiff systems
  private readonly adaptiveWindowSize = 50;
  private recentAcceptances: boolean[] = [];
  private readonly highAcceptanceThreshold = 0.9;   // >90% acceptance => extend reuse
  private readonly lowAcceptanceThreshold = 0.7;     // <70% acceptance => reduce reuse
  private readonly extendedMaxJacobianAge = 300;
  private readonly defaultMaxJacobianAge = 100;

  // Buffer pool for Float64Array reuse across integration steps
  private static bufferPool: Map<number, Float64Array[]> = new Map();

  /**
   * Acquire a Float64Array buffer of the given size from the pool.
   * Returns a pooled buffer if available, otherwise allocates a new one.
   */
  static acquire(size: number): Float64Array {
    const pool = Rosenbrock23Solver.bufferPool.get(size);
    if (pool && pool.length > 0) {
      return pool.pop()!;
    }
    return new Float64Array(size);
  }

  /**
   * Release a Float64Array buffer back to the pool for reuse.
   */
  static release(buffer: Float64Array): void {
    const size = buffer.length;
    let pool = Rosenbrock23Solver.bufferPool.get(size);
    if (!pool) {
      pool = [];
      Rosenbrock23Solver.bufferPool.set(size, pool);
    }
    // Cap pool size to prevent unbounded memory growth
    if (pool.length < 16) {
      buffer.fill(0);
      pool.push(buffer);
    }
  }

  /**
   * Update adaptive Jacobian age based on recent step acceptance history.
   * If the solver consistently accepts steps (>90% over last 50 steps),
   * the Jacobian changes slowly and we can reuse it longer (age 300).
   * If rejection rate increases (<70% acceptance), revert to default (age 100).
   */
  private updateAdaptiveJacobianAge(accepted: boolean): void {
    this.recentAcceptances.push(accepted);
    if (this.recentAcceptances.length > this.adaptiveWindowSize) {
      this.recentAcceptances.shift();
    }

    if (this.recentAcceptances.length >= this.adaptiveWindowSize) {
      // ⚡ Bolt: Use inline loop instead of .filter(a => a).length to avoid intermediate array allocation
      let acceptCount = 0;
      for (let i = 0; i < this.recentAcceptances.length; i++) {
        if (this.recentAcceptances[i]) acceptCount++;
      }
      const acceptRate = acceptCount / this.recentAcceptances.length;

      if (acceptRate >= this.highAcceptanceThreshold) {
        this.maxJacobianAge = this.extendedMaxJacobianAge;
      } else if (acceptRate < this.lowAcceptanceThreshold) {
        this.maxJacobianAge = this.defaultMaxJacobianAge;
      }
    }
  }

  constructor(n: number, f: DerivativeFunction, options: Partial<SolverOptions> = {}) {
    this.n = n;
    this.f = f;
    this.options = { ...DEFAULT_SOLVER_OPTIONS, ...options };
    this.externalJacobian = options.jacobianRowMajor;  // Store external Jacobian if provided

    // Allocate buffers
    this.f0 = new Float64Array(n);
    this.f1 = new Float64Array(n);
    this.k1 = new Float64Array(n);
    this.k2 = new Float64Array(n);
    this.k3 = new Float64Array(n);
    this.yTemp = new Float64Array(n);
    this.yNew = new Float64Array(n);
    this.err = new Float64Array(n);
    this.jacobian = new Float64Array(n * n);
    this.matrix = new Float64Array(n * n);
    this.luSolver = new LUSolver(n);

    if (this.externalJacobian) {
      console.log('[Rosenbrock23] Using analytic Jacobian (row-major)');
    }
  }

  /**
   * Compute Jacobian - use external analytic Jacobian if provided, else finite differences
   */
  private computeJacobian(y: Float64Array, f0: Float64Array): void {
    // Use analytic Jacobian if provided (much faster for large systems)
    if (this.externalJacobian) {
      this.externalJacobian(y, this.jacobian);
      this.jacobianAge = 0;
      return;
    }

    // Fallback: numerical Jacobian using finite differences
    const n = this.n;
    const J = this.jacobian;
    const yTemp = this.yTemp;
    const fTemp = this.f1;
    const sqrtEps = 1.4901161193847656e-8; // sqrt(machine epsilon for float64)

    for (let j = 0; j < n; j++) {
      const yj = y[j];
      const h = sqrtEps * Math.max(Math.abs(yj), 1);

      yTemp.set(y);
      yTemp[j] = yj + h;

      this.f(yTemp, fTemp);

      const invH = 1 / h;
      for (let i = 0; i < n; i++) {
        J[i * n + j] = (fTemp[i] - f0[i]) * invH;
      }
    }

    this.jacobianAge = 0;
  }

  /**
   * Form and factorize the iteration matrix: M = I - h*γ*J
   */
  private formIterationMatrix(h: number): boolean {
    const n = this.n;
    const J = this.jacobian;
    const M = this.matrix;
    const factor = h * this.d;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const idx = i * n + j;
        M[idx] = (i === j ? 1 : 0) - factor * J[idx];
      }
    }

    return this.luSolver.factorize(M);
  }

  /**
   * Take a single Rosenbrock step
   * Returns { accepted, hNew, yNew, err }
   */
  step(y: Float64Array, _t: number, h: number): {
    accepted: boolean;
    hNew: number;
    yNew: Float64Array;
    errNorm: number
  } {
    const n = this.n;
    const f0 = this.f0;
    const k1 = this.k1;
    const k2 = this.k2;
    const k3 = this.k3;
    const yTemp = this.yTemp;
    const yNew = this.yNew;
    const err = this.err;
    const { atol, rtol } = this.options;

    // Compute f(t, y)
    this.f(y, f0);

    // Recompute Jacobian if needed
    if (this.jacobianAge >= this.maxJacobianAge || this.lastStepRejected) {
      this.computeJacobian(y, f0);
    }

    // Form and factorize M = I - h*γ*J
    if (!this.formIterationMatrix(h)) {
      // Singular matrix, try smaller step
      return { accepted: false, hNew: h * 0.5, yNew, errNorm: Infinity };
    }

    // Stage 1: k1 = M^(-1) * f0
    k1.set(f0);
    this.luSolver.solve(k1);

    // Stage 2: y1 = y + h*k1, k2 = M^(-1) * (f(y1) - 2*k1)
    for (let i = 0; i < n; i++) {
      yTemp[i] = y[i] + h * k1[i];
    }
    this.f(yTemp, k2);
    for (let i = 0; i < n; i++) {
      k2[i] = k2[i] - 2 * k1[i];
    }
    this.luSolver.solve(k2);

    // 2nd order solution: y_new = y + 1.5*h*k1 + 0.5*h*k2
    for (let i = 0; i < n; i++) {
      yNew[i] = y[i] + h * (1.5 * k1[i] + 0.5 * k2[i]);
      // Clamp to non-negative for concentrations
      if (yNew[i] < 0) yNew[i] = 0;
    }

    // Stage 3 for error estimate: k3 = M^(-1) * (f(y_new) - e32*(k2-k1) - 2*k1)
    this.f(yNew, k3);
    const e32 = this.e32;
    for (let i = 0; i < n; i++) {
      k3[i] = k3[i] - e32 * (k2[i] - k1[i]) - 2 * k1[i];
    }
    this.luSolver.solve(k3);

    // Error estimate
    for (let i = 0; i < n; i++) {
      err[i] = h * (k1[i] - 2 * k2[i] + k3[i]) / 6;
    }

    // Compute error norm
    const errNormVal = errorNorm(err, y, yNew, atol, rtol);

    // Check for invalid values
    if (hasInvalidValues(yNew) || !Number.isFinite(errNormVal)) {
      return { accepted: false, hNew: h * 0.25, yNew, errNorm: Infinity };
    }

    // Step size control (PI controller)
    const safety = 0.9;
    const minScale = 0.2;
    const maxScale = 10.0;  // Allow larger step growth

    let scale: number;
    if (errNormVal === 0) {
      scale = maxScale;
    } else {
      scale = safety * Math.pow(1 / errNormVal, 1 / 3);
    }
    scale = Math.max(minScale, Math.min(maxScale, scale));

    const accepted = errNormVal <= 1;

    // Save rejection state before updating
    const wasRejected = this.lastStepRejected;

    if (accepted) {
      this.jacobianAge++;
      // Don't increase step too much after a rejection
      if (wasRejected) {
        scale = Math.min(scale, 1.0);
      }
      this.lastStepRejected = false;
    } else {
      this.lastStepRejected = true;
    }

    // Update adaptive Jacobian reuse age based on acceptance history
    this.updateAdaptiveJacobianAge(accepted);

    const hNew = h * scale;

    return { accepted, hNew, yNew, errNorm: errNormVal };
  }

  /**
   * Integrate from t to tEnd
   */
  integrate(
    y0: Float64Array,
    t0: number,
    tEnd: number,
    checkCancelled?: () => void
  ): SolverResult {
    const { maxSteps, minStep, maxStep } = this.options;

    let t = t0;
    const y = new Float64Array(y0);

    // Initial step size estimate
    this.f(y, this.f0);
    let h = this.options.initialStep ?? this.estimateInitialStep(y, this.f0, tEnd - t0);
    h = Math.min(h, tEnd - t0);

    let steps = 0;
    let rejections = 0;

    while (t < tEnd - 1e-12 * Math.abs(tEnd)) {
      if (checkCancelled) checkCancelled();

      if (steps >= maxSteps) {
        return {
          success: false,
          t,
          y,
          steps,
          errorMessage: `Max steps (${maxSteps}) exceeded at t=${t.toExponential(4)}`
        };
      }

      // Don't overshoot
      if (t + h > tEnd) h = tEnd - t;
      h = Math.min(h, maxStep);

      const result = this.step(y, t, h);

      if (result.accepted) {
        t += h;
        y.set(result.yNew);
        steps++;
        rejections = 0;
      } else {
        rejections++;
        if (rejections > 100) {
          return {
            success: false,
            t,
            y,
            steps,
            errorMessage: `Excessive step rejections at t=${t.toExponential(4)}`
          };
        }
      }

      // BUG FIX: Check minStep BEFORE setting h to avoid false-positive termination
      const nextH = Math.max(result.hNew, minStep);

      if (nextH < minStep && t < tEnd - minStep) {
        return {
          success: false,
          t,
          y,
          steps,
          errorMessage: `Step size too small (h=${nextH.toExponential(4)}) at t=${t.toExponential(4)}`
        };
      }

      h = nextH;
    }

    return { success: true, t, y, steps };
  }

  /**
   * Estimate initial step size using derivative information
   */
  private estimateInitialStep(y: Float64Array, f0: Float64Array, span: number): number {
    const { atol, rtol } = this.options;
    const n = this.n;

    // Compute norms
    let y_norm = 0;
    let f_norm = 0;
    for (let i = 0; i < n; i++) {
      const scale = atol + rtol * Math.abs(y[i]);
      y_norm += (y[i] / scale) ** 2;
      f_norm += (f0[i] / scale) ** 2;
    }
    y_norm = Math.sqrt(y_norm / n);
    f_norm = Math.sqrt(f_norm / n);

    // Initial estimate based on derivative magnitude
    let h0: number;
    if (f_norm < 1e-10 || y_norm < 1e-10) {
      h0 = 1e-6;
    } else {
      h0 = 0.01 * (y_norm / f_norm);
    }

    // Limit to span
    h0 = Math.min(h0, span * 0.1);
    h0 = Math.max(h0, 1e-10);

    return h0;
  }
}
