/**
 * webgpu-ssa.spec.ts - Tests for WebGPU-accelerated ensemble SSA
 */

import { describe, it, expect } from 'vitest';
import {
  generateSSAShader,
  isGPUSSACompatible,
  runCPUSSAEnsemble,
  type GPUSSAConfig,
  type SSAReaction,
} from '../src/services/WebGPUSSA';

// ---------------------------------------------------------------------------
// Helper: build a config for a simple birth-death process
//   species 0 (X):  0 -> X  with rate birth
//                    X -> 0  with rate death
// ---------------------------------------------------------------------------
function birthDeathConfig(
  birth: number,
  death: number,
  x0: number,
  nTrajectories: number,
  tEnd: number,
  nOutputPoints: number,
  seed?: number,
): GPUSSAConfig {
  const reactions: SSAReaction[] = [
    { reactants: [], products: [0], rateConstant: birth, name: 'birth' },
    { reactants: [0], products: [], rateConstant: death, name: 'death' },
  ];
  return {
    reactions,
    nSpecies: 1,
    speciesNames: ['X'],
    initialState: new Float64Array([x0]),
    nTrajectories,
    tEnd,
    nOutputPoints,
    seed: seed ?? 12345,
    maxStepsPerTrajectory: 2_000_000,
  };
}

// ---------------------------------------------------------------------------
// 1. Shader generation
// ---------------------------------------------------------------------------

describe('generateSSAShader', () => {
  it('contains correct species and reaction constants', () => {
    const reactions: SSAReaction[] = [
      { reactants: [0], products: [1], rateConstant: 0.5 },
      { reactants: [1], products: [0, 2], rateConstant: 0.3 },
    ];
    const shader = generateSSAShader(reactions, 3, 50, 100000);

    expect(shader).toContain('const N_SPECIES: u32 = 3u;');
    expect(shader).toContain('const N_REACTIONS: u32 = 2u;');
    expect(shader).toContain('const N_OUTPUT_POINTS: u32 = 50u;');
    expect(shader).toContain('const MAX_STEPS: u32 = 100000u;');
  });

  it('generates sparse stoichiometry application with correct size', () => {
    const reactions: SSAReaction[] = [
      { reactants: [0], products: [1], rateConstant: 1.0 },
    ];
    const shader = generateSSAShader(reactions, 2, 10, 1000);

    // Reaction 0 -> 1: species 0 loses 1, species 1 gains 1
    expect(shader).toContain('state[0u] = state[0u] - 1.0;');
    expect(shader).toContain('state[1u] = state[1u] + 1.0;');
  });

  it('includes xoshiro128** PRNG implementation', () => {
    const reactions: SSAReaction[] = [
      { reactants: [], products: [0], rateConstant: 1.0 },
    ];
    const shader = generateSSAShader(reactions, 1, 10, 1000);
    expect(shader).toContain('fn xoshiro128ss');
    expect(shader).toContain('fn rand_uniform');
    expect(shader).toContain('fn rand_exponential');
  });

  it('generates proper entry point', () => {
    const reactions: SSAReaction[] = [
      { reactants: [], products: [0], rateConstant: 1.0 },
    ];
    const shader = generateSSAShader(reactions, 1, 10, 1000);
    expect(shader).toContain('@compute @workgroup_size(1)');
    expect(shader).toContain('fn ssa_main');
  });
});

// ---------------------------------------------------------------------------
// 2. Propensity function / homodimer handling
// ---------------------------------------------------------------------------

