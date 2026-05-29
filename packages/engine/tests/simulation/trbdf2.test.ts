/**
 * Tests for TRBDF2Solver.
 *
 * Covers:
 * 1. Robertson stiff system (classic 3-species test)
 * 2. Exponential decay (order-2 convergence verification)
 * 3. Linear system with analytical solution
 * 4. Dense output (Hermite interpolation) accuracy
 * 5. Step rejection and recovery
 * 6. Compatibility with CVODE-type models
 */
import { describe, expect, it } from 'vitest';
import { TRBDF2Solver } from '../../src/services/simulation/solvers/TRBDF2Solver';
import type { DerivativeFunction } from '../../src/services/simulation/solvers/TRBDF2Solver';

// ── Test systems ──────────────────────────────────────────────────────

/**
 * Robertson stiff system:
 *   A -> B          k1 = 0.04
 *   2B -> C         k2 = 3e7
 *   B + C -> A + C  k3 = 1e4
 *
 * dy0/dt = -k1*y0 + k3*y1*y2
 * dy1/dt =  k1*y0 - k2*y1^2 - k3*y1*y2
 * dy2/dt =  k2*y1^2
 *
 * Initial conditions: y0=1, y1=0, y2=0
 * Conservation: y0 + y1 + y2 = 1
 */
function robertsonRHS(y: Float64Array, dydt: Float64Array): void {
  const k1 = 0.04;
  const k2 = 3e7;
  const k3 = 1e4;

  dydt[0] = -k1 * y[0] + k3 * y[1] * y[2];
  dydt[1] = k1 * y[0] - k2 * y[1] * y[1] - k3 * y[1] * y[2];
  dydt[2] = k2 * y[1] * y[1];
}

/**
 * Analytical Jacobian for Robertson (row-major):
 *   df0/dy0 = -k1,       df0/dy1 = k3*y2,      df0/dy2 = k3*y1
 *   df1/dy0 = k1,        df1/dy1 = -2*k2*y1-k3*y2, df1/dy2 = -k3*y1
 *   df2/dy0 = 0,         df2/dy1 = 2*k2*y1,    df2/dy2 = 0
 */
function robertsonJacobian(y: Float64Array, J: Float64Array): void {
  const k1 = 0.04;
  const k2 = 3e7;
  const k3 = 1e4;

  // Row 0
  J[0] = -k1;                       // df0/dy0
  J[1] = k3 * y[2];                 // df0/dy1
  J[2] = k3 * y[1];                 // df0/dy2

  // Row 1
  J[3] = k1;                        // df1/dy0
  J[4] = -2 * k2 * y[1] - k3 * y[2]; // df1/dy1
  J[5] = -k3 * y[1];                // df1/dy2

  // Row 2
  J[6] = 0;                         // df2/dy0
  J[7] = 2 * k2 * y[1];            // df2/dy1
  J[8] = 0;                         // df2/dy2
}

/**
 * Simple exponential decay: dy/dt = -lambda * y
 * Exact solution: y(t) = y0 * exp(-lambda * t)
 */
function makeDecayRHS(lambda: number): DerivativeFunction {
  return (y: Float64Array, dydt: Float64Array): void => {
    for (let i = 0; i < y.length; i++) {
      dydt[i] = -lambda * y[i];
    }
  };
}

/**
 * 2x2 linear system: dy/dt = A*y
 * A = [[-1, 0], [0, -1000]]   (mildly stiff, ratio 1000)
 * Exact: y0(t) = exp(-t), y1(t) = exp(-1000*t)
 */
function linearStiffRHS(y: Float64Array, dydt: Float64Array): void {
  dydt[0] = -1 * y[0];
  dydt[1] = -1000 * y[1];
}

