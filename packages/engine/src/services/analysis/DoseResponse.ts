/**
 * DoseResponse.ts -- Dose-response steady-state analysis.
 *
 * Traces steady-state observable values as a function of an input parameter.
 * Fits a Hill equation (n, EC50, baseline, maximum) via Nelder-Mead
 * optimization.  Optionally detects bifurcation points (saddle-node or Hopf)
 * by monitoring eigenvalue sign changes between successive dose steps.
 *
 * Algorithm:
 *   1. Generate dose points (log or linear scale).
 *   2. For each dose, clone the parameter map, update the input parameter,
 *      rebuild the RHS, and find the steady state using Newton-Raphson
 *      (warm-started from the previous dose).
 *   3. Evaluate observables at each steady state.
 *   4. Fit Hill equation to each observable curve via Nelder-Mead.
 *   5. Optionally detect bifurcations from eigenvalue sign changes.
 */

import { findSteadyState } from "./SteadyStateFinder";
import type { SteadyStateConfig, SteadyState } from "./SteadyStateFinder";
import type { BNGLModel, BNGLReaction, BNGLSpecies } from "../../types";
import { buildOdeSystem } from "../simulation/SimulationLoop";
import { forkPreparedModel, updatePreparedModel } from "../../utils/preparedModel";
import { buildStoichiometryMatrix } from "../../utils/stoichiometry";

// ── Public interfaces ──────────────────────────────────────────────

export interface DoseResponseConfig {
  model: BNGLModel;
  reactions: BNGLReaction[];
  species: BNGLSpecies[];
  /** Name of the parameter to vary (must exist in model.parameters). */
  inputParameter: string;
  /** Range of values for the input parameter. */
  inputRange: { min: number; max: number };
  /** Number of dose points (default 50). */
  nPoints?: number;
  /** Use logarithmic spacing (default true). */
  logScale?: boolean;
  /** Observable names to track. */
  observables: string[];
  /** Steady-state method: 'rootfind' (Newton) or 'simulate' (default 'rootfind'). */
  method?: "simulate" | "rootfind";
  /** End time for simulation method (default 1e4). */
  t_end?: number;
  /** Newton convergence tolerance (default 1e-6). */
  tolerance?: number;
  /** Detect bifurcation points (default false). */
  detectBifurcations?: boolean;
  /** Original source seed expressions, captured before network expansion. */
  seedExpressions?: Map<string, string>;
}

export interface HillFit {
  /** Hill coefficient. */
  n: number;
  /** Half-maximal effective concentration. */
  ec50: number;
  /** Baseline response (low dose). */
  baseline: number;
  /** Maximum response (high dose). */
  maximum: number;
  /** Coefficient of determination. */
  r2: number;
}

export interface DoseResponseCurve {
  observable: string;
  doses: number[];
  responses: number[];
  hillFit?: HillFit;
  bifurcationPoints?: Array<{
    dose: number;
    type: "saddle-node" | "hopf";
    response: number;
  }>;
}

export interface DoseResponseResult {
  inputParameter: string;
  curves: DoseResponseCurve[];
  failedDoses: number[];
  fallbackUsed?: string;
  warning?: string;
  methodUsed?: string;
  summary?: any;
}

// ── Internal helpers ───────────────────────────────────────────────

/**
 * Build a species-name-to-index map.
 */
function buildSpeciesIndex(species: BNGLSpecies[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < species.length; i++) {
    map.set(species[i].name, i);
  }
  return map;
}

/** Build an orthonormal basis for the reaction subspace, removing conserved directions. */
function buildStoichiometricBasis(species: BNGLSpecies[], reactions: BNGLReaction[]): number[][] {
  const speciesIndex = buildSpeciesIndex(species);
  const matrix = buildStoichiometryMatrix(reactions, species.length, (name) => speciesIndex.get(name));
  const basis: number[][] = [];
  for (let reaction = 0; reaction < reactions.length; reaction++) {
    const vector = matrix.map((row) => row[reaction]);
    for (const axis of basis) {
      let projection = 0;
      for (let i = 0; i < vector.length; i++) projection += vector[i] * axis[i];
      for (let i = 0; i < vector.length; i++) vector[i] -= projection * axis[i];
    }
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (norm <= 1e-10) continue;
    basis.push(vector.map((value) => value / norm));
  }
  return basis;
}

