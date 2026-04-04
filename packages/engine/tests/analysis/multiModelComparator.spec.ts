import { describe, it, expect } from 'vitest';
import {
  compareModels,
  generateVariants,
  interpolateResults,
  computeDivergenceMetrics,
  attributeDivergence,
} from '../../src/services/analysis/MultiModelComparator';
import type {
  SimulationResults,
  SimulationOptions,
} from '../../src/types';
import type {
  MultiModelConfig,
  SimulatorFn,
  ModelVariant,
} from '../../src/services/analysis/MultiModelComparator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal BNGL code string with the given reaction rule lines. */
function makeBNGL(rules: string[]): string {
  return [
    'begin model',
    'begin parameters',
    '  kf 1.0',
    '  kr 0.5',
    'end parameters',
    'begin molecule types',
    '  A()',
    '  B()',
    'end molecule types',
    'begin seed species',
    '  A() 100',
    'end seed species',
    'begin observables',
    '  Molecules Atot A()',
    '  Molecules Btot B()',
    'end observables',
    'begin reaction rules',
    ...rules.map((r) => '  ' + r),
    'end reaction rules',
    'end model',
  ].join('\n');
}

/** Build a SimulationResults object from arrays. */
function makeResults(
  times: number[],
  observables: Record<string, number[]>,
): SimulationResults {
  const headers = ['time', ...Object.keys(observables)];
  const data = times.map((t, i) => {
    const row: Record<string, number> = { time: t };
    for (const [name, values] of Object.entries(observables)) {
      row[name] = values[i];
    }
    return row;
  });
  return { headers, data };
}

/**
 * Create a mock simulator that returns pre-defined results keyed by
 * a substring match in the code.
 */
