/**
 * services/optimization/paramFitter.ts
 *
 * Direct least-squares parameter fitting for BNG Playground.
 *
 * Replaces the VI/ELBO approach with standard derivative-free optimization.
 * Each forward simulation is delegated to the existing bnglService worker pool.
 *
 * Algorithm selection:
 *   'nelder-mead'  (default) – robust, derivative-free, good for 2–15 params
 *   'sbplx'        – Subplex (NM on rotating subspaces, 2–3× fewer evals for ≥5 params)
 *   'cobyla'       – bound-constrained NM with projected simplex and barrier penalty
 *   'bobyqa'       – Bound Optimization BY Quadratic Approximation (uses SBPLX until
 *                    synchronous solver bridge enables NLopt-js integration)
 */

import { BNGLModel } from '../../types';
import { bnglService } from '../bnglService';
import { ExperimentalDataPoint } from '../../src/services/data/experimentalData';
import { nelderMead, NelderMeadProgress } from './nelderMead';
import { sbplx } from './sbplx';
import { projectedNM, ProjectedNMOptions } from './projectedNM';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type FitAlgorithm = 'nelder-mead' | 'sbplx' | 'projected-nm' | 'bobyqa';

export interface ParamBounds {
  name: string;
  initial: number;
  min: number;
  max: number;
}

export interface FitProgress {
  /** Number of forward simulations completed. */
  nEval: number;
  /** Current best SSE (sum of squared errors). */
  sse: number;
  /** Current best parameter values (untransformed). */
  params: number[];
  /** Iteration count (from inner optimizer). */
  iteration: number;
}

export interface FitResult {
  /** Final optimized parameter values (original scale). */
  params: number[];
  /** Parameter names in the same order. */
  paramNames: string[];
  /** Sum of squared errors at optimum. */
  sse: number;
  /** Root-mean-square error. */
  rmse: number;
  /** R² coefficient of determination (can be negative for bad fits). */
  rSquared: number;
  /** Number of ODE evaluations. */
  nEval: number;
  /** Number of optimizer iterations. */
  iterations: number;
  /** Whether convergence was achieved. */
  converged: boolean;
  /** SSE at each progress report (every 5 iters). */
  sseHistory: number[];
  /** Predicted trajectories at optimum (observable name → values at data time points). */
  bestPredictions: Map<string, number[]>;
  /** Approx. 95% bootstrap confidence intervals (2 × std from finite-diff approx). */
  confidenceIntervals: { lower: number; upper: number }[];
  /** Algorithm name actually used. */
  algorithm: string;
}