/**
 * Generate dose points in log or linear scale.
 */
export function generateDosePoints(
  min: number,
  max: number,
  nPoints: number,
  logScale: boolean,
): number[] {
  const doses = new Array<number>(nPoints);
  if (logScale && min > 0 && max > 0) {
    const logMin = Math.log(min);
    const logMax = Math.log(max);
    for (let i = 0; i < nPoints; i++) {
      const frac = nPoints > 1 ? i / (nPoints - 1) : 0;
      doses[i] = Math.exp(logMin + frac * (logMax - logMin));
    }
  } else {
    for (let i = 0; i < nPoints; i++) {
      const frac = nPoints > 1 ? i / (nPoints - 1) : 0;
      doses[i] = min + frac * (max - min);
    }
  }
  return doses;
}

/**
 * Resolve an observable name to an index in the species array, or return
 * speciesIndices/coefficients if attached to the model observable.
 */
interface ObservableMapping {
  speciesIndices: number[];
  coefficients: number[];
}

function resolveObservable(
  obsName: string,
  model: BNGLModel,
  species: BNGLSpecies[],
): ObservableMapping | null {
  // 1. Check model.concreteObservables (if pre-computed during network generation)
  const concreteObs = model.concreteObservables;
  if (Array.isArray(concreteObs)) {
    for (let i = 0; i < concreteObs.length; i++) {
      const co = concreteObs[i];
      if (co && co.name === obsName) {
        const indices = co.indices;
        if (Array.isArray(indices) && Array.isArray(co.coefficients)) {
          return {
            speciesIndices: indices,
            coefficients: co.coefficients,
          };
        }
      }
    }
  }

  // 2. Check model.observables for speciesIndices/indices and coefficients
  let modelObs: typeof model.observables[0] | undefined;
  if (Array.isArray(model.observables)) {
    for (let i = 0; i < model.observables.length; i++) {
      if (model.observables[i].name === obsName) {
        modelObs = model.observables[i];
        break;
      }
    }
  }
  if (modelObs) {
    const obs = modelObs as unknown as Record<string, unknown>;
    const indices = obs["speciesIndices"] ?? obs["indices"];
    if (
      Array.isArray(indices) &&
      Array.isArray(obs["coefficients"])
    ) {
      return {
        speciesIndices: indices as number[],
        coefficients: obs["coefficients"] as number[],
      };
    }
  }

  // 3. Fall back: match observable pattern to species name if modelObs exists
  const speciesIdx = buildSpeciesIndex(species);
  if (modelObs && typeof modelObs.pattern === "string") {
    const idx = speciesIdx.get(modelObs.pattern);
    if (idx !== undefined) {
      return { speciesIndices: [idx], coefficients: [1] };
    }
  }

  // 4. Fall back: match observable name directly to species name.
  const idx = speciesIdx.get(obsName);
  if (idx !== undefined) {
    return { speciesIndices: [idx], coefficients: [1] };
  }

  return null;
}

/**
 * Evaluate an observable from species concentrations.
 */
function evaluateObservable(
  y: Float64Array,
  mapping: ObservableMapping,
): number {
  let value = 0;
  for (let k = 0; k < mapping.speciesIndices.length; k++) {
    value += mapping.coefficients[k] * y[mapping.speciesIndices[k]];
  }
  return value;
}

/**
 * Detect bifurcation points between successive dose steps by monitoring
 * eigenvalue real parts.  A saddle-node bifurcation occurs when a real
 * eigenvalue crosses zero.  A Hopf bifurcation occurs when a complex-
 * conjugate pair has its real part cross zero while the imaginary part
 * is non-zero.
 */
