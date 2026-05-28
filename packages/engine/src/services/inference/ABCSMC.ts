/**
 * ABCSMC.ts — Approximate Bayesian Computation with Sequential Monte Carlo.
 *
 * Implements Toni et al. (2009) ABC-SMC for parameter inference
 * without requiring explicit likelihood computation.
 */

import { SeededRandom } from '../../utils/random';
import { createPrior, PriorDistribution } from './priors';
import {
  weightedPercentile,
  weightedStats,
  effectiveSampleSize,
  systematicResample,
  weightedCovariance,
} from './posteriorAnalysis';

// ── Types ────────────────────────────────────────────────────────────

export interface ABCSMCConfig {
  /** Async simulation function */
  simulate: (overrides: Record<string, number>) => Promise<{ data: Array<Record<string, number>> }>;
  /** Parameter priors */
  priors: Array<{
    name: string;
    distribution: 'uniform' | 'log-uniform' | 'normal';
    min?: number;
    max?: number;
    mean?: number;
    std?: number;
  }>;
  /** Experimental data to fit against */
  experimentalData: Array<{ time: number; values: Record<string, number> }>;
  /** Which observables to compare (default: all in experimentalData) */
  observables?: string[];
  /** Distance metric */
  distance?: 'sse' | 'rmse' | 'weighted_sse' | 'chi_squared';
  /** Experimental error estimates */
  errors?: Record<string, number>;
  /** Number of particles (default: 500) */
  nParticles?: number;
  /** Number of SMC populations (default: 10) */
  nPopulations?: number;
  /** Tolerance schedule: explicit or 'auto' (default: 'auto') */
  toleranceSchedule?: number[] | 'auto';
  /** Quantile for auto tolerance (default: 0.5) */
  toleranceQuantile?: number;
  /** Minimum acceptance rate before stopping (default: 0.01) */
  minAcceptanceRate?: number;
  /** Maximum total simulations (default: 100000) */
  maxSimulations?: number;
  /** Perturbation kernel scale (default: 2) */
  kernelScale?: number;
  /** Seed for reproducibility */
  seed?: number;
  /** AbortSignal */
  signal?: AbortSignal;
  /** Progress callback */
  onProgress?: (info: ABCSMCProgress) => void;
}

export interface ABCSMCProgress {
  population: number;
  totalPopulations: number;
  tolerance: number;
  acceptanceRate: number;
  nSimulations: number;
  bestDistance: number;
  effectiveSampleSize: number;
}

export interface ABCSMCResult {
  /** Accepted particles (final population) */
  particles: Array<{ params: Record<string, number>; distance: number; weight: number }>;
  /** Posterior summary statistics */
  posteriorSummary: Record<string, {
    mean: number;
    median: number;
    std: number;
    ci95: [number, number];
    mode: number;
  }>;
  /** Per-population diagnostics */
  populations: Array<{
    tolerance: number;
    acceptanceRate: number;
    nSimulations: number;
    effectiveSampleSize: number;
  }>;
  /** Total simulations performed */
  totalSimulations: number;
  /** Final tolerance achieved */
  finalTolerance: number;
  /** Whether the algorithm converged */
  converged: boolean;
  /** Marginal posterior samples */
  marginals: Record<string, number[]>;
  /** Pairwise correlations from posterior */
  posteriorCorrelations: Record<string, Record<string, number>>;
}

// ── Distance Functions ───────────────────────────────────────────────

