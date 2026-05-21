/**
 * DifferentiableSolver.ts -- Sensitivity analysis via CVODES (forward/adjoint)
 * with automatic fallback to finite-difference when the WASM module is unavailable.
 *
 * Provides forward sensitivity, adjoint gradient, and parameter-estimation
 * gradient (sum-of-squared-residuals) computations.
 *
 * When the CVODE WASM module is available and has been compiled with CVODES
 * support (sens_init_forward etc.), this module uses exact forward sensitivities
 * at ~2-3x the cost of a single ODE solve. Otherwise it falls back to central
 * finite differences (N+1 solves per parameter).
 */

// ── Interfaces ──────────────────────────────────────────────────────

export interface SensitivityConfig {
  nSpecies: number;
  nParameters: number;
  parameterNames: string[];
  parameterValues: Float64Array;
  rhsFn: (t: number, y: Float64Array, dydt: Float64Array) => void;
  jacobianFn?: (y: Float64Array, J: Float64Array) => void;
  initialState: Float64Array;
  tSpan: [number, number];
  nOutputPoints: number;
  tolerances?: { rtol: number; atol: number };
}

export interface SensitivityResult {
  /** Time points */
  time: Float64Array;
  /** State trajectory: [timePoint][species] */
  states: Float64Array[];
  /** Forward sensitivities: [timePoint][parameter][species] = dy_j/dp_i at time t */
  sensitivities: Float64Array[][];
  /** Method used */
  method: 'cvodes_forward' | 'cvodes_adjoint' | 'finite_difference';
  /** Computation time in ms */
  computeTimeMs: number;
}

export interface GradientResult {
  /** Gradient of objective w.r.t. parameters: dL/dp */
  gradient: Float64Array;
  /** Objective value */
  objectiveValue: number;
  /** Method used */
  method: 'adjoint' | 'forward' | 'finite_difference';
}

// ── CVODES WASM module interface ────────────────────────────────────

/**
 * Interface for the CVODE WASM module with CVODES sensitivity extensions.
 * These functions map 1:1 to the C exports in cvode_wrapper.c.
 */
interface CVodeSensModule {
  _sens_init_forward(neq: number, Ns: number, t0: number,
    y0Ptr: number, pPtr: number,
    rtol: number, atol: number, maxSteps: number): number;
  _sens_solve_step(mem: number, tout: number, tretPtr: number): number;
  _sens_get_y(mem: number, destPtr: number): void;
  _sens_get_s(mem: number, is: number, destPtr: number): void;
  _sens_get_all(mem: number, destPtr: number): void;
  _sens_destroy(mem: number): void;
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPF64: Float64Array;
}

/** Cached reference to the CVODE WASM module (set externally). */
let cvodesModule: CVodeSensModule | null = null;

/**
 * Register the CVODE WASM module for use by the sensitivity solver.
 * Called by ODESolver or application init code after loading the WASM.
 * The module must have been compiled with CVODES support (sens_* exports).
 */
export function setCVodeSensModule(mod: unknown): void {
  // Verify the module has sensitivity exports
  const m = mod as Record<string, unknown>;
  if (m && typeof m._sens_init_forward === 'function') {
    cvodesModule = mod as CVodeSensModule;
  }
}

/** Clear the cached CVODES module reference. */
export function resetCVodeSensModule(): void {
  cvodesModule = null;
}

/** Check if CVODES WASM sensitivity is available. */
function getCvodesModule(): CVodeSensModule | null {
  if (cvodesModule) return cvodesModule;
  // Also check globalThis for backward compatibility
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    if (g.__CVODES_WASM && typeof g.__CVODES_WASM._sens_init_forward === 'function') {
      cvodesModule = g.__CVODES_WASM as CVodeSensModule;
      return cvodesModule;
    }
  } catch {
    // not available
  }
  return null;
}

// ── Simple RK4 integrator used by the finite-difference fallback ────

