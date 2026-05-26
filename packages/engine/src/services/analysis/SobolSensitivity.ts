/**
 * SobolSensitivity.ts — Variance-based global sensitivity analysis.
 *
 * Implements Saltelli (2002) sampling + Jansen (1999) estimators
 * for first-order and total-order Sobol indices with bootstrap CIs.
 */

import { SeededRandom } from '../../utils/random';

// ── Types ────────────────────────────────────────────────────────────

export interface SobolSamplingOptions {
  /** Number of base samples (typically 256–4096) */
  N: number;
  /** Parameter bounds */
  params: Array<{ name: string; min: number; max: number }>;
  /** Use log-uniform sampling for positive params (default: false) */
  logScale?: boolean;
  /** Random seed for reproducibility */
  seed?: number;
}

export interface SobolSampleSet {
  /** Matrix A: N × d base sample */
  A: Float64Array[];
  /** Matrix B: N × d independent resample */
  B: Float64Array[];
  /** Matrices A_B^(i): one per parameter, each N rows */
  AB: Float64Array[][];
  /** Parameter names in column order */
  paramNames: string[];
  /** Total simulation runs needed: N * (2 + d) */
  totalRuns: number;
}

export interface SobolResult {
  /** First-order sensitivity indices S_i */
  firstOrder: Array<{ name: string; value: number; ci: [number, number] }>;
  /** Total-order sensitivity indices S_Ti */
  totalOrder: Array<{ name: string; value: number; ci: [number, number] }>;
  /** Total variance of the output */
  totalVariance: number;
  /** Number of simulations performed */
  nSimulations: number;
  /** Observable name */
  observable: string;
  /** Per-parameter convergence metric */
  convergence: Array<{ name: string; cv: number }>;
}

export interface SobolAnalysisConfig {
  /** Async simulation function */
  simulate: (overrides: Record<string, number>) => Promise<{ data: Array<Record<string, number>> }>;
  /** Parameters to analyze */
  params: Array<{ name: string; min: number; max: number }>;
  /** Observable(s) to analyze (default: all) */
  observables?: string[];
  /** Number of base samples (default: 512) */
  N?: number;
  /** Evaluate at t_end only (default) or all timepoints */
  allTimepoints?: boolean;
  /** Log-scale sampling */
  logScale?: boolean;
  /** Seed for reproducibility */
  seed?: number;
  /** Number of bootstrap replicates for CIs (default: 1000) */
  nBootstrap?: number;
  /** Confidence level for CIs (default: 0.95) */
  alpha?: number;
  /** AbortSignal */
  signal?: AbortSignal;
  /** Progress callback */
  onProgress?: (completed: number, total: number) => void;
}

// ── Concurrency limiter ──────────────────────────────────────────────

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
  signal?: AbortSignal,
  onComplete?: () => void,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const idx = nextIndex++;
      results[idx] = await tasks[idx]();
      onComplete?.();
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

// ── Saltelli Sampling ────────────────────────────────────────────────

export function generateSaltelliSamples(options: SobolSamplingOptions): SobolSampleSet {
  const { N, params, logScale = false, seed = 42 } = options;
  const d = params.length;
  const rng = new SeededRandom(seed);

  const sampleValue = (min: number, max: number): number => {
    if (logScale && min > 0) {
      const logMin = Math.log(min);
      const logMax = Math.log(max);
      return Math.exp(logMin + rng.next() * (logMax - logMin));
    }
    return min + rng.next() * (max - min);
  };

  // Generate A and B matrices (each N × d)
  const A: Float64Array[] = [];
  const B: Float64Array[] = [];
  for (let i = 0; i < N; i++) {
    const rowA = new Float64Array(d);
    const rowB = new Float64Array(d);
    for (let j = 0; j < d; j++) {
      rowA[j] = sampleValue(params[j].min, params[j].max);
    }
    for (let j = 0; j < d; j++) {
      rowB[j] = sampleValue(params[j].min, params[j].max);
    }
    A.push(rowA);
    B.push(rowB);
  }

  // Generate AB matrices: AB[i] = A with column i from B
  const AB: Float64Array[][] = [];
  for (let i = 0; i < d; i++) {
    const matrix: Float64Array[] = [];
    for (let j = 0; j < N; j++) {
      const row = new Float64Array(A[j]);
      row[i] = B[j][i];
      matrix.push(row);
    }
    AB.push(matrix);
  }

  return {
    A,
    B,
    AB,
    paramNames: params.map((p) => p.name),
    totalRuns: N * (2 + d),
  };
}

