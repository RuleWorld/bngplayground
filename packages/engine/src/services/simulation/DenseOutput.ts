/**
 * DenseOutput.ts - Hermite dense output (continuous interpolation between integration steps).
 *
 * Provides cubic Hermite interpolation for ODE trajectories, enabling smooth
 * trajectory rendering, accurate event detection, and efficient post-processing
 * without requiring fine time grids from the solver.
 *
 * The cubic Hermite interpolant uses solution values and derivatives at the
 * endpoints of each integration step to reconstruct a C^1-continuous polynomial
 * approximation of the trajectory. For a step [t_n, t_{n+1}] with step size h:
 *
 *   theta = (t - t_n) / h
 *   y(theta) = (1-theta)*y0 + theta*y1
 *            + theta*(theta-1)*((1 - 2*theta)*(y1 - y0) + (theta - 1)*h*f0 + theta*h*f1)
 *
 * This is equivalent to the standard cubic Hermite basis functions (h00, h10, h01, h11)
 * and reproduces polynomials up to degree 3 exactly.
 *
 * Reference: DifferentialEquations.jl dense output, Hairer-Norsett-Wanner vol I sec II.6.
 */

/**
 * Stores Hermite interpolation data for a single integration step [t0, t1].
 */
export class HermiteInterpolant {
  readonly t0: number;
  readonly t1: number;
  readonly h: number;
  private readonly y0: Float64Array;
  private readonly y1: Float64Array;
  private readonly f0: Float64Array;
  private readonly f1: Float64Array;
  private readonly n: number;

  constructor(
    t0: number,
    t1: number,
    y0: Float64Array,
    y1: Float64Array,
    f0: Float64Array,
    f1: Float64Array
  ) {
    this.t0 = t0;
    this.t1 = t1;
    this.h = t1 - t0;
    // Store copies to avoid mutation from the caller
    this.n = y0.length;
    this.y0 = new Float64Array(y0);
    this.y1 = new Float64Array(y1);
    this.f0 = new Float64Array(f0);
    this.f1 = new Float64Array(f1);
  }

  /**
   * Evaluate the cubic Hermite interpolant at time t in [t0, t1].
   *
   * Uses the formula:
   *   theta = (t - t0) / h
   *   y(theta) = (1 - theta)*y0 + theta*y1
   *            + theta*(theta - 1)*((1 - 2*theta)*(y1 - y0) + (theta - 1)*h*f0 + theta*h*f1)
   */
  evaluate(t: number): Float64Array {
    const { h, y0, y1, f0, f1, n } = this;
    const theta = (t - this.t0) / h;
    const result = new Float64Array(n);

    const th_m1 = theta - 1;       // theta - 1
    const th_th_m1 = theta * th_m1; // theta * (theta - 1)
    const one_m_2th = 1 - 2 * theta;

    for (let i = 0; i < n; i++) {
      const dy = y1[i] - y0[i];
      result[i] = (1 - theta) * y0[i] + theta * y1[i]
        + th_th_m1 * (one_m_2th * dy + th_m1 * h * f0[i] + theta * h * f1[i]);
    }

    return result;
  }

  /**
   * Evaluate the derivative of the cubic Hermite interpolant at time t.
   *
   * dy/dt = (1/h) * dy/dtheta, where:
   *   dy/dtheta = (y1 - y0)
   *             + (2*theta - 1)*((1 - 2*theta)*(y1 - y0) + (theta - 1)*h*f0 + theta*h*f1)
   *             + theta*(theta - 1)*(-2*(y1 - y0) + h*f0 + h*f1)
   *
   * Derived by differentiating the cubic Hermite formula with respect to theta
   * and applying the chain rule dtheta/dt = 1/h.
   */
  evaluateDerivative(t: number): Float64Array {
    const { h, y0, y1, f0, f1, n } = this;
    const theta = (t - this.t0) / h;
    const result = new Float64Array(n);

    const th_m1 = theta - 1;
    const two_th_m1 = 2 * theta - 1;
    const one_m_2th = 1 - 2 * theta;
    const th_th_m1 = theta * th_m1;

    for (let i = 0; i < n; i++) {
      const dy = y1[i] - y0[i];
      const A = one_m_2th * dy + th_m1 * h * f0[i] + theta * h * f1[i];
      const B = -2 * dy + h * f0[i] + h * f1[i];
      // dy/dtheta = dy + (2*theta - 1)*A + theta*(theta - 1)*B
      const dydtheta = dy + two_th_m1 * A + th_th_m1 * B;
      result[i] = dydtheta / h;
    }

    return result;
  }
}

