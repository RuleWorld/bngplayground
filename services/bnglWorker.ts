/// <reference lib="webworker" />
import './workerPolyfills';

import type {
  BNGLModel,
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
// Using official ANTLR parser for bng2.pl parity (util polyfill added in vite.config.ts)
import { parseBNGLStrict as parseBNGLModel } from '../src/parser/BNGLParserWrapper';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

// Debug flag - set to false in production to suppress debug logs
const DEBUG_WORKER = false;

// Version marker (only log in debug mode)
if (DEBUG_WORKER) {
  console.log('[Worker] bnglWorker v2.1.1 - debug logging disabled by default');
}

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

// --- Helper: Extract compartment from a single molecule string ---
// Handles molecule-level suffix format like "L(r)@PM" → { compartment: "PM", cleanMol: "L(r)" }
function getMoleculeCompartment(mol: string): { compartment: string | null; cleanMol: string } {
  // Match molecule with compartment suffix: Name(components)@COMPARTMENT or Name@COMPARTMENT
  const match = mol.match(/^(.+)@([A-Za-z0-9_]+)$/);
  if (match) {
    return { compartment: match[2], cleanMol: match[1] };
  }
  return { compartment: null, cleanMol: mol };
}

// --- Helper: Match Single Molecule Pattern ---
function matchMolecule(patMol: string, specMol: string): boolean {
  // patMol and specMol are "Name(components)" strings, no compartments.

  const patMatch = patMol.match(/^([A-Za-z0-9_]+)(?:\(([^)]*)\))?$/);
  const specMatch = specMol.match(/^([A-Za-z0-9_]+)(?:\(([^)]*)\))?$/);

  if (!patMatch || !specMatch) {
    return false;
  }

  const patName = patMatch[1];
  const specName = specMatch[1];

  if (patName !== specName) {
    return false;
  }

  // If pattern has no component list (e.g. "A"), it matches any A.
  if (patMatch[2] === undefined) return true;

  const patCompsStr = patMatch[2];
  const specCompsStr = specMatch[2] || "";

  const patComps = patCompsStr.split(',').map(s => s.trim()).filter(Boolean);
  const specComps = specCompsStr.split(',').map(s => s.trim()).filter(Boolean);

