/**
 * Tests for DenseOutput module: HermiteInterpolant, DenseOutputBuffer, resampleTrajectory.
 *
 * Verifies cubic Hermite interpolation accuracy, binary search correctness,
 * batch evaluation, derivative computation, and edge cases.
 */
import { describe, expect, it } from 'vitest';
import {
  HermiteInterpolant,
  QuinticHermiteInterpolant,
  DenseOutputBuffer,
  resampleTrajectory,
} from '../../src/services/simulation/DenseOutput';

// ── Helpers ────────────────────────────────────────────────────────────

/** Build a Float64Array from plain numbers. */
function f64(...vals: number[]): Float64Array {
  return new Float64Array(vals);
}

/** Max absolute error between two Float64Arrays. */
function maxAbsError(a: Float64Array, b: Float64Array): number {
  let maxErr = 0;
  for (let i = 0; i < a.length; i++) {
    maxErr = Math.max(maxErr, Math.abs(a[i] - b[i]));
  }
  return maxErr;
}

// ── Test: Linear ODE y' = -y, y(0) = 1 ──────────────────────────────

describe('HermiteInterpolant', () => {
  it('should match exp(-t) for y\' = -y to 4th order accuracy', () => {
    // Use a step from t=0 to t=h with exact values and derivatives of exp(-t).
    // Cubic Hermite has local error O(h^4) for smooth solutions.
    const stepsizes = [0.1, 0.05, 0.025, 0.0125];
    const errors: number[] = [];

    for (const h of stepsizes) {
      const t0 = 0;
      const t1 = h;
      const y0 = f64(Math.exp(-t0));
      const y1 = f64(Math.exp(-t1));
      const f0 = f64(-Math.exp(-t0)); // y' = -y
      const f1 = f64(-Math.exp(-t1));

      const interp = new HermiteInterpolant(t0, t1, y0, y1, f0, f1);

      // Evaluate at midpoint
      const tMid = (t0 + t1) / 2;
      const yMid = interp.evaluate(tMid);
      const exact = Math.exp(-tMid);
      errors.push(Math.abs(yMid[0] - exact));
    }

    // Check convergence order: error should decrease by ~2^4 = 16 when h halves.
    // Ratio of consecutive errors should be ~16 for 4th order.
    for (let i = 1; i < errors.length; i++) {
      const ratio = errors[i - 1] / errors[i];
      // Allow some slack: ratio should be > 12 (close to 16)
      expect(ratio).toBeGreaterThan(12);
    }
  });

  it('should exactly reproduce cubic polynomials', () => {
    // For y(t) = 2t^3 - 3t^2 + t + 5, the cubic Hermite should be exact.
    const poly = (t: number) => 2 * t ** 3 - 3 * t ** 2 + t + 5;
    const dpoly = (t: number) => 6 * t ** 2 - 6 * t + 1;

    const t0 = 1.0;
    const t1 = 3.0;
    const y0 = f64(poly(t0));
    const y1 = f64(poly(t1));
    const f0 = f64(dpoly(t0));
    const f1 = f64(dpoly(t1));

    const interp = new HermiteInterpolant(t0, t1, y0, y1, f0, f1);

    // Test at several interior points
    const testPoints = [1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
    for (const t of testPoints) {
      const yInterp = interp.evaluate(t);
      expect(yInterp[0]).toBeCloseTo(poly(t), 12);
    }
  });

  it('should handle multi-dimensional systems', () => {
    // y1(t) = cos(t), y2(t) = sin(t)
    const t0 = 0;
    const t1 = 0.1;
    const y0 = f64(Math.cos(t0), Math.sin(t0));
    const y1 = f64(Math.cos(t1), Math.sin(t1));
    const f0 = f64(-Math.sin(t0), Math.cos(t0));
    const f1 = f64(-Math.sin(t1), Math.cos(t1));

    const interp = new HermiteInterpolant(t0, t1, y0, y1, f0, f1);
    const tMid = 0.05;
    const yMid = interp.evaluate(tMid);

    expect(yMid[0]).toBeCloseTo(Math.cos(tMid), 6);
    expect(yMid[1]).toBeCloseTo(Math.sin(tMid), 6);
  });

  it('should return exact values at interval endpoints', () => {
    const y0 = f64(1.0, 2.0, 3.0);
    const y1 = f64(4.0, 5.0, 6.0);
    const f0 = f64(0.5, 0.5, 0.5);
    const f1 = f64(0.5, 0.5, 0.5);

    const interp = new HermiteInterpolant(0, 1, y0, y1, f0, f1);

    const atStart = interp.evaluate(0);
    const atEnd = interp.evaluate(1);

    expect(maxAbsError(atStart, y0)).toBeLessThan(1e-15);
    expect(maxAbsError(atEnd, y1)).toBeLessThan(1e-15);
  });
});

// ── Test: Derivative interpolation ───────────────────────────────────

describe('HermiteInterpolant.evaluateDerivative', () => {
  it('should return exact derivatives at endpoints', () => {
    const y0 = f64(1.0);
    const y1 = f64(2.0);
    const f0 = f64(3.0);
    const f1 = f64(4.0);

    const interp = new HermiteInterpolant(0, 1, y0, y1, f0, f1);

    const dAtStart = interp.evaluateDerivative(0);
    const dAtEnd = interp.evaluateDerivative(1);

    expect(dAtStart[0]).toBeCloseTo(3.0, 12);
    expect(dAtEnd[0]).toBeCloseTo(4.0, 12);
  });

  it('should match analytical derivative for cubic polynomial', () => {
    const poly = (t: number) => t ** 3 + 2 * t ** 2 - t + 1;
    const dpoly = (t: number) => 3 * t ** 2 + 4 * t - 1;

    const t0 = 0;
    const t1 = 2;
    const interp = new HermiteInterpolant(
      t0, t1,
      f64(poly(t0)), f64(poly(t1)),
      f64(dpoly(t0)), f64(dpoly(t1))
    );

    const testPoints = [0, 0.5, 1.0, 1.5, 2.0];
    for (const t of testPoints) {
      const dInterp = interp.evaluateDerivative(t);
      expect(dInterp[0]).toBeCloseTo(dpoly(t), 10);
    }
  });

  it('should approximate derivative of exp(-t) accurately', () => {
    const h = 0.05;
    const t0 = 0;
    const t1 = h;
    const interp = new HermiteInterpolant(
      t0, t1,
      f64(Math.exp(-t0)), f64(Math.exp(-t1)),
      f64(-Math.exp(-t0)), f64(-Math.exp(-t1))
    );

    const tMid = h / 2;
    const dInterp = interp.evaluateDerivative(tMid);
    const exact = -Math.exp(-tMid);
    expect(Math.abs(dInterp[0] - exact)).toBeLessThan(1e-8);
  });
});

// ── Test: DenseOutputBuffer ──────────────────────────────────────────

describe('DenseOutputBuffer', () => {
  /** Build a buffer with N uniform intervals over [0, T] using y(t) = exp(-t). */
  function buildExpDecayBuffer(N: number, T: number): DenseOutputBuffer {
    const buf = new DenseOutputBuffer();
    const dt = T / N;
    for (let i = 0; i < N; i++) {
      const t0 = i * dt;
      const t1 = (i + 1) * dt;
      buf.addInterval(
        t0, t1,
        f64(Math.exp(-t0)), f64(Math.exp(-t1)),
        f64(-Math.exp(-t0)), f64(-Math.exp(-t1))
      );
    }
    return buf;
  }

  it('should evaluate correctly across multiple intervals via binary search', () => {
    const buf = buildExpDecayBuffer(20, 5.0);

    // Test at many points across the entire range
    const testTimes = [0, 0.13, 0.5, 1.0, 1.77, 2.5, 3.33, 4.0, 4.99, 5.0];
    for (const t of testTimes) {
      const yInterp = buf.evaluate(t);
      const exact = Math.exp(-t);
      // Cubic Hermite with h=0.25 on exp(-t): error is O(h^4) ~ 4e-5 per step
      expect(Math.abs(yInterp[0] - exact)).toBeLessThan(1e-4);
    }
  });

  it('should handle evaluation at exact interval boundaries', () => {
    const buf = buildExpDecayBuffer(10, 2.0);
    const dt = 0.2;

    for (let i = 0; i <= 10; i++) {
      const t = i * dt;
      const yInterp = buf.evaluate(t);
      expect(yInterp[0]).toBeCloseTo(Math.exp(-t), 12);
    }
  });

  it('should throw for empty buffer', () => {
    const buf = new DenseOutputBuffer();
    expect(() => buf.evaluate(0.5)).toThrow('no intervals stored');
  });

  it('should throw for t outside range', () => {
    const buf = buildExpDecayBuffer(5, 1.0);
    expect(() => buf.evaluate(-0.1)).toThrow('before the first interval');
    expect(() => buf.evaluate(1.1)).toThrow('after the last interval');
  });

  it('should reject non-chronological intervals', () => {
    const buf = new DenseOutputBuffer();
    buf.addInterval(0, 1, f64(1), f64(2), f64(0), f64(0));
    expect(() =>
      buf.addInterval(0.5, 1.5, f64(1), f64(2), f64(0), f64(0))
    ).toThrow('chronological');
  });

  it('should reject intervals where t1 <= t0', () => {
    const buf = new DenseOutputBuffer();
    expect(() =>
      buf.addInterval(1.0, 0.5, f64(1), f64(2), f64(0), f64(0))
    ).toThrow('must be > t0');
  });

  it('should report correct tStart, tEnd, length', () => {
    const buf = buildExpDecayBuffer(8, 4.0);
    expect(buf.tStart).toBeCloseTo(0, 14);
    expect(buf.tEnd).toBeCloseTo(4.0, 14);
    expect(buf.length).toBe(8);
  });

  it('should clear correctly', () => {
    const buf = buildExpDecayBuffer(5, 1.0);
    expect(buf.length).toBe(5);
    buf.clear();
    expect(buf.length).toBe(0);
    expect(() => buf.evaluate(0.5)).toThrow('no intervals stored');
  });
});

// ── Test: Batch evaluation ───────────────────────────────────────────

describe('DenseOutputBuffer.evaluateMany', () => {
  function buildExpDecayBuffer(N: number, T: number): DenseOutputBuffer {
    const buf = new DenseOutputBuffer();
    const dt = T / N;
    for (let i = 0; i < N; i++) {
      const t0 = i * dt;
      const t1 = (i + 1) * dt;
      buf.addInterval(
        t0, t1,
        f64(Math.exp(-t0)), f64(Math.exp(-t1)),
        f64(-Math.exp(-t0)), f64(-Math.exp(-t1))
      );
    }
    return buf;
  }

  it('should produce identical results to individual evaluate calls', () => {
    const buf = buildExpDecayBuffer(10, 3.0);
    const times = [0, 0.3, 0.7, 1.0, 1.5, 2.2, 2.9, 3.0];

    const batchResults = buf.evaluateMany(times);
    for (let i = 0; i < times.length; i++) {
      const singleResult = buf.evaluate(times[i]);
      expect(maxAbsError(batchResults[i], singleResult)).toBeLessThan(1e-15);
    }
  });

  it('should handle unsorted input', () => {
    const buf = buildExpDecayBuffer(10, 3.0);
    const times = [2.5, 0.3, 1.7, 0.0, 3.0, 1.0];

    const batchResults = buf.evaluateMany(times);
    for (let i = 0; i < times.length; i++) {
      const singleResult = buf.evaluate(times[i]);
      expect(maxAbsError(batchResults[i], singleResult)).toBeLessThan(1e-15);
    }
  });

  it('should return empty array for empty input', () => {
    const buf = buildExpDecayBuffer(5, 1.0);
    expect(buf.evaluateMany([])).toEqual([]);
  });

  it('should handle a large number of query points efficiently', () => {
    const buf = buildExpDecayBuffer(100, 10.0);
    const N = 10000;
    const times: number[] = [];
    for (let i = 0; i < N; i++) {
      times.push(10.0 * i / (N - 1));
    }

    const start = performance.now();
    const results = buf.evaluateMany(times);
    const elapsed = performance.now() - start;

    expect(results.length).toBe(N);
    // Should complete in well under 1 second
    expect(elapsed).toBeLessThan(1000);

    // Spot-check accuracy
    for (let i = 0; i < N; i += 1000) {
      expect(Math.abs(results[i][0] - Math.exp(-times[i]))).toBeLessThan(1e-6);
    }
  });
});

// ── Test: getDerivativeAt ────────────────────────────────────────────

describe('DenseOutputBuffer.getDerivativeAt', () => {
  it('should return accurate derivatives across intervals', () => {
    const buf = new DenseOutputBuffer();
    const N = 10;
    const T = 2.0;
    const dt = T / N;
    for (let i = 0; i < N; i++) {
      const t0 = i * dt;
      const t1 = (i + 1) * dt;
      buf.addInterval(
        t0, t1,
        f64(Math.exp(-t0)), f64(Math.exp(-t1)),
        f64(-Math.exp(-t0)), f64(-Math.exp(-t1))
      );
    }

    const testTimes = [0, 0.3, 0.7, 1.0, 1.5, 2.0];
    for (const t of testTimes) {
      const d = buf.getDerivativeAt(t);
      expect(Math.abs(d[0] - (-Math.exp(-t)))).toBeLessThan(1e-6);
    }
  });
});

// ── Test: resampleTrajectory ─────────────────────────────────────────

describe('resampleTrajectory', () => {
  function buildExpDecayBuffer(N: number, T: number): DenseOutputBuffer {
    const buf = new DenseOutputBuffer();
    const dt = T / N;
    for (let i = 0; i < N; i++) {
      const t0 = i * dt;
      const t1 = (i + 1) * dt;
      buf.addInterval(
        t0, t1,
        f64(Math.exp(-t0)), f64(Math.exp(-t1)),
        f64(-Math.exp(-t0)), f64(-Math.exp(-t1))
      );
    }
    return buf;
  }

  it('should produce the correct number of points', () => {
    const buf = buildExpDecayBuffer(10, 2.0);
    const result = resampleTrajectory(buf, 50);
    expect(result.length).toBe(50);
  });

  it('should cover [tStart, tEnd] exactly', () => {
    const buf = buildExpDecayBuffer(10, 3.0);
    const result = resampleTrajectory(buf, 20);
    expect(result[0].t).toBeCloseTo(0, 14);
    expect(result[result.length - 1].t).toBeCloseTo(3.0, 14);
  });

  it('should produce evenly-spaced time points', () => {
    const buf = buildExpDecayBuffer(10, 4.0);
    const result = resampleTrajectory(buf, 100);
    const expectedDt = 4.0 / 99;

    for (let i = 1; i < result.length; i++) {
      const dt = result[i].t - result[i - 1].t;
      expect(dt).toBeCloseTo(expectedDt, 10);
    }
  });

  it('should produce accurate interpolated values', () => {
    const buf = buildExpDecayBuffer(20, 5.0);
    const result = resampleTrajectory(buf, 200);

    for (const { t, y } of result) {
      expect(Math.abs(y[0] - Math.exp(-t))).toBeLessThan(1e-4);
    }
  });

  it('should throw for numPoints < 2', () => {
    const buf = buildExpDecayBuffer(5, 1.0);
    expect(() => resampleTrajectory(buf, 1)).toThrow('numPoints must be >= 2');
  });

  it('should throw for empty buffer', () => {
    const buf = new DenseOutputBuffer();
    expect(() => resampleTrajectory(buf, 10)).toThrow('buffer is empty');
  });

  it('should work with numPoints=2 (just endpoints)', () => {
    const buf = buildExpDecayBuffer(10, 2.0);
    const result = resampleTrajectory(buf, 2);
    expect(result.length).toBe(2);
    expect(result[0].t).toBeCloseTo(0, 14);
    expect(result[1].t).toBeCloseTo(2.0, 14);
    expect(result[0].y[0]).toBeCloseTo(1.0, 12);
    expect(result[1].y[0]).toBeCloseTo(Math.exp(-2), 12);
  });
});

// ── Test: QuinticHermiteInterpolant ──────────────────────────────────

describe('QuinticHermiteInterpolant', () => {
  it('should exactly reproduce polynomials up to degree 5', () => {
    // y(t) = t^5 - 2t^4 + 3t^3 - t^2 + 4t + 7
    const poly = (t: number) => t ** 5 - 2 * t ** 4 + 3 * t ** 3 - t ** 2 + 4 * t + 7;
    const dpoly = (t: number) => 5 * t ** 4 - 8 * t ** 3 + 9 * t ** 2 - 2 * t + 4;
    const ddpoly = (t: number) => 20 * t ** 3 - 24 * t ** 2 + 18 * t - 2;

    const t0 = 1.0;
    const t1 = 3.0;

    const interp = new QuinticHermiteInterpolant(
      t0, t1,
      f64(poly(t0)), f64(poly(t1)),
      f64(dpoly(t0)), f64(dpoly(t1)),
      f64(ddpoly(t0)), f64(ddpoly(t1))
    );

    const testPoints = [1.0, 1.3, 1.7, 2.0, 2.5, 2.8, 3.0];
    for (const t of testPoints) {
      const yInterp = interp.evaluate(t);
      expect(yInterp[0]).toBeCloseTo(poly(t), 10);
    }
  });

  it('should return exact values at endpoints', () => {
    const y0 = f64(10.0);
    const y1 = f64(20.0);
    const f0 = f64(1.0);
    const f1 = f64(2.0);
    const d0 = f64(0.5);
    const d1 = f64(-0.5);

    const interp = new QuinticHermiteInterpolant(0, 1, y0, y1, f0, f1, d0, d1);

    expect(interp.evaluate(0)[0]).toBeCloseTo(10.0, 12);
    expect(interp.evaluate(1)[0]).toBeCloseTo(20.0, 12);
  });

  it('should return exact derivatives at endpoints', () => {
    const y0 = f64(10.0);
    const y1 = f64(20.0);
    const f0 = f64(3.0);
    const f1 = f64(7.0);
    const d0 = f64(0.5);
    const d1 = f64(-0.5);

    const interp = new QuinticHermiteInterpolant(0, 1, y0, y1, f0, f1, d0, d1);

    expect(interp.evaluateDerivative(0)[0]).toBeCloseTo(3.0, 10);
    expect(interp.evaluateDerivative(1)[0]).toBeCloseTo(7.0, 10);
  });

  it('should have higher accuracy than cubic Hermite for exp(-t)', () => {
    const h = 0.5;
    const t0 = 0;
    const t1 = h;

    const cubicInterp = new HermiteInterpolant(
      t0, t1,
      f64(Math.exp(-t0)), f64(Math.exp(-t1)),
      f64(-Math.exp(-t0)), f64(-Math.exp(-t1))
    );

    const quinticInterp = new QuinticHermiteInterpolant(
      t0, t1,
      f64(Math.exp(-t0)), f64(Math.exp(-t1)),
      f64(-Math.exp(-t0)), f64(-Math.exp(-t1)),
      f64(Math.exp(-t0)), f64(Math.exp(-t1)) // y'' = y for exp(-t)
    );

    const tMid = h / 2;
    const exact = Math.exp(-tMid);
    const cubicErr = Math.abs(cubicInterp.evaluate(tMid)[0] - exact);
    const quinticErr = Math.abs(quinticInterp.evaluate(tMid)[0] - exact);

    // Quintic should be more accurate than cubic
    expect(quinticErr).toBeLessThan(cubicErr);
  });
});
