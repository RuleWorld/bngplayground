/**
 * ContinuationWithConservation.ts -- Pseudo-arclength continuation with
 * conserved-moiety system reduction, steady-state seeding, and automatic
 * reconstruction of full-dimension state vectors.
 *
 * This is the canonical entry point for bifurcation analysis.  Callers
 * (UI, MCP handler, tests) should use this instead of manually inlining
 * the reduction pipeline.
 */

import { continuation, type ContinuationConfig, type ContinuationResult, type ContinuationPoint, type BifurcationPoint } from './Continuation';
import { findSteadyState } from './SteadyStateFinder';
import {
  detectConservedMoieties,
  computeConservationConstants,
  reduceSystem,
  type ReactionEntry,
} from './ConservedMoietyDetector';
import { JITCompiler } from './JITCompiler';
import type { BNGLModel, BNGLSpecies, BNGLReaction } from '../../types';

export interface RunBifurcationAnalysisConfig {
  model: BNGLModel;
  expandedModel: BNGLModel;
  parameter: string;
  startValue?: number;
  endValue?: number;
  maxSteps?: number;
}

export interface RunBifurcationAnalysisResult {
  bifurcations: Array<{
    parameterValue: number;
    type: string;
    frequency?: number;
    criticalEigenvalues?: Array<{ re?: number; im?: number; real?: number; imag?: number }>;
  }>;
  totalPoints: number;
  stablePoints: number;
  unstablePoints: number;
  technical: string;
  biological: string;
  strategic: string;
}

export interface ConservedContinuationConfig {
  /** Number of species in the full (unreduced) system */
  nSpecies: number;
  /** Reactions for conserved-moiety detection. Engine `Rxn` is structurally compatible. */
  reactions: ReactionEntry[];
  /** Full-system RHS: f(y, p) -> dydt, length nSpecies */
  rhsFn: (y: Float64Array, p: number, dydt: Float64Array) => void;
  /** Optional: update the compiled evaluator's parameter map before each RHS eval */
  updateParams?: (p: number) => void;
  /** Raw initial concentration vector, length nSpecies */
  initialGuess: Float64Array;
  /** Continuation parameter start value */
  parameterStart: number;
  /** Continuation parameter end value */
  parameterEnd: number;
  /** Step size in arclength units (default: range / maxSteps) */
  stepSize?: number;
  /** Maximum continuation steps (default: 500) */
  maxSteps?: number;
  /** If true (default), seed continuation from findSteadyState at parameterStart */
  seedFromSteadyState?: boolean;
  /** If true, skip conserved-moiety reduction and run full-system continuation */
  skipReduction?: boolean;
  /** Newton tolerance for steady-state finder (default 1e-9) */
  steadyStateTolerance?: number;
  /**
   * Optional: given a parameter value p, return updated conservation constants
   * (one per moiety).  When provided, the reduced RHS recomputes dependent
   * species using these constants instead of the seed-derived ones.  Use this
   * when the continuation parameter changes a conserved pool total.
   * Return null (or omit) to fall back to the seed-derived constants for that step.
   */
  conservationConstantsAt?: (p: number) => number[] | null;
}

export interface ConservedContinuationResult extends ContinuationResult {
  /** Whether findSteadyState converged at parameterStart */
  seedConverged: boolean;
  /** Whether conserved-moiety reduction was applied */
  reduced: boolean;
  /** Number of species in the full system (always nSpecies, for convenience) */
  nSpecies: number;
}

/**
 * Run pseudo-arclength continuation with steady-state seeding, conserved-moiety
 * reduction, and full-dimension path reconstruction.
 *
 * The returned path always has y vectors of length `cfg.nSpecies` regardless
 * of whether reduction was applied.
 */
