// packages/engine/src/services/analysis/paramFitter.ts

import { BNGLModel, SimulationOptions, SimulationResults } from '../../types';
import { nelderMead, NelderMeadProgress } from '../optimization/nelderMead';
import { sbplx } from '../optimization/sbplx';
import { projectedNM } from '../optimization/projectedNM';
import type { ProjectedNMOptions } from '../optimization/projectedNM';
import { differentialEvolution } from '../optimization/differentialEvolution';
import type { DEProgress } from '../optimization/differentialEvolution';
import { parseBPSL, evaluateBPSL } from './bpsl';
import type { BPSLConstraint, BPSLResult } from './bpsl';
import { computeRegularizationPenalty } from './regularization';
import type { RegularizationConfig } from './regularization';

// ---------------------------------------------------------------------------
// Types (intentional match of UI-side names)
// ---------------------------------------------------------------------------

export type FitAlgorithm = 'nelder-mead' | 'sbplx' | 'projected-nm' | 'bobyqa' | 'de';

export interface ParamBounds {
  name: string;
  initial: number;
  min: number;
  max: number;
}

export interface ExperimentalDataPoint {
  time: number;
  values: Record<string, number>;
}

export interface FitProgress {
  nEval: number;
  sse: number;
  params: number[];
  iteration: number;
}

export interface FitResult {
  params: number[];
  paramNames: string[];
  sse: number;
  rmse: number;
  rSquared: number;
  nEval: number;
  iterations: number;
  converged: boolean;
  sseHistory: number[];
  bestPredictions: Map<string, number[]>;
  confidenceIntervals: { lower: number; upper: number }[];
  algorithm: string;
  /** BPSL constraint results at best-fit parameters (if constraints were specified). */
  bpslResults?: BPSLResult;
  /** Regularization penalty at best-fit (if regularization was used). */
  regularizationPenalty?: number;
  /** Per-parameter regularization breakdown. */
  regularizationPerParam?: Record<string, number>;
}

export interface FitConfig {
  model: BNGLModel;
  paramBounds: ParamBounds[];
  experimentalData: ExperimentalDataPoint[];
  simulate: (
    overrides: Record<string, number>,
    options: SimulationOptions
  ) => Promise<SimulationResults>;
  algorithm?: FitAlgorithm;
  maxEval?: number;
  ftol?: number;
  onProgress?: (p: FitProgress) => void;
  signal?: AbortSignal;
  /**
   * Base simulation options; t_end and n_steps are required by the fitter and
   * will be overridden by values derived from the experimental data if provided.
   */
  simOptions?: Partial<SimulationOptions>;
  /** BPSL constraint text (one constraint per line). */
  bpslConstraints?: string;
  /** Weight for BPSL penalty relative to SSE (default 1.0). */
  bpslWeight?: number;
  /** L1/L2 regularization for model reduction (PTLasso-style). */
  regularization?: RegularizationConfig;
}

// ---------------------------------------------------------------------------
// Main entry point — engine-side, agnostic of how simulation is performed
// ---------------------------------------------------------------------------

