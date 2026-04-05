/**
 * TRBDF2Solver - Trapezoidal-BDF2 L-stable 2nd-order implicit method for stiff ODEs.
 *
 * TRBDF2 is a two-stage SDIRK-like method inspired by DifferentialEquations.jl:
 *   Stage 1: Trapezoidal rule from t_n to t_n + gamma*h  (gamma = 2 - sqrt(2))
 *   Stage 2: BDF2 step from t_n + gamma*h to t_n + h
 *
 * Both stages solve implicit systems via Newton iteration with LU-factorized
 * W = I - c*h*J. The Jacobian is reused across steps when Newton converges
 * quickly ("dirty Jacobian" strategy from CVODE).
 *
 * Key properties:
 * - L-stable (no spurious oscillations for very stiff problems)
 * - 2nd-order accurate
 * - Embedded error estimate from comparing TR and BDF2 stages
 * - Adaptive step size with PI controller
 * - Dense output via cubic Hermite interpolation
 * - Pure TypeScript, no WASM dependency
 *
 * Reference:
 *   Bank, Coughran, Fichtner, Grosse, Rose & Smith (1985).
 *   "Transient simulation of silicon devices and circuits."
 *   IEEE Trans. Electron Devices, ED-32, pp. 1992-2007.
 */

import {
  errorNorm,
  hasInvalidValues,
  type SolverOptions,
  type SolverResult,
  type DerivativeFunction,
  DEFAULT_SOLVER_OPTIONS,
} from '../../../utils/solverUtils';

// Re-export for convenience
export type { SolverOptions, SolverResult, DerivativeFunction };

// ── TRBDF2 constants ──────────────────────────────────────────────────

/** gamma = 2 - sqrt(2), the fraction of h for the trapezoidal stage */
const GAMMA = 2 - Math.SQRT2; // ~0.5857864376

/** Derived constants for BDF2 stage */
const GAMMA_INV = 1 / GAMMA;
const ONE_MINUS_GAMMA = 1 - GAMMA;
const BDF2_DENOM = GAMMA * (2 - GAMMA) / (2 * ONE_MINUS_GAMMA); // coefficient for BDF2
const W_BDF2 = ONE_MINUS_GAMMA / (GAMMA * (2 - GAMMA)); // BDF2 weight for y_n
const W_BDF2_GAMMA = 1 / (GAMMA * (2 - GAMMA)); // BDF2 weight for y_gamma (unused directly)

// ── LU Solver (row-major, partial pivoting) ──────────────────────────

class LUSolver {
  private n: number;
  private LU: Float64Array;
  private pivots: Int32Array;

  constructor(n: number) {
    this.n = n;
    this.LU = new Float64Array(n * n);
    this.pivots = new Int32Array(n);
  }

  /** Factorize matrix A (row-major). Returns false if singular. */
  factorize(A: Float64Array): boolean {
    const n = this.n;
    const LU = this.LU;
    const pivots = this.pivots;

    LU.set(A);

    for (let k = 0; k < n; k++) {
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

      if (maxIdx !== k) {
        for (let j = 0; j < n; j++) {
          const tmp = LU[k * n + j];
          LU[k * n + j] = LU[maxIdx * n + j];
          LU[maxIdx * n + j] = tmp;
        }
      }

      const pivot = LU[k * n + k];
      if (Math.abs(pivot) < 1e-30) {
        return false;
      }

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

  /** Solve Ax = b in-place (b overwritten with solution). */
  solve(b: Float64Array): void {
    const n = this.n;
    const LU = this.LU;
    const pivots = this.pivots;

    for (let k = 0; k < n; k++) {
      const pk = pivots[k];
      if (pk !== k) {
        const tmp = b[k];
        b[k] = b[pk];
        b[pk] = tmp;
      }
    }

    for (let i = 1; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < i; j++) {
        sum += LU[i * n + j] * b[j];
      }
      b[i] -= sum;
    }

    for (let i = n - 1; i >= 0; i--) {
      let sum = 0;
      for (let j = i + 1; j < n; j++) {
        sum += LU[i * n + j] * b[j];
      }
      b[i] = (b[i] - sum) / LU[i * n + i];
    }
  }
}

// ── Dense output storage ──────────────────────────────────────────────

export interface DenseOutputSegment {
  tStart: number;
  tEnd: number;
  yStart: Float64Array;
  yEnd: Float64Array;
  fStart: Float64Array;
  fEnd: Float64Array;
}

// ── TRBDF2 Solver ─────────────────────────────────────────────────────

export interface TRBDF2Config {
  atol?: number;
  rtol?: number;
  maxSteps?: number;
  maxNewtonIters?: number;
  initialStep?: number;
  minStep?: number;
  maxStep?: number;
  jacobianRowMajor?: (y: Float64Array, J: Float64Array) => void;
}

export class TRBDF2Solver {
  private n: number;
  private f: DerivativeFunction;
  private options: SolverOptions;
  private maxNewtonIters: number;

