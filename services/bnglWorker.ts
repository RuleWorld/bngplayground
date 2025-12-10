/// <reference lib="webworker" />

import type {
  BNGLModel,
  BNGLSpecies,
  SimulationOptions,
  SimulationResults,
  WorkerRequest,
  WorkerResponse,
  SerializedWorkerError,
  NetworkGeneratorOptions,
  GeneratorProgress,
} from '../types';
import { NetworkGenerator } from '../src/services/graph/NetworkGenerator';
import { BNGLParser } from '../src/services/graph/core/BNGLParser';
import { Species } from '../src/services/graph/core/Species';
import { Rxn } from '../src/services/graph/core/Rxn';
import { GraphCanonicalizer } from '../src/services/graph/core/Canonical';
import { parseBNGL as parseBNGLModel } from './parseBNGL';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

// Version marker to verify updated code is loaded
console.log('[Worker] bnglWorker v2.1.0 - products fix applied 2024-12-07');

type JobState = {
  cancelled: boolean;
  controller?: AbortController;
};

const jobStates = new Map<number, JobState>();

// Ring buffer for logs to prevent memory blowup
class LogRingBuffer {
  private buffer: string[] = [];
  private maxSize: number;
  private writeIndex = 0;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  add(message: string) {
    this.buffer[this.writeIndex] = `[${new Date().toISOString()}] ${message}`;
    this.writeIndex = (this.writeIndex + 1) % this.maxSize;
  }

  getAll(): string[] {
    const result: string[] = [];
    for (let i = 0; i < this.maxSize; i++) {
      const index = (this.writeIndex - 1 - i + this.maxSize) % this.maxSize;
      if (this.buffer[index]) {
        result.push(this.buffer[index]);
      } else {
        break;
      }
    }
    return result.reverse();
  }

  clear() {
    this.buffer = [];
    this.writeIndex = 0;
  }
}

const logBuffer = new LogRingBuffer(1000);

// Override console.log to use ring buffer
const originalConsoleLog = console.log;
console.log = (...args: any[]) => {
  const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
  logBuffer.add(message);
  originalConsoleLog(...args); // Still log to actual console for debugging
};
const cachedModels = new Map<number, BNGLModel>();
let nextModelId = 1;
// LRU cache size limit for cached models inside the worker
const MAX_CACHED_MODELS = 8;

const touchCachedModel = (modelId: number) => {
  const m = cachedModels.get(modelId);
  if (!m) return;
  // move to the end to mark as recently used
  cachedModels.delete(modelId);
  cachedModels.set(modelId, m);
};

const registerJob = (id: number) => {
  if (typeof id !== 'number' || Number.isNaN(id)) return;
  jobStates.set(id, { cancelled: false, controller: new AbortController() });
};

const markJobComplete = (id: number) => {
  jobStates.delete(id);
};

const cancelJob = (id: number) => {
  const entry = jobStates.get(id);
  if (entry) {
    entry.cancelled = true;
    if (entry.controller) {
      entry.controller.abort();
    }
  }
};

const ensureNotCancelled = (id: number) => {
  const entry = jobStates.get(id);
  if (entry && entry.cancelled) {
    throw new DOMException('Operation cancelled by main thread', 'AbortError');
  }
};

const serializeError = (error: unknown): SerializedWorkerError => {
  if (error instanceof DOMException) {
    return { name: error.name, message: error.message, stack: error.stack ?? undefined };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? undefined };
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = typeof (error as { message?: unknown }).message === 'string' ? (error as { message: string }).message : 'Unknown error';
    const name = 'name' in error && typeof (error as { name?: unknown }).name === 'string' ? (error as { name: string }).name : undefined;
    const stack = 'stack' in error && typeof (error as { stack?: unknown }).stack === 'string' ? (error as { stack: string }).stack : undefined;
    return { name, message, stack };
  }
  return { message: typeof error === 'string' ? error : 'Unknown error' };
};

ctx.addEventListener('error', (event) => {
  const payload: SerializedWorkerError = {
    ...serializeError(event.error ?? event.message ?? 'Unknown worker error'),
    details: {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    },
  };
  ctx.postMessage({ id: -1, type: 'worker_internal_error', payload });
  event.preventDefault();
});

ctx.addEventListener('unhandledrejection', (event) => {
  const payload: SerializedWorkerError = serializeError(event.reason ?? 'Unhandled rejection in worker');
  ctx.postMessage({ id: -1, type: 'worker_internal_error', payload });
  event.preventDefault();
});

// --- Helper: Compartment Utilities ---
const getCompartment = (s: string) => {
  const prefix = s.match(/^@([A-Za-z0-9_]+):/);
  if (prefix) return prefix[1];
  const suffix = s.match(/@([A-Za-z0-9_]+)$/);
  if (suffix) return suffix[1];
  return null;
};

const removeCompartment = (s: string) => {
  return s.replace(/^@[A-Za-z0-9_]+:/, '').replace(/@[A-Za-z0-9_]+$/, '');
};

// --- Helper: Match Single Molecule Pattern ---
function matchMolecule(patMol: string, specMol: string): boolean {
  // patMol and specMol are "Name(components)" strings, no compartments.

  const patMatch = patMol.match(/^([A-Za-z0-9_]+)(?:\(([^)]*)\))?$/);
  const specMatch = specMol.match(/^([A-Za-z0-9_]+)(?:\(([^)]*)\))?$/);

  if (!patMatch || !specMatch) return false;

  const patName = patMatch[1];
  const specName = specMatch[1];

  if (patName !== specName) return false;

  // If pattern has no component list (e.g. "A"), it matches any A.
  if (patMatch[2] === undefined) return true;

  const patCompsStr = patMatch[2];
  const specCompsStr = specMatch[2] || "";

  const patComps = patCompsStr.split(',').map(s => s.trim()).filter(Boolean);
  const specComps = specCompsStr.split(',').map(s => s.trim()).filter(Boolean);

  // Every component in pattern must be satisfied by species
  return patComps.every(pCompStr => {
    const pM = pCompStr.match(/^([A-Za-z0-9_]+)(?:~([A-Za-z0-9_]+))?(?:!([0-9]+|\+|\?))?$/);
    if (!pM) return false;
    const [_, pName, pState, pBond] = pM;

    const sCompStr = specComps.find(s => {
      const sName = s.split(/[~!]/)[0];
      return sName === pName;
    });

    if (!sCompStr) return false;

    const sM = sCompStr.match(/^([A-Za-z0-9_]+)(?:~([A-Za-z0-9_]+))?(?:!([0-9]+))?$/);
    if (!sM) return false;
    const [__, sName, sState, sBond] = sM;

    if (pState && pState !== sState) return false;

    if (pBond) {
      if (pBond === '?') {
        // !? matches anything
      } else if (pBond === '+') {
        if (!sBond) return false;
      } else {
        // Specific bond ID (e.g. !1) - treat as "must be bound" for simple matching
        if (!sBond) return false;
      }
    } else {
      // No bond specified in pattern means "must be unbound"
      if (sBond) return false;
    }

    return true;
  });
}