function detectBifurcationPoints(
  doses: number[],
  steadyStates: Array<SteadyState | null>,
  observableMapping: ObservableMapping,
): Array<{ dose: number; type: "saddle-node" | "hopf"; response: number }> {
  const bifurcations: Array<{
    dose: number;
    type: "saddle-node" | "hopf";
    response: number;
  }> = [];

  for (let i = 1; i < doses.length; i++) {
    const prev = steadyStates[i - 1];
    const curr = steadyStates[i];
    if (!prev || !curr) continue;
    if (!prev.eigenvalues.length || !curr.eigenvalues.length) continue;

    // Check stability change.
    if (prev.stable !== curr.stable) {
      // Determine type: check if crossing eigenvalue has imaginary part.
      let isHopf = false;
      for (let e = 0; e < curr.eigenvalues.length; e++) {
        if (e < prev.eigenvalues.length) {
          const prevReal = prev.eigenvalues[e].real;
          const currReal = curr.eigenvalues[e].real;
          if (prevReal * currReal < 0) {
            // Sign change detected.
            const imagMag = Math.abs(curr.eigenvalues[e].imag);
            if (imagMag > 1e-6) {
              isHopf = true;
            }
            break;
          }
        }
      }

      const interpDose = (doses[i - 1] + doses[i]) / 2;
      const response = evaluateObservable(curr.y, observableMapping);

      bifurcations.push({
        dose: interpDose,
        type: isHopf ? "hopf" : "saddle-node",
        response,
      });
    }
  }

  return bifurcations;
}

// ── Main entry point ───────────────────────────────────────────────

/**
 * Compute dose-response curves for the given observables by sweeping
 * the input parameter across the specified range and finding the
 * steady state at each dose.
 */
import { simulate } from "../simulation/SimulationLoop";
import { clearAllEvaluatorCaches } from "../simulation/ExpressionEvaluator";
function cloneExpandedModel(model: BNGLModel): BNGLModel {
  return forkPreparedModel(model);
}

/**
 * Re-evaluates and updates concrete rate constants for mass-action reactions in-place.
 *
 * This function iterates over all reactions in the model and identifies those that do not
 * represent a functional rate law (`!reaction.isFunctionalRate`) but have symbolic string
 * rate expressions. For each matching reaction, it evaluates the rate expression using the
 * model's current parameter and function definitions. If the evaluation succeeds and yields
 * a finite numeric value, the reaction's concrete `rateConstant` is updated in-place.
 *
 * If evaluation of a rate fails for any reason, the function handles the error silently
 * and preserves the reaction's existing `rateConstant`.
 *
 * At the end of execution, all evaluator caches are cleared to ensure subsequent simulations
 * and analyses do not use outdated rate-constant values.
 *
 * @param model - The parsed `BNGLModel` whose reaction rates should be updated.
 * @returns `void` (The model is mutated in-place).
 *
 * @remarks
 * - Invariant: This is a core engine function and must remain entirely free of browser-specific APIs
 *   (e.g., DOM, window, or framework-specific objects).
 * - Invariant: To prevent duplicate logic, all Model Context Protocol (MCP) tool handlers in
 *   `packages/mcp-server` that re-evaluate parameters must call this engine function instead
 *   of implementing parameter evaluation inline.
 */
export function updateMassActionRates(model: BNGLModel): void {
    updatePreparedModel(model, {}, { mutate: true, refreshInitialState: false });
    clearAllEvaluatorCaches();
}

export async function computeDoseResponseBySimulation(
    expandedModel: any,
    inputParameter: string,
    observables: string[],
    inputMin: number,
    inputMax: number,
    nPoints: number,
    logScale: boolean,
    tEnd: number,
    seedExpressions: Map<string, string> = new Map(),
): Promise<{ curves: Array<{ observable: string; doses: number[]; responses: number[] }>; failedDoses: number[] }> {
    const doses = generateDosePoints(inputMin, inputMax, nPoints, logScale);
    const failedDoses: number[] = [];
    const responsesByObservable = new Map<string, number[]>();
    const successfulDoses: number[] = [];

    observables.forEach((obs) => {
        responsesByObservable.set(obs, []);
    });

    const runModel = cloneExpandedModel(expandedModel);

    const simOptions = {
        method: 'ode',
        t_end: tEnd,
        n_steps: 200,
        solver: 'auto',
        includeSpeciesData: false,
        includeExpandedNetwork: false,
    } as any;

    for (const dose of doses) {
        try {
            updatePreparedModel(runModel, { [inputParameter]: dose }, { mutate: true, seedExpressions });

            const simResult = await simulate(0, runModel, simOptions, {
                checkCancelled: () => { },
                postMessage: () => { },
            });

            const finalRow = simResult.data?.[simResult.data.length - 1];
            if (!finalRow) {
                failedDoses.push(dose);
                continue;
            }

            const values = observables.map((obs) => Number(finalRow[obs]));
            if (values.some((value) => !Number.isFinite(value))) {
                failedDoses.push(dose);
                continue;
            }

            successfulDoses.push(dose);
            observables.forEach((obs, index) => {
                responsesByObservable.get(obs)!.push(values[index]);
            });
        } catch {
            failedDoses.push(dose);
        }
    }

    return {
        curves: observables.map((obs) => ({
            observable: obs,
            doses: successfulDoses,
            responses: responsesByObservable.get(obs) ?? [],
        })),
        failedDoses,
    };
}

