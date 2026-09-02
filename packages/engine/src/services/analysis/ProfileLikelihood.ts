/**
 * ProfileLikelihood.ts — Profile likelihood analysis for parameter identifiability.
 *
 * Computes 1D likelihood profiles by fixing each parameter across a grid
 * and re-optimizing remaining parameters. Provides confidence intervals
 * and structural/practical identifiability classification.
 */

import { chi2Quantile } from '../../utils/mathUtils';
import { nelderMead } from '../optimization/nelderMead';
import { AnalysisDataError } from './AnalysisErrors';

// ── Types ────────────────────────────────────────────────────────────

export interface ProfileLikelihoodConfig {
  /** Async simulation function */
  simulate: (overrides: Record<string, number>) => Promise<{ data: Array<Record<string, number>> }>;
  /** Baseline parameter values (MLE or best-fit) */
  parameters: Record<string, number>;
  /** Parameters to profile */
  parameterNames: string[];
  /** Experimental data for SSR computation */
  experimentalData: Array<{ time: number; values: Record<string, number>; errors?: Record<string, number> }>;
  /** Number of grid points per parameter (default: 20) */
  nGrid?: number;
  /** Range factor: grid spans [value/factor, value*factor] (default: 10) */
  rangeFactor?: number;
  /** Re-optimize other parameters at each grid point (default: true) */
  reoptimize?: boolean;
  /** Confidence level (default: 0.95) */
  alpha?: number;
  /** Max optimizer evaluations per grid point (default: 50) */
  maxReoptEval?: number;
  /**
   * Parameters to re-optimize while profiling. When omitted, every baseline
   * parameter other than the profiled parameter is treated as a nuisance
   * parameter.
   */
  nuisanceParameterNames?: string[];
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}

export type ProfileCIStatus =
  | 'bounded'
  | 'lower_grid_limited'
  | 'upper_grid_limited'
  | 'both_grid_limited'
  | 'no_threshold_crossing';

/** Hard upper bound for the estimated number of profile simulations. */
export const MAX_PROFILE_SIMULATIONS = 20_000;

