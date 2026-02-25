/**
 * ODESolver.ts - Stiff and non-stiff ODE solvers for biochemical systems
 * 
 * Implements:
 * - CVODE (WASM): High-performance stiff solver via SUNDIALS
 * - Rosenbrock23: L-stable 2nd order implicit method for stiff systems
 * - RK45 (Dormand-Prince): 5th order explicit method for non-stiff systems
 * - Auto-switching between methods based on stiffness detection
 */

// import createCVodeModule is removed to avoid ReferenceError in Node.js ESM. 
// It is now dynamically imported in init() based on environment.


export interface SolverOptions {
  atol: number;           // Absolute tolerance
  rtol: number;           // Relative tolerance
  maxSteps: number;       // Maximum steps per interval
  minStep: number;        // Minimum step size before failure
  maxStep: number;        // Maximum step size
  initialStep?: number;   // Initial step size (if not provided, computed automatically)
  solver: 'auto' | 'cvode' | 'cvode_auto' | 'cvode_sparse' | 'cvode_jac' | 'rosenbrock23' | 'rk45' | 'rk4' | 'sparse_implicit' | 'webgpu_rk4';
  jacobianRowMajor?: (y: Float64Array, J: Float64Array) => void;  // Row-major Jacobian for Rosenbrock

  // Advanced CVODE options for stiff systems
  stabLimDet?: boolean;   // Enable BDF stability limit detection
  maxOrd?: number;        // Maximum BDF order (1-5)
  maxNonlinIters?: number;// Maximum nonlinear solver iterations
  nonlinConvCoef?: number;// Nonlinear convergence coefficient
  maxErrTestFails?: number;// Max error test failures
  maxConvFails?: number;  // Max convergence failures

  // Root-finding (for discontinuity detection)
  rootFunction?: (t: number, y: Float64Array, gout: Float64Array) => void;
  numRoots?: number;
}

export interface SolverResult {
  success: boolean;
  t: number;
  y: Float64Array;
  steps: number;
  errorMessage?: string;
}

type DerivativeFunction = (y: Float64Array, dydt: Float64Array) => void;

const DEFAULT_OPTIONS: SolverOptions = {
  atol: 1e-8,          // Absolute tolerance (matches BNG2 CVODE default)
  rtol: 1e-8,          // Relative tolerance (matches BNG2 CVODE default)
  maxSteps: 2000,      // Initial CVODE mxstep (matches BNG2 default)
  minStep: 1e-15,
  maxStep: Infinity,
  solver: 'auto',      // 'auto' now uses CVODE with fallback to Rosenbrock23 (matches BNG2 behavior)
};


export const SOLVER_ERROR_STIFF_DETECTED = 'STIFF_DETECTED';

/**
 * Compute weighted error norm for step size control
 */
function errorNorm(
  err: Float64Array,
  y: Float64Array,
  yNew: Float64Array,
  atol: number,
  rtol: number
): number {
  const n = err.length;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const scale = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(yNew[i]));
    const r = err[i] / scale;
    sumSq += r * r;
  }
  return Math.sqrt(sumSq / n);
}

/**
 * Check for NaN or Infinity in array
 */
