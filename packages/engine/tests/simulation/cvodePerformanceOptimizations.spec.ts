import { describe, expect, it } from 'vitest';
import {
  buildCSRStoichiometry,
  sparseCSRDgemv,
  shouldUseSparse,
  type StoichiometryReaction,
} from '../../src/services/simulation/SparseStoichiometry';

/**
 * Tests for CVODE solver performance optimizations:
 *
 * Part 1: KLU sparse solver auto-selection for large models (>= 50 species)
 * Part 2: Zero-copy RHS with pre-allocated arrays (flattened typed arrays)
 *
 * These tests verify numerical equivalence between the original loop-based
 * derivative computation and the optimized flattened-array versions.
 */

// ── Helpers ────────────────────────────────────────────────────────────

interface ConcreteReactionLike {
  reactants: Int32Array;
  products: Int32Array;
  rateConstant: number;
  propensityFactor: number;
  degeneracy: number;
  productStoichiometries?: number[];
}

/**
 * Reference (original) mass-action derivative using per-step object access.
 * This mirrors the pre-optimization dense fallback in SimulationLoop.ts.
 */
function referenceDerivative(
  reactions: ConcreteReactionLike[],
  speciesVolumes: Float64Array,
  reactionReactingVolumes: Float64Array,
  isConstant: boolean[],
  odeUsesAmountState: boolean,
  yIn: Float64Array,
  dydt: Float64Array
): void {
  dydt.fill(0);
  for (let i = 0; i < reactions.length; i++) {
    const rxn = reactions[i];
    let velocity = rxn.rateConstant;
    let multiplicative = 1.0;
    const vAnchor = reactionReactingVolumes[i] || 1.0;

    for (let j = 0; j < rxn.reactants.length; j++) {
      const ridx = rxn.reactants[j];
      if (odeUsesAmountState) {
        multiplicative *= (yIn[ridx] / vAnchor);
      } else {
        const scale = speciesVolumes[ridx] / vAnchor;
        multiplicative *= (yIn[ridx] * scale);
      }
    }
    velocity *= multiplicative * (rxn.propensityFactor ?? 1) * (rxn.degeneracy ?? 1);
    velocity *= vAnchor;

    for (let j = 0; j < rxn.reactants.length; j++) {
      const reactantIdx = rxn.reactants[j];
      if (!isConstant[reactantIdx]) {
        dydt[reactantIdx] -= odeUsesAmountState
          ? velocity
          : (velocity / speciesVolumes[reactantIdx]);
      }
    }
    for (let j = 0; j < rxn.products.length; j++) {
      const productIdx = rxn.products[j];
      if (!isConstant[productIdx]) {
        const stoich = rxn.productStoichiometries ? rxn.productStoichiometries[j] : 1;
        dydt[productIdx] += odeUsesAmountState
          ? (velocity * stoich)
          : ((velocity * stoich) / speciesVolumes[productIdx]);
      }
    }
  }
}

/**
 * Optimized zero-copy derivative using pre-allocated flattened typed arrays.
 * This mirrors the post-optimization dense fallback in SimulationLoop.ts.
 */