export interface FitConfig {
  model: BNGLModel;
  /** Prepared model ID for simulateCached (avoids re-parsing each eval). */
  modelId: number;
  paramBounds: ParamBounds[];
  experimentalData: ExperimentalDataPoint[];
  algorithm?: FitAlgorithm;
  /** Max number of forward ODE evaluations (default 500). */
  maxEval?: number;
  /** Absolute function-value tolerance (default 1e-6). */
  ftol?: number;
  onProgress?: (p: FitProgress) => void;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Fit model parameters to experimental time-course data by minimizing SSE.
 */
export async function fitParameters(cfg: FitConfig): Promise<FitResult> {
  const {
    model, modelId, paramBounds, experimentalData,
    algorithm = 'nelder-mead',
    maxEval = 500,
    ftol = 1e-6,
    onProgress,
    signal,
  } = cfg;

  const n = paramBounds.length;
  const paramNames = paramBounds.map(b => b.name);

  // Observable names that appear in both the model and the data.
  const dataObsNames = Object.keys(experimentalData[0]?.values ?? {});
  const modelObsNames = model.observables.map(o => o.name);
  const sharedObs = dataObsNames.filter(n => modelObsNames.includes(n));

  const timePoints = experimentalData.map(d => d.time);
  const tEnd = timePoints[timePoints.length - 1];
  const nSteps = timePoints.length - 1;

  // Pre-compute observed data matrix for fast SSE calculation.
  const observed: Record<string, number[]> = {};
  for (const obs of sharedObs) {
    observed[obs] = experimentalData.map(d => d.values[obs] ?? 0);
  }

  // Total number of data points used in RMSE normalisation.
  const totalPoints = sharedObs.length * timePoints.length;

  // SSE history for convergence plot.
  const sseHistory: number[] = [];
  let nEval = 0;

  // Log-transform parameters so optimizer works in unconstrained space (avoids
  // hitting bounds with Nelder-Mead). Only applied when lower bound > 0.
  const useLog: boolean[] = paramBounds.map(b => b.min > 0);

  const encode = (p: number[]): number[] =>
    p.map((v, i) => useLog[i] ? Math.log(v) : v);

  const decode = (p: number[]): number[] =>
    p.map((v, i) => useLog[i] ? Math.exp(v) : v).map(
      (v, i) => Math.max(paramBounds[i].min, Math.min(paramBounds[i].max, v))
    );

  const x0encoded = encode(paramBounds.map(b => b.initial));

  // ---------------------------------------------------------------------------
  // Objective function
  // ---------------------------------------------------------------------------
  async function objective(xenc: number[]): Promise<number> {
    if (signal?.aborted) return Infinity;

    const params = decode(xenc);
    const overrides: Record<string, number> = {};
    for (let i = 0; i < n; i++) overrides[paramNames[i]] = params[i];

    try {
      const simResult = await bnglService.simulateCached(modelId as number, overrides, {
        method: 'ode',
        t_end: tEnd,
        n_steps: nSteps,
        atol: 1e-8,
        rtol: 1e-6,
      });

      // Interpolate sim results to data time points.
      let sse = 0;
      const dataRows = simResult.data as Array<Record<string, unknown>>;
      for (const obs of sharedObs) {
        const simVals = timePoints.map(t => {
          const row = dataRows.find(r => Math.abs((r['time'] as number) - t) < 1e-12)
                   ?? interpolateRow(dataRows, t);
          return (row?.[obs] as number) ?? 0;
        });
        const obsData = observed[obs];
        for (let i = 0; i < simVals.length; i++) {
          const diff = simVals[i] - obsData[i];
          sse += diff * diff;
        }
      }
      nEval++;
      return isFinite(sse) ? sse : 1e12;
    } catch {
      return 1e12;
    }
  }

  // ---------------------------------------------------------------------------
  // Run optimizer – dispatch to selected algorithm
  // ---------------------------------------------------------------------------
  const progressCallback = (info: { nEval: number; bestValue: number; bestX: Float64Array; iteration: number }) => {
    sseHistory.push(info.bestValue);
    const params = decode([...info.bestX]);
    onProgress?.({
      nEval: info.nEval,
      sse:   info.bestValue,
      params,
      iteration: info.iteration,
    });
  };

  let nmResult: { x: number[]; value: number; nEval: number; iterations: number; converged: boolean };

  switch (algorithm) {
    case 'sbplx':
    case 'bobyqa': {
      // SBPLX: Subplex algorithm – NM on rotating subspaces.
      // BOBYQA: Uses SBPLX until synchronous solver enables NLopt-js.
      const sbResult = await sbplx(objective, x0encoded, {
        maxEval,
        ftol,
        signal,
        onProgress: (info) => progressCallback(info),
        minSubspaceDim: Math.min(2, n),
        maxSubspaceDim: Math.min(5, n),
      });
      nmResult = sbResult;
      break;
    }
    case 'projected-nm': {
      // Projected NM can handle bounds natively, but we still apply log transformation
      // to the bounded space if requested for step scaling logic.
      const opts: ProjectedNMOptions = {
        maxEval,
        ftol,
        signal,
        lowerBounds: paramBounds.map((b, i) => useLog[i] ? Math.log(Math.max(b.min, 1e-30)) : b.min),
        upperBounds: paramBounds.map((b, i) => useLog[i] ? Math.log(b.max) : b.max),
        barrierStrength: 0.001,
        onProgress: (info) => progressCallback(info),
      };
      const coResult = await projectedNM(objective, x0encoded, opts);
      nmResult = coResult;
      break;
    }
    case 'nelder-mead':
    default: {
      const nmRes = await nelderMead(objective, x0encoded, {
        maxEval,
        ftol,
        signal,
        onProgress: (info: NelderMeadProgress) => progressCallback(info),
      });
      nmResult = nmRes;
      break;
    }
  }

  const bestParams = decode(nmResult.x);

  // ---------------------------------------------------------------------------
  // Final evaluation: collect predictions at best params
  // ---------------------------------------------------------------------------
  const bestOverrides: Record<string, number> = {};
  for (let i = 0; i < n; i++) bestOverrides[paramNames[i]] = bestParams[i];

  let bestPredictions = new Map<string, number[]>();
  let finalSse = nmResult.value;

  try {
    const finalSim = await bnglService.simulateCached(modelId, bestOverrides, {
      method: 'ode',
      t_end: tEnd,
      n_steps: nSteps,
      atol: 1e-8,
      rtol: 1e-6,
    });

    for (const obs of sharedObs) {
      bestPredictions.set(obs, timePoints.map(t => {
        const dataRows = finalSim.data as Array<Record<string, unknown>>;
        const row = dataRows.find(r => Math.abs((r['time'] as number) - t) < 1e-12)
                 ?? interpolateRow(dataRows, t);
        return (row?.[obs] as number) ?? 0;
      }));
    }

    // Recompute SSE with interpolated predictions.
    let sse = 0;
    for (const obs of sharedObs) {
      const pred = bestPredictions.get(obs)!;
      const obsData = observed[obs];
      for (let i = 0; i < pred.length; i++) {
        const diff = pred[i] - obsData[i];
        sse += diff * diff;
      }
    }
    finalSse = sse;
  } catch { /* keep nmResult.value */ }

  const rmse = totalPoints > 0 ? Math.sqrt(finalSse / totalPoints) : 0;

  // R² = 1 - SSres / SStot.
  let ssTot = 0;
  for (const obs of sharedObs) {
    const obsData = observed[obs];
    const mean = obsData.reduce((a, b) => a + b, 0) / obsData.length;
    for (const v of obsData) ssTot += (v - mean) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - finalSse / ssTot : 0;

  // ---------------------------------------------------------------------------
  // Approximate confidence intervals via finite-difference curvature.
  // Uses ±1 std dev derived from diagonal of the inverse Hessian estimate.
  // ---------------------------------------------------------------------------
  const confidenceIntervals = await finiteDiffCI(
    objective, nmResult.x, finalSse, bestParams, decode, signal
  );

  return {
    params:    bestParams,
    paramNames,
    sse:       finalSse,
    rmse,
    rSquared,
    nEval:     nmResult.nEval,
    iterations: nmResult.iterations,
    converged:  nmResult.converged,
    sseHistory,
    bestPredictions,
    confidenceIntervals,
    algorithm,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Approximate 95% confidence intervals from finite-difference Hessian diagonal.
 * Hess_ii ≈ (f(x+h) - 2f(x) + f(x-h)) / h²
 * Var_i   ≈ sigma² / Hess_ii   where sigma² = SSE / (N - p)
 * CI      = ±1.96 * sqrt(Var_i)
 */
async function finiteDiffCI(
  f: (x: number[]) => Promise<number>,
  xenc: number[],
  f0: number,
  bestParams: number[],
  decode: (x: number[]) => number[],
  signal?: AbortSignal
): Promise<{ lower: number; upper: number }[]> {
  const n = xenc.length;
  const h = 1e-4;
  const variances: number[] = new Array(n).fill(0);

  try {
    for (let i = 0; i < n; i++) {
      if (signal?.aborted) break;
      const xp = [...xenc]; xp[i] += h;
      const xm = [...xenc]; xm[i] -= h;
      const fp = await f(xp);
      const fm = await f(xm);
      const hess = (fp - 2 * f0 + fm) / (h * h);
      if (hess > 1e-30) {
        variances[i] = Math.max(0, f0 / hess);
      } else {
        variances[i] = bestParams[i] ** 2 * 0.25; // fallback: ±50% of value
      }
    }
  } catch { /* leave zeros → fallback below */ }

  return bestParams.map((v, i) => {
    const std = Math.sqrt(variances[i]) * 1.96;
    const fallback = Math.abs(v) * 0.5 || 0.5;
    const half = isFinite(std) && std > 0 ? std : fallback;
    return { lower: Math.max(0, v - half), upper: v + half };
  });
}

/** Linear interpolation between sim rows to find value at target time. */
function interpolateRow(
  rows: Array<Record<string, unknown>>,
  t: number
): Record<string, unknown> | null {
  if (!rows.length) return null;
  const times = rows.map(r => r.time as number);
  const idx = times.findIndex(rt => rt >= t);
  if (idx <= 0) return rows[0];
  if (idx >= rows.length) return rows[rows.length - 1];
  const t0 = times[idx - 1], t1 = times[idx];
  const alpha = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  const result: Record<string, unknown> = { time: t };
  for (const key of Object.keys(rows[idx])) {
    if (key === 'time') continue;
    const v0 = rows[idx - 1][key] as number;
    const v1 = rows[idx][key]     as number;
    result[key] = v0 + alpha * (v1 - v0);
  }
  return result;
}