function hasInvalidValues(arr: Float64Array): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) return true;
  }
  return false;
}

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

  constructor(n: number, f: DerivativeFunction, options: Partial<SolverOptions> = {}) {
    this.n = n;
    this.f = f;
    this.options = { ...DEFAULT_OPTIONS, ...options };
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

/**
 * RK45 (Dormand-Prince) - Adaptive 5th order explicit method for non-stiff ODEs
 */
export class RK45Solver {
  private n: number;
  private f: DerivativeFunction;
  private options: SolverOptions;

  // Reusable buffers
  private k1: Float64Array;
  private k2: Float64Array;
  private k3: Float64Array;
  private k4: Float64Array;
  private k5: Float64Array;
  private k6: Float64Array;
  private k7: Float64Array;
  private yTemp: Float64Array;
  private yNew: Float64Array;
  private yErr: Float64Array;

  // Dormand-Prince coefficients (node coefficients c2-c7 unused but kept for reference)
  // private readonly c2 = 1/5;
  // private readonly c3 = 3/10;
  // private readonly c4 = 4/5;
  // private readonly c5 = 8/9;
  // private readonly c6 = 1;
  // private readonly c7 = 1;

  private readonly a21 = 1 / 5;
  private readonly a31 = 3 / 40;
  private readonly a32 = 9 / 40;
  private readonly a41 = 44 / 45;
  private readonly a42 = -56 / 15;
  private readonly a43 = 32 / 9;
  private readonly a51 = 19372 / 6561;
  private readonly a52 = -25360 / 2187;
  private readonly a53 = 64448 / 6561;
  private readonly a54 = -212 / 729;
  private readonly a61 = 9017 / 3168;
  private readonly a62 = -355 / 33;
  private readonly a63 = 46732 / 5247;
  private readonly a64 = 49 / 176;
  private readonly a65 = -5103 / 18656;
  // Stage 7 coefficients (a71, a73-a76 are same as b coefficients for FSAL)

  // 5th order solution coefficients
  private readonly b1 = 35 / 384;
  private readonly b3 = 500 / 1113;
  private readonly b4 = 125 / 192;
  private readonly b5 = -2187 / 6784;
  private readonly b6 = 11 / 84;

  // Error coefficients (difference between 5th and 4th order)
  private readonly e1 = 71 / 57600;
  private readonly e3 = -71 / 16695;
  private readonly e4 = 71 / 1920;
  private readonly e5 = -17253 / 339200;
  private readonly e6 = 22 / 525;
  private readonly e7 = -1 / 40;

  constructor(n: number, f: DerivativeFunction, options: Partial<SolverOptions> = {}) {
    this.n = n;
    this.f = f;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Allocate buffers
    this.k1 = new Float64Array(n);
    this.k2 = new Float64Array(n);
    this.k3 = new Float64Array(n);
    this.k4 = new Float64Array(n);
    this.k5 = new Float64Array(n);
    this.k6 = new Float64Array(n);
    this.k7 = new Float64Array(n);
    this.yTemp = new Float64Array(n);
    this.yNew = new Float64Array(n);
    this.yErr = new Float64Array(n);
  }

  /**
   * Take a single RK45 step
   */
  step(y: Float64Array, _t: number, h: number): {
    accepted: boolean;
    hNew: number;
    yNew: Float64Array;
    errNorm: number;
    k1: Float64Array;  // For FSAL
  } {
    const n = this.n;
    const { atol, rtol } = this.options;
    const yTemp = this.yTemp;
    const yNew = this.yNew;
    const yErr = this.yErr;

    // Stage 1
    this.f(y, this.k1);

    // Stage 2
    for (let i = 0; i < n; i++) {
      yTemp[i] = y[i] + h * this.a21 * this.k1[i];
    }
    this.f(yTemp, this.k2);

    // Stage 3
    for (let i = 0; i < n; i++) {
      yTemp[i] = y[i] + h * (this.a31 * this.k1[i] + this.a32 * this.k2[i]);
    }
    this.f(yTemp, this.k3);

    // Stage 4
    for (let i = 0; i < n; i++) {
      yTemp[i] = y[i] + h * (this.a41 * this.k1[i] + this.a42 * this.k2[i] + this.a43 * this.k3[i]);
    }
    this.f(yTemp, this.k4);

    // Stage 5
    for (let i = 0; i < n; i++) {
      yTemp[i] = y[i] + h * (this.a51 * this.k1[i] + this.a52 * this.k2[i] +
        this.a53 * this.k3[i] + this.a54 * this.k4[i]);
    }
    this.f(yTemp, this.k5);

    // Stage 6
    for (let i = 0; i < n; i++) {
      yTemp[i] = y[i] + h * (this.a61 * this.k1[i] + this.a62 * this.k2[i] +
        this.a63 * this.k3[i] + this.a64 * this.k4[i] +
        this.a65 * this.k5[i]);
    }
    this.f(yTemp, this.k6);

    // 5th order solution
    for (let i = 0; i < n; i++) {
      yNew[i] = y[i] + h * (this.b1 * this.k1[i] + this.b3 * this.k3[i] +
        this.b4 * this.k4[i] + this.b5 * this.k5[i] +
        this.b6 * this.k6[i]);
      // Clamp to non-negative
      if (yNew[i] < 0) yNew[i] = 0;
    }

    // Stage 7 (for error estimate and FSAL)
    this.f(yNew, this.k7);

    // Error estimate
    for (let i = 0; i < n; i++) {
      yErr[i] = h * (this.e1 * this.k1[i] + this.e3 * this.k3[i] +
        this.e4 * this.k4[i] + this.e5 * this.k5[i] +
        this.e6 * this.k6[i] + this.e7 * this.k7[i]);
    }

    const errNormVal = errorNorm(yErr, y, yNew, atol, rtol);

    // Check for invalid values
    if (hasInvalidValues(yNew) || !Number.isFinite(errNormVal)) {
      return { accepted: false, hNew: h * 0.25, yNew, errNorm: Infinity, k1: this.k1 };
    }

    // Step size control
    const safety = 0.9;
    const minScale = 0.2;
    const maxScale = 10.0;

    let scale: number;
    if (errNormVal === 0) {
      scale = maxScale;
    } else {
      scale = safety * Math.pow(1 / errNormVal, 1 / 5);
    }
    scale = Math.max(minScale, Math.min(maxScale, scale));

    const accepted = errNormVal <= 1;
    const hNew = h * scale;

    return { accepted, hNew, yNew, errNorm: errNormVal, k1: this.k7 };
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
    let h = this.options.initialStep ?? (tEnd - t0) / 100;
    h = Math.min(h, tEnd - t0);

    let steps = 0;
    let consecutiveRejections = 0;

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
        consecutiveRejections = 0;
      } else {
        consecutiveRejections++;
        // If too many rejections, might be stiff - signal to switch solver
        if (consecutiveRejections > 10) {
          return {
            success: false,
            t,
            y,
            steps,
            errorMessage: SOLVER_ERROR_STIFF_DETECTED  // Special marker for auto-switching
          };
        }
      }

      h = Math.max(result.hNew, minStep);

      if (h < minStep && t < tEnd - minStep) {
        return {
          success: false,
          t,
          y,
          steps,
          errorMessage: `Step size too small (h=${h.toExponential(4)}) at t=${t.toExponential(4)}`
        };
      }
    }

    return { success: true, t, y, steps };
  }
}

/**
 * Auto-switching solver: starts with RK45, switches to Rosenbrock23 if stiffness detected
 */
export class AutoSolver {
  private rk45: RK45Solver;
  private rosenbrock: Rosenbrock23Solver;
  private useImplicit: boolean = false;

  constructor(n: number, f: DerivativeFunction, options: Partial<SolverOptions> = {}) {
    this.rk45 = new RK45Solver(n, f, options);
    this.rosenbrock = new Rosenbrock23Solver(n, f, options);
  }