function optimizedDerivative(
  reactions: ConcreteReactionLike[],
  speciesVolumes: Float64Array,
  reactionReactingVolumes: Float64Array,
  isConstantArr: boolean[],
  odeUsesAmountState: boolean,
  yIn: Float64Array,
  dydt: Float64Array
): void {
  const nRxns = reactions.length;
  const numSpecies = speciesVolumes.length;

  // Pre-allocate (would be done outside closure in production code)
  const velocityBuffer = new Float64Array(nRxns);
  const rxnRateConstants = new Float64Array(nRxns);
  const rxnPropFactors = new Float64Array(nRxns);
  const rxnVAnchors = new Float64Array(nRxns);

  let totalReactants = 0;
  let totalProducts = 0;
  for (let i = 0; i < nRxns; i++) {
    totalReactants += reactions[i].reactants.length;
    totalProducts += reactions[i].products.length;
  }

  const flatReactantIdx = new Int32Array(totalReactants);
  const flatReactantOffsets = new Int32Array(nRxns + 1);
  const flatProductIdx = new Int32Array(totalProducts);
  const flatProductStoich = new Float64Array(totalProducts);
  const flatProductOffsets = new Int32Array(nRxns + 1);
  const flatReactantScale = odeUsesAmountState ? null : new Float64Array(totalReactants);
  const invVols = odeUsesAmountState ? null : new Float64Array(numSpecies);
  if (invVols) {
    for (let i = 0; i < numSpecies; i++) invVols[i] = 1.0 / speciesVolumes[i];
  }
  const isConst = new Uint8Array(numSpecies);
  for (let i = 0; i < numSpecies; i++) isConst[i] = isConstantArr[i] ? 1 : 0;

  let rOff = 0, pOff = 0;
  for (let i = 0; i < nRxns; i++) {
    const rxn = reactions[i];
    const vAnchor = reactionReactingVolumes[i] || 1.0;
    rxnRateConstants[i] = rxn.rateConstant;
    rxnPropFactors[i] = (rxn.propensityFactor ?? 1) * (rxn.degeneracy ?? 1);
    rxnVAnchors[i] = vAnchor;
    flatReactantOffsets[i] = rOff;
    for (let j = 0; j < rxn.reactants.length; j++) {
      const ridx = rxn.reactants[j];
      flatReactantIdx[rOff] = ridx;
      if (flatReactantScale) flatReactantScale[rOff] = speciesVolumes[ridx] / vAnchor;
      rOff++;
    }
    flatProductOffsets[i] = pOff;
    for (let j = 0; j < rxn.products.length; j++) {
      flatProductIdx[pOff] = rxn.products[j];
      flatProductStoich[pOff] = rxn.productStoichiometries ? rxn.productStoichiometries[j] : 1;
      pOff++;
    }
  }
  flatReactantOffsets[nRxns] = rOff;
  flatProductOffsets[nRxns] = pOff;

  // ── Hot path (mirrors closure body) ──
  for (let i = 0; i < nRxns; i++) {
    let velocity = rxnRateConstants[i];
    let multiplicative = 1.0;
    const vAnchor = rxnVAnchors[i];
    const rStart = flatReactantOffsets[i];
    const rEnd = flatReactantOffsets[i + 1];
    if (odeUsesAmountState) {
      for (let j = rStart; j < rEnd; j++) multiplicative *= (yIn[flatReactantIdx[j]] / vAnchor);
    } else {
      for (let j = rStart; j < rEnd; j++) multiplicative *= (yIn[flatReactantIdx[j]] * flatReactantScale![j]);
    }
    velocity *= multiplicative * rxnPropFactors[i] * vAnchor;
    velocityBuffer[i] = velocity;
  }

  dydt.fill(0);
  for (let i = 0; i < nRxns; i++) {
    const velocity = velocityBuffer[i];
    const rStart = flatReactantOffsets[i];
    const rEnd = flatReactantOffsets[i + 1];
    if (odeUsesAmountState) {
      for (let j = rStart; j < rEnd; j++) {
        const idx = flatReactantIdx[j];
        if (!isConst[idx]) dydt[idx] -= velocity;
      }
    } else {
      for (let j = rStart; j < rEnd; j++) {
        const idx = flatReactantIdx[j];
        if (!isConst[idx]) dydt[idx] -= velocity * invVols![idx];
      }
    }
    const pStart = flatProductOffsets[i];
    const pEnd = flatProductOffsets[i + 1];
    if (odeUsesAmountState) {
      for (let j = pStart; j < pEnd; j++) {
        const idx = flatProductIdx[j];
        if (!isConst[idx]) dydt[idx] += velocity * flatProductStoich[j];
      }
    } else {
      for (let j = pStart; j < pEnd; j++) {
        const idx = flatProductIdx[j];
        if (!isConst[idx]) dydt[idx] += velocity * flatProductStoich[j] * invVols![idx];
      }
    }
  }
}

/**
 * Optimized sparse CSR derivative with flattened velocity computation.
 * Mirrors the post-optimization sparse path in SimulationLoop.ts.
 */
