import { describe, expect, it } from 'vitest';
import {
  computeLNASteadyState,
  computeLNATimeCourse,
} from '../../src/services/analysis/LinearNoiseApproximation';
import type { BNGLModel, BNGLReaction, BNGLSpecies } from '../../src/types';

/**
 * Helper to build a minimal BNGLModel for LNA tests.
 */
function makeModel(
  species: BNGLSpecies[],
  reactions: BNGLReaction[],
  parameters: Record<string, number> = {},
): BNGLModel {
  return {
    parameters,
    moleculeTypes: [],
    species,
    observables: [],
    reactions,
  };
}

function makeReaction(
  reactants: string[],
  products: string[],
  rateConstant: number,
): BNGLReaction {
  return {
    reactants,
    products,
    rate: String(rateConstant),
    rateConstant,
  };
}

// ── Test 1: Birth-death process ───────────────────────────────────

describe('LNA steady-state: birth-death process', () => {
  const kBirth = 10;
  const kDeath = 1;

  const species: BNGLSpecies[] = [{ name: 'A', initialConcentration: 10 }];
  const reactions: BNGLReaction[] = [
    makeReaction([], ['A'], kBirth),   // 0 -> A
    makeReaction(['A'], [], kDeath),   // A -> 0
  ];
  const model = makeModel(species, reactions, { k_birth: kBirth, k_death: kDeath });

  it('computes correct mean (k_birth / k_death = 10)', () => {
    const result = computeLNASteadyState({ model, reactions, species });
    expect(result.converged).toBe(true);
    expect(result.mean[0]).toBeCloseTo(kBirth / kDeath, 3);
  });

  it('computes Poisson variance (= mean = 10)', () => {
    const result = computeLNASteadyState({ model, reactions, species });
    expect(result.covariance[0][0]).toBeCloseTo(kBirth / kDeath, 2);
  });

  it('computes correct Fano factor (= 1 for Poisson)', () => {
    const result = computeLNASteadyState({ model, reactions, species });
    expect(result.fano[0]).toBeCloseTo(1, 2);
  });

  it('computes correct CV (= 1/sqrt(mean))', () => {
    const result = computeLNASteadyState({ model, reactions, species });
    const expectedCV = 1 / Math.sqrt(kBirth / kDeath);
    expect(result.cv[0]).toBeCloseTo(expectedCV, 2);
  });

  it('returns the correct species name', () => {
    const result = computeLNASteadyState({ model, reactions, species });
    expect(result.speciesNames).toEqual(['A']);
  });
});

// ── Test 2: Volume scaling ────────────────────────────────────────

describe('LNA steady-state: volume scaling', () => {
  const kBirth = 10;
  const kDeath = 1;
  const species: BNGLSpecies[] = [{ name: 'A', initialConcentration: 10 }];
  const reactions: BNGLReaction[] = [
    makeReaction([], ['A'], kBirth),
    makeReaction(['A'], [], kDeath),
  ];
  const model = makeModel(species, reactions);

  it('variance at V=100 is 1/100 of variance at V=1', () => {
    const resultV1 = computeLNASteadyState({
      model,
      reactions,
      species,
      volume: 1,
    });
    const resultV100 = computeLNASteadyState({
      model,
      reactions,
      species,
      volume: 100,
    });

    expect(resultV1.converged).toBe(true);
    expect(resultV100.converged).toBe(true);

    const ratio = resultV1.covariance[0][0] / resultV100.covariance[0][0];
    expect(ratio).toBeCloseTo(100, 1);
  });

  it('mean is independent of volume', () => {
    const resultV1 = computeLNASteadyState({
      model,
      reactions,
      species,
      volume: 1,
    });
    const resultV100 = computeLNASteadyState({
      model,
      reactions,
      species,
      volume: 100,
    });

    expect(resultV1.mean[0]).toBeCloseTo(resultV100.mean[0], 6);
  });
});

// ── Test 3: Time-dependent decay ──────────────────────────────────