// --- Helper: Check if Species Matches Pattern (Boolean) ---
function isSpeciesMatch(speciesStr: string, pattern: string): boolean {
  const patComp = getCompartment(pattern);
  const specComp = getCompartment(speciesStr);

  if (patComp && patComp !== specComp) return false;

  const cleanPat = removeCompartment(pattern);
  const cleanSpec = removeCompartment(speciesStr);

  if (cleanPat.includes('.')) {
    const patternMolecules = cleanPat.split('.').map(s => s.trim());
    const speciesMolecules = cleanSpec.split('.').map(s => s.trim());

    // Sort both to handle order independence for complexes
    patternMolecules.sort();
    speciesMolecules.sort();

    if (patternMolecules.length !== speciesMolecules.length) return false;

    return patternMolecules.every((patMol, idx) => {
      return matchMolecule(patMol, speciesMolecules[idx]);
    });
  } else {
    // Single molecule pattern matching against potentially complex species
    // If pattern is "A", it matches "A.B"
    // If pattern is "A.B", it matches "A.B"

    // If pattern is single molecule, check if ANY molecule in species matches
    const specMols = cleanSpec.split('.');
    return specMols.some(sMol => matchMolecule(cleanPat, sMol));
  }
}

// --- Helper: Count Matches for Molecules Observable ---
function countPatternMatches(speciesStr: string, patternStr: string): number {
  const patComp = getCompartment(patternStr);
  const specComp = getCompartment(speciesStr);

  if (patComp && patComp !== specComp) return 0;

  const cleanPat = removeCompartment(patternStr);
  const cleanSpec = removeCompartment(speciesStr);

  if (cleanPat.includes('.')) {
    // Complex pattern: fallback to boolean match (1 or 0)
    // Exact counting of subgraph isomorphisms is expensive here
    return isSpeciesMatch(speciesStr, patternStr) ? 1 : 0;
  } else {
    // Single molecule pattern: count occurrences in species string
    const specMols = cleanSpec.split('.');
    let count = 0;
    for (const sMol of specMols) {
      if (matchMolecule(cleanPat, sMol)) {
        count++;
      }
    }
    return count;
  }
}

// --- Helper: Evaluate Functional Rate Expression ---
// Evaluates a rate expression that may contain observable names and function calls
// at runtime using current observable values
function evaluateFunctionalRate(
  expression: string,
  parameters: Record<string, number>,
  observableValues: Record<string, number>,
  functions?: { name: string; args: string[]; expression: string }[]
): number {
  // Build context with parameters and observable values
  const context: Record<string, number> = { ...parameters, ...observableValues };

  // First, replace function calls with their expanded expressions
  let expandedExpr = expression;
  if (functions && functions.length > 0) {
    // Repeatedly expand function calls (handles nested calls)
    for (let pass = 0; pass < 5; pass++) { // Max 5 passes for nested functions
      let foundFunction = false;
      for (const func of functions) {
        // Match function_name() - zero-argument functions
        const funcCallPattern = new RegExp(`\\b${func.name}\\s*\\(\\s*\\)`, 'g');
        if (funcCallPattern.test(expandedExpr)) {
          foundFunction = true;
          expandedExpr = expandedExpr.replace(funcCallPattern, `(${func.expression})`);
        }
      }
      if (!foundFunction) break;
    }
  }

  // Now substitute all variable names with their values
  // Sort by length (longest first) to avoid partial replacements
  const sortedNames = Object.entries(context).sort((a, b) => b[0].length - a[0].length);
  let evalExpr = expandedExpr;
  for (const [name, value] of sortedNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    evalExpr = evalExpr.replace(new RegExp(`\\b${escaped}\\b`, 'g'), value.toString());
  }

  // Replace ^ with ** for JavaScript exponentiation
  evalExpr = evalExpr.replace(/\^/g, '**');

  try {
    // Use new Function for safe(ish) evaluation
    const fn = new Function(`return ${evalExpr};`);
    const result = fn();
    if (typeof result !== 'number' || !isFinite(result)) {
      return 0;
    }
    return result;
  } catch (e) {
    // Failed to evaluate - return 0
    return 0;
  }
}

function parseBNGL(jobId: number, bnglCode: string): BNGLModel {
  return parseBNGLModel(bnglCode, {
    checkCancelled: () => ensureNotCancelled(jobId),
  });
}