function integrateRK4(
  rhsFn: (t: number, y: Float64Array, dydt: Float64Array) => void,
  y0: Float64Array,
  tSpan: [number, number],
  nPoints: number,
): { time: Float64Array; states: Float64Array[] } {
  const nSpecies = y0.length;
  const dt = (tSpan[1] - tSpan[0]) / nPoints;
  const time = new Float64Array(nPoints + 1);
  const states: Float64Array[] = [];

  let y = new Float64Array(y0);
  time[0] = tSpan[0];
  states.push(new Float64Array(y));

  const k1 = new Float64Array(nSpecies);
  const k2 = new Float64Array(nSpecies);
  const k3 = new Float64Array(nSpecies);
  const k4 = new Float64Array(nSpecies);
  const tmp = new Float64Array(nSpecies);

  for (let i = 0; i < nPoints; i++) {
    const t = tSpan[0] + i * dt;

    // k1
    rhsFn(t, y, k1);

    // k2
    for (let s = 0; s < nSpecies; s++) tmp[s] = y[s] + 0.5 * dt * k1[s];
    rhsFn(t + 0.5 * dt, tmp, k2);

    // k3
    for (let s = 0; s < nSpecies; s++) tmp[s] = y[s] + 0.5 * dt * k2[s];
    rhsFn(t + 0.5 * dt, tmp, k3);

    // k4
    for (let s = 0; s < nSpecies; s++) tmp[s] = y[s] + dt * k3[s];
    rhsFn(t + dt, tmp, k4);

    const yNext = new Float64Array(nSpecies);
    for (let s = 0; s < nSpecies; s++) {
      yNext[s] = y[s] + (dt / 6) * (k1[s] + 2 * k2[s] + 2 * k3[s] + k4[s]);
    }

    y = yNext;
    time[i + 1] = t + dt;
    states.push(new Float64Array(y));
  }

  return { time, states };
}

// ── CVODES WASM forward sensitivity integration ─────────────────────

/**
 * Run forward sensitivity analysis using the CVODES WASM module.
 * Returns null if WASM is not available or fails.
 */
function cvodesForwardSensitivity(config: SensitivityConfig): SensitivityResult | null {
  const mod = getCvodesModule();
  if (!mod) return null;

  const { nSpecies, nParameters, parameterValues, initialState, tSpan, nOutputPoints } = config;
  const rtol = config.tolerances?.rtol ?? 1e-8;
  const atol = config.tolerances?.atol ?? 1e-10;
  const nPts = nOutputPoints;

  // Allocate WASM heap memory
  const y0Ptr = mod._malloc(nSpecies * 8);
  const pPtr = mod._malloc(nParameters * 8);
  const yOutPtr = mod._malloc(nSpecies * 8);
  const sOutPtr = mod._malloc(nParameters * nSpecies * 8);
  const tretPtr = mod._malloc(8);

  if (!y0Ptr || !pPtr || !yOutPtr || !sOutPtr || !tretPtr) {
    [y0Ptr, pPtr, yOutPtr, sOutPtr, tretPtr].forEach(p => { if (p) mod._free(p); });
    return null;
  }

  try {
    // Copy initial state and parameters to WASM heap
    mod.HEAPF64.set(initialState, y0Ptr >> 3);
    mod.HEAPF64.set(parameterValues, pPtr >> 3);

    // Initialize CVODES forward sensitivity solver
    const sensMem = mod._sens_init_forward(
      nSpecies, nParameters, tSpan[0],
      y0Ptr, pPtr,
      rtol, atol, 10000
    );
    if (!sensMem) return null;

    try {
      // Output storage
      const time = new Float64Array(nPts + 1);
      const states: Float64Array[] = [];
      const sensitivities: Float64Array[][] = [];

      // Record initial state (t=0, sensitivity = 0)
      time[0] = tSpan[0];
      states.push(new Float64Array(initialState));
      const initSens: Float64Array[] = [];
      for (let p = 0; p < nParameters; p++) {
        initSens.push(new Float64Array(nSpecies)); // all zeros
      }
      sensitivities.push(initSens);

      // Integrate to each output time point
      const dt = (tSpan[1] - tSpan[0]) / nPts;
      for (let i = 1; i <= nPts; i++) {
        const tout = tSpan[0] + i * dt;
        const flag = mod._sens_solve_step(sensMem, tout, tretPtr);
        if (flag < 0) {
          // Solver failed — fall back to finite difference
          return null;
        }

        // Read achieved time
        time[i] = mod.HEAPF64[tretPtr >> 3];

        // Read state
        mod._sens_get_y(sensMem, yOutPtr);
        const yArr = new Float64Array(nSpecies);
        yArr.set(mod.HEAPF64.subarray(yOutPtr >> 3, (yOutPtr >> 3) + nSpecies));
        states.push(yArr);

        // Read all sensitivities at this time point
        mod._sens_get_all(sensMem, sOutPtr);
        const timeSens: Float64Array[] = [];
        for (let p = 0; p < nParameters; p++) {
          const sArr = new Float64Array(nSpecies);
          const offset = (sOutPtr >> 3) + p * nSpecies;
          sArr.set(mod.HEAPF64.subarray(offset, offset + nSpecies));
          timeSens.push(sArr);
        }
        sensitivities.push(timeSens);
      }

      return { time, states, sensitivities, method: 'cvodes_forward', computeTimeMs: 0 };
    } finally {
      mod._sens_destroy(sensMem);
    }
  } finally {
    mod._free(y0Ptr);
    mod._free(pPtr);
    mod._free(yOutPtr);
    mod._free(sOutPtr);
    mod._free(tretPtr);
  }
}

