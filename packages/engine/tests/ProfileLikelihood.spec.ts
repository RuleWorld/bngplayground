import { describe, it, expect } from 'vitest';
import { profileLikelihood } from '../src/services/analysis/ProfileLikelihood';

describe('profileLikelihood', () => {
  it('well-identified parameter: U-shaped profile, finite CI', async () => {
    // y = a*x, true a=2
    const experimentalData = [
      { time: 0, values: { Y: 0 } },
      { time: 1, values: { Y: 2 } },
      { time: 2, values: { Y: 4 } },
      { time: 3, values: { Y: 6 } },
    ];

    const result = await profileLikelihood({
      simulate: async (overrides) => ({
        data: [0, 1, 2, 3].map((x) => ({ time: x, Y: overrides['a'] * x })),
      }),
      parameters: { a: 2 },
      parameterNames: ['a'],
      experimentalData,
      nGrid: 20,
      rangeFactor: 5,
      reoptimize: false,
    });

    const profile = result.profiles['a'];
    expect(profile).toBeDefined();
    expect(profile.identifiability).toBe('identifiable');
    expect(profile.flat).toBe(false);
    expect(profile.ci).not.toBeNull();
    expect(profile.ci!.lower).toBeLessThan(2);
    expect(profile.ci!.upper).toBeGreaterThan(2);
  });

  it('structurally unidentifiable parameter: flat profile', async () => {
    // y = a*b*x, fixing a, profiling b → flat because a*b is constant
    // But we only profile one param without reopt → SSR changes
    // To make flat: make output independent of parameter
    const experimentalData = [
      { time: 0, values: { Y: 0 } },
      { time: 1, values: { Y: 5 } },
    ];

    const result = await profileLikelihood({
      simulate: async (_overrides) => ({
        data: [
          { time: 0, Y: 0 },
          { time: 1, Y: 5 }, // Always returns constant regardless of params
        ],
      }),
      parameters: { a: 2 },
      parameterNames: ['a'],
      experimentalData,
      nGrid: 10,
      rangeFactor: 5,
      reoptimize: false,
    });

    const profile = result.profiles['a'];
    expect(profile.flat).toBe(true);
    expect(profile.identifiability).toBe('structurally_unidentifiable');
  });

  it('baseline SSR is computed correctly', async () => {
    const experimentalData = [{ time: 1, values: { Y: 2 } }];

    const result = await profileLikelihood({
      simulate: async (overrides) => ({
        data: [{ time: 0, Y: 0 }, { time: 1, Y: overrides['a'] }],
      }),
      parameters: { a: 2 },
      parameterNames: ['a'],
      experimentalData,
      nGrid: 5,
      reoptimize: false,
    });

    // Baseline: simulate with a=2, Y=2, exp=2 → SSR=0
    expect(result.baselineSSR).toBeCloseTo(0, 6);
    expect(result.threshold).toBeGreaterThan(0); // chi2 threshold > 0
  });

  it('uses chi-square scale for flatness near a perfect fit', async () => {
    const result = await profileLikelihood({
      simulate: async (overrides) => ({
        data: [{ time: 0, Y: 1 + 1e-4 * overrides.a }],
      }),
      parameters: { a: 1 },
      parameterNames: ['a'],
      experimentalData: [{ time: 0, values: { Y: 1 } }],
      nGrid: 5,
      rangeFactor: 10,
      reoptimize: false,
    });

    expect(result.profiles.a.flat).toBe(true);
    expect(result.profiles.a.identifiability).toBe('structurally_unidentifiable');
  });

  it('marks confidence intervals limited by the scan window', async () => {
    const result = await profileLikelihood({
      simulate: async (overrides) => ({
        data: [{ time: 0, Y: 1 + 0.1 * overrides.a }],
      }),
      parameters: { a: 1 },
      parameterNames: ['a'],
      experimentalData: [{ time: 0, values: { Y: 1 } }],
      nGrid: 5,
      rangeFactor: 10,
      reoptimize: false,
    });

    expect(result.profiles.a.flat).toBe(false);
    expect(result.profiles.a.ci).toBeNull();
    expect(result.profiles.a.ciGridRange).not.toBeNull();
    expect(result.profiles.a.ciStatus).toBe('both_grid_limited');
    expect(result.profiles.a.identifiability).toBe('practically_unidentifiable');
  });

  it('rejects an empty baseline trajectory with an analysis error', async () => {
    await expect(profileLikelihood({
      simulate: async () => ({ data: [] }),
      parameters: { a: 1 },
      parameterNames: ['a'],
      experimentalData: [{ time: 0, values: { Y: 1 } }],
      nGrid: 3,
      reoptimize: false,
    })).rejects.toThrow(/baseline simulation returned no trajectory data/);
  });

  it('re-optimizes omitted model parameters when profiling a subset', async () => {
    const calls: Array<Record<string, number>> = [];
    const result = await profileLikelihood({
      simulate: async (overrides) => {
        calls.push({ ...overrides });
        const nuisanceResidual = (overrides.k2 - 7) ** 2 + (overrides.k3 - 11) ** 2;
        return { data: [{ time: 0, Y: nuisanceResidual }] };
      },
      parameters: { k1: 1, k2: 2, k3: 3 },
      parameterNames: ['k1'],
      experimentalData: [{ time: 0, values: { Y: 0 } }],
      nGrid: 3,
      rangeFactor: 2,
      reoptimize: true,
      maxReoptEval: 20,
    });

    expect(result.profiles.k1).toBeDefined();
    expect(calls.some((overrides) => overrides.k2 !== 2 || overrides.k3 !== 3)).toBe(true);
  });

  it('rejects profile requests whose re-optimization budget is too large', async () => {
    await expect(profileLikelihood({
      simulate: async () => ({ data: [{ time: 0, Y: 0 }] }),
      parameters: { a: 1, b: 1, c: 1 },
      parameterNames: ['a', 'b', 'c'],
      experimentalData: [{ time: 0, values: { Y: 0 } }],
      nGrid: 100,
      maxReoptEval: 100,
      reoptimize: true,
    })).rejects.toThrow(/could require .* simulations/);
  });
});