async function generateExpandedNetwork(jobId: number, inputModel: BNGLModel): Promise<BNGLModel> {
  console.log('[Worker] Starting network generation for model with', inputModel.species.length, 'species and', inputModel.reactionRules.length, 'rules');

  // Convert BNGLModel to graph structures
  const seedSpecies = inputModel.species.map(s => {
    const graph = BNGLParser.parseSpeciesGraph(s.name);
    return graph;
  });

  // FIX: Create a map of CANONICAL seed species names to concentrations
  const seedConcentrationMap = new Map<string, number>();
  inputModel.species.forEach(s => {
    const g = BNGLParser.parseSpeciesGraph(s.name);
    const canonicalName = GraphCanonicalizer.canonicalize(g);
    seedConcentrationMap.set(canonicalName, s.initialConcentration);
  });

  const formatSpeciesList = (list: string[]) => (list.length > 0 ? list.join(' + ') : '0');

  // Create sets for detecting functional rates (observables and functions)
  const observableNames = new Set(inputModel.observables.map(o => o.name));
  const functionNames = new Set((inputModel.functions || []).map(f => f.name));

  // Helper to check if a rate expression contains observable or function references
  const isFunctionalRateExpr = (rateExpr: string): boolean => {
    if (!rateExpr) return false;
    for (const obsName of observableNames) {
      if (new RegExp(`\\b${obsName}\\b`).test(rateExpr)) return true;
    }
    for (const funcName of functionNames) {
      if (new RegExp(`\\b${funcName}\\s*\\(`).test(rateExpr)) return true;
    }
    return false;
  };

  const rules = inputModel.reactionRules.flatMap(r => {
    const parametersMap = new Map(Object.entries(inputModel.parameters));

    // Check if this is a functional rate (depends on observables or functions)
    const isForwardFunctional = isFunctionalRateExpr(r.rate);
    const isReverseFunctional = r.reverseRate ? isFunctionalRateExpr(r.reverseRate) : false;

    // For functional rates, use 0 as placeholder (will be evaluated dynamically at simulation time)
    // For static rates, try to evaluate
    let rate: number;
    if (isForwardFunctional) {
      rate = 0; // Placeholder for functional rate
    } else {
      try {
        rate = BNGLParser.evaluateExpression(r.rate, parametersMap);
        if (isNaN(rate)) rate = 0;
      } catch (e) {
        // Only warn if this is not expected to fail (shouldn't happen if not functional)
        console.warn('[Worker] Could not evaluate rate expression:', r.rate, '- using 0');
        rate = 0;
      }
    }

    let reverseRate: number;
    if (r.reverseRate) {
      if (isReverseFunctional) {
        reverseRate = 0; // Placeholder for functional rate
      } else {
        try {
          reverseRate = BNGLParser.evaluateExpression(r.reverseRate, parametersMap);
          if (isNaN(reverseRate)) reverseRate = 0;
        } catch (e) {
          console.warn('[Worker] Could not evaluate reverse rate expression:', r.reverseRate, '- using 0');
          reverseRate = 0;
        }
      }
    } else {
      reverseRate = rate;
    }

    const ruleStr = `${formatSpeciesList(r.reactants)} -> ${formatSpeciesList(r.products)}`;
    const forwardRule = BNGLParser.parseRxnRule(ruleStr, rate);
    forwardRule.name = r.reactants.join('+') + '->' + r.products.join('+');
    // Store rate expression for functional rates (will be passed through to simulation)
    if (isForwardFunctional) {
      (forwardRule as any).rateExpression = r.rate;
      (forwardRule as any).isFunctionalRate = true;
    }

    if (r.constraints && r.constraints.length > 0) {
      forwardRule.applyConstraints(r.constraints, (s) => BNGLParser.parseSpeciesGraph(s));
    }

    if (r.isBidirectional) {
      const reverseRuleStr = `${formatSpeciesList(r.products)} -> ${formatSpeciesList(r.reactants)}`;
      const reverseRule = BNGLParser.parseRxnRule(reverseRuleStr, reverseRate);
      reverseRule.name = r.products.join('+') + '->' + r.reactants.join('+');
      if (isReverseFunctional) {
        (reverseRule as any).rateExpression = r.reverseRate;
        (reverseRule as any).isFunctionalRate = true;
      }
      return [forwardRule, reverseRule];
    } else {
      return [forwardRule];
    }
  });

  // Use network options from BNGL file if available, with reasonable defaults
  const networkOpts = inputModel.networkOptions || {};
  // Convert Record<string, number> to Map for maxStoich if provided
  const maxStoich = networkOpts.maxStoich
    ? new Map(Object.entries(networkOpts.maxStoich))
    : 500;  // Default limit per molecule type

  const generator = new NetworkGenerator({
    maxSpecies: 20000,
    maxIterations: networkOpts.maxIter ?? 5000,
    maxAgg: networkOpts.maxAgg ?? 500,
    maxStoich
  });

  // Set up progress callback to emit progress to main thread during simulation
  let lastProgressTime = 0;
  const progressCallback = (progress: GeneratorProgress) => {
    const now = Date.now();
    if (now - lastProgressTime >= 250) { // Throttle to 4Hz (250ms)
      lastProgressTime = now;
      ctx.postMessage({ id: jobId, type: 'generate_network_progress', payload: progress });
    }
  };

  console.log('[Worker DEBUG] About to call generator.generate() with', seedSpecies.length, 'seeds and', rules.length, 'rules');

  let result: { species: Species[]; reactions: Rxn[] };
  try {
    result = await generator.generate(seedSpecies, rules, progressCallback);
  } catch (e: any) {
    console.error('[Worker DEBUG] generator.generate() FAILED with error:', e.message);
    console.error('[Worker DEBUG] Full stack trace:', e.stack);
    throw e;
  }

  console.log('[Worker DEBUG] generator.generate() completed. Generated', result.species.length, 'species and', result.reactions.length, 'reactions');

  console.log('[Worker DEBUG] Building generatedModel - mapping species...');
  const generatedSpecies = result.species.map((s: Species) => {
    const canonicalName = GraphCanonicalizer.canonicalize(s.graph);
    const concentration = seedConcentrationMap.get(canonicalName) || (s.concentration || 0);
    return { name: canonicalName, initialConcentration: concentration };
  });
  console.log('[Worker DEBUG] Species mapped:', generatedSpecies.length);

  console.log('[Worker DEBUG] Mapping reactions...');
  const generatedReactions = result.reactions.map((r: Rxn, idx: number) => {
    try {
      const reaction = {
        reactants: r.reactants.map((ridx: number) => GraphCanonicalizer.canonicalize(result.species[ridx].graph)),
        products: r.products.map((pidx: number) => GraphCanonicalizer.canonicalize(result.species[pidx].graph)),
        rate: String(r.rate),
        rateConstant: typeof r.rate === 'number' ? r.rate : 0
      };
      return reaction;
    } catch (e: any) {
      console.error(`[Worker DEBUG] Error mapping reaction ${idx}:`, e.message);
      throw e;
    }
  });
  console.log('[Worker DEBUG] Reactions mapped:', generatedReactions.length);

  const generatedModel: BNGLModel = {
    ...inputModel,
    species: generatedSpecies,
    reactions: generatedReactions,
  };

  console.log('[Worker DEBUG] generatedModel built successfully');
  return generatedModel;
}