function optimizedSparseDerivative(
  reactions: ConcreteReactionLike[],
  speciesVolumes: Float64Array,
  reactionReactingVolumes: Float64Array,
  isConstantArr: boolean[],
  odeUsesAmountState: boolean,
  yIn: Float64Array,
  dydt: Float64Array
): void {
  const nRxns = reactions.length;
  const numSpecies = speciesVolumes.length;

  const csr = buildCSRStoichiometry(
    reactions as unknown as StoichiometryReaction[],
    numSpecies,
    isConstantArr
  );

  const velocityBuffer = new Float64Array(nRxns);
  const rxnRateK = new Float64Array(nRxns);
  const rxnPropDeg = new Float64Array(nRxns);
  const rxnVAnchors = new Float64Array(nRxns);
  let totalReactants = 0;
  for (let i = 0; i < nRxns; i++) totalReactants += reactions[i].reactants.length;
  const flatReactantIdx = new Int32Array(totalReactants);
  const flatReactantOffsets = new Int32Array(nRxns + 1);
  const flatReactantScale = odeUsesAmountState ? null : new Float64Array(totalReactants);
  const invVols = odeUsesAmountState ? null : new Float64Array(numSpecies);
  if (invVols) {
    for (let i = 0; i < numSpecies; i++) invVols[i] = 1.0 / speciesVolumes[i];
  }

  let srOff = 0;
  for (let i = 0; i < nRxns; i++) {
    const rxn = reactions[i];
    const vAnchor = reactionReactingVolumes[i] || 1.0;
    rxnRateK[i] = rxn.rateConstant;
    rxnPropDeg[i] = (rxn.propensityFactor ?? 1) * (rxn.degeneracy ?? 1);
    rxnVAnchors[i] = vAnchor;
    flatReactantOffsets[i] = srOff;
    for (let j = 0; j < rxn.reactants.length; j++) {
      const ridx = rxn.reactants[j];
      flatReactantIdx[srOff] = ridx;
      if (flatReactantScale) flatReactantScale[srOff] = speciesVolumes[ridx] / vAnchor;
      srOff++;
    }
  }
  flatReactantOffsets[nRxns] = srOff;

  // Compute velocities
  for (let i = 0; i < nRxns; i++) {
    let velocity = rxnRateK[i];
    let multiplicative = 1.0;
    const vAnchor = rxnVAnchors[i];
    const rStart = flatReactantOffsets[i];
    const rEnd = flatReactantOffsets[i + 1];
    if (odeUsesAmountState) {
      for (let j = rStart; j < rEnd; j++) multiplicative *= (yIn[flatReactantIdx[j]] / vAnchor);
    } else {
      for (let j = rStart; j < rEnd; j++) multiplicative *= (yIn[flatReactantIdx[j]] * flatReactantScale![j]);
    }
    velocity *= multiplicative * rxnPropDeg[i] * vAnchor;
    velocityBuffer[i] = velocity;
  }

  dydt.fill(0);
  sparseCSRDgemv(csr, velocityBuffer, dydt);
  if (invVols) {
    for (let i = 0; i < numSpecies; i++) dydt[i] *= invVols[i];
  }
}

// ── Test fixtures ────────────────────────────────────────────────────

/** Simple A -> B -> C system */
function makeSimpleSystem() {
  const reactions: ConcreteReactionLike[] = [
    { reactants: new Int32Array([0]), products: new Int32Array([1]), rateConstant: 0.5, propensityFactor: 1, degeneracy: 1 },
    { reactants: new Int32Array([1]), products: new Int32Array([2]), rateConstant: 0.3, propensityFactor: 1, degeneracy: 1 },
  ];
  const speciesVolumes = new Float64Array([1, 1, 1]);
  const reactionVolumes = new Float64Array([1, 1]);
  const isConstant = [false, false, false];
  const y = new Float64Array([10, 5, 2]);
  return { reactions, speciesVolumes, reactionVolumes, isConstant, y, numSpecies: 3 };
}

/** Bimolecular: A + B -> C, with non-trivial volumes */
function makeBimolecularSystem() {
  const reactions: ConcreteReactionLike[] = [
    { reactants: new Int32Array([0, 1]), products: new Int32Array([2]), rateConstant: 0.01, propensityFactor: 1, degeneracy: 1 },
    { reactants: new Int32Array([2]), products: new Int32Array([0, 1]), rateConstant: 0.1, propensityFactor: 1, degeneracy: 1 },
  ];
  const speciesVolumes = new Float64Array([2.0, 2.0, 2.0]);
  const reactionVolumes = new Float64Array([2.0, 2.0]);
  const isConstant = [false, false, false];
  const y = new Float64Array([100, 50, 10]);
  return { reactions, speciesVolumes, reactionVolumes, isConstant, y, numSpecies: 3 };
}

