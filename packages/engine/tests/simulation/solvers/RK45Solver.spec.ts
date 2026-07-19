import { describe, it, expect, vi } from 'vitest';
import { RK45Solver, FastRK4Solver } from '../../../src/services/simulation/solvers/RK45Solver';
import { SOLVER_ERROR_STIFF_DETECTED } from '../../../src/utils/solverUtils';

describe('RK45Solver', () => {
  it('should solve a simple exponential decay ODE', () => {
    // dy/dt = -0.5 * y
    // Exact solution: y(t) = y(0) * exp(-0.5 * t)
    const decayConst = 0.5;
    const f = (y: Float64Array, dydt: Float64Array) => {
      dydt[0] = -decayConst * y[0];
    };

    const solver = new RK45Solver(1, f, { atol: 1e-6, rtol: 1e-6 });
    const y0 = new Float64Array([100]);

    const result = solver.integrate(y0, 0, 10);

    expect(result.success).toBe(true);
    expect(result.t).toBeCloseTo(10, 5);

    // Expected y(10) = 100 * exp(-5)
    const expected = 100 * Math.exp(-5);
    expect(result.y[0]).toBeCloseTo(expected, 3);
    expect(result.steps).toBeGreaterThan(0);
  });

  it('should return error when max steps exceeded', () => {
    const f = (y: Float64Array, dydt: Float64Array) => {
      dydt[0] = -0.5 * y[0];
    };

    // Force small step size and small maxSteps
    const solver = new RK45Solver(1, f, { maxSteps: 5, maxStep: 0.1 });
    const y0 = new Float64Array([100]);

    const result = solver.integrate(y0, 0, 10);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('Max steps');
  });

  it('should cancel when checkCancelled is called', () => {
    const f = (y: Float64Array, dydt: Float64Array) => {
      dydt[0] = -0.5 * y[0];
    };

    const solver = new RK45Solver(1, f);
    const y0 = new Float64Array([100]);

    const cancelError = new Error('Cancelled');
    const checkCancelled = vi.fn().mockImplementation(() => {
      throw cancelError;
    });

    expect(() => solver.integrate(y0, 0, 10, checkCancelled)).toThrow(cancelError);
  });

  it('should handle stiff systems gracefully by returning stiff detected error', () => {
    // Very stiff equation: dy/dt = -1000 * y + 1000
    // Will cause many rejections and trigger the stiff detection
    const f = (y: Float64Array, dydt: Float64Array) => {
      dydt[0] = -1000000000 * y[0] + 1000000000;
    };

    const solver = new RK45Solver(1, f, { maxStep: 1, minStep: 1e-12, initialStep: 1 });
    const y0 = new Float64Array([0]);

    const result = solver.integrate(y0, 0, 10);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe(SOLVER_ERROR_STIFF_DETECTED);
  });

  it('should handle invalid values (NaN) during integration', () => {
    const f = (y: Float64Array, dydt: Float64Array) => {
      dydt[0] = NaN; // Force NaN
    };

    // FastRK4Solver and RK45Solver return different errors on NaN
    const solver = new RK45Solver(1, f);
    const y0 = new Float64Array([1]);

    const result = solver.integrate(y0, 0, 10);

    expect(result.success).toBe(false);
    // errNorm will be Infinity and step not accepted, h will keep halving until minStep or it returns STIFF_DETECTED
    expect(result.errorMessage).toBeDefined();
  });
});

describe('FastRK4Solver', () => {
  it('should solve a simple ODE', () => {
    // dy/dt = -0.5 * y
    const f = (y: Float64Array, dydt: Float64Array) => {
      dydt[0] = -0.5 * y[0];
    };

    const solver = new FastRK4Solver(1, f);
    const y0 = new Float64Array([100]);

    const result = solver.integrate(y0, 0, 10);

    expect(result.success).toBe(true);
    expect(result.t).toBeCloseTo(10, 5);

    const expected = 100 * Math.exp(-5);
    expect(result.y[0]).toBeCloseTo(expected, 1);
  });

  it('should return error when max steps exceeded', () => {
    const f = (y: Float64Array, dydt: Float64Array) => {
      dydt[0] = -0.5 * y[0];
    };

    const solver = new FastRK4Solver(1, f, { maxSteps: 5, maxStep: 0.1 });
    const y0 = new Float64Array([100]);

    const result = solver.integrate(y0, 0, 10);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('Max steps');
  });

  it('should return STIFF_DETECTED when values go too negative', () => {
    // Large negative rate forces large negative step output
    const f = (y: Float64Array, dydt: Float64Array) => {
      dydt[0] = -1000000000 * y[0];
    };

    const solver = new FastRK4Solver(1, f, { maxStep: 1, initialStep: 1 });
    const y0 = new Float64Array([100]);

    const result = solver.integrate(y0, 0, 10);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe(SOLVER_ERROR_STIFF_DETECTED);
  });

  it('should handle small consecutive steps as STIFF_DETECTED', () => {
    const f = (y: Float64Array, dydt: Float64Array) => {
      // Force large deriv so step size estimator returns tiny steps
      dydt[0] = -1e10 * y[0];
    };

    // Need initial value to be small enough so it doesn't trigger negative constraint right away,
    // but deriv large enough so maxH limits it
    const solver = new FastRK4Solver(1, f);
    const y0 = new Float64Array([1e-5]); // Needs to be > minConc (1e-9) to trigger step size reduction

    const result = solver.integrate(y0, 0, 10);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe(SOLVER_ERROR_STIFF_DETECTED);
  });

  it('should handle invalid values', () => {
    const f = (y: Float64Array, dydt: Float64Array) => {
      dydt[0] = NaN;
    };

    const solver = new FastRK4Solver(1, f);
    const y0 = new Float64Array([1]);

    const result = solver.integrate(y0, 0, 10);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('NaN/Infinity detected');
  });

  it('should not be dominated by small producing concentrations in step estimation', () => {
    let called = 0;
    const f = (y: Float64Array, dydt: Float64Array) => {
      // species 0 is very small, and being produced
      dydt[0] = 100;

      // species 1 is normal
      dydt[1] = -0.1 * y[1];
      called++;
    };

    const solver = new FastRK4Solver(2, f, { maxStep: 1 });
    const y0 = new Float64Array([1e-10, 100]); // species 0 is < minConc (1e-9)

    const result = solver.integrate(y0, 0, 1);

    expect(result.success).toBe(true);
    // It should skip species 0 for step estimation and use maxStep=1 or limit from species 1
    // (deriv=10, limit=100*0.2=20, maxStep=20/10=2). So it uses maxH=1.
    // Meaning it should take 1 step (plus checks).
    // Let's just verify it succeeds without erroring or taking excessive steps
    expect(result.steps).toBeLessThan(10);
  });
});
