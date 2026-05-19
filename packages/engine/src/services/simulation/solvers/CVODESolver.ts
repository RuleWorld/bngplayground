/**
 * CVODE Solver - High performance WASM-based stiff solver
 *
 * Uses SUNDIALS CVODE with BDF method (implicit, L-stable) compiled to WebAssembly.
 * Configuration matches BioNetGen's Network3/run_network defaults:
 * - max_num_steps: 2000 (auto-grows on CV_TOO_MUCH_WORK)
 * - max_err_test_fails: 7
 * - max_conv_fails: 10
 * - max_step: 0.0 (no limit)
 *
 * Additional CVODE options available in WASM wrapper (wasm-sundials/cvode_wrapper.c):
 * - set_min_step(ptr, hmin): Set minimum step size
 * - set_max_ord(ptr, maxord): Set max BDF order (1-5, default 5)
 * - set_stab_lim_det(ptr, onoff): Enable BDF stability limit detection (helps oscillators)
 * - set_max_nonlin_iters(ptr, maxcor): Max nonlinear iterations per step (default 3)
 * - set_nonlin_conv_coef(ptr, nlscoef): NLS convergence coefficient (default 0.1)
 * - set_max_err_test_fails(ptr, maxnef): Max error test failures per step
 * - set_max_conv_fails(ptr, maxncf): Max convergence failures per step
 * - reinit_solver(ptr, t0, y0): Reinitialize at new time/state (for multi-phase)
 * - get_solver_stats(ptr, ...): Get diagnostic statistics
 *
 * Per-species absolute tolerance scaling (RoadRunner-inspired):
 * When initial concentrations span > 3 orders of magnitude, the scalar atol is
 * scaled by the geometric mean of nonzero concentrations, clamped to [1e-12, 1e-6].
 * This avoids wasting CVODE steps on well-resolved large-concentration species.
 * A future improvement is to expose CVodeSVtolerances in the WASM build for true
 * per-species vector tolerances: atol_i = max(base_atol, base_atol * |y0_i|).
 *
 * Known limitations for strict numerical parity with BNG2:
 * 1. Chaotic systems (Hill n>10) will diverge due to floating-point sensitivity
 * 2. Long-period oscillators accumulate phase drift over many cycles
 * 3. Very long simulations (>100k time units) accumulate rounding errors
 * These are fundamental numerical characteristics, not implementation bugs.
 */

import { SolverOptions, SolverResult, hasInvalidValues } from '../../../utils/solverUtils';
import { ExpressionTranslator } from '../../graph/core/ExpressionTranslator';
import type { NetworkByteCode } from '../../analysis/JITCompiler';
import type { Rxn } from '../../graph/core/Rxn';
import { resetCVodeSensModule, setCVodeSensModule } from '../../analysis/DifferentiableSolver';

type DerivativeFunction = (y: Float64Array, dydt: Float64Array) => void;

const WINDOWS_ABS_PATH_RE = /[A-Za-z]:\\(?:[^\\\]\r\n]+\\)*[^\\\]\r\n]+/g;
const POSIX_ABS_PATH_RE = /\/(?:Users|home)\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+/g;

const sanitizeRuntimeLog = (message: unknown): string => {
  const text = String(message ?? '');
  return text
    .replace(WINDOWS_ABS_PATH_RE, '<local-path>')
    .replace(POSIX_ABS_PATH_RE, '<local-path>');
};

const DEFAULT_OPTIONS: SolverOptions = {
  atol: 1e-8,          // Absolute tolerance (matches BNG2 CVODE default)
  rtol: 1e-8,          // Relative tolerance (matches BNG2 CVODE default)
  maxSteps: 2000,      // Initial CVODE mxstep (matches BNG2 default)
  minStep: 1e-15,
  maxStep: Infinity,
  solver: 'auto',      // 'auto' now uses CVODE with fallback to Rosenbrock23 (matches BNG2 behavior)
};