/**
 * Quintic Hermite interpolant using solution values, first derivatives,
 * and second derivatives at the endpoints.
 *
 * Uses a degree-5 polynomial that matches y, y', y'' at both endpoints,
 * providing O(h^6) local accuracy. Only useful when the solver provides
 * second derivative information (e.g., from implicit solver Jacobian evaluations).
 *
 * The quintic Hermite polynomial in terms of theta = (t - t0) / h:
 *   y(theta) = sum of six basis functions times data values.
 *
 * Basis functions (standard quintic Hermite):
 *   H00 = 1 - 10*theta^3 + 15*theta^4 - 6*theta^5
 *   H10 = theta - 6*theta^3 + 8*theta^4 - 3*theta^5
 *   H20 = 0.5*theta^2 - 1.5*theta^3 + 1.5*theta^4 - 0.5*theta^5
 *   H01 = 10*theta^3 - 15*theta^4 + 6*theta^5
 *   H11 = -4*theta^3 + 7*theta^4 - 3*theta^5
 *   H21 = 0.5*theta^3 - theta^4 + 0.5*theta^5
 */
export class QuinticHermiteInterpolant {
  readonly t0: number;
  readonly t1: number;
  readonly h: number;
  private readonly y0: Float64Array;
  private readonly y1: Float64Array;
  private readonly f0: Float64Array;
  private readonly f1: Float64Array;
  private readonly d0: Float64Array; // second derivatives at t0
  private readonly d1: Float64Array; // second derivatives at t1
  private readonly n: number;

  constructor(
    t0: number,
    t1: number,
    y0: Float64Array,
    y1: Float64Array,
    f0: Float64Array,
    f1: Float64Array,
    d0: Float64Array,
    d1: Float64Array
  ) {
    this.t0 = t0;
    this.t1 = t1;
    this.h = t1 - t0;
    this.n = y0.length;
    this.y0 = new Float64Array(y0);
    this.y1 = new Float64Array(y1);
    this.f0 = new Float64Array(f0);
    this.f1 = new Float64Array(f1);
    this.d0 = new Float64Array(d0);
    this.d1 = new Float64Array(d1);
  }

  evaluate(t: number): Float64Array {
    const { h, y0, y1, f0, f1, d0, d1, n } = this;
    const theta = (t - this.t0) / h;
    const result = new Float64Array(n);

    const th2 = theta * theta;
    const th3 = th2 * theta;
    const th4 = th3 * theta;
    const th5 = th4 * theta;

    // Quintic Hermite basis functions
    const H00 = 1 - 10 * th3 + 15 * th4 - 6 * th5;
    const H10 = theta - 6 * th3 + 8 * th4 - 3 * th5;
    const H20 = 0.5 * th2 - 1.5 * th3 + 1.5 * th4 - 0.5 * th5;
    const H01 = 10 * th3 - 15 * th4 + 6 * th5;
    const H11 = -4 * th3 + 7 * th4 - 3 * th5;
    const H21 = 0.5 * th3 - th4 + 0.5 * th5;

    const h2 = h * h;

    for (let i = 0; i < n; i++) {
      result[i] = H00 * y0[i] + H10 * h * f0[i] + H20 * h2 * d0[i]
                + H01 * y1[i] + H11 * h * f1[i] + H21 * h2 * d1[i];
    }

    return result;
  }