// ── Bootstrap CI ─────────────────────────────────────────────────────

function bootstrapSobolCI(
  fA: Float64Array,
  fB: Float64Array,
  fAB: Float64Array,
  totalVariance: number,
  estimator: 'first' | 'total',
  nBootstrap: number,
  alpha: number,
  rng: SeededRandom,
): { lower: number; upper: number } {
  const N = fA.length;
  const estimates: number[] = [];

  for (let b = 0; b < nBootstrap; b++) {
    // Resample with replacement
    const idxs: number[] = [];
    for (let i = 0; i < N; i++) {
      idxs.push(Math.floor(rng.next() * N));
    }

    let value: number;
    if (estimator === 'first') {
      let sum = 0;
      for (const idx of idxs) {
        const diff = fAB[idx] - fB[idx];
        sum += diff * diff;
      }
      value = 1 - sum / (2 * N * totalVariance);
      value = Math.max(0, Math.min(1, value));
    } else {
      let sum = 0;
      for (const idx of idxs) {
        const diff = fA[idx] - fAB[idx];
        sum += diff * diff;
      }
      value = sum / (2 * N * totalVariance);
      value = Math.max(0, Math.min(1, value));
    }
    estimates.push(value);
  }

  estimates.sort((a, b) => a - b);
  const lo = Math.floor(((1 - alpha) / 2) * nBootstrap);
  const hi = Math.floor(((1 + alpha) / 2) * nBootstrap);
  return { lower: estimates[lo], upper: estimates[Math.min(hi, nBootstrap - 1)] };
}

// ── Jansen Estimators ────────────────────────────────────────────────

function computeVariance(values: Float64Array): number {
  const n = values.length;
  if (n < 2) return 0;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += values[i];
  mean /= n;
  let v = 0;
  for (let i = 0; i < n; i++) {
    const diff = values[i] - mean;
    v += diff * diff;
  }
  return v / (n - 1);
}

// ── Main API ─────────────────────────────────────────────────────────

