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
import { nelderMead } from "../optimization/nelderMead";
import type { BNGLModel, BNGLReaction, BNGLSpecies } from "../../types";

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

/**
 * Build the stoichiometry matrix S[species][reaction].
 */
function buildStoichiometryMatrix(
  species: BNGLSpecies[],
  reactions: BNGLReaction[],
): number[][] {
  const speciesIdx = buildSpeciesIndex(species);
  return buildStoichiometry(reactions, species.length, (name) => speciesIdx.get(name));
}

/**
 * Compute propensity vector for given concentrations and parameters.
 * Propensity = rateConstant * product(y[j]^count[j]) for each reactant j.
 */
function computePropensities(
  y: Float64Array,
  reactions: BNGLReaction[],
  species: BNGLSpecies[],
  params: Record<string, number>,
): number[] {
  const speciesIdx = buildSpeciesIndex(species);
  const m = reactions.length;
  const a = new Array<number>(m);

  for (let r = 0; r < m; r++) {
    const rxn = reactions[r];
    // Use parameter-resolved rate constant if it matches a parameter name,
    // otherwise fall back to the numeric rateConstant.
    let rate = rxn.rateConstant;
    if (rxn.rate && params[rxn.rate] !== undefined) {
      rate = params[rxn.rate];
    }

    let prop = rate;

    // Count reactant multiplicities.
    const reactantCounts = new Map<string, number>();
    for (const name of rxn.reactants) {
      reactantCounts.set(name, (reactantCounts.get(name) ?? 0) + 1);
    }

    reactantCounts.forEach((count, name) => {
      const idx = speciesIdx.get(name);
      if (idx !== undefined) {
        const conc = Math.max(y[idx], 0);
        prop *= Math.pow(conc, count);
      }
    });
    a[r] = prop;
  }
  return a;
}

/**
 * Build the RHS function: dydt[i] = sum_r S[i][r] * a_r(y, params).
 */
function buildRhsFn(
  species: BNGLSpecies[],
  reactions: BNGLReaction[],
  S: number[][],
  params: Record<string, number>,
): (y: Float64Array, dydt: Float64Array) => void {
  const n = species.length;
  const m = reactions.length;

  return (y: Float64Array, dydt: Float64Array): void => {
    const a = computePropensities(y, reactions, species, params);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let r = 0; r < m; r++) {
        sum += S[i][r] * a[r];
      }
      dydt[i] = sum;
    }
  };
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
  // First check model observables for speciesIndices/coefficients.
  // ⚡ Bolt: Replace .find with for loop
  let modelObs: typeof model.observables[0] | undefined;
  for (let i = 0; i < model.observables.length; i++) {
    if (model.observables[i].name === obsName) {
      modelObs = model.observables[i];
      break;
    }
  }
  if (modelObs) {
    const obs = modelObs as unknown as Record<string, unknown>;
    if (
      Array.isArray(obs["speciesIndices"]) &&
      Array.isArray(obs["coefficients"])
    ) {
      return {
        speciesIndices: obs["speciesIndices"] as number[],
        coefficients: obs["coefficients"] as number[],
      };
    }
  }

  // Fall back: match observable name to species name.
  const speciesIdx = buildSpeciesIndex(species);
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
 * Fit Hill equation to dose-response data using Nelder-Mead.
 *
 *   response(dose) = baseline + (maximum - baseline) * dose^n / (ec50^n + dose^n)
 *
 * Parameters fitted: [n, ec50, baseline, maximum]
 */