export async function computeDoseResponse(
  config: DoseResponseConfig,
): Promise<DoseResponseResult> {
    const {
    model,
    reactions,
    species,
    inputParameter,
    inputRange,
    nPoints = 50,
    logScale = true,
    observables,
    tolerance = 1e-6,
    detectBifurcations: detectBif = false,
    seedExpressions = new Map<string, string>(),
  } = config;

  const fullModel: BNGLModel = {
    ...model,
    reactions: reactions ?? model.reactions ?? [],
    species: species ?? model.species ?? [],
  };

  const n = species.length;
  const stoichiometricBasis = buildStoichiometricBasis(species, reactions);

  if (config.method === 'simulate') {
    const tEnd = config.t_end ?? 1e4;
    const simulated = await computeDoseResponseBySimulation(
        fullModel,
        inputParameter,
        observables,
        inputRange.min,
        inputRange.max,
        nPoints,
        logScale,
        tEnd,
        seedExpressions,
    );
    return {
        inputParameter,
        methodUsed: 'simulate',
        failedDoses: simulated.failedDoses,
        summary: {
            nCurves: simulated.curves.length,
            nFailed: simulated.failedDoses.length,
            nFitted: 0,
            nBifurcationPoints: 0,
        },
        curves: simulated.curves,
    } as DoseResponseResult;
  }
  // Prepare the simulator's exact RHS once. Parameter updates refresh the
  // same mass-action JIT and functional-rate context used by simulation.
  const preparedModel = cloneExpandedModel(fullModel);
  const odeSystem = await buildOdeSystem(preparedModel, { solver: 'auto' });

  // Generate dose points.
  const doses = generateDosePoints(
    inputRange.min,
    inputRange.max,
    nPoints,
    logScale,
  );

  // Resolve observable mappings.
  const obsMappings: Array<{ name: string; mapping: ObservableMapping }> = [];
  for (const obsName of observables) {
    const mapping = resolveObservable(obsName, model, species);
    if (mapping) {
      obsMappings.push({ name: obsName, mapping });
    }
  }

  // Storage for results per observable.
  const responseArrays: Map<string, number[]> = new Map();
  const doseArrays: Map<string, number[]> = new Map();
  for (const obs of obsMappings) {
    responseArrays.set(obs.name, []);
    doseArrays.set(obs.name, []);
  }

  const failedDoses: number[] = [];
  const steadyStates: Array<SteadyState | null> = [];

  // Sweep through each dose.
  for (let d = 0; d < doses.length; d++) {
    const dose = doses[d];

    // Re-evaluate all source seed expressions for each dose. This updates
    // initial pools and conserved totals as well as the parameter table.
    updatePreparedModel(preparedModel, { [inputParameter]: dose }, { mutate: true, seedExpressions });
    const params: Record<string, number> = { ...preparedModel.parameters };
    odeSystem.updateParameters?.(params);

    const doseInitialState = new Float64Array(n);
    const preparedSpeciesByName = buildSpeciesIndex(preparedModel.species ?? []);
    for (let i = 0; i < n; i++) {
      const preparedIndex = preparedSpeciesByName.get(odeSystem.speciesNames[i]);
      doseInitialState[i] = preparedIndex === undefined
        ? odeSystem.y0[i]
        : preparedModel.species![preparedIndex].initialConcentration;
    }

    try {
      let ss: SteadyState;
      if (stoichiometricBasis.length === 0) {
        ss = { y: doseInitialState, stable: false, converged: true, eigenvalues: [], parameterValue: dose };
      } else {
        const reducedRhs = (coordinates: Float64Array, derivative: Float64Array): void => {
          const state = new Float64Array(doseInitialState);
          for (let axis = 0; axis < stoichiometricBasis.length; axis++) {
            const amount = coordinates[axis];
            for (let i = 0; i < n; i++) state[i] += stoichiometricBasis[axis][i] * amount;
          }
          const fullDerivative = new Float64Array(n);
          odeSystem.rhs(state, fullDerivative);
          for (let axis = 0; axis < stoichiometricBasis.length; axis++) {
            let projection = 0;
            for (let i = 0; i < n; i++) projection += stoichiometricBasis[axis][i] * fullDerivative[i];
            derivative[axis] = projection;
          }
        };
        const reducedConfig: SteadyStateConfig = {
          nSpecies: stoichiometricBasis.length,
          parameters: params,
          rhsFn: reducedRhs,
          tolerance,
          maxIterations: 500,
          enforceNonnegative: false,
          isStateValid: (coordinates) => {
            const state = new Float64Array(doseInitialState);
            for (let axis = 0; axis < stoichiometricBasis.length; axis++) {
              for (let i = 0; i < n; i++) state[i] += stoichiometricBasis[axis][i] * coordinates[axis];
            }
            return state.every((value) => value >= -1e-10);
          },
        };
        const reduced = findSteadyState(reducedConfig, new Float64Array(stoichiometricBasis.length));
        const state = new Float64Array(doseInitialState);
        for (let axis = 0; axis < stoichiometricBasis.length; axis++) {
          for (let i = 0; i < n; i++) state[i] += stoichiometricBasis[axis][i] * reduced.y[axis];
        }
        ss = { ...reduced, y: state, parameterValue: dose };
      }

      if (ss.converged) {
        steadyStates.push(ss);

        // Evaluate each observable.
        for (const obs of obsMappings) {
          const value = evaluateObservable(ss.y, obs.mapping);
          responseArrays.get(obs.name)!.push(value);
          doseArrays.get(obs.name)!.push(dose);
        }
      } else {
        failedDoses.push(dose);
        steadyStates.push(null);
      }
    } catch {
      failedDoses.push(dose);
      steadyStates.push(null);
    }
  }

  // Build curves (Hill fitting is async, so we build the result
  // synchronously and attach Hill fits later via an internal wrapper).
  const curves: DoseResponseCurve[] = [];

  for (const obs of obsMappings) {
    const curveDoses = doseArrays.get(obs.name)!;
    const curveResponses = responseArrays.get(obs.name)!;

    const curve: DoseResponseCurve = {
      observable: obs.name,
      doses: curveDoses,
      responses: curveResponses,
    };

    // Detect bifurcation points if requested.
    if (detectBif) {
      curve.bifurcationPoints = detectBifurcationPoints(
        doses,
        steadyStates,
        obs.mapping,
      );
    }

    curves.push(curve);
  }

  for (const curve of curves) {
    if (curve.doses.length >= 4) {
      curve.hillFit = fitHillEquationSync(curve.doses, curve.responses);
    }
  }

  const totalRootfindPoints = curves.reduce((acc, curve) => acc + curve.responses.length, 0);
  if (totalRootfindPoints === 0) {
      const simulated = await computeDoseResponseBySimulation(
          fullModel,
          inputParameter,
          observables,
          inputRange.min,
          inputRange.max,
          nPoints,
          logScale,
          config.t_end ?? 1e4,
          seedExpressions,
      );

      return {
          inputParameter,
          methodUsed: 'simulate',
          fallbackUsed: 'rootfind_to_simulate',
          warning: 'Root-finding produced no curve points; returned simulation-based fallback curves instead.',
          failedDoses: simulated.failedDoses,
          summary: {
              nCurves: simulated.curves.length,
              nFailed: simulated.failedDoses.length,
              nFitted: 0,
              nBifurcationPoints: 0,
          },
          curves: simulated.curves,
      } as DoseResponseResult;
  }

  return {
    inputParameter,
    methodUsed: 'rootfind',
    summary: {
        nCurves: curves.length,
        nFailed: failedDoses.length,
        nFitted: curves.filter((c) => c.hillFit !== undefined).length,
        nBifurcationPoints: curves.reduce(
            (acc, c) => acc + (c.bifurcationPoints?.length ?? 0),
            0,
        ),
    },
    curves,
    failedDoses,
  } as DoseResponseResult;
}

