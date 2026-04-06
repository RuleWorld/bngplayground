import { errorNorm, hasInvalidValues, SOLVER_ERROR_STIFF_DETECTED } from '../../../utils/solverUtils';
import type { SolverOptions, SolverResult } from '../../../utils/solverUtils';
import { DEFAULT_SOLVER_OPTIONS } from '../../../utils/solverUtils';

type DerivativeFunction = (y: Float64Array, dydt: Float64Array) => void;

/**
 * Dormand-Prince RK45 solver with adaptive step size
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

  // FSAL: when true, k1 already contains f(y_n) from the previous accepted step's k7
  private fsalValid: boolean = false;

  constructor(n: number, f: DerivativeFunction, options: Partial<SolverOptions> = {}) {
    this.n = n;
    this.f = f;
    this.options = { ...DEFAULT_SOLVER_OPTIONS, ...options };

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

    // Stage 1 — FSAL: skip if k1 already contains f(y) from the previous step's k7
    if (!this.fsalValid) {
      this.f(y, this.k1);
    }
    this.fsalValid = false; // Invalidate for next call

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
        // FSAL: k7 = f(yNew) from Dormand-Prince is exactly k1 for the next step.
        // Copy k7 into k1 so the next step() call can skip the Stage 1 evaluation.
        this.k1.set(this.k7);
        this.fsalValid = true;
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
    this.options = { ...DEFAULT_SOLVER_OPTIONS, ...options };

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