  integrate(
    y0: Float64Array,
    t0: number,
    tEnd: number,
    checkCancelled?: () => void
  ): SolverResult {
    // If we've already detected stiffness, use Rosenbrock
    if (this.useImplicit) {
      return this.rosenbrock.integrate(y0, t0, tEnd, checkCancelled);
    }

    // Try RK45 first
    const result = this.rk45.integrate(y0, t0, tEnd, checkCancelled);

    if (result.success) {
      return result;
    }

    // Check if stiffness was detected
    if (result.errorMessage === SOLVER_ERROR_STIFF_DETECTED) {
      this.useImplicit = true;
      // Continue from where RK45 left off using Rosenbrock
      return this.rosenbrock.integrate(result.y, result.t, tEnd, checkCancelled);
    }

    // Other failure - return as is
    return result;
  }
}

/**
 * Fast RK4 solver with relative change limiter - no Jacobian needed
 * Ideal for non-stiff systems, much faster than implicit methods
 */
export class FastRK4Solver {
  private n: number;
  private f: DerivativeFunction;
  private options: SolverOptions;

  // Reusable buffers
  private k1: Float64Array;
  private k2: Float64Array;
  private k3: Float64Array;
  private k4: Float64Array;
  private temp: Float64Array;
  private yNew: Float64Array;
  private dydt: Float64Array;

  constructor(n: number, f: DerivativeFunction, options: Partial<SolverOptions> = {}) {
    this.n = n;
    this.f = f;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Allocate buffers
    this.k1 = new Float64Array(n);
    this.k2 = new Float64Array(n);
    this.k3 = new Float64Array(n);
    this.k4 = new Float64Array(n);
    this.temp = new Float64Array(n);
    this.yNew = new Float64Array(n);
    this.dydt = new Float64Array(n);
  }

  /**
   * Perform a single RK4 step
   */
  private step(y: Float64Array, h: number): Float64Array {
    const n = this.n;
    const k1 = this.k1;
    const k2 = this.k2;
    const k3 = this.k3;
    const k4 = this.k4;
    const temp = this.temp;
    const yNew = this.yNew;

    // k1 = f(y)
    this.f(y, k1);

    // k2 = f(y + 0.5*h*k1)
    for (let i = 0; i < n; i++) temp[i] = y[i] + 0.5 * h * k1[i];
    this.f(temp, k2);

    // k3 = f(y + 0.5*h*k2)
    for (let i = 0; i < n; i++) temp[i] = y[i] + 0.5 * h * k2[i];
    this.f(temp, k3);

    // k4 = f(y + h*k3)
    for (let i = 0; i < n; i++) temp[i] = y[i] + h * k3[i];
    this.f(temp, k4);

    // yNew = y + h/6 * (k1 + 2*k2 + 2*k3 + k4)
    for (let i = 0; i < n; i++) {
      yNew[i] = y[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }

    return yNew;
  }

  /**
   * Estimate step size using relative change limiter
   */
  private estimateStepSize(y: Float64Array, dydt: Float64Array, maxH: number): number {
    const n = this.n;
    const maxChange = 0.2;  // Max 20% change per step
    const minConc = 1e-9;   // Threshold for very small concentrations
    let h = maxH;

    for (let i = 0; i < n; i++) {
      const derivSigned = dydt[i];
      const deriv = Math.abs(derivSigned);
      if (deriv > 1e-12) {
        const conc = y[i];

        // If a species is ~0 and is being PRODUCED, don't let it dominate
        // the step-size limiter. The relative-change heuristic otherwise
        // forces h ~ 1e-14 and can trip maxSteps on benign models.
        if (conc < minConc && derivSigned > 0) {
          continue;
        }

        const limit = Math.max(conc, minConc) * maxChange;
        const maxStep = limit / deriv;
        if (maxStep < h) h = maxStep;
      }
    }

    return Math.max(h, this.options.minStep);
  }

  /**
   * Check for NaN or Infinity
   */
  private hasInvalidValues(arr: Float64Array): boolean {
    for (let i = 0; i < arr.length; i++) {
      if (!Number.isFinite(arr[i])) return true;
    }
    return false;
  }

  /**
   * Integrate from t0 to tEnd
   */
  integrate(
    y0: Float64Array,
    t0: number,
    tEnd: number,
    checkCancelled?: () => void
  ): SolverResult {
    const { maxSteps, maxStep } = this.options;

    let t = t0;
    const y = new Float64Array(y0);
    let steps = 0;
    let consecutiveSmallSteps = 0;

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

      // Compute derivatives for step size estimation
      this.f(y, this.dydt);

      // Estimate step size using relative change limiter
      let h = this.estimateStepSize(y, this.dydt, Math.min(tEnd - t, maxStep));

      // Track consecutive small steps for stiffness detection
      if (h < 1e-8 * (tEnd - t0)) {
        consecutiveSmallSteps++;
        if (consecutiveSmallSteps > 100) {
          return {
            success: false,
            t,
            y,
            steps,
            errorMessage: 'STIFF_DETECTED'  // Signal for auto-switching
          };
        }
      } else {
        consecutiveSmallSteps = 0;
      }

      // Don't overshoot
      if (t + h > tEnd) h = tEnd - t;

      // RK4 step
      const yNew = this.step(y, h);

      // Positivity handling:
      // - Tiny negative values can happen from floating point / interpolation; clamp them.
      // - Larger negative overshoots indicate instability; signal auto-switch to implicit solver.
      const NEG_TOL = 1e-6;
      for (let i = 0; i < yNew.length; i++) {
        const v = yNew[i];
        if (v < -NEG_TOL) {
          return {
            success: false,
            t,
            y,
            steps,
            errorMessage: 'STIFF_DETECTED',
          };
        }
        if (v < 0) yNew[i] = 0;
      }

      // Check for invalid values
      if (this.hasInvalidValues(yNew)) {
        return {
          success: false,
          t,
          y,
          steps,
          errorMessage: `NaN/Infinity detected at t=${t.toExponential(4)}`
        };
      }

      // Update state
      y.set(yNew);
      t += h;
      steps++;
    }

    return { success: true, t, y, steps };
  }
}

