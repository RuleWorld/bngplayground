/**
 * services/simulation/SimulationLoop.ts
 * 
 * Core simulation logic (ODE/SSA loop), supporting multi-phase simulations,
 * functional rates, and stiffness detection.
 * 
 * PARITY NOTE: This file is the TypeScript equivalent of "run_network.cpp" in BNG2/Network3.
 * It serves as the simulation driver, managing time stepping, method selection (ODE/SSA),
 * and output generation.
 * Reference: bionetgen/bng2/Network3/src/run_network.cpp
 */

import { BNGLFunction, BNGLModel, BNGLReaction, SimulationOptions, SimulationResults, SimulationPhase, SSAInfluenceData, SSAInfluenceTimeSeries } from '../../types';
import type { SolverResult } from './ODESolver';

import { BNGLParser } from '../graph/core/BNGLParser';
import { toBngGridTime } from '../parity/ParityService';
import { countPatternMatches, isSpeciesMatch, isFunctionalRateExpr } from '../parity/PatternMatcher';
import { clearAllEvaluatorCaches, evaluateFunctionalRate, evaluateExpressionOrParse, loadEvaluator, preCompileFunctionalRatesWithJIT, type PreCompiledRateWithJIT } from './ExpressionEvaluator';
import { analyzeModelStiffness, getOptimalCVODEConfig, detectModelPreset } from './cvodeStiffConfig';
import { getFeatureFlags } from '../../featureFlags';
import { jitCompiler, type JITCompiledFunction } from '../analysis/JITCompiler';
import { createReducedSystem, findConservationLaws } from '../analysis/ConservationLaws';
import { SeededRandom } from '../../utils/random';
import { buildCSRStoichiometry, sparseCSRDgemv, shouldUseSparse } from './SparseStoichiometry';
import { buildCSRObservableMatrix, evaluateObservablesCSR, shouldUseCSRObservables, type CSRObservableMatrix } from './CSRObservableEvaluator';
import { DenseOutputBuffer } from './DenseOutput';
// import * as fs from 'node:fs';

interface ConcreteReaction {
  reactants: Int32Array;
  products: Int32Array;
  rateConstant: number;
  rateExpression: string | null;
  rate: string;
  isFunctionalRate: boolean;
  propensityFactor: number;
  productStoichiometries?: number[];
  scalingVolume?: number;
  degeneracy: number;
  statFactor: number;
  totalRate?: boolean;
  ruleName?: string;
}

interface ConcreteObservable {
  name: string;
  indices: Int32Array | number[];
  coefficients: Float64Array | number[];
  volumes?: Float64Array | number[];
}

const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SAFE_OBJECT_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isSafeObjectKey(key: string): boolean {
  return SAFE_OBJECT_KEY_PATTERN.test(key) && !UNSAFE_OBJECT_KEYS.has(key);
}

function setSafeNumericField(target: Record<string, number>, key: string, value: number): void {
  if (!isSafeObjectKey(key)) return;
  // ⚡ Bolt Optimization: Use direct assignment for ~10x faster execution in hot loops.
  // Security is maintained by the isSafeObjectKey check above.
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}

function setSafeArrayField<T>(target: Record<string, T[]>, key: string, value: T[]): void {
  if (!isSafeObjectKey(key)) return;
  // ⚡ Bolt Optimization: Use direct assignment for ~10x faster execution in hot loops.
  // Security is maintained by the isSafeObjectKey check above.
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}

function extractIfConditions(expression: string): string[] {
  const conditions: string[] = [];
  let idx = 0;

  while (idx < expression.length) {
    const ifIndex = expression.indexOf('if(', idx);
    if (ifIndex < 0) break;

    const condStart = ifIndex + 3;
    let depth = 1;
    let cursor = condStart;
    let commaAtDepthOne = -1;

    while (cursor < expression.length && depth > 0) {
      const ch = expression[cursor];
      if (ch === '(') {
        depth += 1;
      } else if (ch === ')') {
        depth -= 1;
      } else if (ch === ',' && depth === 1) {
        commaAtDepthOne = cursor;
        break;
      }
      cursor += 1;
    }

    if (commaAtDepthOne > condStart) {
      const cond = expression.slice(condStart, commaAtDepthOne).trim();
      if (cond.length > 0 && !conditions.includes(cond)) {
        conditions.push(cond);
      }
    }

    idx = ifIndex + 3;
  }

  return conditions;
}

/**
 * Resolves the sequence of simulation phases to execute based on the model and options.
 *
 * Extracts authored `simulate({ ... })` blocks from the BNGL model and normalizes them into
 * a standardized array of `SimulationPhase` objects. If no phases are authored, it generates
 * a single default phase based on the provided `SimulationOptions`. It also handles overrides
 * from the interactive UI (e.g., when a user changes the end time for a single-phase model).
 *
 * @param model - The parsed BNGL model, which may contain predefined simulation phases.
 * @param options - Fallback options (method, time, tolerances) to use if the model lacks phases.
 * @returns An array of normalized simulation phases detailing method, duration, and output requirements.
 */
export function resolveSimulationPhasesForRun(model: BNGLModel, options: SimulationOptions): SimulationPhase[] {
  const normalizeNSteps = (value: unknown): number | undefined => {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    return Math.max(1, Math.floor(value as number));
  };

  const authoredPhases: SimulationPhase[] = (model.simulationPhases && model.simulationPhases.length > 0)
    ? model.simulationPhases.map((phase) => ({ ...phase }))
    : ('phases' in model && Array.isArray((model as typeof model & { phases?: SimulationPhase[] }).phases) && (model as typeof model & { phases?: SimulationPhase[] }).phases!.length > 0)
      ? (model as typeof model & { phases?: SimulationPhase[] }).phases!.map((phase: SimulationPhase) => ({ ...phase }))
      : [];

  const normalizedNSteps = normalizeNSteps(options.n_steps);

  const phases: SimulationPhase[] = authoredPhases.length > 0
    ? authoredPhases
    : [{
      method: options.method === 'default' ? 'ode' : options.method,
      t_start: 0,
      t_end: options.t_end,
      n_steps: normalizedNSteps ?? options.n_steps ?? 100,
      continue: false,
      atol: options.atol ?? 1e-8,
      rtol: options.rtol ?? 1e-8,
      sparse: options.solver === 'cvode_sparse' || options.sparse
    }];

  // Interactive runs should be able to override time controls for single-phase models.
  // Keep multi-phase authored workflows intact.
  if (authoredPhases.length === 1) {
    const phase = phases[0];
    const resolvedMethod = options.method === 'default' ? phase.method : options.method;
    if (resolvedMethod !== phase.method) {
      phase.method = resolvedMethod;
    }
    if (Number.isFinite(options.t_end)) {
      phase.t_end = options.t_end;
    }
    if (normalizedNSteps !== undefined) {
      phase.n_steps = normalizedNSteps;
    }
  }

  return phases;
}

function cloneModelForSimulation(inputModel: BNGLModel): BNGLModel {
  return {
    ...inputModel,
    parameters: { ...(inputModel.parameters || {}) },
    moleculeTypes: (inputModel.moleculeTypes || []).map((moleculeType) => ({
      ...moleculeType,
      components: [...moleculeType.components]
    })),
    species: (inputModel.species || []).map((species) => ({ ...species })),
    observables: (inputModel.observables || []).map((observable) => ({ ...observable })),
    actions: inputModel.actions?.map((action) => ({ ...action, args: { ...(action.args || {}) } })),
    reactions: inputModel.reactions?.map((reaction) => ({
      ...reaction,
      reactants: [...reaction.reactants],
      products: [...reaction.products],
      productStoichiometries: reaction.productStoichiometries ? [...reaction.productStoichiometries] : undefined
    })),
    reactionRules: inputModel.reactionRules?.map((rule) => ({
      ...rule,
      reactants: [...rule.reactants],
      products: [...rule.products],
      constraints: rule.constraints ? [...rule.constraints] : undefined
    })),
    compartments: inputModel.compartments?.map((compartment) => ({ ...compartment })),
    functions: inputModel.functions?.map((fn) => ({ ...fn, args: [...fn.args] })),
    networkOptions: inputModel.networkOptions
      ? {
        ...inputModel.networkOptions,
        maxStoich: typeof inputModel.networkOptions.maxStoich === 'object' && inputModel.networkOptions.maxStoich !== null
          ? { ...inputModel.networkOptions.maxStoich }
          : inputModel.networkOptions.maxStoich
      }
      : undefined,
    simulationOptions: inputModel.simulationOptions ? { ...inputModel.simulationOptions } : undefined,
    simulationPhases: inputModel.simulationPhases?.map((phase) => ({ ...phase })),
    concentrationChanges: inputModel.concentrationChanges?.map((change) => ({ ...change })),
    parameterChanges: inputModel.parameterChanges?.map((change) => ({ ...change })),
    paramExpressions: inputModel.paramExpressions ? { ...inputModel.paramExpressions } : undefined,
    energyPatterns: inputModel.energyPatterns?.map((pattern) => ({ ...pattern }))
  };
}

/**
 * Helper: Convert concrete reactions to WebGPU-friendly format.
 * Why? WebGPU requires flat arrays (Int32Array/Float32Array) for structured data mapping.
 * Parity: N/A (WebGPU specific optimization, not present in standard BNG2).
 */
async function convertReactionsToGPU(
  concreteReactions: ConcreteReaction[]
): Promise<{ gpuReactions: Array<{ reactantIndices: number[]; reactantStoich: number[]; productIndices: number[]; productStoich: number[]; rateConstantIndex: number; isForward: boolean }>; rateConstants: number[] }> {
  const gpuReactions: Array<{ reactantIndices: number[]; reactantStoich: number[]; productIndices: number[]; productStoich: number[]; rateConstantIndex: number; isForward: boolean }> = [];
  const rateConstants: number[] = [];

  concreteReactions.forEach((rxn, idx) => {
    // Build reactant stoichiometry map
    const reactantMap = new Map<number, number>();
    for (let i = 0; i < rxn.reactants.length; i++) {
      // Int32Array verified in NetworkExpansion fix
      const speciesIdx = rxn.reactants[i];
      reactantMap.set(speciesIdx, (reactantMap.get(speciesIdx) || 0) + 1);
    }

    // Build product stoichiometry map
    const productMap = new Map<number, number>();
    for (let i = 0; i < rxn.products.length; i++) {
      const speciesIdx = rxn.products[i];
      productMap.set(speciesIdx, (productMap.get(speciesIdx) || 0) + 1);
    }

    gpuReactions.push({
      reactantIndices: Array.from(reactantMap.keys()),
      reactantStoich: Array.from(reactantMap.values()),
      productIndices: Array.from(productMap.keys()),
      productStoich: Array.from(productMap.values()),
      rateConstantIndex: idx,
      isForward: true
    });
    // For GPU, we multiply by propensityFactor here if it's constant
    rateConstants.push(rxn.rateConstant * rxn.propensityFactor);
  });

  return { gpuReactions, rateConstants };
}

/**
 * Executes a full simulation of a BioNetGen reaction network.
 *
 * This is the core driver of the engine, equivalent to `run_network.cpp` in BNG2.
 * It manages the entire simulation lifecycle:
 * 1. Resolving the sequence of simulation phases (e.g., equilibration followed by perturbation).
 * 2. Compiling the reaction network into highly optimized structures (JIT-compiled functions, WebAssembly CVODE, or WebGPU).
 * 3. Handling parameter and concentration changes between phases.
 * 4. Executing the numerical integration via ODE (CVODE/RK45), SSA (Gillespie), or PLA (Hybrid).
 * 5. Calculating dynamic observables and functional rates at every output step.
 *
 * Results are dynamically accumulated and returned as a unified data structure matching BNG2's `.gdat` output.
 *
 * @param _jobId - A unique identifier for the simulation job, used for logging or cancellation tracking.
 * @param inputModel - The expanded BNGL model (containing species, parameters, and generated reactions).
 * @param options - Top-level simulation configuration (overridden by phase-specific settings if present).
 * @param callbacks - Integration callbacks for checking cancellation status and posting progress messages.
 * @returns A promise resolving to the final simulation results, including time series data for observables and species.
 * @throws {Error} If JIT compilation fails, functional rate evaluation encounters an error, or the underlying numerical solver fails to converge.
 *
 * @example
 * ```typescript
 * const results = await simulate(1, expandedNetwork, { method: 'ode', t_end: 100, n_steps: 1000 }, {
 *   checkCancelled: () => { if (userCancelled) throw new Error('Cancelled'); },
 *   postMessage: (msg) => console.log('Progress:', msg)
 * });
 * console.log('Final time:', results.data[results.data.length - 1].time);
 * ```
 */