export async function fitParameters(cfg: FitConfig): Promise<FitResult> {
  const {
    model,
    paramBounds,
    experimentalData,
    simulate,
    algorithm = 'nelder-mead',
    maxEval = 500,
    ftol = 1e-6,
    onProgress,
    signal,
    simOptions = {},
    bpslConstraints,
    bpslWeight = 1.0,
    regularization,
  } = cfg;

  const constraints: BPSLConstraint[] = (bpslConstraints ?? '').trim()
    ? parseBPSL(bpslConstraints ?? '')
    : [];

  const n = paramBounds.length;
  const paramNames = paramBounds.map(b => b.name);

  const dataObsNames = Object.keys(experimentalData[0]?.values ?? {});
  const modelObsNames = model.observables.map(o => o.name);
  const sharedObs = dataObsNames.filter(n => modelObsNames.includes(n));

  const timePoints = experimentalData.map(d => d.time);
  const tEnd = timePoints[timePoints.length - 1];
  const nSteps = timePoints.length - 1;

  const observed: Record<string, number[]> = {};
  for (const obs of sharedObs) {
    observed[obs] = experimentalData.map(d => d.values[obs] ?? 0);
  }

  const totalPoints = sharedObs.length * timePoints.length;
  const sseHistory: number[] = [];


  const useLog: boolean[] = paramBounds.map(b => b.min > 0);
  const encode = (p: number[]): number[] =>
    p.map((v, i) => (useLog[i] ? Math.log(v) : v));
  const decode = (p: number[]): number[] =>
    p
      .map((v, i) => (useLog[i] ? Math.exp(v) : v))
      .map((v, i) => Math.max(paramBounds[i].min, Math.min(paramBounds[i].max, v)));

  const x0encoded = encode(paramBounds.map(b => b.initial));

  async function objective(xenc: number[]): Promise<number> {
    if (signal?.aborted) return Infinity;
    const params = decode(xenc);
    const overrides: Record<string, number> = {};
    for (let i = 0; i < n; i++) overrides[paramNames[i]] = params[i];

    try {
      const simResult = await simulate(overrides, {
        method: 'ode',
        t_end: tEnd,
        n_steps: nSteps,
        atol: 1e-8,
        rtol: 1e-6,
        ...simOptions,
      });

      let sse = 0;
      const dataRows = simResult.data;
      
      // Pre-calculate interpolation brackets for all time points once
      const timeBrackets = timePoints.map(t => {
        let low = 0;
        let high = dataRows.length - 1;
        while (low <= high) {
          const mid = (low + high) >>> 1;
          const midTime = dataRows[mid].time;
          if (Math.abs(midTime - t) < 1e-12) return { exact: true, idx: mid, low: 0, high: 0, alpha: 0 };
          if (midTime < t) low = mid + 1;
          else high = mid - 1;
        }
        if (low <= 0) return { exact: true, idx: 0, low: 0, high: 0, alpha: 0 };
        if (low >= dataRows.length) return { exact: true, idx: dataRows.length - 1, low: 0, high: 0, alpha: 0 };
        
        const t0 = dataRows[low - 1].time;
        const t1 = dataRows[low].time;
        return {
          exact: false,
          idx: 0,
          low: low - 1,
          high: low,
          alpha: t1 > t0 ? (t - t0) / (t1 - t0) : 0
        };
      });

      for (const obs of sharedObs) {
        const obsData = observed[obs];
        for (let i = 0; i < timePoints.length; i++) {
          const b = timeBrackets[i];
          let simVal: number;
          if (b.exact) {
            simVal = dataRows[b.idx][obs] ?? 0;
          } else {
            const v0 = dataRows[b.low][obs] ?? 0;
            const v1 = dataRows[b.high][obs] ?? 0;
            simVal = v0 + b.alpha * (v1 - v0);
          }
          const diff = simVal - obsData[i];
          sse += diff * diff;
        }
      }

      if (constraints.length > 0) {
        const obsMap = new Map<string, number[]>();
        const allModelObs = model.observables.map(o => o.name);
        for (const obs of allModelObs) {
          const vals = new Array(timePoints.length);
          for (let i = 0; i < timePoints.length; i++) {
            const b = timeBrackets[i];
            if (b.exact) {
              vals[i] = dataRows[b.idx][obs] ?? 0;
            } else {
              const v0 = dataRows[b.low][obs] ?? 0;
              const v1 = dataRows[b.high][obs] ?? 0;
              vals[i] = v0 + b.alpha * (v1 - v0);
            }
          }
          obsMap.set(obs, vals);
        }
        const bpslResult = evaluateBPSL(constraints, timePoints, obsMap);
        sse += bpslWeight * bpslResult.totalPenalty;
      }

      if (regularization && regularization.type !== 'none') {
        const regResult = computeRegularizationPenalty(
          params,
          paramNames,
          paramBounds.map(b => b.initial),
          regularization,
        );
        sse += regResult.penalty;
      }


      return isFinite(sse) ? sse : 1e12;
    } catch {
      return 1e12;
    }
  }

  const progressCallback = (info: {
    nEval: number;
    bestValue: number;
    bestX: Float64Array;
    iteration: number;
  }) => {
    sseHistory.push(info.bestValue);
    const params = decode([...info.bestX]);
    onProgress?.({
      nEval: info.nEval,
      sse: info.bestValue,
      params,
      iteration: info.iteration,
    });
  };

  let nmResult: {
    x: number[];
    value: number;
    nEval: number;
    iterations: number;
    converged: boolean;
  };

  switch (algorithm) {
    case 'sbplx':
    case 'bobyqa': {
      const sbResult = await sbplx(objective, x0encoded, {
        maxEval,
        ftol,
        signal,
        onProgress: info => progressCallback(info),
        minSubspaceDim: Math.min(2, n),
        maxSubspaceDim: Math.min(5, n),
      });
      nmResult = sbResult;
      break;
    }
    case 'projected-nm': {
      const opts: ProjectedNMOptions = {
        maxEval,
        ftol,
        signal,
        lowerBounds: paramBounds.map((b, i) =>
          useLog[i] ? Math.log(Math.max(b.min, 1e-30)) : b.min
        ),
        upperBounds: paramBounds.map((b, i) => (useLog[i] ? Math.log(b.max) : b.max)),
        barrierStrength: 0.001,
        onProgress: info => progressCallback(info),
      };
      const coResult = await projectedNM(objective, x0encoded, opts);
      nmResult = coResult;
      break;
    }
    case 'de': {
      const deResult = await differentialEvolution(
        async (x: number[]) => {
          if (signal?.aborted) return Infinity;
          const overrides: Record<string, number> = {};
          for (let i = 0; i < n; i++) overrides[paramNames[i]] = x[i];
          try {
            const simResult = await simulate(overrides, {
              method: 'ode',
              t_end: tEnd,
              n_steps: nSteps,
              atol: 1e-8,
              rtol: 1e-6,
              ...simOptions,
            });

            let sse = 0;
            const dataRows = simResult.data;
            const interpRows = timePoints.map(t =>
              dataRows.find(r => Math.abs(r.time - t) < 1e-12) ?? interpolateRow(dataRows, t));

            for (const obs of sharedObs) {
              const simVals = interpRows.map(row => row?.[obs] ?? 0);
              const obsData = observed[obs];
              for (let i = 0; i < simVals.length; i++) {
                const diff = simVals[i] - obsData[i];
                sse += diff * diff;
              }
            }

            if (constraints.length > 0) {
              const obsMap = new Map<string, number[]>();
              for (const obs of model.observables.map(o => o.name)) {
                obsMap.set(
                  obs,
                  interpRows.map(row => row?.[obs] ?? 0)
                );
              }
              const bpslResult = evaluateBPSL(constraints, timePoints, obsMap);
              sse += bpslWeight * bpslResult.totalPenalty;
            }

            if (regularization && regularization.type !== 'none') {
              const regResult = computeRegularizationPenalty(
                x,
                paramNames,
                paramBounds.map(b => b.initial),
                regularization,
              );
              sse += regResult.penalty;
            }

            return isFinite(sse) ? sse : 1e12;
          } catch {
            return 1e12;
          }
        },
        paramBounds.map(b => b.initial),
        {
          lowerBounds: paramBounds.map(b => b.min),
          upperBounds: paramBounds.map(b => b.max),
          maxEval,
          ftol,
          signal,
          popSize: Math.max(20, 10 * n),
          maxParallel: 4,
          onProgress: (info: DEProgress) => {
            sseHistory.push(info.bestValue);
            onProgress?.({
              nEval: info.nEval,
              sse: info.bestValue,
              params: [...info.bestX],
              iteration: info.generation,
            });
          },
        }
      );

      nmResult = {
        x: deResult.x,
        value: deResult.value,
        nEval: deResult.nEval,
        iterations: deResult.generations,
        converged: deResult.converged,
      };

      const deParams = deResult.x.map((v, i) =>
        Math.max(paramBounds[i].min, Math.min(paramBounds[i].max, v))
      );
      nmResult.x = encode(deParams);
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
  const bestOverrides: Record<string, number> = {};
  for (let i = 0; i < n; i++) bestOverrides[paramNames[i]] = bestParams[i];

  const bestPredictions = new Map<string, number[]>();
  let finalSse = nmResult.value;
  let bpslResults: BPSLResult | undefined;
  let regularizationPenalty: number | undefined;
  let regularizationPerParam: Record<string, number> | undefined;

  try {
    const finalSim = await simulate(bestOverrides, {
      method: 'ode',
      t_end: tEnd,
      n_steps: nSteps,
      atol: 1e-8,
      rtol: 1e-6,
      ...simOptions,
    });

    const finalInterpRows = timePoints.map(t =>
      finalSim.data.find(r => Math.abs(r.time - t) < 1e-12) ?? interpolateRow(finalSim.data, t));

    for (const obs of sharedObs) {
      bestPredictions.set(obs,
        finalInterpRows.map(row => row?.[obs] ?? 0)
      );
    }

    let sse = 0;
    for (const obs of sharedObs) {
      const pred = bestPredictions.get(obs)!;
      const obsData = observed[obs];
      for (let i = 0; i < pred.length; i++) {
        const diff = pred[i] - obsData[i];
        sse += diff * diff;
      }
    }

    if (constraints.length > 0) {
      const obsMap = new Map<string, number[]>();
      for (const obs of model.observables.map(o => o.name)) {
        obsMap.set(
          obs,
          finalInterpRows.map(row => row?.[obs] ?? 0)
        );
      }
      bpslResults = evaluateBPSL(constraints, timePoints, obsMap);
      sse += bpslWeight * bpslResults.totalPenalty;
    }

    if (regularization && regularization.type !== 'none') {
      const regResult = computeRegularizationPenalty(
        bestParams,
        paramNames,
        paramBounds.map(b => b.initial),
        regularization,
      );
      regularizationPenalty = regResult.penalty;
      regularizationPerParam = Object.fromEntries(regResult.perParameter);
      sse += regResult.penalty;
    }

    finalSse = sse;
  } catch {
    /* keep nmResult.value */
  }

  const rmse = totalPoints > 0 ? Math.sqrt(finalSse / totalPoints) : 0;
  let ssTot = 0;
  for (const obs of sharedObs) {
    const obsData = observed[obs];
    const mean = obsData.reduce((a, b) => a + b, 0) / obsData.length;
    for (const v of obsData) ssTot += (v - mean) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - finalSse / ssTot : 0;

  const confidenceIntervals = await finiteDiffCI(
    objective,
    nmResult.x,
    finalSse,
    bestParams,
    decode,
    useLog,
    paramBounds,
    totalPoints,
    signal
  );

  return {
    params: bestParams,
    paramNames,
    sse: finalSse,
    rmse,
    rSquared,
    nEval: nmResult.nEval,
    iterations: nmResult.iterations,
    converged: nmResult.converged,
    sseHistory,
    bestPredictions,
    confidenceIntervals,
    algorithm,
    bpslResults,
    regularizationPenalty,
    regularizationPerParam,
  };
}

async function finiteDiffCI(
  f: (x: number[]) => Promise<number>,
  xenc: number[],
  f0: number,
  bestParams: number[],
  decode: (x: number[]) => number[],
  useLog: boolean[],
  paramBounds: ParamBounds[],
  totalPoints: number,
  signal?: AbortSignal
): Promise<{ lower: number; upper: number }[]> {
  const n = xenc.length;
  const h = 1e-4;
  const variances: number[] = new Array(n).fill(0);

  // Estimated variance of residuals: s^2 = SSE / (N - p)
  const residualVar = f0 / Math.max(1, totalPoints - n);

  try {
    for (let i = 0; i < n; i++) {
      if (signal?.aborted) break;
      const xp = [...xenc]; xp[i] += h;
      const xm = [...xenc]; xm[i] -= h;
      const fp = await f(xp);
      const fm = await f(xm);
      const hess = (fp - 2 * f0 + fm) / (h * h);
      
      // Variance from inverse Hessian: Var(y) = s^2 * [H/2]^-1 = 2 * s^2 / H
      if (hess > 1e-30) {
        variances[i] = (2.0 * residualVar) / hess;
      } else {
        variances[i] = bestParams[i] ** 2 * 0.25;
      }
    }
  } catch {
    /* leave zeros → fallback below */
  }

  return bestParams.map((v, i) => {
    const stdLog = Math.sqrt(variances[i]) * 1.96;
    const isLog = useLog[i];
    const b = paramBounds[i];

    if (isLog) {
      // Log-space CI: [v * exp(-std), v * exp(std)]
      // This naturally stays positive and is symmetric in log-space.
      const fallbackFactor = 2.0; // +/- 1 order of magnitude roughly
      const half = isFinite(stdLog) && stdLog > 0 ? stdLog : Math.log(fallbackFactor);
      
      const lower = Math.max(b.min, v * Math.exp(-half));
      const upper = Math.min(b.max, v * Math.exp(half));
      return { lower, upper };
    } else {
      // Linear-space CI
      const fallback = Math.abs(v) * 0.5 || 0.5;
      const half = isFinite(stdLog) && stdLog > 0 ? stdLog : fallback;
      
      const lower = Math.max(b.min, v - half);
      const upper = Math.min(b.max, v + half);
      return { lower, upper };
    }
  });
}

function interpolateRow(
  rows: Array<Record<string, number>>,
  t: number
): Record<string, number> | null {
  if (!rows.length) return null;
  let low = 0;
  let high = rows.length - 1;

  // Check bounds
  if (t <= rows[0].time) return rows[0];
  if (t >= rows[high].time) return rows[high];

  // Binary search for bracket
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const midTime = rows[mid].time;
    if (Math.abs(midTime - t) < 1e-12) {
      return rows[mid];
    }
    if (midTime < t) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const r0 = rows[low - 1];
  const r1 = rows[low];
  const t0 = r0.time;
  const t1 = r1.time;
  const alpha = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  
  const result: Record<string, number> = { time: t };
  for (const key in r1) {
    if (key === 'time') continue;
    const v0 = r0[key] ?? 0;
    const v1 = r1[key] ?? 0;
    result[key] = v0 + alpha * (v1 - v0);
  }
  return result;
}