/**
 * CVODE Solver - High performance WASM-based stiff solver
 * 
 * Uses SUNDIALS CVODE with BDF method (implicit, L-stable) compiled to WebAssembly.
 * Configuration matches BioNetGen's Network3/run_network defaults:
 * - max_num_steps: 2000 (auto-grows on CV_TOO_MUCH_WORK)
 * - max_err_test_fails: 7
 * - max_conv_fails: 10
 * - max_step: 0.0 (no limit)
 * 
 * Additional CVODE options available in WASM wrapper (wasm-sundials/cvode_wrapper.c):
 * - set_min_step(ptr, hmin): Set minimum step size
 * - set_max_ord(ptr, maxord): Set max BDF order (1-5, default 5)
 * - set_stab_lim_det(ptr, onoff): Enable BDF stability limit detection (helps oscillators)
 * - set_max_nonlin_iters(ptr, maxcor): Max nonlinear iterations per step (default 3)
 * - set_nonlin_conv_coef(ptr, nlscoef): NLS convergence coefficient (default 0.1)
 * - set_max_err_test_fails(ptr, maxnef): Max error test failures per step
 * - set_max_conv_fails(ptr, maxncf): Max convergence failures per step
 * - reinit_solver(ptr, t0, y0): Reinitialize at new time/state (for multi-phase)
 * - get_solver_stats(ptr, ...): Get diagnostic statistics
 * 
 * Known limitations for strict numerical parity with BNG2:
 * 1. Chaotic systems (Hill n>10) will diverge due to floating-point sensitivity
 * 2. Long-period oscillators accumulate phase drift over many cycles
 * 3. Very long simulations (>100k time units) accumulate rounding errors
 * These are fundamental numerical characteristics, not implementation bugs.
 */
interface CVodeModule {
  _init_solver(neq: number, t0: number, y0: number, rtol: number, atol: number, max_steps: number): number;
  _init_solver_sparse(neq: number, t0: number, y0: number, rtol: number, atol: number, max_steps: number): number;
  _solve_step(mem: number, tout: number, tret: number): number;
  _get_y(mem: number, dest: number): void;
  _destroy_solver(mem: number): void;
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPF64: Float64Array;
  ccall: any;
  cwrap: any;
  derivativeCallback: (t: number, y: number, ydot: number) => void;
  jacobianCallback?: (t: number, y: number, fy: number, J: number, neq: number) => void;
  rootCallback?: (t: number, y: number, gout: number) => void;
  _init_solver_jac?: (neq: number, t0: number, y0: number, rtol: number, atol: number, maxSteps: number) => number;
  // Additional CVODE options (exposed in WASM wrapper)
  _set_min_step?: (mem: number, hmin: number) => number;
  _set_max_ord?: (mem: number, maxord: number) => number;
  _set_stab_lim_det?: (mem: number, onoff: number) => number;
  _set_max_nonlin_iters?: (mem: number, maxcor: number) => number;
  _set_nonlin_conv_coef?: (mem: number, nlscoef: number) => number;
  _set_max_err_test_fails?: (mem: number, maxnef: number) => number;
  _set_max_conv_fails?: (mem: number, maxncf: number) => number;
  _set_max_num_steps?: (mem: number, mxstep: number) => number;
  _reinit_solver?: (mem: number, t0: number, y0: number) => number;
  _get_solver_stats?: (mem: number, nsteps: number, nfevals: number, nlinsetups: number, netfails: number) => void;
  _init_roots?: (mem: number, nroots: number) => number;
  _get_root_info?: (mem: number, rootsfound: number) => number;
}

// Type for Jacobian function: fills column-major matrix J[i + j*neq] = df_i/dy_j
export type JacobianFunction = (y: Float64Array, J: Float64Array) => void;

export class CVODESolver {
  private n: number;
  private f: DerivativeFunction;
  private options: SolverOptions;
  private useSparse: boolean;
  private jacobian?: JacobianFunction;

  private solverMem: number | null = null;
  private yPtr: number = 0;
  private tretPtr: number = 0;
  private currentT: number = NaN;
  private yOut: Float64Array | null = null;

  // Cached callback views (avoid allocating TypedArray views on every callback)
  private cachedYPtr = 0;
  private cachedYdotPtr = 0;
  private cachedDerivBuffer: ArrayBufferLike | null = null;
  private yView: Float64Array | null = null;
  private dydtView: Float64Array | null = null;

  private cachedJacYPtr = 0;
  private cachedJPtr = 0;
  private cachedJacBuffer: ArrayBufferLike | null = null;
  private jacYView: Float64Array | null = null;
  private jacJView: Float64Array | null = null;

  private rootsFoundPtr: number = 0;
  private cachedGOutPtr = 0;
  private cachedGOutBuffer: ArrayBufferLike | null = null;
  private gYView: Float64Array | null = null;
  private gOutView: Float64Array | null = null;

  static module: CVodeModule | null = null;
  static initPromise: Promise<void> | null = null;
  /** Injected factory for loading the CVODE WASM module. Set via setCVodeFactory() before first use. */
  static cvodeModuleFactory: (() => Promise<unknown>) | null = null;

