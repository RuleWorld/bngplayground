/**
 * ODESolver.ts - Barrel re-export for ODE solver modules.
 *
 * Each solver class lives in its own file under solvers/:
 *   - Rosenbrock23Solver (+ LUSolver)
 *   - RK45Solver, FastRK4Solver
 *   - CVODESolver (+ CVodeModule interface)
 *   - AutoSolver, SmartAutoSolver, CVODEAutoSolver, createSolver
 *
 * Shared types and utilities live in utils/solverUtils.ts.
 */

// ── Shared types & utilities ────────────────────────────────────────
export type { SolverOptions, SolverResult, DerivativeFunction } from '../../utils/solverUtils';
export { SOLVER_ERROR_STIFF_DETECTED } from '../../utils/solverUtils';

// ── Individual solver classes ───────────────────────────────────────
export { Rosenbrock23Solver } from './solvers/Rosenbrock23Solver';
export { RK45Solver, FastRK4Solver } from './solvers/RK45Solver';
export { CVODESolver } from './solvers/CVODESolver';
export type { JacobianFunction } from './solvers/CVODESolver';

// ── Analytical Jacobian generation ─────────────────────────────────
export { buildJacobianFunction, isPurelyMassAction, computeJacobian, computeFiniteDifferenceJacobian } from '../simulation/AnalyticalJacobian';
export type { JacobianReaction } from '../simulation/AnalyticalJacobian';

// ── Auto-switching wrappers & factory ───────────────────────────────
export { AutoSolver, createSolver } from './solvers/AutoSolvers';