export interface ProfileLikelihoodResult {
  profiles: Record<string, {
    grid: number[];
    ssr: number[];
    minSSR: number;
    ci: { lower: number; upper: number } | null;
    /** Threshold-compatible range observed within the requested grid. */
    ciGridRange: { lower: number; upper: number } | null;
    /** Whether the interval is bounded or censored by the scan window. */
    ciStatus: ProfileCIStatus;
    flat: boolean;
    identifiability: 'identifiable' | 'practically_unidentifiable' | 'structurally_unidentifiable';
  }>;
  threshold: number;
  baselineSSR: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

function computeSSR(
  simData: Array<Record<string, number>>,
  expData: Array<{ time: number; values: Record<string, number>; errors?: Record<string, number> }>,
  observables: string[],
): number {
  let ssr = 0;

  for (const dp of expData) {
    const targetTime = dp.time;

    // Determine the interpolation bounds outside the inner obs loop using binary search (O(log N))
    let exactRow: Record<string, number> | null = null;
    let lowerRow: Record<string, number> | null = null;
    let upperRow: Record<string, number> | null = null;
    let interpolationAlpha = 0;

    if (targetTime <= simData[0].time) {
      exactRow = simData[0];
    } else if (targetTime >= simData[simData.length - 1].time) {
      exactRow = simData[simData.length - 1];
    } else {
      let left = 0;
      let right = simData.length - 1;
      let found = false;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const midTime = simData[mid].time;
        if (Math.abs(midTime - targetTime) < 1e-12) {
          exactRow = simData[mid];
          found = true;
          break;
        }
        if (midTime < targetTime) {
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }

      if (!found) {
        // right is the largest index with time < targetTime
        // left is the smallest index with time > targetTime
        lowerRow = simData[right];
        upperRow = simData[left];
        const t0 = lowerRow.time;
        const t1 = upperRow.time;
        interpolationAlpha = t1 > t0 ? (targetTime - t0) / (t1 - t0) : 0;
      }
    }

    for (const obs of observables) {
      if (dp.values[obs] === undefined) continue;

      let simVal: number;
      if (exactRow) {
        simVal = exactRow[obs];
      } else if (lowerRow && upperRow) {
        const v0 = lowerRow[obs];
        const v1 = upperRow[obs];
        simVal = v0 + interpolationAlpha * (v1 - v0);
      } else {
        throw new AnalysisDataError(`Profile likelihood could not interpolate observable "${obs}".`);
      }

      const diff = simVal - dp.values[obs];
      const error = dp.errors?.[obs];
      if (error !== undefined && error > 0) {
        ssr += (diff * diff) / (error * error);
      } else {
        ssr += diff * diff;
      }
    }
  }
  if (!Number.isFinite(ssr)) {
    throw new AnalysisDataError('Profile likelihood SSR became non-finite; check the experimental and simulated values.');
  }
  return ssr;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function collectObservables(
  experimentalData: ProfileLikelihoodConfig['experimentalData'],
): string[] {
  if (!Array.isArray(experimentalData) || experimentalData.length === 0) {
    throw new AnalysisDataError('Profile likelihood requires a non-empty experimental data array.');
  }

  const observables = new Set<string>();
  experimentalData.forEach((dp, index) => {
    if (!dp || !Number.isFinite(dp.time)) {
      throw new AnalysisDataError(`Experimental data point ${index} has a non-finite time.`);
    }
    if (!dp.values || typeof dp.values !== 'object') {
      throw new AnalysisDataError(`Experimental data point ${index} has no observable values.`);
    }
    const entries = Object.entries(dp.values);
    if (entries.length === 0) {
      throw new AnalysisDataError(`Experimental data point ${index} has no observable values.`);
    }
    for (const [name, value] of entries) {
      if (!Number.isFinite(value)) {
        throw new AnalysisDataError(`Experimental observable "${name}" at data point ${index} is non-finite.`);
      }
      observables.add(name);
    }
    for (const [name, error] of Object.entries(dp.errors ?? {})) {
      if (!Number.isFinite(error) || error < 0) {
        throw new AnalysisDataError(`Experimental error for "${name}" at data point ${index} must be finite and non-negative.`);
      }
    }
  });

  return [...observables];
}

function validateSimulationData(
  data: unknown,
  observables: string[],
  label: string,
): Array<Record<string, number>> {
  if (!Array.isArray(data) || data.length === 0) {
    throw new AnalysisDataError(`Profile likelihood ${label} simulation returned no trajectory data.`);
  }

  let previousTime = -Infinity;
  for (const [index, rawRow] of data.entries()) {
    if (!rawRow || typeof rawRow !== 'object') {
      throw new AnalysisDataError(`Profile likelihood ${label} simulation returned an invalid row at index ${index}.`);
    }
    const row = rawRow as Record<string, unknown>;
    const time = row.time;
    if (typeof time !== 'number' || !Number.isFinite(time)) {
      throw new AnalysisDataError(`Profile likelihood ${label} simulation returned a non-finite time at row ${index}.`);
    }
    if (time < previousTime) {
      throw new AnalysisDataError(`Profile likelihood ${label} simulation returned unsorted time points.`);
    }
    previousTime = time;
    for (const observable of observables) {
      if (!Object.prototype.hasOwnProperty.call(row, observable)) {
        throw new AnalysisDataError(`Profile likelihood ${label} simulation is missing observable "${observable}".`);
      }
      const value = row[observable];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new AnalysisDataError(`Profile likelihood ${label} simulation returned a non-finite value for "${observable}".`);
      }
    }
  }
  return data as Array<Record<string, number>>;
}

function validateConfiguration(
  parameters: Record<string, number>,
  parameterNames: string[],
  nuisanceParameterNames: string[],
  nGrid: number,
  rangeFactor: number,
  alpha: number,
  maxReoptEval: number,
  reoptimize: boolean,
): void {
  if (!Array.isArray(parameterNames) || parameterNames.length === 0) {
    throw new AnalysisDataError('Profile likelihood requires at least one parameter to profile.');
  }
  if (new Set(parameterNames).size !== parameterNames.length) {
    throw new AnalysisDataError('Profile likelihood parameter names must be unique.');
  }
  if (new Set(nuisanceParameterNames).size !== nuisanceParameterNames.length) {
    throw new AnalysisDataError('Profile likelihood nuisance parameter names must be unique.');
  }
  if (!Number.isInteger(nGrid) || nGrid < 2) {
    throw new AnalysisDataError('Profile likelihood requires nGrid >= 2.');
  }
  if (!Number.isFinite(rangeFactor) || rangeFactor <= 1) {
    throw new AnalysisDataError('Profile likelihood rangeFactor must be greater than 1.');
  }
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) {
    throw new AnalysisDataError('Profile likelihood alpha must be between 0 and 1.');
  }
  if (!Number.isInteger(maxReoptEval) || maxReoptEval < 1) {
    throw new AnalysisDataError('Profile likelihood maxReoptEval must be a positive integer.');
  }