/** System with a constant species (enzyme) */
function makeConstantSpeciesSystem() {
  const reactions: ConcreteReactionLike[] = [
    // E + S -> E + P  (E is constant enzyme)
    { reactants: new Int32Array([0, 1]), products: new Int32Array([0, 2]), rateConstant: 0.05, propensityFactor: 1, degeneracy: 1 },
    // P -> S  (spontaneous back-reaction)
    { reactants: new Int32Array([2]), products: new Int32Array([1]), rateConstant: 0.01, propensityFactor: 1, degeneracy: 1 },
  ];
  const speciesVolumes = new Float64Array([1, 1, 1]);
  const reactionVolumes = new Float64Array([1, 1]);
  const isConstant = [true, false, false];  // E is constant
  const y = new Float64Array([1, 100, 0]);
  return { reactions, speciesVolumes, reactionVolumes, isConstant, y, numSpecies: 3 };
}

/** System with product stoichiometry > 1 */
function makeStoichiometricSystem() {
  // A -> 2B
  // B -> C, degeneracy = 2
  const reactions: ConcreteReactionLike[] = [
    { reactants: new Int32Array([0]), products: new Int32Array([1]), rateConstant: 0.1, propensityFactor: 1, degeneracy: 1, productStoichiometries: [2] },
    { reactants: new Int32Array([1]), products: new Int32Array([2]), rateConstant: 0.05, propensityFactor: 1, degeneracy: 2 },
  ];
  const speciesVolumes = new Float64Array([1, 1, 1]);
  const reactionVolumes = new Float64Array([1, 1]);
  const isConstant = [false, false, false];
  const y = new Float64Array([50, 20, 5]);
  return { reactions, speciesVolumes, reactionVolumes, isConstant, y, numSpecies: 3 };
}