async function simulate(jobId: number, inputModel: BNGLModel, options: SimulationOptions): Promise<SimulationResults> {
  const simulationStartTime = performance.now();
  ensureNotCancelled(jobId);
  console.log('[Worker] ⏱️ TIMING: Starting simulation');
  console.log('[Worker] Starting simulation with', inputModel.species.length, 'species and', inputModel.reactionRules?.length ?? 0, 'rules');

  const networkGenStart = performance.now();
  const expandedModel = await generateExpandedNetwork(jobId, inputModel);
  const networkGenTime = performance.now() - networkGenStart;
  console.log('[Worker] ⏱️ TIMING: Network generation took', networkGenTime.toFixed(0), 'ms');
  console.log('[Worker] After network expansion:', expandedModel.species.length, 'species and', expandedModel.reactions.length, 'reactions');

  const model: BNGLModel = JSON.parse(JSON.stringify(expandedModel));
  // Prioritize model.simulationOptions (from BNGL file) over UI options
  const t_end = inputModel.simulationOptions?.t_end ?? options.t_end;
  const n_steps = inputModel.simulationOptions?.n_steps ?? options.n_steps;
  const method = options.method;
  const headers = ['time', ...model.observables.map((observable) => observable.name)];

  // --- OPTIMIZATION: Pre-process Network for Fast Simulation ---

  // 1. Map Species Names to Indices
  const speciesMap = new Map<string, number>();
  model.species.forEach((s, i) => speciesMap.set(s.name, i));
  const numSpecies = model.species.length;

  // DEBUG: Log initial species
  console.log('[Worker] Total species:', numSpecies);
  model.species.slice(0, 5).forEach((s, i) => console.log(`[Worker] Species ${i}: ${s.name} (conc=${s.initialConcentration})`));

  // 2. Pre-process Reactions into Concrete Indices
  // Detect functional rates (containing observables or function calls) that need dynamic evaluation
  const observableNames = new Set(model.observables.map(o => o.name));
  const functionNames = new Set((model.functions || []).map(f => f.name));

  const concreteReactions = model.reactions.map(r => {
    const reactantIndices = r.reactants.map(name => speciesMap.get(name));
    const productIndices = r.products.map(name => speciesMap.get(name));

    if (reactantIndices.some(i => i === undefined) || productIndices.some(i => i === undefined)) {
      return null;
    }

    // Check if the rate expression contains observable or function references
    // (indicating it's a functional rate that needs dynamic evaluation)
    const rateExpr = r.rate || '';
    let isFunctionalRate = false;

    // Check for observable names in the rate expression
    for (const obsName of observableNames) {
      // Use word boundary to avoid partial matches
      if (new RegExp(`\\b${obsName}\\b`).test(rateExpr)) {
        isFunctionalRate = true;
        break;
      }
    }

    // Check for function calls in the rate expression
    if (!isFunctionalRate) {
      for (const funcName of functionNames) {
        if (new RegExp(`\\b${funcName}\\s*\\(`).test(rateExpr)) {
          isFunctionalRate = true;
          break;
        }
      }
    }

    // For non-functional rates, use the pre-computed rateConstant
    // For functional rates, store the expression for runtime evaluation
    let rate = typeof r.rateConstant === 'number' ? r.rateConstant : parseFloat(String(r.rateConstant));
    if (isNaN(rate) || !isFinite(rate)) {
      // If rate couldn't be parsed and it's not a functional rate, warn
      if (!isFunctionalRate) {
        console.warn('[Worker] Invalid rate constant for reaction:', r.rate, '- using 0');
      }
      rate = 0; // Will be recalculated if functional
    }

    return {
      reactants: new Int32Array(reactantIndices as number[]),
      products: new Int32Array(productIndices as number[]),
      rateConstant: rate,
      rateExpression: isFunctionalRate ? rateExpr : null,
      isFunctionalRate
    };
  }).filter(r => r !== null) as {
    reactants: Int32Array;
    products: Int32Array;
    rateConstant: number;
    rateExpression: string | null;
    isFunctionalRate: boolean;
  }[];

  // Count functional rates for logging
  const functionalRateCount = concreteReactions.filter(r => r.isFunctionalRate).length;
  if (functionalRateCount > 0) {
    console.log(`[Worker] ${functionalRateCount} of ${concreteReactions.length} reactions have functional rates (require dynamic evaluation)`);
  }

  // DEBUG: Log reactions
  console.log('[Worker] Total reactions:', concreteReactions.length);
  concreteReactions.slice(0, 5).forEach((r, i) => console.log(`[Worker] Rxn ${i}: k=${r.rateConstant} reactants=[${r.reactants}] products=[${r.products}]`));

  // 3. Pre-process Observables (Cache matching species indices and coefficients)
  const concreteObservables = model.observables.map(obs => {
    // Split pattern by whitespace to handle multiple patterns (e.g. "A B")
    const patterns = obs.pattern.split(/\s+/).filter(p => p.length > 0);
    const matchingIndices: number[] = [];
    const coefficients: number[] = [];

    model.species.forEach((s, i) => {
      let count = 0;
      for (const pat of patterns) {
        if (obs.type === 'species') {
          if (isSpeciesMatch(s.name, pat)) {
            count = 1;
            break; // Species matches once
          }
        } else {
          // Molecules observable: count occurrences
          count += countPatternMatches(s.name, pat);
        }
      }

      if (count > 0) {
        matchingIndices.push(i);
        coefficients.push(count);
      }
    });
    return {
      name: obs.name,
      indices: new Int32Array(matchingIndices),
      coefficients: new Float64Array(coefficients)
    };
  });

  // DEBUG: Log observables
  concreteObservables.forEach(obs => {
    console.log(`[Worker] Observable ${obs.name} matches ${obs.indices.length} species`);
    if (obs.indices.length === 0) console.warn(`[Worker] WARNING: Observable ${obs.name} matches NO species`);
  });

  // 4. Initialize State Vector (Float64Array for speed)
  const state = new Float64Array(numSpecies);
  model.species.forEach((s, i) => state[i] = s.initialConcentration);

  // DEBUG: Check initial state
  let totalConc = 0;
  for (let i = 0; i < numSpecies; i++) totalConc += state[i];
  console.log('[Worker] Total initial concentration:', totalConc);

  const data: Record<string, number>[] = [];

  // --- Fast Observable Evaluator ---
  const evaluateObservablesFast = (currentState: Float64Array) => {
    const obsValues: Record<string, number> = {};
    for (let i = 0; i < concreteObservables.length; i++) {
      const obs = concreteObservables[i];
      let sum = 0;
      for (let j = 0; j < obs.indices.length; j++) {
        sum += currentState[obs.indices[j]] * obs.coefficients[j];
      }
      obsValues[obs.name] = sum;
    }
    return obsValues;
  };

  // Define checkCancelled helper
  const checkCancelled = () => ensureNotCancelled(jobId);

  if (method === 'ssa') {
    // SSA Implementation using Typed Arrays
    // Round initial state for SSA
    for (let i = 0; i < numSpecies; i++) state[i] = Math.round(state[i]);

    const dtOut = t_end / n_steps;
    let t = 0;
    let nextTOut = 0;

    data.push({ time: t, ...evaluateObservablesFast(state) });

    while (t < t_end) {
      checkCancelled();

      // Calculate propensities
      let aTotal = 0;
      const propensities = new Float64Array(concreteReactions.length);

      for (let i = 0; i < concreteReactions.length; i++) {
        const rxn = concreteReactions[i];
        let a = rxn.rateConstant;
        for (let j = 0; j < rxn.reactants.length; j++) {
          a *= state[rxn.reactants[j]];
        }
        propensities[i] = a;
        aTotal += a;
      }

      if (aTotal === 0) break;

      const r1 = Math.random();
      const tau = (1 / aTotal) * Math.log(1 / r1);
      t += tau;

      const r2 = Math.random() * aTotal;
      let sumA = 0;
      let reactionIndex = propensities.length - 1;

      for (let i = 0; i < propensities.length; i++) {
        sumA += propensities[i];
        if (r2 <= sumA) {
          reactionIndex = i;
          break;
        }
      }

      const firedRxn = concreteReactions[reactionIndex];
      for (let j = 0; j < firedRxn.reactants.length; j++) state[firedRxn.reactants[j]]--;
      for (let j = 0; j < firedRxn.products.length; j++) state[firedRxn.products[j]]++;

      while (t >= nextTOut && nextTOut <= t_end) {
        checkCancelled();
        data.push({ time: Math.round(nextTOut * 1e10) / 1e10, ...evaluateObservablesFast(state) });
        nextTOut += dtOut;
      }
    }

    // Fill remaining steps
    while (nextTOut <= t_end) {
      data.push({ time: Math.round(nextTOut * 1e10) / 1e10, ...evaluateObservablesFast(state) });
      nextTOut += dtOut;
    }

    return { headers, data } satisfies SimulationResults;
  }

  if (method === 'ode') {
    // Import ODESolver dynamically to avoid circular dependency
    const { createSolver } = await import('./ODESolver');

    // OPTIMIZATION: JIT Compile Derivative Function
    // This avoids array iteration overhead in the hot loop
    const buildDerivativesFunction = () => {
      const lines: string[] = [];
      lines.push('dydt.fill(0);');  // Must reset dydt at start
      lines.push('var v;');

      for (let i = 0; i < concreteReactions.length; i++) {
        const rxn = concreteReactions[i];
        let term = `${rxn.rateConstant}`;
        for (let j = 0; j < rxn.reactants.length; j++) {
          term += ` * y[${rxn.reactants[j]}]`;
        }
        lines.push(`v = ${term};`);

        for (let j = 0; j < rxn.reactants.length; j++) {
          lines.push(`dydt[${rxn.reactants[j]}] -= v;`);
        }
        for (let j = 0; j < rxn.products.length; j++) {
          lines.push(`dydt[${rxn.products[j]}] += v;`);
        }
      }

      return new Function('y', 'dydt', lines.join('\n'));
    };

    // Fallback to loop if too many reactions (to avoid stack overflow or huge function size)
    let derivatives: (y: Float64Array, dydt: Float64Array) => void;
    if (concreteReactions.length < 2000) {
      try {
        // @ts-ignore - JIT compiled function
        derivatives = buildDerivativesFunction();
      } catch (e) {
        console.warn('[Worker] JIT compilation failed, falling back to loop', e);
        derivatives = (yIn: Float64Array, dydt: Float64Array) => {
          dydt.fill(0);
          for (let i = 0; i < concreteReactions.length; i++) {
            const rxn = concreteReactions[i];
            let velocity = rxn.rateConstant;
            for (let j = 0; j < rxn.reactants.length; j++) {
              velocity *= yIn[rxn.reactants[j]];
            }
            for (let j = 0; j < rxn.reactants.length; j++) dydt[rxn.reactants[j]] -= velocity;
            for (let j = 0; j < rxn.products.length; j++) dydt[rxn.products[j]] += velocity;
          }
        };
      }
    } else if (functionalRateCount === 0) {
      // Large number of reactions but no functional rates - use loop
      derivatives = (yIn: Float64Array, dydt: Float64Array) => {
        dydt.fill(0);
        for (let i = 0; i < concreteReactions.length; i++) {
          const rxn = concreteReactions[i];
          let velocity = rxn.rateConstant;
          for (let j = 0; j < rxn.reactants.length; j++) {
            velocity *= yIn[rxn.reactants[j]];
          }
          for (let j = 0; j < rxn.reactants.length; j++) dydt[rxn.reactants[j]] -= velocity;
          for (let j = 0; j < rxn.products.length; j++) dydt[rxn.products[j]] += velocity;
        }
      };
    } else {
      // No JIT compilation possible due to large number, but handled below
      derivatives = null as any;
    }

    // If there are functional rates, we need a special derivative function
    // that evaluates rates dynamically at each timestep
    if (functionalRateCount > 0) {
      console.log('[Worker] Using dynamic derivative function for functional rates');

      // Helper to compute observable values from current state
      const computeObservableValues = (yIn: Float64Array): Record<string, number> => {
        const obsValues: Record<string, number> = {};
        for (let i = 0; i < concreteObservables.length; i++) {
          const obs = concreteObservables[i];
          let sum = 0;
          for (let j = 0; j < obs.indices.length; j++) {
            sum += yIn[obs.indices[j]] * obs.coefficients[j];
          }
          obsValues[obs.name] = sum;
        }
        return obsValues;
      };

      derivatives = (yIn: Float64Array, dydt: Float64Array) => {
        dydt.fill(0);

        // Compute observable values for functional rate evaluation
        const obsValues = computeObservableValues(yIn);

        for (let i = 0; i < concreteReactions.length; i++) {
          const rxn = concreteReactions[i];

          // Get rate constant (evaluate dynamically if functional)
          let k: number;
          if (rxn.isFunctionalRate && rxn.rateExpression) {
            k = evaluateFunctionalRate(
              rxn.rateExpression,
              model.parameters,
              obsValues,
              model.functions
            );
          } else {
            k = rxn.rateConstant;
          }

          // Compute velocity = k * [R1] * [R2] * ...
          let velocity = k;
          for (let j = 0; j < rxn.reactants.length; j++) {
            velocity *= yIn[rxn.reactants[j]];
          }

          // Update dydt
          for (let j = 0; j < rxn.reactants.length; j++) dydt[rxn.reactants[j]] -= velocity;
          for (let j = 0; j < rxn.products.length; j++) dydt[rxn.products[j]] += velocity;
        }
      };
    }

    // Create solver with user-specified or default options (matching BNG2.pl defaults)
    // Create solver with user-specified or default options (matching BNG2.pl defaults)
    let solverType = options.solver ?? 'auto';

    // NOTE: BioNetGen's sparse=>1 option refers to NETWORK GENERATION method, NOT the ODE solver.
    // The SPGMR (matrix-free Krylov) solver requires a preconditioner to work on stiff systems.
    // Without preconditioning, SPGMR fails on stiff models like Barua_2013.
    // For now, always use the dense CVODE solver which works reliably for moderate-sized models.
    // The dense solver can handle up to ~1000-2000 species; larger models would need SPGMR + preconditioner.
    
    // OPTIMIZATION: Use analytical Jacobian for mass-action kinetics (no functional rates)
    // This eliminates O(n²) finite-difference overhead and drastically reduces JS↔WASM boundary crossings
    const allMassAction = functionalRateCount === 0;
    
    if (solverType === 'auto') {
      // Use analytical Jacobian when all reactions are mass-action (no observable-dependent rates)
      solverType = allMassAction ? 'cvode_jac' : 'cvode';
      console.log(`[Worker] Using ${solverType} solver for ${numSpecies} species (allMassAction=${allMassAction})`);
    }

    // Build analytical Jacobian for mass-action kinetics
    // J[i][k] = ∂(dSᵢ/dt)/∂Sₖ = Σ_r stoich[i][r] * k_r * ∂(∏ⱼ Sⱼ^nⱼ)/∂Sₖ
    // For mass-action: ∂velocity/∂Sₖ = velocity * reactant_order[k] / Sₖ
    let jacobian: ((y: Float64Array, J: Float64Array) => void) | undefined;
    
    if (allMassAction) {
      // Precompute reactant counts for each reaction (for higher-order terms like A + A -> ...)
      const reactantCountMaps: Map<number, number>[] = concreteReactions.map(rxn => {
        const counts = new Map<number, number>();
        for (let j = 0; j < rxn.reactants.length; j++) {
          const idx = rxn.reactants[j];
          counts.set(idx, (counts.get(idx) || 0) + 1);
        }
        return counts;
      });

      jacobian = (y: Float64Array, J: Float64Array) => {
        // J is column-major: J[i + k*numSpecies] = ∂f_i/∂y_k
        J.fill(0);

        for (let r = 0; r < concreteReactions.length; r++) {
          const rxn = concreteReactions[r];
          const k = rxn.rateConstant;
          const reactants = rxn.reactants;
          const reactantCounts = reactantCountMaps[r];

          // For each unique reactant k in this reaction, compute ∂(velocity)/∂y_k
          for (const [speciesK, orderK] of reactantCounts) {
            let dVelocity_dyk: number;
            
            if (y[speciesK] > 1e-100) {
              // Compute base velocity
              let velocity = k;
              for (let j = 0; j < reactants.length; j++) {
                velocity *= y[reactants[j]];
              }
              // ∂velocity/∂y_k = orderK * velocity / y_k
              dVelocity_dyk = orderK * velocity / y[speciesK];
            } else {
              // y_k ≈ 0: Compute derivative directly to avoid division by zero
              if (orderK === 1) {
                // Common case: first-order in y_k
                let partialProduct = k;
                for (let j = 0; j < reactants.length; j++) {
                  if (reactants[j] !== speciesK) {
                    partialProduct *= y[reactants[j]];
                  }
                }
                dVelocity_dyk = partialProduct;
              } else {
                // Higher order and y_k ≈ 0: derivative is 0
                dVelocity_dyk = 0;
              }
            }

            // Update Jacobian: J[i][k] += stoich[i] * dVelocity_dyk
            // Reactants have stoich = -1, products have stoich = +1
            for (let j = 0; j < reactants.length; j++) {
              J[reactants[j] + speciesK * numSpecies] -= dVelocity_dyk;
            }
            for (let j = 0; j < rxn.products.length; j++) {
              J[rxn.products[j] + speciesK * numSpecies] += dVelocity_dyk;
            }
          }
        }
      };
      
      console.log(`[Worker] Built analytical Jacobian for ${concreteReactions.length} mass-action reactions`);
    }

    // Log max initial concentration for debugging
    const maxInitConc = Math.max(...state);
    console.log(`[Worker] Max initial concentration: ${maxInitConc}`);
    
    // Use exactly what user/model specifies (matching native BNG behavior)
    // BNG defaults: atol=1e-8, rtol=1e-8, maxStep=0 (unlimited)
    const userAtol = model.simulationOptions?.atol ?? options.atol ?? 1e-8;
    const userRtol = model.simulationOptions?.rtol ?? options.rtol ?? 1e-8;

    const solverOptions: any = {
      atol: userAtol,
      rtol: userRtol,
      maxSteps: options.maxSteps ?? 1000000,
      minStep: 1e-15,
      maxStep: 0,  // 0 = unlimited, matching native BNG which uses CVodeSetMaxStep(cvode_mem, 0.0)
      solver: solverType as 'auto' | 'cvode' | 'cvode_jac' | 'rosenbrock23' | 'rk45' | 'rk4',
    };
    
    // Pass analytical Jacobian if available
    if (jacobian && solverType === 'cvode_jac') {
      solverOptions.jacobian = jacobian;
    }

    console.log('[Worker] ODE solver options (native BNG compatible):', solverOptions);

    const odeStart = performance.now();
    const solver = await createSolver(numSpecies, derivatives, solverOptions);

    const dtOut = t_end / n_steps;
    let t = 0;

    data.push({ time: t, ...evaluateObservablesFast(state) });

    // State vector for simulation
    let y = new Float64Array(state);

    // Steady state detection
    const tolerance = options.steadyStateTolerance ?? 1e-6;
    const window = options.steadyStateWindow ?? 5;
    const enforceSteadyState = !!options.steadyState;
    let consecutiveStable = 0;
    let shouldStop = false;
    let prevY = new Float64Array(numSpecies);

    // DEBUG: Check derivatives at t=0
    const dydt = new Float64Array(numSpecies);
    derivatives(y, dydt);
    let maxDeriv = 0;
    for (let i = 0; i < numSpecies; i++) maxDeriv = Math.max(maxDeriv, Math.abs(dydt[i]));
    console.log('[Worker] Max derivative at t=0:', maxDeriv);

    // Integration loop - use new adaptive solver for each output interval
    for (let i = 1; i <= n_steps && !shouldStop; i += 1) {
      checkCancelled();
      const tTarget = i * dtOut;

      // Save previous state for steady-state check
      prevY.set(y);

      // Integrate from current t to tTarget using adaptive solver
      const result = solver.integrate(y, t, tTarget, checkCancelled);

      if (!result.success) {
        // CVODE failed - return partial results with helpful error message
        const errorMsg = result.errorMessage || 'Unknown error';
        
        // Detect specific CVODE error flags and provide helpful guidance
        let userFriendlyMessage = errorMsg;
        let suggestion = '';
        
        if (errorMsg.includes('flag -3') || errorMsg.includes('CV_CONV_FAILURE')) {
          userFriendlyMessage = `Simulation reached t=${t.toFixed(2)} before numerical convergence failed. ` +
            `This model has extreme stiffness that exceeds browser-based solver limits.`;
          suggestion = 'Try increasing tolerances (atol/rtol) in simulation settings, or use SSA method for stochastic simulation.';
        } else if (errorMsg.includes('flag -4') || errorMsg.includes('CV_ERR_FAILURE')) {
          userFriendlyMessage = `Simulation reached t=${t.toFixed(2)} before error tolerance was exceeded. ` +
            `This model has very sharp transients that are difficult to track accurately.`;
          suggestion = 'Try increasing tolerances, reducing simulation time, or using SSA method.';
        }
        
        // Log warning but continue with partial results
        console.warn(`[Worker] ODE solver failed at t=${t}: ${errorMsg}`);
        
        // If we have at least some data, return it as partial success
        if (data.length > 1) {
          console.warn(`[Worker] Returning ${data.length} partial time points up to t=${t}`);
          
          // Post progress update with warning
          postMessage({ 
            type: 'progress', 
            message: `Simulation stopped at t=${t.toFixed(2)} (${data.length} time points)`,
            warning: userFriendlyMessage
          });
          
          // Don't throw - break out and return partial results
          shouldStop = true;
          break;
        } else {
          // No usable data - throw with helpful message
          throw new Error(`${userFriendlyMessage}${suggestion ? '\n\nSuggestion: ' + suggestion : ''}`);
        }
      }

      // Update state
      y.set(result.y);
      t = result.t;

      // Check steady state
      if (enforceSteadyState) {
        let maxDelta = 0;
        for (let k = 0; k < numSpecies; k++) {
          const d = Math.abs(y[k] - prevY[k]);
          if (d > maxDelta) maxDelta = d;
        }
        if (maxDelta <= tolerance) {
          consecutiveStable++;
          if (consecutiveStable >= window) {
            shouldStop = true;
          }
        } else {
          consecutiveStable = 0;
        }
      }

      data.push({ time: Math.round(t * 1e10) / 1e10, ...evaluateObservablesFast(y) });

      if (shouldStop) break;
    }

    const odeTime = performance.now() - odeStart;
    const totalTime = performance.now() - simulationStartTime;
    console.log('[Worker] ⏱️ TIMING: ODE integration took', odeTime.toFixed(0), 'ms');
    console.log('[Worker] ⏱️ TIMING: Total simulation time', totalTime.toFixed(0), 'ms');
    console.log('[Worker] ⏱️ SUMMARY: Parse=N/A, Network=' + networkGenTime.toFixed(0) + 'ms, ODE=' + odeTime.toFixed(0) + 'ms, Total=' + totalTime.toFixed(0) + 'ms');

    return { headers, data } satisfies SimulationResults;
  }


  throw new Error(`Unsupported simulation method: ${method}`);
}

