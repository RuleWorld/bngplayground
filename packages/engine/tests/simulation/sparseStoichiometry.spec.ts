import { describe, expect, it } from 'vitest';
import {
  buildCSRStoichiometry,
  sparseCSRDgemv,
  computeSparsity,
  shouldUseSparse,
  type StoichiometryReaction,
  type CSRStoichiometryMatrix,
} from '../../src/services/simulation/SparseStoichiometry';

/**
 * Dense matrix-vector product for reference/equivalence testing.
 * Builds the full stoichiometry matrix densely and multiplies by v.
 */
function denseStoichiometryMV(
  reactions: StoichiometryReaction[],
  numSpecies: number,
  velocities: Float64Array,
  constantMask?: boolean[]
): Float64Array {
  const dydt = new Float64Array(numSpecies);
  for (let j = 0; j < reactions.length; j++) {
    const rxn = reactions[j];
    const v = velocities[j];
    for (let k = 0; k < rxn.reactants.length; k++) {
      const idx = rxn.reactants[k] as number;
      if (constantMask && constantMask[idx]) continue;
      dydt[idx] -= v;
    }
    for (let k = 0; k < rxn.products.length; k++) {
      const idx = rxn.products[k] as number;
      if (constantMask && constantMask[idx]) continue;
      const stoich = rxn.productStoichiometries ? rxn.productStoichiometries[k] : 1;
      dydt[idx] += v * stoich;
    }
  }
  return dydt;
}