  /** Wire up the CVODE loader (call from app init before any simulation). */
  static setCVodeFactory(factory: () => Promise<unknown>): void {
    CVODESolver.cvodeModuleFactory = factory;
  }

  constructor(n: number, f: DerivativeFunction, options: Partial<SolverOptions> = {}, useSparse: boolean = false, jacobian?: JacobianFunction) {
    this.n = n;
    this.f = f;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.useSparse = useSparse;
    this.jacobian = jacobian;
  }

  static async init() {
    if (this.module) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
        const resolveLoader = (moduleLike: unknown) => {
          const candidates: unknown[] = [moduleLike];

          if (moduleLike && typeof moduleLike === 'object') {
            const asRecord = moduleLike as Record<string, unknown>;
            candidates.push(asRecord.default, asRecord.createCVodeModule);

            const nestedDefault = asRecord.default;
            if (nestedDefault && typeof nestedDefault === 'object') {
              const nestedRecord = nestedDefault as Record<string, unknown>;
              candidates.push(nestedRecord.default, nestedRecord.createCVodeModule);
            }
          }

          const callable = candidates.find((candidate) => typeof candidate === 'function');
          if (!callable) {
            throw new Error('Failed to resolve callable CVODE loader export');
          }

          return callable as (moduleArg?: unknown) => Promise<CVodeModule>;
        };

        let loader: (moduleArg?: unknown) => Promise<CVodeModule>;
        if (CVODESolver.cvodeModuleFactory) {
          console.log('[ODESolver] Loading CVODE via injected factory');
          loader = resolveLoader(await CVODESolver.cvodeModuleFactory());
        } else if (isNode) {
          console.log('[ODESolver] Loading CVODE via cvode_node');
          // Use dynamic import with string template to avoid Vite static analysis
          const modulePath = './cvode_node.ts';
          loader = resolveLoader(await import(/* @vite-ignore */ modulePath));
        } else {
          console.log('[ODESolver] Loading CVODE via cvode_loader (default)');
          loader = resolveLoader(await import(/* @vite-ignore */ '@/services/cvode_loader.js'));
        }

        this.module = await loader({
          locateFile: (path: string) => {
            if (path.endsWith('.wasm')) {
              if (isNode) {
                try {
                  const nodePath = typeof require === 'function' ? require('path') : null;
                  if (nodePath && typeof process !== 'undefined' && typeof process.cwd === 'function') {
                    return nodePath.resolve(process.cwd(), 'public', 'cvode.wasm');
                  }
                } catch {
                  // Fall through to cwd-based string path.
                }
                if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
                  return `${process.cwd()}/public/cvode.wasm`;
                }
                return './public/cvode.wasm';
              }
              // In browser/worker, detect base URL from self.location
              let baseUrl = '/';
              // console.log('[CVODESolver.init] locateFile called for:', path);

              if (typeof self !== 'undefined' && self.location) {
                const pathname = self.location.pathname;
                if (pathname.includes('/bngplayground/')) {
                  baseUrl = '/bngplayground/';
                }
              }
              const finalPath = baseUrl + 'cvode.wasm';
              console.log(`[CVODESolver.init] Resolving ${path} -> ${finalPath}`);
              return finalPath;
            }
            return path;
          }

        }) as unknown as CVodeModule;
      } catch (e) {
        console.error("Failed to load CVODE WASM:", e);
        throw e;
      }
    })();
    return this.initPromise;
  }

  destroy(): void {
    const m = CVODESolver.module;
    if (!m) return;
    if (this.solverMem) {
      try {
        m._destroy_solver(this.solverMem);
      } finally {
        this.solverMem = null;
      }
    }
    if (this.yPtr) {
      m._free(this.yPtr);
      this.yPtr = 0;
    }
    if (this.tretPtr) {
      m._free(this.tretPtr);
      this.tretPtr = 0;
    }
    if (this.rootsFoundPtr) {
      m._free(this.rootsFoundPtr);
      this.rootsFoundPtr = 0;
    }
    this.currentT = NaN;
    this.yOut = null;
  }

  private ensureInitialized(y0: Float64Array, t0: number): { success: true } | { success: false; errorMessage: string } {
    const m = CVODESolver.module;
    if (!m) return { success: false as const, errorMessage: 'CVODE WASM not loaded' };

    const neq = this.n;
    const { atol, rtol } = this.options;

    // If we have an active solver, verify we're continuing from the expected state.
    if (this.solverMem) {
      const tTol = 1e-12 * Math.max(1, Math.abs(this.currentT), Math.abs(t0));
      const tMatches = Number.isFinite(this.currentT) && Math.abs(t0 - this.currentT) <= tTol;
      if (tMatches) {
        // Verify the caller-provided y0 matches current internal state.
        const heap = m.HEAPF64;
        const heapY = heap.subarray(this.yPtr >> 3, (this.yPtr >> 3) + neq);
        let maxAbsDelta = 0;
        let maxAbsY = 0;
        for (let i = 0; i < neq; i++) {
          const yi = heapY[i];
          const d = Math.abs(y0[i] - yi);
          if (d > maxAbsDelta) maxAbsDelta = d;
          const ay = Math.abs(yi);
          if (ay > maxAbsY) maxAbsY = ay;
        }
        // If state differs, reinitialize from provided y0/t0.
        const yTol = 1e-14 * Math.max(1, maxAbsY);
        if (maxAbsDelta <= yTol) {
          return { success: true as const };
        }
      }

      // Not continuing cleanly: reset the solver.
      this.destroy();
    }

    // Set callback once per initialization.
    m.derivativeCallback = (_t: number, yPtr: number, ydotPtr: number) => {
      const buf = m.HEAPF64.buffer;
      if (!this.yView || !this.dydtView || this.cachedDerivBuffer !== buf || this.cachedYPtr !== yPtr || this.cachedYdotPtr !== ydotPtr) {
        this.cachedDerivBuffer = buf;
        this.cachedYPtr = yPtr;
        this.cachedYdotPtr = ydotPtr;
        this.yView = new Float64Array(buf, yPtr, neq);
        this.dydtView = new Float64Array(buf, ydotPtr, neq);
      }
      this.f(this.yView, this.dydtView);
    };

    if (this.options.rootFunction && this.options.numRoots) {
      const nroots = this.options.numRoots;
      m.rootCallback = (t: number, yPtr: number, goutPtr: number) => {
        const buf = m.HEAPF64.buffer;
        if (!this.gYView || !this.gOutView || this.cachedGOutBuffer !== buf || this.cachedYPtr !== yPtr || this.cachedGOutPtr !== goutPtr) {
          this.cachedGOutBuffer = buf;
          this.cachedYPtr = yPtr;
          this.cachedGOutPtr = goutPtr;
          this.gYView = new Float64Array(buf, yPtr, neq);
          this.gOutView = new Float64Array(buf, goutPtr, nroots);
        }
        this.options.rootFunction!(t, this.gYView, this.gOutView);
      };
    }

    // Allocate memory for state and t_reached.
    this.yPtr = m._malloc(neq * 8);
    if (!this.yPtr) return { success: false, errorMessage: 'CVODE malloc failed for yPtr' };
    this.tretPtr = m._malloc(8);
    if (!this.tretPtr) {
      m._free(this.yPtr);
      this.yPtr = 0;
      return { success: false as const, errorMessage: 'CVODE malloc failed for tretPtr' };
    }

    if (this.options.numRoots) {
      this.rootsFoundPtr = m._malloc(this.options.numRoots * 4); // CVODE uses int* for rootsfound
    }

    this.yOut = new Float64Array(y0.length);

    // Copy initial state into WASM memory.
    m.HEAPF64.set(y0, this.yPtr >> 3);

    // Initialize solver.
    let solverMem: number;
    if (this.jacobian && m._init_solver_jac) {
      m.jacobianCallback = (_t: number, yPtr: number, _fyPtr: number, JPtr: number, neqVal: number) => {
        const buf = m.HEAPF64.buffer;
        if (!this.jacYView || !this.jacJView || this.cachedJacBuffer !== buf || this.cachedJacYPtr !== yPtr || this.cachedJPtr !== JPtr) {
          this.cachedJacBuffer = buf;
          this.cachedJacYPtr = yPtr;
          this.cachedJPtr = JPtr;
          this.jacYView = new Float64Array(buf, yPtr, neqVal);
          this.jacJView = new Float64Array(buf, JPtr, neqVal * neqVal);
        }
        this.jacobian!(this.jacYView, this.jacJView);
      };
      solverMem = m._init_solver_jac(neq, t0, this.yPtr, rtol, atol, this.options.maxSteps);
    } else if (this.useSparse) {
      solverMem = m._init_solver_sparse(neq, t0, this.yPtr, rtol, atol, this.options.maxSteps);
    } else {
      solverMem = m._init_solver(neq, t0, this.yPtr, rtol, atol, this.options.maxSteps);
    }

    if (solverMem && this.options.numRoots && m._init_roots) {
      m._init_roots(solverMem, this.options.numRoots);
    }

    if (!solverMem) {
      m._free(this.yPtr);
      m._free(this.tretPtr);
      this.yPtr = 0;
      this.tretPtr = 0;
      return { success: false as const, errorMessage: 'CVODE initialization failed' };
    }

    this.solverMem = solverMem;
    this.currentT = t0;

    // Optional: initial/max step configuration (bindings may not exist)
    if (this.options.initialStep && this.options.initialStep > 0) {
      // @ts-ignore
      if (typeof (m as any)._set_init_step === 'function') {
        // @ts-ignore
        (m as any)._set_init_step(this.solverMem, this.options.initialStep);
        console.log(`[CVODESolver] Set initial step size to ${this.options.initialStep}`);
      }
    }

    if (this.options.maxStep > 0 && this.options.maxStep < Infinity) {
      // @ts-ignore
      if (typeof (m as any)._set_max_step === 'function') {
        // @ts-ignore
        (m as any)._set_max_step(this.solverMem, this.options.maxStep);
      }
    }

    // Advanced Stiff Solver Options
    if (this.options.stabLimDet !== undefined) {
      // @ts-ignore
      if (typeof (m as any)._set_stab_lim_det === 'function') {
        // @ts-ignore
        (m as any)._set_stab_lim_det(this.solverMem, this.options.stabLimDet ? 1 : 0);
      }
    }

    if (this.options.maxOrd !== undefined) {
      // @ts-ignore
      if (typeof (m as any)._set_max_ord === 'function') {
        // @ts-ignore
        (m as any)._set_max_ord(this.solverMem, this.options.maxOrd);
      }
    }

    if (this.options.maxNonlinIters !== undefined) {
      // @ts-ignore
      if (typeof (m as any)._set_max_nonlin_iters === 'function') {
        // @ts-ignore
        (m as any)._set_max_nonlin_iters(this.solverMem, this.options.maxNonlinIters);
      }
    }

    if (this.options.nonlinConvCoef !== undefined) {
      // @ts-ignore
      if (typeof (m as any)._set_nonlin_conv_coef === 'function') {
        // @ts-ignore
        (m as any)._set_nonlin_conv_coef(this.solverMem, this.options.nonlinConvCoef);
      }
    }

    if (this.options.maxErrTestFails !== undefined) {
      // @ts-ignore
      if (typeof (m as any)._set_max_err_test_fails === 'function') {
        // @ts-ignore
        (m as any)._set_max_err_test_fails(this.solverMem, this.options.maxErrTestFails);
      }
    }

    if (this.options.maxConvFails !== undefined) {
      // @ts-ignore
      if (typeof (m as any)._set_max_conv_fails === 'function') {
        // @ts-ignore
        (m as any)._set_max_conv_fails(this.solverMem, this.options.maxConvFails);
      }
    }

    return { success: true as const };
  }

  integrate(
    y0: Float64Array,
    t0: number,
    tEnd: number,
    checkCancelled?: () => void
  ): SolverResult {
    const m = CVODESolver.module;
    if (!m) {
      return { success: false, t: t0, y: y0, steps: 0, errorMessage: "CVODE WASM not loaded" };
    }

    const init = this.ensureInitialized(y0, t0);
    if (!init.success) {
      const msg = ('errorMessage' in init) ? init.errorMessage : 'CVODE initialization failed';
      return { success: false, t: t0, y: y0, steps: 0, errorMessage: msg };
    }

    const neq = this.n;
    const yOut = this.yOut ?? new Float64Array(y0);

    let t = this.currentT;
    let steps = 0;
    const INITIAL_MXSTEP = 2000;
    const maxMxstep = Math.max(INITIAL_MXSTEP, this.options.maxSteps ?? 5_000_000);
    let mxstep = INITIAL_MXSTEP;
    let stuckCount = 0;
    let lastT = t;

    const solverMem = this.solverMem!;
    const yPtr = this.yPtr;
    const tretPtr = this.tretPtr;

    try {
      if (m._set_max_num_steps) {
        m._set_max_num_steps(solverMem, mxstep);
      }

      while (true) {
        if (checkCancelled) checkCancelled();

        const flag = m._solve_step(solverMem, tEnd, tretPtr);
        const currentHeap = m.HEAPF64;
        t = currentHeap[tretPtr >> 3];
        steps++;

        const tTol = Math.max(this.options.minStep, 1e-15 * Math.max(1, Math.abs(lastT), Math.abs(t)));
        if (Math.abs(t - lastT) <= tTol && t < tEnd - tTol) {
          stuckCount++;
          if (stuckCount >= 10) {
            m._get_y(solverMem, yPtr);
            yOut.set(currentHeap.subarray(yPtr >> 3, (yPtr >> 3) + neq));
            this.currentT = t;
            return { success: false, t, y: yOut, steps, errorMessage: 'CVODE appears stuck (no meaningful time advance)' };
          }
        } else {
          stuckCount = 0;
        }
        lastT = t;

        if (flag === 2) {
          m._get_y(solverMem, yPtr);
          yOut.set(currentHeap.subarray(yPtr >> 3, (yPtr >> 3) + neq));
          this.currentT = t;
          return { success: true, t, y: yOut, steps, errorMessage: 'ROOT_FOUND' };
        }

        if (flag === 0 || flag === 1) {
          break;
        }

        if (flag === -1) {
          mxstep *= 2;
          if (mxstep > maxMxstep) {
            m._get_y(solverMem, yPtr);
            yOut.set(currentHeap.subarray(yPtr >> 3, (yPtr >> 3) + neq));
            this.currentT = t;
            return { success: false, t, y: yOut, steps, errorMessage: `CVODE exceeded max mxstep escalation (${maxMxstep})` };
          }
          if (m._set_max_num_steps) {
            m._set_max_num_steps(solverMem, mxstep);
          }
          continue;
        }

        m._get_y(solverMem, yPtr);
        yOut.set(currentHeap.subarray(yPtr >> 3, (yPtr >> 3) + neq));
        this.currentT = t;
        return { success: false, t, y: yOut, steps, errorMessage: `CVODE failed with flag ${flag}` };
      }

      const currentHeap = m.HEAPF64;
      m._get_y(solverMem, yPtr);
      yOut.set(currentHeap.subarray(yPtr >> 3, (yPtr >> 3) + neq));

      this.currentT = t;

      return { success: true, t, y: yOut, steps };

    } catch (e) {
      return { success: false, t, y: yOut, steps, errorMessage: `CVODE error: ${e}` };
    } finally {
      // Intentionally do not destroy solver here.
      // We keep CVODE state across successive integrate() calls to match BNG2 behavior.
    }
  }
}