  for (const [name, value] of Object.entries(parameters)) {
    if (!Number.isFinite(value)) {
      throw new AnalysisDataError(`Profile likelihood parameter "${name}" is non-finite.`);
    }
  }
  for (const name of [...parameterNames, ...nuisanceParameterNames]) {
    if (!Object.prototype.hasOwnProperty.call(parameters, name)) {
      throw new AnalysisDataError(`Profile likelihood parameter "${name}" is not present in the baseline parameter set.`);
    }
  }
  // Nelder-Mead evaluates its initial simplex before checking maxEval and can
  // overshoot the limit during a shrink/expansion step. Include a conservative
  // nuisance-dimension allowance in the workload estimate.
  const optimizerEvalBound = reoptimize && nuisanceParameterNames.length > 0
    ? maxReoptEval + nuisanceParameterNames.length
    : 1;
  const estimatedSimulations = 1 + parameterNames.length * nGrid * optimizerEvalBound;
  if (estimatedSimulations > MAX_PROFILE_SIMULATIONS) {
    throw new AnalysisDataError(
      `Profile likelihood request could require ${estimatedSimulations} simulations; the limit is ${MAX_PROFILE_SIMULATIONS}. Reduce nGrid, the number of profiled parameters, or maxReoptEval.`,
    );
  }
}

// ── Main API ─────────────────────────────────────────────────────────