export function continuationWithConservation(
  cfg: ConservedContinuationConfig,
): ConservedContinuationResult {
  const {
    nSpecies,
    reactions,
    rhsFn,
    updateParams,
    initialGuess,
    parameterStart,
    parameterEnd,
    steadyStateTolerance = 1e-9,
  } = cfg;

  const stepSize = cfg.stepSize ?? (parameterEnd - parameterStart) / (cfg.maxSteps ?? 500);
  const maxSteps = cfg.maxSteps ?? 500;
  const seedFromSS = cfg.seedFromSteadyState !== false;

  // Step 1: seed steady state
  let seedState: Float64Array;
  let seedConverged = false;

  if (seedFromSS) {
    if (updateParams) updateParams(parameterStart);
    const ss = findSteadyState(
      {
        nSpecies,
        parameters: {},
        rhsFn: (y: Float64Array, dydt: Float64Array) => rhsFn(y, parameterStart, dydt),
        tolerance: steadyStateTolerance,
      },
      initialGuess,
    );
    seedState = ss.converged ? ss.y : initialGuess;
    seedConverged = ss.converged;
  } else {
    seedState = initialGuess;
  }

  // Step 2: conserved-moiety reduction (unless skipped)
  if (cfg.skipReduction) {
    const result = continuation({
      nSpecies,
      rhsFn,
      initialState: seedState,
      parameterStart,
      parameterEnd,
      stepSize,
      maxSteps,
    });
    return {
      ...result,
      seedConverged,
      reduced: false,
      nSpecies,
    };
  }

  const moieties = detectConservedMoieties(reactions, nSpecies);
  const y0 = Array.from(seedState);
  computeConservationConstants(moieties, y0);
  const reducedInfo = reduceSystem(reactions, nSpecies, y0, moieties);

  const isReduced = reducedInfo.reducedSize < nSpecies;

  if (!isReduced) {
    // No reduction possible — run full-system continuation
    const result = continuation({
      nSpecies,
      rhsFn,
      initialState: seedState,
      parameterStart,
      parameterEnd,
      stepSize,
      maxSteps,
    });
    return {
      ...result,
      seedConverged,
      reduced: false,
      nSpecies,
    };
  }

  // Build reduced RHS
  const reducedSeed = new Float64Array(reducedInfo.reducedSize);
  for (let i = 0; i < reducedInfo.reducedSize; i++) {
    reducedSeed[i] = seedState[reducedInfo.independentSpecies[i]];
  }

  const hasConservationAt = typeof cfg.conservationConstantsAt === 'function';

  const reducedRhs = (yReduced: Float64Array, p: number, dydtReduced: Float64Array) => {
    if (updateParams) updateParams(p);

    // Recompute conservation constants if the parameter affects conserved totals
    if (hasConservationAt) {
      const updated = cfg.conservationConstantsAt!(p);
      if (updated) {
        for (let i = 0; i < moieties.length && i < updated.length; i++) {
          moieties[i].constant = updated[i];
        }
      }
    }

    const fullState = new Float64Array(reducedInfo.reconstruct(Array.from(yReduced)));
    const fullDydt = new Float64Array(nSpecies);
    rhsFn(fullState, p, fullDydt);
    for (let i = 0; i < reducedInfo.reducedSize; i++) {
      dydtReduced[i] = fullDydt[reducedInfo.independentSpecies[i]];
    }
  };

  const rawResult = continuation({
    nSpecies: reducedInfo.reducedSize,
    rhsFn: reducedRhs,
    initialState: reducedSeed,
    parameterStart,
    parameterEnd,
    stepSize,
    maxSteps,
  });

  // Reconstruct full-dimension path
  const fullPath = rawResult.path.map(pt => ({
    ...pt,
    y: new Float64Array(reducedInfo.reconstruct(Array.from(pt.y))),
  }));

  // Reconstruct bifurcation point states too
  const fullBifurcations = rawResult.bifurcations.map(b => ({
    ...b,
    y: new Float64Array(reducedInfo.reconstruct(Array.from(b.y))),
  }));

  return {
    path: fullPath,
    bifurcations: fullBifurcations,
    completed: rawResult.completed,
    seedConverged,
    reduced: true,
    nSpecies,
  };
}

/**
 * Runs parameter continuation with JIT compilation and conserved-moiety system reduction
 * for bifurcation analysis on parsed/expanded models.
 *
 * This represents the model-level shared engine entry point for bifurcation analysis.
 */
