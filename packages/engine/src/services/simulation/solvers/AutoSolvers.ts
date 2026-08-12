/**
 * Auto-switching solver wrappers that compose base solvers.
 * Each starts with a fast solver and falls back to a stiff solver on failure.
 */

import type { SolverOptions, SolverResult, DerivativeFunction } from '../../../utils/solverUtils';
import { SOLVER_ERROR_STIFF_DETECTED } from '../../../utils/solverUtils';
import { Rosenbrock23Solver } from './Rosenbrock23Solver';
import { RK45Solver, FastRK4Solver } from './RK45Solver';
import { CVODESolver } from './CVODESolver';
import { SparseODESolver } from '../../analysis/SparseODESolver';
import { buildJacobianFunction, isPurelyMassAction } from '../AnalyticalJacobian';
import type { JacobianReaction } from '../AnalyticalJacobian';
import { CompositeAutoSolver } from '../StiffnessDetector';

/**
 * Auto-switching solver: starts with RK45, switches to Rosenbrock23 if stiffness detected
 */
export class AutoSolver {
  private rk45: RK45Solver;
  private rosenbrock: Rosenbrock23Solver;
  private useImplicit: boolean = false;

  constructor(n: number, f: DerivativeFunction, options: Partial<SolverOptions> = {}) {
    this.rk45 = new RK45Solver(n, f, options);
    this.rosenbrock = new Rosenbrock23Solver(n, f, options);
  }

  integrate(
    y0: Float64Array,
    t0: number,
    tEnd: number,
    checkCancelled?: () => void
  ): SolverResult {
    if (this.useImplicit) {
      return this.rosenbrock.integrate(y0, t0, tEnd, checkCancelled);
    }

    const result = this.rk45.integrate(y0, t0, tEnd, checkCancelled);

    if (result.success) {
      return result;
    }

    if (result.errorMessage === SOLVER_ERROR_STIFF_DETECTED) {
      this.useImplicit = true;
      return this.rosenbrock.integrate(result.y, result.t, tEnd, checkCancelled);
    }

    return result;
  }
}

/**
 * CVODE Auto-switching solver: tries CVODE first (fast for most models),
 * automatically falls back to Rosenbrock23 on convergence failure.
 */
export class CVODEAutoSolver {
  private cvode: CVODESolver | null = null;
  private rosenbrock: Rosenbrock23Solver;
  private useFallback: boolean = false;
  private fallbackStartMs: number = 0;

  constructor(_n: number, f: DerivativeFunction, options: SolverOptions, cvode: CVODESolver) {
    this.cvode = cvode;
    this.rosenbrock = new Rosenbrock23Solver(_n, f, options);
  }

  integrate(
    y0: Float64Array,
    t0: number,
    tEnd: number,
    checkCancelled?: () => void
  ): SolverResult {
    if (this.useFallback || !this.cvode) {
      if (this.fallbackStartMs > 0 && (Date.now() - this.fallbackStartMs) > 30_000) {
        return {
          success: false,
          t: t0,
          y: y0,
          steps: 0,
          errorMessage: 'Rosenbrock23 fallback exceeded 30 s wall-clock limit',
        };
      }
      return this.rosenbrock.integrate(y0, t0, tEnd, checkCancelled);
    }

    const result = this.cvode.integrate(y0, t0, tEnd, checkCancelled);

    if (result.success) {
      return result;
    }

    if (result.errorMessage?.includes('flag -4') ||
      result.errorMessage?.includes('flag -3') ||
      result.errorMessage?.includes('convergence') ||
      result.errorMessage?.includes('negative overshoot') ||
      result.errorMessage?.includes('NaN/Infinity')) {
      console.log('[CVODEAutoSolver] CVODE failed, switching to Rosenbrock23');
      this.useFallback = true;
      this.fallbackStartMs = Date.now();
      return this.rosenbrock.integrate(y0, t0, tEnd, checkCancelled);
    }

    return result;
  }

  destroy(): void {
    this.cvode?.destroy?.();
    this.cvode = null;
  }
}

/**
 * Wrapper for the SparseODESolver to match ODESolver interface
 */
class SparseODESolverWrapper {
  private solver: SparseODESolver;

  constructor(n: number, f: DerivativeFunction, options: SolverOptions) {
    const reactions = (options as any).reactions || [];
    const speciesNames = (options as any).speciesNames || [];
    this.solver = new SparseODESolver(n, reactions, f, new Float64Array(n), speciesNames, options);
  }

  integrate(y0: Float64Array, t0: number, tEnd: number): SolverResult {
    const res = this.solver.integrate(y0, t0, tEnd, [tEnd], (_t, _y) => {});

    return {
      success: res.success,
      t: res.t,
      y: res.y,
      steps: res.steps
    };
  }
}

const DEFAULT_OPTIONS: SolverOptions = {
  atol: 1e-8,
  rtol: 1e-8,
  maxSteps: 2000,
  minStep: 1e-15,
  maxStep: Infinity,
  solver: 'auto',
};