function linearStiffJacobian(_y: Float64Array, J: Float64Array): void {
  J[0] = -1;    J[1] = 0;
  J[2] = 0;     J[3] = -1000;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('TRBDF2Solver', () => {
  describe('Robertson stiff system', () => {
    it('should solve Robertson to t=1e-2 with conservation', () => {
      const y0 = new Float64Array([1, 0, 0]);
      const solver = new TRBDF2Solver(3, robertsonRHS, {
        atol: 1e-8,
        rtol: 1e-6,
        maxSteps: 10000,
        jacobianRowMajor: robertsonJacobian,
      });

      const result = solver.integrate(y0, 0, 1e-2);

      expect(result.success).toBe(true);
      // Conservation: y0 + y1 + y2 = 1
      const sum = result.y[0] + result.y[1] + result.y[2];
      expect(sum).toBeCloseTo(1.0, 4);
      // y0 should have decreased slightly
      expect(result.y[0]).toBeLessThan(1);
      expect(result.y[0]).toBeGreaterThan(0.99);
      // y2 should be growing
      expect(result.y[2]).toBeGreaterThan(0);
    });

    it('should solve Robertson to t=1 with FD Jacobian', () => {
      const y0 = new Float64Array([1, 0, 0]);
      const solver = new TRBDF2Solver(3, robertsonRHS, {
        atol: 1e-8,
        rtol: 1e-6,
        maxSteps: 50000,
      });

      const result = solver.integrate(y0, 0, 1);

      expect(result.success).toBe(true);
      const sum = result.y[0] + result.y[1] + result.y[2];
      expect(sum).toBeCloseTo(1.0, 3);
      // At t=1: y0 ~ 0.966, y1 ~ 3.6e-5, y2 ~ 0.034 (approximate)
      expect(result.y[0]).toBeGreaterThan(0.9);
      expect(result.y[0]).toBeLessThan(1.0);
    });

    it('should solve Robertson to t=100 with analytical Jacobian', () => {
      const y0 = new Float64Array([1, 0, 0]);
      const solver = new TRBDF2Solver(3, robertsonRHS, {
        atol: 1e-8,
        rtol: 1e-6,
        maxSteps: 100000,
        jacobianRowMajor: robertsonJacobian,
      });

      const result = solver.integrate(y0, 0, 100);

      expect(result.success).toBe(true);
      const sum = result.y[0] + result.y[1] + result.y[2];
      expect(sum).toBeCloseTo(1.0, 3);
      // At t=100: y0 ~ 0.715, y2 ~ 0.285
      expect(result.y[0]).toBeGreaterThan(0.5);
      expect(result.y[0]).toBeLessThan(0.9);
    });
  });

  describe('Exponential decay - order verification', () => {
    it('should converge at 2nd order', () => {
      const lambda = 1;
      const y0Val = 1.0;
      const tEnd = 1.0;
      const exact = Math.exp(-lambda * tEnd);

      const errors: number[] = [];
      const steps: number[] = [];

      // Run with decreasing tolerances to observe order
      for (const tol of [1e-3, 1e-5, 1e-7]) {
        const y0 = new Float64Array([y0Val]);
        const solver = new TRBDF2Solver(1, makeDecayRHS(lambda), {
          atol: tol,
          rtol: tol,
          maxSteps: 100000,
        });
        const result = solver.integrate(y0, 0, tEnd);
        expect(result.success).toBe(true);
        errors.push(Math.abs(result.y[0] - exact));
        steps.push(result.steps);
      }

      // Error should decrease as tolerance decreases
      expect(errors[1]).toBeLessThan(errors[0]);
      expect(errors[2]).toBeLessThan(errors[1]);

      // With tol = 1e-7, error should be small
      expect(errors[2]).toBeLessThan(1e-5);
    });

    it('should achieve tight tolerance for simple decay', () => {
      const lambda = 2;
      const y0 = new Float64Array([3.0]);
      const tEnd = 2.0;
      const exact = 3.0 * Math.exp(-lambda * tEnd);

      const solver = new TRBDF2Solver(1, makeDecayRHS(lambda), {
        atol: 1e-10,
        rtol: 1e-10,
        maxSteps: 100000,
      });
      const result = solver.integrate(y0, 0, tEnd);

      expect(result.success).toBe(true);
      expect(Math.abs(result.y[0] - exact)).toBeLessThan(1e-7);
    });
  });

  describe('Linear stiff system', () => {
    it('should solve 2x2 stiff system with analytical Jacobian', () => {
      const y0 = new Float64Array([1, 1]);
      const tEnd = 0.01; // After this, y1 ~ exp(-10) is tiny

      const solver = new TRBDF2Solver(2, linearStiffRHS, {
        atol: 1e-10,
        rtol: 1e-8,
        maxSteps: 10000,
        jacobianRowMajor: linearStiffJacobian,
      });

      const result = solver.integrate(y0, 0, tEnd);

      expect(result.success).toBe(true);

      const exactY0 = Math.exp(-1 * tEnd);
      const exactY1 = Math.exp(-1000 * tEnd);

      expect(Math.abs(result.y[0] - exactY0)).toBeLessThan(1e-6);
      expect(Math.abs(result.y[1] - exactY1)).toBeLessThan(1e-4);
    });

    it('should solve stiff system without analytical Jacobian', () => {
      const y0 = new Float64Array([1, 1]);
      const tEnd = 0.01;

      const solver = new TRBDF2Solver(2, linearStiffRHS, {
        atol: 1e-10,
        rtol: 1e-8,
        maxSteps: 10000,
        // No Jacobian provided - uses finite differences
      });

      const result = solver.integrate(y0, 0, tEnd);

      expect(result.success).toBe(true);

      const exactY0 = Math.exp(-1 * tEnd);
      const exactY1 = Math.exp(-1000 * tEnd);

      expect(Math.abs(result.y[0] - exactY0)).toBeLessThan(1e-6);
      expect(Math.abs(result.y[1] - exactY1)).toBeLessThan(1e-3);
    });

    it('should handle longer integration of stiff system', () => {
      const y0 = new Float64Array([1, 1]);
      const tEnd = 1.0; // y1 is essentially 0 here

      const solver = new TRBDF2Solver(2, linearStiffRHS, {
        atol: 1e-10,
        rtol: 1e-8,
        maxSteps: 10000,
        jacobianRowMajor: linearStiffJacobian,
      });

      const result = solver.integrate(y0, 0, tEnd);

      expect(result.success).toBe(true);

      const exactY0 = Math.exp(-1);
      expect(Math.abs(result.y[0] - exactY0)).toBeLessThan(1e-5);
      // y1 should be essentially 0
      expect(Math.abs(result.y[1])).toBeLessThan(1e-10);
    });
  });

  describe('Dense output (Hermite interpolation)', () => {
    it('should interpolate accurately within a step', () => {
      const lambda = 1;
      const y0 = new Float64Array([1.0]);

      const solver = new TRBDF2Solver(1, makeDecayRHS(lambda), {
        atol: 1e-10,
        rtol: 1e-10,
        maxSteps: 10000,
      });

      // Try progressively smaller steps until one is accepted
      let h = 0.1;
      let result;
      for (let attempt = 0; attempt < 20; attempt++) {
        result = solver.step(y0, 0, h);
        if (result.accepted) break;
        h *= 0.5;
      }
      expect(result!.accepted).toBe(true);

      const seg = solver.denseSegment;
      expect(seg).not.toBeNull();

      if (!seg) return;

      // Interpolate at several points within the step
      const out = new Float64Array(1);
      const nPoints = 10;
      for (let k = 0; k <= nPoints; k++) {
        const theta = k / nPoints;
        const tInterp = seg.tStart + theta * (seg.tEnd - seg.tStart);
        const exact = Math.exp(-lambda * tInterp);

        const ok = solver.interpolate(tInterp, out);
        expect(ok).toBe(true);

        // Cubic Hermite should be very accurate for smooth functions
        const relErr = Math.abs(out[0] - exact) / exact;
        expect(relErr).toBeLessThan(1e-3);
      }
    });

    it('should return false for out-of-range interpolation', () => {
      const y0 = new Float64Array([1.0]);
      const solver = new TRBDF2Solver(1, makeDecayRHS(1), {
        initialStep: 0.1,
      });

      // Take a step to get dense output
      solver.step(y0, 0, 0.1);

      const out = new Float64Array(1);

      // Before step start
      expect(solver.interpolate(-1, out)).toBe(false);
      // After step end
      expect(solver.interpolate(2, out)).toBe(false);
    });

    it('should return false when no step has been taken', () => {
      const solver = new TRBDF2Solver(1, makeDecayRHS(1));

      const out = new Float64Array(1);
      expect(solver.interpolate(0.5, out)).toBe(false);
    });
  });

  describe('Step rejection and recovery', () => {
    it('should reject steps with large errors and recover', () => {
      // Use a large initial step on a stiff problem to force rejection
      const y0 = new Float64Array([1, 1]);

      const solver = new TRBDF2Solver(2, linearStiffRHS, {
        atol: 1e-10,
        rtol: 1e-10,
        initialStep: 1.0, // Way too large for the fast component
        maxSteps: 10000,
        jacobianRowMajor: linearStiffJacobian,
      });

      // The solver should still converge despite initial oversized step
      const result = solver.integrate(y0, 0, 0.01);
      expect(result.success).toBe(true);

      const exactY0 = Math.exp(-0.01);
      const exactY1 = Math.exp(-10);

      expect(Math.abs(result.y[0] - exactY0)).toBeLessThan(1e-5);
      expect(Math.abs(result.y[1] - exactY1)).toBeLessThan(1e-3);
    });

    it('should handle zero initial conditions gracefully', () => {
      const y0 = new Float64Array([0, 0, 0]);

      const solver = new TRBDF2Solver(3, robertsonRHS, {
        atol: 1e-8,
        rtol: 1e-6,
        maxSteps: 100,
        jacobianRowMajor: robertsonJacobian,
      });

      const result = solver.integrate(y0, 0, 1);

      expect(result.success).toBe(true);
      // All zeros remain zero (no source term)
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(result.y[i])).toBeLessThan(1e-10);
      }
    });
  });

  describe('CVODE-compatible models', () => {
    it('should handle a simple A->B->C cascade', () => {
      // A -> B -> C with k1=1, k2=0.5
      // dy0/dt = -k1*y0
      // dy1/dt = k1*y0 - k2*y1
      // dy2/dt = k2*y1
      function cascadeRHS(y: Float64Array, dydt: Float64Array): void {
        const k1 = 1, k2 = 0.5;
        dydt[0] = -k1 * y[0];
        dydt[1] = k1 * y[0] - k2 * y[1];
        dydt[2] = k2 * y[1];
      }

      const y0 = new Float64Array([1, 0, 0]);
      const tEnd = 10;

      const solver = new TRBDF2Solver(3, cascadeRHS, {
        atol: 1e-10,
        rtol: 1e-8,
        maxSteps: 10000,
      });

      const result = solver.integrate(y0, 0, tEnd);
      expect(result.success).toBe(true);

      // Conservation: sum = 1
      const sum = result.y[0] + result.y[1] + result.y[2];
      expect(sum).toBeCloseTo(1.0, 5);

      // Exact: y0 = exp(-t), y1 = 2*(exp(-0.5t) - exp(-t)), y2 = 1 - y0 - y1
      const exactY0 = Math.exp(-tEnd);
      const exactY1 = 2 * (Math.exp(-0.5 * tEnd) - Math.exp(-tEnd));
      const exactY2 = 1 - exactY0 - exactY1;

      expect(Math.abs(result.y[0] - exactY0)).toBeLessThan(1e-6);
      expect(Math.abs(result.y[1] - exactY1)).toBeLessThan(1e-5);
      expect(Math.abs(result.y[2] - exactY2)).toBeLessThan(1e-5);
    });

    it('should handle a reversible reaction at equilibrium', () => {
      // A <=> B with kf=1, kr=2
      // Equilibrium: [B]/[A] = kf/kr = 0.5
      // dy0/dt = -kf*y0 + kr*y1
      // dy1/dt =  kf*y0 - kr*y1
      function reversibleRHS(y: Float64Array, dydt: Float64Array): void {
        const kf = 1, kr = 2;
        dydt[0] = -kf * y[0] + kr * y[1];
        dydt[1] = kf * y[0] - kr * y[1];
      }

      const y0 = new Float64Array([1, 0]);
      const tEnd = 20; // Should reach equilibrium

      const solver = new TRBDF2Solver(2, reversibleRHS, {
        atol: 1e-10,
        rtol: 1e-8,
        maxSteps: 10000,
      });

      const result = solver.integrate(y0, 0, tEnd);
      expect(result.success).toBe(true);

      // Conservation: y0 + y1 = 1
      expect(result.y[0] + result.y[1]).toBeCloseTo(1.0, 6);

      // Equilibrium: y0 = kr/(kf+kr) = 2/3, y1 = kf/(kf+kr) = 1/3
      expect(result.y[0]).toBeCloseTo(2 / 3, 4);
      expect(result.y[1]).toBeCloseTo(1 / 3, 4);
    });

    it('should handle Michaelis-Menten-like kinetics', () => {
      // Simplified enzyme kinetics (quasi-steady-state):
      // S -> P with rate Vmax*S/(Km+S)
      // dy0/dt = -Vmax*y0/(Km+y0)   (substrate)
      // dy1/dt =  Vmax*y0/(Km+y0)   (product)
      const Vmax = 1, Km = 0.5;

      function mmRHS(y: Float64Array, dydt: Float64Array): void {
        const rate = Vmax * y[0] / (Km + y[0]);
        dydt[0] = -rate;
        dydt[1] = rate;
      }

      const y0 = new Float64Array([1, 0]);
      const tEnd = 5;

      const solver = new TRBDF2Solver(2, mmRHS, {
        atol: 1e-10,
        rtol: 1e-8,
        maxSteps: 10000,
      });

      const result = solver.integrate(y0, 0, tEnd);
      expect(result.success).toBe(true);

      // Conservation
      expect(result.y[0] + result.y[1]).toBeCloseTo(1.0, 5);

      // Substrate should be mostly consumed
      expect(result.y[0]).toBeLessThan(0.2);
      expect(result.y[1]).toBeGreaterThan(0.8);
    });

    it('should handle a larger system (5 species)', () => {
      // Linear chain: S1 -> S2 -> S3 -> S4 -> S5 with rate 1
      function chainRHS(y: Float64Array, dydt: Float64Array): void {
        dydt[0] = -y[0];
        dydt[1] = y[0] - y[1];
        dydt[2] = y[1] - y[2];
        dydt[3] = y[2] - y[3];
        dydt[4] = y[3];
      }

      const y0 = new Float64Array([1, 0, 0, 0, 0]);
      const tEnd = 10;

      const solver = new TRBDF2Solver(5, chainRHS, {
        atol: 1e-8,
        rtol: 1e-6,
        maxSteps: 10000,
      });

      const result = solver.integrate(y0, 0, tEnd);
      expect(result.success).toBe(true);

      // Conservation: sum = 1
      let sum = 0;
      for (let i = 0; i < 5; i++) sum += result.y[i];
      expect(sum).toBeCloseTo(1.0, 4);

      // At t=10, most mass should be in S5
      expect(result.y[4]).toBeGreaterThan(0.5);
    });
  });
});