<<<<<<< Updated upstream
  const parseComponent = (compStr: string): { name: string; state?: string; bonds: string[] } | null => {
    // Examples:
    //   Activation~No!0!1
    //   Activation!+
    //   p65!0
    //   Location~Cytoplasm
    const [nameAndState, ...bondParts] = compStr.split('!');
    const [name, state] = nameAndState.split('~');
    if (!name) return null;
    const bonds = bondParts.filter(Boolean);
    return { name, state: state || undefined, bonds };
  };

  if (DEBUG_MATCH) {
    console.log(`[DEBUG matchMolecule] patComps=[${patComps.join(', ')}], specComps=[${specComps.join(', ')}]`);
  }

  // Every component in pattern must be satisfied by species
  return patComps.every(pCompStr => {
    const p = parseComponent(pCompStr);
    if (!p) {
      if (DEBUG_MATCH) console.log(`[DEBUG matchMolecule] Pattern component parse failed: "${pCompStr}"`);
=======
  // Every component in pattern must be satisfied by species
  return patComps.every(pCompStr => {
    const pM = pCompStr.match(/^([A-Za-z0-9_]+)(?:~([A-Za-z0-9_?]+))?(?:!([0-9]+|\+|\?))?$/);
    if (!pM) {
>>>>>>> Stashed changes
      return false;
    }
    const pName = p.name;
    const pState = p.state;
    const pBonds = p.bonds;

    const sCompStr = specComps.find(s => {
      const sName = s.split(/[~!]/)[0];
      return sName === pName;
    });

    if (!sCompStr) {
      return false;
    }

<<<<<<< Updated upstream
    const s = parseComponent(sCompStr);
    if (!s) {
      if (DEBUG_MATCH) console.log(`[DEBUG matchMolecule] Species component parse failed: "${sCompStr}"`);
=======
    // BUG FIX: Handle !+ and !? wildcards in species string too
    const sM = sCompStr.match(/^([A-Za-z0-9_]+)(?:~([A-Za-z0-9_]+))?(?:!([0-9]+|\+|\?))?$/);
    if (!sM) {
      return false;
    }
    const [__, _sName, sState, sBond] = sM;

    if (pState && pState !== sState) {
>>>>>>> Stashed changes
      return false;
    }

    if (pState && pState !== s.state) {
      if (DEBUG_MATCH) console.log(`[DEBUG matchMolecule] State mismatch: pattern="${pState}", species="${s.state}"`);
      return false;
    }

    // Bond matching logic (BNGL semantics):
    // - Numeric bond labels in patterns (e.g. !0, !1) are placeholders for connectivity
    //   within the pattern; they do not need to equal the species bond IDs.
    // - Therefore at molecule-level we enforce only bound/unbound/cardinality,
    //   and defer connectivity checks to complex-level matching.
    const hasAnyBondConstraint = pBonds.length > 0;
    const wantsAny = pBonds.includes('?');
    const wantsBound = pBonds.includes('+') || pBonds.some(b => /^\d+$/.test(b));
    const numericCount = pBonds.filter(b => /^\d+$/.test(b)).length;

    if (!hasAnyBondConstraint) {
      if (s.bonds.length > 0) return false;
    } else if (wantsAny) {
      // matches anything
    } else {
      if (wantsBound && s.bonds.length === 0) return false;
      if (numericCount > 0 && s.bonds.length < numericCount) return false;
    }

    return true;
  });
}

// --- Helper: Check if Species Matches Pattern (Boolean) ---
// Handles multi-molecule patterns with bond connectivity verification
function isSpeciesMatch(speciesStr: string, pattern: string): boolean {
  const patComp = getCompartment(pattern);
  const specComp = getCompartment(speciesStr);

  if (patComp && patComp !== specComp) return false;

  const cleanPat = removeCompartment(pattern);
  const cleanSpec = removeCompartment(speciesStr);

  // Single molecule pattern
  if (!cleanPat.includes('.')) {
    const specMols = cleanSpec.split('.');
    return specMols.some(sMol => matchMolecule(cleanPat, sMol));
  }

  // Multi-molecule pattern - need to verify bond connectivity
  const patternMolecules = cleanPat.split('.').map(s => s.trim());
  const speciesMolecules = cleanSpec.split('.').map(s => s.trim());

  if (patternMolecules.length > speciesMolecules.length) return false;

  const parseComponents = (mol: string): Array<{ compName: string; state?: string; bonds: string[] }> => {
    const compMatch = mol.match(/\(([^)]*)\)/);
    if (!compMatch) return [];
    const rawComps = compMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    const comps: Array<{ compName: string; state?: string; bonds: string[] }> = [];
    for (const compStr of rawComps) {
      const [nameAndState, ...bondParts] = compStr.split('!');
      const [compName, state] = nameAndState.split('~');
      if (!compName) continue;
      const bonds = bondParts.filter(Boolean);
      comps.push({ compName, state: state || undefined, bonds });
    }
    return comps;
  };

  // patternBondLabel -> endpoints [(patMolIdx, compName)]
  const patternBonds = new Map<string, Array<{ molIdx: number; compName: string }>>();
  for (let molIdx = 0; molIdx < patternMolecules.length; molIdx++) {
    for (const comp of parseComponents(patternMolecules[molIdx])) {
      for (const bond of comp.bonds) {
        if (!/^\d+$/.test(bond)) continue;
        if (!patternBonds.has(bond)) patternBonds.set(bond, []);
        patternBonds.get(bond)!.push({ molIdx, compName: comp.compName });
      }
    }
  }

  // speciesBondId -> endpoints [(specMolIdx, compName)]
  const speciesBonds = new Map<string, Array<{ molIdx: number; compName: string }>>();
  for (let molIdx = 0; molIdx < speciesMolecules.length; molIdx++) {
    for (const comp of parseComponents(speciesMolecules[molIdx])) {
      for (const bond of comp.bonds) {
        if (!/^\d+$/.test(bond)) continue;
        if (!speciesBonds.has(bond)) speciesBonds.set(bond, []);
        speciesBonds.get(bond)!.push({ molIdx, compName: comp.compName });
      }
    }
  }

  // Try to find a valid assignment of pattern molecules to species molecules
  const usedIndices = new Set<number>();

  const findMatch = (patIdx: number, patToSpecMap: Map<number, number>): boolean => {
    if (patIdx >= patternMolecules.length) {
      // All pattern molecules assigned - now verify bond connectivity with bond-ID remapping.
      const patBondKeys = Array.from(patternBonds.keys()).filter(k => (patternBonds.get(k)?.length ?? 0) === 2);
      const candidates = new Map<string, string[]>();

      for (const patBondId of patBondKeys) {
        const [ep1, ep2] = patternBonds.get(patBondId)!;
        const specMolIdx1 = patToSpecMap.get(ep1.molIdx);
        const specMolIdx2 = patToSpecMap.get(ep2.molIdx);
        if (specMolIdx1 === undefined || specMolIdx2 === undefined) return false;

        const cand: string[] = [];
        for (const [specBondId, specEndpoints] of speciesBonds) {
          if (specEndpoints.length !== 2) continue;
          const [se1, se2] = specEndpoints;
          const ok =
            (se1.molIdx === specMolIdx1 && se1.compName === ep1.compName && se2.molIdx === specMolIdx2 && se2.compName === ep2.compName) ||
            (se1.molIdx === specMolIdx2 && se1.compName === ep2.compName && se2.molIdx === specMolIdx1 && se2.compName === ep1.compName);
          if (ok) cand.push(specBondId);
        }
        if (cand.length === 0) return false;
        candidates.set(patBondId, cand);
      }

      const usedSpecBondIds = new Set<string>();
      const bondIds = Array.from(candidates.keys()).sort((a, b) => (candidates.get(a)!.length - candidates.get(b)!.length));
      const assign = (i: number): boolean => {
        if (i >= bondIds.length) return true;
        const patBondId = bondIds[i];
        for (const specBondId of candidates.get(patBondId)!) {
          if (usedSpecBondIds.has(specBondId)) continue;
          usedSpecBondIds.add(specBondId);
          if (assign(i + 1)) return true;
          usedSpecBondIds.delete(specBondId);
        }
        return false;
      };

      return assign(0);
    }

    const patMol = patternMolecules[patIdx];
    for (let i = 0; i < speciesMolecules.length; i++) {
      if (usedIndices.has(i)) continue;
      if (matchMolecule(patMol, speciesMolecules[i])) {
        usedIndices.add(i);
        patToSpecMap.set(patIdx, i);
        if (findMatch(patIdx + 1, patToSpecMap)) return true;
        patToSpecMap.delete(patIdx);
        usedIndices.delete(i);
      }
    }
    return false;
  };

  return findMatch(0, new Map());
}

// --- Helper: Count Matches for Molecules Observable ---
// Fixed to handle per-molecule compartments (e.g., L(r)@PM in species matching @PM:L pattern)
function countPatternMatches(speciesStr: string, patternStr: string): number {
  // Extract compartment constraint from pattern (prefix format: @PM:L → "PM")
  const patComp = getCompartment(patternStr);
  const cleanPat = removeCompartment(patternStr);

  if (cleanPat.includes('.')) {
    // Complex pattern: For multi-molecule patterns with compartment constraints,
    // we need to verify all molecules in the pattern are in the required compartment
    if (patComp) {
      // Check if the species contains molecules in the required compartment
      const specMols = speciesStr.split('.');
      const hasMatchingCompartment = specMols.some(sMol => {
        const { compartment } = getMoleculeCompartment(sMol);
        return compartment === patComp;
      });
      if (!hasMatchingCompartment) return 0;
    }
    // Fallback to boolean match (1 or 0)
    return isSpeciesMatch(speciesStr, patternStr) ? 1 : 0;
  } else {
    // Single molecule pattern: count matching molecules WITH compartment filtering
    const specMols = speciesStr.split('.');  // Keep compartment info per molecule
    let count = 0;
    for (const sMol of specMols) {
      const { compartment: molComp, cleanMol } = getMoleculeCompartment(sMol);
      // If pattern requires a specific compartment, molecule must be in that compartment
      if (patComp && molComp !== patComp) continue;
      if (matchMolecule(cleanPat, cleanMol)) {
        count++;
      }
    }
    return count;
  }
}

// --- Helper: Evaluate Functional Rate Expression ---
// Evaluates a rate expression that may contain observable names and function calls
// at runtime using current observable values

// Rate evaluation (inline expansion in evaluateFunctionalRate)

function evaluateFunctionalRate(
  expression: string,
  parameters: Record<string, number>,
  observableValues: Record<string, number>,
  functions?: { name: string; args: string[]; expression: string }[]
): number {
  // Build context with parameters and observable values
  const context: Record<string, number> = { ...parameters, ...observableValues };

  // Pre-expand function calls in the expression
  let expandedExpr = expression;
  if (functions && functions.length > 0) {
    for (let pass = 0; pass < 10; pass++) {
      let foundFunction = false;
      for (const func of functions) {
        const funcCallPattern = new RegExp(`\\b${func.name}\\s*\\(\\s*\\)`, 'g');
        if (funcCallPattern.test(expandedExpr)) {
          foundFunction = true;
          expandedExpr = expandedExpr.replace(funcCallPattern, `(${func.expression})`);
        }
      }
      if (!foundFunction) break;
    }
  }

  // Replace ^ with ** for JavaScript exponentiation
  expandedExpr = expandedExpr.replace(/\^/g, '**');

  // Sort variable names by length (longest first) to avoid partial replacements
  const varNames = Object.keys(context).sort((a, b) => b.length - a.length);

  // Build JavaScript expression with context lookups
  let jsExpr = expandedExpr;
  for (const name of varNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    jsExpr = jsExpr.replace(new RegExp(`\\b${escaped}\\b`, 'g'), `ctx["${name}"]`);
  }

  try {
    const fn = new Function('ctx', `return ${jsExpr};`) as (ctx: Record<string, number>) => number;
    const result = fn(context);
    return typeof result === 'number' && !isNaN(result) ? result : 0;
  } catch (e: any) {
    console.warn(`[evaluateFunctionalRate] Failed to evaluate '${expression}': ${e.message}`);
    return 0;
  }
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

<<<<<<< Updated upstream
  // Debug logging gated by DEBUG_WORKER flag
  if (DEBUG_WORKER) {
    const hasp53 = Array.from(seedConcentrationMap.keys()).some(k => k.toLowerCase().includes('p53'));
    if (!hasp53) {
      console.log('[Worker DEBUG] NO p53 in seeds! Showing all seed species:');
      seedConcentrationMap.forEach((conc, name) => {
        console.log(`[Worker DEBUG]   "${name}" -> conc=${conc}`);
      });
    }
  }

=======
>>>>>>> Stashed changes
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
    // FIX: Use original rule name to prevent deduplication of identical rules (e.g. stochastic vs deterministic variants)
    forwardRule.name = r.name;
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
      // Append suffix for reverse rule to maintain uniqueness
      reverseRule.name = r.name + '_rev';
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
    maxStoich,
    // Pass compartment info for cBNGL volume scaling (bimolecular rates scaled by 1/volume)
    compartments: inputModel.compartments?.map(c => ({
      name: c.name,
      dimension: c.dimension,
      size: c.size,
      parent: c.parent
    }))
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

<<<<<<< Updated upstream
  if (DEBUG_WORKER) console.log('[Worker DEBUG] About to call generator.generate() with', seedSpecies.length, 'seeds and', rules.length, 'rules');

=======
>>>>>>> Stashed changes
  let result: { species: Species[]; reactions: Rxn[] };
  try {
    result = await generator.generate(seedSpecies, rules, progressCallback);
  } catch (e: any) {
<<<<<<< Updated upstream
    if (DEBUG_WORKER) {
      console.error('[Worker DEBUG] generator.generate() FAILED with error:', e.message);
      console.error('[Worker DEBUG] Full stack trace:', e.stack);
    }
    throw e;
  }

  if (DEBUG_WORKER) console.log('[Worker DEBUG] generator.generate() completed. Generated', result.species.length, 'species and', result.reactions.length, 'reactions');

=======
    console.error('[Worker] generator.generate() FAILED:', e.message);
    throw e;
  }

>>>>>>> Stashed changes
  const generatedSpecies = result.species.map((s: Species) => {
    const canonicalName = GraphCanonicalizer.canonicalize(s.graph);
    const concentration = seedConcentrationMap.get(canonicalName) || (s.concentration || 0);
    return { name: canonicalName, initialConcentration: concentration };
  });

  const generatedReactions = result.reactions.map((r: Rxn, idx: number) => {
    try {
      // CRITICAL: Preserve rateExpression for functional rates (rates that depend on observables/parameters)
      // This allows runtime re-evaluation when parameters change between simulation phases
      const reaction = {
        reactants: r.reactants.map((ridx: number) => GraphCanonicalizer.canonicalize(result.species[ridx].graph)),
        products: r.products.map((pidx: number) => GraphCanonicalizer.canonicalize(result.species[pidx].graph)),
        // Use rateExpression if available (for functional rates), otherwise use numeric rate
        rate: r.rateExpression || String(r.rate),
        rateConstant: typeof r.rate === 'number' ? r.rate : 0
      };
      return reaction;
    } catch (e: any) {
<<<<<<< Updated upstream
      if (DEBUG_WORKER) console.error(`[Worker DEBUG] Error mapping reaction ${idx}:`, e.message);
=======
      console.error(`[Worker] Error mapping reaction ${idx}:`, e.message);
>>>>>>> Stashed changes
      throw e;
    }
  });

  const generatedModel: BNGLModel = {
    ...inputModel,
    species: generatedSpecies,
    reactions: generatedReactions,
  };

<<<<<<< Updated upstream
  if (DEBUG_WORKER) console.log('[Worker DEBUG] generatedModel built successfully');
=======
>>>>>>> Stashed changes
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

  // Multi-phase simulation support: check if model has explicit simulation phases
  const hasMultiPhase = inputModel.simulationPhases && inputModel.simulationPhases.length > 0;
  const phases = hasMultiPhase ? inputModel.simulationPhases! : [{
    method: options.method as 'ode' | 'ssa',
    t_end: inputModel.simulationOptions?.t_end ?? options.t_end,
    n_steps: inputModel.simulationOptions?.n_steps ?? options.n_steps,
    atol: inputModel.simulationOptions?.atol ?? options.atol,
    rtol: inputModel.simulationOptions?.rtol ?? options.rtol,
  }];
  const concentrationChanges = inputModel.concentrationChanges || [];
  const parameterChanges = inputModel.parameterChanges || [];

  if (hasMultiPhase) {
    console.log(`[Worker] Multi-phase simulation: ${phases.length} phases, ${concentrationChanges.length} concentration changes, ${parameterChanges.length} parameter changes`);
  }

  // Use the last ODE phase settings for backward compatibility
  const lastOdePhase = phases.filter(p => p.method === 'ode').pop() || phases[phases.length - 1];
  const t_end = lastOdePhase.t_end;
  const n_steps = lastOdePhase.n_steps;
  const method = options.method;
  const headers = ['time', ...model.observables.map((observable) => observable.name)];
  // Species headers for cdat-style output
  const speciesHeaders = model.species.map((s) => s.name);

  // --- OPTIMIZATION: Pre-process Network for Fast Simulation ---

  // 1. Map Species Names to Indices
  const speciesMap = new Map<string, number>();
  model.species.forEach((s, i) => speciesMap.set(s.name, i));
  const numSpecies = model.species.length;

<<<<<<< Updated upstream
  // DEBUG: Log initial species (gated)
  if (DEBUG_WORKER) {
    console.log('[Worker] Total species:', numSpecies);
    model.species.slice(0, 5).forEach((s, idx) => console.log(`[Worker] Species ${idx}: ${s.name} (conc=${s.initialConcentration})`));

    // DEBUG: Show all p53-related species vs p53 observable patterns
    const p53Species = model.species.filter(s => s.name.toLowerCase().includes('p53'));
    const p53Observables = model.observables.filter(o => o.name.toLowerCase().includes('p53'));
    console.log(`[Worker DEBUG] === p53 SPECIES (${p53Species.length} found) ===`);
    p53Species.forEach(s => console.log(`[Worker DEBUG]   Species: "${s.name}"`));
    console.log(`[Worker DEBUG] === p53 OBSERVABLES (${p53Observables.length} found) ===`);
    p53Observables.forEach(o => console.log(`[Worker DEBUG]   Observable "${o.name}": pattern="${o.pattern}"`));
  }

=======
>>>>>>> Stashed changes
  // 2. Pre-process Reactions into Concrete Indices
  // Detect functional rates (containing observables or function calls) that need dynamic evaluation
  const observableNames = new Set(model.observables.map(o => o.name));
  const functionNames = new Set((model.functions || []).map(f => f.name));

  const concreteReactions = model.reactions.map(r => {
    const reactantIndices = r.reactants.map(name => speciesMap.get(name));
    const productIndices = r.products.map(name => speciesMap.get(name));

    if (reactantIndices.some(i => i === undefined) || productIndices.some(i => i === undefined)) {
      // BUG FIX: Log which species are missing
      const missingReactants = r.reactants.filter(name => speciesMap.get(name) === undefined);
      const missingProducts = r.products.filter(name => speciesMap.get(name) === undefined);
      if (missingReactants.length > 0 || missingProducts.length > 0) {
        console.warn(`[Worker] Reaction skipped - missing species: reactants=[${missingReactants.join(',')}] products=[${missingProducts.join(',')}]`);
      }
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
<<<<<<< Updated upstream
    console.log(`[Worker] ${functionalRateCount} of ${concreteReactions.length} reactions have functional rates (require dynamic evaluation)`);
    // Debug: show first few functional rates
    concreteReactions.filter(r => r.isFunctionalRate).slice(0, 3).forEach((r, i) => {
      console.log(`[Worker] Functional rate ${i}: expr="${r.rateExpression}"`);
    });
  } else {
    console.log('[Worker] WARNING: No functional rates detected. Checking raw rate expressions...');
    // Log first few rate expressions to debug
    model.reactions.slice(0, 10).forEach((r, idx) => {
      console.log(`[Worker] Reaction ${idx} raw rate="${r.rate}" rateConstant=${r.rateConstant}`);
    });
  }

  // DEBUG: Log reactions (gated)
  if (DEBUG_WORKER) {
    console.log('[Worker] Total reactions:', concreteReactions.length);
    concreteReactions.slice(0, 5).forEach((r, idx) => console.log(`[Worker] Rxn ${idx}: k=${r.rateConstant} reactants=[${r.reactants}] products=[${r.products}]`));

    // DEBUG: Log ALL p53-related reactions (synthesis, degradation, modification)
    // p53 species indices are [19, 45, 46, 50] based on earlier debug
    const p53Indices = new Set([19, 45, 46, 50]);
    console.log('[Worker DEBUG] === ALL P53-RELATED REACTIONS ===');
    concreteReactions.forEach((r, idx) => {
      const involvesP53 = [...r.reactants].some(i => p53Indices.has(i)) ||
        [...r.products].some(i => p53Indices.has(i));
      if (involvesP53) {
        const reactantNames = [...r.reactants].map(i => model.species[i]?.name || `?${i}`).join(' + ') || '0';
        const productNames = [...r.products].map(i => model.species[i]?.name || `?${i}`).join(' + ') || '0';
        const rateInfo = r.isFunctionalRate ? `FUNC:"${r.rateExpression}"` : `k=${r.rateConstant}`;
        console.log(`[Worker DEBUG] Rxn ${idx}: ${reactantNames} -> ${productNames}  ${rateInfo}`);
      }
    });

    // DEBUG: Log reactions that produce RAS-GTP (Species[2]) for GEF mechanism analysis
    console.log('[Worker DEBUG] === REACTIONS PRODUCING/CONSUMING SPECIES[2] (RAS-GTP) ===');
    concreteReactions.forEach((r, idx) => {
      const involvesRasGTP = [...r.reactants].includes(2) || [...r.products].includes(2);
      if (involvesRasGTP) {
        const reactantNames = [...r.reactants].map(i => model.species[i]?.name || `?${i}`).join(' + ') || '0';
        const productNames = [...r.products].map(i => model.species[i]?.name || `?${i}`).join(' + ') || '0';
        const roleInfo = r.products.includes(2) ? 'PRODUCES[2]' : 'CONSUMES[2]';
        console.log(`[Worker DEBUG] Rxn ${idx}: ${reactantNames} -> ${productNames}  k=${r.rateConstant} ${roleInfo}`);
      }
    });
  }

=======
    console.log(`[Worker] ${functionalRateCount} of ${concreteReactions.length} reactions have functional rates`);
  }

>>>>>>> Stashed changes
  // 3. Pre-process Observables (Cache matching species indices and coefficients)
  const concreteObservables = model.observables.map(obs => {
    // Split pattern by comma to handle multiple patterns (e.g. "A,B" or "pattern1, pattern2")
    // BUT only split on commas OUTSIDE parentheses to avoid breaking patterns like "p53(S15_S20~0,S46~0)"
    const splitPatternsSafe = (patternStr: string): string[] => {
      const result: string[] = [];
      let current = '';
      let parenDepth = 0;
      for (const char of patternStr) {
        if (char === '(') parenDepth++;
        else if (char === ')') parenDepth--;
        else if (char === ',' && parenDepth === 0) {
          if (current.trim()) result.push(current.trim());
          current = '';
          continue;
        }
        current += char;
      }
      if (current.trim()) result.push(current.trim());
      return result;
    };
    const patterns = splitPatternsSafe(obs.pattern);
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

<<<<<<< Updated upstream
  // DEBUG: Log observables
  concreteObservables.forEach(obs => {
    console.log(`[Worker] Observable ${obs.name} matches ${obs.indices.length} species`);
    // Debug logging for specific observables (gated)
    if (DEBUG_WORKER) {
      if (obs.name === 'p53_tot') {
        console.log(`[Worker DEBUG p53_tot] Indices: [${Array.from(obs.indices).join(', ')}]`);
        console.log(`[Worker DEBUG p53_tot] Coefficients: [${Array.from(obs.coefficients).join(', ')}]`);
        Array.from(obs.indices).forEach((idx, j) => {
          const species = model.species[idx];
          console.log(`[Worker DEBUG p53_tot]   Species ${idx}: "${species.name}" conc=${species.initialConcentration} coeff=${obs.coefficients[j]}`);
        });
      }

      if (obs.name.startsWith('Species')) {
        const obsInfo = model.observables.find(o => o.name === obs.name);
        console.log(`[Worker DEBUG] Observable ${obs.name} pattern="${obsInfo?.pattern}" matches ${obs.indices.length} species:`);
        Array.from(obs.indices).forEach((idx, j) => {
          const species = model.species[idx];
          console.log(`[Worker DEBUG]   -> Species[${idx}]: "${species.name}" initialConc=${species.initialConcentration} coeff=${obs.coefficients[j]}`);
        });
      }

      if (obs.indices.length === 0) {
        console.warn(`[Worker] WARNING: Observable ${obs.name} matches NO species`);
        const obsInfo = model.observables.find(o => o.name === obs.name);
        if (obsInfo) {
          console.log(`[Worker DEBUG] Observable ${obs.name} pattern: "${obsInfo.pattern}"`);
          console.log(`[Worker DEBUG] Species samples (first 5):`);
          model.species.slice(0, 5).forEach((s, idx) => {
            console.log(`[Worker DEBUG]   Species ${idx}: "${s.name}"`);
          });
        }
      }
    }
  });

=======
>>>>>>> Stashed changes
  // 4. Initialize State Vector (Float64Array for speed)
  const state = new Float64Array(numSpecies);
  model.species.forEach((s, idx) => state[idx] = s.initialConcentration);

<<<<<<< Updated upstream
  // DEBUG: Check initial state (gated)
  if (DEBUG_WORKER) {
    let totalConc = 0;
    for (let idx = 0; idx < numSpecies; idx++) totalConc += state[idx];
    console.log('[Worker] Total initial concentration:', totalConc);
  }

=======
>>>>>>> Stashed changes
  const data: Record<string, number>[] = [];
  const speciesData: Record<string, number>[] = [];

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
    // Initial species concentrations (cdat)
    const speciesPoint0: Record<string, number> = { time: t };
    for (let i = 0; i < numSpecies; i++) speciesPoint0[speciesHeaders[i]] = state[i];
    speciesData.push(speciesPoint0);

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
        // Also record species concentrations for SSA
        const speciesPointLoop: Record<string, number> = { time: Math.round(nextTOut * 1e10) / 1e10 };
        for (let k = 0; k < numSpecies; k++) speciesPointLoop[speciesHeaders[k]] = state[k];
        speciesData.push(speciesPointLoop);
        nextTOut += dtOut;
      }
    }

    // Fill remaining steps
    while (nextTOut <= t_end) {
      data.push({ time: Math.round(nextTOut * 1e10) / 1e10, ...evaluateObservablesFast(state) });
      // Also record species concentrations for SSA
      const speciesPointFinal: Record<string, number> = { time: Math.round(nextTOut * 1e10) / 1e10 };
      for (let k = 0; k < numSpecies; k++) speciesPointFinal[speciesHeaders[k]] = state[k];
      speciesData.push(speciesPointFinal);
      nextTOut += dtOut;
    }

    return { headers, data, speciesHeaders, speciesData, expandedReactions: model.reactions, expandedSpecies: model.species } satisfies SimulationResults;
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
    let solverType: string = options.solver ?? 'auto';

    // NOTE: BioNetGen's sparse=>1 option refers to NETWORK GENERATION method, NOT the ODE solver.
    // The SPGMR (matrix-free Krylov) solver requires a preconditioner to work on stiff systems.
    // Without preconditioning, SPGMR fails on stiff models like Barua_2013.
    // For now, always use the dense CVODE solver which works reliably for moderate-sized models.
    // The dense solver can handle up to ~1000-2000 species; larger models would need SPGMR + preconditioner.

    // OPTIMIZATION: Use analytical Jacobian for mass-action kinetics (no functional rates)
    // This eliminates O(n²) finite-difference overhead and drastically reduces JS↔WASM boundary crossings
    const allMassAction = functionalRateCount === 0;

    // Stiffness detection: compute ratio of fastest/slowest rate constants
    // Models with rate ratios > 1e6 are extremely stiff and may need sparse_implicit
    let maxRate = -Infinity;
    let minRate = Infinity;
    for (const rxn of concreteReactions) {
      if (rxn.rateConstant > 0) {
        maxRate = Math.max(maxRate, rxn.rateConstant);
        minRate = Math.min(minRate, rxn.rateConstant);
      }
    }
    const rateRatio = minRate > 0 ? maxRate / minRate : 1;
    const isExtremelyStiff = rateRatio > 1e6;
    console.log(`[Worker] Rate ratio: ${rateRatio.toExponential(2)} (max=${maxRate.toExponential(2)}, min=${minRate.toExponential(2)})`);

    if (solverType === 'auto') {
      if (isExtremelyStiff) {
        // Use sparse_implicit for extremely stiff systems (like Barua models)
        solverType = 'sparse_implicit';
        console.log(`[Worker] Using ${solverType} solver for ${numSpecies} species - extremely stiff (rate ratio=${rateRatio.toExponential(2)})`);
      } else {
        // Use analytical Jacobian when all reactions are mass-action (no observable-dependent rates)
        solverType = allMassAction ? 'cvode_jac' : 'cvode';
        console.log(`[Worker] Using ${solverType} solver for ${numSpecies} species (allMassAction=${allMassAction})`);
      }
    }

    // Build analytical Jacobian for mass-action kinetics
    // J[i][k] = ∂(dSᵢ/dt)/∂Sₖ = Σ_r stoich[i][r] * k_r * ∂(∏ⱼ Sⱼ^nⱼ)/∂Sₖ
    // For mass-action: ∂velocity/∂Sₖ = velocity * reactant_order[k] / Sₖ
    // 
    // Storage formats:
    //   Column-major (CVODE):     J[i + k*n] = ∂f_i/∂y_k
    //   Row-major (Rosenbrock23): J[i*n + k] = ∂f_i/∂y_k

    let jacobianColMajor: ((y: Float64Array, J: Float64Array) => void) | undefined;
    let jacobianRowMajor: ((y: Float64Array, J: Float64Array) => void) | undefined;

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

      // JIT-compile Jacobian function (similar to derivatives, eliminates loop overhead)
      const buildJITJacobian = (columnMajor: boolean): ((y: Float64Array, J: Float64Array) => void) => {
        const lines: string[] = [];
        lines.push('J.fill(0);');
        lines.push('var v, dv;');

        for (let r = 0; r < concreteReactions.length; r++) {
          const rxn = concreteReactions[r];
          const k = rxn.rateConstant;
          const reactants = rxn.reactants;
          const reactantCounts = reactantCountMaps[r];

          // For each unique reactant speciesK, emit Jacobian update code
          for (const [speciesK, orderK] of reactantCounts) {
            // Build velocity term: k * y[r0] * y[r1] * ...
            let velocityTerm = `${k}`;
            for (let j = 0; j < reactants.length; j++) {
              velocityTerm += ` * y[${reactants[j]}]`;
            }

            // Derivative: dv = orderK * velocity / y[speciesK]
            // Handle y[speciesK] ≈ 0 case
            if (orderK === 1) {
              // First order: can compute partial product when y[k] ≈ 0
              let partialProduct = `${k}`;
              for (let j = 0; j < reactants.length; j++) {
                if (reactants[j] !== speciesK) {
                  partialProduct += ` * y[${reactants[j]}]`;
                }
              }
              lines.push(`dv = y[${speciesK}] > 1e-100 ? ${orderK} * (${velocityTerm}) / y[${speciesK}] : ${partialProduct};`);
            } else {
              // Higher order: dv = 0 when y[k] ≈ 0
              lines.push(`dv = y[${speciesK}] > 1e-100 ? ${orderK} * (${velocityTerm}) / y[${speciesK}] : 0;`);
            }

            // Update Jacobian entries
            if (columnMajor) {
              // Column-major: J[i + k*n]
              for (let j = 0; j < reactants.length; j++) {
                lines.push(`J[${reactants[j] + speciesK * numSpecies}] -= dv;`);
              }
              for (let j = 0; j < rxn.products.length; j++) {
                lines.push(`J[${rxn.products[j] + speciesK * numSpecies}] += dv;`);
              }
            } else {
              // Row-major: J[i*n + k]
              for (let j = 0; j < reactants.length; j++) {
                lines.push(`J[${reactants[j] * numSpecies + speciesK}] -= dv;`);
              }
              for (let j = 0; j < rxn.products.length; j++) {
                lines.push(`J[${rxn.products[j] * numSpecies + speciesK}] += dv;`);
              }
            }
          }
        }

        // Compile and return
        return new Function('y', 'J', lines.join('\n')) as (y: Float64Array, J: Float64Array) => void;
      };

      // Build JIT-compiled Jacobians (fallback to interpreted if too many reactions)
      if (concreteReactions.length < 2000) {
        try {
          jacobianColMajor = buildJITJacobian(true);
          jacobianRowMajor = buildJITJacobian(false);
          console.log(`[Worker] JIT-compiled analytical Jacobians (col-major + row-major) for ${concreteReactions.length} reactions`);
        } catch (e) {
          console.warn('[Worker] JIT Jacobian compilation failed, using interpreted version');
        }
      }
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
      solver: solverType as 'auto' | 'cvode' | 'cvode_jac' | 'rosenbrock23' | 'rk45' | 'rk4' | 'sparse_implicit',
    };

    // Pass analytical Jacobian if available (correct format for each solver)
    if (jacobianColMajor && solverType === 'cvode_jac') {
      solverOptions.jacobian = jacobianColMajor;
    }
    if (jacobianRowMajor && ['rosenbrock23', 'auto', 'cvode_auto'].includes(solverType)) {
      solverOptions.jacobianRowMajor = jacobianRowMajor;
    }

    console.log('[Worker] ODE solver options (native BNG compatible):', solverOptions);

    const odeStart = performance.now();

    // State vector for simulation - preserved across phases
    let y = new Float64Array(state);
    let globalTime = 0; // Cumulative time across all phases

    // Multi-phase simulation loop
    for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
      const phase = phases[phaseIdx];
      const isLastPhase = phaseIdx === phases.length - 1;

      if (hasMultiPhase) {
        console.log(`[Worker] Starting phase ${phaseIdx + 1}/${phases.length}: t_end=${phase.t_end}, n_steps=${phase.n_steps}`);
      }

      // Apply concentration changes that should happen BEFORE this phase
      // (afterPhaseIndex === phaseIdx - 1 means "after previous phase" = "before this phase")
      for (const change of concentrationChanges) {
        if (change.afterPhaseIndex === phaseIdx - 1) {
          // Resolve parameter value
          let resolvedValue: number;
          if (typeof change.value === 'number') {
            resolvedValue = change.value;
          } else {
            // Look up parameter value
            const paramValue = model.parameters?.[change.value];
            resolvedValue = typeof paramValue === 'number' ? paramValue : parseFloat(String(paramValue)) || 0;
          }

          // Find species index using speciesMap (exact match or pattern match)
          let speciesIdx = speciesMap.get(change.species);

          // If not found directly, try to find a matching species
          if (speciesIdx === undefined) {
            for (const [speciesName, idx] of speciesMap.entries()) {
              // Try prefix match or contains match
              if (speciesName.startsWith(change.species.split('(')[0] + '(')) {
                speciesIdx = idx;
                break;
              }
            }
          }

          if (speciesIdx !== undefined) {
            console.log(`[Worker] Phase ${phaseIdx}: setConcentration("${change.species}") = ${resolvedValue} (species index ${speciesIdx})`);
            y[speciesIdx] = resolvedValue;
            state[speciesIdx] = resolvedValue;
          } else {
            console.warn(`[Worker] Phase ${phaseIdx}: Could not find species for setConcentration("${change.species}")`);
          }
        }
      }

      // Apply parameter changes that should happen BEFORE this phase
      // (afterPhaseIndex === phaseIdx - 1 means "after previous phase" = "before this phase")
      for (const change of parameterChanges) {
        if (change.afterPhaseIndex === phaseIdx - 1) {
          // Resolve the new parameter value
          let resolvedValue: number;
          if (typeof change.value === 'number') {
            resolvedValue = change.value;
          } else {
            // Try to evaluate expression (may reference other params)
            try {
              // Simple expression evaluation with parameter substitution
              let expr = change.value;
              for (const [pName, pVal] of Object.entries(model.parameters || {})) {
                expr = expr.replace(new RegExp(`\\b${pName}\\b`, 'g'), String(pVal));
              }
              expr = expr.replace(/\^/g, '**');
              resolvedValue = new Function('return ' + expr)() as number;
            } catch (e) {
              console.warn(`[Worker] Failed to evaluate setParameter expression "${change.value}":`, e);
              resolvedValue = parseFloat(String(change.value)) || 0;
            }
          }

          console.log(`[Worker] Phase ${phaseIdx}: setParameter("${change.parameter}") = ${resolvedValue}`);

          // Update the parameter in BOTH inputModel and model (model is used for functional rate evaluation)
          if (inputModel.parameters) {
            inputModel.parameters[change.parameter] = resolvedValue;
          }
          if (model.parameters) {
            model.parameters[change.parameter] = resolvedValue;
          }

          // Recalculate derived parameters that depend on the changed parameter
          if (inputModel.paramExpressions) {
            const recalculated = new Set<string>();
            let changed = true;
            while (changed) {
              changed = false;
              for (const [paramName, paramExpr] of Object.entries(inputModel.paramExpressions)) {
                if (recalculated.has(paramName)) continue;
                // Check if this expression uses any parameter we've changed
                if (new RegExp(`\\b${change.parameter}\\b`).test(paramExpr) ||
                  [...recalculated].some(p => new RegExp(`\\b${p}\\b`).test(paramExpr))) {
                  try {
                    let expr = paramExpr;
                    for (const [pName, pVal] of Object.entries(model.parameters || {})) {
                      expr = expr.replace(new RegExp(`\\b${pName}\\b`, 'g'), String(pVal));
                    }
                    expr = expr.replace(/\^/g, '**');
                    const newVal = new Function('return ' + expr)() as number;
                    if (!isNaN(newVal) && isFinite(newVal)) {
                      const oldVal = model.parameters?.[paramName] ?? 0;
                      if (oldVal !== newVal) {
                        if (inputModel.parameters) inputModel.parameters[paramName] = newVal;
                        if (model.parameters) model.parameters[paramName] = newVal;
                        recalculated.add(paramName);
                        changed = true;
                        console.log(`[Worker] Phase ${phaseIdx}: Recalculated ${paramName} = ${oldVal} -> ${newVal}`);
                      }
                    }
                  } catch (e) {
                    // Ignore evaluation errors for complex expressions
                  }
                }
              }
            }
          }
        }
      }

      // Create solver with phase-specific tolerances
      const phaseAtol = phase.atol ?? userAtol;
      const phaseRtol = phase.rtol ?? userRtol;
      const phaseSolverOptions = {
        ...solverOptions,
        atol: phaseAtol,
        rtol: phaseRtol
      };

      const solver = await createSolver(numSpecies, derivatives, phaseSolverOptions);

      const phase_t_end = phase.t_end;
      const phase_n_steps = phase.n_steps;
      const dtOut = phase_t_end / phase_n_steps;
      let t = 0;

      // Only add initial point for the final phase (or single phase)
      if (isLastPhase) {
        data.push({ time: globalTime + t, ...evaluateObservablesFast(y) });
        const odeSpeciesPoint0: Record<string, number> = { time: globalTime + t };
        for (let i = 0; i < numSpecies; i++) odeSpeciesPoint0[speciesHeaders[i]] = y[i];
        speciesData.push(odeSpeciesPoint0);
      }

      // Steady state detection
      const tolerance = options.steadyStateTolerance ?? 1e-6;
      const window = options.steadyStateWindow ?? 5;
      const enforceSteadyState = phase.steady_state ?? !!options.steadyState;
      let consecutiveStable = 0;
      let shouldStop = false;
      let prevY = new Float64Array(numSpecies);

      // DEBUG: Check derivatives at phase start
      const dydt = new Float64Array(numSpecies);
      derivatives(y, dydt);
      let maxDeriv = 0;
      for (let i = 0; i < numSpecies; i++) maxDeriv = Math.max(maxDeriv, Math.abs(dydt[i]));
      console.log(`[Worker] Phase ${phaseIdx}: Max derivative at t=0: ${maxDeriv}`);

      // Integration loop for this phase
      for (let i = 1; i <= phase_n_steps && !shouldStop; i += 1) {
        checkCancelled();
        const tTarget = i * dtOut;

        // Save previous state for steady-state check
        prevY.set(y);

        // Integrate from current t to tTarget using adaptive solver
        const result = solver.integrate(y, t, tTarget, checkCancelled);

        if (!result.success) {
          const errorMsg = result.errorMessage || 'Unknown error';
          let userFriendlyMessage = errorMsg;
          let suggestion = '';

          if (errorMsg.includes('flag -3') || errorMsg.includes('CV_CONV_FAILURE')) {
            userFriendlyMessage = `Simulation reached t=${t.toFixed(2)} (phase ${phaseIdx + 1}) before numerical convergence failed. ` +
              `This model has extreme stiffness that exceeds browser-based solver limits.`;
            suggestion = 'Try increasing tolerances (atol/rtol) in simulation settings, or use SSA method for stochastic simulation.';
          } else if (errorMsg.includes('flag -4') || errorMsg.includes('CV_ERR_FAILURE')) {
            userFriendlyMessage = `Simulation reached t=${t.toFixed(2)} (phase ${phaseIdx + 1}) before error tolerance was exceeded. ` +
              `This model has very sharp transients that are difficult to track accurately.`;
            suggestion = 'Try increasing tolerances, reducing simulation time, or using SSA method.';
          }

          console.warn(`[Worker] ODE solver failed at phase ${phaseIdx}, t=${t}: ${errorMsg}`);

          if (data.length > 1 || isLastPhase) {
            console.warn(`[Worker] Returning ${data.length} partial time points up to t=${globalTime + t}`);
            postMessage({
              type: 'progress',
              message: `Simulation stopped at t=${(globalTime + t).toFixed(2)} (phase ${phaseIdx + 1}, ${data.length} time points)`,
              warning: userFriendlyMessage
            });
            shouldStop = true;
            break;
          } else {
            throw new Error(`${userFriendlyMessage}${suggestion ? '\n\nSuggestion: ' + suggestion : ''}`);
          }
        }

        // Update state
        y.set(result.y);
        t = result.t;

        // Check steady state (applies per phase if phase.steady_state is set)
        if (enforceSteadyState) {
          let maxDelta = 0;
          for (let k = 0; k < numSpecies; k++) {
            const d = Math.abs(y[k] - prevY[k]);
            if (d > maxDelta) maxDelta = d;
          }
          if (maxDelta <= tolerance) {
            consecutiveStable++;
            if (consecutiveStable >= window) {
              console.log(`[Worker] Phase ${phaseIdx}: Steady state reached at t=${t}`);
              shouldStop = true;
            }
          } else {
            consecutiveStable = 0;
          }
        }

        // Only record data from the final phase
        if (isLastPhase) {
          data.push({ time: Math.round((globalTime + t) * 1e10) / 1e10, ...evaluateObservablesFast(y) });
          const speciesPoint: Record<string, number> = { time: Math.round((globalTime + t) * 1e10) / 1e10 };
          for (let k = 0; k < numSpecies; k++) {
            speciesPoint[speciesHeaders[k]] = y[k];
          }
          speciesData.push(speciesPoint);
        }

        // Progress update for long-running phases
        if (i % Math.ceil(phase_n_steps / 10) === 0) {
          const phaseProgress = (i / phase_n_steps) * 100;
          const overallProgress = hasMultiPhase
            ? ((phaseIdx + phaseProgress / 100) / phases.length) * 100
            : phaseProgress;
          postMessage({
            type: 'progress',
            message: hasMultiPhase
              ? `Phase ${phaseIdx + 1}/${phases.length}: ${phaseProgress.toFixed(0)}%`
              : `Simulating: ${phaseProgress.toFixed(0)}%`,
            simulationProgress: overallProgress
          });
        }
      }

      // Update global time after this phase
      globalTime += t;

      // For non-final phases: only break entirely on solver ERROR, not steady state.
      // Steady state in equilibration phases is expected and should proceed to next phase.
      if (shouldStop && !isLastPhase) {
        // Check if it was an error or just steady state
        if (data.length === 0 && phaseIdx === 0) {
          // If phase 0 (equilibration) reached steady state, that's fine - continue to next phase
          console.log(`[Worker] Phase ${phaseIdx}: Equilibration complete, proceeding to next phase`);
          shouldStop = false; // Reset flag so next phase can run
        } else {
          console.warn(`[Worker] Stopping early at phase ${phaseIdx} due to error`);
          break;
        }
      }
    }

    const odeTime = performance.now() - odeStart;
    const totalTime = performance.now() - simulationStartTime;
    console.log('[Worker] ⏱️ TIMING: ODE integration took', odeTime.toFixed(0), 'ms');
    console.log('[Worker] ⏱️ TIMING: Total simulation time', totalTime.toFixed(0), 'ms');
    console.log('[Worker] ⏱️ SUMMARY: Parse=N/A, Network=' + networkGenTime.toFixed(0) + 'ms, ODE=' + odeTime.toFixed(0) + 'ms, Total=' + totalTime.toFixed(0) + 'ms');

    return { headers, data, speciesHeaders, speciesData, expandedReactions: model.reactions, expandedSpecies: model.species } satisfies SimulationResults;
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
      const model = parseBNGLModel(code);
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
      cachedModels.delete(modelId);
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