export async function profileLikelihood(
  config: ProfileLikelihoodConfig,
): Promise<ProfileLikelihoodResult> {
  const {
    simulate,
    parameters,
    parameterNames,
    experimentalData,
    nGrid = 20,
    rangeFactor = 10,
    reoptimize = true,
    alpha = 0.95,
    maxReoptEval = 50,
    signal,
    onProgress,
  } = config;

  const nuisanceParameterNames = config.nuisanceParameterNames ?? Object.keys(parameters);
  validateConfiguration(
    parameters,
    parameterNames,
    nuisanceParameterNames,
    nGrid,
    rangeFactor,
    alpha,
    maxReoptEval,
    reoptimize,
  );
  const observables = collectObservables(experimentalData);

  // 1. Baseline SSR
  let baseResult: { data: Array<Record<string, number>> };
  try {
    baseResult = await simulate(parameters);
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw error;
    throw new AnalysisDataError(`Profile likelihood baseline simulation failed: ${errorMessage(error)}`);
  }
  const baseData = validateSimulationData(baseResult?.data, observables, 'baseline');
  const baselineSSR = computeSSR(baseData, experimentalData, observables);

  // Chi-squared threshold
  const threshold = baselineSSR + chi2Quantile(alpha, 1);

  const total = parameterNames.length * nGrid;
  let completed = 0;

  const profiles: ProfileLikelihoodResult['profiles'] = {};

  for (const paramName of parameterNames) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const baseValue = parameters[paramName];
    const otherParams = nuisanceParameterNames.filter((n) => n !== paramName);

    // Create log-spaced grid. Keep the historical small-positive clamp for
    // zero/negative baselines so the analysis can still return diagnostics;
    // callers should use positive kinetic-rate baselines for interpretable
    // profiles.
    const grid: number[] = [];
    const logBase = Math.log(Math.max(baseValue, 1e-30));
    const logFactor = Math.log(rangeFactor);
    for (let i = 0; i < nGrid; i++) {
      const logVal = logBase - logFactor + (2 * logFactor * i) / (nGrid - 1);
      grid.push(Math.exp(logVal));
    }

    const ssr: number[] = [];

    for (const gridVal of grid) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      if (reoptimize && otherParams.length > 0) {
        // Re-optimize remaining parameters at this grid point
        const otherValues = otherParams.map((n) => parameters[n]);

        const objective = async (x: number[]): Promise<number> => {
          const overrides = { ...parameters };
          overrides[paramName] = gridVal;
          otherParams.forEach((n, i) => {
            const v0 = parameters[n];
            if (v0 > 0) {
              overrides[n] = Math.exp(x[i]);
            } else {
              overrides[n] = x[i]; // Linear space for non-positive params
            }
          });
          try {
            const result = await simulate(overrides);
            const data = validateSimulationData(result?.data, observables, `profile for "${paramName}"`);
            return computeSSR(data, experimentalData, observables);
          } catch (error) {
            if (signal?.aborted || isAbortError(error)) throw error;
            return 1e12;
          }
        };

        const x0 = otherValues.map((v) => (v > 0 ? Math.log(v) : v));
        try {
          const optResult = await nelderMead(objective, x0, {
            maxEval: maxReoptEval,
            ftol: 1e-6,
            signal,
          });
          ssr.push(optResult.value);
        } catch (error) {
          if (signal?.aborted || isAbortError(error)) throw error;
          // Use non-optimized value if the optimizer itself cannot finish.
          const overrides = { ...parameters, [paramName]: gridVal };
          try {
            const result = await simulate(overrides);
            const data = validateSimulationData(result?.data, observables, `profile for "${paramName}"`);
            ssr.push(computeSSR(data, experimentalData, observables));
          } catch (fallbackError) {
            if (signal?.aborted || isAbortError(fallbackError)) throw fallbackError;
            ssr.push(Infinity);
          }
        }
      } else {
        // No re-optimization: just evaluate
        const overrides = { ...parameters, [paramName]: gridVal };
        try {
          const result = await simulate(overrides);
          const data = validateSimulationData(result?.data, observables, `profile for "${paramName}"`);
          ssr.push(computeSSR(data, experimentalData, observables));
        } catch (error) {
          if (signal?.aborted || isAbortError(error)) throw error;
          ssr.push(Infinity);
        }
      }

      completed++;
      onProgress?.(completed, total);
    }

    const finiteSsr = ssr.filter(Number.isFinite);
    if (finiteSsr.length === 0) {
      throw new AnalysisDataError(`Profile likelihood for "${paramName}" produced no finite SSR values.`);
    }
    const minSSR = Math.min(...finiteSsr);
    const maxSSR = Math.max(...finiteSsr);
    // Relative-to-minimum scaling is unstable when the best fit is nearly
    // perfect. Compare profile variation to the same chi-square increment
    // used for the confidence threshold instead.
    const flatTolerance = Math.max(chi2Quantile(alpha, 1) * 0.01, 1e-12);
    const flat = maxSSR - minSSR <= flatTolerance;

    // CI: threshold-compatible grid region. If it reaches a grid edge, the
    // interval is censored by the scan window rather than a finite CI.
    let ci: { lower: number; upper: number } | null = null;
    let ciGridRange: { lower: number; upper: number } | null = null;
    const belowThreshold = grid.filter((_, i) => Number.isFinite(ssr[i]) && ssr[i] <= threshold);
    let ciStatus: ProfileCIStatus = 'no_threshold_crossing';
    if (belowThreshold.length > 0) {
      ciGridRange = {
        lower: Math.min(...belowThreshold),
        upper: Math.max(...belowThreshold),
      };
      const lowerGridLimited = belowThreshold.includes(grid[0]);
      const upperGridLimited = belowThreshold.includes(grid[grid.length - 1]);
      if (lowerGridLimited && upperGridLimited) ciStatus = 'both_grid_limited';
      else if (lowerGridLimited) ciStatus = 'lower_grid_limited';
      else if (upperGridLimited) ciStatus = 'upper_grid_limited';
      else {
        ciStatus = 'bounded';
        ci = ciGridRange;
      }
    }

    // Classification
    let identifiability: 'identifiable' | 'practically_unidentifiable' | 'structurally_unidentifiable';
    if (flat) {
      identifiability = 'structurally_unidentifiable';
    } else if (ciGridRange && ciStatus !== 'bounded') {
      identifiability = 'practically_unidentifiable';
    } else {
      identifiability = 'identifiable';
    }

    profiles[paramName] = { grid, ssr, minSSR, ci, ciGridRange, ciStatus, flat, identifiability };
  }

  return { profiles, threshold, baselineSSR };
}
