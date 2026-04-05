import { describe, expect, it } from 'vitest';
import {
  computeFirstPassageTimes,
  FirstPassageTimeConfig,
} from '../../src/services/analysis/FirstPassageTime';

/**
 * Generate a trajectory from a function f(t) over evenly-spaced time points.
 */
function makeTrajectory(
  observable: string,
  fn: (t: number) => number,
  tMax: number,
  nPoints: number,
): { times: number[]; values: Record<string, number[]> } {
  const times: number[] = [];
  const vals: number[] = [];
  for (let i = 0; i < nPoints; i++) {
    const t = (tMax * i) / (nPoints - 1);
    times.push(t);
    vals.push(fn(t));
  }
  return { times, values: { [observable]: vals } };
}

describe('FirstPassageTime', () => {
  it('deterministic crossing: identical trajectories should have CV ~ 0', () => {
    // A(t) = 100*(1 - exp(-t)), threshold A >= 50
    // Exact crossing: t = -ln(0.5) = ln(2) ~ 0.6931
    const expected = Math.log(2);
    const nTraj = 10;
    const trajectories = Array.from({ length: nTraj }, () =>
      makeTrajectory('A', (t) => 100 * (1 - Math.exp(-t)), 10, 10000),
    );

    const config: FirstPassageTimeConfig = {
      trajectories,
      thresholds: [{ observable: 'A', value: 50, direction: 'above' }],
    };

    const [dist] = computeFirstPassageTimes(config);

    expect(dist.crossingFraction).toBe(1);
    expect(dist.nTrajectories).toBe(nTraj);
    expect(dist.times).toHaveLength(nTraj);
    expect(dist.mean).toBeCloseTo(expected, 3);
    expect(dist.median).toBeCloseTo(expected, 3);
    expect(dist.cv).toBeCloseTo(0, 5);
  });

  it('stochastic ensemble: varying crossing times yield positive mean and fraction', () => {
    // Generate 100 trajectories with different rates: A(t) = 100*(1-exp(-k*t))
    // k sampled linearly from 0.5 to 2.0 so all cross threshold 50
    const nTraj = 100;
    const trajectories = Array.from({ length: nTraj }, (_, i) => {
      const k = 0.5 + (1.5 * i) / (nTraj - 1);
      return makeTrajectory('A', (t) => 100 * (1 - Math.exp(-k * t)), 10, 5000);
    });

    const config: FirstPassageTimeConfig = {
      trajectories,
      thresholds: [{ observable: 'A', value: 50, direction: 'above' }],
    };

    const [dist] = computeFirstPassageTimes(config);

    expect(dist.crossingFraction).toBe(1);
    expect(dist.mean).toBeGreaterThan(0);
    expect(dist.std).toBeGreaterThan(0);
    expect(dist.cv).toBeGreaterThan(0);
    expect(dist.percentiles.p5).toBeLessThan(dist.percentiles.p95);
  });

  it('never-crossing: decaying trajectories that never reach high threshold', () => {
    // A(t) = 100*exp(-t), threshold A >= 200. Never crossed.
    const nTraj = 10;
    const trajectories = Array.from({ length: nTraj }, () =>
      makeTrajectory('A', (t) => 100 * Math.exp(-t), 10, 1000),
    );

    const config: FirstPassageTimeConfig = {
      trajectories,
      thresholds: [{ observable: 'A', value: 200, direction: 'above' }],
    };

    const [dist] = computeFirstPassageTimes(config);

    expect(dist.crossingFraction).toBe(0);
    expect(dist.times).toHaveLength(0);
    expect(dist.mean).toBeNaN();
    expect(dist.median).toBeNaN();
    expect(dist.std).toBeNaN();
    expect(dist.cv).toBeNaN();
    expect(dist.percentiles.p5).toBeNaN();
    expect(dist.percentiles.p25).toBeNaN();
    expect(dist.percentiles.p75).toBeNaN();
    expect(dist.percentiles.p95).toBeNaN();
  });

  it('below threshold: decaying trajectory crosses below threshold', () => {
    // A(t) = 100*exp(-t), threshold A <= 10
    // Exact crossing: 100*exp(-t) = 10 => t = ln(10) ~ 2.3026
    const expected = Math.log(10);
    const nTraj = 5;
    const trajectories = Array.from({ length: nTraj }, () =>
      makeTrajectory('A', (t) => 100 * Math.exp(-t), 10, 10000),
    );

    const config: FirstPassageTimeConfig = {
      trajectories,
      thresholds: [{ observable: 'A', value: 10, direction: 'below' }],
    };

    const [dist] = computeFirstPassageTimes(config);

    expect(dist.crossingFraction).toBe(1);
    expect(dist.mean).toBeCloseTo(expected, 2);
    expect(dist.median).toBeCloseTo(expected, 2);
  });

  it('multiple thresholds: higher threshold has larger mean FPT', () => {
    // A(t) = 100*(1 - exp(-t))
    // Threshold 50: t = ln(2) ~ 0.693
    // Threshold 90: t = ln(10) ~ 2.303
    const nTraj = 20;
    const trajectories = Array.from({ length: nTraj }, () =>
      makeTrajectory('A', (t) => 100 * (1 - Math.exp(-t)), 10, 10000),
    );

    const config: FirstPassageTimeConfig = {
      trajectories,
      thresholds: [
        { observable: 'A', value: 50, direction: 'above', label: 'A >= 50' },
        { observable: 'A', value: 90, direction: 'above', label: 'A >= 90' },
      ],
    };

    const results = computeFirstPassageTimes(config);

    expect(results).toHaveLength(2);
    const [dist50, dist90] = results;

    expect(dist50.label).toBe('A >= 50');
    expect(dist90.label).toBe('A >= 90');
    expect(dist50.crossingFraction).toBe(1);
    expect(dist90.crossingFraction).toBe(1);
    expect(dist90.mean).toBeGreaterThan(dist50.mean);
    expect(dist50.mean).toBeCloseTo(Math.log(2), 3);
    expect(dist90.mean).toBeCloseTo(Math.log(10), 3);
  });

  it('already crossed: trajectory starting above threshold returns times[0]', () => {
    // Trajectory starts at 200, threshold A >= 50
    const traj = makeTrajectory('A', () => 200, 10, 100);

    const config: FirstPassageTimeConfig = {
      trajectories: [traj],
      thresholds: [{ observable: 'A', value: 50, direction: 'above' }],
    };

    const [dist] = computeFirstPassageTimes(config);

    expect(dist.crossingFraction).toBe(1);
    expect(dist.times).toHaveLength(1);
    expect(dist.times[0]).toBe(0);
    expect(dist.mean).toBe(0);
    expect(dist.median).toBe(0);
  });
});