/**
 * Factory function to create appropriate solver
 */
export async function createSolver(
  n: number,
  f: DerivativeFunction,
  options: Partial<SolverOptions> = {}
): Promise<{ integrate: (y0: Float64Array, t0: number, tEnd: number, checkCancelled?: () => void) => SolverResult; destroy?: () => void }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  switch (opts.solver) {
    case 'cvode':
      await CVODESolver.init();
      return new CVODESolver(n, f, opts, false);
    case 'cvode_sparse':
      await CVODESolver.init();
      return new CVODESolver(n, f, opts, true);
    case 'cvode_jac': {
      await CVODESolver.init();
      let jacobian = (options as any).jacobian;
      // Auto-build analytical Jacobian from reaction data when no explicit Jacobian is provided
      if (!jacobian && (options as any).reactions) {
        const reactions = (options as any).reactions as JacobianReaction[];
        const useAnalytical = (options as any).useAnalyticalJacobian !== false;
        if (useAnalytical && isPurelyMassAction(reactions)) {
          jacobian = buildJacobianFunction(reactions, n);
          console.log('[createSolver] Auto-generated analytical Jacobian for', n, 'species,', reactions.length, 'mass-action reactions');
        } else if (useAnalytical) {
          // Hybrid: analytical for mass-action + FD for functional
          jacobian = buildJacobianFunction(reactions, n, f);
          console.log('[createSolver] Auto-generated hybrid Jacobian for', n, 'species,', reactions.length, 'reactions (includes functional rates)');
        }
      }
      return new CVODESolver(n, f, opts, false, jacobian);
    }
    case 'cvode_adams':
      await CVODESolver.init();
      return new CVODESolver(n, f, opts, false, undefined, true);
    case 'rosenbrock23':
      return new Rosenbrock23Solver(n, f, opts);
    case 'rk45':
      return new RK45Solver(n, f, opts);
    case 'rk4':
      return new FastRK4Solver(n, f, opts);
    case 'cvode_auto':
      await CVODESolver.init();
      return new CVODEAutoSolver(n, f, opts as SolverOptions, new CVODESolver(n, f, opts, false, undefined, opts.useAdams));
    case 'sparse':
    case 'sparse_implicit':
      console.log('[ODESolver] Using SparseODESolver (Real Sparse Backend)');
      return new SparseODESolverWrapper(n, f, opts as SolverOptions);
    case 'webgpu_rk4':
      console.warn('[ODESolver] webgpu_rk4 selected - using CPU FastRK4 fallback.');
      return new FastRK4Solver(n, f, opts);
    case 'auto_detect': {
      // Stiffness-detecting composite solver: probes stiffness at startup
      // and re-probes periodically, switching between solvers as needed.
      await CVODESolver.init();
      const compositeFactory = async (solverName: SolverOptions['solver']) => {
        // Reuse createSolver but avoid infinite recursion on auto_detect
        return createSolver(n, f, { ...options, solver: solverName });
      };
      const composite = new CompositeAutoSolver(n, f, opts as SolverOptions, compositeFactory);
      // Return an adapter that lazily initializes and delegates
      return {
        integrate(_y0: Float64Array, _t0: number, _tEnd: number, _checkCancelled?: () => void): SolverResult {
          // CompositeAutoSolver.integrate is async; we need a sync wrapper.
          // For the synchronous integrate interface, do the initial probe synchronously
          // by using the detector directly and picking a solver.
          // This is a pragmatic bridge — full async usage goes through composite.integrate().
          throw new Error(
            'auto_detect solver must be used via createAutoDetectSolver() which returns an async integrate. ' +
            'Use the CompositeAutoSolver directly for async integration.',
          );
        },
        destroy() {
          composite.destroy();
        },
        /** Direct access to the underlying CompositeAutoSolver for async usage. */
        composite,
      } as any;
    }
    case 'auto':
    default: {
      await CVODESolver.init();
      const useAdams = opts.useAdams ?? false;
      return new CVODEAutoSolver(n, f, opts as SolverOptions, new CVODESolver(n, f, opts, false, undefined, useAdams));
    }
  }
}

/**
 * Create an auto-detect solver that probes stiffness and selects the best solver.
 *
 * Unlike createSolver, this returns a CompositeAutoSolver whose integrate() is async
 * and re-probes periodically during integration. Use this when you want full
 * stiffness-detection-driven solver switching.
 */
export async function createAutoDetectSolver(
  n: number,
  f: DerivativeFunction,
  options: Partial<SolverOptions> = {},
): Promise<CompositeAutoSolver> {
  const opts = { ...DEFAULT_OPTIONS, ...options, solver: 'auto_detect' as const };
  await CVODESolver.init();

  const factory = async (solverName: SolverOptions['solver']) => {
    return createSolver(n, f, { ...opts, solver: solverName });
  };

  return new CompositeAutoSolver(n, f, opts as SolverOptions, factory);
}