// ── Forward sensitivity ─────────────────────────────────────────────

/**
 * Compute forward sensitivities dy_j/dp_i at every output time point.
 *
 * Tries CVODES WASM first (exact, ~2-3x cost of one solve);
 * falls back to central finite differences (2*N+1 solves).
 */
export function forwardSensitivity(config: SensitivityConfig): SensitivityResult {
  const start = performance.now();

  // ── Try CVODES WASM (exact forward sensitivity) ──
  const wasmResult = cvodesForwardSensitivity(config);
  if (wasmResult) {
    wasmResult.computeTimeMs = performance.now() - start;
    return wasmResult;
  }

  // ── Finite-difference fallback (central differences) ──
  const { nSpecies, nParameters, parameterValues, initialState, tSpan, nOutputPoints, rhsFn } = config;
  const nPts = nOutputPoints;

  // Base simulation
  const base = integrateRK4(rhsFn, initialState, tSpan, nPts);

  // Sensitivities: [timePoint][parameter] -> Float64Array(nSpecies)
  const sensitivities: Float64Array[][] = [];
  for (let t = 0; t <= nPts; t++) {
    sensitivities.push(new Array(nParameters));
    for (let p = 0; p < nParameters; p++) {
      sensitivities[t][p] = new Float64Array(nSpecies);
    }
  }

  for (let pi = 0; pi < nParameters; pi++) {
    const pVal = parameterValues[pi];
    const h = Math.max(1e-8, Math.abs(pVal) * 1e-6);

    // Forward perturbed simulation
    const paramsPlus = new Float64Array(parameterValues);
    paramsPlus[pi] = pVal + h;
    const rhsPlus = buildPerturbedRhs(rhsFn, parameterValues, paramsPlus, pi);
    const simPlus = integrateRK4(rhsPlus, initialState, tSpan, nPts);

    // Backward perturbed simulation
    const paramsMinus = new Float64Array(parameterValues);
    paramsMinus[pi] = pVal - h;
    const rhsMinus = buildPerturbedRhs(rhsFn, parameterValues, paramsMinus, pi);
    const simMinus = integrateRK4(rhsMinus, initialState, tSpan, nPts);

    // Central difference: dy_j/dp_i ≈ (y_j(p+h) - y_j(p-h)) / (2h)
    for (let t = 0; t <= nPts; t++) {
      for (let s = 0; s < nSpecies; s++) {
        sensitivities[t][pi][s] = (simPlus.states[t][s] - simMinus.states[t][s]) / (2 * h);
      }
    }
  }

  return {
    time: base.time,
    states: base.states,
    sensitivities,
    method: 'finite_difference',
    computeTimeMs: performance.now() - start,
  };
}

/**
 * Build a perturbed RHS function.
 *
 * The user-supplied rhsFn implicitly depends on the parameter vector.  We need
 * a way to re-run the RHS with a different parameter value.  The convention is
 * that rhsFn closes over a mutable parameter array -- we temporarily patch that
 * array, call rhsFn, and restore.
 *
 * However, since rhsFn is a black-box, we provide a simpler mechanism: the
 * perturbed RHS is built by the caller who captures `config.parameterValues`.
 * Here we just swap the value in the shared array for the duration of the call.
 */
function buildPerturbedRhs(
  rhsFn: (t: number, y: Float64Array, dydt: Float64Array) => void,
  originalParams: Float64Array,
  perturbedParams: Float64Array,
  _paramIndex: number,
): (t: number, y: Float64Array, dydt: Float64Array) => void {
  return (t: number, y: Float64Array, dydt: Float64Array) => {
    // Temporarily patch the shared parameter array (try/finally for safety)
    const saved = new Float64Array(originalParams);
    originalParams.set(perturbedParams);
    try {
      rhsFn(t, y, dydt);
    } finally {
      originalParams.set(saved);
    }
  };
}

