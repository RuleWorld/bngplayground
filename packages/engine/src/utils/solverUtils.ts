/**
 * Shared utility functions for ODE/stiff solvers.
 */

/**
 * Compute weighted error norm for step size control.
 * Used by Rosenbrock23, RK45, and other adaptive solvers.
 */
export function errorNorm(
  err: Float64Array,
  y: Float64Array,
  yNew: Float64Array,
  atol: number,
  rtol: number
): number {
  const n = err.length;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const scale = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(yNew[i]));
    const r = err[i] / scale;
    sumSq += r * r;
  }
  return Math.sqrt(sumSq / n);
}

/** Check for NaN or Infinity in array. */
export function hasInvalidValues(arr: Float64Array): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) return true;
  }
  return false;
}

/** Shared type for RHS derivative function. */
export type DerivativeFunction = (y: Float64Array, dydt: Float64Array) => void;

/** Default solver options matching BNG2 CVODE defaults. */
export const DEFAULT_SOLVER_OPTIONS: SolverOptions = {
  atol: 1e-8,
  rtol: 1e-8,
  maxSteps: 2000,
  minStep: 1e-15,
  maxStep: Infinity,
  solver: 'auto',
};

export const SOLVER_ERROR_STIFF_DETECTED = 'STIFF_DETECTED';

export interface SolverReaction {
  reactants: number[] | Int32Array;
  products: number[] | Int32Array;
  rateConstant?: number;
  isFunctionalRate?: boolean;
}

export interface SolverOptions {
  atol: number;
  rtol: number;
  maxSteps: number;
  minStep: number;
  maxStep: number;
  initialStep?: number;
  solver: 'auto' | 'auto_detect' | 'cvode' | 'cvode_auto' | 'cvode_sparse' | 'cvode_jac' | 'cvode_adams' | 'rosenbrock23' | 'rk45' | 'rk4' | 'sparse' | 'sparse_implicit' | 'webgpu_rk4';
  jacobianRowMajor?: (y: Float64Array, J: Float64Array) => void;
  jacobian?: (y: Float64Array, J: Float64Array) => void;
  speciesNames?: string[];
  stabLimDet?: boolean;
  maxOrd?: number;
  maxNonlinIters?: number;
  nonlinConvCoef?: number;
  maxErrTestFails?: number;
  maxConvFails?: number;
  useAdams?: boolean;
  rootFunction?: (t: number, y: Float64Array, gout: Float64Array) => void;
  numRoots?: number;
  networkByteCode?: import('../services/analysis/JITCompiler').NetworkByteCode;
  /** Enable analytical Jacobian generation from reaction data. Default: true for mass-action, false for functional rates. */
  useAnalyticalJacobian?: boolean;
  /** Reaction data for analytical Jacobian auto-generation (set by SimulationLoop). */
  reactions?: SolverReaction[];
  disableNativeBytecode?: boolean;
}

export interface SolverResult {
  success: boolean;
  t: number;
  y: Float64Array;
  steps: number;
  errorMessage?: string;
}