// ── Synchronous Hill fit (no dependency on async nelderMead) ────────

/**
 * Synchronous Hill equation fit using a simple iterative Nelder-Mead
 * implemented inline (avoids the async wrapper).
 */
function fitHillEquationSync(doses: number[], responses: number[]): HillFit {
  const nData = doses.length;
  if (nData < 2) {
    return { n: 1, ec50: 1, baseline: 0, maximum: 0, r2: 0 };
  }

  const { baseline0, maximum0, ec50Guess } = getInitialHillGuesses(
    doses,
    responses,
    nData,
  );

  const x0 = [1, ec50Guess, baseline0, maximum0];
  const objective = createHillObjective(doses, responses, nData);

  const bestX = nelderMeadSync(objective, x0);

  const fittedN = bestX[0];
  const fittedEC50 = Math.abs(bestX[1]);
  const fittedBaseline = bestX[2];
  const fittedMaximum = bestX[3];

  const r2 = calculateHillR2(
    fittedN,
    fittedEC50,
    fittedBaseline,
    fittedMaximum,
    doses,
    responses,
    nData,
  );

  return {
    n: fittedN,
    ec50: fittedEC50,
    baseline: fittedBaseline,
    maximum: fittedMaximum,
    r2,
  };
}

function getInitialHillGuesses(
  doses: number[],
  responses: number[],
  nData: number,
) {
  const baseline0 = responses[0];
  const maximum0 = responses[nData - 1];
  const halfMax = (baseline0 + maximum0) / 2;

  let ec50Guess = (doses[0] + doses[nData - 1]) / 2;
  let minDist = Infinity;
  for (let i = 0; i < nData; i++) {
    const dist = Math.abs(responses[i] - halfMax);
    if (dist < minDist) {
      minDist = dist;
      ec50Guess = doses[i];
    }
  }
  if (ec50Guess <= 0) ec50Guess = 1;

  return { baseline0, maximum0, ec50Guess };
}

