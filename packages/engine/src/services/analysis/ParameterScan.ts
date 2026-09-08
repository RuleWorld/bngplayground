import { simulate } from '../simulation/SimulationLoop';
import { loadEvaluator } from '../simulation/ExpressionEvaluator';
import { reevaluateSeedSpecies } from '../../utils/paramUtils';
import { updateMassActionRates } from './DoseResponse';
import { BNGLModel, SimulationOptions } from '../../types';

export interface ParameterScanOptions {
  code: string;
  parameter: string;
  start: number;
  end: number;
  steps: number;
  logarithmic?: boolean;
  /** Use logarithmic spacing on the second axis; defaults to logarithmic. */
  logarithmic2?: boolean;
  parameter2?: string;
  start2?: number;
  end2?: number;
  steps2?: number;
  // standard simulation options passed through
  method?: 'default' | 'ode' | 'ssa' | 'nf' | 'nfsim' | 'pla' | 'psa';
  solver?: 'auto' | 'cvode' | 'cvode_auto' | 'cvode_sparse' | 'cvode_jac' | 'rosenbrock23' | 'rk45' | 'rk4' | 'webgpu_rk4';
  t_end?: number;
  n_steps?: number;
}

export interface RunParameterScanResult {
  mode: '1d' | '2d';
  parameter: string;
  parameter2?: string;
  xValues: number[];
  yValues?: number[];
  observables: Record<string, number[] | number[][]>;
}

/**
 * Pure logic for Parameter Scan functionality.
 * Extracted from ParameterScanTab.tsx for testing.
 */

export const roundForInput = (value: number): string => {
    if (!Number.isFinite(value)) return '';
    const rounded = Math.round(value * 1e6) / 1e6;
    return rounded.toString();
};

export const DEFAULT_ZERO_DELTA = 0.1;

// Formatting helper shared with UI components. Uses scientific notation for
// magnitudes <1 or >1000, otherwise prints three decimal places.
export const formatNumber = (value: number): string => {
    if (!Number.isFinite(value)) return '0';
    if (Math.abs(value) > 1000 || (Math.abs(value) < 1 && value !== 0)) {
        return value.toExponential(2);
    }
    return value.toFixed(3);
};

// Returns a reasonable default scan range centered around `value`.
// Historically we simply used a ±10% window with a fixed delta for zero.
// Although it might be tempting to special‑case species, the UI already
// provides explicit start/end editable by the user, so keeping the logic
// uniform avoids unexpected surprises if we tweak it later.
export const computeDefaultBounds = (value: number): [number, number] => {
    if (!Number.isFinite(value) || value < 0) return [0, 0];

    if (value === 0) {
        return [0, DEFAULT_ZERO_DELTA];
    }
    const lower = Math.max(0, value * 0.9);  // p1 - 10%
    const upper = value * 1.1;               // p1 + 10%
    return [lower, upper];
};

export const generateRange = (start: number, end: number, steps: number, isLog = false): number[] => {
    // Edge case: Steps < 1 usually meaningless, return empty or start?
    // Original code returned [start] if steps <= 1
    if (steps <= 1) return [start];

    if (isLog) {
        // Log scale requires positive start/end; fall back to linear if invalid
        if (start <= 0 || end <= 0) {
            console.warn('Log scale requires positive start/end values. Falling back to linear.');
            // Fallthrough to linear
        } else {
            const logStart = Math.log10(start);
            const logEnd = Math.log10(end);
            const delta = (logEnd - logStart) / (steps - 1);
            return Array.from({ length: steps }, (_, index) => Number(Math.pow(10, logStart + index * delta).toPrecision(12)));
        }
    }

    const delta = (end - start) / (steps - 1);
    return Array.from({ length: steps }, (_, index) => Number((start + index * delta).toPrecision(12)));
};