describe('SparseStoichiometry', () => {
  // Simple system:
  //   3 species: A(0), B(1), C(2)
  //   Reaction 0: A -> B   (S[:,0] = [-1, +1, 0])
  //   Reaction 1: B -> C   (S[:,1] = [0, -1, +1])
  //
  // S = [ -1   0 ]
  //     [ +1  -1 ]
  //     [  0  +1 ]
  const simpleReactions: StoichiometryReaction[] = [
    { reactants: new Int32Array([0]), products: new Int32Array([1]) },
    { reactants: new Int32Array([1]), products: new Int32Array([2]) },
  ];

  describe('buildCSRStoichiometry', () => {
    it('should build correct CSR for a 3-species, 2-reaction system', () => {
      const csr = buildCSRStoichiometry(simpleReactions, 3);

      expect(csr.numSpecies).toBe(3);
      expect(csr.numReactions).toBe(2);
      expect(csr.nnz).toBe(4); // four non-zero entries

      // Row 0 (species A): col 0, value -1
      expect(csr.rowPtr[0]).toBe(0);
      expect(csr.colIdx[0]).toBe(0);
      expect(csr.values[0]).toBe(-1);

      // Row 1 (species B): col 0 value +1, col 1 value -1
      expect(csr.rowPtr[1]).toBe(1);
      expect(csr.colIdx[1]).toBe(0);
      expect(csr.values[1]).toBe(1);
      expect(csr.colIdx[2]).toBe(1);
      expect(csr.values[2]).toBe(-1);

      // Row 2 (species C): col 1, value +1
      expect(csr.rowPtr[2]).toBe(3);
      expect(csr.colIdx[3]).toBe(1);
      expect(csr.values[3]).toBe(1);

      // End pointer
      expect(csr.rowPtr[3]).toBe(4);
    });

    it('should handle product stoichiometries > 1', () => {
      // A -> 2B
      const rxns: StoichiometryReaction[] = [
        { reactants: new Int32Array([0]), products: new Int32Array([1]), productStoichiometries: [2] },
      ];
      const csr = buildCSRStoichiometry(rxns, 2);

      // Row 0 (A): -1
      expect(csr.values[0]).toBe(-1);
      // Row 1 (B): +2
      expect(csr.values[1]).toBe(2);
    });

    it('should cancel stoichiometry when species appears as both reactant and product', () => {
      // A + B -> A + C  (A is catalyst, net stoich for A = 0)
      const rxns: StoichiometryReaction[] = [
        { reactants: new Int32Array([0, 1]), products: new Int32Array([0, 2]) },
      ];
      const csr = buildCSRStoichiometry(rxns, 3);

      // Species A: -1 (reactant) + 1 (product) = 0 -> should be absent
      // Species B: -1
      // Species C: +1
      expect(csr.nnz).toBe(2);

      // Row 0 (A): empty
      expect(csr.rowPtr[0]).toBe(csr.rowPtr[1]);

      // Row 1 (B): -1
      const bStart = csr.rowPtr[1];
      expect(csr.values[bStart]).toBe(-1);

      // Row 2 (C): +1
      const cStart = csr.rowPtr[2];
      expect(csr.values[cStart]).toBe(1);
    });

    it('should respect constant species mask', () => {
      // A -> B, but A is constant
      const rxns: StoichiometryReaction[] = [
        { reactants: new Int32Array([0]), products: new Int32Array([1]) },
      ];
      const csr = buildCSRStoichiometry(rxns, 2, [true, false]);

      // Row 0 (A, constant): empty
      expect(csr.rowPtr[0]).toBe(csr.rowPtr[1]);

      // Row 1 (B): +1
      expect(csr.nnz).toBe(1);
      expect(csr.values[0]).toBe(1);
    });

    it('should handle duplicate reactant (A + A -> B)', () => {
      const rxns: StoichiometryReaction[] = [
        { reactants: new Int32Array([0, 0]), products: new Int32Array([1]) },
      ];
      const csr = buildCSRStoichiometry(rxns, 2);

      // Species A: -1 -1 = -2
      expect(csr.values[0]).toBe(-2);
      // Species B: +1
      expect(csr.values[1]).toBe(1);
    });

    it('should handle no reactions', () => {
      const csr = buildCSRStoichiometry([], 3);
      expect(csr.nnz).toBe(0);
      expect(csr.numReactions).toBe(0);
      expect(csr.rowPtr).toEqual(new Int32Array([0, 0, 0, 0]));
    });

    it('should handle single species, single reaction', () => {
      // 0 -> A (synthesis)
      const rxns: StoichiometryReaction[] = [
        { reactants: new Int32Array([]), products: new Int32Array([0]) },
      ];
      const csr = buildCSRStoichiometry(rxns, 1);
      expect(csr.nnz).toBe(1);
      expect(csr.values[0]).toBe(1);
    });
  });

  describe('sparseCSRDgemv', () => {
    it('should compute correct dydt for simple system', () => {
      const csr = buildCSRStoichiometry(simpleReactions, 3);
      const velocities = new Float64Array([2.0, 3.0]); // v0=2, v1=3
      const dydt = new Float64Array(3);

      sparseCSRDgemv(csr, velocities, dydt);

      // dydt[A] = -1*2 + 0*3 = -2
      // dydt[B] = +1*2 + (-1)*3 = -1
      // dydt[C] = 0*2 + 1*3 = 3
      expect(dydt[0]).toBeCloseTo(-2.0);
      expect(dydt[1]).toBeCloseTo(-1.0);
      expect(dydt[2]).toBeCloseTo(3.0);
    });

    it('should produce zero dydt for zero velocities', () => {
      const csr = buildCSRStoichiometry(simpleReactions, 3);
      const velocities = new Float64Array([0, 0]);
      const dydt = new Float64Array(3);

      sparseCSRDgemv(csr, velocities, dydt);

      expect(dydt[0]).toBe(0);
      expect(dydt[1]).toBe(0);
      expect(dydt[2]).toBe(0);
    });

    it('should accumulate into existing dydt values', () => {
      const csr = buildCSRStoichiometry(simpleReactions, 3);
      const velocities = new Float64Array([1.0, 1.0]);
      const dydt = new Float64Array([10, 20, 30]);

      sparseCSRDgemv(csr, velocities, dydt);

      // Existing + S*v
      expect(dydt[0]).toBeCloseTo(10 + (-1));
      expect(dydt[1]).toBeCloseTo(20 + (1 - 1));
      expect(dydt[2]).toBeCloseTo(30 + 1);
    });
  });

  describe('equivalence with dense computation', () => {
    it('should match dense computation on a larger random system', () => {
      // 30 species, 50 reactions, each with 1-3 reactants and 1-3 products
      const numSpecies = 30;
      const numReactions = 50;
      const reactions: StoichiometryReaction[] = [];

      // Deterministic pseudo-random using simple LCG
      let seed = 42;
      const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };

      for (let j = 0; j < numReactions; j++) {
        const nReactants = 1 + (rand() % 3);
        const nProducts = 1 + (rand() % 3);
        const reactants = new Int32Array(nReactants);
        const products = new Int32Array(nProducts);
        for (let k = 0; k < nReactants; k++) reactants[k] = rand() % numSpecies;
        for (let k = 0; k < nProducts; k++) products[k] = rand() % numSpecies;
        reactions.push({ reactants, products });
      }

      const velocities = new Float64Array(numReactions);
      for (let j = 0; j < numReactions; j++) {
        velocities[j] = (rand() % 10000) / 100.0;
      }

      // Dense reference
      const dydtDense = denseStoichiometryMV(reactions, numSpecies, velocities);

      // Sparse CSR
      const csr = buildCSRStoichiometry(reactions, numSpecies);
      const dydtSparse = new Float64Array(numSpecies);
      sparseCSRDgemv(csr, velocities, dydtSparse);

      for (let i = 0; i < numSpecies; i++) {
        expect(dydtSparse[i]).toBeCloseTo(dydtDense[i], 10);
      }
    });

    it('should match dense computation with constant species', () => {
      const numSpecies = 10;
      const constantMask = [false, true, false, false, true, false, false, false, false, false];
      const reactions: StoichiometryReaction[] = [
        { reactants: new Int32Array([0, 1]), products: new Int32Array([2, 3]) },
        { reactants: new Int32Array([2, 4]), products: new Int32Array([5]) },
        { reactants: new Int32Array([5]), products: new Int32Array([0, 1]) },
      ];
      const velocities = new Float64Array([1.5, 2.5, 0.5]);

      const dydtDense = denseStoichiometryMV(reactions, numSpecies, velocities, constantMask);
      const csr = buildCSRStoichiometry(reactions, numSpecies, constantMask);
      const dydtSparse = new Float64Array(numSpecies);
      sparseCSRDgemv(csr, velocities, dydtSparse);

      for (let i = 0; i < numSpecies; i++) {
        expect(dydtSparse[i]).toBeCloseTo(dydtDense[i], 10);
      }
      // Constant species should have zero contribution
      expect(dydtSparse[1]).toBe(0);
      expect(dydtSparse[4]).toBe(0);
    });
  });

  describe('sparsity utilities', () => {
    it('should compute sparsity correctly', () => {
      // 4 non-zeros in a 3x2 matrix = 4/6 dense, sparsity = 2/6
      expect(computeSparsity(3, 2, 4)).toBeCloseTo(1 - 4 / 6);
    });

    it('should return 1 for empty matrix', () => {
      expect(computeSparsity(0, 0, 0)).toBe(1);
    });

    it('should return 0 for fully dense matrix', () => {
      expect(computeSparsity(2, 3, 6)).toBeCloseTo(0);
    });

    it('shouldUseSparse returns false for small systems', () => {
      // 5 species, even if very sparse
      expect(shouldUseSparse(5, 100, 10)).toBe(false);
    });

    it('shouldUseSparse returns false for dense systems', () => {
      // 30 species, 20 reactions, 500 nnz out of 600 = 83% dense
      expect(shouldUseSparse(30, 20, 500)).toBe(false);
    });

    it('shouldUseSparse returns true for large sparse systems', () => {
      // 50 species, 100 reactions, 200 nnz out of 5000 = 96% sparse
      expect(shouldUseSparse(50, 100, 200)).toBe(true);
    });
  });
});