function createHillObjective(
  doses: number[],
  responses: number[],
  nData: number,
) {
  return function objective(x: number[]): number {
    const hillN = x[0];
    const hillEC50 = Math.abs(x[1]);
    const hillBaseline = x[2];
    const hillMaximum = x[3];

    let sse = 0;
    for (let i = 0; i < nData; i++) {
      const d = doses[i];
      const dN = Math.pow(Math.max(d, 0), hillN);
      const ec50N = Math.pow(Math.max(hillEC50, 1e-30), hillN);
      const predicted =
        hillBaseline + ((hillMaximum - hillBaseline) * dN) / (ec50N + dN);
      const residual = responses[i] - predicted;
      sse += residual * residual;
    }
    return sse;
  };
}

function calculateHillR2(
  fittedN: number,
  fittedEC50: number,
  fittedBaseline: number,
  fittedMaximum: number,
  doses: number[],
  responses: number[],
  nData: number,
) {
  let mean = 0;
  for (let i = 0; i < nData; i++) mean += responses[i];
  mean /= nData;

  let sst = 0;
  let sse = 0;
  for (let i = 0; i < nData; i++) {
    sst += (responses[i] - mean) * (responses[i] - mean);
    const d = doses[i];
    const dN = Math.pow(Math.max(d, 0), fittedN);
    const ec50N = Math.pow(Math.max(fittedEC50, 1e-30), fittedN);
    const predicted =
      fittedBaseline + ((fittedMaximum - fittedBaseline) * dN) / (ec50N + dN);
    const residual = responses[i] - predicted;
    sse += residual * residual;
  }

  return sst > 1e-30 ? 1 - sse / sst : 0;
}