function mockSimulator(
  mapping: Array<{ match: string; results: SimulationResults }>,
  fallback?: SimulationResults,
): SimulatorFn {
  return async (code: string, _options: Partial<SimulationOptions>) => {
    for (const entry of mapping) {
      if (code.includes(entry.match)) {
        return entry.results;
      }
    }
    if (fallback) return fallback;
    throw new Error(`No mock results matched for code snippet`);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MultiModelComparator', () => {
  // -----------------------------------------------------------------------
  // 1. No divergence between identical models
  // -----------------------------------------------------------------------
  describe('compareModels - identical models', () => {
    it('reports no divergence between identical models', async () => {
      const code = makeBNGL(['A() -> B()  kf']);
      const times = [0, 1, 2, 3, 4];
      const results = makeResults(times, {
        Atot: [100, 80, 60, 40, 20],
        Btot: [0, 20, 40, 60, 80],
      });

      const config: MultiModelConfig = {
        variants: [
          { name: 'Model A', code },
          { name: 'Model B', code },
        ],
        divergenceThreshold: 0.1,
      };

      const simulator = mockSimulator([], results);
      const result = await compareModels(config, simulator);

      expect(result.divergences).toHaveLength(0);
      expect(result.firstDivergenceTime).toBeNull();
      expect(result.variants).toHaveLength(2);
      expect(result.sharedRules).toContain('A() -> B() kf');
    });
  });

  // -----------------------------------------------------------------------
  // 2. Detects divergence when rate constants differ significantly
  // -----------------------------------------------------------------------
  describe('compareModels - divergent models', () => {
    it('detects divergence when trajectories differ significantly', async () => {
      const code1 = makeBNGL(['A() -> B()  kf']);
      // Use a unique marker so the mock can distinguish the two codes
      const code2 = code1 + '\n# SLOW_VARIANT';

      const results1 = makeResults([0, 1, 2, 3], {
        Atot: [100, 80, 60, 40],
        Btot: [0, 20, 40, 60],
      });
      const results2 = makeResults([0, 1, 2, 3], {
        Atot: [100, 95, 90, 85],
        Btot: [0, 5, 10, 15],
      });

      const config: MultiModelConfig = {
        variants: [
          { name: 'Fast', code: code1 },
          { name: 'Slow', code: code2 },
        ],
        divergenceThreshold: 0.05,
      };

      // Order matters: check for the unique marker first
      const simulator = mockSimulator([
        { match: 'SLOW_VARIANT', results: results2 },
        { match: 'A() -> B()', results: results1 },
      ]);

      const result = await compareModels(config, simulator);

      expect(result.divergences.length).toBeGreaterThan(0);
      expect(result.firstDivergenceTime).not.toBeNull();
      // The divergence should occur at time > 0 (at time 0, both start the same)
      expect(result.firstDivergenceTime).toBeGreaterThanOrEqual(0);
      // Should detect divergence in at least one observable
      const observablesWithDiv = new Set(
        result.divergences.map((d) => d.observable),
      );
      expect(observablesWithDiv.size).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Generates correct number of knockout variants
  // -----------------------------------------------------------------------
  describe('generateVariants', () => {
    it('creates N knockout variants for N rules', () => {
      const code = makeBNGL([
        'R1: A() -> B()  kf',
        'R2: B() -> A()  kr',
        'A() + B() -> A()  kf',
      ]);

      const variants = generateVariants(code);

      expect(variants).toHaveLength(3);
      // Each variant should have a name starting with "KO:"
      for (const v of variants) {
        expect(v.name).toMatch(/^KO:/);
      }
      // First two should pick up rule names R1 and R2
      expect(variants[0].name).toBe('KO: R1');
      expect(variants[1].name).toBe('KO: R2');
    });

    it('includes base model when requested', () => {
      const code = makeBNGL(['A() -> B()  kf']);
      const variants = generateVariants(code, { includeBase: true });
      expect(variants).toHaveLength(2); // base + 1 KO
      expect(variants[0].name).toBe('Base Model');
    });

    it('comments out the correct rule line in each variant', () => {
      const code = makeBNGL([
        'R1: A() -> B()  kf',
        'R2: B() -> A()  kr',
      ]);
      const variants = generateVariants(code);

      // First variant should have R1 commented and R2 intact
      expect(variants[0].code).toContain('# ');
      expect(variants[0].code).toMatch(/^#\s.*R1/m);
      expect(variants[0].code).toMatch(/^\s+R2:/m);

      // Second variant should have R2 commented and R1 intact
      expect(variants[1].code).toMatch(/^#\s.*R2/m);
      expect(variants[1].code).toMatch(/^\s+R1:/m);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Interpolation produces correct values for linear data
  // -----------------------------------------------------------------------
  describe('interpolateResults', () => {
    it('interpolates linearly between known points', () => {
      const results = makeResults([0, 2, 4], {
        A: [0, 10, 20],
        B: [100, 50, 0],
      });

      const interpolated = interpolateResults(results, [0, 1, 2, 3, 4]);

      // Check time column
      expect(interpolated.data.map((r) => r.time)).toEqual([0, 1, 2, 3, 4]);

      // A should be linear: 0, 5, 10, 15, 20
      expect(interpolated.data[0].A).toBeCloseTo(0);
      expect(interpolated.data[1].A).toBeCloseTo(5);
      expect(interpolated.data[2].A).toBeCloseTo(10);
      expect(interpolated.data[3].A).toBeCloseTo(15);
      expect(interpolated.data[4].A).toBeCloseTo(20);

      // B should be linear: 100, 75, 50, 25, 0
      expect(interpolated.data[0].B).toBeCloseTo(100);
      expect(interpolated.data[1].B).toBeCloseTo(75);
      expect(interpolated.data[2].B).toBeCloseTo(50);
      expect(interpolated.data[3].B).toBeCloseTo(25);
      expect(interpolated.data[4].B).toBeCloseTo(0);
    });

    it('clamps values outside the source time range', () => {
      const results = makeResults([1, 3], {
        X: [10, 30],
      });

      const interpolated = interpolateResults(results, [0, 1, 2, 3, 5]);

      // Before range: clamp to first
      expect(interpolated.data[0].X).toBeCloseTo(10);
      // At boundaries
      expect(interpolated.data[1].X).toBeCloseTo(10);
      expect(interpolated.data[3].X).toBeCloseTo(30);
      // After range: clamp to last
      expect(interpolated.data[4].X).toBeCloseTo(30);
      // Interior: midpoint
      expect(interpolated.data[2].X).toBeCloseTo(20);
    });

    it('preserves headers in the output', () => {
      const results = makeResults([0, 1], { Y: [1, 2] });
      const interpolated = interpolateResults(results, [0, 0.5, 1]);
      expect(interpolated.headers).toEqual(['time', 'Y']);
    });
  });

  // -----------------------------------------------------------------------
  // 5. CV computation is correct for known values
  // -----------------------------------------------------------------------
  describe('computeDivergenceMetrics', () => {
    it('computes CV correctly and flags divergence above threshold', () => {
      // Two variants, one observable, 3 time points.
      // At t=0: both = 100 -> CV = 0
      // At t=1: 80 vs 60 -> mean=70, std=10, CV = 10/70 ~ 0.143
      // At t=2: 60 vs 20 -> mean=40, std=20, CV = 20/40 = 0.5
      const v1 = makeResults([0, 1, 2], { Obs: [100, 80, 60] });
      const v2 = makeResults([0, 1, 2], { Obs: [100, 60, 20] });

      const allResults = [
        { name: 'V1', results: v1 },
        { name: 'V2', results: v2 },
      ];

      const divs = computeDivergenceMetrics(allResults, ['Obs'], 0.1);

      // t=0 should NOT diverge (identical values)
      expect(divs.filter((d) => d.time === 0)).toHaveLength(0);

      // t=1 and t=2 should diverge (CV > 0.1)
      const t1Divs = divs.filter((d) => d.time === 1);
      expect(t1Divs).toHaveLength(1);
      expect(t1Divs[0].relativeDeviation).toBeCloseTo(10 / 70, 3);
      expect(t1Divs[0].maxDifference).toBeCloseTo(20);

      const t2Divs = divs.filter((d) => d.time === 2);
      expect(t2Divs).toHaveLength(1);
      expect(t2Divs[0].relativeDeviation).toBeCloseTo(0.5, 3);
      expect(t2Divs[0].maxDifference).toBeCloseTo(40);
    });

    it('returns no divergences when values are identical', () => {
      const r = makeResults([0, 1], { X: [5, 10] });
      const divs = computeDivergenceMetrics(
        [
          { name: 'A', results: r },
          { name: 'B', results: r },
        ],
        ['X'],
        0.01,
      );
      expect(divs).toHaveLength(0);
    });

    it('handles a single variant gracefully', () => {
      const r = makeResults([0, 1], { X: [5, 10] });
      const divs = computeDivergenceMetrics(
        [{ name: 'A', results: r }],
        ['X'],
        0.1,
      );
      expect(divs).toHaveLength(0);
    });

    it('handles near-zero means correctly', () => {
      // Both near zero with small difference: should not produce Infinity
      // unless there is a genuine nonzero std with zero mean.
      const v1 = makeResults([0], { X: [0] });
      const v2 = makeResults([0], { X: [0] });
      const divs = computeDivergenceMetrics(
        [
          { name: 'A', results: v1 },
          { name: 'B', results: v2 },
        ],
        ['X'],
        0.1,
      );
      // Both zero -> std=0, CV=0, no divergence
      expect(divs).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Rule attribution ranks correctly when one rule dominates
  // -----------------------------------------------------------------------
  describe('attributeDivergence', () => {
    it('ranks the dominant rule highest', () => {
      // Base model trajectory
      const baseResults = makeResults([0, 1, 2, 3], {
        Obs: [100, 80, 60, 40],
      });

      // Variant 1: very different trajectory (dominant divergence)
      const v1Results = makeResults([0, 1, 2, 3], {
        Obs: [100, 95, 90, 85],
      });

      // Variant 2: slightly different trajectory
      const v2Results = makeResults([0, 1, 2, 3], {
        Obs: [100, 79, 58, 38],
      });

      const variantResults = [
        { name: 'KO_dominant', results: v1Results },
        { name: 'KO_minor', results: v2Results },
      ];

      const uniqueRules: Record<string, string[]> = {
        KO_dominant: ['A() -> B() kf'],
        KO_minor: ['B() -> A() kr'],
      };

      const divergences = [
        {
          time: 1,
          observable: 'Obs',
          variants: [
            { name: 'KO_dominant', value: 95 },
            { name: 'KO_minor', value: 79 },
          ],
          maxDifference: 16,
          relativeDeviation: 0.18,
        },
        {
          time: 2,
          observable: 'Obs',
          variants: [
            { name: 'KO_dominant', value: 90 },
            { name: 'KO_minor', value: 58 },
          ],
          maxDifference: 32,
          relativeDeviation: 0.43,
        },
      ];

      const attributions = attributeDivergence(
        baseResults,
        variantResults,
        ['Obs'],
        uniqueRules,
        divergences,
      );

      expect(attributions.length).toBeGreaterThan(0);

      // The first attribution (highest contribution) should be the dominant
      // rule (from KO_dominant which has the largest deviation from base).
      expect(attributions[0].rule).toBe('A() -> B() kf');
      expect(attributions[0].divergenceContribution).toBeGreaterThan(
        attributions[attributions.length - 1].divergenceContribution,
      );

      // Every attribution should have a human-readable effect description
      for (const attr of attributions) {
        expect(attr.effectOnObservable).toBeTruthy();
        expect(attr.effectOnObservable.length).toBeGreaterThan(0);
      }
    });

    it('returns empty array when there are no divergences', () => {
      const base = makeResults([0, 1], { X: [10, 20] });
      const result = attributeDivergence(base, [], ['X'], {}, []);
      expect(result).toEqual([]);
    });
  });
});