  // External analytical Jacobian (row-major)
  private externalJacobian?: (y: Float64Array, J: Float64Array) => void;

  // Pre-allocated work arrays
  private f0: Float64Array;       // f(t_n, y_n)
  private fGamma: Float64Array;   // f(t_n + gamma*h, y_gamma)
  private fNew: Float64Array;     // f(t_{n+1}, y_{n+1})
  private yGamma: Float64Array;   // intermediate solution at t_n + gamma*h
  private yNew: Float64Array;     // solution at t_{n+1}
  private yTR: Float64Array;      // trapezoidal solution (for error estimate)
  private delta: Float64Array;    // Newton correction
  private rhs: Float64Array;      // Newton RHS
  private yTemp: Float64Array;    // scratch for Jacobian FD
  private fTemp: Float64Array;    // scratch for Jacobian FD
  private jacobian: Float64Array; // row-major Jacobian
  private W: Float64Array;        // iteration matrix I - c*h*J
  private luSolver: LUSolver;

  // Jacobian reuse tracking (dirty Jacobian strategy)
  private jacobianAge: number = 0;
  private maxJacobianAge: number = 20;
  private lastStepRejected: boolean = false;
  private lastNewtonIters: number = 0;

  // FSAL (First Same As Last): when true, f0 already contains f(y_n) from the
  // previous accepted step's fNew, so we can skip the redundant evaluation.
  private fsalValid: boolean = false;

  // Error history for PI controller
  private errPrev: number = 1;

  // Dense output storage (last accepted step)
  private _denseSegment: DenseOutputSegment | null = null;

  constructor(n: number, f: DerivativeFunction, config: TRBDF2Config = {}) {
    this.n = n;
    this.f = f;
    this.maxNewtonIters = config.maxNewtonIters ?? 8;

    this.options = {
      ...DEFAULT_SOLVER_OPTIONS,
      atol: config.atol ?? 1e-8,
      rtol: config.rtol ?? 1e-8,
      maxSteps: config.maxSteps ?? 2000,
      minStep: config.minStep ?? 1e-15,
      maxStep: config.maxStep ?? Infinity,
      initialStep: config.initialStep,
    };

    this.externalJacobian = config.jacobianRowMajor;

    // Pre-allocate all work arrays
    this.f0 = new Float64Array(n);
    this.fGamma = new Float64Array(n);
    this.fNew = new Float64Array(n);
    this.yGamma = new Float64Array(n);
    this.yNew = new Float64Array(n);
    this.yTR = new Float64Array(n);
    this.delta = new Float64Array(n);
    this.rhs = new Float64Array(n);
    this.yTemp = new Float64Array(n);
    this.fTemp = new Float64Array(n);
    this.jacobian = new Float64Array(n * n);
    this.W = new Float64Array(n * n);
    this.luSolver = new LUSolver(n);
  }

  // ── Jacobian computation ──────────────────────────────────────────

  /**
   * Compute the row-major Jacobian df/dy at state y.
   * Uses analytical Jacobian if provided, else finite differences.
   */
  private computeJacobian(y: Float64Array, f0: Float64Array): void {
    if (this.externalJacobian) {
      this.externalJacobian(y, this.jacobian);
      this.jacobianAge = 0;
      return;
    }

    // Finite-difference Jacobian
    const n = this.n;
    const J = this.jacobian;
    const yTemp = this.yTemp;
    const fTemp = this.fTemp;
    const sqrtEps = 1.4901161193847656e-8;

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
   * Form and LU-factorize the iteration matrix W = I - c*h*J.
   * @param coeff - the product c*h where c is the stage coefficient
   * @returns true if factorization succeeded
   */
  private formAndFactorizeW(coeff: number): boolean {
    const n = this.n;
    const J = this.jacobian;
    const W = this.W;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const idx = i * n + j;
        W[idx] = (i === j ? 1 : 0) - coeff * J[idx];
      }
    }