export interface CVodeModule {
  _init_solver(neq: number, t0: number, y0: number, rtol: number, atol: number, max_steps: number): number;
  _init_solver_adams?(neq: number, t0: number, y0: number, rtol: number, atol: number, max_steps: number): number;
  _init_solver_sparse(neq: number, t0: number, y0: number, rtol: number, atol: number, max_steps: number): number;
  _solve_step(mem: number, tout: number, tret: number): number;
  _get_y(mem: number, dest: number): void;
  _destroy_solver(mem: number): void;
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPF64: Float64Array;
  ccall: any;
  cwrap: any;
  derivativeCallback: (t: number, y: number, ydot: number) => void;
  jacobianCallback?: (t: number, y: number, fy: number, J: number, neq: number) => void;
  rootCallback?: (t: number, y: number, gout: number) => void;
  _init_solver_jac?: (neq: number, t0: number, y0: number, rtol: number, atol: number, maxSteps: number) => number;
  // Additional CVODE options (exposed in WASM wrapper)
  _set_min_step?: (mem: number, hmin: number) => number;
  _set_max_ord?: (mem: number, maxord: number) => number;
  _set_stab_lim_det?: (mem: number, onoff: number) => number;
  _set_max_nonlin_iters?: (mem: number, maxcor: number) => number;
  _set_nonlin_conv_coef?: (mem: number, nlscoef: number) => number;
  _set_max_err_test_fails?: (mem: number, maxnef: number) => number;
  _set_max_conv_fails?: (mem: number, maxncf: number) => number;
  _set_max_num_steps?: (mem: number, mxstep: number) => number;
  _reinit_solver?: (mem: number, t0: number, y0: number) => number;
  _get_solver_stats?: (mem: number, nsteps: number, nfevals: number, nlinsetups: number, netfails: number) => void;
  _init_roots?: (mem: number, nroots: number) => number;
  _get_root_info?: (mem: number, rootsfound: number) => number;
  _load_network?: (
    nReactions: number, nSpecies: number,
    rateConstants: number, nReactantsPerRxn: number,
    reactantOffsets: number, reactantIdx: number,
    reactantStoich: number, scalingVolumes: number,
    speciesOffsets: number, speciesRxnIdx: number,
    speciesStoich: number, speciesVolumes: number,
    jacRowPtr: number, jacColIdx: number,
    jacContribOffsets: number, jacContribRxnIdx: number,
    jacContribCoeffs: number,
    nObservables: number,
    obsOffsets: number,
    obsSpeciesIdx: number,
    obsCoeffs: number,
    exprBytecodeOffsets: number,
    exprBytecode: number,
    exprConstants: number
  ) => number;
  _cvode_load_network?: (
    nReactions: number, nSpecies: number,
    rateConstants: number, nReactantsPerRxn: number,
    reactantOffsets: number, reactantIdx: number,
    reactantStoich: number, scalingVolumes: number,
    speciesOffsets: number, speciesRxnIdx: number,
    speciesStoich: number, speciesVolumes: number,
    jacRowPtr: number, jacColIdx: number,
    jacContribOffsets: number, jacContribRxnIdx: number,
    jacContribCoeffs: number,
    nObservables: number,
    obsOffsets: number,
    obsSpeciesIdx: number,
    obsCoeffs: number,
    exprBytecodeOffsets: number,
    exprBytecode: number,
    exprConstants: number
  ) => number;
  _destroy_network?: (handle: number) => void;
  _update_rate_constants?: (handle: number, rateConstants: number, nReactions: number) => void;
  _cvode_update_rate_constants?: (handle: number, rateConstants: number, nReactions: number) => void;
  _unload_network?: (handle: number) => void;
  _cvode_unload_network?: (handle: number) => void;
  _bind_network?: (mem: number, handle: number) => void;
  _cvode_bind_network?: (mem: number, handle: number) => void;
}

// Type for Jacobian function: fills column-major matrix J[i + j*neq] = df_i/dy_j
export type JacobianFunction = (y: Float64Array, J: Float64Array) => void;

export class CVODESolver {
  private n: number;
  private f: DerivativeFunction;
  private options: SolverOptions;
  private useSparse: boolean;
  private useAdams: boolean;
  private jacobian?: JacobianFunction;
  private networkByteCode?: NetworkByteCode;
  private networkHandle: number = 0;

  /**
   * Compute a scaled scalar absolute tolerance based on initial concentrations.
   *
   * Inspired by RoadRunner's per-species tolerance approach. Since the WASM CVODE
   * build only exposes CVodeSStolerances (scalar atol), we approximate per-species
   * scaling by adjusting the single atol based on the geometric mean of nonzero
   * initial concentrations.
   *
   * This only activates when concentrations span > 3 orders of magnitude.
   * When activated, atol is set to: clamp(baseAtol * geometricMean, 1e-12, 1e-6).
   *
   * If CVodeSVtolerances becomes available in the WASM build (wasm-sundials/cvode_wrapper.c),
   * this should be replaced with true per-species tolerances:
   *   atol_i = max(baseAtol, baseAtol * |y0_i|)
   *
   * @param y0 Initial state vector
   * @param baseAtol The user-configured scalar atol (default 1e-8)
   * @returns The (possibly scaled) scalar atol to pass to CVODE
   */
  static computeScaledAtol(y0: Float64Array, baseAtol: number): number {
    if (y0.length === 0) return baseAtol;

    // Collect absolute values of nonzero initial concentrations
    let minNonzero = Infinity;
    let maxAbs = 0;
    let logSum = 0;
    let nonzeroCount = 0;

    for (let i = 0; i < y0.length; i++) {
      const absVal = Math.abs(y0[i]);
      if (absVal > 0) {
        if (absVal < minNonzero) minNonzero = absVal;
        if (absVal > maxAbs) maxAbs = absVal;
        logSum += Math.log(absVal);
        nonzeroCount++;
      }
    }

    // If no nonzero species or range is within 3 orders of magnitude, keep base atol
    if (nonzeroCount === 0 || maxAbs === 0 || minNonzero === Infinity) {
      return baseAtol;
    }

    const dynamicRange = maxAbs / minNonzero;
    if (dynamicRange <= 1e3) {
      return baseAtol; // Range <= 3 orders of magnitude; no scaling needed
    }

    // Geometric mean of nonzero concentrations
    const geoMean = Math.exp(logSum / nonzeroCount);

    // Scale atol by geometric mean, clamped to [1e-12, 1e-6]
    const scaledAtol = Math.max(1e-12, Math.min(1e-6, baseAtol * geoMean));
    return scaledAtol;
  }

  private solverMem: number | null = null;
  private yPtr: number = 0;
  private tretPtr: number = 0;
  private currentT: number = NaN;
  private yOut: Float64Array | null = null;

