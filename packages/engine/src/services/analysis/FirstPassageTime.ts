/**
 * First Passage Time Analysis
 *
 * Pure analysis utility with no engine dependencies. Computes when observables
 * first cross thresholds across an ensemble of stochastic trajectories.
 */

export interface FirstPassageTimeConfig {
  trajectories: Array<{
    times: number[];
    values: Record<string, number[]>;
  }>;
  thresholds: Array<{
    observable: string;
    value: number;
    direction: 'above' | 'below';
    label?: string;
  }>;
}

export interface FPTDistribution {
  label: string;
  observable: string;
  threshold: number;
  direction: 'above' | 'below';
  times: number[];
  crossingFraction: number;
  nTrajectories: number;
  mean: number;
  median: number;
  std: number;
  percentiles: { p5: number; p25: number; p75: number; p95: number };
  cv: number;
}

/**
 * Compute the percentile of a sorted array using linear interpolation.
 * Uses the "exclusive" method (R-6 / Excel PERCENTILE.EXC equivalent).
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Find the first passage time for a single trajectory and threshold condition.
 * Returns the crossing time, or undefined if the threshold is never crossed.
 */
function findCrossingTime(
  times: number[],
  values: number[],
  threshold: number,
  direction: 'above' | 'below',
): number | undefined {
  if (times.length === 0 || values.length === 0) return undefined;

  // Edge case: first point already satisfies condition
  if (direction === 'above' && values[0] >= threshold) return times[0];
  if (direction === 'below' && values[0] <= threshold) return times[0];

  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const curr = values[i];

    const crossed = direction === 'above'
      ? curr >= threshold && prev < threshold
      : curr <= threshold && prev > threshold;

    if (crossed) {
      const dv = curr - prev;
      if (dv === 0) {
        // Values are identical at the boundary; use the current time
        return times[i];
      }
      // Linear interpolation for sub-step crossing time
      const frac = (threshold - prev) / dv;
      return times[i - 1] + (times[i] - times[i - 1]) * frac;
    }
  }

  return undefined;
}

/**
 * Compute first passage time distributions for all threshold conditions
 * across an ensemble of trajectories.
 */
export function computeFirstPassageTimes(
  config: FirstPassageTimeConfig,
): FPTDistribution[] {
  const { trajectories, thresholds } = config;
  const results: FPTDistribution[] = [];

  for (const thresh of thresholds) {
    const { observable, value, direction } = thresh;
    const label =
      thresh.label ?? `${observable} ${direction === 'above' ? '>=' : '<='} ${value}`;

    const crossingTimes: number[] = [];
    let nTotal = 0;

    for (const traj of trajectories) {
      const obsValues = traj.values[observable];
      if (!obsValues) continue;
      nTotal++;

      const tCross = findCrossingTime(traj.times, obsValues, value, direction);
      if (tCross !== undefined) {
        crossingTimes.push(tCross);
      }
    }

    const nCrossed = crossingTimes.length;
    const crossingFraction = nTotal > 0 ? nCrossed / nTotal : 0;

    if (nCrossed === 0) {
      results.push({
        label,
        observable,
        threshold: value,
        direction,
        times: [],
        crossingFraction: 0,
        nTrajectories: nTotal,
        mean: NaN,
        median: NaN,
        std: NaN,
        percentiles: { p5: NaN, p25: NaN, p75: NaN, p95: NaN },
        cv: NaN,
      });
      continue;
    }

    // Sort crossing times for percentile/median computation
    const sorted = [...crossingTimes].sort((a, b) => a - b);

    const mean = sorted.reduce((s, v) => s + v, 0) / nCrossed;
    const median = percentile(sorted, 0.5);

    const variance =
      sorted.reduce((s, v) => s + (v - mean) * (v - mean), 0) / nCrossed;
    const std = Math.sqrt(variance);
    const cv = mean !== 0 ? std / mean : NaN;

    results.push({
      label,
      observable,
      threshold: value,
      direction,
      times: sorted,
      crossingFraction,
      nTrajectories: nTotal,
      mean,
      median,
      std,
      percentiles: {
        p5: percentile(sorted, 0.05),
        p25: percentile(sorted, 0.25),
        p75: percentile(sorted, 0.75),
        p95: percentile(sorted, 0.95),
      },
      cv,
    });
  }

  return results;
}