// ── Adjoint sensitivity (gradient of scalar objective) ──────────────

/**
 * Compute the gradient of a scalar objective function with respect to parameters
 * using the adjoint method (CVODES) or finite-difference fallback.
 */
export function adjointSensitivity(
  config: SensitivityConfig,
  objectiveFn: (states: Float64Array[], time: Float64Array) => { value: number; dLdy: Float64Array[] },
): GradientResult {
  // ── Use forward sensitivities + chain rule as a fast alternative ──
  // When CVODES forward sensitivity is available, we can compute the gradient
  // via: dL/dp_i = sum_t (dL/dy(t))^T * (dy(t)/dp_i) which is exact.
  const sensResult = forwardSensitivity(config);
  if (sensResult.method === 'cvodes_forward') {
    const obj = objectiveFn(sensResult.states, sensResult.time);
    const gradient = new Float64Array(config.nParameters);
    for (let t = 0; t < sensResult.time.length; t++) {
      const dLdy = obj.dLdy[t];
      if (!dLdy) continue;
      for (let pi = 0; pi < config.nParameters; pi++) {
        const dyDp = sensResult.sensitivities[t][pi];
        for (let s = 0; s < config.nSpecies; s++) {
          gradient[pi] += dLdy[s] * dyDp[s];
        }
      }
    }
    return { gradient, objectiveValue: obj.value, method: 'forward' };
  }

  // ── Finite-difference gradient fallback ──
  const { nParameters, parameterValues, rhsFn, initialState, tSpan, nOutputPoints } = config;

  // Base simulation & objective
  const baseSim = integrateRK4(rhsFn, initialState, tSpan, nOutputPoints);
  const baseObj = objectiveFn(baseSim.states, baseSim.time);

  const gradient = new Float64Array(nParameters);

  for (let pi = 0; pi < nParameters; pi++) {
    const pVal = parameterValues[pi];
    const h = Math.max(1e-8, Math.abs(pVal) * 1e-6);

    // Forward perturbation
    const paramsPlus = new Float64Array(parameterValues);
    paramsPlus[pi] = pVal + h;
    const rhsPlus = buildPerturbedRhs(rhsFn, parameterValues, paramsPlus, pi);
    const simPlus = integrateRK4(rhsPlus, initialState, tSpan, nOutputPoints);
    const objPlus = objectiveFn(simPlus.states, simPlus.time);

    // Backward perturbation
    const paramsMinus = new Float64Array(parameterValues);
    paramsMinus[pi] = pVal - h;
    const rhsMinus = buildPerturbedRhs(rhsFn, parameterValues, paramsMinus, pi);
    const simMinus = integrateRK4(rhsMinus, initialState, tSpan, nOutputPoints);
    const objMinus = objectiveFn(simMinus.states, simMinus.time);

    gradient[pi] = (objPlus.value - objMinus.value) / (2 * h);
  }

  return {
    gradient,
    objectiveValue: baseObj.value,
    method: 'finite_difference',
  };
}

// ── SSR gradient for parameter estimation ───────────────────────────

/**
 * Compute gradient of sum-of-squared-residuals objective for parameter estimation.
 *
 * SSR = sum_t sum_obs (y_obs(t) - data_obs(t))^2
 * dSSR/dp_i = 2 * sum_t sum_obs (y_obs(t) - data_obs(t)) * dy_obs/dp_i(t)
 */
export function computeObjectiveGradient(
  config: SensitivityConfig,
  experimentalData: Float64Array[],
  observableIndices: number[],
): GradientResult {
  // Use forward sensitivities to compute the gradient analytically
  const sensResult = forwardSensitivity(config);
  const { time, states, sensitivities } = sensResult;
  const nTime = time.length;
  const nParams = config.nParameters;

  // Compute SSR and its gradient
  let ssr = 0;
  const gradient = new Float64Array(nParams);

  for (let t = 0; t < nTime; t++) {
    for (let oi = 0; oi < observableIndices.length; oi++) {
      const obsIdx = observableIndices[oi];
      const residual = states[t][obsIdx] - (experimentalData[t]?.[oi] ?? 0);
      ssr += residual * residual;

      for (let pi = 0; pi < nParams; pi++) {
        gradient[pi] += 2 * residual * sensitivities[t][pi][obsIdx];
      }
    }
  }

  return {
    gradient,
    objectiveValue: ssr,
    method: sensResult.method === 'cvodes_forward' ? 'forward' : 'finite_difference',
  };
}