  // Cached callback views (avoid allocating TypedArray views on every callback)
  private cachedYPtr = 0;
  private cachedYdotPtr = 0;
  private cachedDerivBuffer: ArrayBufferLike | null = null;
  private yView: Float64Array | null = null;
  private dydtView: Float64Array | null = null;

  private cachedJacYPtr = 0;
  private cachedJPtr = 0;
  private cachedJacBuffer: ArrayBufferLike | null = null;
  private jacYView: Float64Array | null = null;
  private jacJView: Float64Array | null = null;

  private rootsFoundPtr: number = 0;
  private cachedGOutPtr = 0;
  private cachedGOutBuffer: ArrayBufferLike | null = null;
  private gYView: Float64Array | null = null;
  private gOutView: Float64Array | null = null;

  static module: CVodeModule | null = null;
  static initPromise: Promise<void> | null = null;
  /** Injected factory for loading the CVODE WASM module. Set via setCVodeFactory() before first use. */
  static cvodeModuleFactory: (() => Promise<unknown>) | null = null;

  /** Wire up the CVODE loader (call from app init before any simulation). */
  static setCVodeFactory(factory: () => Promise<unknown>): void {
    CVODESolver.cvodeModuleFactory = factory;
  }

  /** Clear cached CVODE runtime state so test workers can exit cleanly. */
  static async resetRuntimeState(): Promise<void> {
    if (!CVODESolver.module && !CVODESolver.initPromise) {
      return;
    }

    CVODESolver.module = null;
    CVODESolver.initPromise = null;
    resetCVodeSensModule();

    try {
      const { destroyCachedCVodeLoader } = await import('../cvode_node.ts');
      destroyCachedCVodeLoader();
    } catch {
      // Ignore teardown cleanup failures.
    }
  }

  constructor(n: number, f: DerivativeFunction, options: Partial<SolverOptions> = {}, useSparse: boolean = false, jacobian?: JacobianFunction, useAdams: boolean = false) {
    this.n = n;
    this.f = f;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.useSparse = useSparse;
    this.jacobian = jacobian;
    this.useAdams = useAdams;
    this.networkByteCode = this.options.networkByteCode;
  }

  /**
   * Validate CVODE output state. Clamp small negatives to zero (matching BNG2
   * behavior) and only fail hard for non-finite output or clearly catastrophic
   * negative overshoot relative to the overall state scale.
   */
  private validateCvodeState(y: Float64Array, t: number): string | null {
    let maxAbs = 0;
    let minValue = 0;
    let hasNonFinite = false;

    for (let i = 0; i < y.length; i++) {
      const value = y[i];
      if (!Number.isFinite(value)) {
        hasNonFinite = true;
        break;
      }
      const absValue = Math.abs(value);
      if (absValue > maxAbs) maxAbs = absValue;
      if (value < minValue) minValue = value;
    }

    if (hasNonFinite) {
      return `NaN/Infinity detected at t=${t.toExponential(4)}`;
    }

    for (let i = 0; i < y.length; i++) {
      if (y[i] < 0) y[i] = 0;
    }

    if (minValue < -1.0 && Math.abs(minValue) > 0.01 * maxAbs) {
      return `CVODE negative overshoot at t=${t.toExponential(4)} (min=${minValue.toExponential(4)})`;
    }

    return null;
  }

  static async init() {
    if (this.module) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
        const resolveLoader = (moduleLike: unknown) => {
          const candidates: unknown[] = [moduleLike];

          if (moduleLike && typeof moduleLike === 'object') {
            const asRecord = moduleLike as Record<string, unknown>;
            candidates.push(asRecord.default, asRecord.createCVodeModule);

            const nestedDefault = asRecord.default;
            if (nestedDefault && typeof nestedDefault === 'object') {
              const nestedRecord = nestedDefault as Record<string, unknown>;
              candidates.push(nestedRecord.default, nestedRecord.createCVodeModule);
            }
          }

          const callable = candidates.find((candidate) => typeof candidate === 'function');
          if (!callable) {
            throw new Error(
              'Failed to resolve a callable CVODE loader export from the WASM module. ' +
              'The module was loaded but does not export a recognized factory function (default or createCVodeModule). ' +
              'This is a configuration issue - ensure the CVODE WASM build is compatible with this version of the simulator.'
            );
          }

          return callable as (moduleArg?: unknown) => Promise<CVodeModule>;
        };

        let loader: (moduleArg?: unknown) => Promise<CVodeModule>;
        if (CVODESolver.cvodeModuleFactory) {
          console.log('[ODESolver] Loading CVODE via injected factory');
          loader = resolveLoader(await CVODESolver.cvodeModuleFactory());
        } else if (isNode) {
          console.log('[ODESolver] Loading CVODE via cvode_node');
          // Use dynamic import with string template to avoid Vite static analysis
          const modulePath = '../cvode_node.ts';
          loader = resolveLoader(await import(/* @vite-ignore */ modulePath));
        } else {
          // In browser/worker context, cvodeModuleFactory must be injected by the app layer
          // (see bnglWorker.ts). If we reach here without a factory, it's a setup error.
          throw new Error(
            'CVODE solver is not available: the CVODE WASM module factory has not been injected. ' +
            'In the browser, the app layer must call CVODESolver.cvodeModuleFactory = ... before simulating. ' +
            'If you are using the playground UI, this usually means the CVODE WASM file failed to load. ' +
            'Try refreshing the page, or switch to the Rosenbrock23 solver as a fallback.'
          );
        }

        this.module = await loader({
          print: (text: unknown) => {
            console.log(sanitizeRuntimeLog(text));
          },
          printErr: (text: unknown) => {
            console.error(sanitizeRuntimeLog(text));
          },
          locateFile: (path: string) => {
            if (path.endsWith('.wasm')) {
              if (isNode) {
                try {
                  const nodePath = typeof require === 'function' ? require('path') : null;
                  if (nodePath && typeof process !== 'undefined' && typeof process.cwd === 'function') {
                    return nodePath.resolve(process.cwd(), 'public', 'cvode.wasm');
                  }
                } catch {
                  // Fall through to cwd-based string path.
                }
                if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
                  return `${process.cwd()}/public/cvode.wasm`;
                }
                return './public/cvode.wasm';
              }
              // In browser/worker, detect base URL from self.location
              let baseUrl = '/';
              // console.log('[CVODESolver.init] locateFile called for:', path);

              if (typeof self !== 'undefined' && self.location) {
                const pathname = self.location.pathname;
                if (pathname.includes('/bngplayground/')) {
                  baseUrl = '/bngplayground/';
                }
              }
              const finalPath = baseUrl + 'cvode.wasm';
              console.log(`[CVODESolver.init] Resolving ${path} -> ${finalPath}`);
              return finalPath;
            }
            return path;
          }

        }) as unknown as CVodeModule;

