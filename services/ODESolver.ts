/**
 * ODESolver.ts - Stiff and non-stiff ODE solvers for biochemical systems
 * 
 * Implements:
 * - CVODE (WASM): High-performance stiff solver via SUNDIALS
 * - Rosenbrock23: L-stable 2nd order implicit method for stiff systems
 * - RK45 (Dormand-Prince): 5th order explicit method for non-stiff systems
 * - Auto-switching between methods based on stiffness detection
 */

// @ts-ignore
import createCVodeModule from './cvode_loader';

export interface SolverOptions {
  atol: number;           // Absolute tolerance
  rtol: number;           // Relative tolerance
  maxSteps: number;       // Maximum steps per interval
  minStep: number;        // Minimum step size before failure
  maxStep: number;        // Maximum step size
  initialStep?: number;   // Initial step size (if not provided, computed automatically)
  solver: 'auto' | 'cvode' | 'cvode_sparse' | 'rosenbrock23' | 'rk45' | 'rk4';
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
  atol: 1e-6,
  rtol: 1e-3,
  maxSteps: 1000000,
  minStep: 1e-15,
  maxStep: Infinity,
  solver: 'auto',
};

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
  private maxJacobianAge = 50;  // Reuse Jacobian for up to 50 steps to reduce overhead

  constructor(n: number, f: DerivativeFunction, options: Partial<SolverOptions> = {}) {
    this.n = n;
    this.f = f;
    this.options = { ...DEFAULT_OPTIONS, ...options };

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
  }

  /**
   * Compute numerical Jacobian using finite differences
   */
  private computeJacobian(y: Float64Array, f0: Float64Array): void {
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

  private readonly a21 = 1/5;
  private readonly a31 = 3/40;
  private readonly a32 = 9/40;
  private readonly a41 = 44/45;
  private readonly a42 = -56/15;
  private readonly a43 = 32/9;
  private readonly a51 = 19372/6561;
  private readonly a52 = -25360/2187;
  private readonly a53 = 64448/6561;
  private readonly a54 = -212/729;
  private readonly a61 = 9017/3168;
  private readonly a62 = -355/33;
  private readonly a63 = 46732/5247;
  private readonly a64 = 49/176;
  private readonly a65 = -5103/18656;
  // Stage 7 coefficients (a71, a73-a76 are same as b coefficients for FSAL)

  // 5th order solution coefficients
  private readonly b1 = 35/384;
  private readonly b3 = 500/1113;
  private readonly b4 = 125/192;
  private readonly b5 = -2187/6784;
  private readonly b6 = 11/84;

  // Error coefficients (difference between 5th and 4th order)
  private readonly e1 = 71/57600;
  private readonly e3 = -71/16695;
  private readonly e4 = 71/1920;
  private readonly e5 = -17253/339200;
  private readonly e6 = 22/525;
  private readonly e7 = -1/40;

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
            errorMessage: 'STIFF_DETECTED'  // Special marker for auto-switching
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
    if (result.errorMessage === 'STIFF_DETECTED') {
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
      if (yNew[i] < 0) yNew[i] = 0;  // Clamp to non-negative
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
      const deriv = Math.abs(dydt[i]);
      if (deriv > 1e-12) {
        const conc = y[i];
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
}

export class CVODESolver {
  private n: number;
  private f: DerivativeFunction;
  private options: SolverOptions;
  private useSparse: boolean;
  static module: CVodeModule | null = null;
  static initPromise: Promise<void> | null = null;
  
  constructor(n: number, f: DerivativeFunction, options: Partial<SolverOptions> = {}, useSparse: boolean = false) {
    this.n = n;
    this.f = f;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.useSparse = useSparse;
  }

  static async init() {
    if (this.module) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        this.module = await createCVodeModule({
          locateFile: (path: string) => {
            if (path.endsWith('.wasm')) {
              // Check if we're in Node.js or browser/worker
              const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
              if (isNode) {
                // In Node.js, use the services directory
                return __dirname + '/cvode.wasm';
              }
              // In browser/worker, detect base URL from self.location
              let baseUrl = '/';
              if (typeof self !== 'undefined' && self.location) {
                // Extract base path from current URL (works in both window and worker)
                const pathname = self.location.pathname;
                // Check if we're in /bngplayground/
                if (pathname.includes('/bngplayground/')) {
                  baseUrl = '/bngplayground/';
                }
              }
              return baseUrl + 'cvode.wasm';
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

    const neq = this.n;
    const { atol, rtol } = this.options;
    
    // Set callback (reusing module buffers)
    m.derivativeCallback = (_t: number, yPtr: number, ydotPtr: number) => {
      // Create views on the heap. Note: HEAPF64.buffer might change if memory grows,
      // but inside this sync callback it should be stable or accessible via Module.HEAPF64
      const yView = new Float64Array(m.HEAPF64.buffer, yPtr, neq);
      const dydtView = new Float64Array(m.HEAPF64.buffer, ydotPtr, neq);
      this.f(yView, dydtView);
    };

    // Allocate memory for state
    const yPtr = m._malloc(neq * 8);
    const yOut = new Float64Array(y0);
    
    // Copy initial state
    // Use HEAPF64 directly. Pointer is byte offset, need index for Float64Array (bytes/8)
    const heap = m.HEAPF64;
    heap.set(y0, yPtr >> 3);

    // Initialize solver
    let solverMem: number;
    if (this.useSparse) {
      solverMem = m._init_solver_sparse(neq, t0, yPtr, rtol, atol, this.options.maxSteps);
    } else {
      solverMem = m._init_solver(neq, t0, yPtr, rtol, atol, this.options.maxSteps);
    }
    
    if (!solverMem) {
      m._free(yPtr);
      return { success: false, t: t0, y: y0, steps: 0, errorMessage: "CVODE initialization failed" };
    }

    let t = t0;
    let steps = 0;
    const tretPtr = m._malloc(8); // Pointer for t_reached
    
    try {
      while (t < tEnd - 1e-12 * Math.abs(tEnd)) {
        if (checkCancelled) checkCancelled();
        if (steps >= this.options.maxSteps) {
            // Retrieve current y before returning failure
            m._get_y(solverMem, yPtr);
            const currentHeap = m.HEAPF64; // Re-fetch heap in case of growth
            yOut.set(currentHeap.subarray(yPtr >> 3, (yPtr >> 3) + neq));
            return { success: false, t, y: yOut, steps, errorMessage: "Max steps exceeded" };
        }

        // Target next step (let CVODE choose internal steps, but we can output frequently if needed)
        // Here we just step to tEnd for efficiency
        const tout = tEnd;
        const flag = m._solve_step(solverMem, tout, tretPtr);
        
        // Update t
        const currentHeap = m.HEAPF64;
        t = currentHeap[tretPtr >> 3];
        steps++;

        if (flag < 0) {
             m._get_y(solverMem, yPtr);
             yOut.set(currentHeap.subarray(yPtr >> 3, (yPtr >> 3) + neq));
             return { success: false, t, y: yOut, steps, errorMessage: `CVODE failed with flag ${flag}` };
        }
        
        if (t >= tEnd || Math.abs(t - tEnd) < 1e-12) {
             break;
        }
      }

      // Get final state
      m._get_y(solverMem, yPtr);
      const currentHeap = m.HEAPF64;
      yOut.set(currentHeap.subarray(yPtr >> 3, (yPtr >> 3) + neq));
      
      return { success: true, t, y: yOut, steps };

    } catch (e) {
      return { success: false, t, y: yOut, steps, errorMessage: `CVODE error: ${e}` };
    } finally {
      m._destroy_solver(solverMem);
      m._free(yPtr);
      m._free(tretPtr);
    }
  }
}

/**
 * Factory function to create appropriate solver
 */
export async function createSolver(
  n: number,
  f: DerivativeFunction,
  options: Partial<SolverOptions> = {}
): Promise<{ integrate: (y0: Float64Array, t0: number, tEnd: number, checkCancelled?: () => void) => SolverResult }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  console.log('[ODESolver] createSolver called with:', opts.solver);

  switch (opts.solver) {
    case 'cvode':
      await CVODESolver.init();
      return new CVODESolver(n, f, opts, false);
    case 'cvode_sparse':
      await CVODESolver.init();
      // @ts-ignore - allowing dynamic string for now
      return new CVODESolver(n, f, opts, true);
    case 'rosenbrock23':
      return new Rosenbrock23Solver(n, f, opts);
    case 'rk45':
      return new RK45Solver(n, f, opts);
    case 'rk4':
      return new FastRK4Solver(n, f, opts);
    case 'auto':
    default:
      // Auto could also use CVODE if verified stable, for now keep SmartAutoSolver
      // Or we can enhance SmartAuto to use CVODE
      return new SmartAutoSolver(n, f, opts);
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