function computeDistance(
  simData: Array<Record<string, number>>,
  expData: Array<{ time: number; values: Record<string, number> }>,
  observables: string[],
  metric: 'sse' | 'rmse' | 'weighted_sse' | 'chi_squared',
  errors?: Record<string, number>,
): number {
  if (simData.length === 0) return Infinity;

  let sum = 0;
  let count = 0;

  // Pre-calculate time brackets for simulation data
  const timeBrackets = expData.map((dp) => {
    const targetTime = dp.time;
    let low = 0;
    let high = simData.length - 1;

    // Check bounds
    if (targetTime <= simData[0].time) return { lo: 0, hi: 0, alpha: 0 };
    if (targetTime >= simData[high].time) return { lo: high, hi: high, alpha: 0 };

    // Binary search for bracket
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const midTime = simData[mid].time;
      if (Math.abs(midTime - targetTime) < 1e-12) {
        return { lo: mid, hi: mid, alpha: 0 };
      }
      if (midTime < targetTime) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const idx0 = low - 1;
    const idx1 = low;
    const t0 = simData[idx0].time;
    const t1 = simData[idx1].time;
    const alpha = (targetTime - t0) / (t1 - t0);
    return { lo: idx0, hi: idx1, alpha };
  });

  for (let i = 0; i < expData.length; i++) {
    const dp = expData[i];
    const bracket = timeBrackets[i];
    const r0 = simData[bracket.lo];
    const r1 = simData[bracket.hi];

    for (const obs of observables) {
      if (dp.values[obs] === undefined) continue;

      const v0 = r0[obs] ?? 0;
      const v1 = r1[obs] ?? 0;
      const simVal = v0 + bracket.alpha * (v1 - v0);
      const expVal = dp.values[obs];
      const diff = simVal - expVal;

      switch (metric) {
        case 'sse':
          sum += diff * diff;
          break;
        case 'rmse':
          sum += diff * diff;
          count++;
          break;
        case 'weighted_sse': {
          const err = errors?.[obs] ?? 1;
          sum += (diff / err) ** 2;
          break;
        }
        case 'chi_squared': {
          const err = errors?.[obs] ?? Math.max(Math.abs(expVal) * 0.1, 1e-10);
          sum += (diff / err) ** 2;
          break;
        }
      }
    }
  }

  if (metric === 'rmse' && count > 0) {
    return Math.sqrt(sum / count);
  }
  return sum;
}

// ── Concurrency Helper ───────────────────────────────────────────────

async function runBatch<T>(
  tasks: Array<() => Promise<T>>,
  batchSize: number,
  signal?: AbortSignal,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    results.push(...batchResults);
  }
  return results;
}

// ── Multivariate Normal Perturbation ─────────────────────────────────

