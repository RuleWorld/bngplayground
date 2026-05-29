/**
 * Tests for AnalyticalJacobian module.
 *
 * Verifies that the analytical Jacobian matches finite-difference approximation
 * for various reaction network topologies: unimolecular, bimolecular, autocatalytic,
 * and edge cases (zero concentrations, degradation-only).
 */
import { describe, expect, it } from 'vitest';
import {
  buildJacobianFunction,
  computeJacobian,
  computeFiniteDifferenceJacobian,
  isPurelyMassAction,
} from '../../src/services/simulation/AnalyticalJacobian';
import type { JacobianReaction } from '../../src/services/simulation/AnalyticalJacobian';

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Build an RHS function from reactions for finite-difference comparison.
 * This is a simple mass-action ODE RHS: dydt[i] = sum_r S[i][r] * v_r
 */
function buildRHS(reactions: JacobianReaction[], _numSpecies: number): (y: Float64Array, dydt: Float64Array) => void {
  return (y: Float64Array, dydt: Float64Array) => {
    dydt.fill(0);
    for (const rxn of reactions) {
      // Compute rate
      let rate = rxn.rateConstant;
      for (let i = 0; i < rxn.reactants.length; i++) {
        rate *= y[rxn.reactants[i]];
      }

      // Subtract from reactants
      for (let i = 0; i < rxn.reactants.length; i++) {
        dydt[rxn.reactants[i]] -= rate;
      }
      // Add to products
      for (let i = 0; i < rxn.products.length; i++) {
        dydt[rxn.products[i]] += rate;
      }
    }
  };
}

/**
 * Compare two column-major Jacobian matrices element-by-element.
 * Uses relative tolerance for nonzero entries and absolute tolerance for near-zero.
 */
function expectJacobiansClose(
  analytical: Float64Array,
  fd: Float64Array,
  N: number,
  relTol = 1e-6,
  absTol = 1e-10,
): void {
  expect(analytical.length).toBe(fd.length);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      const a = analytical[idx];
      const f = fd[idx];
      const maxAbs = Math.max(Math.abs(a), Math.abs(f));
      if (maxAbs < absTol) {
        // Both near zero
        expect(Math.abs(a - f)).toBeLessThan(absTol);
      } else {
        const relErr = Math.abs(a - f) / maxAbs;
        expect(relErr).toBeLessThan(relTol);
      }
    }
  }
}

// ── Test Suite ─────────────────────────────────────────────────────────

