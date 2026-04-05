/**
 * PosteriorPredictive.ts — Posterior Predictive Simulation for ABC-SMC.
 *
 * Samples parameter sets from an ABC-SMC posterior, runs forward simulations
 * for each sample, and computes prediction intervals (credible bands).
 */

import { SeededRandom } from '../../utils/random';
import { systematicResample } from './posteriorAnalysis';
import type { ABCSMCResult } from './ABCSMC';

// ── Types ────────────────────────────────────────────────────────────

export interface PosteriorPredictiveConfig {
  /** ABC-SMC posterior result containing weighted particles */
  posterior: ABCSMCResult;
  /** BNGL source code to simulate */
  code: string;
  /** Number of posterior samples to draw (default: 200) */
  nSamples?: number;
  /** Simulation end time */
  t_end: number;
  /** Number of time steps */
  n_steps: number;
  /** Credible interval levels (default: [0.5, 0.9, 0.95]) */
  credibleLevels?: number[];
  /** Simulation method (default: 'ode') */
  method?: 'ode' | 'ssa';
  /** Number of SSA replicates per parameter set (default: 1) */
  ssaReplicates?: number;
  /** Observable names to track; if omitted, all non-time columns are used */
  observables?: string[];
  /** Cancellation signal */
  signal?: { cancelled: boolean };
  /** Simulation function — caller provides this to avoid circular imports */
  simulate: (
    code: string,
    options: { method: string; t_end: number; n_steps: number },
  ) => Promise<{ headers: string[]; data: Array<Record<string, number>> }>;
  /** Random seed for reproducibility */
  seed?: number;
  /** Whether to keep all individual trajectories in the result (default: false) */
  keepTrajectories?: boolean;
}

export interface PredictionBand {
  /** Credible level (e.g. 0.95 for 95% credible interval) */
  level: number;
  /** Lower bound at each time point */
  lower: number[];
  /** Upper bound at each time point */
  upper: number[];
}

export interface PosteriorPredictiveResult {
  /** Time points shared by all trajectories */
  times: number[];
  /** Per-observable prediction statistics */
  observables: Record<
    string,
    {
      mean: number[];
      median: number[];
      bands: PredictionBand[];
      trajectories?: number[][];
    }
  >;
  /** Number of simulations that completed successfully */
  nSuccessful: number;
  /** Number of simulations that failed */
  nFailed: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Substitute parameter values into BNGL source code.
 *
 * Replaces lines of the form `paramName <value>` with the new value,
 * matching within the parameters block.
 */
function substituteParams(
  code: string,
  params: Record<string, number>,
): string {
  let result = code;
  for (const [name, value] of Object.entries(params)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `(^\\s*${escaped}\\s+)\\S+`,
      'm',
    );
    result = result.replace(regex, `$1${value}`);
  }
  return result;
}

/**
 * Compute an unweighted quantile from a sorted array.
 *
 * Uses linear interpolation between the two nearest ranks.
 */
function quantile(sortedValues: number[], p: number): number {
  const n = sortedValues.length;
  if (n === 0) return NaN;
  if (n === 1) return sortedValues[0];
  if (p <= 0) return sortedValues[0];
  if (p >= 1) return sortedValues[n - 1];

  const index = p * (n - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  const frac = index - lo;

  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] * (1 - frac) + sortedValues[hi] * frac;
}

// ── Main ─────────────────────────────────────────────────────────────

/**
 * Run posterior predictive simulations.
 *
 * Draws parameter sets from the ABC-SMC posterior using systematic
 * resampling, runs a forward simulation for each, and computes
 * pointwise prediction intervals.
 */