  evaluateDerivative(t: number): Float64Array {
    const { h, y0, y1, f0, f1, d0, d1, n } = this;
    const theta = (t - this.t0) / h;
    const result = new Float64Array(n);

    const th2 = theta * theta;
    const th3 = th2 * theta;
    const th4 = th3 * theta;

    // Derivatives of basis functions with respect to theta
    const dH00 = -30 * th2 + 60 * th3 - 30 * th4;
    const dH10 = 1 - 18 * th2 + 32 * th3 - 15 * th4;
    const dH20 = theta - 4.5 * th2 + 6 * th3 - 2.5 * th4;
    const dH01 = 30 * th2 - 60 * th3 + 30 * th4;
    const dH11 = -12 * th2 + 28 * th3 - 15 * th4;
    const dH21 = 1.5 * th2 - 4 * th3 + 2.5 * th4;

    const h2 = h * h;

    for (let i = 0; i < n; i++) {
      const dydtheta = dH00 * y0[i] + dH10 * h * f0[i] + dH20 * h2 * d0[i]
                     + dH01 * y1[i] + dH11 * h * f1[i] + dH21 * h2 * d1[i];
      result[i] = dydtheta / h;
    }

    return result;
  }
}

/**
 * Buffer that stores a sequence of Hermite interpolation intervals covering [t_start, t_end].
 *
 * Intervals must be added in chronological order. Evaluation uses binary search
 * to find the correct interval, then delegates to the interval's interpolant.
 */
export class DenseOutputBuffer {
  private intervals: HermiteInterpolant[] = [];
  private _tStart: number = NaN;
  private _tEnd: number = NaN;

  /** Start time of the first interval. */
  get tStart(): number { return this._tStart; }

  /** End time of the last interval. */
  get tEnd(): number { return this._tEnd; }

  /** Number of stored intervals. */
  get length(): number { return this.intervals.length; }

  /**
   * Append a new Hermite interpolation interval.
   * Intervals must be added in strictly increasing time order.
   */
  addInterval(
    t0: number,
    t1: number,
    y0: Float64Array,
    y1: Float64Array,
    f0: Float64Array,
    f1: Float64Array
  ): void {
    if (t1 <= t0) {
      throw new Error(`DenseOutputBuffer: t1 (${t1}) must be > t0 (${t0})`);
    }
    if (this.intervals.length > 0 && t0 < this._tEnd - 1e-14 * Math.abs(this._tEnd)) {
      throw new Error(
        `DenseOutputBuffer: intervals must be chronological. ` +
        `Last interval ended at ${this._tEnd}, new starts at ${t0}`
      );
    }
    const interpolant = new HermiteInterpolant(t0, t1, y0, y1, f0, f1);
    this.intervals.push(interpolant);
    if (this.intervals.length === 1) {
      this._tStart = t0;
    }
    this._tEnd = t1;
  }

  /**
   * Evaluate the dense output at a single time point.
   * Uses binary search to locate the interval containing t.
   *
   * @param t - Time at which to evaluate. Must be in [tStart, tEnd].
   * @returns Interpolated solution vector.
   * @throws If t is outside the covered range or buffer is empty.
   */
  evaluate(t: number): Float64Array {
    const interval = this.findInterval(t);
    return interval.evaluate(t);
  }