        // Register the module with DifferentiableSolver for CVODES sensitivity support.
        // The module only needs _sens_init_forward etc. to be present (compiled with CVODES).
        setCVodeSensModule(this.module);
      } catch (e) {
        console.error("Failed to load CVODE WASM:", e);
        throw e;
      }
    })();
    return this.initPromise;
  }

  destroy(): void {
    const m = CVODESolver.module;
    if (!m) return;
    if (this.solverMem) {
      try {
        m._destroy_solver(this.solverMem);
      } finally {
        this.solverMem = null;
      }
    }
    if (this.yPtr) {
      m._free(this.yPtr);
      this.yPtr = 0;
    }
    if (this.tretPtr) {
      m._free(this.tretPtr);
      this.tretPtr = 0;
    }
    if (this.rootsFoundPtr) {
      m._free(this.rootsFoundPtr);
      this.rootsFoundPtr = 0;
    }
    this.currentT = NaN;
    this.yOut = null;
    const unloadNetwork = m?._cvode_unload_network ?? m?._unload_network;
    if (m && unloadNetwork && this.networkHandle) {
      unloadNetwork(this.networkHandle);
      this.networkHandle = 0;
    }
  }

  private uploadNetworkByteCode(bc: NetworkByteCode): boolean {
    const m = CVODESolver.module;
    if (!m) return false;
    const loadNetwork = m._cvode_load_network ?? m._load_network;
    const unloadNetwork = m._cvode_unload_network ?? m._unload_network;
    const bindNetwork = m._cvode_bind_network ?? m._bind_network;
    if (!loadNetwork) return false;

    // Allocate WASM heap memory
    const rateConstPtr = m._malloc(bc.nReactions * 8);
    const nReactantsPtr = m._malloc(bc.nReactions * 4);
    const reactantOffsetsPtr = m._malloc((bc.nReactions + 1) * 4);
    const reactantIdxPtr = m._malloc(bc.reactantIdx.length * 4);
    const reactantStoichPtr = m._malloc(bc.reactantStoich.length * 4);
    const scalingVolsPtr = m._malloc(bc.nReactions * 8);
    const speciesOffsetsPtr = m._malloc((bc.nSpecies + 1) * 4);
    const speciesRxnIdxPtr = m._malloc(bc.speciesRxnIdx.length * 4);
    const speciesStoichPtr = m._malloc(bc.speciesStoich.length * 8);
    const speciesVolsPtr = m._malloc(bc.nSpecies * 8);

    // Optional Jacobian Bytecode
    const hasJac = bc.jacRowPtr && bc.jacColIdx && bc.jacContribOffsets && bc.jacContribRxnIdx && bc.jacContribCoeffs;
    let jacRowPtrPtr = 0, jacColIdxPtr = 0, jacContribOffsetsPtr = 0, jacContribRxnIdxPtr = 0, jacContribCoeffsPtr = 0;

    if (hasJac) {
      jacRowPtrPtr = m._malloc((bc.nSpecies + 1) * 4);
      jacColIdxPtr = m._malloc(bc.jacColIdx!.length * 4);
      jacContribOffsetsPtr = m._malloc(bc.jacContribOffsets!.length * 4);
      jacContribRxnIdxPtr = m._malloc(bc.jacContribRxnIdx!.length * 4);
      jacContribCoeffsPtr = m._malloc(bc.jacContribCoeffs!.length * 8);
    }

    // Functional Rate Bytecode & Observables
    const obsOffsetsPtr = m._malloc((bc.nObservables + 1) * 4);
    const obsSpeciesIdxPtr = m._malloc(bc.obsSpeciesIdx.length * 4);
    const obsCoeffsPtr = m._malloc(bc.obsCoeffs.length * 8);
    const exprBytecodeOffsetsPtr = m._malloc((bc.nReactions + 1) * 4);
    const exprBytecodePtr = m._malloc(bc.exprBytecode.length); // uint8_t
    const exprConstantsPtr = m._malloc(bc.exprConstants.length * 8);

    if (!rateConstPtr || !nReactantsPtr || !reactantOffsetsPtr || !reactantIdxPtr || !reactantStoichPtr ||
      !scalingVolsPtr || !speciesOffsetsPtr || !speciesRxnIdxPtr || !speciesStoichPtr || !speciesVolsPtr ||
      !obsOffsetsPtr || !obsSpeciesIdxPtr || !obsCoeffsPtr ||
      !exprBytecodeOffsetsPtr || !exprBytecodePtr || !exprConstantsPtr ||
      (hasJac && (!jacRowPtrPtr || !jacColIdxPtr || !jacContribOffsetsPtr || !jacContribRxnIdxPtr || !jacContribCoeffsPtr))) {
      console.error('[CVODESolver] malloc failed for bytecode');
      // Cleanup
      [rateConstPtr, nReactantsPtr, reactantOffsetsPtr, reactantIdxPtr, reactantStoichPtr, scalingVolsPtr, speciesOffsetsPtr, speciesRxnIdxPtr, speciesStoichPtr, speciesVolsPtr, jacRowPtrPtr, jacColIdxPtr, jacContribOffsetsPtr, jacContribRxnIdxPtr, jacContribCoeffsPtr, obsOffsetsPtr, obsSpeciesIdxPtr, obsCoeffsPtr, exprBytecodeOffsetsPtr, exprBytecodePtr, exprConstantsPtr].forEach(p => p && m._free(p));
      return false;
    }

    // Copy to heap
    m.HEAPF64.set(bc.rateConstants, rateConstPtr >> 3);
    new Int32Array(m.HEAPF64.buffer, nReactantsPtr, bc.nReactions).set(bc.nReactantsPerRxn);
    new Int32Array(m.HEAPF64.buffer, reactantOffsetsPtr, bc.nReactions + 1).set(bc.reactantOffsets);
    new Int32Array(m.HEAPF64.buffer, reactantIdxPtr, bc.reactantIdx.length).set(bc.reactantIdx);
    new Int32Array(m.HEAPF64.buffer, reactantStoichPtr, bc.reactantStoich.length).set(bc.reactantStoich);
    m.HEAPF64.set(bc.scalingVolumes, scalingVolsPtr >> 3);
    new Int32Array(m.HEAPF64.buffer, speciesOffsetsPtr, bc.nSpecies + 1).set(bc.speciesOffsets);
    new Int32Array(m.HEAPF64.buffer, speciesRxnIdxPtr, bc.speciesRxnIdx.length).set(bc.speciesRxnIdx);
    m.HEAPF64.set(bc.speciesStoich, speciesStoichPtr >> 3);
    m.HEAPF64.set(bc.speciesVolumes, speciesVolsPtr >> 3);

    if (hasJac) {
      new Int32Array(m.HEAPF64.buffer, jacRowPtrPtr, bc.nSpecies + 1).set(bc.jacRowPtr!);
      new Int32Array(m.HEAPF64.buffer, jacColIdxPtr, bc.jacColIdx!.length).set(bc.jacColIdx!);
      new Int32Array(m.HEAPF64.buffer, jacContribOffsetsPtr, bc.jacContribOffsets!.length).set(bc.jacContribOffsets!);
      new Int32Array(m.HEAPF64.buffer, jacContribRxnIdxPtr, bc.jacContribRxnIdx!.length).set(bc.jacContribRxnIdx!);
      m.HEAPF64.set(bc.jacContribCoeffs!, jacContribCoeffsPtr >> 3);
    }

    new Int32Array(m.HEAPF64.buffer, obsOffsetsPtr, bc.nObservables + 1).set(bc.obsOffsets);
    new Int32Array(m.HEAPF64.buffer, obsSpeciesIdxPtr, bc.obsSpeciesIdx.length).set(bc.obsSpeciesIdx);
    m.HEAPF64.set(bc.obsCoeffs, obsCoeffsPtr >> 3);
    new Int32Array(m.HEAPF64.buffer, exprBytecodeOffsetsPtr, bc.nReactions + 1).set(bc.exprBytecodeOffsets);
    new Uint8Array(m.HEAPF64.buffer, exprBytecodePtr, bc.exprBytecode.length).set(bc.exprBytecode);
    m.HEAPF64.set(bc.exprConstants, exprConstantsPtr >> 3);


    const handle = loadNetwork(
      bc.nReactions, bc.nSpecies,
      rateConstPtr, nReactantsPtr, reactantOffsetsPtr, reactantIdxPtr, reactantStoichPtr,
      scalingVolsPtr, speciesOffsetsPtr, speciesRxnIdxPtr, speciesStoichPtr, speciesVolsPtr,
      jacRowPtrPtr, jacColIdxPtr, jacContribOffsetsPtr, jacContribRxnIdxPtr, jacContribCoeffsPtr,
      bc.nObservables, obsOffsetsPtr, obsSpeciesIdxPtr, obsCoeffsPtr,
      exprBytecodeOffsetsPtr, exprBytecodePtr, exprConstantsPtr
    );

    // Free temp pointers (C side copies to its own arrays)
    [rateConstPtr, nReactantsPtr, reactantOffsetsPtr, reactantIdxPtr, reactantStoichPtr, scalingVolsPtr, speciesOffsetsPtr, speciesRxnIdxPtr, speciesStoichPtr, speciesVolsPtr, jacRowPtrPtr, jacColIdxPtr, jacContribOffsetsPtr, jacContribRxnIdxPtr, jacContribCoeffsPtr, obsOffsetsPtr, obsSpeciesIdxPtr, obsCoeffsPtr, exprBytecodeOffsetsPtr, exprBytecodePtr, exprConstantsPtr].forEach(p => p && m._free(p));

    if (!handle) {
      console.warn('[CVODESolver] Failed to load native bytecode network handle; falling back to JS RHS callback.');
      return false;
    }

    // Bytecode path requires bind_network support to attach the loaded network to solver memory.
    // Older checked-in loader builds can expose load/unload but not bind_network.
    if (!bindNetwork) {
      console.warn('[CVODESolver] Native bytecode network loaded but bind_network export is unavailable; falling back to JS RHS callback.');
      if (unloadNetwork) unloadNetwork(handle);
      return false;
    }

    this.networkHandle = handle;
    return true;
  }

  updateRateConstants(newRates: Float64Array): void {
    const m = CVODESolver.module;
    if (!m || !this.networkHandle) return;
    const updateRateConstants = m._cvode_update_rate_constants ?? m._update_rate_constants;
    if (!updateRateConstants) return;

    const ptr = m._malloc(newRates.length * 8);
    if (!ptr) return;
    m.HEAPF64.set(newRates, ptr >> 3);
    updateRateConstants(this.networkHandle, ptr, newRates.length);
    m._free(ptr);
  }

  private ensureInitialized(y0: Float64Array, t0: number): { success: true } | { success: false; errorMessage: string } {
    const m = CVODESolver.module;
    if (!m) return { success: false as const, errorMessage: 'CVODE WASM not loaded' };

    const neq = this.n;
    const { rtol } = this.options;
    // Apply per-species absolute tolerance scaling when concentrations span wide ranges.
    // This is a TypeScript-layer heuristic since CVodeSVtolerances is not yet exposed in WASM.
    const atol = CVODESolver.computeScaledAtol(y0, this.options.atol);

    // If we have an active solver, verify we're continuing from the expected state.
    if (this.solverMem) {
      const tTol = 1e-12 * Math.max(1, Math.abs(this.currentT), Math.abs(t0));
      const tMatches = Number.isFinite(this.currentT) && Math.abs(t0 - this.currentT) <= tTol;
      if (tMatches) {
        // Verify the caller-provided y0 matches current internal state.
        const heap = m.HEAPF64;
        const heapY = heap.subarray(this.yPtr >> 3, (this.yPtr >> 3) + neq);
        let maxAbsDelta = 0;
        let maxAbsY = 0;
        for (let i = 0; i < neq; i++) {
          const yi = heapY[i];
          const d = Math.abs(y0[i] - yi);
          if (d > maxAbsDelta) maxAbsDelta = d;
          const ay = Math.abs(yi);
          if (ay > maxAbsY) maxAbsY = ay;
        }
        // If state differs, reinitialize from provided y0/t0.
        const yTol = 1e-14 * Math.max(1, maxAbsY);
        if (maxAbsDelta <= yTol) {
          return { success: true as const };
        }
      }

      // Not continuing cleanly: reset the solver.
      this.destroy();
    }

    // Try bytecode path first if available
    let bcLoaded = false;
    const disableBytecode = (this.options as any).disableNativeBytecode === true;
    if (this.networkByteCode && !disableBytecode && (m._cvode_load_network || m._load_network)) {
      bcLoaded = this.uploadNetworkByteCode(this.networkByteCode);
    }

    // Always set JS callback for safety; native bytecode path bypasses it once bound.
    // This prevents stale callback usage when loader exports differ across builds.
    m.derivativeCallback = (_t: number, yPtr: number, ydotPtr: number) => {
      const buf = m.HEAPF64.buffer;
      if (!this.yView || !this.dydtView || this.cachedDerivBuffer !== buf || this.cachedYPtr !== yPtr || this.cachedYdotPtr !== ydotPtr) {
        this.cachedDerivBuffer = buf;
        this.cachedYPtr = yPtr;
        this.cachedYdotPtr = ydotPtr;
        this.yView = new Float64Array(buf, yPtr, neq);
        this.dydtView = new Float64Array(buf, ydotPtr, neq);
      }
      this.f(this.yView, this.dydtView);
    };

    if (!bcLoaded) {
      // No native bytecode binding available; JS callback path is active.
    } else {
      console.log('[CVODESolver] Using native WASM bytecode RHS (no JS callback crossings)');
    }

    if (this.options.rootFunction && this.options.numRoots) {
      const nroots = this.options.numRoots;
      m.rootCallback = (t: number, yPtr: number, goutPtr: number) => {
        const buf = m.HEAPF64.buffer;
        if (!this.gYView || !this.gOutView || this.cachedGOutBuffer !== buf || this.cachedYPtr !== yPtr || this.cachedGOutPtr !== goutPtr) {
          this.cachedGOutBuffer = buf;
          this.cachedYPtr = yPtr;
          this.cachedGOutPtr = goutPtr;
          this.gYView = new Float64Array(buf, yPtr, neq);
          this.gOutView = new Float64Array(buf, goutPtr, nroots);
        }
        this.options.rootFunction!(t, this.gYView, this.gOutView);
      };
    }

    // Allocate memory for state and t_reached.
    this.yPtr = m._malloc(neq * 8);
    if (!this.yPtr) return { success: false, errorMessage: 'CVODE malloc failed for yPtr' };
    this.tretPtr = m._malloc(8);
    if (!this.tretPtr) {
      m._free(this.yPtr);
      this.yPtr = 0;
      return { success: false as const, errorMessage: 'CVODE malloc failed for tretPtr' };
    }

    if (this.options.numRoots) {
      this.rootsFoundPtr = m._malloc(this.options.numRoots * 4); // CVODE uses int* for rootsfound
    }

    this.yOut = new Float64Array(y0.length);

    // Copy initial state into WASM memory.
    m.HEAPF64.set(y0, this.yPtr >> 3);

    // Initialize solver.
    let solverMem: number;
    const hasNativeSparseJacobian = this.useSparse && !!(
      this.networkByteCode?.jacRowPtr &&
      this.networkByteCode?.jacColIdx &&
      this.networkByteCode?.jacContribOffsets &&
      this.networkByteCode?.jacContribRxnIdx &&
      this.networkByteCode?.jacContribCoeffs
    );
    if (this.jacobian && m._init_solver_jac) {
      m.jacobianCallback = (_t: number, yPtr: number, _fyPtr: number, JPtr: number, neqVal: number) => {
        const buf = m.HEAPF64.buffer;
        if (!this.jacYView || !this.jacJView || this.cachedJacBuffer !== buf || this.cachedJacYPtr !== yPtr || this.cachedJPtr !== JPtr) {
          this.cachedJacBuffer = buf;
          this.cachedJacYPtr = yPtr;
          this.cachedJPtr = JPtr;
          this.jacYView = new Float64Array(buf, yPtr, neqVal);
          this.jacJView = new Float64Array(buf, JPtr, neqVal * neqVal);
        }
        this.jacobian!(this.jacYView, this.jacJView);
      };
      solverMem = m._init_solver_jac(neq, t0, this.yPtr, rtol, atol, this.options.maxSteps);
    } else if (this.useAdams && m._init_solver_adams) {
      // Adams-Moulton for non-stiff systems (requires WASM rebuild to activate)
      solverMem = m._init_solver_adams(neq, t0, this.yPtr, rtol, atol, this.options.maxSteps);
    } else if (this.useSparse || hasNativeSparseJacobian) {
      solverMem = m._init_solver_sparse(neq, t0, this.yPtr, rtol, atol, this.options.maxSteps);
    } else {
      solverMem = m._init_solver(neq, t0, this.yPtr, rtol, atol, this.options.maxSteps);
    }

    if (solverMem && this.options.numRoots && m._init_roots) {
      m._init_roots(solverMem, this.options.numRoots);
    }

    if (!solverMem) {
      m._free(this.yPtr);
      m._free(this.tretPtr);
      this.yPtr = 0;
      this.tretPtr = 0;
      return { success: false as const, errorMessage: 'CVODE initialization failed' };
    }

    const bindNetwork = m._cvode_bind_network ?? m._bind_network;
    const unloadNetwork = m._cvode_unload_network ?? m._unload_network;
    if (this.networkHandle && bindNetwork) {
      try {
        bindNetwork(solverMem, this.networkHandle);
      } catch (e) {
        console.warn('[CVODESolver] Failed to bind native network to solver; using JS RHS callback.', e);
        if (unloadNetwork) unloadNetwork(this.networkHandle);
        this.networkHandle = 0;
      }
    }

    this.solverMem = solverMem;
    this.currentT = t0;

    // Optional: initial/max step configuration (bindings may not exist)
    if (this.options.initialStep && this.options.initialStep > 0) {
      // @ts-ignore
      if (typeof (m as any)._set_init_step === 'function') {
        // @ts-ignore
        (m as any)._set_init_step(this.solverMem, this.options.initialStep);
        console.log(`[CVODESolver] Set initial step size to ${this.options.initialStep}`);
      }
    }

    if (this.options.maxStep > 0 && this.options.maxStep < Infinity) {
      // @ts-ignore
      if (typeof (m as any)._set_max_step === 'function') {
        // @ts-ignore
        (m as any)._set_max_step(this.solverMem, this.options.maxStep);
      }
    }

    // Advanced Stiff Solver Options
    if (this.options.stabLimDet !== undefined) {
      // @ts-ignore
      if (typeof (m as any)._set_stab_lim_det === 'function') {
        // @ts-ignore
        (m as any)._set_stab_lim_det(this.solverMem, this.options.stabLimDet ? 1 : 0);
      }
    }

    if (this.options.maxOrd !== undefined) {
      // @ts-ignore
      if (typeof (m as any)._set_max_ord === 'function') {
        // @ts-ignore
        (m as any)._set_max_ord(this.solverMem, this.options.maxOrd);
      }
    }

    if (this.options.maxNonlinIters !== undefined) {
      // @ts-ignore
      if (typeof (m as any)._set_max_nonlin_iters === 'function') {
        // @ts-ignore
        (m as any)._set_max_nonlin_iters(this.solverMem, this.options.maxNonlinIters);
      }
    }

    if (this.options.nonlinConvCoef !== undefined) {
      // @ts-ignore
      if (typeof (m as any)._set_nonlin_conv_coef === 'function') {
        // @ts-ignore
        (m as any)._set_nonlin_conv_coef(this.solverMem, this.options.nonlinConvCoef);
      }
    }

    if (this.options.maxErrTestFails !== undefined) {
      // @ts-ignore
      if (typeof (m as any)._set_max_err_test_fails === 'function') {
        // @ts-ignore
        (m as any)._set_max_err_test_fails(this.solverMem, this.options.maxErrTestFails);
      }
    }

    if (this.options.maxConvFails !== undefined) {
      // @ts-ignore
      if (typeof (m as any)._set_max_conv_fails === 'function') {
        // @ts-ignore
        (m as any)._set_max_conv_fails(this.solverMem, this.options.maxConvFails);
      }
    }

    return { success: true as const };
  }

  integrate(
    y0: Float64Array,
    t0: number,
    tEnd: number,
    checkCancelled?: () => void
  ): SolverResult {
    const m = CVODESolver.module;
    if (!m) {
      return { success: false, t: t0, y: y0, steps: 0, errorMessage: "CVODE WASM not loaded" };
    }

    const init = this.ensureInitialized(y0, t0);
    if (!init.success) {
      const msg = ('errorMessage' in init) ? init.errorMessage : 'CVODE initialization failed';
      return { success: false, t: t0, y: y0, steps: 0, errorMessage: msg };
    }

    const neq = this.n;
    const yOut = this.yOut ?? new Float64Array(y0);

    let t = this.currentT;
    let steps = 0;
    const INITIAL_MXSTEP = 2000;
    const maxMxstep = Math.max(INITIAL_MXSTEP, this.options.maxSteps ?? 5_000_000);
    let mxstep = INITIAL_MXSTEP;
    let stuckCount = 0;
    let lastT = t;

    const solverMem = this.solverMem!;
    const yPtr = this.yPtr;
    const tretPtr = this.tretPtr;

    try {
      if (m._set_max_num_steps) {
        m._set_max_num_steps(solverMem, mxstep);
      }

      while (true) {
        if (checkCancelled) checkCancelled();

        const flag = m._solve_step(solverMem, tEnd, tretPtr);
        const currentHeap = m.HEAPF64;
        t = currentHeap[tretPtr >> 3];
        steps++;

        const tTol = Math.max(this.options.minStep, 1e-15 * Math.max(1, Math.abs(lastT), Math.abs(t)));
        if (Math.abs(t - lastT) <= tTol && t < tEnd - tTol) {
          stuckCount++;
          if (stuckCount >= 10) {
            m._get_y(solverMem, yPtr);
            yOut.set(currentHeap.subarray(yPtr >> 3, (yPtr >> 3) + neq));
            this.currentT = t;
            return { success: false, t, y: yOut, steps, errorMessage: 'CVODE appears stuck (no meaningful time advance)' };
          }
        } else {
          stuckCount = 0;
        }
        lastT = t;

        if (flag === 2) {
          m._get_y(solverMem, yPtr);
          yOut.set(currentHeap.subarray(yPtr >> 3, (yPtr >> 3) + neq));
          const stateError = this.validateCvodeState(yOut, t);
          if (stateError) {
            this.currentT = t;
            return { success: false, t, y: yOut, steps, errorMessage: stateError };
          }
          this.currentT = t;
          return { success: true, t, y: yOut, steps, errorMessage: 'ROOT_FOUND' };
        }

        if (flag === 0 || flag === 1) {
          break;
        }

        if (flag === -1) {
          mxstep *= 2;
          if (mxstep > maxMxstep) {
            m._get_y(solverMem, yPtr);
            yOut.set(currentHeap.subarray(yPtr >> 3, (yPtr >> 3) + neq));
            this.currentT = t;
            return { success: false, t, y: yOut, steps, errorMessage: `CVODE exceeded max mxstep escalation (${maxMxstep})` };
          }
          if (m._set_max_num_steps) {
            m._set_max_num_steps(solverMem, mxstep);
          }
          continue;
        }

        m._get_y(solverMem, yPtr);
        yOut.set(currentHeap.subarray(yPtr >> 3, (yPtr >> 3) + neq));
        const stateError = this.validateCvodeState(yOut, t);
        if (stateError) {
          this.currentT = t;
          return { success: false, t, y: yOut, steps, errorMessage: stateError };
        }
        this.currentT = t;

        let errorMessage = `CVODE failed with flag ${flag}`;
        if (flag === -4 && this.useAdams) {
          console.warn('ODE Solver: CVODE Adams-Moulton FixedPoint iteration failed to converge (flag -4). Stiff system detected.');
          errorMessage = 'STIFF_DETECTED';
        }

        return { success: false, t, y: yOut, steps, errorMessage };
      }

      const currentHeap = m.HEAPF64;
      m._get_y(solverMem, yPtr);
      yOut.set(currentHeap.subarray(yPtr >> 3, (yPtr >> 3) + neq));
      const stateError = this.validateCvodeState(yOut, t);
      if (stateError) {
        this.currentT = t;
        return { success: false, t, y: yOut, steps, errorMessage: stateError };
      }

      this.currentT = t;

      return { success: true, t, y: yOut, steps };

    } catch (e) {
      return { success: false, t, y: yOut, steps, errorMessage: `CVODE error: ${e}` };
    } finally {
      // Intentionally do not destroy solver here.
      // We keep CVODE state across successive integrate() calls to match BNG2 behavior.
    }
  }
}