export function runBifurcationAnalysis(
  cfg: RunBifurcationAnalysisConfig,
): RunBifurcationAnalysisResult {
  const { model, expandedModel, parameter: parameterName, startValue, endValue, maxSteps: userMaxSteps } = cfg;

  const nSpecies = expandedModel.species?.length || 0;
  const params = { ...model.parameters };
  const maxSteps = userMaxSteps || 500;
  const parameterStart = startValue ?? 0;
  const parameterEnd = endValue ?? 1;

  if (!parameterName) {
    throw new Error('Bifurcation analysis requires a parameter name.');
  }
  if (!(parameterName in params)) {
    throw new Error(`Unknown continuation parameter: ${parameterName}`);
  }

  const speciesIndexMap = new Map<string, number>(
    (expandedModel.species ?? []).map((species: BNGLSpecies, index: number) => [species.name, index])
  );

  // Build RHS function from expanded model using JIT compiler.
  const jit = new JITCompiler();
  const reactionRules = expandedModel.reactions ?? [];
  const compiled = jit.compileFromRxns(reactionRules as any, nSpecies, speciesIndexMap, params, {
    modelName: model.name ?? 'unnamed-model',
    analysis: 'bifurcation-engine',
    parameterName,
    callsite: 'engine.runBifurcationAnalysis',
  });

  const rhsFn = (y: Float64Array, p: number, dydt: Float64Array) => {
    params[parameterName] = p;
    compiled.updateParameters?.(params);
    compiled.evaluate(0, y, dydt);
  };

  // Build initial state from seed species concentrations
  const initialState = new Float64Array(
    (expandedModel.species ?? []).map(
      (s: BNGLSpecies & { initialAmount?: number }) => s.initialConcentration ?? s.initialAmount ?? 0
    )
  );

  // Build reaction entries for conserved-moiety detection
  const reactionEntries = (expandedModel.reactions ?? []).map((r: BNGLReaction) => ({
    reactants: (r.reactants ?? []).map((name: string) => {
      const idx = speciesIndexMap.get(String(name).trim());
      if (idx === undefined) throw new Error(`Unknown reactant: ${name}`);
      return idx;
    }),
    products: (r.products ?? []).map((name: string) => {
      const idx = speciesIndexMap.get(String(name).trim());
      if (idx === undefined) throw new Error(`Unknown product: ${name}`);
      return idx;
    }),
  }));

  // Run continuation with conserved-moiety reduction
  const result = continuationWithConservation({
    nSpecies,
    reactions: reactionEntries,
    rhsFn,
    updateParams: (p: number) => {
      params[parameterName] = p;
      compiled?.updateParameters?.(params);
    },
    initialGuess: initialState,
    parameterStart,
    parameterEnd,
    stepSize: (parameterEnd - parameterStart) / maxSteps,
    maxSteps,
  });

  // Attribute bifurcations if any found
  const attributions = result.bifurcations.map((b: BifurcationPoint) => ({
    parameterValue: b.parameterValue,
    type: b.type,
    frequency: (b as any).frequency,
    criticalEigenvalues: b.criticalEigenvalues?.slice(0, 3),
  }));

  return {
    bifurcations: attributions,
    totalPoints: result.path.length,
    stablePoints: result.path.filter((p: ContinuationPoint) => p.stable).length,
    unstablePoints: result.path.filter((p: ContinuationPoint) => !p.stable).length,
    technical: `Continuation along ${parameterName} from ${parameterStart} to ${parameterEnd}. Found ${result.bifurcations.length} bifurcation(s).`,
    biological: result.bifurcations.length > 0
      ? `Qualitative behavior changes detected: ${result.bifurcations.map((b: any) => `${b.type} at ${parameterName}=${b.parameterValue.toPrecision(4)}`).join('; ')}.`
      : `No bifurcations detected in the parameter range. The system maintains qualitative stability.`,
    strategic: 'Bifurcation analysis reveals parameter thresholds where the system changes qualitative behavior (oscillation onset, bistability, etc.).',
  };
}
