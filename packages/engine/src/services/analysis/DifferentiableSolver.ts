/**
 * DifferentiableSolver.ts -- Sensitivity analysis via CVODES (forward/adjoint)
 * with automatic fallback to finite-difference when the WASM module is unavailable.
 *
 * Provides forward sensitivity, adjoint gradient, and parameter-estimation
 * gradient (sum-of-squared-residuals) computations.
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

// ── CVODES WASM availability check ──────────────────────────────────

let cvodesModule: unknown = null;

/** Attempt to load the CVODES WASM module if it exists. */
function getCvodesModule(): unknown {
  if (cvodesModule !== null) return cvodesModule;
  try {
    // The CVODES WASM module would be provided at runtime via globalThis
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    if (g.__CVODES_WASM && typeof g.__CVODES_WASM.forwardSensitivity === 'function') {
      cvodesModule = g.__CVODES_WASM;
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

// ── Forward sensitivity ─────────────────────────────────────────────

/**
 * Compute forward sensitivities dy_j/dp_i at every output time point.
 *
 * Tries CVODES WASM first; falls back to central finite differences.
 */
export function forwardSensitivity(config: SensitivityConfig): SensitivityResult {
  const start = performance.now();

  // ── Try CVODES ──
  const wasm = getCvodesModule();
  if (wasm) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = wasm as any;
      const raw = w.forwardSensitivity({
        nSpecies: config.nSpecies,
        nParameters: config.nParameters,
        parameterValues: config.parameterValues,
        initialState: config.initialState,
        tSpan: config.tSpan,
        nOutputPoints: config.nOutputPoints,
        rtol: config.tolerances?.rtol ?? 1e-8,
        atol: config.tolerances?.atol ?? 1e-10,
      });
      return {
        time: raw.time,
        states: raw.states,
        sensitivities: raw.sensitivities,
        method: 'cvodes_forward',
        computeTimeMs: performance.now() - start,
      };
    } catch {
      // fall through to finite difference
    }
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
  // ── Try CVODES adjoint ──
  const wasm = getCvodesModule();
  if (wasm) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = wasm as any;
      // Run forward simulation first to get states
      const fwd = w.forwardSimulation({
        nSpecies: config.nSpecies,
        nParameters: config.nParameters,
        parameterValues: config.parameterValues,
        initialState: config.initialState,
        tSpan: config.tSpan,
        nOutputPoints: config.nOutputPoints,
        rtol: config.tolerances?.rtol ?? 1e-8,
        atol: config.tolerances?.atol ?? 1e-10,
      });
      const obj = objectiveFn(fwd.states, fwd.time);
      const raw = w.adjointSensitivity({
        states: fwd.states,
        time: fwd.time,
        dLdy: obj.dLdy,
        parameterValues: config.parameterValues,
        rtol: config.tolerances?.rtol ?? 1e-8,
        atol: config.tolerances?.atol ?? 1e-10,
      });
      return {
        gradient: raw.gradient,
        objectiveValue: obj.value,
        method: 'adjoint',
      };
    } catch {
      // fall through
    }
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