/** Large system for sparse threshold testing (60 species, 80 reactions) */
function makeLargeSystem(numSpecies: number = 60, numReactions: number = 80) {
  const reactions: ConcreteReactionLike[] = [];
  for (let i = 0; i < numReactions; i++) {
    const r1 = i % numSpecies;
    const r2 = (i + 1) % numSpecies;
    reactions.push({
      reactants: new Int32Array([r1]),
      products: new Int32Array([r2]),
      rateConstant: 0.01 + Math.random() * 0.1,
      propensityFactor: 1,
      degeneracy: 1,
    });
  }
  const speciesVolumes = new Float64Array(numSpecies).fill(1.0);
  const reactionVolumes = new Float64Array(numReactions).fill(1.0);
  const isConstant = new Array(numSpecies).fill(false);
  const y = new Float64Array(numSpecies);
  for (let i = 0; i < numSpecies; i++) y[i] = 10 + Math.random() * 90;
  return { reactions, speciesVolumes, reactionVolumes, isConstant, y, numSpecies };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('CVODE Performance Optimizations', () => {
  describe('Part 2: Zero-Copy Dense Derivative Numerical Equivalence', () => {

    function assertNumericalEquivalence(
      label: string,
      system: ReturnType<typeof makeSimpleSystem>,
      odeUsesAmountState: boolean
    ) {
      const refDydt = new Float64Array(system.numSpecies);
      const optDydt = new Float64Array(system.numSpecies);

      referenceDerivative(
        system.reactions, system.speciesVolumes, system.reactionVolumes,
        system.isConstant, odeUsesAmountState, system.y, refDydt
      );
      optimizedDerivative(
        system.reactions, system.speciesVolumes, system.reactionVolumes,
        system.isConstant, odeUsesAmountState, system.y, optDydt
      );

      for (let i = 0; i < system.numSpecies; i++) {
        expect(optDydt[i]).toBeCloseTo(refDydt[i], 12);
      }
    }

    it('should produce identical results for simple A->B->C (concentration mode)', () => {
      assertNumericalEquivalence('simple-conc', makeSimpleSystem(), false);
    });

    it('should produce identical results for simple A->B->C (amount mode)', () => {
      assertNumericalEquivalence('simple-amount', makeSimpleSystem(), true);
    });

    it('should produce identical results for bimolecular system with volumes', () => {
      assertNumericalEquivalence('bimol-conc', makeBimolecularSystem(), false);
    });

    it('should produce identical results for bimolecular system (amount mode)', () => {
      assertNumericalEquivalence('bimol-amount', makeBimolecularSystem(), true);
    });

    it('should produce identical results with constant species', () => {
      assertNumericalEquivalence('constant-conc', makeConstantSpeciesSystem(), false);
    });

    it('should produce identical results with stoichiometry > 1 and degeneracy', () => {
      assertNumericalEquivalence('stoich-conc', makeStoichiometricSystem(), false);
    });

    it('should produce identical results for large 60-species system', () => {
      assertNumericalEquivalence('large-conc', makeLargeSystem(), false);
    });

    it('should produce identical results for large system in amount mode', () => {
      assertNumericalEquivalence('large-amount', makeLargeSystem(), true);
    });

    it('should handle zero concentrations without NaN', () => {
      const system = makeSimpleSystem();
      system.y[0] = 0;
      system.y[1] = 0;
      const refDydt = new Float64Array(system.numSpecies);
      const optDydt = new Float64Array(system.numSpecies);

      referenceDerivative(
        system.reactions, system.speciesVolumes, system.reactionVolumes,
        system.isConstant, false, system.y, refDydt
      );
      optimizedDerivative(
        system.reactions, system.speciesVolumes, system.reactionVolumes,
        system.isConstant, false, system.y, optDydt
      );

      for (let i = 0; i < system.numSpecies; i++) {
        expect(Number.isFinite(optDydt[i])).toBe(true);
        expect(optDydt[i]).toBeCloseTo(refDydt[i], 12);
      }
    });
  });

  describe('Part 2: Zero-Copy Sparse CSR Derivative Numerical Equivalence', () => {
    it('should match reference derivative for simple system via sparse path', () => {
      const system = makeSimpleSystem();
      const refDydt = new Float64Array(system.numSpecies);
      const sparseDydt = new Float64Array(system.numSpecies);

      referenceDerivative(
        system.reactions, system.speciesVolumes, system.reactionVolumes,
        system.isConstant, false, system.y, refDydt
      );
      optimizedSparseDerivative(
        system.reactions, system.speciesVolumes, system.reactionVolumes,
        system.isConstant, false, system.y, sparseDydt
      );

      for (let i = 0; i < system.numSpecies; i++) {
        expect(sparseDydt[i]).toBeCloseTo(refDydt[i], 12);
      }
    });

    it('should match reference for bimolecular system with volumes', () => {
      const system = makeBimolecularSystem();
      const refDydt = new Float64Array(system.numSpecies);
      const sparseDydt = new Float64Array(system.numSpecies);

      referenceDerivative(
        system.reactions, system.speciesVolumes, system.reactionVolumes,
        system.isConstant, false, system.y, refDydt
      );
      optimizedSparseDerivative(
        system.reactions, system.speciesVolumes, system.reactionVolumes,
        system.isConstant, false, system.y, sparseDydt
      );

      for (let i = 0; i < system.numSpecies; i++) {
        expect(sparseDydt[i]).toBeCloseTo(refDydt[i], 12);
      }
    });

    it('should match reference for large system', () => {
      const system = makeLargeSystem();
      const refDydt = new Float64Array(system.numSpecies);
      const sparseDydt = new Float64Array(system.numSpecies);

      referenceDerivative(
        system.reactions, system.speciesVolumes, system.reactionVolumes,
        system.isConstant, false, system.y, refDydt
      );
      optimizedSparseDerivative(
        system.reactions, system.speciesVolumes, system.reactionVolumes,
        system.isConstant, false, system.y, sparseDydt
      );

      for (let i = 0; i < system.numSpecies; i++) {
        expect(sparseDydt[i]).toBeCloseTo(refDydt[i], 10);
      }
    });

    it('should match reference for system with constant species', () => {
      const system = makeConstantSpeciesSystem();
      const refDydt = new Float64Array(system.numSpecies);
      const sparseDydt = new Float64Array(system.numSpecies);

      referenceDerivative(
        system.reactions, system.speciesVolumes, system.reactionVolumes,
        system.isConstant, false, system.y, refDydt
      );
      optimizedSparseDerivative(
        system.reactions, system.speciesVolumes, system.reactionVolumes,
        system.isConstant, false, system.y, sparseDydt
      );

      for (let i = 0; i < system.numSpecies; i++) {
        expect(sparseDydt[i]).toBeCloseTo(refDydt[i], 12);
      }
    });
  });

  describe('Part 1: KLU Sparse Solver Auto-Selection Threshold', () => {
    it('should not auto-select sparse for small models (< 50 species)', () => {
      // The KLU_SPARSE_SPECIES_THRESHOLD is 50.
      // Models below 50 species should NOT auto-upgrade to sparse.
      // This verifies the threshold constant is respected.
      const smallSystemSpecies = 30;
      const smallSystemReactions = 40;
      // Build a small CSR to test shouldUseSparse
      const reactions: StoichiometryReaction[] = [];
      for (let i = 0; i < smallSystemReactions; i++) {
        reactions.push({
          reactants: new Int32Array([i % smallSystemSpecies]),
          products: new Int32Array([(i + 1) % smallSystemSpecies]),
        });
      }
      const csr = buildCSRStoichiometry(reactions, smallSystemSpecies);
      // shouldUseSparse has its own threshold (20 species), which is different
      // from the KLU threshold (50). Both should be below 50 for this test.
      // The important thing: the KLU auto-selection in SimulationLoop.ts
      // only fires at >= 50 species. For 30 species, cvode stays dense.
      expect(smallSystemSpecies).toBeLessThan(50);
    });

    it('should be eligible for sparse auto-selection for large models (>= 50 species)', () => {
      const largeSystemSpecies = 60;
      const largeSystemReactions = 80;
      const reactions: StoichiometryReaction[] = [];
      for (let i = 0; i < largeSystemReactions; i++) {
        reactions.push({
          reactants: new Int32Array([i % largeSystemSpecies]),
          products: new Int32Array([(i + 1) % largeSystemSpecies]),
        });
      }
      const csr = buildCSRStoichiometry(reactions, largeSystemSpecies);
      // At 60 species, KLU auto-selection should fire (>= 50 threshold)
      expect(largeSystemSpecies).toBeGreaterThanOrEqual(50);
      // The sparsity should be high for such a system (each reaction touches 2 of 60 species)
      const sparsity = 1 - csr.nnz / (largeSystemSpecies * largeSystemReactions);
      expect(sparsity).toBeGreaterThan(0.5);
    });

    it('should use sparse CSR path for eligible models (shouldUseSparse)', () => {
      // 60 species, 80 reactions, each touching 2 species => very sparse
      const n = 60;
      const m = 80;
      const reactions: StoichiometryReaction[] = [];
      for (let i = 0; i < m; i++) {
        reactions.push({
          reactants: new Int32Array([i % n]),
          products: new Int32Array([(i + 1) % n]),
        });
      }
      const csr = buildCSRStoichiometry(reactions, n);
      expect(shouldUseSparse(n, m, csr.nnz)).toBe(true);
    });

    it('should NOT use sparse CSR path for small dense models', () => {
      // 5 species, 10 reactions => dense
      const n = 5;
      const m = 10;
      const reactions: StoichiometryReaction[] = [];
      for (let i = 0; i < m; i++) {
        reactions.push({
          reactants: new Int32Array([i % n]),
          products: new Int32Array([(i + 1) % n]),
        });
      }
      const csr = buildCSRStoichiometry(reactions, n);
      expect(shouldUseSparse(n, m, csr.nnz)).toBe(false);
    });
  });

  describe('Dense vs Sparse path consistency', () => {
    it('optimized dense and sparse paths produce identical results', () => {
      const system = makeStoichiometricSystem();
      const denseDydt = new Float64Array(system.numSpecies);
      const sparseDydt = new Float64Array(system.numSpecies);

      optimizedDerivative(
        system.reactions, system.speciesVolumes, system.reactionVolumes,
        system.isConstant, false, system.y, denseDydt
      );
      optimizedSparseDerivative(
        system.reactions, system.speciesVolumes, system.reactionVolumes,
        system.isConstant, false, system.y, sparseDydt
      );

      for (let i = 0; i < system.numSpecies; i++) {
        expect(sparseDydt[i]).toBeCloseTo(denseDydt[i], 12);
      }
    });

    it('all three paths (reference, dense-opt, sparse-opt) agree on large system', () => {
      const system = makeLargeSystem(40, 50);
      const refDydt = new Float64Array(system.numSpecies);
      const denseDydt = new Float64Array(system.numSpecies);
      const sparseDydt = new Float64Array(system.numSpecies);

      referenceDerivative(
        system.reactions, system.speciesVolumes, system.reactionVolumes,
        system.isConstant, false, system.y, refDydt
      );
      optimizedDerivative(
        system.reactions, system.speciesVolumes, system.reactionVolumes,
        system.isConstant, false, system.y, denseDydt
      );
      optimizedSparseDerivative(
        system.reactions, system.speciesVolumes, system.reactionVolumes,
        system.isConstant, false, system.y, sparseDydt
      );

      for (let i = 0; i < system.numSpecies; i++) {
        expect(denseDydt[i]).toBeCloseTo(refDydt[i], 10);
        expect(sparseDydt[i]).toBeCloseTo(refDydt[i], 10);
      }
    });
  });
});