    return this.luSolver.factorize(W);
  }

  // ── Newton solver ─────────────────────────────────────────────────

  /**
   * Solve the nonlinear system for the trapezoidal stage:
   *   y_gamma = y_n + (gamma*h/2) * (f(t_n, y_n) + f(t_n + gamma*h, y_gamma))
   *
   * Rearranged as:  y_gamma - (gamma*h/2)*f(t+gamma*h, y_gamma) = y_n + (gamma*h/2)*f_n
   * Newton: W * delta = -(y_gamma - y_n - (gamma*h/2)*(f_n + f(y_gamma)))
   * where W = I - (gamma*h/2)*J
   */
  private solveTrapezoidal(
    y: Float64Array, f0: Float64Array, h: number
  ): { converged: boolean; iters: number } {
    const n = this.n;
    const halfGammaH = 0.5 * GAMMA * h;
    const yGamma = this.yGamma;
    const rhs = this.rhs;
    const delta = this.delta;
    const { atol, rtol } = this.options;

    // Initial guess: explicit Euler
    for (let i = 0; i < n; i++) {
      yGamma[i] = y[i] + GAMMA * h * f0[i];
    }

    for (let iter = 0; iter < this.maxNewtonIters; iter++) {
      // Evaluate f at current guess
      this.f(yGamma, this.fGamma);

      // Residual: r = y_gamma - y_n - halfGammaH * (f_n + f_gamma)
      for (let i = 0; i < n; i++) {
        rhs[i] = -(yGamma[i] - y[i] - halfGammaH * (f0[i] + this.fGamma[i]));
      }

      // Solve W * delta = rhs
      delta.set(rhs);
      this.luSolver.solve(delta);

      // Update
      for (let i = 0; i < n; i++) {
        yGamma[i] += delta[i];
      }

      // Convergence check: weighted norm of delta
      let normSq = 0;
      for (let i = 0; i < n; i++) {
        const scale = atol + rtol * Math.abs(yGamma[i]);
        const r = delta[i] / scale;
        normSq += r * r;
      }
      const norm = Math.sqrt(normSq / n);

      if (norm < 1) {
        return { converged: true, iters: iter + 1 };
      }
    }

    return { converged: false, iters: this.maxNewtonIters };
  }