/**
 * Sparse Implicit solver for extremely stiff systems
 * Uses Rosenbrock23 with aggressive settings for maximum stability
 */
class SparseImplicitSolver {
  private rosenbrock: Rosenbrock23Solver;

  constructor(n: number, f: DerivativeFunction, options: Partial<SolverOptions> = {}) {
    // Use very tight tolerances for stiff systems
    const stiffOptions = {
      ...options,
      atol: options.atol ?? 1e-10,
      rtol: options.rtol ?? 1e-8,
      maxSteps: options.maxSteps ?? 2000000,
      minStep: 1e-18,
      maxStep: options.maxStep ?? 1.0,
    };
    this.rosenbrock = new Rosenbrock23Solver(n, f, stiffOptions);
    console.log(`[SparseImplicitSolver] Created with atol=${stiffOptions.atol}, rtol=${stiffOptions.rtol}`);
  }

  integrate(
    y0: Float64Array,
    t0: number,
    tEnd: number,
    checkCancelled?: () => void
  ): SolverResult {
    console.log(`[SparseImplicitSolver] Integrating from t=${t0} to t=${tEnd}`);
    return this.rosenbrock.integrate(y0, t0, tEnd, checkCancelled);
  }
}

/**
 * Factory function to create appropriate solver
 */