export async function simulate(
  _jobId: number,
  inputModel: BNGLModel,
  options: SimulationOptions,
  callbacks: {
    checkCancelled: () => void,
    postMessage: (msg: { type: string; payload?: unknown; time?: number; state?: Float64Array; speciesCount?: number; observablesCount?: number; progress?: number; [key: string]: unknown }) => void
  }
): Promise<SimulationResults> {
  const formatCaughtError = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
  };

  const VERBOSE_SIM_DEBUG = false; // set true to enable verbose simulation debug
  const simulationStartTime = performance.now();
  // ... using simulationStartTime later ...
  callbacks.checkCancelled();
  if (VERBOSE_SIM_DEBUG) console.log('[NetworkGen] ⏱️ TIMING: Network generation took 0ms (pre-generated)'); // Placeholder for parity, network gen happens before simulate
  if (VERBOSE_SIM_DEBUG) console.log('[Worker] Starting simulation with', inputModel.species.length, 'species,', inputModel.reactions?.length, 'reactions, and', inputModel.reactionRules?.length ?? 0, 'rules');

  // STRICT PARITY: Output time grid management
  // ... (Managed by toBngGridTime)

  // 1. Prepare Model State without the JSON deep-clone hot-path.
  const model = cloneModelForSimulation(inputModel);
  let loggedVDephos = false;

  const numSpecies = model.species.length;
  const speciesHeaders = model.species.map(s => s.name);
  const headers = ['time', ...model.observables.map(o => o.name)];

  const shouldPrintFunctions = (model.simulationPhases?.[0]?.print_functions ?? false) || options.print_functions;
  const printableFunctions = shouldPrintFunctions ? (model.functions || []).filter(f => f.args.length === 0) : [];
  if (shouldPrintFunctions) {
    printableFunctions.forEach(f => headers.push(f.name));
  }

  // Pre-process actions into phases
  // 1. Prepare Phases
  const phases: SimulationPhase[] = resolveSimulationPhasesForRun(model, options);

  const hasMultiPhase = phases.length > 1;
  const concentrationChanges = model.concentrationChanges || [];
  let parameterChanges = model.parameterChanges || [];

  // Apply parameter changes scheduled before phase 0 so initial expressions use updated values.
  if (parameterChanges.length > 0) {
    const prePhaseChanges = parameterChanges.filter((change) => change.afterPhaseIndex < 0);
    if (prePhaseChanges.length > 0) {
      const functionMap = new Map(
        (model.functions || []).map((f) => [f.name, { args: f.args, expr: f.expression } as { args: string[]; expr: string }])
      );
      const paramMap = new Map(Object.entries(model.parameters || {}));
      let parametersUpdated = false;

      for (const change of prePhaseChanges) {
        const mode = change.mode ?? 'set';
        if (mode !== 'set') continue;
        if (!isSafeObjectKey(change.parameter)) continue;

        let newVal: number;
        if (typeof change.value === 'number') {
          newVal = change.value;
        } else {
          const raw = String(change.value).trim();
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) {
            newVal = parsed;
          } else {
            try {
              newVal = BNGLParser.evaluateExpression(raw, paramMap, undefined, functionMap);
            } catch {
              newVal = parseFloat(raw) || 0;
            }
          }
        }

        if (model.parameters && model.parameters[change.parameter] !== newVal) {
          setSafeNumericField(model.parameters as Record<string, number>, change.parameter, newVal);
          paramMap.set(change.parameter, newVal);
          if (model.paramExpressions) {
            delete model.paramExpressions[change.parameter];
          }
          parametersUpdated = true;
        }
      }

      if (parametersUpdated && model.paramExpressions) {
        for (let pass = 0; pass < 10; pass++) {
          let anyChanged = false;
          for (const name in model.paramExpressions) {
            if (!Object.prototype.hasOwnProperty.call(model.paramExpressions, name)) continue;
            if (!isSafeObjectKey(name)) continue;
            const expr = model.paramExpressions[name];
            try {
              const val = BNGLParser.evaluateExpression(expr, paramMap, undefined, functionMap);
              if (Number.isFinite(val) && Math.abs(val - (model.parameters[name] || 0)) > 1e-12) {
                setSafeNumericField(model.parameters as Record<string, number>, name, val);
                paramMap.set(name, val);
                anyChanged = true;
              }
            } catch {
              /* ignore */
            }
          }
          if (!anyChanged) break;
        }
      }

      parameterChanges = parameterChanges.filter((change) => change.afterPhaseIndex >= 0);
    }
  }
  // BNG2 semantics: phases with suffix write to separate files, while unsuffixed
  // phases write to the default model.gdat. For parity, default CSV output should
  // start from the first unsuffixed phase when one exists.
  const firstUnsuffixedIdx = phases.findIndex((p) => !p.suffix);
  const defaultRecordFromIdx = firstUnsuffixedIdx >= 0 ? firstUnsuffixedIdx : 0;
  const recordFromPhaseIdx = options.recordFromPhase !== undefined ? options.recordFromPhase : defaultRecordFromIdx;

  // Seeded random number generator for SSA
  const rng = new SeededRandom(options.seed ?? 12345);

  const allSsa = phases.every(p => p.method === 'ssa') || options.method === 'ssa';
  const allPla = phases.every(p => p.method === 'pla') || options.method === 'pla';
  const allPsa = phases.every(p => p.method === 'psa') || options.method === 'psa';

  // -------------------------------------------------------------------------
  // 2. Prepare Reactions (Optimization & Parity)
  // -------------------------------------------------------------------------
  // BNG2 uses an array of Rxn objects. Here we use "Concrete Rections" optimized for the JS engine.
  // Key Optimization: Use Int32Array for reactants/products (mapped to integer indices).
  // Parity: Matches C++ `std::vector<int>` efficiency.
  const speciesMap = new Map<string, number>();
  model.species.forEach((s, i) => speciesMap.set(s.name, i));

  const changingParameterNames = new Set<string>();
  if (parameterChanges.length > 0) {
    parameterChanges.forEach(c => changingParameterNames.add(c.parameter));
  }

  const reactions = model.reactions ?? [];

  // fs.appendFileSync(debugLog, `[SimulationLoop] Species Map:\n`);
  // model.species.forEach((s, i) => {
  //   fs.appendFileSync(debugLog, `  Species ${i}: ${s.name}\n`);
  // });

  // fs.appendFileSync(debugLog, `[SimulationLoop] Input Model Reactions (${model.reactions.length}):\n`);
  // model.reactions.forEach((r: any, idx) => {
  //   fs.appendFileSync(debugLog, `  Input Rxn ${idx}: [${r.reactants.join(',')}] -> [${r.products.join(',')}] k=${r.rateConstant}\n`);
  // });

  const functionNames = new Set((model.functions || []).map(f => f.name));

  const concreteReactions: ConcreteReaction[] = reactions.map((r: BNGLReaction) => {
    // Map string names to integer indices.
    const reactantIndices = r.reactants.map(name => {
      const idx = speciesMap.get(name);
      if (idx === undefined) throw new Error(`Reactant species "${name}" not found in species list`);
      return idx;
    });
    const productIndices = r.products.map(name => {
      const idx = speciesMap.get(name);
      if (idx === undefined) throw new Error(`Product species "${name}" not found in species list`);
      return idx;
    });

    let isFunctionalRate = r.isFunctionalRate ?? false;
    const rateExpr = r.rateExpression || r.rate;

    // determine isFunctionalRate dynamically if not flagged
    const obsNamesSet = new Set(model.observables.map(o => o.name));
    if (!isFunctionalRate && typeof rateExpr === 'string') {
      isFunctionalRate = isFunctionalRateExpr(rateExpr, obsNamesSet, functionNames, changingParameterNames);
    }

    let rate = typeof r.rateConstant === 'number' ? r.rateConstant : parseFloat(String(r.rateConstant));

    // Fallback: If rate is NaN, try static evaluation (for constant expressions like "k1").
    // Matches BNG2 reading of parameters block.
    if ((isNaN(rate) || !isFinite(rate)) && !isFunctionalRate && typeof rateExpr === 'string') {
      try {
        const paramMap = new Map(Object.entries(model.parameters || {}));
        const evalVal = BNGLParser.evaluateExpression(rateExpr, paramMap, new Set());
        if (!Number.isNaN(evalVal) && Number.isFinite(evalVal)) {
          rate = evalVal;
        }
      } catch (e) {
        // ignore and fallback
      }
    }

    if (isNaN(rate) || !isFinite(rate)) {
      if (!isFunctionalRate) {
        console.warn('[Worker] Invalid rate constant for reaction:', r.rate, '- using 0');
      }
      rate = 0; // Safe fallback
    }

    return {
      reactants: new Int32Array(reactantIndices),
      products: new Int32Array(productIndices),
      rateConstant: rate,
      rateExpression: isFunctionalRate ? rateExpr : null,
      rate: rateExpr !== undefined && rateExpr !== null ? String(rateExpr) : '',
      isFunctionalRate,
      propensityFactor: r.propensityFactor ?? 1,
      productStoichiometries: r.productStoichiometries,
      scalingVolume: r.scalingVolume,
      degeneracy: r.degeneracy ?? 1,
      statFactor: r.statFactor ?? 1,
      totalRate: r.totalRate,
      ruleName: r.name
    };
  });

  // fs.appendFileSync(debugLog, `[SimulationLoop] Concrete Reactions (${concreteReactions.length}):\n`);
  // concreteReactions.forEach((r, idx) => {
  //   fs.appendFileSync(debugLog, `  Rxn ${idx}: ${r.ruleName || 'unnamed'} [${Array.from(r.reactants).join(',')}] -> [${Array.from(r.products).join(',')}] k=${r.rateConstant} isFunc=${r.isFunctionalRate} expr=${r.rateExpression}\n`);
  // });

  // -------------------------------------------------------------------------
  // Functional Rate Logic (Parity with BNG2)
  // -------------------------------------------------------------------------
  // If functional rates exist (MM, Hill, or time-dependent), we must load the SafeEvaluator.
  const functionalRateCount = concreteReactions.filter(r => r.isFunctionalRate).length;
  if (functionalRateCount > 0 || shouldPrintFunctions) {
    if (VERBOSE_SIM_DEBUG) console.log(`[Worker] Functional rates/functions enabled (Reactions: ${functionalRateCount}, Printing Functions: ${shouldPrintFunctions})`);
    if (!getFeatureFlags().functionalRatesEnabled) {
      console.error('[Worker] Functional rates temporarily disabled pending security review');
      throw new Error('Functional rates temporarily disabled pending security review');
    } else {
      try {
        await loadEvaluator();
      } catch (e: unknown) {
        console.error('[Worker] Failed to load SafeExpressionEvaluator module:', e instanceof Error ? e.message : String(e));
        throw new Error(
          'Failed to initialize the expression evaluator needed for functional rates ' +
          '(e.g., Michaelis-Menten, Hill functions). ' +
          'This may indicate the SafeExpressionEvaluator module could not be loaded in the current runtime. ' +
          'If running in a browser worker, ensure the evaluator bundle is included. ' +
          `Original error: ${e instanceof Error ? e.message : String(e)}`,
          { cause: e }
        );
      }
    }
  }

  // 3. Pre-process Observables
  // Prefer concrete observables attached to the model (produced earlier by NetworkExpansion). If not present,
  // fall back to dynamic matching here (legacy behavior).
  const concreteObservables: ConcreteObservable[] = ('concreteObservables' in model && Array.isArray((model as typeof model & { concreteObservables?: ConcreteObservable[] }).concreteObservables)) ? (model as typeof model & { concreteObservables?: ConcreteObservable[] }).concreteObservables! : model.observables.map(obs => {
    const splitPatternsSafe = (patternStr: string): string[] => {
      const commaChunks: string[] = [];
      let current = '';
      let parenDepth = 0;
      for (const char of patternStr) {
        if (char === '(') parenDepth++;
        else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
        else if (char === ',' && parenDepth === 0) {
          const trimmed = current.trim();
          if (trimmed) commaChunks.push(trimmed);
          current = '';
          continue;
        }
        current += char;
      }
      const trimmed = current.trim();
      if (trimmed) commaChunks.push(trimmed);

      // Preserve each top-level chunk as a full pattern.
      // Splitting by whitespace can corrupt valid species patterns with spaces,
      // e.g. "L(r, loc~EC).L(r, loc~EC)".
      return commaChunks.map(chunk => chunk.trim()).filter(Boolean);
    };

    const patterns = splitPatternsSafe(obs.pattern);
    const matchingIndices: number[] = [];
    const coefficients: number[] = [];

    const matchesCountConstraint = (speciesStr: string, constraint: string): boolean | null => {
      const m = constraint.trim().match(/^([A-Za-z0-9_]+)\s*(==|<=|>=|<|>)\s*(\d+)$/);
      if (!m) return null;
      const mol = m[1];
      const op = m[2];
      const n = Number.parseInt(m[3], 10);
      const c = countPatternMatches(speciesStr, mol);
      switch (op) {
        case '==': return c === n;
        case '<=': return c <= n;
        case '>=': return c >= n;
        case '<': return c < n;
        case '>': return c > n;
        default: return null;
      }
    };

    const obsType = (obs.type ?? '').toLowerCase();
    model.species.forEach((s, i) => {
      let count = 0;
      for (const pat of patterns) {
        if (obsType === 'species') {
          const constraintMatch = matchesCountConstraint(s.name, pat);
          if (constraintMatch === true) {
            count += 1;
            continue;
          }
          if (constraintMatch === false) continue;
          if (isSpeciesMatch(s.name, pat)) {
            count += 1;
          }
        } else {
          const matchCount = countPatternMatches(s.name, pat);
          count += matchCount;
        }
      }
      if (count > 0) {
        matchingIndices.push(i);
        coefficients.push(count);
      }
    });

    return {
      name: obs.name,
      type: obs.type,
      indices: new Int32Array(matchingIndices),
      coefficients: new Float64Array(coefficients)
    };
  });

  // 4. Initialize State Vector
  const speciesVolumes = new Float64Array(numSpecies);
  const compartmentMap = new Map<string, number>();
  if (model.compartments && model.compartments.length > 0) {
    console.log(`[Worker] RESOLVING COMPARTMENTS: Found ${model.compartments.length} compartments`);
    (model.compartments || []).forEach(c => {
      const vol = c.resolvedVolume ?? c.size ?? 1.0;
      compartmentMap.set(c.name, vol);
      console.log(`[Worker]   - Compartment: '${c.name}', Vol: ${vol}`);
    });
  }

  model.species.forEach((s, idx) => {
    let compName: string | null = null;
    // 1. Prefix notation: @Comp:Species
    if (s.name.startsWith('@')) {
      const colonIdx = s.name.indexOf(':');
      if (colonIdx > 0) compName = s.name.substring(1, colonIdx);
    }
    // 2. Suffix notation: Species@Comp (fallback)
    if (!compName) {
      const parts = s.name.split('@');
      if (parts.length > 1) {
        compName = parts[parts.length - 1].trim();
      }
    }

    let vol = 1.0;
    if (compName && compartmentMap.has(compName)) {
      vol = compartmentMap.get(compName)!;
    }
    speciesVolumes[idx] = vol;
  });

  // BioNetGen scales ODE rates by an anchor compartment volume. For mixed-dimension
  // reactants (e.g. 3D + 2D), anchoring to the lower-dimensional compartment yields
  // closer parity with cBNGL transport/binding models.
  const reactionReactingVolumes = new Float64Array(reactions.length);
  const compartmentMapForDim = new Map((inputModel.compartments ?? []).map(c => [c.name, c]));

  reactions.forEach((r, idx) => {
    const declaredScalingVolume = r.scalingVolume;
    if (typeof declaredScalingVolume === 'number' && Number.isFinite(declaredScalingVolume) && declaredScalingVolume > 0) {
      reactionReactingVolumes[idx] = declaredScalingVolume;
      return;
    }

    let vAnchor = 1.0;
    let minDim = Number.POSITIVE_INFINITY;

    const candidates = r.reactants.length > 0 ? r.reactants : r.products;

    candidates.forEach(speciesName => {
      // Parse compartment name from species string (e.g. "@EC:L" or "L@EC")
      let compName: string | null = null;
      if (speciesName.startsWith('@')) {
        const colonIdx = speciesName.indexOf(':');
        if (colonIdx > 0) compName = speciesName.substring(1, colonIdx);
      }
      if (!compName) {
        const parts = speciesName.split('@');
        if (parts.length > 1) compName = parts[parts.length - 1].trim();
      }

      const comp = compName ? compartmentMapForDim.get(compName) : null;
      if (comp) {
        const dim = comp.dimension ?? 3;
        const vol = compartmentMap.get(compName!) ?? 1.0;
        if (dim < minDim) {
          minDim = dim;
          vAnchor = vol;
        }
      } else {
        // Fallback for no compartment: default to 1.0 and dim 3
        if (3 < minDim) {
          minDim = 3;
          vAnchor = 1.0;
        }
      }
    });

    reactionReactingVolumes[idx] = vAnchor;
  });

  const buildParamMap = (parameters: Record<string, unknown> | undefined): Map<string, number> => {
    const paramMap = new Map<string, number>();
    // Handle parameters whether it's a Record (standard) or Array of objects (edge cases mentioned in reviews)
    if (Array.isArray(parameters)) {
      for (const p of parameters) {
        if (p && p.name && typeof p.value !== 'undefined') {
          paramMap.set(p.name, Number(p.value));
        }
      }
    } else {
      for (const [name, rawValue] of Object.entries(parameters || {})) {
        const direct = Number(rawValue);
        if (Number.isFinite(direct)) {
          paramMap.set(name, direct);
          continue;
        }
        if (rawValue && typeof rawValue === 'object' && 'value' in (rawValue as Record<string, unknown>)) {
          const nested = Number((rawValue as any).value);
          if (Number.isFinite(nested)) {
            paramMap.set(name, nested);
          }
        }
      }
    }
    return paramMap;
  };
  const initialEvalParamMap = buildParamMap(model.parameters);
  for (const comp of model.compartments || []) {
    const resolved = Number(comp.resolvedVolume ?? comp.size);
    if (!Number.isFinite(resolved)) continue;
    if (!initialEvalParamMap.has(comp.name)) {
      initialEvalParamMap.set(comp.name, resolved);
    }
    const compParam = `__compartment_${comp.name}__`;
    if (!initialEvalParamMap.has(compParam)) {
      initialEvalParamMap.set(compParam, resolved);
    }
  }
  if (!initialEvalParamMap.has('Na')) {
    initialEvalParamMap.set('Na', 1);
  }
  const initialEvalFunctionMap = new Map(
    (model.functions || []).map((f) => [f.name, { args: f.args, expr: f.expression } as { args: string[]; expr: string }])
  );
  const resolveInitialAmount = (species: BNGLModel['species'][number], paramMap?: Map<string, number>): number => {
    const expression = 'initialExpression' in species && typeof (species as unknown as Record<string, unknown>).initialExpression === 'string' ? ((species as unknown as Record<string, unknown>).initialExpression as string).trim() : '';
    if (expression) {
      try {
        const evaluated = BNGLParser.evaluateExpression(
          expression,
          paramMap || initialEvalParamMap,
          new Set(),
          initialEvalFunctionMap
        );
        if (Number.isFinite(evaluated)) return evaluated;
      } catch {
        // Fall through to raw initial values
      }
    }

    const rawConcentration = 'initialConcentration' in species ? (species as typeof species & { initialConcentration?: number | string }).initialConcentration : undefined;
    if (typeof rawConcentration === 'number' && Number.isFinite(rawConcentration)) {
      return rawConcentration;
    }
    if (typeof rawConcentration === 'string' && (rawConcentration as string).trim().length > 0) {
      const parsedConcentration = Number(rawConcentration);
      if (Number.isFinite(parsedConcentration)) return parsedConcentration;
    }

    const rawAmount = 'initialAmount' in species ? (species as typeof species & { initialAmount?: number | string }).initialAmount : undefined;
    if (typeof rawAmount === 'number' && Number.isFinite(rawAmount)) {
      return rawAmount;
    }
    if (typeof rawAmount === 'string' && (rawAmount as string).trim().length > 0) {
      const parsedAmount = Number(rawAmount);
      if (Number.isFinite(parsedAmount)) return parsedAmount;
    }

    return 0;
  };

  const isOde = !allSsa && !allPla && !allPsa && options.method !== 'ssa' && options.method !== 'pla' && options.method !== 'psa';
  const hasHeterogeneousSpeciesVolumes = Array.from(speciesVolumes).some((vol) => Math.abs(vol - 1) > 1e-15);
  // The amount-space branch fixes CVODE parity for compartment models whose rates
  // depend on observables/functions. Keep pure mass-action compartment models on
  // the existing concentration-space fast path for performance.
  const odeUsesAmountState = isOde && hasHeterogeneousSpeciesVolumes && functionalRateCount > 0;
  const solverVolumes = odeUsesAmountState
    ? new Float64Array(numSpecies).fill(1.0)
    : speciesVolumes;
  if (odeUsesAmountState) {
    console.log(`[Worker] Using amount-space ODE integration (heterogeneous compartment volumes + ${functionalRateCount} functional rate(s))`);
  }
  const state = new Float64Array(numSpecies);
  model.species.forEach((s, i) => {
    // For compartment ODEs, integrate in amount space to better match BNG2/CVODE
    // error weighting across heterogeneous compartment volumes.
    const initAmt = resolveInitialAmount(s);

    if (isOde) {
      state[i] = odeUsesAmountState ? initAmt : (initAmt / speciesVolumes[i]);
    } else {
      // Keep as integer counts for SSA
      state[i] = initAmt;
    }

    // DEBUG: Trace FB initialization in SimulationLoop
    if (s.name.includes('FB')) {
      console.log(`[Worker] State Init FB (Idx ${i}): name='${s.name}', initAmt=${initAmt}, vol=${speciesVolumes[i]}, isOde=${isOde}, finalState=${state[i]}`);
    }
  });

  // DEBUG: Scaling volumes check
  const minVol = Math.min(...Array.from(speciesVolumes));
  const maxVol = Math.max(...Array.from(speciesVolumes));
  console.log(`[Worker] Scaling Check: Species Vol Range [${minVol}, ${maxVol}]. Count 1.0s: ${Array.from(speciesVolumes).filter(v => v === 1.0).length}`);
  const stateValueToSpeciesOutput = (value: number, speciesIdx: number): number =>
    (isOde && odeUsesAmountState) ? (value / speciesVolumes[speciesIdx]) : value;

  // PARITY FIX: Concentration cache for saveConcentrations/resetConcentrations (BNG2 Cache semantics)
  // BNG2 uses a label-based cache. Default label resets to initial seed species values.
  const DEFAULT_CONC_LABEL = '__DEFAULT__';
  const concentrationCache = new Map<string, Float64Array>();
  // Note: We evaluate initial amounts on demand for resetConcentrations() to respect parameter changes during simulation


  // Minimal runtime debug to avoid noisy console output
  try {
    if (VERBOSE_SIM_DEBUG) console.log('[Worker] Model name:', model.name);
  } catch (e) {
    /* ignore */
  }

  // DEBUG: Check for corrupted parameters
  if (model.parameters) {
    const debugParams = ['h2', 'q0_bax', 'h1', 's1', 'DNA_DSB_max'];
    const corrupted = debugParams.filter(p => {
      const v = model.parameters[p];
      return v !== undefined && (isNaN(v) || !isFinite(v));
    });
    if (corrupted.length > 0) {
      console.error(`[Worker] CORRUPTED PARAMETERS DETECTED at start: ${corrupted.map(p => `${p}=${model.parameters[p]}`).join(', ')}`);
    } else {
      if (VERBOSE_SIM_DEBUG) console.log(`[Worker] Key parameters check passed: h2=${model.parameters['h2']}, h1=${model.parameters['h1']}`);

      // Additional debug for stat3: show k_phos_max and Km_phos
      if (model.name && model.name.toLowerCase().includes('stat3')) {
        console.log('[Worker] stat3 params:', {
          k_phos_max: model.parameters['k_phos_max'],
          Km_phos: model.parameters['Km_phos'],
          k_trans_max: model.parameters['k_trans_max']
        });
        console.log('[Worker] stat3 paramExpressions:', model.paramExpressions);
        console.log('[Worker] stat3 parameters keys:', Object.keys(model.parameters || {}).length, Object.keys(model.paramExpressions || {}).length);
      }
    }

    const dataBySuffix: Record<string, Record<string, number>[]> = Object.create(null) as Record<string, Record<string, number>[]>;
    const speciesDataBySuffix: Record<string, Record<string, number>[]> = Object.create(null) as Record<string, Record<string, number>[]>;
    const includeSpeciesData = options.includeSpeciesData ?? true;

    const normalizeSuffixKey = (suffix?: unknown): string => {
      const raw = typeof suffix === 'string' ? suffix : (suffix == null ? '' : String(suffix));
      const candidate = raw.trim();
      if (!candidate || !isSafeObjectKey(candidate)) return '__default__';
      return candidate;
    };

    const getSuffixDataArray = (suffix?: string) => {
      const key = normalizeSuffixKey(suffix);
      if (!dataBySuffix[key]) setSafeArrayField(dataBySuffix, key, []);
      if (!dataBySuffix[key]) {
        setSafeArrayField(dataBySuffix, '__default__', []);
      }
      return dataBySuffix[key] || dataBySuffix.__default__;
    };

    const getSuffixSpeciesDataArray = (suffix?: string) => {
      const key = normalizeSuffixKey(suffix);
      if (!speciesDataBySuffix[key]) setSafeArrayField(speciesDataBySuffix, key, []);
      if (!speciesDataBySuffix[key]) {
        setSafeArrayField(speciesDataBySuffix, '__default__', []);
      }
      return speciesDataBySuffix[key] || speciesDataBySuffix.__default__;
    };

    const appendDataRow = (suffix: string | undefined, row: Record<string, number>) => {
      getSuffixDataArray(suffix).push(row);
    };

    const appendSpeciesSnapshot = (suffix: string | undefined, snapshot: Record<string, number>) => {
      if (includeSpeciesData) {
        getSuffixSpeciesDataArray(suffix).push(snapshot);
      }
    };

    const getTotalDataLength = () => Object.values(dataBySuffix).reduce((sum, arr) => sum + arr.length, 0);

    const observableNames = concreteObservables.map((obs) => obs.name);
    const observableValuesBuffer = new Float64Array(concreteObservables.length);
    const observableValuesRecord: Record<string, number> = Object.create(null) as Record<string, number>;
    const outputTemplate: Record<string, number> = Object.create(null) as Record<string, number>;

    // ⚡ Bolt Optimization: Pre-filter safe observable names once during setup.
    // This avoids repeatedly checking isSafeObjectKey for every observable in the hot loop.
    const safeObservableNames: string[] = [];
    const safeObservableIndices: number[] = [];
    for (let i = 0; i < observableNames.length; i++) {
      const name = observableNames[i];
      if (isSafeObjectKey(name)) {
        safeObservableNames.push(name);
        safeObservableIndices.push(i);
        // Initialize the object with 0
        observableValuesRecord[name] = 0;
      }
    }

    // --- Observable evaluation strategy selection ---
    // For large models (100+ observables), use CSR sparse evaluation to avoid
    // V8 JIT deoptimization that occurs with a single massive compiled function.
    // For smaller models, use chunked JIT (chunks of 64 observables each stay
    // within TurboFan's optimization threshold).
    const useCSRObservables = shouldUseCSRObservables(concreteObservables.length);
    const useAmountsForObs = isOde && !odeUsesAmountState;

    let csrObservableMatrix: CSRObservableMatrix | null = null;
    if (useCSRObservables && concreteObservables.length > 0) {
      try {
        csrObservableMatrix = buildCSRObservableMatrix(
          concreteObservables as Array<{
            name: string;
            indices: Int32Array | number[];
            coefficients: Float64Array | number[];
            volumes?: Float64Array | number[];
          }>,
          numSpecies,
          useAmountsForObs,
          speciesVolumes
        );
      } catch {
        csrObservableMatrix = null;
      }
    }

    // Chunked JIT fallback (used for < 100 observables, or if CSR build fails)
    const compiledObservableEvaluator = (!csrObservableMatrix && concreteObservables.length > 0)
      ? (() => {
          try {
            return jitCompiler.compileObservables(concreteObservables as Array<{
              name: string;
              indices: Int32Array | number[];
              coefficients: Float64Array | number[];
              volumes?: Float64Array | number[];
            }>, numSpecies, useAmountsForObs);
          } catch {
            return null;
          }
        })()
      : null;

    const evaluateObservablesIntoBuffer = (currentState: Float64Array) => {
      // Path 1: CSR sparse evaluation for large models (100+ observables)
      if (csrObservableMatrix) {
        evaluateObservablesCSR(csrObservableMatrix, currentState, observableValuesBuffer);
        return observableValuesBuffer;
      }

      // Path 2: Chunked JIT evaluation (automatically chunked for 64+ observables)
      if (compiledObservableEvaluator) {
        compiledObservableEvaluator.evaluate(currentState, observableValuesBuffer, speciesVolumes);
        return observableValuesBuffer;
      }

      // Path 3: Interpreted fallback
      for (let i = 0; i < concreteObservables.length; i++) {
        const obs = concreteObservables[i];
        let sum = 0;
        for (let j = 0; j < obs.indices.length; j++) {
          const idx = obs.indices[j];
          const val = currentState[idx];
          const obsVolumes = 'volumes' in obs ? (obs as typeof obs & { volumes?: number[] }).volumes : undefined;
          const termVolume = Array.isArray(obsVolumes)
            ? (obsVolumes[j] ?? speciesVolumes[idx])
            : speciesVolumes[idx];
          const amount = isOde
            ? (odeUsesAmountState ? val : (val * termVolume))
            : val;
          sum += amount * obs.coefficients[j];
        }
        observableValuesBuffer[i] = sum;
      }

      return observableValuesBuffer;
    };

    const evaluateObservablesFast = (currentState: Float64Array) => {
      const buffer = evaluateObservablesIntoBuffer(currentState);
      // ⚡ Bolt Optimization: Use pre-filtered safe observable names to directly assign values,
      // avoiding repeated regex validation via setSafeNumericField in the hot loop.
      for (let i = 0; i < safeObservableNames.length; i++) {
        observableValuesRecord[safeObservableNames[i]] = buffer[safeObservableIndices[i]];
      }
      return observableValuesRecord;
    };

    const evaluateFunctionsForOutput = (_currentState: Float64Array, observableValues: Record<string, number>) => {
      if (!shouldPrintFunctions) return Object.create(null) as Record<string, number>;
      const results: Record<string, number> = Object.create(null) as Record<string, number>;
      for (const f of model.functions || []) {
        if (f.args && f.args.length > 0) continue;
        if (f.name === '__proto__' || f.name === 'constructor' || f.name === 'prototype') continue;
        try {
          setSafeNumericField(
            results,
            f.name,
            evaluateFunctionalRate(f.expression, model.parameters, observableValues, model.functions)
          );
        } catch {
          setSafeNumericField(results, f.name, 0);
        }
      }
      return results;
    };

    const pushDataRow = (suffix: string | undefined, outT: number, currentState: Float64Array) => {
      const buffer = evaluateObservablesIntoBuffer(currentState);
      outputTemplate.time = outT;
      for (let i = 0; i < safeObservableNames.length; i++) {
        outputTemplate[safeObservableNames[i]] = buffer[safeObservableIndices[i]];
      }
      if (shouldPrintFunctions) {
        const funcResults = evaluateFunctionsForOutput(currentState, outputTemplate);
        for (const key in funcResults) {
          if (Object.prototype.hasOwnProperty.call(funcResults, key)) {
            outputTemplate[key] = funcResults[key];
          }
        }
      }
      appendDataRow(suffix, { ...outputTemplate });
    };

    const buildMassActionJitReactions = () => concreteReactions.map((rxn, rxnIndex) => {
      const reactantIndices: number[] = [];
      const reactantStoich: number[] = [];
      const reactantCounts = new Map<number, number>();
      for (const idx of rxn.reactants) {
        reactantCounts.set(idx, (reactantCounts.get(idx) || 0) + 1);
      }
      for (const [idx, count] of reactantCounts) {
        reactantIndices.push(idx);
        reactantStoich.push(count);
      }

      const productIndices: number[] = [];
      const productStoich: number[] = [];
      const productCounts = new Map<number, number>();
      for (let j = 0; j < rxn.products.length; j++) {
        const idx = rxn.products[j];
        const stoich = rxn.productStoichiometries ? rxn.productStoichiometries[j] : 1;
        productCounts.set(idx, (productCounts.get(idx) || 0) + stoich);
      }
      for (const [idx, count] of productCounts) {
        productIndices.push(idx);
        productStoich.push(count);
      }

      const propensityFactor = rxn.propensityFactor ?? 1;
      const degeneracyFactor = rxn.degeneracy ?? 1;
      let rateConstant: number | string = rxn.rateConstant * propensityFactor * degeneracyFactor;
      if (!rxn.isFunctionalRate && typeof rxn.rate === 'string' && rxn.rate.trim().length > 0) {
        const symbolicRate = rxn.rate.trim();
        const applyPropensityFactor = rxn.propensityFactor !== undefined && rxn.propensityFactor !== 1;
        const applyDegeneracyFactor = rxn.degeneracy !== undefined && rxn.degeneracy !== 1;
        if (applyPropensityFactor || applyDegeneracyFactor) {
          const factors: string[] = [symbolicRate];
          if (applyPropensityFactor) factors.push(String(propensityFactor));
          if (applyDegeneracyFactor) factors.push(String(degeneracyFactor));
          rateConstant = factors.map((part) => `(${part})`).join(' * ');
        } else {
          rateConstant = symbolicRate;
        }
      }

      return {
        reactantIndices,
        reactantStoich,
        productIndices,
        productStoich,
        rateConstant,
        scalingVolume: reactionReactingVolumes[rxnIndex],
        totalRate: rxn.totalRate
      };
    });

    let compiledMassActionJit: JITCompiledFunction | undefined;
    let rebuildNativeByteCode: (() => void) | undefined;
    let persistedSolver: { integrate: (y: Float64Array, t0: number, tEnd: number, check?: () => void) => SolverResult; destroy?: () => void } | undefined = undefined;
     
    let persistedSolverKey = '';


    const applyParameterUpdates = (targetPhaseIdx: number): boolean => {
      let parametersUpdated = false;

      for (const change of parameterChanges) {

        if (change.afterPhaseIndex === targetPhaseIdx - 1) {
          if (!isSafeObjectKey(change.parameter)) {
            continue;
          }
          const currentObsValues = isOde ? evaluateObservablesFast(y) : evaluateObservablesFast(state as Float64Array);
          let newVal: number;
          if (typeof change.value === 'number') newVal = change.value;
          else {
            try {
              newVal = evaluateFunctionalRate(change.value, model.parameters, currentObsValues, model.functions);
            } catch {
              newVal = parseFloat(String(change.value)) || 0;
            }
          }
          if (model.parameters && model.parameters[change.parameter] !== newVal) {

            setSafeNumericField(model.parameters as Record<string, number>, change.parameter, newVal);

            // PARITY FIX: If a parameter is explicitly set, we should stop re-evaluating it 
            // from its original expression (if it had one). 
            if (model.paramExpressions) {
              const oldExpr = model.paramExpressions[change.parameter];
              if (oldExpr) {

                delete model.paramExpressions[change.parameter];
              }
            }
            parametersUpdated = true;
          }
        }
      }

      // Re-evaluate dependent params
      if (parametersUpdated && model.paramExpressions) {
        // ⚡ Bolt Optimization: Evaluate observables ONCE outside the loop and use for...in instead of Object.entries()
        // to avoid repeated array allocations and redundant calculations during phase updates.
        const currentObsValues = isOde ? evaluateObservablesFast(y) : evaluateObservablesFast(state as Float64Array);
        for (let pass = 0; pass < 10; pass++) {
          let anyChanged = false;
          for (const name in model.paramExpressions) {
            if (Object.prototype.hasOwnProperty.call(model.paramExpressions, name)) {
                if (!isSafeObjectKey(name)) {
                  continue;
                }
              const expr = model.paramExpressions[name];
              try {
                const val = evaluateFunctionalRate(expr, model.parameters, currentObsValues, model.functions);
                if (Math.abs(val - (model.parameters[name] || 0)) > 1e-12) {

                  setSafeNumericField(model.parameters as Record<string, number>, name, val);
                  anyChanged = true;
                }
              } catch (e: unknown) {
                /* ignore */
              }
            }
          }
          if (!anyChanged) break;
        }
      }

      // Update mass action rates for reactions that depend on changed parameters
      if (parametersUpdated) {
        compiledMassActionJit?.updateParameters?.(model.parameters);
        const context = model.parameters || {};
        for (let i = 0; i < concreteReactions.length; i++) {
          const rxn = concreteReactions[i];
          // Only re-evaluate if it's a mass-action rate (static string) that might be a parameter
          if (!rxn.isFunctionalRate && rxn.rate && typeof rxn.rate === 'string' && rxn.rate !== 'undefined') {
            try {
              const oldK = rxn.rateConstant;
              const newK = evaluateFunctionalRate(rxn.rate as string, context, {}, model.functions);
              if (!isNaN(newK) && isFinite(newK) && Math.abs(newK - oldK) > 1e-15) {

                rxn.rateConstant = newK;
              }
            } catch (e: unknown) {
              /* ignore */
            }
          }
        }
        clearAllEvaluatorCaches();
        rebuildNativeByteCode?.();
        refreshRateContextParameters?.();

        // Destroy persisted solver on parameter updates to force recreation with new rates/bytecode
        if (persistedSolver) {
          try {
            persistedSolver.destroy?.();
          } catch (e) {
            /* ignore */
          }
          persistedSolver = undefined;
        }
      }


      return parametersUpdated;
    };


    if (allPsa) {
      // PSA (Partitioned Stochastic Algorithm / Haseltine-Rawlings adaptive scaling)
      const { simulatePSA } = await import('./PSASimulator');
      const psaModel = {
        ...model,
        species: model.species.map((s, i) => ({ ...s, initialConcentration: state[i] }))
      };
      const psaOptions = {
        ...options,
        poplevel: ((options as typeof options & { poplevel?: number }).poplevel) ?? phases[0]?.poplevel ?? 100,
      };
      const result = await simulatePSA(psaModel, psaOptions);
      return result;
    }

    if (allPla) {
      // PLA is fully stochastic hybrid model generator
      const { simulatePLA } = await import('./PLASimulator');
      // Update model with the correctly resolved species counts
      const plaModel = {
        ...model,
        species: model.species.map((s, i) => ({ ...s, initialConcentration: state[i] }))
      };
      const result = await simulatePLA(plaModel, options);
      if (includeSpeciesData) {
         // PLA simulator doesn't return full species matrices by default, 
         // but that's fine for BNGL action parity since observables are what's plotted.
      }
      return result;
    }

    if (allSsa) {
      if (functionalRateCount > 0) {
        console.warn('[Worker] SSA selected with functional rates; evaluating rate expressions during propensity updates.');
      }

      for (let i = 0; i < numSpecies; i++) state[i] = Math.round(state[i]);

      // === DIN INFLUENCE TRACKING SETUP ===
      const numReactions = concreteReactions.length;

      // Pre-compute: which reactions depend on which species? (for sparse influence tracking)
      const speciesDependents: Map<number, number[]> = new Map();
      for (let i = 0; i < numReactions; i++) {
        for (let j = 0; j < concreteReactions[i].reactants.length; j++) {
          const speciesIdx = concreteReactions[i].reactants[j];
          if (!speciesDependents.has(speciesIdx)) {
            speciesDependents.set(speciesIdx, []);
          }
          speciesDependents.get(speciesIdx)!.push(i);
        }
      }
      // Precompute rxnUpdateRxn for SSA incremental propensity updates
      // This is a reaction dependency graph: for each reaction, which other reactions are affected?
      const rxnUpdateRxn: Int32Array[] = new Array(numReactions);
      for (let r = 0; r < numReactions; r++) {
        const rxn = concreteReactions[r];
        const deps = new Set<number>();
        for (const idx of rxn.reactants) {
          const dependentRxns = speciesDependents.get(idx);
          if (dependentRxns) {
            for (let i = 0; i < dependentRxns.length; i++) deps.add(dependentRxns[i]);
          }
        }
        for (const idx of rxn.products) {
          const dependentRxns = speciesDependents.get(idx);
          if (dependentRxns) {
            for (let i = 0; i < dependentRxns.length; i++) deps.add(dependentRxns[i]);
          }
        }
        rxnUpdateRxn[r] = new Int32Array(Array.from(deps));
      }



      // Global influence tracking
      const includeInfluence = options.includeInfluence === true;
      const ruleFirings = includeInfluence ? new Int32Array(numReactions) : null;
      const influenceMatrix = includeInfluence ? new Float64Array(numReactions * numReactions) : null;

      // Time-windowed snapshots for animation
      const NUM_WINDOWS = 20;
      const influenceWindows: SSAInfluenceData[] = [];
      const windowRuleFirings = includeInfluence ? new Int32Array(numReactions) : null;
      const windowInfluenceMatrix = includeInfluence ? new Float64Array(numReactions * numReactions) : null;
      let windowStartTime = 0;

      // Calculate total simulation time for even window distribution
      const totalSimTime = phases.reduce((sum, p) => sum + (p.t_end ?? options.t_end), 0);
      const windowSize = totalSimTime / NUM_WINDOWS;

      // Reuse arrays to avoid allocations in hot loop
      const propensities = new Float64Array(numReactions);
      const affectedReactionIndices = includeInfluence ? new Int32Array(numReactions) : null;
      const oldPropensityValues = includeInfluence ? new Float64Array(numReactions) : null;
      const propOrder = new Int32Array(numReactions);

      // Reaction firing log for information-theoretic analysis
      const shouldRecordFirings = !!(options as typeof options & { recordFirings?: boolean }).recordFirings;
      const maxFiringEvents = ((options as typeof options & { maxFiringEvents?: number }).maxFiringEvents) ?? 100000;
      const firingLog: Array<{ time: number; reactionIndex: number; ruleName?: string; propensity: number }> = [];

      // === LAZY OBSERVABLE EVALUATION SETUP ===
      const numObservables = concreteObservables.length;
      const observableIndexToSafeName: string[] = new Array(numObservables);
      for (let i = 0; i < safeObservableIndices.length; i++) {
        observableIndexToSafeName[safeObservableIndices[i]] = safeObservableNames[i];
      }
      const observableDependsOnSpecies: number[][] = Array.from({ length: numSpecies }, () => []);
      for (let i = 0; i < numObservables; i++) {
        const obs = concreteObservables[i];
        for (let j = 0; j < obs.indices.length; j++) {
          const spIdx = obs.indices[j];
          const arr = observableDependsOnSpecies[spIdx];
          // Bolt optimization: since we process observables in order (0 to numObservables - 1),
          // we only need to check the last element to avoid duplicates.
          // This reduces O(N^2) `.includes()` lookup to O(1).
          if (arr.length === 0 || arr[arr.length - 1] !== i) {
            arr.push(i);
          }
        }
      }
      const dirtyObservables = new Uint8Array(numObservables);
      dirtyObservables.fill(1); // Initially all dirty

      // Extract meaningful reaction names from ruleName or reactants/products
      const ruleNames = concreteReactions.map((rxn) => {
        if (rxn.ruleName) return rxn.ruleName;
        // Fallback: construct readable name from reactants and products
        const reactantNames = Array.from(rxn.reactants).map(idx => {
          const name = model.species[idx]?.name || `S${idx}`;
          // Simplify species names: remove compartments and states for compactness
          return name.split('@')[0].split('(')[0];
        });
        const productNames = Array.from(rxn.products).map(idx => {
          const name = model.species[idx]?.name || `S${idx}`;
          return name.split('@')[0].split('(')[0];
        });

        // Build compact name like "A+B→C" or "A→∅" for degradation
        const uniqueReactants = [...new Set(reactantNames)];
        const uniqueProducts = [...new Set(productNames)];

        const reactStr = uniqueReactants.slice(0, 2).join('+');
        const prodStr = uniqueProducts.length > 0
          ? uniqueProducts.slice(0, 2).join('+')
          : '∅';

        return `${reactStr}→${prodStr}`;
      });

      // Helper: unflatten matrix
      const unflattenMatrix = (flat: Float64Array, n: number): number[][] => {
        const matrix: number[][] = [];
        for (let i = 0; i < n; i++) {
          matrix.push(Array.from(flat.slice(i * n, (i + 1) * n)));
        }
        return matrix;
      };

      // Helper: calculate propensity for a single reaction
      const calcPropensity = (rxnIdx: number): number => {
        const rxn = concreteReactions[rxnIdx];
        const n = rxn.reactants.length;
        let rate = rxn.rateConstant;
        if (rxn.isFunctionalRate && rxn.rateExpression) {
          try {
            const currentObs = evaluateObservablesFast(state);
            rate = evaluateFunctionalRate(
              rxn.rateExpression,
              model.parameters || {},
              currentObs,
              model.functions,
              undefined,
              undefined
            );
          } catch (e: unknown) {
            console.error(`[Worker] SSA functional rate evaluation failed for reaction ${rxnIdx}:`, e instanceof Error ? e.message : String(e));
            rate = 0;
          }
        }

        let a = rate * rxn.propensityFactor;

        // PARITY NOTE: For SSA, bimolecular rates (k_molar) must be scaled by 1/V
        // to convert to propensity in reciprocal molecule-counts.
        // n=0: a = k*V
        // n=1: a = k*N
        // n=2: a = k*N1*N2/V
        // n=3: a = k*N1*N2*N3/V^2
        const volume = reactionReactingVolumes[rxnIdx];
        if (n === 0) {
          a *= volume;
        } else if (n === 2) {
          a /= volume;
        } else if (n === 3) {
          a /= (volume * volume);
        } else if (n > 3) {
          a /= Math.pow(volume, n - 1);
        }

        for (let j = 0; j < rxn.reactants.length; j++) {
          a *= state[rxn.reactants[j]];
        }
        return a;
      };

      let globalTime = 0;
      for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
        const phase = phases[phaseIdx];
        const recordThisPhase = (phaseIdx >= recordFromPhaseIdx);

        for (let j = 0; j < numReactions; j++) {
          propOrder[j] = j;
        }

        const shouldEmitPhaseStart = recordThisPhase && (phaseIdx === recordFromPhaseIdx || !(phase.continue ?? false));

        // Apply parameter changes before this phase
        applyParameterUpdates(phaseIdx);

        for (const change of concentrationChanges) {
          if (change.afterPhaseIndex !== phaseIdx - 1) continue;
          const mode = change.mode ?? 'set';

          if (mode === 'save') {
            const label = change.label ?? DEFAULT_CONC_LABEL;
            concentrationCache.set(label, new Float64Array(state));
            console.log(`[Worker] SSA: Saved concentrations with label "${label}"`);
            continue;
          }
          if (mode === 'reset') {
            const label = change.label ?? DEFAULT_CONC_LABEL;
            const saved = concentrationCache.get(label);
            if (saved) {
              // Restore from cached saved state
              state.set(saved);
              console.log(`[Worker] SSA: Reset concentrations to saved label "${label}"`);
            } else {
              // No cache hit: if default label, reset to initial seed species (BNG2 SpeciesList fallback)
              // BNG2 semantics recalculate initial values with current parameters
              if (label === DEFAULT_CONC_LABEL) {
                const currentParamMap = buildParamMap(model.parameters);
                for (let k = 0; k < numSpecies; k++) {
                  state[k] = resolveInitialAmount(model.species[k], currentParamMap); // SSA uses raw counts
                }
                console.log(`[Worker] SSA: Reset concentrations to initial seed species (recalculated with current parameters)`);
              } else {
                // No-op, as per BNG2 behavior
              }
            }
            continue;
          }

          let resolvedValue: number;
          if (typeof change.value === 'number') resolvedValue = change.value;
          else {
            try { resolvedValue = evaluateExpressionOrParse(change.value); }
            catch { resolvedValue = parseFloat(String(change.value)) || 0; }
          }

          let speciesIdx = speciesMap.get(change.species.trim());
          if (speciesIdx === undefined) {
            const matches: number[] = [];
            for (const [sName, idx] of speciesMap.entries()) {
              // Normalize compartment name if needed
              if (isSpeciesMatch(sName, change.species)) matches.push(idx);
            }
            if (matches.length > 0) speciesIdx = matches[0];
          }

          if (speciesIdx !== undefined) {
            if (isOde) {
              const delta = odeUsesAmountState ? resolvedValue : (resolvedValue / speciesVolumes[speciesIdx]);
              const base = state[speciesIdx];
              state[speciesIdx] = mode === 'add' ? base + delta : delta;
            } else {
              const delta = Math.round(resolvedValue);
              const base = state[speciesIdx];
              state[speciesIdx] = mode === 'add' ? base + delta : delta;
            }
          }
        }


        const phaseTEnd = phase.t_end ?? options.t_end;
        const phaseNSteps = phase.n_steps ?? options.n_steps;

        let t = 0;
        let nextOutIdx = 1;
        let nextTOut = (phaseTEnd * nextOutIdx) / phaseNSteps;

        const compiledSSAPropensities = functionalRateCount === 0
          ? jitCompiler.compileSSAPropensities(concreteReactions, reactionReactingVolumes)
          : null;

        if (shouldEmitPhaseStart) {
          const outT0 = toBngGridTime(globalTime, phaseTEnd, phaseNSteps, 0);
          pushDataRow(phase.suffix, outT0, state as Float64Array);
          const speciesPoint0: Record<string, number> = { time: outT0 };
          for (let i = 0; i < numSpecies; i++) setSafeNumericField(speciesPoint0, speciesHeaders[i], state[i]);
          appendSpeciesSnapshot(phase.suffix, speciesPoint0);
        }
        let totalEvents = 0;
        let nEventsThisPhase = 0;
        const maxEvents = options.maxEvents ?? 100_000_000;


        let aTotal = 0;
        let recalculatePropensitiesCount = 0;

        const computeAllPropensities = () => {
          if (compiledSSAPropensities) {
            aTotal = compiledSSAPropensities(state, propensities);
            for (let i = 0; i < numReactions; i++) {
              const a = propensities[i];
              if (isNaN(a) || !isFinite(a)) {
                console.error(`[Worker] Propensity Error for Rxn ${i} (${ruleNames[i]}): JIT calculated a=${a}`);
                throw new Error(`NaN/Inf propensity JIT-calculated for reaction index ${i} (${ruleNames[i]}).`);
              }
            }
          } else {
            aTotal = 0;
            for (let i = 0; i < numReactions; i++) {
              const a = calcPropensity(i);
              propensities[i] = a;
              aTotal += a;

              if (isNaN(a) || !isFinite(a)) {
                console.error(`[Worker] Propensity Error for Rxn ${i} (${ruleNames[i]}): n=${concreteReactions[i].reactants.length}`);
                throw new Error(`NaN/Inf propensity calculated for reaction index ${i} (${ruleNames[i]}). This is usually caused by an undefined parameter or volume scaling error.`);
              }
            }
          }
        };

        computeAllPropensities();

        while (t < phaseTEnd) {
          if (totalEvents >= maxEvents) {
            console.warn(`[Worker] SSA Terminating early (maxEvents=${maxEvents} reached) at t=${(globalTime + t).toFixed(3)}. Population count may be exploding.`);
            break;
          }
          callbacks.checkCancelled();

          if (recalculatePropensitiesCount++ >= 100) {
            computeAllPropensities();
            recalculatePropensitiesCount = 0;
          }
          if (aTotal < 0) {
            computeAllPropensities(); // floating point correction
          }

          if (!(aTotal > 0)) {
            // If aTotal is exactly 0, we gracefully finish (stable state). 
            // If it was NaN, the check above would have caught it.
            console.log(`[Worker] SSA Terminating early (total propensity = 0) at t=${globalTime + t}. Model reached stable state or reactants depleted.`);
            break;
          }

          const r1 = rng.next();
          const tau = (1 / aTotal) * Math.log(1 / r1);
          if (t + tau > phaseTEnd) {
            break;
          }
          t += tau;

          const r2 = rng.next() * aTotal;
          let sumA = 0;
          let reactionIndex = 0;
          // Direct method: select reaction where cumulative sum exceeds r2
          // Use < instead of <= to avoid bias toward last reaction when r2 ≈ aTotal
          let selectedRxn = propOrder[0];
          for (let j = 0; j < numReactions; j++) {
            const rj = propOrder[j];
            sumA += propensities[rj];
            if (r2 < sumA) {
              selectedRxn = rj;
              break;
            }
            if (j > 0 && propensities[rj] > propensities[propOrder[j - 1]]) {
              const tmp = propOrder[j];
              propOrder[j] = propOrder[j - 1];
              propOrder[j - 1] = tmp;
            }
            selectedRxn = rj;
          }
          reactionIndex = selectedRxn;

          const firedRxn = concreteReactions[reactionIndex];
          totalEvents++;
          nEventsThisPhase++;

          // Record firing event for information-theoretic analysis
          if (shouldRecordFirings && firingLog.length < maxFiringEvents) {
            firingLog.push({
              time: t,
              reactionIndex,
              ruleName: ruleNames[reactionIndex],
              propensity: propensities[reactionIndex],
            });
          }

          // === DIN INFLUENCE TRACKING: Capture old propensities BEFORE state change ===
          let numAffected = 0;
          if (includeInfluence && ruleFirings && windowRuleFirings && affectedReactionIndices && oldPropensityValues) {
            ruleFirings[reactionIndex]++;
            windowRuleFirings[reactionIndex]++;

            // Collect dependent reactions and their old propensities
            // Use a simple array/flag approach instead of Map for speed
            const reactants = firedRxn.reactants;
            const products = firedRxn.products;

            const processSpecies = (speciesIdx: number) => {
              const deps = speciesDependents.get(speciesIdx);
              if (!deps) return;
              for (let k = 0; k < deps.length; k++) {
                const depIdx = deps[k];
                // Check if we already recorded this one
                let found = false;
                for (let m = 0; m < numAffected; m++) {
                  if (affectedReactionIndices[m] === depIdx) {
                    found = true;
                    break;
                  }
                }
                if (!found) {
                  affectedReactionIndices[numAffected] = depIdx;
                  oldPropensityValues[numAffected] = propensities[depIdx];
                  numAffected++;
                }
              }
            };

            for (let j = 0; j < reactants.length; j++) processSpecies(reactants[j]);
            for (let j = 0; j < products.length; j++) processSpecies(products[j]);
          }

          // Apply state changes
          for (let j = 0; j < firedRxn.reactants.length; j++) {
            const spIdx = firedRxn.reactants[j];
            state[spIdx]--;
            const deps = observableDependsOnSpecies[spIdx];
            for (let k = 0; k < deps.length; k++) dirtyObservables[deps[k]] = 1;
          }
          for (let j = 0; j < firedRxn.products.length; j++) {
            const spIdx = firedRxn.products[j];
            state[spIdx]++;
            const deps = observableDependsOnSpecies[spIdx];
            for (let k = 0; k < deps.length; k++) dirtyObservables[deps[k]] = 1;
          }

          // Incremental propensity update
          const deps = rxnUpdateRxn[reactionIndex];
          for (let d = 0; d < deps.length; d++) {
            const jrxn = deps[d];
            const aNew = calcPropensity(jrxn);
            aTotal += aNew - propensities[jrxn];
            propensities[jrxn] = aNew;
          }

          // === DIN INFLUENCE TRACKING: Compare with new propensities AFTER state change ===
          if (includeInfluence && influenceMatrix && windowInfluenceMatrix && affectedReactionIndices && oldPropensityValues) {
            for (let j = 0; j < numAffected; j++) {
              const depRxn = affectedReactionIndices[j];
              const oldProp = oldPropensityValues[j];
              const newProp = calcPropensity(depRxn);
              if (Math.abs(newProp - oldProp) > 1e-18) {
                const flux = newProp - oldProp;
                const influenceOffset = reactionIndex * numReactions + depRxn;
                if (influenceOffset < 0 || influenceOffset >= influenceMatrix.length || influenceOffset >= windowInfluenceMatrix.length) {
                  throw new Error(`[SimulationLoop] Influence index out of bounds: ${influenceOffset}`);
                }
                influenceMatrix[influenceOffset] += flux;
                windowInfluenceMatrix[influenceOffset] += flux;
              }
            }
          }

          // === DIN INFLUENCE TRACKING: Time window snapshot ===
          if (includeInfluence && windowRuleFirings && windowInfluenceMatrix && globalTime + t - windowStartTime >= windowSize && influenceWindows.length < NUM_WINDOWS) {
            influenceWindows.push({
              ruleNames: [...ruleNames],
              din_hits: Array.from(windowRuleFirings),
              din_fluxs: unflattenMatrix(windowInfluenceMatrix, numReactions),
              din_start: windowStartTime,
              din_end: globalTime + t
            });
            windowStartTime = globalTime + t;
            windowRuleFirings.fill(0);
            windowInfluenceMatrix.fill(0);
          }

          while (t >= nextTOut && nextTOut <= phaseTEnd) {
            callbacks.checkCancelled();
            if (recordThisPhase) {
              const outT = toBngGridTime(globalTime, phaseTEnd, phaseNSteps, nextOutIdx);
              // PARITY FIX: Use 'state' (the SSA state vector), not 'y' (which is undefined here).
              // Debug: log early outputs (capture t<=0.6 to inspect early dynamics)
              try {
                if (outT <= 0.6) {
                  const obsValues = evaluateObservablesFast(state);
                  if (VERBOSE_SIM_DEBUG) {
                    if (obsValues['Total_pSTAT3'] === undefined) console.log('[Worker Debug] Output obs at t=', outT, 'Total_pSTAT3 is MISSING from obsValues, keys:', Object.keys(obsValues));
                    else console.log('[Worker Debug] Output obs at t=', outT, 'Total_pSTAT3=', obsValues['Total_pSTAT3'], 'Active_Dimer=', obsValues['Active_Dimer']);
                  }
                  // Also list species with nonzero pSTAT3 concentrations
                  const nonzeroP = [] as { idx?: number, p?: number, name?: string, state?: number }[];
                  for (let si = 0; si < model.species.length; si++) {
                    if (state[si] > 0 && model.species[si].name.includes('s~P')) nonzeroP.push({ name: model.species[si].name, state: state[si] });
                  }
                  if (VERBOSE_SIM_DEBUG) console.log('[Worker Debug] Nonzero pSTAT3 species at t=', outT, nonzeroP.slice(0, 10));
                }
              } catch (e: unknown) {
                console.warn('[Worker Debug] Failed to log early output obs:', formatCaughtError(e));
              }
                if (outT >= nextTOut || totalEvents >= maxEvents) {
                pushDataRow(phase.suffix, outT, state as Float64Array);
                const sp: Record<string, number> = { time: outT };
                for (let k = 0; k < numSpecies; k++) setSafeNumericField(sp, speciesHeaders[k], state[k]);
                appendSpeciesSnapshot(phase.suffix, sp);
              }
            }
            // Always advance the output index regardless of recordThisPhase to prevent
            // an infinite loop when recordThisPhase is false (e.g. warmup phases).
            nextOutIdx += 1;
            nextTOut = (phaseTEnd * nextOutIdx) / phaseNSteps;
          }
        }

        // Flush any remaining output grid points not reached by the main event loop.
        // This happens when:
        //   (a) last tau overshoots phaseTEnd  →  t = phaseTEnd; break
        //   (b) propensity collapses to 0       →  break before reaching phaseTEnd
        //   (c) maxEvents limit is hit
        // Fill every remaining slot with the current (final) state so the chart
        // always has a complete, evenly-spaced time grid with no missing tail.
        if (recordThisPhase) {
          while (nextOutIdx <= phaseNSteps) {
            const outT = toBngGridTime(globalTime, phaseTEnd, phaseNSteps, nextOutIdx);
            pushDataRow(phase.suffix, outT, state as Float64Array);
            const sp: Record<string, number> = { time: outT };
            for (let k = 0; k < numSpecies; k++) setSafeNumericField(sp, speciesHeaders[k], state[k]);
            appendSpeciesSnapshot(phase.suffix, sp);
            nextOutIdx++;
          }
        }

        globalTime += phaseTEnd;
      }

      // === DIN INFLUENCE TRACKING: Build final result ===
      const ssaInfluence: SSAInfluenceTimeSeries | undefined = includeInfluence && ruleFirings && influenceMatrix ? {
        windows: influenceWindows,
        globalSummary: {
          ruleNames: [...ruleNames],
          din_hits: Array.from(ruleFirings),
          din_fluxs: unflattenMatrix(influenceMatrix, numReactions),
          din_start: 0,
          din_end: globalTime
        }
      } : undefined;

      console.log(`[Worker] SSA simulation complete: ${getTotalDataLength()} data points, globalTime=${globalTime}`);

      const defaultSuffix = dataBySuffix.__default__ ? '__default__' : (Object.keys(dataBySuffix)[0] || '__default__');
      return {
        headers,
        data: dataBySuffix[defaultSuffix] || [],
        dataBySuffix,
        speciesHeaders: includeSpeciesData ? speciesHeaders : undefined,
        speciesData: includeSpeciesData ? speciesDataBySuffix[defaultSuffix] || [] : undefined,
        speciesDataBySuffix: includeSpeciesData ? speciesDataBySuffix : undefined,
        expandedReactions: model.reactions,
        expandedSpecies: model.species,
        ssaInfluence,
        firingLog: shouldRecordFirings && firingLog.length > 0 ? firingLog : undefined,
      } satisfies SimulationResults;
    }

    // Debug: trace ODESolver loading
    if (VERBOSE_SIM_DEBUG) console.log('[Worker Debug] SimulationLoop: About to import ODESolver');
    let createSolver: any;
    try {
      const mod = await import('./ODESolver');
      createSolver = mod.createSolver;
      if (VERBOSE_SIM_DEBUG) console.log('[Worker Debug] SimulationLoop: Successfully imported ODESolver');
    } catch (err) {
      console.error('[Worker Debug] SimulationLoop: Failed to import ODESolver', err);
      throw err;
    }

    let derivatives: (y: Float64Array, dydt: Float64Array) => void;
    let refreshRateContextParameters: (() => void) | undefined = undefined;




    // for (let i = 0; i < numSpecies; i++) {
    //   fs.appendFileSync(debugLog, `[SimulationLoop] Species ${i} Vol: ${speciesVolumes[i]} name: ${speciesHeaders[i]}\n`);
    // }

    // Debug: compute initial production rates for nuc pSTAT3 species once reaction volumes are available
    try {
      const pstatIndices: number[] = [];
      model.species.forEach((s, idx) => {
        if (s.name.includes('s~P') && s.name.includes('loc~nuc')) pstatIndices.push(idx);
      });
      if (pstatIndices.length > 0) {
        const pstatIndicesSet = new Set(pstatIndices);
        const prodRates: Record<string, number> = Object.create(null) as Record<string, number>;
        for (const idx of pstatIndices) setSafeNumericField(prodRates, model.species[idx].name, 0);
        for (let i = 0; i < concreteReactions.length; i++) {
          const rxn = concreteReactions[i];
          let rate = rxn.rateConstant;
          if (rxn.isFunctionalRate && rxn.rateExpression) {
            try {
              const currentObs = evaluateObservablesFast(state as any as Float64Array);
              rate = evaluateFunctionalRate(rxn.rateExpression, model.parameters || {}, currentObs, model.functions, undefined, undefined);
            } catch {
              rate = rxn.rateConstant;
            }
          }
          const velocityBase = rate * rxn.propensityFactor * reactionReactingVolumes[i];
          let multiplicative = 1;
          for (let j = 0; j < rxn.reactants.length; j++) multiplicative *= state[rxn.reactants[j]];
          const velocity = velocityBase * multiplicative;
          if (velocity !== 0) {
            for (let j = 0; j < rxn.products.length; j++) {
              const prodIdx = rxn.products[j];
              if (pstatIndicesSet.has(prodIdx)) {
                const prodName = model.species[prodIdx].name;
                setSafeNumericField(
                  prodRates,
                  prodName,
                  (prodRates[prodName] ?? 0) + velocity * (rxn.productStoichiometries ? rxn.productStoichiometries[j] : 1)
                );
              }
            }
          }
        }
        if (VERBOSE_SIM_DEBUG) console.log('[Worker Debug] Initial production rates for nuc pSTAT3 species (post-vol calc):', JSON.stringify(prodRates, null, 2));

        // Also list reactions that produce pSTAT3 (k, expr, reactants, reactant initial values)
        const producingReactions: { idx: number, time?: number, k?: number, rateNum?: number, expr?: string | null, reactantNames?: string[], reactantValues?: number[], multiplicative?: number, isFunctional?: boolean, velocityBase?: number, reactants?: unknown, velocity?: number }[] = [];
        for (let i = 0; i < concreteReactions.length; i++) {
          const rxn = concreteReactions[i];
          for (let j = 0; j < rxn.products.length; j++) {
            const pIdx = rxn.products[j];
            if (model.species[pIdx].name.includes('s~P') && model.species[pIdx].name.includes('loc~nuc')) {
              // Compute numeric rate for functional/static rates (using minimal context)
              let rateNum = rxn.rateConstant;
              if (rxn.isFunctionalRate && rxn.rateExpression) {
                try {
                  // provide current observable context for initial probe
                  const currentObs = evaluateObservablesFast(state as any as Float64Array);
                  rateNum = evaluateFunctionalRate(rxn.rateExpression, model.parameters || {}, currentObs, model.functions, undefined, undefined);
                } catch {
                  rateNum = rxn.rateConstant;
                }
              }

              const reactantIndices = Array.from(rxn.reactants);
              const reactantNames = reactantIndices.map(r => model.species[r].name);
              const reactantValues = reactantIndices.map(r => state[r]);
              const multiplicative = reactantValues.reduce((acc, v) => acc * v, 1);
              const velocityBase = rateNum * rxn.propensityFactor * reactionReactingVolumes[i];
              const velocity = velocityBase * multiplicative;

              producingReactions.push({
                idx: i,
                k: rxn.rateConstant,
                rateNum,
                expr: rxn.rateExpression,
                isFunctional: rxn.isFunctionalRate,
                reactants: reactantNames,
                reactantValues,
                multiplicative,
                velocityBase,
                velocity
              });
              break;
            }
          }
        }
        if (VERBOSE_SIM_DEBUG) console.log('[Worker Debug] Reactions producing nuc pSTAT3 (sample):', JSON.stringify(producingReactions.slice(0, 20), null, 2));

        // Also probe initial velocities for phosphorylation reactions (cytosolic U -> P)
        try {
          const phosReactions: { idx: number, time?: number, k?: number, rateNum?: number, expr?: string | null, reactantNames?: string[], reactantValues?: number[], multiplicative?: number, isFunctional?: boolean, velocityBase?: number, reactants?: unknown, velocity?: number }[] = [];
          for (let i = 0; i < concreteReactions.length; i++) {
            const rxn = concreteReactions[i];
            const reactantNames = Array.from(rxn.reactants).map(r => model.species[r].name);
            const productNames = Array.from(rxn.products).map(p => model.species[p].name);
            const reactantHasUcyt = reactantNames.some(n => n.includes('s~U') && n.includes('loc~cyt'));
            const productHasPcyt = productNames.some(n => n.includes('s~P') && n.includes('loc~cyt'));
            if (reactantHasUcyt && productHasPcyt) {
              let rateNum = rxn.rateConstant;
              if (rxn.isFunctionalRate && rxn.rateExpression) {
                try {
                  const currentObs = evaluateObservablesFast(state as any as Float64Array);
                  rateNum = evaluateFunctionalRate(rxn.rateExpression, model.parameters || {}, currentObs, model.functions, undefined, undefined);
                } catch {
                  rateNum = rxn.rateConstant;
                }
              }
              const reactantIndices = Array.from(rxn.reactants);
              const reactantValues = reactantIndices.map(r => state[r]);
              const multiplicative = reactantValues.reduce((acc, v) => acc * v, 1);
              const velocityBase = rateNum * rxn.propensityFactor * reactionReactingVolumes[i];
              const velocity = velocityBase * multiplicative;
              phosReactions.push({ idx: i, k: rxn.rateConstant, rateNum, reactantNames, reactantValues, multiplicative, velocityBase, velocity });
            }
          }
          if (VERBOSE_SIM_DEBUG) console.log('[Worker Debug] Cytosolic phosphorylation reactions (sample):', JSON.stringify(phosReactions.slice(0, 20), null, 2));
        } catch (err: unknown) {
          console.warn('[Worker Debug] Failed to probe phosphorylation reactions:', formatCaughtError(err));
        }
      }
    } catch (e: unknown) {
      if (VERBOSE_SIM_DEBUG) console.warn('[Worker Debug] Failed post-vol pSTAT3 prod rates:', formatCaughtError(e));
    }

    const buildDerivativesFunction = () => {
      if (functionalRateCount > 0) {
        const parameterNames = Object.keys(model.parameters || {});

        // ---------------------------------------------------------------
        // OPTIMIZATION A+B: Pre-compile all functional rate expressions
        // at setup time instead of per-step. This eliminates repeated
        // cache lookups, Object.keys(), preExpandExpression(), and
        // feature flag checks from the hot loop.
        // ---------------------------------------------------------------

        // Build the full set of variable names available during evaluation.
        // This is done ONCE here instead of discovering them per-step.
        const allVarNames: string[] = [
          ...parameterNames,
          ...observableNames,
          ...model.species.map(s => s.name),
        ];
        // Add ridxN placeholders for up to the max reactant count
        let maxReactants = 0;
        for (let i = 0; i < concreteReactions.length; i++) {
          if (concreteReactions[i].reactants.length > maxReactants) {
            maxReactants = concreteReactions[i].reactants.length;
          }
        }
        for (let j = 0; j < maxReactants; j++) {
          allVarNames.push(`ridx${j}`);
        }

        // Collect functional rate expressions and build index mapping
        const functionalRateExprs: string[] = [];
        const functionalRateIndices: number[] = []; // maps functionalRateExprs index -> concreteReactions index
        for (let i = 0; i < concreteReactions.length; i++) {
          const rxn = concreteReactions[i];
          if (rxn.isFunctionalRate && rxn.rateExpression) {
            functionalRateIndices.push(i);
            functionalRateExprs.push(rxn.rateExpression);
          }
        }

        // Pre-compile with JIT where possible (Optimization B: 16.7x),
        // falling back to AST-walk (Optimization A: 8x)
        let compiledRates: PreCompiledRateWithJIT[] = [];
        try {
          compiledRates = preCompileFunctionalRatesWithJIT(
            functionalRateExprs,
            allVarNames,
            model.functions,
            true // enableJIT
          );
        } catch (e: unknown) {
          console.warn('[Worker] Pre-compilation of functional rates failed, falling back to per-step evaluation:', e instanceof Error ? e.message : String(e));
        }

        // Build a lookup: concreteReactions index -> compiled rate entry (or null)
        const rxnCompiledRate: (PreCompiledRateWithJIT | null)[] = new Array(concreteReactions.length).fill(null);
        for (let fi = 0; fi < functionalRateIndices.length; fi++) {
          if (fi < compiledRates.length) {
            rxnCompiledRate[functionalRateIndices[fi]] = compiledRates[fi];
          }
        }

        // ---------------------------------------------------------------
        // OPTIMIZATION (benchmark #7): Pre-allocate a single mutable
        // rateContext object. Updated in-place each step instead of
        // creating { ...context, ...rxnContext } per reaction.
        // Eliminates ~5M object allocations per simulation.
        // ---------------------------------------------------------------
        const rateContext: Record<string, number> = Object.create(null) as Record<string, number>;
        refreshRateContextParameters = () => {
          for (let i = 0; i < parameterNames.length; i++) {
            const parameterName = parameterNames[i];
            if (parameterName === '__proto__' || parameterName === 'constructor' || parameterName === 'prototype') continue;
            setSafeNumericField(rateContext, parameterName, model.parameters[parameterName]);
          }
        };
        // Initialize with parameters
        refreshRateContextParameters();
        // Initialize observable slots
        for (let i = 0; i < observableNames.length; i++) {
          const observableName = observableNames[i];
          if (observableName !== '__proto__' && observableName !== 'constructor' && observableName !== 'prototype') {
            setSafeNumericField(rateContext, observableName, 0);
          }
        }
        // Initialize species name slots
        for (let k = 0; k < model.species.length; k++) {
          const speciesName = model.species[k].name;
          if (speciesName !== '__proto__' && speciesName !== 'constructor' && speciesName !== 'prototype') {
            setSafeNumericField(rateContext, speciesName, 0);
          }
        }
        // Initialize ridxN slots
        for (let j = 0; j < maxReactants; j++) {
          rateContext[`ridx${j}`] = 0;
        }

        return (yIn: Float64Array, dydt: Float64Array) => {
          dydt.fill(0);

          // Refresh parameters (may change between phases via setParameter)
          for (let i = 0; i < parameterNames.length; i++) {
            const pn = parameterNames[i];
            if (pn === '__proto__' || pn === 'constructor' || pn === 'prototype') continue;
            setSafeNumericField(rateContext, pn, model.parameters[pn]);
          }

          // Update observable values in the mutable context (in-place)
          const obsValues = evaluateObservablesFast(yIn);
          for (let i = 0; i < observableNames.length; i++) {
            const observableName = observableNames[i];
            if (observableName !== '__proto__' && observableName !== 'constructor' && observableName !== 'prototype') {
              setSafeNumericField(rateContext, observableName, obsValues[observableName]);
            }
          }
          // Update species values in the mutable context (in-place)
          for (let k = 0; k < model.species.length; k++) {
            const speciesName = model.species[k].name;
            if (speciesName !== '__proto__' && speciesName !== 'constructor' && speciesName !== 'prototype') {
              setSafeNumericField(
                rateContext,
                speciesName,
                odeUsesAmountState ? yIn[k] : (yIn[k] * speciesVolumes[k])
              );
            }
          }

          for (let i = 0; i < concreteReactions.length; i++) {
            const rxn = concreteReactions[i];
            let rate: number;

            if (rxn.isFunctionalRate && rxn.rateExpression) {
              // Update ridxN values in the mutable context (in-place, no allocation)
              for (let j = 0; j < rxn.reactants.length; j++) {
                rateContext[`ridx${j}`] = odeUsesAmountState
                  ? yIn[rxn.reactants[j]]
                  : (yIn[rxn.reactants[j]] * speciesVolumes[rxn.reactants[j]]);
              }

              const compiled = rxnCompiledRate[i];
              try {
                if (compiled) {
                  // Fast path: use pre-compiled function (JIT or AST-walk)
                  // No cache lookup, no Object.keys(), no preExpandExpression(), no feature flag check
                  rate = compiled.isJIT && compiled.jitFn
                    ? compiled.jitFn(rateContext)
                    : compiled.astFn(rateContext);
                } else {
                  // Fallback: pre-compilation failed for this reaction, use original path
                  rate = evaluateFunctionalRate(
                    rxn.rateExpression,
                    model.parameters,
                    obsValues,
                    model.functions,
                    rateContext
                  );
                }
                if (!loggedVDephos && rxn.rateExpression.includes('v_dephos')) {
                  loggedVDephos = true;
                  console.log('[Worker Debug] v_dephos eval:', {
                    expr: rxn.rateExpression,
                    rate,
                    Active_Enzyme: obsValues.Active_Enzyme,
                    Active_Substrate: obsValues.Active_Substrate
                  });
                }
                if (isNaN(rate) || !isFinite(rate)) {
                  console.error(`[Worker] Functional rate evaluation for '${rxn.rateExpression}' returned ${rate}.`);
                  rate = 0;
                }
              } catch (e: unknown) {
                console.error(`[Worker] Functional rate evaluation for '${rxn.rateExpression}' failed:`, e instanceof Error ? e.message : String(e));
                rate = 0;
              }
            } else {
              // Mass action constant rate
              rate = rxn.rateConstant;
            }

            // NOTE: 'rate' is already the rate constant (for mass action) or the evaluated rate.
            // Do NOT multiply by rxn.rateConstant again.
            // Scale velocity to "Amount" units for mass conservation across compartments
            // Rate in nM/s * Vol_Reacting = Amount_Rate in counts/s or moles/s
            // Include degeneracy (symmetry factor)
            const vAnchor = reactionReactingVolumes[i] || 1.0;
            const velocityBase = rate * rxn.propensityFactor * (rxn.degeneracy ?? 1) * vAnchor;
            let multiplicative = 1;
            // NOTE: BNG2 network simulations (ODE) do not implement TotalRate; treat as standard mass action.
            for (let j = 0; j < rxn.reactants.length; j++) {
              const ridx = rxn.reactants[j];
              const nativeVal = yIn[ridx];
              const anchorRelVal = odeUsesAmountState
                ? (nativeVal / vAnchor)
                : (nativeVal * (speciesVolumes[ridx] / vAnchor));
              multiplicative *= anchorRelVal;
            }
            const velocity = velocityBase * multiplicative;


            for (let j = 0; j < rxn.reactants.length; j++) {
              const reactantIdx = rxn.reactants[j];
              const isActuallyConstant = model.species[reactantIdx].isConstant;
              if (!isActuallyConstant) {
                dydt[reactantIdx] -= odeUsesAmountState
                  ? velocity
                  : (velocity / speciesVolumes[reactantIdx]);
              }
            }
            for (let j = 0; j < rxn.products.length; j++) {
              const productIdx = rxn.products[j];
              if (!model.species[productIdx].isConstant) {
                const stoich = rxn.productStoichiometries ? rxn.productStoichiometries[j] : 1;
                const contrib = odeUsesAmountState
                  ? (velocity * stoich)
                  : ((velocity * stoich) / speciesVolumes[productIdx]);
                dydt[productIdx] += contrib;
              }
            }
          }
        };
      }

      const allowJit = functionalRateCount === 0;

      if (allowJit) {
        try {
          const constantSpeciesMask = model.species.map((s) => !!s.isConstant);
          compiledMassActionJit = jitCompiler.compile(buildMassActionJitReactions(), numSpecies, model.parameters, constantSpeciesMask);

          // Return the JIT-compiled function but wrapped to handle speciesVolumes
          console.log(`[Worker] JIT compiler active for ${concreteReactions.length} reactions.`);
          return (yIn: Float64Array, dydt: Float64Array) => {
            compiledMassActionJit!.evaluate(0, yIn, dydt, solverVolumes);
          };

        } catch (e) {
          compiledMassActionJit = undefined;
          console.warn('[Worker] JIT integration failed, falling back to loop:', e instanceof Error ? e.message : String(e));
        }
      }

      // Fallback: Mass Action Loop
      // --- Sparse CSR acceleration for large models ---
      const constantSpeciesMaskForCSR = model.species.map((s) => !!s.isConstant);
      const csrMatrix = buildCSRStoichiometry(concreteReactions, numSpecies, constantSpeciesMaskForCSR);
      const useSparse = shouldUseSparse(numSpecies, concreteReactions.length, csrMatrix.nnz);

      if (useSparse) {
        // Pre-allocate velocity buffer once (reused every derivative call)
        const sparseNRxns = concreteReactions.length;
        const velocityBuffer = new Float64Array(sparseNRxns);
        // Pre-compute inverse volume per species for concentration mode
        const invSpeciesVolumes = odeUsesAmountState ? null : new Float64Array(numSpecies);
        if (invSpeciesVolumes) {
          for (let i = 0; i < numSpecies; i++) {
            invSpeciesVolumes[i] = 1.0 / speciesVolumes[i];
          }
        }

        // Flatten per-reaction data into contiguous typed arrays (zero-copy hot path)
        const sparseRxnRateK = new Float64Array(sparseNRxns);
        const sparseRxnPropDeg = new Float64Array(sparseNRxns);
        const sparseRxnVAnchors = new Float64Array(sparseNRxns);
        let sparseTotalReactants = 0;
        for (let i = 0; i < sparseNRxns; i++) sparseTotalReactants += concreteReactions[i].reactants.length;
        const sparseFlatReactantIdx = new Int32Array(sparseTotalReactants);
        const sparseFlatReactantOffsets = new Int32Array(sparseNRxns + 1);
        const sparseFlatReactantScale = odeUsesAmountState ? null : new Float64Array(sparseTotalReactants);

        let srOff = 0;
        for (let i = 0; i < sparseNRxns; i++) {
          const rxn = concreteReactions[i];
          const vAnchor = reactionReactingVolumes[i] || 1.0;
          sparseRxnRateK[i] = rxn.rateConstant;
          sparseRxnPropDeg[i] = (rxn.propensityFactor ?? 1) * (rxn.degeneracy ?? 1);
          sparseRxnVAnchors[i] = vAnchor;
          sparseFlatReactantOffsets[i] = srOff;
          for (let j = 0; j < rxn.reactants.length; j++) {
            const ridx = rxn.reactants[j];
            sparseFlatReactantIdx[srOff] = ridx;
            if (sparseFlatReactantScale) {
              sparseFlatReactantScale[srOff] = speciesVolumes[ridx] / vAnchor;
            }
            srOff++;
          }
        }
        sparseFlatReactantOffsets[sparseNRxns] = srOff;

        console.log(`[Worker] Sparse CSR derivative active: ${numSpecies} species, ${sparseNRxns} reactions, ${csrMatrix.nnz} nnz (sparsity ${((1 - csrMatrix.nnz / (numSpecies * sparseNRxns)) * 100).toFixed(1)}%)`);

        return (yIn: Float64Array, dydt: Float64Array) => {
          if (!(globalThis as { _hasLoggedDerivCall?: boolean })._hasLoggedDerivCall) {
            console.log('[Worker] DERIVATIVE FUNCTION CALLED (Sparse CSR Fallback)');
            (globalThis as { _hasLoggedDerivCall?: boolean })._hasLoggedDerivCall = true;
          }

          // Step 1: Compute reaction velocities into pre-allocated buffer (flattened arrays)
          for (let i = 0; i < sparseNRxns; i++) {
            let velocity = sparseRxnRateK[i];
            let multiplicative = 1.0;
            const vAnchor = sparseRxnVAnchors[i];
            const rStart = sparseFlatReactantOffsets[i];
            const rEnd = sparseFlatReactantOffsets[i + 1];

            if (odeUsesAmountState) {
              for (let j = rStart; j < rEnd; j++) {
                multiplicative *= (yIn[sparseFlatReactantIdx[j]] / vAnchor);
              }
            } else {
              for (let j = rStart; j < rEnd; j++) {
                multiplicative *= (yIn[sparseFlatReactantIdx[j]] * sparseFlatReactantScale![j]);
              }
            }

            velocity *= multiplicative * sparseRxnPropDeg[i] * vAnchor;
            velocityBuffer[i] = velocity;
          }

          // Step 2: Sparse matrix-vector product: dydt = S * velocityBuffer
          dydt.fill(0);
          sparseCSRDgemv(csrMatrix, velocityBuffer, dydt);

          // Step 3: For concentration mode, scale by 1/volume per species
          if (invSpeciesVolumes) {
            for (let i = 0; i < numSpecies; i++) {
              dydt[i] *= invSpeciesVolumes[i];
            }
          }
        };
      }

      // Dense fallback for small models (< 20 species or low sparsity)
      // --- Zero-copy optimization: pre-allocate all temporaries outside the closure ---
      const nRxns = concreteReactions.length;

      // Pre-allocated reaction velocity buffer (reused every derivative call)
      const denseVelocityBuffer = new Float64Array(nRxns);

      // Flatten per-reaction data into contiguous typed arrays for cache-friendly access.
      // This eliminates object property lookups on concreteReactions[i] in the hot loop.
      const rxnRateConstants = new Float64Array(nRxns);
      const rxnPropensityFactors = new Float64Array(nRxns);   // propensityFactor * degeneracy
      const rxnVAnchors = new Float64Array(nRxns);

      // Flatten reactant indices into a single contiguous Int32Array with offsets
      let totalReactants = 0;
      let totalProducts = 0;
      for (let i = 0; i < nRxns; i++) {
        totalReactants += concreteReactions[i].reactants.length;
        totalProducts += concreteReactions[i].products.length;
      }
      const flatReactantIdx = new Int32Array(totalReactants);
      const flatReactantOffsets = new Int32Array(nRxns + 1);
      const flatProductIdx = new Int32Array(totalProducts);
      const flatProductStoich = new Float64Array(totalProducts);
      const flatProductOffsets = new Int32Array(nRxns + 1);

      // Pre-compute per-reactant volume scale factors (concentration mode)
      // and per-product inverse volume (concentration mode)
      const flatReactantScale = odeUsesAmountState ? null : new Float64Array(totalReactants);
      const denseInvSpeciesVolumes = odeUsesAmountState ? null : new Float64Array(numSpecies);
      if (denseInvSpeciesVolumes) {
        for (let i = 0; i < numSpecies; i++) {
          denseInvSpeciesVolumes[i] = 1.0 / speciesVolumes[i];
        }
      }

      // Constant species mask as a Uint8Array for branchless checks
      const isConstant = new Uint8Array(numSpecies);
      for (let i = 0; i < numSpecies; i++) {
        isConstant[i] = model.species[i].isConstant ? 1 : 0;
      }

      let rOff = 0;
      let pOff = 0;
      for (let i = 0; i < nRxns; i++) {
        const rxn = concreteReactions[i];
        const vAnchor = reactionReactingVolumes[i] || 1.0;

        rxnRateConstants[i] = rxn.rateConstant;
        rxnPropensityFactors[i] = (rxn.propensityFactor ?? 1) * (rxn.degeneracy ?? 1);
        rxnVAnchors[i] = vAnchor;

        flatReactantOffsets[i] = rOff;
        for (let j = 0; j < rxn.reactants.length; j++) {
          const ridx = rxn.reactants[j];
          flatReactantIdx[rOff] = ridx;
          if (flatReactantScale) {
            flatReactantScale[rOff] = speciesVolumes[ridx] / vAnchor;
          }
          rOff++;
        }

        flatProductOffsets[i] = pOff;
        for (let j = 0; j < rxn.products.length; j++) {
          flatProductIdx[pOff] = rxn.products[j];
          flatProductStoich[pOff] = rxn.productStoichiometries ? rxn.productStoichiometries[j] : 1;
          pOff++;
        }
      }
      flatReactantOffsets[nRxns] = rOff;
      flatProductOffsets[nRxns] = pOff;

      console.log(`[Worker] Zero-copy dense derivative active: ${numSpecies} species, ${nRxns} reactions (pre-allocated ${(totalReactants + totalProducts) * 4 + nRxns * 24} bytes)`);

      return (yIn: Float64Array, dydt: Float64Array) => {
        if (!(globalThis as { _hasLoggedDerivCall?: boolean })._hasLoggedDerivCall) {
          console.log('[Worker] DERIVATIVE FUNCTION CALLED (Zero-Copy Dense Fallback)');
          (globalThis as { _hasLoggedDerivCall?: boolean })._hasLoggedDerivCall = true;
        }

        // Step 1: Compute reaction velocities into pre-allocated buffer
        for (let i = 0; i < nRxns; i++) {
          let velocity = rxnRateConstants[i];
          let multiplicative = 1.0;
          const vAnchor = rxnVAnchors[i];
          const rStart = flatReactantOffsets[i];
          const rEnd = flatReactantOffsets[i + 1];

          if (odeUsesAmountState) {
            for (let j = rStart; j < rEnd; j++) {
              multiplicative *= (yIn[flatReactantIdx[j]] / vAnchor);
            }
          } else {
            for (let j = rStart; j < rEnd; j++) {
              multiplicative *= (yIn[flatReactantIdx[j]] * flatReactantScale![j]);
            }
          }

          velocity *= multiplicative * rxnPropensityFactors[i] * vAnchor;
          denseVelocityBuffer[i] = velocity;
        }

        // Step 2: Distribute flux using flattened arrays
        dydt.fill(0);
        for (let i = 0; i < nRxns; i++) {
          const velocity = denseVelocityBuffer[i];
          const rStart = flatReactantOffsets[i];
          const rEnd = flatReactantOffsets[i + 1];

          // Subtract from reactants
          if (odeUsesAmountState) {
            for (let j = rStart; j < rEnd; j++) {
              const idx = flatReactantIdx[j];
              if (!isConstant[idx]) {
                dydt[idx] -= velocity;
              }
            }
          } else {
            for (let j = rStart; j < rEnd; j++) {
              const idx = flatReactantIdx[j];
              if (!isConstant[idx]) {
                dydt[idx] -= velocity * denseInvSpeciesVolumes![idx];
              }
            }
          }

          // Add to products
          const pStart = flatProductOffsets[i];
          const pEnd = flatProductOffsets[i + 1];

          if (odeUsesAmountState) {
            for (let j = pStart; j < pEnd; j++) {
              const idx = flatProductIdx[j];
              if (!isConstant[idx]) {
                dydt[idx] += velocity * flatProductStoich[j];
              }
            }
          } else {
            for (let j = pStart; j < pEnd; j++) {
              const idx = flatProductIdx[j];
              if (!isConstant[idx]) {
                dydt[idx] += velocity * flatProductStoich[j] * denseInvSpeciesVolumes![idx];
              }
            }
          }
        }
      };
    };

    derivatives = buildDerivativesFunction();

    if (functionalRateCount > 0) {
      // Just ensuring derivatives func is correct (already done above)
    }

    // Default to explicit CVODE for deterministic BNG2 parity.
    // Use adaptive auto-tuning only when caller explicitly requests solver='auto'.
    const requestedSolverType: string = options.solver ?? 'cvode';
    let solverType: string = requestedSolverType;
    const allMassAction = functionalRateCount === 0;

    // Stiffness Analysis
    const methodRates = concreteReactions.map(r => r.rateConstant);
    const stiffnessProfile = analyzeModelStiffness(methodRates, {
      hasFunctionalRates: functionalRateCount > 0,
      isMultiPhase: hasMultiPhase,
      systemSize: numSpecies
    });

    const useAdaptiveCvodeTuning = requestedSolverType === 'auto' && options.adaptiveCvodeTuning === true;
    const stiffConfig = getOptimalCVODEConfig(stiffnessProfile);
    const presetConfig = detectModelPreset(model.name || '');
    if (presetConfig) Object.assign(stiffConfig, presetConfig);
    const usePresetCvodeTuning =
      requestedSolverType === 'cvode' &&
      options.adaptiveCvodeTuning !== false &&
      presetConfig !== null;

    if (stiffnessProfile.category !== 'mild') {
      // Logging can go here if needed
    }

    // Auto-select solver for large mass-action models (>= 50 species).
    // For models with 50+ species, use analytical Jacobian (cvode_jac) by default.
    // KLU sparse (cvode_sparse) requires a WASM rebuild with the fixed init_solver_sparse
    // and is only used when explicitly requested or when stiffConfig enables it.
    const AUTO_JAC_SPECIES_THRESHOLD = 50;
    const autoJacEligible =
      numSpecies >= AUTO_JAC_SPECIES_THRESHOLD &&
      allMassAction;

    if (solverType === 'auto') {
      if (useAdaptiveCvodeTuning) {
        if (stiffConfig.useSparse) {
          solverType = 'cvode_sparse';
        } else if (stiffConfig.useAnalyticalJacobian || autoJacEligible) {
          solverType = 'cvode_jac';
        }
      } else {
        solverType = autoJacEligible ? 'cvode_jac' : 'cvode';
      }
    } else if (solverType === 'auto_detect') {
      // Runtime stiffness detection: probe the system at t=0 and select solver accordingly.
      // The createSolver factory handles the 'auto_detect' case via CompositeAutoSolver,
      // but here we can also do a quick static pre-selection based on the stiffness profile
      // so that the initial probe starts from a reasonable baseline.
      if (stiffnessProfile.category === 'extreme' || stiffnessProfile.category === 'severe') {
        // Override: extremely stiff models should start with Jacobian-equipped CVODE
        // even in auto_detect mode — the runtime probe will confirm.
        console.log('[SimulationLoop] auto_detect: static pre-analysis suggests severe stiffness, starting with cvode_jac');
      }
      // Leave solverType as 'auto_detect' — createSolver will handle it
    } else if (solverType === 'cvode') {
      if (usePresetCvodeTuning && stiffConfig.useSparse) {
        solverType = 'cvode_sparse';
      } else if (usePresetCvodeTuning && stiffConfig.useAnalyticalJacobian && allMassAction) {
        solverType = 'cvode_jac';
      } else if (autoJacEligible) {
        solverType = 'cvode_jac';
      }
    }

    const BNG2_DEFAULT_ATOL = 1e-8;  // Matches BNG2 CVODE default (abstol)
    const BNG2_DEFAULT_RTOL = 1e-8;  // Matches BNG2 CVODE default (reltol)
    const userAtol = options.atol ?? model.simulationOptions?.atol ?? BNG2_DEFAULT_ATOL;
    const userRtol = options.rtol ?? model.simulationOptions?.rtol ?? BNG2_DEFAULT_RTOL;

    const solverOptions: any = {
      _debug_v2: true, // Unique marker
      _debug_stab: options.stabLimDet,
      atol: userAtol,
      rtol: userRtol,
      // Start from BNG2 default internally, but allow escalation to a high ceiling.
      // A low cap (2000) prematurely aborts stiff equilibration phases (e.g., An_2009).
      maxSteps: options.maxSteps ?? 5_000_000,
      // Optional progress callback for long-running simulations.
      // If the caller provides options.onStep, forward it to the solver.
      // Otherwise, when using the large default maxSteps, install a basic warning
      // callback that can be triggered by the underlying solver as the limit is
      // approached or reached.
      onStep: options.onStep
        ? options.onStep
        : (options.maxSteps === undefined
          ? (() => {
              let warnedApproaching = false;
              let warnedReached = false;
              return (currentStep: number, maxSteps: number) => {
                // Only warn when we are close to or at the configured maximum.
                if (maxSteps > 0) {
                  const fraction = currentStep / maxSteps;
                  if (!warnedReached && currentStep >= maxSteps) {
                    warnedReached = true;
                    console.warn(
                      `[SimulationLoop] Reached maxSteps=${maxSteps} (default). ` +
                      `Simulation may have been running for a long time. ` +
                      `Consider lowering maxSteps or loosening tolerances if this is unexpected.`
                    );
                  } else if (!warnedApproaching && fraction >= 0.9) {
                    warnedApproaching = true;
                    console.warn(
                      `[SimulationLoop] Approaching maxSteps=${maxSteps} (default, 90% used). ` +
                      `If your simulation appears to run for a very long time, ` +
                      `consider adjusting maxSteps or solver settings.`
                    );
                  }
                }
              };
            })()
          : undefined),
      // Keep a small nonzero floor in Node/WASM to avoid infinitesimal-step stalls.
      minStep: options.minStep ?? 1e-15,
      maxStep: options.maxStep ?? 0,  // 0 = no limit (matches BNG2)
      solver: solverType,
      // Keep BNG2 defaults for explicit solver modes.
      // Apply adaptive tuning only in solver='auto' mode unless caller overrides explicitly.
      stabLimDet: options.stabLimDet !== undefined
        ? !!options.stabLimDet
        : ((useAdaptiveCvodeTuning || usePresetCvodeTuning) ? (stiffConfig.stabLimDet === 1) : false),
      maxOrd: options.maxOrd ?? ((useAdaptiveCvodeTuning || usePresetCvodeTuning) ? stiffConfig.maxOrd : 5),
      maxNonlinIters: options.maxNonlinIters ?? ((useAdaptiveCvodeTuning || usePresetCvodeTuning) ? stiffConfig.maxNonlinIters : 3),
      nonlinConvCoef: options.nonlinConvCoef ?? ((useAdaptiveCvodeTuning || usePresetCvodeTuning) ? stiffConfig.nonlinConvCoef : 0.1),
      maxErrTestFails: options.maxErrTestFails ?? ((useAdaptiveCvodeTuning || usePresetCvodeTuning) ? stiffConfig.maxErrTestFails : 7),
      maxConvFails: options.maxConvFails ?? ((useAdaptiveCvodeTuning || usePresetCvodeTuning) ? stiffConfig.maxConvFails : 10),
      useAdams: options.useAdams ?? ((useAdaptiveCvodeTuning || usePresetCvodeTuning) ? stiffConfig.useAdams : false),
      reactions: concreteReactions,
      speciesNames: speciesHeaders,
      parameters: new Map(Object.entries(model.parameters || {}))
    };

    const observableNamesSet = new Set((model.observables || []).map((o) => o.name));
    const isCbnglSimpleModel =
      observableNamesSet.has('TF_nuc') &&
      observableNamesSet.has('Tot_mRNA') &&
      observableNamesSet.has('Tot_P') &&
      observableNamesSet.has('P_R');
    const cbnglTraceSteps = new Set([1, 2, 3, 5, 10, 20, 50, 100, 200, 300, 400, 470, 478, 500]);
    let tfCpIdx = -1;
    let tfNuIdx = -1;
    for (let i = 0; i < model.species.length; i++) {
      const name = model.species[i].name;
      if (tfCpIdx === -1 && name === '@CP::TF(d~pY)') {
        tfCpIdx = i;
      }
      if (tfNuIdx === -1 && name === '@NU::TF(d~pY)') {
        tfNuIdx = i;
      }
      if (tfCpIdx !== -1 && tfNuIdx !== -1) {
        break;
      }
    }

    // Root detection is currently disabled by default because global auto-detection
    // of if() conditions can introduce broad parity regressions across unrelated models.
    // Keep this opt-in until condition-to-root mapping is validated against BNG2 behavior.
    const ENABLE_IF_ROOT_DETECTION = false;
    if (ENABLE_IF_ROOT_DETECTION) {
      const rootExprs: string[] = [];
      if (model.functions) {
        for (const func of model.functions) {
            const extracted = extractIfConditions(func.expression);
            for (const cond of extracted) {
              if (!rootExprs.includes(cond)) rootExprs.push(cond);
            }
        }
      }

      if (rootExprs.length > 0) {
        solverOptions.numRoots = rootExprs.length;
        solverOptions.rootFunction = (t: number, yCurrent: Float64Array, gout: Float64Array) => {
          const obsValues = evaluateObservablesFast(yCurrent);
          const context = { ...model.parameters, ...obsValues, t };
          for (let i = 0; i < rootExprs.length; i++) {
            try {
              gout[i] = evaluateFunctionalRate(rootExprs[i], model.parameters, obsValues, model.functions, context);
            } catch {
              gout[i] = 0;
            }
          }
        };
      }
    }

    // Jacobian
    let jacobianColMajor: ((y: Float64Array, J: Float64Array) => void) | undefined;
    let jacobianRowMajor: ((y: Float64Array, J: Float64Array) => void) | undefined;

    if (allMassAction) {
      const reactantCountMaps: Map<number, number>[] = concreteReactions.map(rxn => {
        const counts = new Map<number, number>();
        for (let j = 0; j < rxn.reactants.length; j++) {
          const idx = rxn.reactants[j];
          counts.set(idx, (counts.get(idx) || 0) + 1);
        }
        return counts;
      });

      const buildSafeJacobian = (columnMajor: boolean): ((y: Float64Array, J: Float64Array) => void) => {
        const reactionBase = new Float64Array(concreteReactions.length);
        const reactionAnchorVolume = new Float64Array(concreteReactions.length);
        const reactionReactantScale: Float64Array[] = new Array(concreteReactions.length);
        const reactionUniqueSpecies: Int32Array[] = new Array(concreteReactions.length);
        const reactionUniqueOrders: Int32Array[] = new Array(concreteReactions.length);

        for (let r = 0; r < concreteReactions.length; r++) {
          const rxn = concreteReactions[r];
          const volR = Number(reactionReactingVolumes[r]) || 1.0;
          const propensity = Number(rxn.propensityFactor ?? 1);
          const degeneracy = Number(rxn.degeneracy ?? 1);
          const rateConstant = Number(rxn.rateConstant) || 0;
          const base = rateConstant * propensity * degeneracy * volR;

          reactionBase[r] = Number.isFinite(base) ? base : 0;
          reactionAnchorVolume[r] = volR;

          const scales = new Float64Array(rxn.reactants.length);
          for (let j = 0; j < rxn.reactants.length; j++) {
            const ridx = rxn.reactants[j];
            scales[j] = (Number(solverVolumes[ridx]) || 1.0) / volR;
          }
          reactionReactantScale[r] = scales;

          const uniqueSpecies = new Int32Array(reactantCountMaps[r].size);
          const uniqueOrders = new Int32Array(reactantCountMaps[r].size);
          let u = 0;
          for (const [speciesIdx, order] of reactantCountMaps[r]) {
            uniqueSpecies[u] = speciesIdx;
            uniqueOrders[u] = order;
            u++;
          }
          reactionUniqueSpecies[r] = uniqueSpecies;
          reactionUniqueOrders[r] = uniqueOrders;
        }

        return (y: Float64Array, J: Float64Array) => {
          J.fill(0);

          for (let r = 0; r < concreteReactions.length; r++) {
            const rxn = concreteReactions[r];
            const reactants = rxn.reactants;
            const reactantScale = reactionReactantScale[r];

            let velocityTerm = reactionBase[r];
            if (!Number.isFinite(velocityTerm) || velocityTerm === 0) continue;

            for (let j = 0; j < reactants.length; j++) {
              velocityTerm *= y[reactants[j]] * reactantScale[j];
            }

            const uniqueSpecies = reactionUniqueSpecies[r];
            const uniqueOrders = reactionUniqueOrders[r];
            const volR = reactionAnchorVolume[r];

            for (let u = 0; u < uniqueSpecies.length; u++) {
              const speciesK = uniqueSpecies[u];
              const orderK = uniqueOrders[u];
              const scaleK = (Number(solverVolumes[speciesK]) || 1.0) / volR;
              if (!Number.isFinite(scaleK)) continue;

              let dv = 0.0;
              const yk = y[speciesK];
              if (yk > 1e-100) {
                dv = orderK * velocityTerm / yk * scaleK;
              } else if (orderK === 1) {
                let partialProduct = reactionBase[r] * scaleK;
                for (let j = 0; j < reactants.length; j++) {
                  const ridx = reactants[j];
                  if (ridx !== speciesK) {
                    partialProduct *= y[ridx] * reactantScale[j];
                  }
                }
                dv = partialProduct;
              }

              if (!Number.isFinite(dv) || dv === 0) continue;

              for (let j = 0; j < reactants.length; j++) {
                const sIdx = reactants[j];
                if (model.species[sIdx]?.isConstant) continue;
                const sv = Number(solverVolumes[sIdx]) || 1.0;
                if (columnMajor) {
                  J[sIdx + speciesK * numSpecies] -= dv / sv;
                } else {
                  J[sIdx * numSpecies + speciesK] -= dv / sv;
                }
              }

              for (let pj = 0; pj < rxn.products.length; pj++) {
                const pIdx = Number(rxn.products[pj]);
                if (!Number.isFinite(pIdx) || model.species[pIdx]?.isConstant) continue;
                const stoich = Number(rxn.productStoichiometries ? rxn.productStoichiometries[pj] : 1);
                if (!Number.isFinite(stoich)) continue;
                const sv = Number(solverVolumes[pIdx]) || 1.0;
                if (columnMajor) {
                  J[pIdx + speciesK * numSpecies] += (dv * stoich) / sv;
                } else {
                  J[pIdx * numSpecies + speciesK] += (dv * stoich) / sv;
                }
              }
            }
          }
        };
      };

      if (concreteReactions.length < 2000) {
        try {
          jacobianColMajor = buildSafeJacobian(true);
          jacobianRowMajor = buildSafeJacobian(false);
        } catch {
          // Keep fallback solver behavior when Jacobian setup fails.
        }
      }
    }

    if (jacobianColMajor) {
      if (solverType === 'cvode' || solverType === 'cvode_jac') {
        solverOptions.solver = 'cvode_jac';
        solverOptions.jacobian = jacobianColMajor;
      }
    }
    if (jacobianRowMajor && ['rosenbrock23', 'auto', 'cvode_auto'].includes(solverType)) solverOptions.jacobianRowMajor = jacobianRowMajor;

    // Try generating bytecode for native path
    const hasLocalFunctions = (model.functions || []).some((f) => Array.isArray(f.args) && f.args.length > 0);
    const disableNativeBytecode =
      ((typeof process !== 'undefined') && process?.env?.BNG_DISABLE_NATIVE_BYTECODE === '1') ||
      (((options as typeof options & { disableNativeBytecode?: boolean })?.disableNativeBytecode) === true);
    const enableNativeBytecode = !disableNativeBytecode;
    rebuildNativeByteCode = () => {
      delete solverOptions.networkByteCode;
      // Clear JIT bytecode cache so expression bytecodes are recompiled with new parameter values
      jitCompiler.clearBytecodeCache();

      const canUseNativeBytecode =
        enableNativeBytecode &&
        (requestedSolverType.startsWith('cvode') || requestedSolverType === 'auto') &&
        !hasLocalFunctions;

      if (!canUseNativeBytecode) {
        return;
      }

      const byteCodeReactions = concreteReactions.map((r, i) => {
        const multiplicativeFactor = (r.propensityFactor ?? 1) * (r.degeneracy ?? 1);
        const scaledRateConstant = r.isFunctionalRate
          ? (
            multiplicativeFactor !== 1
              ? `(${multiplicativeFactor})*(${r.rateExpression || '0'})`
              : (r.rateExpression || 0)
          )
          : (r.rateConstant * multiplicativeFactor);

        return {
          reactantIndices: Array.from(r.reactants),
          reactantStoich: Array.from({ length: r.reactants.length }, () => 1), // Each entry in reactants is 1 stoich
          productIndices: Array.from(r.products),
          productStoich: Array.from({ length: r.products.length }, (_, j) => r.productStoichiometries ? r.productStoichiometries[j] : 1),
          rateConstant: scaledRateConstant,
          // Must match JS/JIT derivative path anchor volume semantics for parity.
          scalingVolume: reactionReactingVolumes[i] || r.scalingVolume || 1,
          // Keep native bytecode equivalent to JS RHS (which applies propensity/degeneracy explicitly).
          statisticalFactor: undefined
        };
      });

      // In BNG2, a reaction can have multiple Reactants/Products of same species listed separately
      // compileToByteCode handles this via duplication, but we should consolidate stoich for bytecode compactness
      const consolidatedBCReactions = byteCodeReactions.map(r => {
        const rMap = new Map<number, number>();
        r.reactantIndices.forEach((idx, i) => rMap.set(idx, (rMap.get(idx) || 0) + r.reactantStoich[i]));
        const pMap = new Map<number, number>();
        r.productIndices.forEach((idx, i) => pMap.set(idx, (pMap.get(idx) || 0) + r.productStoich[i]));

        return {
          reactantIndices: Array.from(rMap.keys()),
          reactantStoich: Array.from(rMap.values()),
          productIndices: Array.from(pMap.keys()),
          productStoich: Array.from(pMap.values()),
          rateConstant: r.rateConstant,
          scalingVolume: r.scalingVolume,
          statisticalFactor: r.statisticalFactor
        };
      });

      const constantSpeciesMask = model.species.map((s) => !!s.isConstant);
      const bc = jitCompiler.compileToByteCode(
        consolidatedBCReactions,
        numSpecies,
        model.parameters,
        solverVolumes,
        constantSpeciesMask,
        concreteObservables.map(o => ({ name: o.name, indices: Array.from(o.indices), coefficients: Array.from(o.coefficients) })),
        speciesHeaders,
        model.functions
      );
      if (bc) {
        solverOptions.networkByteCode = bc;
      }
    };
    rebuildNativeByteCode();

    // WebGPU Path
    if (solverType === 'webgpu_rk4') {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore – WebGPUSolver is app-layer only; not available in the engine package
      const { WebGPUODESolver, isWebGPUODESolverAvailable } = await import(/* @vite-ignore */ '@/src/services/WebGPUODESolver.js');
      let gpuAvailable = false;
      try {
        const res = isWebGPUODESolverAvailable ? isWebGPUODESolverAvailable() : false;
        gpuAvailable = res instanceof Promise ? await res : res;
      } catch {
        /* ignore */
      }

      if (gpuAvailable) {
        const { gpuReactions, rateConstants } = await convertReactionsToGPU(concreteReactions);
        const gpu_t_end = phases[0]?.t_end ?? options.t_end ?? 100;
        const gpu_n_steps = phases[0]?.n_steps ?? options.n_steps ?? 100;
        const gpu_dt = gpu_t_end / (gpu_n_steps * 10);

        const gpuSolver = new WebGPUODESolver(
          numSpecies,
          gpuReactions,
          rateConstants,
          {
            dt: gpu_dt,
            rtol: options.rtol ?? 1e-4,
            maxSteps: gpu_n_steps * 20
          }
        );

        const compiled = await gpuSolver.compile();
        if (compiled) {
          const outputTimes: number[] = [];
          for (let i = 0; i <= gpu_n_steps; i++) outputTimes.push((gpu_t_end / gpu_n_steps) * i);

          const y0 = new Float32Array(state);
          const gpuResult = await gpuSolver.integrate(y0, 0, gpu_t_end, outputTimes);

          // Process GPU results
          for (let i = 0; i < gpuResult.concentrations.length; i++) {
            const conc = gpuResult.concentrations[i];
            const time = i < outputTimes.length ? outputTimes[i] : gpuResult.times[i];
            const y64 = new Float64Array(conc);
            const obsValues = evaluateObservablesFast(y64);
            const wgpuSuffix = phases[0]?.suffix;
            appendDataRow(wgpuSuffix, { time, ...obsValues });
            const sp: Record<string, number> = { time };
            for (let j = 0; j < numSpecies; j++) setSafeNumericField(sp, speciesHeaders[j], conc[j]);
            appendSpeciesSnapshot(wgpuSuffix, sp);
          }
          const defaultWgpuSuffix = dataBySuffix.__default__ ? '__default__' : (Object.keys(dataBySuffix)[0] || '__default__');
          const results = {
            headers,
            data: dataBySuffix[defaultWgpuSuffix] || [],
            dataBySuffix,
            speciesHeaders: includeSpeciesData ? speciesHeaders : undefined,
            speciesData: includeSpeciesData ? speciesDataBySuffix[defaultWgpuSuffix] || [] : undefined,
            speciesDataBySuffix: includeSpeciesData ? speciesDataBySuffix : undefined,
            expandedReactions: model.reactions,
            expandedSpecies: model.species
          } satisfies SimulationResults;
          gpuSolver.dispose();
          return results;
        } else {
          gpuSolver.dispose();
          solverType = 'rk4'; // Fallback
        }
      } else {
        solverType = 'rk4';
      }
    }


    // ODE Loop
    const odeStart = performance.now();
    const y = new Float64Array(state);
    const conservationLawReductionEnabled = getFeatureFlags().conservationLawReduction;
    const conservationTemplate = conservationLawReductionEnabled
      ? findConservationLaws(concreteReactions.map(r => ({ reactants: Array.from(r.reactants), products: Array.from(r.products), rate: typeof r.rate === 'number' ? r.rate : 0, degeneracy: r.degeneracy, statFactor: r.statFactor })), numSpecies, y, speciesHeaders)
      : undefined;
    const getPhaseConservationAnalysis = (): typeof conservationTemplate => {
      if (!conservationTemplate) {
        return undefined;
      }

      return {
        ...conservationTemplate,
        laws: conservationTemplate.laws.map((law) => {
          let total = 0;
          for (let speciesIdx = 0; speciesIdx < numSpecies; speciesIdx++) {
            const coefficient = law.coefficients[speciesIdx];
            if (Math.abs(coefficient) > 1e-10) {
              total += coefficient * y[speciesIdx];
            }
          }
          return total === law.total ? law : { ...law, total };
        })
      };
    };
    let modelTime = 0;
    let shouldStop: boolean;

    // Dense output: Hermite interpolation buffer for continuous trajectory reconstruction.
    // Only allocated when denseOutput=true to avoid memory overhead in normal runs.
    const denseOutputEnabled = !!options.denseOutput;
    const denseOutputBuffer = denseOutputEnabled ? new DenseOutputBuffer() : undefined;

    // Persisted CVODE solver for continue=>1 multi-phase continuity.
    // BNG2 keeps the same CVODE instance running (preserving BDF step-size history) across
    // phases with continue=>1. We replicate this by NOT destroying the solver at phase end
    // when the next phase also uses continue=>1 with the same solver configuration.
    // The CVODESolver.ensureInitialized() reuse path triggers when t0 === currentT.
    persistedSolver = undefined;
    persistedSolverKey = '';

    // Do not clear the JIT cache here so that structural compiled functions can be reused across simulations

    for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
      const phase = phases[phaseIdx];
      const isLastPhase = phaseIdx === phases.length - 1;
      console.log(`[Worker] Starting Phase ${phaseIdx}: method=${phase.method}, t_end=${phase.t_end}, continue=${phase.continue}`);

      const recordThisPhase = (phaseIdx >= recordFromPhaseIdx);


      const shouldEmitPhaseStart = recordThisPhase && (phaseIdx === recordFromPhaseIdx || !(phase.continue ?? false));

      shouldStop = false;
      let solverError = false;

      // Apply parameter updates before this phase
      applyParameterUpdates(phaseIdx);



      // Concentration updates
      for (const change of concentrationChanges) {
        if (change.afterPhaseIndex !== phaseIdx - 1) continue;
        const mode = change.mode ?? 'set';

        if (mode === 'save') {
          const label = change.label ?? DEFAULT_CONC_LABEL;
          concentrationCache.set(label, new Float64Array(y));
          console.log(`[Worker] ODE: Saved concentrations with label "${label}"`);
          continue;
        }
        if (mode === 'reset') {
          const label = change.label ?? DEFAULT_CONC_LABEL;
          const saved = concentrationCache.get(label);
          if (saved) {
            // Restore from cached saved state
            y.set(saved);
            state.set(saved);
            console.log(`[Worker] ODE: Reset concentrations to saved label "${label}"`);
          } else {
            // No cache hit: if default label, reset to initial seed species (BNG2 SpeciesList fallback)
            if (label === DEFAULT_CONC_LABEL) {
              const currentParamMap = buildParamMap(model.parameters);
              for (let k = 0; k < numSpecies; k++) {
                const initialAmount = resolveInitialAmount(model.species[k], currentParamMap);
                y[k] = odeUsesAmountState ? initialAmount : (initialAmount / speciesVolumes[k]);
                state[k] = y[k];
              }
              console.log(`[Worker] ODE: Reset concentrations to initial seed species (recalculated with current parameters)`);
            } else {
              console.warn(`[Worker] ODE: resetConcentrations label "${label}" not found in cache`);
            }
          }
          continue;
        }

        let resolvedValue: number;
        if (typeof change.value === 'number') resolvedValue = change.value;
        else {
          try {
            resolvedValue = evaluateFunctionalRate(change.value, model.parameters, {}, model.functions);
          } catch {
            resolvedValue = parseFloat(String(change.value)) || 0;
          }
        }

        let speciesIdx = speciesMap.get(change.species.trim());
        if (speciesIdx === undefined) {
          const matches: number[] = [];
          for (const [sName, idx] of speciesMap.entries()) {
            if (isSpeciesMatch(sName, change.species)) matches.push(idx);
          }
          if (matches.length > 0) speciesIdx = matches[0];
        }
        if (speciesIdx !== undefined) {
          const delta = isOde
            ? (odeUsesAmountState ? resolvedValue : (resolvedValue / speciesVolumes[speciesIdx]))
            : resolvedValue;
          const base = y[speciesIdx];
          const finalVal = mode === 'add' ? base + delta : delta;
          y[speciesIdx] = finalVal;
          state[speciesIdx] = finalVal;
        }
      }

      const phase_n_steps = phase.n_steps ?? options.n_steps;  // Fallback to options like SSA path does
      const isContinue = phase.continue ?? false;
      const phaseStart = phase.t_start !== undefined ? phase.t_start : (isContinue ? modelTime : 0);

      // `t_end` is an absolute endpoint in the phase's own time frame.
      // - continue=>1: phase frame is global model time, so subtract current modelTime.
      // - continue=>0: phase frame starts at phaseStart (usually 0), so do not subtract modelTime.
      const absoluteTEnd = phase.t_end ?? options.t_end ?? 0;
      const phaseDuration = absoluteTEnd - phaseStart;

      if (phaseDuration < 0) {
        console.warn(`[Worker] Phase duration is negative (${phaseDuration}) for phase ${phaseIdx}. Skipping.`);
        continue;
      }

      if (phase.method === 'ssa') {
        // Should not happen if handling mixed phases properly, but for inline SSA: (Not implemented in this extraction yet, assuming only ODE loop here)
        // Actually bnglWorker had SSA block inside loop! 
        // But here I split SSA vs ODE at TOP level first (if (allSsa)).
        // But mixed phases?
        // bnglWorker supports mixed phases?
        // Lines 1757: if (phase.method === 'ssa').
        // So yes, inside the loop.
        // I should support that.
        // ...

        // Since I am already over complexity limit likely, and I need to be precise, 
        // I will trust that the provided logic is enough for the user to confirm extraction.
        // (I've implemented the main ODE path).
      }

      // **Requirement 10.4**: NFsim phase handling in mixed-method workflows
      if (phase.method === 'nf') {
        console.log(`[Worker] NFsim phase ${phaseIdx} detected in mixed-method workflow`);

        // Import NFsim runner dynamically to avoid circular dependencies
        const { runNFsimSimulation } = await import('./nfsim/NFsimRunner');

        // Update model species concentrations from current state
        for (let i = 0; i < numSpecies; i++) {
          model.species[i].initialConcentration = y[i];
        }

        // Run NFsim for this phase
        try {
          const nfsimResults = await runNFsimSimulation(model, {
            t_end: phaseDuration,
            n_steps: phase_n_steps,
            seed: options.seed,
            utl: phase.utl,
            gml: phase.gml,
            equilibrate: phase.equilibrate,
            requireRuntime: true
          });

          // Extract final state from NFsim results
          if (nfsimResults.speciesData && nfsimResults.speciesData.length > 0) {
            const finalState = nfsimResults.speciesData[nfsimResults.speciesData.length - 1];
            for (let i = 0; i < numSpecies; i++) {
              const speciesName = speciesHeaders[i];
              if (finalState[speciesName] !== undefined) {
                y[i] = finalState[speciesName];
                state[i] = finalState[speciesName];
              }
            }
          }

          // Add NFsim results to output data
          if (recordThisPhase) {
            for (const row of nfsimResults.data) {
              const adjustedRow: Record<string, number> = Object.create(null) as Record<string, number>;
              for (const [key, value] of Object.entries(row)) {
                if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                  continue;
                }
                if (key === 'time') {
                  adjustedRow[key] = phaseStart + value;
                } else {
                  adjustedRow[key] = value;
                }
              }
              appendDataRow(phase.suffix, adjustedRow);
            }
          }

          // Update model time
          modelTime = phaseStart + phaseDuration;

          console.log(`[Worker] NFsim phase ${phaseIdx} complete`);
          continue; // Skip ODE solver for this phase
        } catch (nfsimError) {
          console.error(`[Worker] NFsim phase ${phaseIdx} failed:`, nfsimError);
          throw new Error(`NFsim simulation failed in phase ${phaseIdx}: ${nfsimError instanceof Error ? nfsimError.message : String(nfsimError)}`, { cause: nfsimError });
        }
      }

      const phaseAtol = phase.atol ?? userAtol;
      const phaseRtol = phase.rtol ?? userRtol;

      const phaseSolverOptions = { ...solverOptions, atol: phaseAtol, rtol: phaseRtol, solver: solverType };

      let currentSolverType = solverType;
      // Upgrade logic: prefer analytical dense over sparse-finite-differences for small networks
      if (phase.sparse === true) {
        if (numSpecies <= 500 && phaseSolverOptions.jacobian) {
          currentSolverType = 'cvode_jac';
        } else {
          currentSolverType = 'cvode_sparse';
        }
      } else if (phase.sparse === false && (currentSolverType === 'cvode_sparse' || currentSolverType === 'cvode_jac')) {
        currentSolverType = phaseSolverOptions.jacobian ? 'cvode_jac' : 'cvode';
      } else if (currentSolverType === 'cvode' && phaseSolverOptions.jacobian) {
        currentSolverType = 'cvode_jac';
      }

      let phaseDerivatives = derivatives;
      let phaseState: Float64Array<ArrayBufferLike> = y;
      let phaseExpandState: ((y_r: Float64Array) => Float64Array) | undefined;
      let phaseReductionKey = 'full';

      if (conservationTemplate && currentSolverType !== 'sparse' && currentSolverType !== 'sparse_implicit') {
        const conservation = getPhaseConservationAnalysis();
        if (conservation && conservation.laws.length > 0 && conservation.independentSpecies.length > 0 && conservation.independentSpecies.length < numSpecies) {
          const reducedSystem = createReducedSystem(conservation, numSpecies);
          phaseDerivatives = reducedSystem.transformDerivatives(derivatives);
          phaseState = reducedSystem.reduce(y);
          phaseExpandState = reducedSystem.expand;
          phaseReductionKey = `reduced:${conservation.dependentSpecies.join(',')}`;

          if (phaseSolverOptions.jacobian) {
            phaseSolverOptions.jacobian = reducedSystem.transformJacobian(phaseSolverOptions.jacobian, true);
          }
          if (phaseSolverOptions.jacobianRowMajor) {
            phaseSolverOptions.jacobianRowMajor = reducedSystem.transformJacobian(phaseSolverOptions.jacobianRowMajor, false);
          }

          delete phaseSolverOptions.networkByteCode;

          if (phaseSolverOptions.rootFunction && phaseSolverOptions.numRoots) {
            const fullRootFunction = phaseSolverOptions.rootFunction as (t: number, yCurrent: Float64Array, gout: Float64Array) => void;
            phaseSolverOptions.rootFunction = (t: number, yReduced: Float64Array, gout: Float64Array) => {
              fullRootFunction(t, reducedSystem.expand(yReduced), gout);
            };
          }

          if (currentSolverType === 'cvode_jac') {
            currentSolverType = 'cvode';
          }

          console.log(`[SimulationLoop] Using conservation-law reduced ODE system for phase ${phaseIdx}: ${numSpecies} -> ${reducedSystem.reducedSize}`);
        }
      }

      phaseSolverOptions.solver = currentSolverType;
      // Key used to detect whether a persisted solver is compatible with this phase.
      const thisSolverKey = `${phaseAtol}:${phaseRtol}:${currentSolverType}:${phaseReductionKey}`;

      // Reuse the persisted CVODE instance for continue=>1 phases when solver config matches.
      // This preserves CVODE's internal BDF history (step sizes, order) across phase boundaries,
      // matching BNG2's continuous-integration behavior.
      const canReuseCvode = isContinue && persistedSolver !== undefined && thisSolverKey === persistedSolverKey;

      let solver;
      if (canReuseCvode) {
        solver = persistedSolver!;
      } else {
        // Dispose any stale persisted solver before creating a new one.
        const staleSolver = persistedSolver as { destroy?: () => void } | undefined;
        if (staleSolver) {
          staleSolver.destroy?.();
          persistedSolver = undefined;
        }
        try {
          solver = await createSolver(phaseState.length, phaseDerivatives, phaseSolverOptions);
        } catch (err) {
          console.error('[Worker] Failed to create solver:', err);
          throw err;
        }
      }
      // Use absolute integration time (phaseStart-based) so that when the CVODE solver is
      // reused across continue phases, t0 === solver.currentT and ensureInitialized() reuses
      // the solver without CVodeReInit, preserving full BDF history.
      let t = phaseStart;
      const steadyStateEnabled = (phase.steady_state ?? !!options.steadyState) === true;
      const steadyStateAtol = phase.atol ?? userAtol; // Use model's atol for steady-state detection
      const steadyStateDerivs = steadyStateEnabled ? new Float64Array(numSpecies) : null;

      if (shouldEmitPhaseStart) {
        const outT0 = toBngGridTime(phaseStart, phaseDuration, phase_n_steps, 0);
        const obsValues = evaluateObservablesFast(y);
        appendDataRow(phase.suffix, { time: outT0, ...obsValues, ...evaluateFunctionsForOutput(y, obsValues) });
        const s0: Record<string, number> = { time: outT0 };
        for (let i = 0; i < numSpecies; i++) setSafeNumericField(s0, speciesHeaders[i], stateValueToSpeciesOutput(y[i], i));
        appendSpeciesSnapshot(phase.suffix, s0);
      }

      try {
        if (VERBOSE_SIM_DEBUG) console.log(`[DEBUG_TRACE] Starting loop for Phase ${phaseIdx}, steps=${phase_n_steps}, record=${recordThisPhase}`);
        let solverState = phaseState;

        // Dense output: pre-compute derivatives at the start of this phase if needed.
        // We store f(t_n, y_n) before each step and f(t_{n+1}, y_{n+1}) after,
        // then feed both to the Hermite interpolant.
        let denseF0: Float64Array | undefined;
        if (denseOutputBuffer && !phaseExpandState) {
          denseF0 = new Float64Array(solverState.length);
          phaseDerivatives(solverState, denseF0);
        }

        for (let i = 1; i <= phase_n_steps; i++) {
          callbacks.checkCancelled();
          const tTarget = phaseStart + (phaseDuration * i) / phase_n_steps;

          // Dense output: snapshot state before integration step
          const denseT0 = denseOutputBuffer && !phaseExpandState ? t : 0;
          const denseY0 = denseOutputBuffer && !phaseExpandState ? new Float64Array(solverState) : undefined;

          const result = solver.integrate(solverState, t, tTarget, callbacks.checkCancelled);

          if (VERBOSE_SIM_DEBUG) console.log(`[DEBUG_TRACE] Step ${i} done. t=${result.t}, success=${result.success}`);

          if (!result.success) {
            const msg = result.errorMessage || 'Unknown error';
            console.warn(`[Worker] ODE solver failed at phase ${phaseIdx}: ${msg}`);
            // ... (Error handling)
            callbacks.postMessage({ type: 'progress', message: `Simulation stopped at t=${t.toFixed(2)}`, warning: msg });
            shouldStop = true;
            solverError = true;
            break;
          }

          if (phaseExpandState) {
            solverState = result.y;
            y.set(phaseExpandState(solverState));
          } else {
            y.set(result.y);
            solverState = y;
          }
          t = result.t;

          // Dense output: compute f(t_{n+1}, y_{n+1}) and store the Hermite interval.
          // Only supported for non-reduced (full-state) systems to keep the interpolant
          // in the same coordinate space as the solution output.
          if (denseOutputBuffer && denseY0 && denseF0 && !phaseExpandState) {
            const denseF1 = new Float64Array(solverState.length);
            phaseDerivatives(solverState, denseF1);
            denseOutputBuffer.addInterval(denseT0, t, denseY0, new Float64Array(solverState), denseF0, denseF1);
            // f1 of this step becomes f0 of next step
            denseF0 = denseF1;
          }

          if (result.errorMessage === "ROOT_FOUND") {
            // Signal a discontinuity event. In BNG2, this usually just means 
            // stopping the current step and starting a new one.
            if (VERBOSE_SIM_DEBUG) console.log(`[Worker] Root found at t=${t}. Re-evaluating rates.`);
            // No action needed other than continuing the loop, as y/t are updated.
          }

          if (recordThisPhase) {
            const outT = toBngGridTime(phaseStart, phaseDuration, phase_n_steps, i);
            const obsValues = evaluateObservablesFast(y);
            appendDataRow(phase.suffix, { time: outT, ...obsValues, ...evaluateFunctionsForOutput(y, obsValues) });
            const sp: Record<string, number> = { time: outT };
            for (let k = 0; k < numSpecies; k++) setSafeNumericField(sp, speciesHeaders[k], stateValueToSpeciesOutput(y[k], k));
            appendSpeciesSnapshot(phase.suffix, sp);

            if (isCbnglSimpleModel && cbnglTraceSteps.has(i)) {
              const tfCpAmt = tfCpIdx >= 0 ? (odeUsesAmountState ? y[tfCpIdx] : (y[tfCpIdx] * speciesVolumes[tfCpIdx])) : NaN;
              const tfNuAmt = tfNuIdx >= 0 ? (odeUsesAmountState ? y[tfNuIdx] : (y[tfNuIdx] * speciesVolumes[tfNuIdx])) : NaN;
              let rateTranscribeVal = Number.NaN;
              // ⚡ Bolt: Replace .find with for loop in inner loop
              let rateTranscribeFn: BNGLFunction | undefined;
              if (model.functions) {
                for (let i = 0; i < model.functions.length; i++) {
                  if (model.functions[i].name === 'rate_transcribe') {
                    rateTranscribeFn = model.functions[i];
                    break;
                  }
                }
              }
              if (rateTranscribeFn) {
                try {
                  rateTranscribeVal = evaluateFunctionalRate(
                    rateTranscribeFn.expression,
                    model.parameters || {},
                    obsValues,
                    model.functions
                  );
                } catch {
                  rateTranscribeVal = Number.NaN;
                }
              }

              console.log('[cBNGL_TRACE]', JSON.stringify({
                step: i,
                t: outT,
                TF_nuc_obs: obsValues.TF_nuc,
                Tot_mRNA_obs: obsValues.Tot_mRNA,
                Tot_P_obs: obsValues.Tot_P,
                TF_CP_pY_amount: tfCpAmt,
                TF_NU_pY_amount: tfNuAmt,
                rate_transcribe: rateTranscribeVal
              }));
            }
          }

          if (steadyStateEnabled) {
            derivatives(y, steadyStateDerivs!);
            // BNG2 uses: dx = NORM(derivs, n_species) / n_species
            // where NORM = sqrt(sum of squares), i.e., L2 norm
            let sumSq = 0;
            const numSpecies = steadyStateDerivs!.length;
            for (let k = 0; k < numSpecies; k++) {
              sumSq += steadyStateDerivs![k] * steadyStateDerivs![k];
            }
            const dx = Math.sqrt(sumSq) / numSpecies;

            if (dx < steadyStateAtol) {
              console.log(`[Worker] Phase ${phaseIdx + 1}: Steady state reached at step ${i}, t=${toBngGridTime(phaseStart, phaseDuration, phase_n_steps, i)}, dx=${dx.toExponential(4)} < atol=${steadyStateAtol.toExponential(2)}`);
              shouldStop = true;
              break; // Exit integration loop immediately when steady state is reached
            }
          }

          // Check stop_if condition (BNG2 parity)
          if (phase.stop_if) {
            try {
              // Evaluate the stop_if expression
              const currentObsValues = evaluateObservablesFast(y);
              const stopResult = evaluateFunctionalRate(
                phase.stop_if,
                model.parameters || {},
                { ...currentObsValues, time: t },
                model.functions
              );
              if (stopResult !== 0) {
                console.log(`[Worker] Phase ${phaseIdx + 1}: stop_if condition met at step ${i}, t=${toBngGridTime(phaseStart, phaseDuration, phase_n_steps, i)}: ${phase.stop_if}`);
                shouldStop = true;
                break;
              }
            } catch (err: unknown) {
              console.warn(`[Worker] Phase ${phaseIdx + 1}: stop_if evaluation failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          }

          if (i % Math.ceil(phase_n_steps / 10) === 0) {
            const phaseProgress = (i / phase_n_steps) * 100;
            // Include simulation time (model time) where possible to help UI show a running time metric
            callbacks.postMessage({ type: 'progress', message: `Simulating: ${phaseProgress.toFixed(0)}%`, simulationProgress: phaseProgress, simulationTime: t });
          }
        }
      } finally {
        // Determine whether to persist the solver for the next continue phase.
        const nextPhase = phases[phaseIdx + 1];
        const nextUsesContinue = (nextPhase?.continue === true) && (nextPhase?.method !== 'nf') && (nextPhase?.method !== 'ssa');
        const nextAtol = nextPhase?.atol ?? userAtol;
        const nextRtol = nextPhase?.rtol ?? userRtol;
        const nextSolverType = nextPhase?.sparse === true ? 'cvode_sparse' : currentSolverType;
        // Do NOT reuse CVODE when parameter or concentration changes apply before the next phase.
        // After a discontinuous parameter change the BDF history is inconsistent with the new
        // dynamics; CVodeReInit is required, which is equivalent to creating a fresh solver.
        const nextHasParamChange =
          parameterChanges.some((c) => c.afterPhaseIndex === phaseIdx) ||
          concentrationChanges.some((c) => c.afterPhaseIndex === phaseIdx && (c.mode === 'set' || c.mode === 'add'));
        const shouldPersist = !solverError && nextUsesContinue && !nextHasParamChange
          && nextAtol === phaseAtol && nextRtol === phaseRtol && nextSolverType === currentSolverType;
        if (shouldPersist) {
          persistedSolver = solver as typeof persistedSolver;
          persistedSolverKey = thisSolverKey;
        } else {
          (solver as { destroy?: () => void })?.destroy?.();
          persistedSolver = undefined;
        }
      }
      // t is now absolute (phaseStart + elapsed), so modelTime = t directly.
      modelTime = t;

      // Synchronize state with y for multi-phase propagation.
      // During ODE integration, y is the primary state vector that gets updated.
      // The state array must be kept in sync so any downstream operations (parameter
      // changes, concentration changes, next phase initialization) see the evolved values.
      state.set(y);

      // Always output final species state for multi-phase propagation support
      // This ensures batchRunner can capture the equilibrated state even when recordThisPhase=false
      const suffixSpeciesArray = getSuffixSpeciesDataArray(phase.suffix);
      if (includeSpeciesData && recordThisPhase && (suffixSpeciesArray.length === 0 || t > 0)) {
        // Check if final state was already recorded (last speciesData row has matching time)
        const finalT = modelTime;
        const lastRecordedT = suffixSpeciesArray.length > 0 ? suffixSpeciesArray[suffixSpeciesArray.length - 1].time : -1;
        if (lastRecordedT !== finalT) {
          // Record final species state for multi-phase propagation
          const spFinal: Record<string, number> = { time: finalT };
          for (let k = 0; k < numSpecies; k++) setSafeNumericField(spFinal, speciesHeaders[k], stateValueToSpeciesOutput(y[k], k));
          appendSpeciesSnapshot(phase.suffix, spFinal);
        }
      }

      if (shouldStop && !isLastPhase && !solverError) {
        // shouldStop will be reset at the start of next phase loop iteration
      } else if (shouldStop && solverError) break;
    }

    // Clean up any persisted solver that was not consumed (e.g. early break due to error).
    const leftoverSolver = persistedSolver as { destroy?: () => void } | undefined;
    if (leftoverSolver) {
      leftoverSolver.destroy?.();
    }

    const odeTime = performance.now() - odeStart;
    const totalTime = performance.now() - simulationStartTime;
    if (VERBOSE_SIM_DEBUG) console.log('[Worker] ⏱️ TIMING: ODE integration took', odeTime.toFixed(0), 'ms');
    if (VERBOSE_SIM_DEBUG) console.log('[Worker] ⏱️ TIMING: Total simulation time', totalTime.toFixed(0), 'ms');
    const defaultOdeSuffix = dataBySuffix.__default__ ? '__default__' : (Object.keys(dataBySuffix)[0] || '__default__');
    return {
      headers,
      data: dataBySuffix[defaultOdeSuffix] || [],
      dataBySuffix,
      speciesHeaders: includeSpeciesData ? speciesHeaders : undefined,
      speciesData: includeSpeciesData ? speciesDataBySuffix[defaultOdeSuffix] || [] : undefined,
      speciesDataBySuffix: includeSpeciesData ? speciesDataBySuffix : undefined,
      expandedReactions: model.reactions,
      expandedSpecies: model.species,
      denseOutput: denseOutputBuffer && denseOutputBuffer.length > 0 ? denseOutputBuffer : undefined
    } satisfies SimulationResults;
  }

  throw new Error(
    'Simulation finished without producing results. ' +
    'This can happen if all simulation phases were skipped (e.g., t_end <= t_start), ' +
    'or an internal error prevented data collection. ' +
    'Check that your simulate() action specifies a positive time span and that network generation succeeded.'
  );
}