  /**
   * Solve the BDF2 stage:
   *   y_{n+1} = (1/gamma(2-gamma)) * ((1-gamma)^2 * y_n + y_gamma) - ...
   *
   * The BDF2 formula from t_n, t_{n+gamma*h}, t_{n+h}:
   *   (1/(1-gamma)) * y_{n+1} - (1/(gamma*(1-gamma))) * y_gamma + (gamma/(1-gamma)*(2-gamma)...) * y_n
   *     = h * w * f(t_{n+1}, y_{n+1})
   *
   * Using standard TRBDF2 formulation:
   *   d = (2 - gamma) / (2*(1-gamma))
   *   y_{n+1} - d*h*f(t_{n+1}, y_{n+1}) = rhs_bdf2
   * where
   *   rhs_bdf2 = (1/(gamma*(2-gamma)))*y_gamma - ((1-gamma)^2/(gamma*(2-gamma)))*y_n
   */
  private solveBDF2(
    y: Float64Array, h: number
  ): { converged: boolean; iters: number } {
    const n = this.n;
    const yGamma = this.yGamma;
    const yNew = this.yNew;
    const rhs = this.rhs;
    const delta = this.delta;
    const { atol, rtol } = this.options;

    // BDF2 coefficients for TRBDF2:
    // The second stage is a BDF2 with non-uniform spacing.
    // From t_n with step gamma*h, then from t_{n+gamma*h} with step (1-gamma)*h.
    //
    // BDF2 with steps h1 = gamma*h and h2 = (1-gamma)*h:
    //   omega = h2/h1 = (1-gamma)/gamma
    //   a0 = (1 + omega) / (1 + 2*omega)
    //   a1 = -omega^2 / (1 + 2*omega)  [for y_n]
    //   ... but it's simpler to use the standard TRBDF2 derivation.
    //
    // Standard TRBDF2 BDF2 stage:
    //   y_{n+1} = (1/(gamma*(2-gamma))) * y_gamma
    //           - ((1-gamma)^2 / (gamma*(2-gamma))) * y_n
    //           + ((1-gamma)/(2-gamma)) * h * f(t_{n+1}, y_{n+1})
    //
    // Define d_bdf2 = (1-gamma)/(2-gamma) as the implicit coefficient.

    const d_bdf2 = ONE_MINUS_GAMMA / (2 - GAMMA);
    const c1 = 1 / (GAMMA * (2 - GAMMA));                    // coeff for y_gamma
    const c0 = -(ONE_MINUS_GAMMA * ONE_MINUS_GAMMA) / (GAMMA * (2 - GAMMA)); // coeff for y_n

    // Compute constant part of BDF2 RHS
    // rhs_const = c1 * y_gamma + c0 * y_n
    // The equation: y_{n+1} - d_bdf2 * h * f(t_{n+1}, y_{n+1}) = rhs_const
    // Newton residual: r = y_{n+1} - rhs_const - d_bdf2*h*f(t_{n+1}, y_{n+1})

    // Form W = I - d_bdf2*h*J (must refactorize since coefficient differs from TR stage)
    if (!this.formAndFactorizeW(d_bdf2 * h)) {
      return { converged: false, iters: 0 };
    }

    // Initial guess: extrapolate from trapezoidal stage
    for (let i = 0; i < n; i++) {
      yNew[i] = yGamma[i] + (ONE_MINUS_GAMMA / GAMMA) * (yGamma[i] - y[i]);
    }

    for (let iter = 0; iter < this.maxNewtonIters; iter++) {
      this.f(yNew, this.fNew);

      // Residual: r = y_{n+1} - c1*y_gamma - c0*y_n - d_bdf2*h*f_{n+1}
      for (let i = 0; i < n; i++) {
        rhs[i] = -(yNew[i] - c1 * yGamma[i] - c0 * y[i] - d_bdf2 * h * this.fNew[i]);
      }

      // Solve W * delta = rhs
      delta.set(rhs);
      this.luSolver.solve(delta);

      // Update
      for (let i = 0; i < n; i++) {
        yNew[i] += delta[i];
      }

      // Convergence check
      let normSq = 0;
      for (let i = 0; i < n; i++) {
        const scale = atol + rtol * Math.abs(yNew[i]);
        const r = delta[i] / scale;
        normSq += r * r;
      }
      const norm = Math.sqrt(normSq / n);

      if (norm < 1) {
        return { converged: true, iters: iter + 1 };
      }
    }

    return { converged: false, iters: this.maxNewtonIters };
  }

  // ── Error estimation ──────────────────────────────────────────────