describe('AnalyticalJacobian', () => {
  describe('isPurelyMassAction', () => {
    it('returns true for all mass-action reactions', () => {
      const rxns: JacobianReaction[] = [
        { reactants: [0], products: [1], rateConstant: 0.1, isFunctionalRate: false },
        { reactants: [1], products: [0], rateConstant: 0.2, isFunctionalRate: false },
      ];
      expect(isPurelyMassAction(rxns)).toBe(true);
    });

    it('returns false when any reaction has functional rate', () => {
      const rxns: JacobianReaction[] = [
        { reactants: [0], products: [1], rateConstant: 0.1, isFunctionalRate: false },
        { reactants: [1], products: [0], rateConstant: 0.0, isFunctionalRate: true },
      ];
      expect(isPurelyMassAction(rxns)).toBe(false);
    });

    it('returns true for empty reaction list', () => {
      expect(isPurelyMassAction([])).toBe(true);
    });
  });

  describe('Simple 3-species system: A -> B -> C', () => {
    // A -> B with k1=0.5, B -> C with k2=0.3
    const N = 3;
    const reactions: JacobianReaction[] = [
      { reactants: [0], products: [1], rateConstant: 0.5, isFunctionalRate: false },
      { reactants: [1], products: [2], rateConstant: 0.3, isFunctionalRate: false },
    ];

    it('matches finite-difference Jacobian at nonzero concentrations', () => {
      const y = new Float64Array([1.0, 2.0, 0.5]);
      const rhs = buildRHS(reactions, N);

      const jacAnalytical = computeJacobian(reactions, N, y);
      const jacFD = computeFiniteDifferenceJacobian(rhs, y, N);

      expectJacobiansClose(jacAnalytical, jacFD, N);
    });

    it('has correct structure for A -> B -> C', () => {
      const y = new Float64Array([1.0, 2.0, 0.5]);
      const J = computeJacobian(reactions, N, y);

      // J is column-major: J[j*N + i] = df_i / dy_j
      // f_0 = -k1*y0,         df0/dy0 = -k1 = -0.5, df0/dy1 = 0, df0/dy2 = 0
      // f_1 = k1*y0 - k2*y1,  df1/dy0 = k1 = 0.5,   df1/dy1 = -k2 = -0.3, df1/dy2 = 0
      // f_2 = k2*y1,           df2/dy0 = 0,           df2/dy1 = k2 = 0.3,   df2/dy2 = 0

      // Column 0 (j=0): df/dy0
      expect(J[0 * N + 0]).toBeCloseTo(-0.5, 10);  // df0/dy0
      expect(J[0 * N + 1]).toBeCloseTo(0.5, 10);   // df1/dy0
      expect(J[0 * N + 2]).toBeCloseTo(0.0, 10);   // df2/dy0

      // Column 1 (j=1): df/dy1
      expect(J[1 * N + 0]).toBeCloseTo(0.0, 10);   // df0/dy1
      expect(J[1 * N + 1]).toBeCloseTo(-0.3, 10);  // df1/dy1
      expect(J[1 * N + 2]).toBeCloseTo(0.3, 10);   // df2/dy1

      // Column 2 (j=2): df/dy2 (C is not a reactant, so all zeros)
      expect(J[2 * N + 0]).toBeCloseTo(0.0, 10);
      expect(J[2 * N + 1]).toBeCloseTo(0.0, 10);
      expect(J[2 * N + 2]).toBeCloseTo(0.0, 10);
    });

    it('matches FD at zero concentrations', () => {
      const y = new Float64Array([0.0, 0.0, 0.0]);
      const rhs = buildRHS(reactions, N);

      const jacAnalytical = computeJacobian(reactions, N, y);
      const jacFD = computeFiniteDifferenceJacobian(rhs, y, N);

      expectJacobiansClose(jacAnalytical, jacFD, N);
    });

    it('matches FD when one species is zero', () => {
      const y = new Float64Array([0.0, 2.0, 1.0]);
      const rhs = buildRHS(reactions, N);

      const jacAnalytical = computeJacobian(reactions, N, y);
      const jacFD = computeFiniteDifferenceJacobian(rhs, y, N);

      expectJacobiansClose(jacAnalytical, jacFD, N);
    });
  });

  describe('Bimolecular reaction: A + B -> C', () => {
    const N = 3;
    const reactions: JacobianReaction[] = [
      // A + B -> C with k=0.1
      { reactants: [0, 1], products: [2], rateConstant: 0.1, isFunctionalRate: false },
    ];

    it('matches FD at nonzero concentrations', () => {
      const y = new Float64Array([2.0, 3.0, 1.0]);
      const rhs = buildRHS(reactions, N);

      const jacAnalytical = computeJacobian(reactions, N, y);
      const jacFD = computeFiniteDifferenceJacobian(rhs, y, N);

      expectJacobiansClose(jacAnalytical, jacFD, N);
    });

    it('has correct structure for A + B -> C', () => {
      const y = new Float64Array([2.0, 3.0, 1.0]);
      const J = computeJacobian(reactions, N, y);

      // v = k * yA * yB = 0.1 * 2 * 3 = 0.6
      // f_A = -v, f_B = -v, f_C = +v
      // dv/dyA = k * yB = 0.1 * 3 = 0.3
      // dv/dyB = k * yA = 0.1 * 2 = 0.2

      // Column 0 (j=0, d/dyA):
      expect(J[0 * N + 0]).toBeCloseTo(-0.3, 10);  // dfA/dyA = -dv/dyA
      expect(J[0 * N + 1]).toBeCloseTo(-0.3, 10);  // dfB/dyA = -dv/dyA
      expect(J[0 * N + 2]).toBeCloseTo(0.3, 10);   // dfC/dyA = +dv/dyA

      // Column 1 (j=1, d/dyB):
      expect(J[1 * N + 0]).toBeCloseTo(-0.2, 10);  // dfA/dyB = -dv/dyB
      expect(J[1 * N + 1]).toBeCloseTo(-0.2, 10);  // dfB/dyB = -dv/dyB
      expect(J[1 * N + 2]).toBeCloseTo(0.2, 10);   // dfC/dyB = +dv/dyB
    });

    it('matches FD when A is zero (B nonzero)', () => {
      const y = new Float64Array([0.0, 3.0, 1.0]);
      const rhs = buildRHS(reactions, N);

      const jacAnalytical = computeJacobian(reactions, N, y);
      const jacFD = computeFiniteDifferenceJacobian(rhs, y, N);

      expectJacobiansClose(jacAnalytical, jacFD, N);
    });

    it('matches FD when both reactants are zero', () => {
      const y = new Float64Array([0.0, 0.0, 5.0]);
      const rhs = buildRHS(reactions, N);

      const jacAnalytical = computeJacobian(reactions, N, y);
      const jacFD = computeFiniteDifferenceJacobian(rhs, y, N);

      expectJacobiansClose(jacAnalytical, jacFD, N);
    });
  });

  describe('Homodimerization: 2A -> B', () => {
    const N = 2;
    const reactions: JacobianReaction[] = [
      // 2A -> B with k=0.05; reactants = [0, 0]
      { reactants: [0, 0], products: [1], rateConstant: 0.05, isFunctionalRate: false },
    ];

    it('matches FD at nonzero concentrations', () => {
      const y = new Float64Array([4.0, 1.0]);
      const rhs = buildRHS(reactions, N);

      const jacAnalytical = computeJacobian(reactions, N, y);
      const jacFD = computeFiniteDifferenceJacobian(rhs, y, N);

      expectJacobiansClose(jacAnalytical, jacFD, N);
    });

    it('has correct structure for 2A -> B', () => {
      const y = new Float64Array([4.0, 1.0]);
      const J = computeJacobian(reactions, N, y);

      // v = k * yA^2 = 0.05 * 16 = 0.8
      // f_A = -2*v = -2*k*yA^2, f_B = v = k*yA^2
      // dv/dyA = k * 2 * yA = 0.05 * 2 * 4 = 0.4
      //
      // Net stoich: A: -2, B: +1
      // J[0*N + 0] = S_A * dv/dyA = -2 * 0.4 = -0.8
      // J[0*N + 1] = S_B * dv/dyA = 1 * 0.4 = 0.4

      expect(J[0 * N + 0]).toBeCloseTo(-0.8, 10);  // dfA/dyA
      expect(J[0 * N + 1]).toBeCloseTo(0.4, 10);   // dfB/dyA

      // Column 1: B is not a reactant
      expect(J[1 * N + 0]).toBeCloseTo(0.0, 10);
      expect(J[1 * N + 1]).toBeCloseTo(0.0, 10);
    });

    it('handles zero concentration for dimerization', () => {
      const y = new Float64Array([0.0, 1.0]);
      const rhs = buildRHS(reactions, N);

      const jacAnalytical = computeJacobian(reactions, N, y);
      const jacFD = computeFiniteDifferenceJacobian(rhs, y, N);

      // At y[0]=0, the analytical derivative is exactly 0 for 2A->B (order 2),
      // while FD gives a small O(h) artifact. Use looser tolerance.
      expectJacobiansClose(jacAnalytical, jacFD, N, 1e-4, 1e-6);

      // Verify the analytical answer is mathematically correct:
      // dv/dyA = k * 2 * yA^(2-1) = 0 when yA=0
      expect(jacAnalytical[0 * N + 0]).toBe(0); // dfA/dyA = S_A * dv/dyA = -2*0 = 0
      expect(jacAnalytical[0 * N + 1]).toBe(0); // dfB/dyA = S_B * dv/dyA = 1*0 = 0
    });
  });

  describe('Reversible reaction: A <-> B', () => {
    const N = 2;
    const reactions: JacobianReaction[] = [
      { reactants: [0], products: [1], rateConstant: 1.0, isFunctionalRate: false },
      { reactants: [1], products: [0], rateConstant: 0.5, isFunctionalRate: false },
    ];

    it('matches FD Jacobian', () => {
      const y = new Float64Array([3.0, 2.0]);
      const rhs = buildRHS(reactions, N);

      const jacAnalytical = computeJacobian(reactions, N, y);
      const jacFD = computeFiniteDifferenceJacobian(rhs, y, N);

      expectJacobiansClose(jacAnalytical, jacFD, N);
    });

    it('has correct entries', () => {
      const y = new Float64Array([3.0, 2.0]);
      const J = computeJacobian(reactions, N, y);

      // f_A = -k1*yA + k2*yB
      // f_B = k1*yA - k2*yB
      // dfA/dyA = -k1 = -1.0
      // dfA/dyB = k2 = 0.5
      // dfB/dyA = k1 = 1.0
      // dfB/dyB = -k2 = -0.5

      expect(J[0 * N + 0]).toBeCloseTo(-1.0, 10);
      expect(J[0 * N + 1]).toBeCloseTo(1.0, 10);
      expect(J[1 * N + 0]).toBeCloseTo(0.5, 10);
      expect(J[1 * N + 1]).toBeCloseTo(-0.5, 10);
    });
  });

  describe('Degradation: A -> 0 (no products)', () => {
    const N = 1;
    const reactions: JacobianReaction[] = [
      { reactants: [0], products: [], rateConstant: 0.3, isFunctionalRate: false },
    ];

    it('matches FD Jacobian', () => {
      const y = new Float64Array([5.0]);
      const rhs = buildRHS(reactions, N);

      const jacAnalytical = computeJacobian(reactions, N, y);
      const jacFD = computeFiniteDifferenceJacobian(rhs, y, N);

      expectJacobiansClose(jacAnalytical, jacFD, N);
    });

    it('J[0,0] = -k for degradation', () => {
      const y = new Float64Array([5.0]);
      const J = computeJacobian(reactions, N, y);
      expect(J[0]).toBeCloseTo(-0.3, 10);
    });
  });

  describe('Production from nothing: 0 -> A', () => {
    const N = 1;
    const reactions: JacobianReaction[] = [
      { reactants: [], products: [0], rateConstant: 1.5, isFunctionalRate: false },
    ];

    it('Jacobian is all zeros (constant production)', () => {
      const y = new Float64Array([5.0]);
      const J = computeJacobian(reactions, N, y);
      expect(J[0]).toBeCloseTo(0.0, 10);
    });
  });

  describe('Larger system: 5-species with mixed reactions', () => {
    const N = 5;
    const reactions: JacobianReaction[] = [
      // A -> B, k=1.0
      { reactants: [0], products: [1], rateConstant: 1.0, isFunctionalRate: false },
      // B + C -> D, k=0.1
      { reactants: [1, 2], products: [3], rateConstant: 0.1, isFunctionalRate: false },
      // D -> E, k=0.5
      { reactants: [3], products: [4], rateConstant: 0.5, isFunctionalRate: false },
      // E -> A, k=0.2 (feedback loop)
      { reactants: [4], products: [0], rateConstant: 0.2, isFunctionalRate: false },
      // 2B -> C, k=0.01
      { reactants: [1, 1], products: [2], rateConstant: 0.01, isFunctionalRate: false },
    ];

    it('matches FD Jacobian at arbitrary concentrations', () => {
      const y = new Float64Array([1.5, 2.3, 0.8, 1.1, 0.4]);
      const rhs = buildRHS(reactions, N);

      const jacAnalytical = computeJacobian(reactions, N, y);
      const jacFD = computeFiniteDifferenceJacobian(rhs, y, N);

      expectJacobiansClose(jacAnalytical, jacFD, N);
    });

    it('matches FD with some zero concentrations', () => {
      const y = new Float64Array([0.0, 1.0, 0.0, 2.0, 0.0]);
      const rhs = buildRHS(reactions, N);

      const jacAnalytical = computeJacobian(reactions, N, y);
      const jacFD = computeFiniteDifferenceJacobian(rhs, y, N);

      expectJacobiansClose(jacAnalytical, jacFD, N);
    });

    it('matches FD with all zeros', () => {
      const y = new Float64Array([0.0, 0.0, 0.0, 0.0, 0.0]);
      const rhs = buildRHS(reactions, N);

      const jacAnalytical = computeJacobian(reactions, N, y);
      const jacFD = computeFiniteDifferenceJacobian(rhs, y, N);

      // At all-zero state with higher-order reactions (2B->C), FD produces O(h)
      // artifacts for second-order terms while analytical correctly gives 0.
      // Use looser tolerance to account for FD inaccuracy.
      expectJacobiansClose(jacAnalytical, jacFD, N, 1e-4, 1e-6);
    });

    it('matches FD with large concentrations', () => {
      const y = new Float64Array([1000, 500, 200, 100, 50]);
      const rhs = buildRHS(reactions, N);

      const jacAnalytical = computeJacobian(reactions, N, y);
      const jacFD = computeFiniteDifferenceJacobian(rhs, y, N);

      expectJacobiansClose(jacAnalytical, jacFD, N);
    });
  });

  describe('buildJacobianFunction returns reusable closure', () => {
    it('gives consistent results across multiple calls', () => {
      const N = 2;
      const reactions: JacobianReaction[] = [
        { reactants: [0], products: [1], rateConstant: 0.5, isFunctionalRate: false },
      ];
      const jacFn = buildJacobianFunction(reactions, N);

      const J1 = new Float64Array(N * N);
      const J2 = new Float64Array(N * N);

      const y = new Float64Array([1.0, 2.0]);
      jacFn(y, J1);
      jacFn(y, J2);

      for (let i = 0; i < N * N; i++) {
        expect(J1[i]).toBe(J2[i]);
      }
    });

    it('updates correctly when state changes', () => {
      const N = 2;
      const reactions: JacobianReaction[] = [
        { reactants: [0, 0], products: [1], rateConstant: 1.0, isFunctionalRate: false },
      ];
      const jacFn = buildJacobianFunction(reactions, N);
      const J = new Float64Array(N * N);

      // At y=[1,0]: dv/dy0 = 2*1*1 = 2, net stoich A=-2, B=+1
      jacFn(new Float64Array([1.0, 0.0]), J);
      expect(J[0 * N + 0]).toBeCloseTo(-4.0, 10); // S_A * dv/dy0 = -2 * 2 = -4
      expect(J[0 * N + 1]).toBeCloseTo(2.0, 10);  // S_B * dv/dy0 = 1 * 2 = 2

      // At y=[3,0]: dv/dy0 = 2*3*1 = 6
      jacFn(new Float64Array([3.0, 0.0]), J);
      expect(J[0 * N + 0]).toBeCloseTo(-12.0, 10); // -2 * 6
      expect(J[0 * N + 1]).toBeCloseTo(6.0, 10);   // 1 * 6
    });
  });

  describe('Trimolecular: A + B + C -> D', () => {
    const N = 4;
    const reactions: JacobianReaction[] = [
      { reactants: [0, 1, 2], products: [3], rateConstant: 0.01, isFunctionalRate: false },
    ];

    it('matches FD Jacobian', () => {
      const y = new Float64Array([2.0, 3.0, 4.0, 0.0]);
      const rhs = buildRHS(reactions, N);

      const jacAnalytical = computeJacobian(reactions, N, y);
      const jacFD = computeFiniteDifferenceJacobian(rhs, y, N);

      expectJacobiansClose(jacAnalytical, jacFD, N);
    });
  });

  describe('Column-major layout verification', () => {
    it('stores J[j*N+i] = df_i/dy_j correctly', () => {
      // A -> B with k=1 -- only A is reactant
      const N = 2;
      const reactions: JacobianReaction[] = [
        { reactants: [0], products: [1], rateConstant: 1.0, isFunctionalRate: false },
      ];
      const y = new Float64Array([5.0, 3.0]);
      const J = computeJacobian(reactions, N, y);

      // df_0/dy_0 = -1 (at J[0*2+0] = J[0])
      // df_1/dy_0 = +1 (at J[0*2+1] = J[1])
      // df_0/dy_1 = 0  (at J[1*2+0] = J[2])
      // df_1/dy_1 = 0  (at J[1*2+1] = J[3])
      expect(J[0]).toBeCloseTo(-1.0, 10);
      expect(J[1]).toBeCloseTo(1.0, 10);
      expect(J[2]).toBeCloseTo(0.0, 10);
      expect(J[3]).toBeCloseTo(0.0, 10);
    });
  });
});
