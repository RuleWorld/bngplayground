import { describe, expect, it } from 'vitest';
import {
  buildStoichiometricMatrix,
  computeLeftNullSpace,
  createReducedSystem,
  findConservationLaws,
  type ConservationLaw,
} from '../src/services/analysis/ConservationLaws';

interface MockRxn {
  reactants: number[];
  products: number[];
}

describe('ConservationLaws Service', () => {
  describe('buildStoichiometricMatrix', () => {
    it('should build correct matrix for A -> B', () => {
      const reactions: MockRxn[] = [{ reactants: [0], products: [1] }];
      const matrix = buildStoichiometricMatrix(reactions as any, 2);
      expect(matrix[0][0]).toBe(-1);
      expect(matrix[1][0]).toBe(1);
    });

    it('should handle A + B -> C', () => {
      const reactions: MockRxn[] = [{ reactants: [0, 1], products: [2] }];
      const matrix = buildStoichiometricMatrix(reactions as any, 3);
      expect(matrix[0][0]).toBe(-1);
      expect(matrix[1][0]).toBe(-1);
      expect(matrix[2][0]).toBe(1);
    });

    it('should handle empty reactions', () => {
      const matrix = buildStoichiometricMatrix([], 5);
      expect(matrix).toHaveLength(5);
      expect(matrix[0]).toHaveLength(0);
    });
  });

  describe('computeLeftNullSpace', () => {
    it('should find conservation in A <-> B', () => {
      const matrix = [
        [-1, 1],
        [1, -1],
      ];
      const nullSpace = computeLeftNullSpace(matrix);
      expect(nullSpace.length).toBeGreaterThan(0);

      const vec = nullSpace[0];
      expect(vec).toHaveLength(2);
      expect(vec[0]).toBe(1);
      expect(vec[1]).toBe(1);
    });

    it('should find 2 laws for A <-> B, C <-> D', () => {
      const matrix = [
        [-1, 1, 0, 0],
        [1, -1, 0, 0],
        [0, 0, -1, 1],
        [0, 0, 1, -1],
      ];
      const nullSpace = computeLeftNullSpace(matrix);
      expect(nullSpace).toHaveLength(2);
    });

    it('should return empty keys for full rank system', () => {
      const nullSpace = computeLeftNullSpace([[-1]]);
      expect(nullSpace).toHaveLength(0);
    });

    for (let i = 0; i < 20; i++) {
      it(`should satisfy N^T * v = 0 for random matrix #${i}`, () => {
        const rows = 3;
        const cols = 4;
        const matrix: number[][] = Array.from({ length: rows }, () =>
          Array.from({ length: cols }, () => Math.floor(Math.random() * 5) - 2),
        );

        const nullSpace = computeLeftNullSpace(matrix);

        for (const vec of nullSpace) {
          for (let col = 0; col < cols; col++) {
            let sum = 0;
            for (let row = 0; row < rows; row++) {
              sum += vec[row] * matrix[row][col];
            }
            expect(sum).toBeCloseTo(0);
          }
        }
      });
    }
  });

  describe('findConservationLaws', () => {
    it('should identify Total A in A <-> B', () => {
      const reactions: MockRxn[] = [
        { reactants: [0], products: [1] },
        { reactants: [1], products: [0] },
      ];
      const initials = new Float64Array([10, 0]);
      const analysis = findConservationLaws(reactions as any, 2, initials, ['A', 'B']);

      expect(analysis.laws).toHaveLength(1);
      expect(analysis.laws[0].total).toBe(10);
      expect(analysis.laws[0].description).toContain('A + B');
      expect(analysis.rank).toBe(1);
    });

    it('should handle moiety conservation in E + S <-> ES -> E + P', () => {
      const reactions: MockRxn[] = [
        { reactants: [0, 1], products: [2] },
        { reactants: [2], products: [0, 1] },
        { reactants: [2], products: [0, 3] },
      ];
      const initials = new Float64Array([10, 100, 0, 0]);
      const analysis = findConservationLaws(reactions as any, 4, initials, ['E', 'S', 'ES', 'P']);

      const enzymeLaw = analysis.laws.find((law) => law.description.includes('E') && law.description.includes('ES'));
      expect(enzymeLaw).toBeDefined();
      expect(enzymeLaw?.total).toBe(10);
    });
  });

  describe('createReducedSystem', () => {
    it('should consistently reduce and expand state', () => {
      const laws: ConservationLaw[] = [{
        dependentSpecies: 0,
        coefficients: new Float64Array([1, 1]),
        total: 10,
        description: 'A + B = 10',
      }];
      const analysis = {
        laws,
        dependentSpecies: [0],
        independentSpecies: [1],
        rank: 1,
      };

      const system = createReducedSystem(analysis as any, 2);
      const yFull = new Float64Array([3, 7]);
      const yReduced = system.reduce(yFull);
      expect(yReduced).toHaveLength(1);
      expect(yReduced[0]).toBe(7);

      const yRestored = system.expand(yReduced);
      expect(yRestored[0]).toBeCloseTo(3);
      expect(yRestored[1]).toBe(7);
    });

    it('should clamp negative values during expansion', () => {
      const laws: ConservationLaw[] = [{
        dependentSpecies: 0,
        coefficients: new Float64Array([1, 1]),
        total: 10,
        description: 'A + B = 10',
      }];
      const analysis = {
        laws,
        dependentSpecies: [0],
        independentSpecies: [1],
        rank: 1,
      };

      const system = createReducedSystem(analysis as any, 2);
      const yRestored = system.expand(new Float64Array([11]));
      expect(yRestored[0]).toBe(0);
    });

    it('should transform Jacobian correctly', () => {
      const laws: ConservationLaw[] = [{
        dependentSpecies: 0,
        coefficients: new Float64Array([1, 1]),
        total: 10,
        description: 'A + B = 10',
      }];
      const analysis = {
        laws,
        dependentSpecies: [0],
        independentSpecies: [1],
        rank: 1,
      };

      const system = createReducedSystem(analysis as any, 2);
      
      // Full system: dA/dt = -k*A, dB/dt = k*A (Conservation A+B)
      // J = [ -k  0 ]
      //     [  k  0 ]
      // In reduced system (y_r = B):
      // A = 10 - B
      // dB/dt = k * (10 - B)
      // d(dB/dt)/dB = -k
      
      const k = 0.5;
      const fullJacobian = (_y: Float64Array, J: Float64Array) => {
          J[0] = -k; J[2] = 0;
          J[1] = k;  J[3] = 0;
      }; // Column major

      const reducedJacobianFn = system.transformJacobian(fullJacobian, true);
      const Jr = new Float64Array(1);
      reducedJacobianFn(new Float64Array([3]), Jr); // B = 3
      
      expect(Jr[0]).toBe(-k);
    });
  });
});