function nelderMeadSync(
  objective: (x: number[]) => number,
  x0: number[],
  dim: number = 4,
  maxIter: number = 5000,
  ftol: number = 1e-10,
) {
  // Build initial simplex.
  const simplex: number[][] = Array.from({ length: dim + 1 }, () => [...x0]);
  for (let i = 0; i < dim; i++) {
    const step = Math.abs(x0[i]) > 1e-10 ? 0.1 * Math.abs(x0[i]) : 0.1;
    simplex[i + 1][i] += step;
  }

  const fVal = new Float64Array(dim + 1);
  for (let i = 0; i <= dim; i++) {
    fVal[i] = objective(simplex[i]);
  }

  const ALPHA = 1.0;
  const GAMMA = 2.0;
  const RHO = 0.5;
  const SIGMA = 0.5;

  for (let iter = 0; iter < maxIter; iter++) {
    // Sort by function value.
    const order = Array.from({ length: dim + 1 }, (_, i) => i).sort(
      (a, b) => fVal[a] - fVal[b],
    );
    const tmpS = simplex.map((v) => [...v]);
    const tmpF = Float64Array.from(fVal);
    for (let i = 0; i <= dim; i++) {
      for (let j = 0; j < dim; j++) simplex[i][j] = tmpS[order[i]][j];
      fVal[i] = tmpF[order[i]];
    }

    // Convergence check.
    if (fVal[dim] - fVal[0] < ftol) break;

    // Centroid of all except worst.
    const centroid = new Array<number>(dim).fill(0);
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) centroid[j] += simplex[i][j];
    }
    for (let j = 0; j < dim; j++) centroid[j] /= dim;

    // Reflection.
    const xr = new Array<number>(dim);
    for (let j = 0; j < dim; j++)
      xr[j] = centroid[j] + ALPHA * (centroid[j] - simplex[dim][j]);
    const fr = objective(xr);

    if (fr < fVal[0]) {
      // Expansion.
      const xe = new Array<number>(dim);
      for (let j = 0; j < dim; j++)
        xe[j] = centroid[j] + GAMMA * (xr[j] - centroid[j]);
      const fe = objective(xe);
      if (fe < fr) {
        simplex[dim] = xe;
        fVal[dim] = fe;
      } else {
        simplex[dim] = xr;
        fVal[dim] = fr;
      }
    } else if (fr < fVal[dim - 1]) {
      simplex[dim] = xr;
      fVal[dim] = fr;
    } else {
      if (fr < fVal[dim]) {
        // Outside contraction.
        const xc = new Array<number>(dim);
        for (let j = 0; j < dim; j++)
          xc[j] = centroid[j] + RHO * (xr[j] - centroid[j]);
        const fc = objective(xc);
        if (fc <= fr) {
          simplex[dim] = xc;
          fVal[dim] = fc;
        } else {
          // Shrink.
          for (let i = 1; i <= dim; i++) {
            for (let j = 0; j < dim; j++)
              simplex[i][j] =
                simplex[0][j] + SIGMA * (simplex[i][j] - simplex[0][j]);
            fVal[i] = objective(simplex[i]);
          }
        }
      } else {
        // Inside contraction.
        const xc = new Array<number>(dim);
        for (let j = 0; j < dim; j++)
          xc[j] = centroid[j] - RHO * (centroid[j] - simplex[dim][j]);
        const fc = objective(xc);
        if (fc < fVal[dim]) {
          simplex[dim] = xc;
          fVal[dim] = fc;
        } else {
          // Shrink.
          for (let i = 1; i <= dim; i++) {
            for (let j = 0; j < dim; j++)
              simplex[i][j] =
                simplex[0][j] + SIGMA * (simplex[i][j] - simplex[0][j]);
            fVal[i] = objective(simplex[i]);
          }
        }
      }
    }
  }

  // Find best.
  let bestIdx = 0;
  for (let i = 1; i <= dim; i++) {
    if (fVal[i] < fVal[bestIdx]) bestIdx = i;
  }

  return simplex[bestIdx];
}