function perturbParticle(
  particle: number[],
  covMatrix: number[][],
  scale: number,
  rng: SeededRandom,
): number[] {
  const d = particle.length;
  // Generate independent standard normals via Box-Muller
  const z: number[] = [];
  for (let i = 0; i < d; i++) {
    let u1 = rng.next();
    while (u1 === 0) u1 = rng.next();
    const u2 = rng.next();
    z.push(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
  }

  // Cholesky of scaled covariance
  const scaledCov = covMatrix.map((row) => row.map((v) => v * scale));

  // Simple Cholesky (L L^T = scaledCov)
  const L: number[][] = Array.from({ length: d }, () => new Array(d).fill(0));
  for (let i = 0; i < d; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = scaledCov[i][j];
      for (let k = 0; k < j; k++) {
        sum -= L[i][k] * L[j][k];
      }
      if (i === j) {
        L[i][j] = sum > 0 ? Math.sqrt(sum) : 1e-10;
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }

  // perturbation = L * z
  const result = [...particle];
  for (let i = 0; i < d; i++) {
    let delta = 0;
    for (let j = 0; j <= i; j++) {
      delta += L[i][j] * z[j];
    }
    result[i] += delta;
  }
  return result;
}

// ── Kernel Density for Weights ───────────────────────────────────────

/**
 * Computes multivariate normal log-density with precomputed Cholesky factor L and log-determinant.
 * quadForm = (x - center)^T * (L L^T)^{-1} * (x - center)
 */
function multivariateNormalLogDensity(
  x: number[],
  center: number[],
  L: number[][],
  logDet: number,
): number {
  const d = x.length;
  const diff = x.map((v, i) => v - center[i]);

  // Solve L * y = diff (forward substitution)
  const y = new Array(d).fill(0);
  for (let i = 0; i < d; i++) {
    let sum = diff[i];
    for (let k = 0; k < i; k++) {
      sum -= L[i][k] * y[k];
    }
    y[i] = sum / L[i][i];
  }

  // quadForm = y^T * y
  let quadForm = 0;
  for (let i = 0; i < d; i++) {
    quadForm += y[i] * y[i];
  }

  return -0.5 * (d * Math.log(2 * Math.PI) + logDet + quadForm);
}

/**
 * Computes Cholesky decomposition L of scaled matrix A.
 * Returns L and its log-determinant.
 */
function decomposeCovariance(A: number[][], scale: number): { L: number[][]; logDet: number } | null {
  const d = A.length;
  const L = Array.from({ length: d }, () => new Array(d).fill(0));
  let logDet = 0;

  for (let i = 0; i < d; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j] * scale;
      for (let k = 0; k < j; k++) {
        sum -= L[i][k] * L[j][k];
      }
      if (i === j) {
        if (sum <= 0) return null; // Not positive definite
        const val = Math.sqrt(sum);
        L[i][j] = val;
        logDet += 2 * Math.log(val);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }

  return { L, logDet };
}


// ── Main ABC-SMC ─────────────────────────────────────────────────────

export async function abcSMC(config: ABCSMCConfig): Promise<ABCSMCResult> {
  const {
    simulate,
    priors: priorSpecs,
    experimentalData,
    observables: requestedObs,
    distance: distanceMetric = 'sse',
    errors,
    nParticles = 500,
    nPopulations = 10,
    toleranceSchedule = 'auto',
    toleranceQuantile = 0.5,
    minAcceptanceRate = 0.01,
    maxSimulations = 100000,
    kernelScale = 2,
    seed = 42,
    signal,
    onProgress,
  } = config;

  const rng = new SeededRandom(seed);
  const d = priorSpecs.length;
  const paramNames = priorSpecs.map((p) => p.name);

  // Create prior distributions
  const priors: PriorDistribution[] = priorSpecs.map((spec) => createPrior(spec));

  // Determine observables
  const allObs = new Set<string>();
  for (const dp of experimentalData) {
    Object.keys(dp.values).forEach((k) => allObs.add(k));
  }
  const observables = requestedObs ?? [...allObs];

  let totalSimulations = 0;
  const populationDiagnostics: ABCSMCResult['populations'] = [];

  // Current population
  let currentParticles: Array<{ theta: number[]; distance: number; weight: number }> = [];

  // ── Population 0: Sample from prior ──
  const safetyFactor = 10;
  const nCandidates = nParticles * safetyFactor;
  const candidates: Array<{ theta: number[]; distance: number }> = [];

  const pop0Tasks: Array<() => Promise<void>> = [];
  for (let i = 0; i < nCandidates; i++) {
    if (totalSimulations + pop0Tasks.length >= maxSimulations) break;
    const theta: number[] = [];
    for (let j = 0; j < d; j++) {
      theta.push(priors[j].sample(rng));
    }
    pop0Tasks.push(async () => {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const overrides: Record<string, number> = {};
      theta.forEach((v, j) => { overrides[paramNames[j]] = v; });
      try {
        const result = await simulate(overrides);
        const dist = computeDistance(result.data, experimentalData, observables, distanceMetric, errors);
        if (isFinite(dist)) {
          candidates.push({ theta: [...theta], distance: dist });
        }
      } catch {
        // Skip failed simulations
      }
    });
  }

  await runBatch(pop0Tasks, 50, signal);
  totalSimulations += pop0Tasks.length;

  // Sort by distance, take top nParticles
  candidates.sort((a, b) => a.distance - b.distance);
  const accepted0 = candidates.slice(0, Math.min(nParticles, candidates.length));

  if (accepted0.length === 0) {
    return buildEmptyResult(paramNames);
  }

  currentParticles = accepted0.map((p) => ({
    theta: p.theta,
    distance: p.distance,
    weight: 1 / accepted0.length,
  }));

  const tolerance0 = accepted0[accepted0.length - 1].distance;

  populationDiagnostics.push({
    tolerance: tolerance0,
    acceptanceRate: accepted0.length / pop0Tasks.length,
    nSimulations: pop0Tasks.length,
    effectiveSampleSize: effectiveSampleSize(currentParticles.map((p) => p.weight)),
  });

  onProgress?.({
    population: 0,
    totalPopulations: nPopulations,
    tolerance: tolerance0,
    acceptanceRate: accepted0.length / pop0Tasks.length,
    nSimulations: totalSimulations,
    bestDistance: currentParticles[0].distance,
    effectiveSampleSize: effectiveSampleSize(currentParticles.map((p) => p.weight)),
  });

  // ── Populations 1..T ──
  let converged = true;
  for (let t = 1; t < nPopulations; t++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (totalSimulations >= maxSimulations) { converged = false; break; }

    // Determine tolerance
    let epsilon: number;
    if (toleranceSchedule !== 'auto' && t < toleranceSchedule.length) {
      epsilon = toleranceSchedule[t];
    } else {
      const distances = currentParticles.map((p) => p.distance);
      distances.sort((a, b) => a - b);
      epsilon = distances[Math.floor(distances.length * toleranceQuantile)];
    }

    // Compute weighted covariance of current population
    const particleVectors = currentParticles.map((p) => p.theta);
    const particleWeights = currentParticles.map((p) => p.weight);
    const cov = weightedCovariance(particleVectors, particleWeights);
    let decomp = decomposeCovariance(cov, kernelScale);
    if (!decomp) {
      // Regularize if singular (add small jitter to diagonal)
      const d = cov.length;
      const jitter = Array.from({ length: d }, (_, i) =>
        Array.from({ length: d }, (_, j) => (i === j ? 1e-9 : 0)),
      );
      const regularizedCov = cov.map((row, i) => row.map((v, j) => v + jitter[i][j]));
      decomp = decomposeCovariance(regularizedCov, kernelScale);
      if (!decomp) { converged = false; break; }
    }
    const { L, logDet } = decomp;

    // Accept-reject loop
    const newParticles: typeof currentParticles = [];
    let nTrials = 0;
    const maxTrials = Math.min(maxSimulations - totalSimulations, nParticles * 1000);

    while (newParticles.length < nParticles && nTrials < maxTrials) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      // 1. Sample parent (weighted)
      const parentIdx = sampleWeighted(particleWeights, rng);
      const parent = currentParticles[parentIdx];

      // 2. Perturb
      const proposed = perturbParticle(parent.theta, cov, kernelScale, rng);

      // 3. Check prior support
      let inSupport = true;
      for (let j = 0; j < d; j++) {
        if (proposed[j] < priors[j].support[0] || proposed[j] > priors[j].support[1]) {
          inSupport = false;
          break;
        }
      }
      if (!inSupport) { nTrials++; continue; }

      // 4. Simulate
      const overrides: Record<string, number> = {};
      proposed.forEach((v, j) => { overrides[paramNames[j]] = v; });

      try {
        const result = await simulate(overrides);
        totalSimulations++;
        nTrials++;
        const dist = computeDistance(result.data, experimentalData, observables, distanceMetric, errors);

        // 5. Accept/reject
        if (!isFinite(dist) || dist >= epsilon) continue;

        // 6. Compute weight
        let logPrior = 0;
        for (let j = 0; j < d; j++) {
          logPrior += priors[j].logPdf(proposed[j]);
        }

        let logKernelSum = -Infinity;
        for (let k = 0; k < currentParticles.length; k++) {
          const logK = Math.log(particleWeights[k]) +
            multivariateNormalLogDensity(proposed, currentParticles[k].theta, L, logDet);
          if (logKernelSum === -Infinity) {
            logKernelSum = logK;
          } else {
            // log-sum-exp
            const maxLog = Math.max(logKernelSum, logK);
            logKernelSum = maxLog + Math.log(Math.exp(logKernelSum - maxLog) + Math.exp(logK - maxLog));
          }
        }

        const logWeight = logPrior - logKernelSum;
        newParticles.push({
          theta: proposed,
          distance: dist,
          weight: Math.exp(logWeight),
        });
      } catch {
        nTrials++;
      }
    }

    if (newParticles.length === 0) {
      converged = false;
      break;
    }

    // Normalize weights
    const wSum = newParticles.reduce((a, p) => a + p.weight, 0);
    newParticles.forEach((p) => { p.weight /= wSum; });

    const ess = effectiveSampleSize(newParticles.map((p) => p.weight));
    const acceptanceRate = newParticles.length / Math.max(nTrials, 1);

    // Resample if ESS too low
    if (ess < nParticles / 2 && newParticles.length > 1) {
      const indices = systematicResample(
        newParticles.map((p) => p.weight),
        newParticles.length,
        rng,
      );
      const resampled = indices.map((idx) => ({
        ...newParticles[idx],
        weight: 1 / newParticles.length,
      }));
      currentParticles = resampled;
    } else {
      currentParticles = newParticles;
    }

    populationDiagnostics.push({
      tolerance: epsilon,
      acceptanceRate,
      nSimulations: nTrials,
      effectiveSampleSize: ess,
    });

    onProgress?.({
      population: t,
      totalPopulations: nPopulations,
      tolerance: epsilon,
      acceptanceRate,
      nSimulations: totalSimulations,
      bestDistance: Math.min(...currentParticles.map((p) => p.distance)),
      effectiveSampleSize: ess,
    });

    if (acceptanceRate < minAcceptanceRate) {
      converged = false;
      break;
    }
  }

  // ── Build result ──
  return buildResult(currentParticles, paramNames, populationDiagnostics, totalSimulations, converged);
}

// ── Helpers ──────────────────────────────────────────────────────────

function sampleWeighted(weights: number[], rng: SeededRandom): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function buildEmptyResult(paramNames: string[]): ABCSMCResult {
  const summary: ABCSMCResult['posteriorSummary'] = {};
  const marginals: ABCSMCResult['marginals'] = {};
  const correlations: ABCSMCResult['posteriorCorrelations'] = {};
  for (const name of paramNames) {
    summary[name] = { mean: 0, median: 0, std: 0, ci95: [0, 0], mode: 0 };
    marginals[name] = [];
    correlations[name] = {};
  }
  return {
    particles: [],
    posteriorSummary: summary,
    populations: [],
    totalSimulations: 0,
    finalTolerance: Infinity,
    converged: false,
    marginals,
    posteriorCorrelations: correlations,
  };
}

function buildResult(
  particles: Array<{ theta: number[]; distance: number; weight: number }>,
  paramNames: string[],
  populations: ABCSMCResult['populations'],
  totalSimulations: number,
  converged: boolean,
): ABCSMCResult {
  const d = paramNames.length;
  const weights = particles.map((p) => p.weight);

  // Summary statistics
  const posteriorSummary: ABCSMCResult['posteriorSummary'] = {};
  const marginals: ABCSMCResult['marginals'] = {};

  for (let j = 0; j < d; j++) {
    const values = particles.map((p) => p.theta[j]);
    const { mean, std } = weightedStats(values, weights);
    const median = weightedPercentile(values, weights, 0.5);
    const ci025 = weightedPercentile(values, weights, 0.025);
    const ci975 = weightedPercentile(values, weights, 0.975);

    // Approximate mode: bin with highest weighted count
    const nBins = Math.min(20, Math.ceil(Math.sqrt(values.length)));
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const binWidth = (maxVal - minVal) / nBins || 1;
    const bins = new Array(nBins).fill(0);
    for (let i = 0; i < values.length; i++) {
      const bin = Math.min(nBins - 1, Math.floor((values[i] - minVal) / binWidth));
      bins[bin] += weights[i];
    }
    let maxBin = 0;
    for (let b = 1; b < nBins; b++) {
      if (bins[b] > bins[maxBin]) maxBin = b;
    }
    const mode = minVal + (maxBin + 0.5) * binWidth;

    posteriorSummary[paramNames[j]] = { mean, median, std, ci95: [ci025, ci975], mode };
    marginals[paramNames[j]] = values;
  }

  // Posterior correlations
  const posteriorCorrelations: ABCSMCResult['posteriorCorrelations'] = {};
  const safeParamKey = (key: string): string => {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      return `param_${key}`;
    }
    return key;
  };
  for (let i = 0; i < d; i++) {
    const keyI = safeParamKey(paramNames[i]);
    posteriorCorrelations[keyI] = {};
    const vi = particles.map((p) => p.theta[i]);
    const si = weightedStats(vi, weights);
    for (let j = 0; j < d; j++) {
      const keyJ = safeParamKey(paramNames[j]);
      const vj = particles.map((p) => p.theta[j]);
      const sj = weightedStats(vj, weights);
      // Weighted correlation
      const totalW = weights.reduce((a, b) => a + b, 0);
      let cov = 0;
      for (let k = 0; k < particles.length; k++) {
        cov += weights[k] * (vi[k] - si.mean) * (vj[k] - sj.mean);
      }
      cov /= totalW;
      const denom = si.std * sj.std;
      posteriorCorrelations[keyI][keyJ] = denom > 0 ? cov / denom : (i === j ? 1 : 0);
    }
  }

  return {
    particles: particles.map((p) => ({
      params: Object.fromEntries(paramNames.map((n, j) => [n, p.theta[j]])),
      distance: p.distance,
      weight: p.weight,
    })),
    posteriorSummary,
    populations,
    totalSimulations,
    finalTolerance: populations.length > 0 ? populations[populations.length - 1].tolerance : Infinity,
    converged,
    marginals,
    posteriorCorrelations,
  };
}