export async function posteriorPredictive(
  config: PosteriorPredictiveConfig,
): Promise<PosteriorPredictiveResult> {
  const {
    posterior,
    code,
    t_end,
    n_steps,
    simulate,
    nSamples = 200,
    credibleLevels = [0.5, 0.9, 0.95],
    method = 'ode',
    ssaReplicates = 1,
    observables: requestedObs,
    signal,
    seed = 12345,
    keepTrajectories = false,
  } = config;

  const rng = new SeededRandom(seed);
  const particles = posterior.particles;

  if (particles.length === 0) {
    throw new Error('Posterior contains no particles');
  }

  // ── 1. Weighted resampling from posterior ────────────────────────
  const weights = particles.map((p) => p.weight);
  const sampledIndices = systematicResample(weights, nSamples, rng);

  // ── 2. Run simulations ──────────────────────────────────────────
  // Accumulate trajectories keyed by observable name.
  // Each entry is an array of trajectory arrays (one per successful run).
  const trajectories: Record<string, number[][]> = {};
  let times: number[] = [];
  let nSuccessful = 0;
  let nFailed = 0;

  for (let s = 0; s < sampledIndices.length; s++) {
    if (signal && signal.cancelled) break;

    const particleIndex = sampledIndices[s];
    const params = particles[particleIndex].params;
    const modifiedCode = substituteParams(code, params);

    const replicateCount = method === 'ssa' ? ssaReplicates : 1;

    for (let r = 0; r < replicateCount; r++) {
      try {
        const result = await simulate(modifiedCode, {
          method,
          t_end,
          n_steps,
        });

        const data = result.data;
        if (!data || data.length === 0) {
          nFailed++;
          continue;
        }

        // Extract time points from the first successful simulation
        if (times.length === 0) {
          times = data.map((row) => row['time'] ?? row['Time'] ?? row['t'] ?? 0);
        }

        // Determine which observables to track
        const obsNames =
          requestedObs ??
          result.headers.filter(
            (h) => h !== 'time' && h !== 'Time' && h !== 't',
          );

        for (const obs of obsNames) {
          if (!trajectories[obs]) {
            trajectories[obs] = [];
          }
          const series = data.map((row) => row[obs] ?? 0);
          trajectories[obs].push(series);
        }

        nSuccessful++;
      } catch {
        nFailed++;
      }
    }
  }

  // ── 3. Compute quantiles ────────────────────────────────────────
  const nTime = times.length;
  const obsResult: PosteriorPredictiveResult['observables'] = {};

  for (const [obs, trajs] of Object.entries(trajectories)) {
    const nTrajs = trajs.length;
    if (nTrajs === 0) continue;

    const meanArr: number[] = new Array(nTime).fill(0);
    const medianArr: number[] = new Array(nTime);
    const bands: PredictionBand[] = credibleLevels.map((level) => ({
      level,
      lower: new Array(nTime) as number[],
      upper: new Array(nTime) as number[],
    }));

    for (let t = 0; t < nTime; t++) {
      // Collect values at time t across all trajectories
      const vals: number[] = new Array(nTrajs);
      let sum = 0;
      for (let j = 0; j < nTrajs; j++) {
        const v = t < trajs[j].length ? trajs[j][t] : 0;
        vals[j] = v;
        sum += v;
      }

      // Mean
      meanArr[t] = sum / nTrajs;

      // Sort for quantile computation
      vals.sort((a, b) => a - b);

      // Median
      medianArr[t] = quantile(vals, 0.5);

      // Credible bands
      for (let b = 0; b < credibleLevels.length; b++) {
        const alpha = credibleLevels[b];
        const lo = (1 - alpha) / 2;
        const hi = (1 + alpha) / 2;
        bands[b].lower[t] = quantile(vals, lo);
        bands[b].upper[t] = quantile(vals, hi);
      }
    }

    obsResult[obs] = {
      mean: meanArr,
      median: medianArr,
      bands,
    };

    if (keepTrajectories) {
      obsResult[obs].trajectories = trajs;
    }
  }

  return {
    times,
    observables: obsResult,
    nSuccessful,
    nFailed,
  };
}
