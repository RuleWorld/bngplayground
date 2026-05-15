/**
 * posteriorAnalysis.ts — Posterior analysis utilities for ABC-SMC.
 *
 * Provides weighted statistics, KDE, ESS, and systematic resampling
 * for analysing particle populations.
 */

import { SeededRandom } from '../../utils/random';

/**
 * Compute a weighted percentile.
 *
 * @param values - Array of sample values
 * @param weights - Corresponding positive weights (need not sum to 1)
 * @param p - Percentile in [0, 1]
 */
export function weightedPercentile(
  values: number[],
  weights: number[],
  p: number,
): number {
  if (values.length === 0) throw new Error('Empty values array');
  if (values.length !== weights.length) throw new Error('values and weights must have same length');
  if (p < 0 || p > 1) throw new Error('p must be in [0, 1]');

  // Sort by value, carrying weights
  const indices = Array.from({ length: values.length }, (_, i) => i);
  indices.sort((a, b) => values[a] - values[b]);

  const sortedValues = indices.map((i) => values[i]);
  const sortedWeights = indices.map((i) => weights[i]);

  const totalWeight = sortedWeights.reduce((a, b) => a + b, 0);

  // Find the value where cumulative weight reaches p * totalWeight
  let cumulative = 0;
  for (let i = 0; i < sortedValues.length; i++) {
    cumulative += sortedWeights[i];
    if (cumulative >= p * totalWeight) {
      return sortedValues[i];
    }
  }
  return sortedValues[sortedValues.length - 1];
}

/**
 * Compute weighted mean and standard deviation.
 */
export function weightedStats(
  values: number[],
  weights: number[],
): { mean: number; std: number } {
  if (values.length === 0) throw new Error('Empty values array');

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) throw new Error('Total weight must be positive');

  let mean = 0;
  for (let i = 0; i < values.length; i++) {
    mean += weights[i] * values[i];
  }
  mean /= totalWeight;

  let variance = 0;
  for (let i = 0; i < values.length; i++) {
    const diff = values[i] - mean;
    variance += weights[i] * diff * diff;
  }
  variance /= totalWeight;

  return { mean, std: Math.sqrt(variance) };
}

/**
 * Kernel density estimation for marginal plots.
 *
 * Uses Gaussian kernel with Silverman's rule-of-thumb bandwidth by default.
 */
export function kde(
  samples: number[],
  weights: number[],
  nPoints = 100,
  bandwidth?: number,
): { x: number[]; density: number[] } {
  if (samples.length === 0) throw new Error('Empty samples array');

  const { mean, std: stdDev } = weightedStats(samples, weights);
  const min = Math.min(...samples);
  const max = Math.max(...samples);

  // Silverman's rule of thumb
  const n = samples.length;
  const h = bandwidth ?? 1.06 * stdDev * Math.pow(n, -1 / 5);
  const actualH = Math.max(h, (max - min) * 1e-6);

  const padding = 3 * actualH;
  const xMin = min - padding;
  const xMax = max + padding;
  const step = (xMax - xMin) / (nPoints - 1);

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const x: number[] = [];
  const density: number[] = [];

  for (let i = 0; i < nPoints; i++) {
    const xi = xMin + i * step;
    x.push(xi);

    let d = 0;
    for (let j = 0; j < samples.length; j++) {
      const z = (xi - samples[j]) / actualH;
      d += (weights[j] / totalWeight) * Math.exp(-0.5 * z * z);
    }
    density.push(d / (actualH * Math.sqrt(2 * Math.PI)));
  }

  return { x, density };
}

/**
 * Effective sample size from importance weights.
 *
 * ESS = (Σ w_i)² / Σ w_i²
 */
export function effectiveSampleSize(weights: number[]): number {
  if (weights.length === 0) return 0;
  const sumW = weights.reduce((a, b) => a + b, 0);
  const sumW2 = weights.reduce((a, b) => a + b * b, 0);
  if (sumW2 === 0) return 0;
  return (sumW * sumW) / sumW2;
}

/**
 * Systematic resampling.
 *
 * Returns indices of resampled particles. Preserves distribution better
 * than multinomial resampling.
 */
export function systematicResample(
  weights: number[],
  n: number,
  rng: SeededRandom,
): number[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const normalizedCumulative: number[] = [];
  let cum = 0;
  for (const w of weights) {
    cum += w / totalWeight;
    normalizedCumulative.push(cum);
  }

  const u0 = rng.next() / n;
  const indices: number[] = [];
  let j = 0;

  for (let i = 0; i < n; i++) {
    const threshold = u0 + i / n;
    while (j < normalizedCumulative.length - 1 && normalizedCumulative[j] < threshold) {
      j++;
    }
    indices.push(j);
  }

  return indices;
}

/**
 * Compute weighted covariance matrix from particles.
 */
export function weightedCovariance(
  particles: number[][],
  weights: number[],
): number[][] {
  const n = particles.length;
  if (n === 0) throw new Error('Empty particles array');
  const d = particles[0].length;

  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Weighted means
  const means = new Array(d).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      means[j] += weights[i] * particles[i][j];
    }
  }
  for (let j = 0; j < d; j++) means[j] /= totalWeight;

  // Weighted covariance
  const cov: number[][] = Array.from({ length: d }, () => new Array(d).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      for (let k = j; k < d; k++) {
        cov[j][k] += weights[i] * (particles[i][j] - means[j]) * (particles[i][k] - means[k]);
      }
    }
  }
  for (let j = 0; j < d; j++) {
    for (let k = j; k < d; k++) {
      cov[j][k] /= totalWeight;
      cov[k][j] = cov[j][k];
    }
  }

  return cov;
}

/**
 * Linear interpolation helper.
 * Given simulation data array sorted by 'time', interpolate value of
 * `observable` at `targetTime`.
 */
export function interpolateAtTime(
  data: Array<Record<string, number>>,
  targetTime: number,
  observable: string,
): number {
  if (data.length === 0) return 0;

  let low = 0;
  let high = data.length - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const midTime = data[mid].time;
    if (Math.abs(midTime - targetTime) < 1e-12) {
      return data[mid][observable] ?? 0;
    }
    if (midTime < targetTime) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (low <= 0) return data[0][observable] ?? 0;
  if (low >= data.length) return data[data.length - 1][observable] ?? 0;

  const r0 = data[low - 1];
  const r1 = data[low];
  const t0 = r0.time;
  const t1 = r1.time;
  const alpha = t1 > t0 ? (targetTime - t0) / (t1 - t0) : 0;
  const v0 = r0[observable] ?? 0;
  const v1 = r1[observable] ?? 0;
  return v0 + alpha * (v1 - v0);
}
