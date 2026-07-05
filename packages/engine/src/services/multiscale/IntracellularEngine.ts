// ---------------------------------------------------------------------------
// IntracellularEngine.ts – Real per-cell intracellular BNGL simulation.
//
// Each cell type carries a BNGL model. We compile that model's ODE network
// ONCE (buildOdeSystem), then integrate each cell's own state vector with
// CVODE (SUNDIALS BDF, implicit) — the correct choice for the stiff systems
// these networks produce. The previous placeholder used a fixed-step RK4 stub
// with a zero-length rate vector, so no intracellular dynamics ran at all.
//
// Design:
//   - One CVODE solver instance per cell type, reused across every cell and
//     every decision step. The solver re-initialises whenever the caller-
//     supplied state/time no longer matches its internal state, so different
//     cells sharing one solver stay numerically independent while a single
//     cell advancing step-to-step gets a warm (fast) restart.
//   - Observables are evaluated from the integrated species vector via the
//     projection captured on the ODE handle (value = Σ coeff_k · y[idx_k]).
// ---------------------------------------------------------------------------

import type { BNGLModel, OdeSystemHandle } from '../../types';
import { parseBNGLWithANTLR } from '../../parser/BNGLParserWrapper';
import { buildOdeSystem } from '../simulation/SimulationLoop';
import { CVODESolver } from '../simulation/solvers/CVODESolver';

const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export interface IntracellularEngineOptions {
  /** CVODE absolute tolerance (default 1e-8, matches the main simulator). */
  atol?: number;
  /** CVODE relative tolerance (default 1e-8). */
  rtol?: number;
  /** Warmup horizon passed to buildOdeSystem; only used to prime the RHS. */
  tPrime?: number;
}

interface ObservableProjection {
  name: string;
  indices: Int32Array;
  coefficients: Float64Array;
}

/**
 * Compiled intracellular model for one cell type. Create via
 * {@link IntracellularEngine.create} (async: parsing + network expansion +
 * CVODE load all happen there).
 */
export class IntracellularEngine {
  readonly cellType: string;
  readonly numSpecies: number;
  readonly speciesNames: string[];
  private readonly initialState: Float64Array;
  private readonly observableProjections: ObservableProjection[];
  private readonly solver: CVODESolver;
  private failureLogged = false;

  private constructor(
    cellType: string,
    handle: OdeSystemHandle,
    options: IntracellularEngineOptions,
  ) {
    this.cellType = cellType;
    this.numSpecies = handle.numSpecies;
    this.speciesNames = handle.speciesNames;
    this.initialState = Float64Array.from(handle.y0);

    this.observableProjections = (handle.observables ?? []).map((obs) => ({
      name: obs.name,
      indices: obs.indices instanceof Int32Array ? obs.indices : Int32Array.from(obs.indices),
      coefficients:
        obs.coefficients instanceof Float64Array
          ? obs.coefficients
          : Float64Array.from(obs.coefficients),
    }));

    this.solver = new CVODESolver(handle.numSpecies, handle.rhs, {
      atol: options.atol ?? 1e-8,
      rtol: options.rtol ?? 1e-8,
      solver: 'cvode',
    });
  }

  /**
   * Parse a BNGL model string, compile its ODE network, and return an engine
   * ready to integrate cells of the given type. Throws if the model cannot be
   * parsed; callers should catch and fall back to no intracellular dynamics.
   */
  static async create(
    cellType: string,
    bnglText: string,
    options: IntracellularEngineOptions = {},
  ): Promise<IntracellularEngine> {
    const parseResult = parseBNGLWithANTLR(bnglText);
    if (!parseResult.success || !parseResult.model) {
      const detail = (parseResult.errors ?? []).map((e) => e.message).join('; ');
      throw new Error(`Intracellular model parse failed for cell type "${cellType}": ${detail}`);
    }
    return IntracellularEngine.fromModel(cellType, parseResult.model, options);
  }

  /**
   * Build an engine from an already-parsed BNGL model. Compiles the ODE network
   * (also loading the CVODE WASM module) and returns a ready-to-integrate engine.
   */
  static async fromModel(
    cellType: string,
    model: BNGLModel,
    options: IntracellularEngineOptions = {},
  ): Promise<IntracellularEngine> {
    // buildOdeSystem runs the normal preparation path (network expansion + the
    // exact RHS the simulator integrates) and, with our capture change, also
    // returns the observable projection. It internally loads the CVODE WASM
    // module, so the solver we build is ready to run immediately.
    const handle = await buildOdeSystem(model, {
      t_end: options.tPrime ?? 1,
      n_steps: 1,
      solver: 'cvode',
    });

    return new IntracellularEngine(cellType, handle, options);
  }

  /** A fresh copy of the model's initial species vector, for a new cell. */
  newState(): Float64Array {
    return Float64Array.from(this.initialState);
  }

  /**
   * Advance one cell's state from t0 to t1 with CVODE, in place. Returns true
   * on success. On solver failure the state is left unchanged and the failure
   * is logged once (subsequent failures stay quiet to avoid log spam).
   */
  integrate(state: Float64Array, t0: number, t1: number): boolean {
    if (this.numSpecies === 0 || t1 <= t0) return true;

    const result = this.solver.integrate(state, t0, t1);
    if (!result.success) {
      if (!this.failureLogged) {
        this.failureLogged = true;
        console.warn(
          `[IntracellularEngine:${this.cellType}] CVODE step failed (${result.errorMessage ?? 'unknown'}); ` +
          'holding intracellular state for affected cells.',
        );
      }
      return false;
    }

    // Copy the integrated result back into the caller's buffer. result.y may be
    // the solver's reusable output view, so we must copy rather than alias.
    state.set(result.y.subarray(0, this.numSpecies));
    return true;
  }

  /**
   * Evaluate all model observables from a species vector into `out`, keyed by
   * observable name. Reuses the passed object so we don't allocate per cell.
   */
  computeObservables(state: Float64Array, out: Record<string, number>): Record<string, number> {
    for (const proj of this.observableProjections) {
      if (UNSAFE_OBJECT_KEYS.has(proj.name)) continue;
      let sum = 0;
      const idx = proj.indices;
      const coeff = proj.coefficients;
      for (let k = 0; k < idx.length; k++) {
        sum += coeff[k] * state[idx[k]];
      }
      out[proj.name] = sum;
    }
    return out;
  }

  /** Free the underlying CVODE solver resources. */
  dispose(): void {
    try {
      this.solver.destroy();
    } catch {
      // best-effort cleanup
    }
  }
}