  /**
   * Evaluate the dense output at multiple time points.
   * Optimized for sorted input: uses sequential scan when times are in order.
   *
   * @param times - Array of time points to evaluate.
   * @returns Array of interpolated solution vectors.
   */
  evaluateMany(times: number[]): Float64Array[] {
    if (times.length === 0) return [];
    const results: Float64Array[] = new Array(times.length);

    // Check if times are sorted (common case for plotting)
    let sorted = true;
    for (let i = 1; i < times.length; i++) {
      if (times[i] < times[i - 1]) {
        sorted = false;
        break;
      }
    }

    if (sorted && this.intervals.length > 0) {
      // Sequential scan is O(n + m) for sorted queries
      let intervalIdx = 0;
      for (let i = 0; i < times.length; i++) {
        const t = times[i];
        // Advance interval index until we find the one containing t
        while (intervalIdx < this.intervals.length - 1 &&
               t > this.intervals[intervalIdx].t1 + 1e-14 * Math.abs(this.intervals[intervalIdx].t1)) {
          intervalIdx++;
        }
        // Clamp to valid range
        const interval = this.intervals[intervalIdx];
        const tClamped = Math.max(interval.t0, Math.min(interval.t1, t));
        results[i] = interval.evaluate(tClamped);
      }
    } else {
      // Fallback: binary search for each point
      for (let i = 0; i < times.length; i++) {
        results[i] = this.evaluate(times[i]);
      }
    }

    return results;
  }

  /**
   * Evaluate the derivative of the dense output at a single time point.
   */
  getDerivativeAt(t: number): Float64Array {
    const interval = this.findInterval(t);
    return interval.evaluateDerivative(t);
  }

  /**
   * Clear all stored intervals and reset the buffer.
   */
  clear(): void {
    this.intervals = [];
    this._tStart = NaN;
    this._tEnd = NaN;
  }

  /**
   * Binary search for the interval containing time t.
   * Returns the interval whose [t0, t1] range contains t (with tolerance).
   */
  private findInterval(t: number): HermiteInterpolant {
    const intervals = this.intervals;
    if (intervals.length === 0) {
      throw new Error('DenseOutputBuffer: no intervals stored');
    }

    // Handle boundary cases with tolerance
    const eps = 1e-14 * Math.max(1, Math.abs(this._tStart), Math.abs(this._tEnd));
    if (t < this._tStart - eps) {
      throw new Error(
        `DenseOutputBuffer: t=${t} is before the first interval (tStart=${this._tStart})`
      );
    }
    if (t > this._tEnd + eps) {
      throw new Error(
        `DenseOutputBuffer: t=${t} is after the last interval (tEnd=${this._tEnd})`
      );
    }

    // Clamp to exact boundaries
    if (t <= this._tStart) return intervals[0];
    if (t >= this._tEnd) return intervals[intervals.length - 1];

    // Binary search: find the interval where t0 <= t <= t1
    let lo = 0;
    let hi = intervals.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (t > intervals[mid].t1) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    return intervals[lo];
  }
}

/**
 * Resample a dense output buffer at evenly-spaced time points.
 *
 * This is more efficient than re-running the simulation with more steps,
 * and produces smooth output suitable for plotting. Users can zoom in
 * on a region and get smooth curves without re-solving.
 *
 * @param buffer - The dense output buffer containing Hermite interpolation data.
 * @param numPoints - Number of evenly-spaced output points (including endpoints).
 * @returns Array of { t, y } pairs at the resampled time points.
 */
export function resampleTrajectory(
  buffer: DenseOutputBuffer,
  numPoints: number
): { t: number; y: Float64Array }[] {
  if (numPoints < 2) {
    throw new Error('resampleTrajectory: numPoints must be >= 2');
  }
  if (buffer.length === 0) {
    throw new Error('resampleTrajectory: buffer is empty');
  }

  const tStart = buffer.tStart;
  const tEnd = buffer.tEnd;
  const dt = (tEnd - tStart) / (numPoints - 1);

  const times: number[] = new Array(numPoints);
  for (let i = 0; i < numPoints; i++) {
    times[i] = tStart + i * dt;
  }
  // Ensure last point is exactly tEnd (avoid floating-point drift)
  times[numPoints - 1] = tEnd;

  const ys = buffer.evaluateMany(times);
  const result: { t: number; y: Float64Array }[] = new Array(numPoints);
  for (let i = 0; i < numPoints; i++) {
    result[i] = { t: times[i], y: ys[i] };
  }
  return result;
}