describe('propensity generation', () => {
  it('generates simple first-order propensity', () => {
    const reactions: SSAReaction[] = [
      { reactants: [0], products: [], rateConstant: 0.5 },
    ];
    const shader = generateSSAShader(reactions, 1, 10, 1000);
    // Should multiply rate by state[0]
    expect(shader).toContain('0.5');
    expect(shader).toContain('(*state)[0u]');
  });

  it('handles homodimer reactions with x*(x-1)/2', () => {
    // A + A -> B  (reactants: [0, 0])
    const reactions: SSAReaction[] = [
      { reactants: [0, 0], products: [1], rateConstant: 1.0 },
    ];
    const shader = generateSSAShader(reactions, 2, 10, 1000);
    // Should have the (x-1) factor and division by 2
    expect(shader).toContain('(*state)[0u] - 1.0');
    expect(shader).toContain('/ 2.0');
  });

  it('handles bimolecular reactions with two different species', () => {
    // A + B -> C  (reactants: [0, 1])
    const reactions: SSAReaction[] = [
      { reactants: [0, 1], products: [2], rateConstant: 0.1 },
    ];
    const shader = generateSSAShader(reactions, 3, 10, 1000);
    expect(shader).toContain('(*state)[0u]');
    expect(shader).toContain('(*state)[1u]');
  });

  it('handles zero-order reactions (no reactants)', () => {
    const reactions: SSAReaction[] = [
      { reactants: [], products: [0], rateConstant: 5.0 },
    ];
    const shader = generateSSAShader(reactions, 1, 10, 1000);
    // Propensity should just be the rate constant
    expect(shader).toContain('5');
  });
});

// ---------------------------------------------------------------------------
// 3. CPU fallback: birth-death analytical test
// ---------------------------------------------------------------------------

describe('runCPUSSAEnsemble', () => {
  it('birth-death mean matches analytical solution', () => {
    // For birth-death process: E[X(t)] = x0 * exp((birth-death)*t) + birth/(death-birth)*(exp(...)-1)
    // Simpler: pure death: birth=0, death=d => E[X(t)] = x0 * exp(-d*t)
    const x0 = 100;
    const deathRate = 0.1;
    const tEnd = 5;
    const nOutputPoints = 10;
    const nTrajectories = 5000;

    const config = birthDeathConfig(0, deathRate, x0, nTrajectories, tEnd, nOutputPoints, 42);
    const result = runCPUSSAEnsemble(config);

    expect(result.statistics.length).toBe(nOutputPoints);
    expect(result.timePoints.length).toBe(nOutputPoints);
    expect(result.totalReactions.length).toBe(nTrajectories);

    // Check mean at each output time
    for (let i = 0; i < nOutputPoints; i++) {
      const t = result.timePoints[i];
      const expectedMean = x0 * Math.exp(-deathRate * t);
      const observedMean = result.statistics[i].mean[0];
      // Allow 10% relative tolerance for stochastic simulation
      const relError = Math.abs(observedMean - expectedMean) / Math.max(expectedMean, 1);
      expect(relError).toBeLessThan(0.1);
    }
  });

  it('pure birth process produces increasing population', () => {
    const x0 = 10;
    const birthRate = 0.5;
    const tEnd = 2;
    const nOutputPoints = 5;
    const nTrajectories = 500;

    const config = birthDeathConfig(birthRate, 0, x0, nTrajectories, tEnd, nOutputPoints, 99);
    const result = runCPUSSAEnsemble(config);

    // Mean should be increasing
    for (let i = 1; i < nOutputPoints; i++) {
      expect(result.statistics[i].mean[0]).toBeGreaterThan(result.statistics[i - 1].mean[0]);
    }

    // Mean at final time: x0 + birth * tEnd (for constant birth)
    const finalMean = result.statistics[nOutputPoints - 1].mean[0];
    const expectedFinal = x0 + birthRate * tEnd;
    const relError = Math.abs(finalMean - expectedFinal) / expectedFinal;
    expect(relError).toBeLessThan(0.15);
  });

  it('absorbed state fills remaining output points', () => {
    // A single molecule with very high death rate
    const reactions: SSAReaction[] = [
      { reactants: [0], products: [], rateConstant: 1000.0 },
    ];
    const config: GPUSSAConfig = {
      reactions,
      nSpecies: 1,
      speciesNames: ['X'],
      initialState: new Float64Array([1]),
      nTrajectories: 100,
      tEnd: 10,
      nOutputPoints: 5,
      seed: 77,
      maxStepsPerTrajectory: 100000,
    };

    const result = runCPUSSAEnsemble(config);

    // After the single molecule dies, all remaining output should be 0
    // Most trajectories should have X=0 at the final time
    const finalMean = result.statistics[4].mean[0];
    expect(finalMean).toBeLessThan(0.1);
  });
});

// ---------------------------------------------------------------------------
// 4. Two independent reactions don't interfere
// ---------------------------------------------------------------------------