export async function createSolver(
  n: number,
  f: DerivativeFunction,
  options: Partial<SolverOptions> = {}
): Promise<{ integrate: (y0: Float64Array, t0: number, tEnd: number, checkCancelled?: () => void) => SolverResult; destroy?: () => void }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  switch (opts.solver) {
    case 'cvode':
      await CVODESolver.init();
      return new CVODESolver(n, f, opts, false);
    case 'cvode_sparse':
      await CVODESolver.init();
      return new CVODESolver(n, f, opts, true);
    case 'cvode_jac':
      // CVODE with analytical Jacobian - requires jacobian function in options
      await CVODESolver.init();
      return new CVODESolver(n, f, opts, false, (options as any).jacobian);
    case 'rosenbrock23':
      return new Rosenbrock23Solver(n, f, opts);
    case 'rk45':
      return new RK45Solver(n, f, opts);
    case 'rk4':
      return new FastRK4Solver(n, f, opts);
    case 'cvode_auto':
      // Try CVODE first, fallback to Rosenbrock23 on failure
      await CVODESolver.init();
      return new CVODEAutoSolver(n, f, opts, new CVODESolver(n, f, opts, false));
    case 'sparse_implicit':
      // Sparse implicit solver with ILU preconditioning - for extremely stiff systems
      // Requires reactions and speciesNames in options
      console.log('[ODESolver] Using sparse_implicit solver');
      return new SparseImplicitSolver(n, f, opts);
    case 'webgpu_rk4':
      // WebGPU solver has async interface - for main simulation, use CPU fallback
      // WebGPU is better suited for ensemble/parameter scans via direct WebGPUODESolver import
      console.warn('[ODESolver] webgpu_rk4 selected - using CPU FastRK4 fallback. For GPU acceleration, use ensemble simulation API.');
      return new FastRK4Solver(n, f, opts);
    case 'auto':
    default:
      // Use CVODE as the primary solver (matches BNG2 behavior)
      // Falls back to Rosenbrock23 only if CVODE fails
      await CVODESolver.init();
      return new CVODEAutoSolver(n, f, opts, new CVODESolver(n, f, opts, false));
  }
}