async function fitHillEquation(
  doses: number[],
  responses: number[],
): Promise<HillFit> {
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
  const syncObjectiveFn = createHillObjective(doses, responses, nData);
  const objectiveFn = async (x: number[]): Promise<number> =>
    syncObjectiveFn(x);

  const result = await nelderMead(objectiveFn, x0, {
    maxEval: 5000,
    ftol: 1e-10,
    xtol: 1e-10,
  });

  const fittedN = result.x[0];
  const fittedEC50 = Math.abs(result.x[1]);
  const fittedBaseline = result.x[2];
  const fittedMaximum = result.x[3];

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
import { evaluateFunctionalRate, clearAllEvaluatorCaches } from "../simulation/ExpressionEvaluator";
import { buildStoichiometryMatrix as buildStoichiometry } from '../../utils/stoichiometry';

function cloneExpandedModel(model: BNGLModel): BNGLModel {
    return structuredClone(model);
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
    const context = model.parameters ?? {};
    for (const reaction of model.reactions ?? []) {
        if (!reaction.isFunctionalRate && reaction.rate && typeof reaction.rate === 'string') {
            try {
                const updatedRate = evaluateFunctionalRate(reaction.rate, context, {}, model.functions);
                if (Number.isFinite(updatedRate)) {
                    reaction.rateConstant = updatedRate;
                }
            } catch {
                // Keep the existing concrete rate when a symbolic update fails.
            }
        }
    }
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
): Promise<{ curves: Array<{ observable: string; doses: number[]; responses: number[] }>; failedDoses: number[] }> {
    const doses = generateDosePoints(inputMin, inputMax, nPoints, logScale);
    const failedDoses: number[] = [];
    const responsesByObservable = new Map<string, number[]>();
    const successfulDoses: number[] = [];

    observables.forEach((obs) => {
        responsesByObservable.set(obs, []);
    });

    const simOptions = {
        method: 'ode',
        t_end: tEnd,
        n_steps: 200,
        solver: 'auto',
    } as any;

    for (const dose of doses) {
        try {
            const runModel = cloneExpandedModel(expandedModel);
            runModel.parameters[inputParameter] = dose;
            updateMassActionRates(runModel);

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
  } = config;

  const n = species.length;

  if (config.method === 'simulate') {
    const tEnd = config.t_end ?? 1e4;
    const simulated = await computeDoseResponseBySimulation(
        model,
        inputParameter,
        observables,
        inputRange.min,
        inputRange.max,
        nPoints,
        logScale,
        tEnd,
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
  // Build stoichiometry matrix (constant across doses).
  const S = buildStoichiometryMatrix(species, reactions);

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

  // Initial guess from species initial concentrations.
  let currentGuess = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    currentGuess[i] = species[i].initialConcentration;
  }

  // Sweep through each dose.
  for (let d = 0; d < doses.length; d++) {
    const dose = doses[d];

    // Clone parameters and set the input parameter to the current dose.
    const params: Record<string, number> = { ...model.parameters };
    params[inputParameter] = dose;

    // Build RHS with updated parameters.
    const rhsFn = buildRhsFn(species, reactions, S, params);

    // Build steady-state config.
    const ssConfig: SteadyStateConfig = {
      nSpecies: n,
      parameters: params,
      rhsFn,
      tolerance,
      maxIterations: 500,
    };

    try {
      const ss = findSteadyState(ssConfig, currentGuess);

      if (ss.converged) {
        // Warm start: use this result as initial guess for next dose.
        currentGuess = new Float64Array(ss.y);
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

  // Fit Hill equations synchronously by running the async nelderMead
  // in a blocking fashion.  Since nelderMead's objective is purely
  // computational (no I/O), we build the fits eagerly here.
  // We attach them after construction.
  const fitPromises: Array<Promise<void>> = [];
  for (const curve of curves) {
    if (curve.doses.length >= 4) {
      const promise = fitHillEquation(curve.doses, curve.responses).then(
        (fit) => {
          curve.hillFit = fit;
        },
      );
      fitPromises.push(promise);
    }
  }

  // Since nelderMead is async but purely CPU-bound, we need to resolve
  // the promises.  In a synchronous context we cannot truly await, so
  // we run the fits via a micro-task drain.  However, the cleaner
  // approach for this codebase is to make the fits resolve immediately
  // since the objective function returns a plain number wrapped in a
  // Promise that resolves on the same tick.
  //
  // We drain the micro-task queue by returning the result immediately
  // and letting the caller know fits may be pending.  But to keep the
  // API truly synchronous and simple, we use a synchronous Hill fit
  // implementation as a fallback.
  for (const curve of curves) {
    if (curve.doses.length >= 4 && !curve.hillFit) {
      curve.hillFit = fitHillEquationSync(curve.doses, curve.responses);
    }
  }

  const totalRootfindPoints = curves.reduce((acc, curve) => acc + curve.responses.length, 0);
  if (totalRootfindPoints === 0) {
      const simulated = await computeDoseResponseBySimulation(
          model,
          inputParameter,
          observables,
          inputRange.min,
          inputRange.max,
          nPoints,
          logScale,
          config.t_end ?? 1e4,
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