describe('independent reactions', () => {
  it('two independent species evolve independently', () => {
    // Species A: birth at rate 1.0 (0 -> A)
    // Species B: death at rate 0.1 (B -> 0)
    const reactions: SSAReaction[] = [
      { reactants: [], products: [0], rateConstant: 1.0, name: 'birth_A' },
      { reactants: [1], products: [], rateConstant: 0.1, name: 'death_B' },
    ];

    const config: GPUSSAConfig = {
      reactions,
      nSpecies: 2,
      speciesNames: ['A', 'B'],
      initialState: new Float64Array([0, 50]),
      nTrajectories: 2000,
      tEnd: 5,
      nOutputPoints: 5,
      seed: 222,
      maxStepsPerTrajectory: 500000,
    };

    const result = runCPUSSAEnsemble(config);

    // A should be increasing (births only)
    for (let i = 1; i < 5; i++) {
      expect(result.statistics[i].mean[0]).toBeGreaterThan(result.statistics[i - 1].mean[0]);
    }

    // B should be decreasing (deaths only)
    for (let i = 1; i < 5; i++) {
      expect(result.statistics[i].mean[1]).toBeLessThan(result.statistics[i - 1].mean[1]);
    }

    // A's mean at time t: 0 + 1.0 * t
    const tFinal = result.timePoints[4];
    const aMean = result.statistics[4].mean[0];
    expect(Math.abs(aMean - tFinal) / tFinal).toBeLessThan(0.15);

    // B's mean at time t: 50 * exp(-0.1 * t)
    const bExpected = 50 * Math.exp(-0.1 * tFinal);
    const bMean = result.statistics[4].mean[1];
    expect(Math.abs(bMean - bExpected) / Math.max(bExpected, 1)).toBeLessThan(0.15);
  });
});

// ---------------------------------------------------------------------------
// 5. isGPUSSACompatible
// ---------------------------------------------------------------------------

describe('isGPUSSACompatible', () => {
  it('accepts valid mass-action network', () => {
    const reactions: SSAReaction[] = [
      { reactants: [0], products: [1], rateConstant: 0.5 },
      { reactants: [1], products: [0], rateConstant: 0.3 },
    ];
    expect(isGPUSSACompatible(reactions, 2)).toBe(true);
  });

  it('rejects negative rate constant', () => {
    const reactions: SSAReaction[] = [
      { reactants: [0], products: [1], rateConstant: -1.0 },
    ];
    expect(isGPUSSACompatible(reactions, 2)).toBe(false);
  });

  it('rejects NaN rate constant', () => {
    const reactions: SSAReaction[] = [
      { reactants: [0], products: [1], rateConstant: NaN },
    ];
    expect(isGPUSSACompatible(reactions, 2)).toBe(false);
  });

  it('rejects Infinity rate constant', () => {
    const reactions: SSAReaction[] = [
      { reactants: [0], products: [1], rateConstant: Infinity },
    ];
    expect(isGPUSSACompatible(reactions, 2)).toBe(false);
  });

  it('rejects too many species (> 256)', () => {
    const reactions: SSAReaction[] = [
      { reactants: [0], products: [1], rateConstant: 1.0 },
    ];
    expect(isGPUSSACompatible(reactions, 257)).toBe(false);
  });

  it('rejects too many reactions (> 1024)', () => {
    const reactions: SSAReaction[] = [];
    for (let i = 0; i < 1025; i++) {
      reactions.push({ reactants: [0], products: [1], rateConstant: 1.0 });
    }
    expect(isGPUSSACompatible(reactions, 2)).toBe(false);
  });

  it('rejects empty reaction list', () => {
    expect(isGPUSSACompatible([], 1)).toBe(false);
  });

  it('rejects out-of-range species index', () => {
    const reactions: SSAReaction[] = [
      { reactants: [5], products: [0], rateConstant: 1.0 },
    ];
    expect(isGPUSSACompatible(reactions, 3)).toBe(false);
  });

  it('accepts homodimer reactions', () => {
    const reactions: SSAReaction[] = [
      { reactants: [0, 0], products: [1], rateConstant: 0.1 },
    ];
    expect(isGPUSSACompatible(reactions, 2)).toBe(true);
  });

  it('accepts zero-order reactions', () => {
    const reactions: SSAReaction[] = [
      { reactants: [], products: [0], rateConstant: 5.0 },
    ];
    expect(isGPUSSACompatible(reactions, 1)).toBe(true);
  });
});