/**
 * Smart auto-switching solver: starts with fast RK4, switches to Rosenbrock23 only if stiff
 */
export class SmartAutoSolver {
  private rk4: FastRK4Solver;
  private rosenbrock: Rosenbrock23Solver;
  private useImplicit: boolean = false;
  constructor(n: number, f: DerivativeFunction, options: Partial<SolverOptions> = {}) {
    this.rk4 = new FastRK4Solver(n, f, options);
    this.rosenbrock = new Rosenbrock23Solver(n, f, options);
  }

  integrate(
    y0: Float64Array,
    t0: number,
    tEnd: number,
    checkCancelled?: () => void
  ): SolverResult {
    // If already detected stiffness, use Rosenbrock
    if (this.useImplicit) {
      return this.rosenbrock.integrate(y0, t0, tEnd, checkCancelled);
    }

    // Try fast RK4 first
    const result = this.rk4.integrate(y0, t0, tEnd, checkCancelled);

    if (result.success) {
      return result;
    }

    // Check if stiffness was detected
    if (result.errorMessage === 'STIFF_DETECTED') {
      this.useImplicit = true;
      // Continue from where RK4 left off using Rosenbrock
      return this.rosenbrock.integrate(result.y, result.t, tEnd, checkCancelled);
    }

    // Other failure - return as is
    return result;
  }
}

/**
 * CVODE Auto-switching solver: tries CVODE first (fast for most models),
 * automatically falls back to Rosenbrock23 on convergence failure.
 * Similar to Julia's AutoTsit5(Rosenbrock23())
 */
export class CVODEAutoSolver {
  private cvode: CVODESolver | null = null;
  private rosenbrock: Rosenbrock23Solver;
  private useFallback: boolean = false;

  constructor(_n: number, f: DerivativeFunction, options: SolverOptions, cvode: CVODESolver) {
    this.cvode = cvode;
    this.rosenbrock = new Rosenbrock23Solver(_n, f, options);
  }

  integrate(
    y0: Float64Array,
    t0: number,
    tEnd: number,
    checkCancelled?: () => void
  ): SolverResult {
    // If already detected CVODE failure, use Rosenbrock
    if (this.useFallback || !this.cvode) {
      return this.rosenbrock.integrate(y0, t0, tEnd, checkCancelled);
    }

    // Try CVODE first
    const result = this.cvode.integrate(y0, t0, tEnd, checkCancelled);

    if (result.success) {
      return result;
    }

    // Check if this is a convergence failure (flag -4) or error test failure (flag -3)
    if (result.errorMessage?.includes('flag -4') ||
      result.errorMessage?.includes('flag -3') ||
      result.errorMessage?.includes('convergence')) {
      console.log('[CVODEAutoSolver] CVODE failed, switching to Rosenbrock23');
      this.useFallback = true;
      // Retry from beginning with Rosenbrock
      return this.rosenbrock.integrate(y0, t0, tEnd, checkCancelled);
    }

    // Other failure - return as is
    return result;
  }
}