export async function sobolSensitivity(config: SobolAnalysisConfig): Promise<SobolResult[]> {
  const {
    simulate,
    params,
    observables: requestedObs,
    N = 512,
    allTimepoints = false,
    logScale = false,
    seed = 42,
    nBootstrap = 1000,
    alpha = 0.95,
    signal,
    onProgress,
  } = config;

  const d = params.length;

  // 1. Generate Saltelli samples
  const samples = generateSaltelliSamples({ N, params, logScale, seed });

  // 2. Run all simulations
  let completed = 0;
  const total = samples.totalRuns;

  const makeOverrides = (row: Float64Array): Record<string, number> => {
    const overrides: Record<string, number> = {};
    for (let j = 0; j < d; j++) {
      overrides[params[j].name] = row[j];
    }
    return overrides;
  };

  const tasks: Array<() => Promise<{ data: Array<Record<string, number>> }>> = [];

  // A simulations
  for (let i = 0; i < N; i++) {
    const row = samples.A[i];
    tasks.push(() => simulate(makeOverrides(row)));
  }
  // B simulations
  for (let i = 0; i < N; i++) {
    const row = samples.B[i];
    tasks.push(() => simulate(makeOverrides(row)));
  }
  // AB simulations
  for (let k = 0; k < d; k++) {
    for (let i = 0; i < N; i++) {
      const row = samples.AB[k][i];
      tasks.push(() => simulate(makeOverrides(row)));
    }
  }

  const allResults = await runWithConcurrency(tasks, 50, signal, () => {
    completed++;
    onProgress?.(completed, total);
  });

  // 3. Extract outputs
  const resultsA = allResults.slice(0, N);
  const resultsB = allResults.slice(N, 2 * N);
  const resultsAB: Array<typeof resultsA> = [];
  for (let k = 0; k < d; k++) {
    resultsAB.push(allResults.slice(2 * N + k * N, 2 * N + (k + 1) * N));
  }

  // Determine observables from first result
  const sampleData = resultsA[0].data;
  const allObsNames = Object.keys(sampleData[sampleData.length - 1]).filter((k) => k !== 'time');
  const obsNames = requestedObs?.filter((o) => allObsNames.includes(o)) ?? allObsNames;

  // 4. Compute indices per observable
  const rng = new SeededRandom(seed + 1000);
  const sobolResults: SobolResult[] = [];

  for (const obs of obsNames) {
    const extractValue = (result: { data: Array<Record<string, number>> }): number => {
      const data = result.data;
      if (data.length === 0) return 0;
      return data[data.length - 1][obs] ?? 0;
    };

    const fA = new Float64Array(N);
    const fB = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      fA[i] = extractValue(resultsA[i]);
      fB[i] = extractValue(resultsB[i]);
    }

    const fAll = new Float64Array(2 * N);
    fAll.set(fA);
    fAll.set(fB, N);
    const totalVariance = computeVariance(fAll);
    if (totalVariance < 1e-30) {
      // No variance → all indices 0
      sobolResults.push({
        firstOrder: params.map((p) => ({ name: p.name, value: 0, ci: [0, 0] as [number, number] })),
        totalOrder: params.map((p) => ({ name: p.name, value: 0, ci: [0, 0] as [number, number] })),
        totalVariance: 0,
        nSimulations: total,
        observable: obs,
        convergence: params.map((p) => ({ name: p.name, cv: 0 })),
      });
      continue;
    }

    const firstOrder: SobolResult['firstOrder'] = [];
    const totalOrder: SobolResult['totalOrder'] = [];
    const convergence: SobolResult['convergence'] = [];

    for (let k = 0; k < d; k++) {
      const fABk = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        fABk[i] = extractValue(resultsAB[k][i]);
      }

      // Jansen first-order: S_i = 1 - (1/(2N)) * Σ(f(AB^i) - f(B))² / V(Y)
      let sumFirst = 0;
      for (let i = 0; i < N; i++) {
        const diff = fABk[i] - fB[i];
        sumFirst += diff * diff;
      }
      const Si = Math.max(0, Math.min(1, 1 - sumFirst / (2 * N * totalVariance)));

      // Jansen total-order: ST_i = (1/(2N)) * Σ(f(A) - f(AB^i))² / V(Y)
      let sumTotal = 0;
      for (let i = 0; i < N; i++) {
        const diff = fA[i] - fABk[i];
        sumTotal += diff * diff;
      }
      const STi = Math.max(0, Math.min(1, sumTotal / (2 * N * totalVariance)));

      // Bootstrap CIs
      const ciFirst = bootstrapSobolCI(fA, fB, fABk, totalVariance, 'first', nBootstrap, alpha, rng);
      const ciTotal = bootstrapSobolCI(fA, fB, fABk, totalVariance, 'total', nBootstrap, alpha, rng);

      firstOrder.push({ name: params[k].name, value: Si, ci: [ciFirst.lower, ciFirst.upper] });
      totalOrder.push({ name: params[k].name, value: STi, ci: [ciTotal.lower, ciTotal.upper] });

      // Convergence: CV of bootstrap replicates
      const bootstrapVals: number[] = [];
      for (let b = 0; b < 100; b++) {
        const halfN = Math.floor(N / 2);
        let s = 0;
        for (let i = 0; i < halfN; i++) {
          const idx = Math.floor(rng.next() * N);
          const diff = fA[idx] - fABk[idx];
          s += diff * diff;
        }
        bootstrapVals.push(s / (2 * halfN * totalVariance));
      }
      const bMean = bootstrapVals.reduce((a, b) => a + b, 0) / bootstrapVals.length;
      const bVar = bootstrapVals.reduce((a, b) => a + (b - bMean) ** 2, 0) / bootstrapVals.length;
      convergence.push({ name: params[k].name, cv: bMean > 0 ? Math.sqrt(bVar) / bMean : 0 });
    }

    sobolResults.push({
      firstOrder,
      totalOrder,
      totalVariance,
      nSimulations: total,
      observable: obs,
      convergence,
    });
  }

  return sobolResults;
}