export const validateScanSettings = (
    parameter: string,
    start: string,
    end: string,
    steps: string,
    isLog: boolean
): boolean => {
    if (!parameter) return false;
    const s = Number(start);
    const e = Number(end);
    const st = Number(steps);

    if (start === '' || end === '' || steps === '') return false;
    if (!Number.isFinite(s) || !Number.isFinite(e) || !Number.isFinite(st)) return false;
    if (st < 1) return false;
    if (isLog && (s <= 0 || e <= 0)) return false;
    return true;
};

// Helper to clone an expanded model to prevent shared mutation between scan iterations.
// Uses structuredClone for deep copy so that reevaluateSeedSpecies and
// updateMassActionRates mutations on nested species/reaction objects don't leak.
function cloneModel(model: BNGLModel): BNGLModel {
  return structuredClone(model);
}

/**
 * Runs a 1D or 2D parameter scan on the given expanded model and simulation options.
 */
export async function runParameterScan(
  expandedModel: BNGLModel,
  options: {
    parameter: string;
    start: number;
    end: number;
    steps: number;
    logarithmic?: boolean;
    logarithmic2?: boolean;
    parameter2?: string;
    start2?: number;
    end2?: number;
    steps2?: number;
  },
  simulationOptions: SimulationOptions,
  seedExpressions: Map<string, string>
): Promise<RunParameterScanResult> {
  const xValues = generateRange(options.start, options.end, options.steps, options.logarithmic ?? false);
  const yValues = options.parameter2 !== undefined
    ? generateRange(options.start2!, options.end2!, options.steps2!, options.logarithmic2 ?? options.logarithmic ?? false)
    : [];

  if (xValues.length * Math.max(1, yValues.length || 1) > 400) {
    throw new Error('parameter_scan supports at most 400 simulation combinations per request.');
  }

  await loadEvaluator();
  const leanSimulationOptions: SimulationOptions = {
    ...simulationOptions,
    includeSpeciesData: false,
    includeExpandedNetwork: false,
  };

  if (options.parameter2 === undefined) {
    const observables: Record<string, number[]> = {};
    expandedModel.observables.forEach((observable) => {
      observables[observable.name] = [];
    });

    for (const value of xValues) {
      const runModel = cloneModel(expandedModel);
      runModel.parameters[options.parameter] = value;
      reevaluateSeedSpecies(runModel, seedExpressions);
      updateMassActionRates(runModel);
      const result = await simulate(0, runModel, leanSimulationOptions, {
        checkCancelled: () => { },
        postMessage: () => { },
      });
      const lastPoint = result.data.at(-1) ?? {};
      Object.keys(observables).forEach((observableName) => {
        const rawValue = lastPoint[observableName as keyof typeof lastPoint];
        const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue ?? 0);
        observables[observableName].push(Number.isFinite(numericValue) ? numericValue : 0);
      });
    }

    return {
      mode: '1d',
      parameter: options.parameter,
      xValues,
      observables,
    };
  }

  const observables: Record<string, number[][]> = {};
  expandedModel.observables.forEach((observable) => {
    observables[observable.name] = yValues.map(() => new Array(xValues.length).fill(0));
  });

  for (let yIndex = 0; yIndex < yValues.length; yIndex += 1) {
    for (let xIndex = 0; xIndex < xValues.length; xIndex += 1) {
      const runModel = cloneModel(expandedModel);
      runModel.parameters[options.parameter] = xValues[xIndex];
      runModel.parameters[options.parameter2] = yValues[yIndex];
      reevaluateSeedSpecies(runModel, seedExpressions);
      updateMassActionRates(runModel);
      const result = await simulate(0, runModel, leanSimulationOptions, {
        checkCancelled: () => { },
        postMessage: () => { },
      });
      const lastPoint = result.data.at(-1) ?? {};
      Object.keys(observables).forEach((observableName) => {
        const rawValue = lastPoint[observableName as keyof typeof lastPoint];
        const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue ?? 0);
        observables[observableName][yIndex][xIndex] = Number.isFinite(numericValue) ? numericValue : 0;
      });
    }
  }

  return {
    mode: '2d',
    parameter: options.parameter,
    parameter2: options.parameter2,
    xValues,
    yValues,
    observables,
  };
}