ctx.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (!message || typeof message !== 'object') {
    console.warn('[Worker] Received malformed message', message);
    return;
  }

  const { id, type, payload } = message;

  if (typeof id !== 'number' || typeof type !== 'string') {
    console.warn('[Worker] Missing id or type on message', message);
    return;
  }

  if (type === 'cancel') {
    const targetId = payload && typeof payload === 'object' ? (payload as { targetId?: unknown }).targetId : undefined;
    if (typeof targetId === 'number') {
      cancelJob(targetId);
    }
    return;
  }

  if (type === 'parse') {
    registerJob(id);
    try {
      const code = typeof payload === 'string' ? payload : '';
      const model = parseBNGL(id, code);
      const response: WorkerResponse = { id, type: 'parse_success', payload: model };
      ctx.postMessage(response);
    } catch (error) {
      const response: WorkerResponse = { id, type: 'parse_error', payload: serializeError(error) };
      ctx.postMessage(response);
    } finally {
      markJobComplete(id);
    }
    return;
  }

  if (type === 'simulate') {
    registerJob(id);
    const jobEntry = jobStates.get(id);
    if (!jobEntry) return; // Should not happen
    (async () => {
      try {
        if (!payload || typeof payload !== 'object') {
          throw new Error('Simulation payload missing');
        }

        // Backwards-compatible: payload can be { model, options } or { modelId, parameterOverrides?, options }
        const p = payload as any;
        let model: BNGLModel | undefined = undefined;
        const options: SimulationOptions | undefined = p.options;

        if (p.model) {
          model = p.model as BNGLModel;
        } else if (typeof p.modelId === 'number') {
          const cached = cachedModels.get(p.modelId);
          if (!cached) throw new Error('Cached model not found in worker');
          // mark as recently used
          touchCachedModel(p.modelId);
          // If there are parameter overrides, create a shallow copy and update rate constants
          if (!p.parameterOverrides || Object.keys(p.parameterOverrides).length === 0) {
            model = cached;
          } else {
            const overrides: Record<string, number> = p.parameterOverrides;
            const nextModel: BNGLModel = {
              ...cached,
              parameters: { ...(cached.parameters || {}), ...overrides },
              reactions: [],
            } as BNGLModel;

            // Update reaction rate constants using new parameters
            (cached.reactions || []).forEach((r) => {
              const rateConst = nextModel.parameters[r.rate] ?? parseFloat(r.rate as unknown as string);
              nextModel.reactions.push({ ...r, rateConstant: rateConst });
            });
            model = nextModel;
          }
        }

        if (!model || !options) {
          throw new Error('Simulation payload incomplete');
        }

        const results = await simulate(id, model, options);
        const response: WorkerResponse = { id, type: 'simulate_success', payload: results };
        ctx.postMessage(response);
      } catch (error) {
        const response: WorkerResponse = { id, type: 'simulate_error', payload: serializeError(error) };
        ctx.postMessage(response);
      } finally {
        markJobComplete(id);
      }
    })();
    return;
  }

  if (type === 'cache_model') {
    registerJob(id);
    try {
      const p = payload as any;
      const model = p && p.model ? (p.model as BNGLModel) : undefined;
      if (!model) throw new Error('Cache model payload missing');
      const modelId = nextModelId++;
      // Store a shallow clone to avoid accidental mutation from main thread
      const stored: BNGLModel = {
        ...model,
        parameters: { ...(model.parameters || {}) },
        moleculeTypes: (model.moleculeTypes || []).map((m) => ({ ...m })),
        species: (model.species || []).map((s) => ({ ...s })),
        observables: (model.observables || []).map((o) => ({ ...o })),
        reactions: (model.reactions || []).map((r) => ({ ...r })),
        reactionRules: (model.reactionRules || []).map((r) => ({ ...r })),
      };
      cachedModels.set(modelId, stored);
      // Enforce LRU eviction if we exceed the cache size
      try {
        if (cachedModels.size > MAX_CACHED_MODELS) {
          const it = cachedModels.keys();
          const oldest = it.next().value as number | undefined;
          if (typeof oldest === 'number') {
            cachedModels.delete(oldest);
            // best-effort notification
            // eslint-disable-next-line no-console
            console.warn('[Worker] Evicted cached model (LRU) id=', oldest);
          }
        }
      } catch (e) {
        // ignore eviction errors
      }
      const response: WorkerResponse = { id, type: 'cache_model_success', payload: { modelId } };
      ctx.postMessage(response);
    } catch (error) {
      const response: WorkerResponse = { id, type: 'cache_model_error', payload: serializeError(error) };
      ctx.postMessage(response);
    } finally {
      markJobComplete(id);
    }
    return;
  }

  if (type === 'release_model') {
    registerJob(id);
    try {
      const p = payload as any;
      const modelId = p && typeof p === 'object' ? (p as { modelId?: unknown }).modelId : undefined;
      if (typeof modelId !== 'number') throw new Error('release_model payload missing modelId');
      const existed = cachedModels.delete(modelId);
      const response: WorkerResponse = { id, type: 'release_model_success', payload: { modelId } };
      ctx.postMessage(response);
    } catch (error) {
      const response: WorkerResponse = { id, type: 'release_model_error', payload: serializeError(error) };
      ctx.postMessage(response);
    } finally {
      markJobComplete(id);
    }
    return;
  }

  if (type === 'generate_network') {
    registerJob(id);
    const jobEntry = jobStates.get(id);
    if (!jobEntry) return; // Should not happen
    (async () => {
      try {
        if (!payload || typeof payload !== 'object') {
          throw new Error('Generate network payload missing');
        }

        const p = payload as { model: BNGLModel; options?: NetworkGeneratorOptions };
        const { model, options } = p;

        if (!model) {
          throw new Error('Model missing in generate_network payload');
        }

        // Convert BNGLModel to graph structures (instrumented)
        console.log('[generate_network handler] seed species raw:', model.species.map(s => s.name));
        const seedSpecies = model.species.map(s => {
          console.log('[generate_network handler] parsing seed:', s.name);
          const graph = BNGLParser.parseSpeciesGraph(s.name);
          console.log('[generate_network handler] parsed graph =>', BNGLParser.speciesGraphToString(graph));
          return graph;
        });
        ensureNotCancelled(id);

        const formatSpeciesList = (list: string[]) => (list.length > 0 ? list.join(' + ') : '0');

        const rules = model.reactionRules.map(r => {
          let rate = model.parameters[r.rate];
          if (rate === undefined) {
            const parsed = parseFloat(r.rate);
            rate = isNaN(parsed) ? 0 : parsed;
          }
          const ruleStr = `${formatSpeciesList(r.reactants)} ${r.isBidirectional ? '<->' : '->'} ${formatSpeciesList(r.products)}`;
          return BNGLParser.parseRxnRule(ruleStr, rate);
        });
        ensureNotCancelled(id);

        // Use the controller from jobStates
        const controller = jobEntry.controller!;

        // Set up progress callback to stream to main thread (throttled to 4Hz)
        let lastProgressTime = 0;
        const progressCallback = (progress: GeneratorProgress) => {
          const now = Date.now();
          if (now - lastProgressTime >= 250) { // 250ms = 4Hz
            lastProgressTime = now;
            ctx.postMessage({ id, type: 'generate_network_progress', payload: progress });
          }
        };

        // Instantiate NetworkGenerator with options
        // Convert maxStoich Record to Map if necessary
        let maxStoichValue: number | Map<string, number> = 500;
        const rawMaxStoich = options?.maxStoich;
        if (rawMaxStoich !== undefined) {
          if (typeof rawMaxStoich === 'number') {
            maxStoichValue = rawMaxStoich;
          } else {
            // Convert Record<string, number> or Map to Map
            maxStoichValue = rawMaxStoich instanceof Map
              ? rawMaxStoich
              : new Map(Object.entries(rawMaxStoich));
          }
        }

        const generatorOptions = {
          maxSpecies: options?.maxSpecies ?? 10000,
          maxReactions: options?.maxReactions ?? 100000,
          maxIterations: options?.maxIterations ?? 100,
          maxAgg: options?.maxAgg ?? 500,
          maxStoich: maxStoichValue,
          checkInterval: options?.checkInterval ?? 500,
          memoryLimit: options?.memoryLimit ?? 1e9,
        } satisfies NetworkGeneratorOptions;

        const generator = new NetworkGenerator(generatorOptions);

        // Generate network
        const result = await generator.generate(seedSpecies, rules, progressCallback, controller.signal);
        ensureNotCancelled(id);

        // Convert result back to BNGLModel
        const generatedModel: BNGLModel = {
          ...model,
          species: result.species.map(s => ({ name: BNGLParser.speciesGraphToString(s.graph), initialConcentration: s.concentration || 0 })),
          reactions: result.reactions.map(r => ({
            reactants: r.reactants.map(idx => BNGLParser.speciesGraphToString(result.species[idx].graph)),
            products: r.products.map(idx => BNGLParser.speciesGraphToString(result.species[idx].graph)),
            rate: r.rate.toString(),
            rateConstant: r.rate
          })),
        };
        ensureNotCancelled(id);

        const response: WorkerResponse = { id, type: 'generate_network_success', payload: generatedModel };
        ctx.postMessage(response);
      } catch (error) {
        const response: WorkerResponse = { id, type: 'generate_network_error', payload: serializeError(error) };
        ctx.postMessage(response);
      } finally {
        markJobComplete(id);
      }
    })();
    return;
  }

  console.warn('[Worker] Unknown message type received:', type);
});

export { };