  /**
   * Estimate local error from the difference between the trapezoidal
   * extrapolation and the BDF2 solution.
   *
   * The trapezoidal method from t_n to t_{n+1} would give:
   *   y_TR = y_n + (h/2)*(f_n + f_{n+1})
   *
   * The error estimate is the difference between this and the BDF2 result.
   * This gives an O(h^3) error estimate for the O(h^2) method.
   */
  private computeError(y: Float64Array, h: number): number {
    const n = this.n;
    const yNew = this.yNew;
    const yTR = this.yTR;
    const f0 = this.f0;
    const { atol, rtol } = this.options;

    // Compute f at the new point (already stored in fNew from BDF2 stage)
    // Trapezoidal solution over the full step
    for (let i = 0; i < n; i++) {
      yTR[i] = y[i] + 0.5 * h * (f0[i] + this.fNew[i]);
    }

    // Error = yNew - yTR (difference between BDF2 and full trapezoidal)
    // This measures the discrepancy between two 2nd-order methods,
    // giving an O(h^3) local error estimate.
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const errI = yNew[i] - yTR[i];
      const scale = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(yNew[i]));
      const r = errI / scale;
      sumSq += r * r;
    }

    return Math.sqrt(sumSq / n);
  }

  // ── Single step ───────────────────────────────────────────────────

  /**
   * Take a single TRBDF2 step from t with step size h.
   */
  step(y: Float64Array, t: number, h: number): {
    accepted: boolean;
    hNew: number;
    yNew: Float64Array;
    errNorm: number;
  } {
    const n = this.n;
    const { atol, rtol } = this.options;

    // FSAL: skip f0 evaluation if we already have f(y_n) from the previous
    // accepted step (fNew was copied into f0 at the end of the integrate loop).
    if (!this.fsalValid) {
      this.f(y, this.f0);
    }
    // Invalidate FSAL for next call (will be re-enabled after accepted step)
    this.fsalValid = false;

    // Recompute Jacobian if stale or after rejection
    const needJacobian =
      this.jacobianAge >= this.maxJacobianAge ||
      this.lastStepRejected ||
      this.lastNewtonIters > 4; // Slow convergence suggests stale Jacobian

    if (needJacobian) {
      this.computeJacobian(y, this.f0);
    }

    // Stage 1: Trapezoidal step to t + gamma*h
    // Form W = I - (gamma*h/2)*J for the trapezoidal solve
    const halfGammaH = 0.5 * GAMMA * h;
    if (!this.formAndFactorizeW(halfGammaH)) {
      return { accepted: false, hNew: h * 0.5, yNew: this.yNew, errNorm: Infinity };
    }

    const tr = this.solveTrapezoidal(y, this.f0, h);
    if (!tr.converged) {
      // Force Jacobian refresh on next attempt
      this.jacobianAge = this.maxJacobianAge;
      return { accepted: false, hNew: h * 0.5, yNew: this.yNew, errNorm: Infinity };
    }

    // Stage 2: BDF2 step from t + gamma*h to t + h
    // (formAndFactorizeW is called inside solveBDF2 with the BDF2 coefficient)
    const bdf2 = this.solveBDF2(y, h);
    if (!bdf2.converged) {
      this.jacobianAge = this.maxJacobianAge;
      return { accepted: false, hNew: h * 0.5, yNew: this.yNew, errNorm: Infinity };
    }

    this.lastNewtonIters = Math.max(tr.iters, bdf2.iters);

    // Evaluate f at new point for error estimate and dense output
    this.f(this.yNew, this.fNew);

    // Clamp negative concentrations
    for (let i = 0; i < n; i++) {
      if (this.yNew[i] < 0) this.yNew[i] = 0;
    }

    // Check for invalid values
    if (hasInvalidValues(this.yNew)) {
      return { accepted: false, hNew: h * 0.25, yNew: this.yNew, errNorm: Infinity };
    }

    // Error estimation
    const errNorm = this.computeError(y, h);

    if (!Number.isFinite(errNorm)) {
      return { accepted: false, hNew: h * 0.25, yNew: this.yNew, errNorm: Infinity };
    }

    // Step size control: PI controller
    //   dt_new = dt * safety * (tol/err)^0.7 * (tol/err_prev)^(-0.4)
    const safety = 0.9;
    const minScale = 0.2;
    const maxScale = 5.0;

    let scale: number;
    if (errNorm === 0) {
      scale = maxScale;
    } else {
      // PI controller exponents for 2nd order method
      const ki = 0.7 / 2; // integral gain = 0.7 / order
      const kp = 0.4 / 2; // proportional gain = 0.4 / order
      scale = safety * Math.pow(1 / errNorm, ki) * Math.pow(1 / this.errPrev, kp);
    }
    scale = Math.max(minScale, Math.min(maxScale, scale));

    const accepted = errNorm <= 1;

    if (accepted) {
      this.jacobianAge++;
      this.errPrev = Math.max(errNorm, 1e-4); // prevent division issues

      // Limit growth after rejection
      if (this.lastStepRejected) {
        scale = Math.min(scale, 1.0);
      }
      this.lastStepRejected = false;

      // Increase Jacobian reuse limit when Newton converges fast
      if (this.lastNewtonIters <= 2) {
        this.maxJacobianAge = Math.min(this.maxJacobianAge + 1, 50);
      } else if (this.lastNewtonIters > 5) {
        this.maxJacobianAge = Math.max(this.maxJacobianAge - 5, 5);
      }

      // Store dense output data
      this._denseSegment = {
        tStart: t,
        tEnd: t + h,
        yStart: new Float64Array(y),
        yEnd: new Float64Array(this.yNew),
        fStart: new Float64Array(this.f0),
        fEnd: new Float64Array(this.fNew),
      };
    } else {
      this.lastStepRejected = true;
      // On rejection, halve step (PI controller may suggest less)
      scale = Math.min(scale, 0.5);
    }

    const hNew = h * scale;

    return { accepted, hNew, yNew: this.yNew, errNorm };
  }

  // ── Integration ───────────────────────────────────────────────────

  /**
   * Integrate from t0 to tEnd.
   *
   * @param y0 - initial state (not modified)
   * @param t0 - initial time
   * @param tEnd - target time
   * @param checkCancelled - optional cancellation callback
   * @returns SolverResult
   */
  integrate(
    y0: Float64Array,
    t0: number,
    tEnd: number,
    checkCancelled?: () => void,
  ): SolverResult {
    const { maxSteps, minStep, maxStep } = this.options;

    let t = t0;
    const y = new Float64Array(y0);

    // Estimate initial step size
    this.f(y, this.f0);
    this.fsalValid = true; // f0 is now valid for the first step() call
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
          errorMessage: `Max steps (${maxSteps}) exceeded at t=${t.toExponential(4)}`,
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
        // FSAL: copy fNew into f0 so the next step() can skip the f0 evaluation.
        // fNew = f(yNew) was computed at the end of the accepted step.
        this.f0.set(this.fNew);
        this.fsalValid = true;
      } else {
        rejections++;
        if (rejections > 100) {
          return {
            success: false,
            t,
            y,
            steps,
            errorMessage: `Excessive step rejections at t=${t.toExponential(4)}`,
          };
        }
      }

      const nextH = Math.max(result.hNew, minStep);

      if (nextH < minStep && t < tEnd - minStep) {
        return {
          success: false,
          t,
          y,
          steps,
          errorMessage: `Step size too small (h=${nextH.toExponential(4)}) at t=${t.toExponential(4)}`,
        };
      }

      h = nextH;
    }

    return { success: true, t, y, steps };
  }

  // ── Dense output ──────────────────────────────────────────────────

  /**
   * Get the dense output segment from the last accepted step.
   */
  get denseSegment(): DenseOutputSegment | null {
    return this._denseSegment;
  }

  /**
   * Cubic Hermite interpolation within the last accepted step.
   *
   * For t in [t_n, t_{n+1}]:
   *   theta = (t - t_n) / h
   *   y(t) = (1-theta)*y_n + theta*y_{n+1}
   *        + theta*(theta-1)*((1-2*theta)*(y_{n+1}-y_n) + (theta-1)*h*f_n + theta*h*f_{n+1})
   *
   * @param t - interpolation time
   * @param out - output array (allocated by caller)
   * @returns true if interpolation succeeded
   */
  interpolate(t: number, out: Float64Array): boolean {
    const seg = this._denseSegment;
    if (!seg) return false;

    const h = seg.tEnd - seg.tStart;
    if (h <= 0) return false;

    const theta = (t - seg.tStart) / h;
    if (theta < -1e-10 || theta > 1 + 1e-10) return false;

    // Clamp theta to [0,1]
    const th = Math.max(0, Math.min(1, theta));
    const n = seg.yStart.length;

    for (let i = 0; i < n; i++) {
      const dy = seg.yEnd[i] - seg.yStart[i];
      const b1 = th * (th - 1) * ((1 - 2 * th) * dy + (th - 1) * h * seg.fStart[i] + th * h * seg.fEnd[i]);
      out[i] = (1 - th) * seg.yStart[i] + th * seg.yEnd[i] + b1;
    }

    return true;
  }

  // ── Initial step size estimation ──────────────────────────────────

  /**
   * Estimate initial step size from ||f(t0,y0)|| using the Hairer-Wanner
   * algorithm (Solving ODEs II, p.169).
   */
  private estimateInitialStep(y: Float64Array, f0: Float64Array, span: number): number {
    const { atol, rtol } = this.options;
    const n = this.n;

    let y_norm = 0;
    let f_norm = 0;
    for (let i = 0; i < n; i++) {
      const scale = atol + rtol * Math.abs(y[i]);
      y_norm += (y[i] / scale) ** 2;
      f_norm += (f0[i] / scale) ** 2;
    }
    y_norm = Math.sqrt(y_norm / n);
    f_norm = Math.sqrt(f_norm / n);

    let h0: number;
    if (f_norm < 1e-10 || y_norm < 1e-10) {
      h0 = 1e-6;
    } else {
      h0 = 0.01 * (y_norm / f_norm);
    }

    h0 = Math.min(h0, span * 0.1);
    h0 = Math.max(h0, 1e-10);

    return h0;
  }
}