describe('LNA time-dependent: pure decay', () => {
  const kDecay = 0.1;
  const A0 = 1000;
  const species: BNGLSpecies[] = [{ name: 'A', initialConcentration: A0 }];
  const reactions: BNGLReaction[] = [makeReaction(['A'], [], kDecay)];
  const model = makeModel(species, reactions);

  it('variance trajectory is non-negative', () => {
    const result = computeLNATimeCourse({
      model,
      reactions,
      species,
      timeDependent: true,
      t_end: 50,
      n_steps: 200,
    });

    expect(result.times.length).toBe(201); // 0 + 200 steps
    expect(result.variances.length).toBe(201);

    for (let t = 0; t < result.variances.length; t++) {
      expect(result.variances[t][0]).toBeGreaterThanOrEqual(-1e-10);
    }
  });

  it('variance is bounded by the mean', () => {
    const result = computeLNATimeCourse({
      model,
      reactions,
      species,
      timeDependent: true,
      t_end: 50,
      n_steps: 200,
    });

    for (let t = 0; t < result.variances.length; t++) {
      // For a pure death process, variance <= mean (sub-Poisson or Poisson)
      expect(result.variances[t][0]).toBeLessThanOrEqual(
        result.means[t][0] + 1,
      );
    }
  });

  it('mean follows exponential decay', () => {
    const result = computeLNATimeCourse({
      model,
      reactions,
      species,
      timeDependent: true,
      t_end: 20,
      n_steps: 100,
    });

    // Check a few time points against A0 * exp(-k * t)
    for (const tIdx of [10, 50, 100]) {
      const t = result.times[tIdx];
      const expectedMean = A0 * Math.exp(-kDecay * t);
      expect(result.means[tIdx][0]).toBeCloseTo(expectedMean, 0);
    }
  });
});

// ── Test 4: Two-species system ────────────────────────────────────

describe('LNA steady-state: two-species (A -> B with source)', () => {
  // Source: 0 -> A with rate k_source
  // Conversion: A -> B with rate k_conv
  // Degradation: B -> 0 with rate k_deg
  const kSource = 5;
  const kConv = 0.5;
  const kDeg = 0.5;

  const species: BNGLSpecies[] = [
    { name: 'A', initialConcentration: 10 },
    { name: 'B', initialConcentration: 10 },
  ];
  const reactions: BNGLReaction[] = [
    makeReaction([], ['A'], kSource),
    makeReaction(['A'], ['B'], kConv),
    makeReaction(['B'], [], kDeg),
  ];
  const model = makeModel(species, reactions);

  it('converges to the correct steady state', () => {
    const result = computeLNASteadyState({ model, reactions, species });
    expect(result.converged).toBe(true);

    // Steady state: A* = k_source / k_conv = 10, B* = k_source / k_deg = 10
    expect(result.mean[0]).toBeCloseTo(kSource / kConv, 2);
    expect(result.mean[1]).toBeCloseTo(kSource / kDeg, 2);
  });

  it('produces a 2x2 positive semi-definite covariance matrix', () => {
    const result = computeLNASteadyState({ model, reactions, species });
    const C = result.covariance;

    expect(C.length).toBe(2);
    expect(C[0].length).toBe(2);
    expect(C[1].length).toBe(2);

    // Diagonal entries must be non-negative (variances)
    expect(C[0][0]).toBeGreaterThan(0);
    expect(C[1][1]).toBeGreaterThan(0);

    // Positive semi-definite: det(C) >= 0
    const det = C[0][0] * C[1][1] - C[0][1] * C[1][0];
    expect(det).toBeGreaterThanOrEqual(-1e-10);

    // Symmetry
    expect(C[0][1]).toBeCloseTo(C[1][0], 10);
  });

  it('returns correct species names', () => {
    const result = computeLNASteadyState({ model, reactions, species });
    expect(result.speciesNames).toEqual(['A', 'B']);
  });

  it('CV values are positive', () => {
    const result = computeLNASteadyState({ model, reactions, species });
    expect(result.cv[0]).toBeGreaterThan(0);
    expect(result.cv[1]).toBeGreaterThan(0);
  });
});
