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
import { GraphMatcher } from '../src/services/graph/core/Matcher';
import { countEmbeddingDegeneracy } from '../src/services/graph/core/degeneracy';
// SafeExpressionEvaluator will be dynamically imported only when functional rates are enabled to avoid bundling vulnerable libs
// Using official ANTLR parser for bng2.pl parity (util polyfill added in vite.config.ts)
import { parseBNGLStrict as parseBNGLModel } from '../src/parser/BNGLParserWrapper';
// Conservation law detection is available in ConservationLaws.ts for future use
// Note: WebGPU solver is dynamically imported when needed to avoid loading dead code in unsupported browsers


const ctx: DedicatedWorkerGlobalScope = typeof self !== 'undefined'
  ? (self as unknown as DedicatedWorkerGlobalScope)
  : ({} as unknown as DedicatedWorkerGlobalScope);

// Feature flags & runtime configuration moved to a small module
// (keeps the worker file smaller and test-friendly)
import { getFeatureFlags, registerCacheClearCallback } from './featureFlags';

type JobState = {
  cancelled: boolean;
  controller?: AbortController;
};

const jobStates = new Map<number, JobState>();

// Ring buffer for logs to prevent memory blowup
// Default size (1000) chosen to capture ~5-10 minutes of active simulation logs
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

const safeStringify = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    });
  } catch {
    try {
      return String(value);
    } catch {
      return '[Unserializable]';
    }
  }
};

const setBoundedCache = <K, V>(cache: Map<K, V>, key: K, value: V, maxSize: number): void => {
  if (maxSize <= 0) return;
  // Refresh insertion order (Map preserves insertion order, so delete+set moves to end)
  cache.delete(key); // No-op if doesn't exist; refreshes order if it does
  cache.set(key, value);
  // Evict oldest entry if over limit (O(1) operation, not O(n) loop)
  if (cache.size > maxSize) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
};

// Override console.log/warn/error to use ring buffer and prevent circular object crashes
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleDebug = console.debug;

console.log = (...args: any[]) => {
  const message = args.map((arg) => safeStringify(arg)).join(' ');
  logBuffer.add(message);
  originalConsoleLog(...args); // Still log to actual console for debugging
};

console.warn = (...args: any[]) => {
  const message = '[WARN] ' + args.map((arg) => safeStringify(arg)).join(' ');
  logBuffer.add(message);
  originalConsoleWarn(...args);
};

console.error = (...args: any[]) => {
  const message = '[ERROR] ' + args.map((arg) => safeStringify(arg)).join(' ');
  logBuffer.add(message);
  originalConsoleError(...args);
};
console.debug = (...args: any[]) => {
  const message = '[DEBUG] ' + args.map((arg) => safeStringify(arg)).join(' ');
  logBuffer.add(message);
  originalConsoleDebug?.(...args);
};
const cachedModels = new Map<number, BNGLModel>();
let nextModelId = 1;
// LRU cache size limit for cached models inside the worker
// Limit chosen to support multiple open tabs/models without excessive memory (8 × ~1MB avg = ~8MB)
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

// --- Type Guards for Worker Payloads ---
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const isSimulateModelPayload = (p: unknown): p is { model: BNGLModel; options: SimulationOptions } => {
  if (!isRecord(p)) return false;
  return 'model' in p && 'options' in p;
};

const isSimulateModelIdPayload = (
  p: unknown
): p is { modelId: number; parameterOverrides?: Record<string, number>; options: SimulationOptions } => {
  if (!isRecord(p)) return false;
  const idVal = (p as Record<string, unknown>).modelId;
  return 'modelId' in p && typeof idVal === 'number' && 'options' in p;
};

const isCacheModelPayload = (p: unknown): p is { model: BNGLModel } => {
  return isRecord(p) && 'model' in p;
};

const isReleaseModelPayload = (p: unknown): p is { modelId: number } => {
  if (!isRecord(p) || !('modelId' in p)) return false;
  const idVal = (p as Record<string, unknown>).modelId;
  return typeof idVal === 'number';
};

if (typeof ctx.addEventListener === 'function') {
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
}

if (typeof ctx.addEventListener === 'function') {
  ctx.addEventListener('unhandledrejection', (event) => {
    const payload: SerializedWorkerError = serializeError(event.reason ?? 'Unhandled rejection in worker');
    ctx.postMessage({ id: -1, type: 'worker_internal_error', payload });
    event.preventDefault();
  });
}

// --- Helper: Compartment Utilities ---
const getCompartment = (s: string) => {
  const prefix = s.match(/^@([A-Za-z0-9_]+):/);
  if (prefix) return prefix[1];
  const suffix = s.match(/@([A-Za-z0-9_]+)$/);
  if (suffix) return suffix[1];
  return null;
};

const removeCompartment = (s: string) => {
  // Support both Web-style "@cell:Species" and BNG2-style "@cell::Species"
  return s.replace(/^@[A-Za-z0-9_]+::?/, '').replace(/@[A-Za-z0-9_]+$/, '');
};

// --- Helper: Extract compartment from a single molecule string ---
// Handles molecule-level suffix format like "L(r)@PM" → { compartment: "PM", cleanMol: "L(r)" }
// Also handles double-compartment molecules like "@PM::L(r!1)@EC" where PM is the complex compartment
// and EC is the molecule's origin compartment - strips both for pattern matching.
function getMoleculeCompartment(mol: string): { compartment: string | null; cleanMol: string } {
  // Match molecule with compartment prefix: @COMP:Name(components) or @COMP::Name(components)
  const prefixMatch = mol.match(/^@([A-Za-z0-9_]+)::?(.+)$/);
  if (prefixMatch) {
    // Also strip any suffix compartment from cleanMol (e.g., "L(r!1)@EC" -> "L(r!1)")
    let cleanMol = prefixMatch[2];
    const suffixMatch = cleanMol.match(/^(.+)@([A-Za-z0-9_]+)$/);
    if (suffixMatch) {
      cleanMol = suffixMatch[1];
    }
    return { compartment: prefixMatch[1], cleanMol };
  }

  // Match molecule with compartment suffix: Name(components)@COMPARTMENT or Name@COMPARTMENT
  const match = mol.match(/^(.+)@([A-Za-z0-9_]+)$/);
  if (match) {
    return { compartment: match[2], cleanMol: match[1] };
  }
  return { compartment: null, cleanMol: mol };
}

// Observable pattern matching cache - bounded to prevent unbounded growth across simulations
// Size: ~1000 entries ≈ 500KB (chosen for typical browser memory constraints)
const parsedGraphCache = new Map<string, ReturnType<typeof BNGLParser.parseSpeciesGraph>>();
const MAX_PARSED_GRAPH_CACHE = 1000;
function parseGraphCached(str: string) {
  const cacheKey = `${PARSED_GRAPH_CACHE_VERSION}::${str}`;
  const cached = parsedGraphCache.get(cacheKey);
  if (cached) return cached;
  const parsed = BNGLParser.parseSpeciesGraph(str);
  setBoundedCache(parsedGraphCache, cacheKey, parsed, MAX_PARSED_GRAPH_CACHE);
  return parsed;
}

// --- Helper: Count ALL embeddings of a single-molecule pattern into a target molecule ---
// For Molecules observables, BNG2 counts all ways the pattern can embed.
// E.g., pattern A(b) matching A(b,b) = 2 embeddings (one for each free b site)
function countMoleculeEmbeddings(patMol: string, specMol: string): number {
  try {
    const patGraph = parseGraphCached(patMol);
    const specGraph = parseGraphCached(specMol);

    if (!GraphMatcher.matchesPattern(patGraph, specGraph)) {
      return 0;
    }

    // Single-molecule observable: count all valid component assignments within the molecule.
    // This matches BNG2's behavior for Molecules observables like A(b) matching A(b,b) => 2.
    const match = { moleculeMap: new Map<number, number>([[0, 0]]), componentMap: new Map<string, string>() };
    return countEmbeddingDegeneracy(patGraph, specGraph, match);
  } catch {
    return 0;
  }
}

// --- Helper: Check if Species Matches Pattern (Boolean) ---
// Handles multi-molecule patterns with bond connectivity verification
function isSpeciesMatch(speciesStr: string, pattern: string): boolean {
  const patComp = getCompartment(pattern);
  const specComp = getCompartment(speciesStr);

  if (patComp && patComp !== specComp) return false;

  const cleanPat = removeCompartment(pattern);
  const cleanSpec = removeCompartment(speciesStr);

  try {
    const patGraph = parseGraphCached(cleanPat);
    const specGraph = parseGraphCached(cleanSpec);
    return GraphMatcher.matchesPattern(patGraph, specGraph);
  } catch {
    return false;
  }
}

/**
 * Counts the number of molecules in a species that can serve as the "anchor" (first molecule)
 * for a match of a multi-molecule pattern. This follows BNG2 semantics for Molecules observables.
 * E.g., for pattern egfr.egfr and species egfr-egfr, it returns 2.
 * For pattern A.B and species A-B, it returns 1 (anchored on A).
 */
export function countMultiMoleculePatternMatches(speciesStr: string, pattern: string): number {
  const patComp = getCompartment(pattern);
  const specComp = getCompartment(speciesStr);

  if (patComp && patComp !== specComp) return 0;

  const cleanPat = removeCompartment(pattern);
  const cleanSpec = removeCompartment(speciesStr);

  try {
    const patGraph = parseGraphCached(cleanPat);
    const specGraph = parseGraphCached(cleanSpec);

    // BNG2 semantics for Molecules observables (multi-molecule patterns):
    // Count ALL embeddings of the pattern into the species.
    // For homodimers like egfr.egfr matching egfr-egfr, this returns 2
    // (one embedding with egfr1→pattern-mol0, egfr2→pattern-mol1, and vice versa).
    // This is consistent with BNG2's counting behavior for symmetric patterns.
    const maps = GraphMatcher.findAllMaps(patGraph, specGraph);
    return maps.length;
  } catch {
    return 0;
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
    // Multi-molecule pattern: count anchor molecules (BNG2 Molecules observable semantics)
    // For homodimers like R.R matching R-R, this returns 2 (either R can be anchor)
    return countMultiMoleculePatternMatches(speciesStr, patternStr);
  } else {
    // Single-molecule pattern: sum up all embeddings across all molecules
    // E.g., A(b) matching species with A(b,b) should count 2 (one for each free b site)
    const specMols = cleanSpec.split('.');
    let count = 0;
    for (const sMol of specMols) {
      // Add the actual number of embeddings, not just 1 if matches
      count += countMoleculeEmbeddings(cleanPat, sMol);
    }
    return count;
  }
}



// --- Helper: Evaluate Functional Rate Expression ---
// Evaluates a rate expression that may contain observable names and function calls
// at runtime using current observable values

// PERFORMANCE OPTIMIZATION: Cache for pre-expanded expressions (function calls replaced)
const expandedExpressionCache: Map<string, string> = new Map();
const MAX_EXPANDED_EXPRESSION_CACHE = 2000;  // Reduced for browser memory constraints (was 20000)

// PERFORMANCE OPTIMIZATION: Pre-compile expressions into functions
// These functions take context as argument and return the rate
// Size: ~2000 entries ≈ 2MB (1:1 mapping with expandedExpressionCache)
const compiledRateFunctions: Map<string, (context: Record<string, number>) => number> = new Map();
const MAX_COMPILED_RATE_FUNCTIONS = 2000;

/**
 * FNV-1a hash function for compact cache keys.
 * Produces a 32-bit hash as a hex string (8 characters).
 */
function fnv1aHash(str: string): string {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // FNV prime, keep 32-bit
  }
  return hash.toString(16).padStart(8, '0');
}


// Cache versioning for compiled rate functions (bump to invalidate old entries)
// Semantic cache versions (bump to invalidate old entries)
let COMPILED_RATE_CACHE_VERSION = '1.0.0';
let EXPANDED_EXPR_CACHE_VERSION = '1.0.0';
let PARSED_GRAPH_CACHE_VERSION = '1.0.0';

/**
 * Interface for expression evaluators (SafeExpressionEvaluator or test mocks).
 * Defines the contract for secure expression compilation and evaluation.
 */
export interface ExpressionEvaluator {
  compile: (expr: string, vars: string[]) => (ctx: Record<string, number>) => number;
  getReferencedVariables: (expr: string) => string[];
  evaluateConstant: (expr: string) => number;
}

// Lazy reference to the evaluator module - only populated when functional rates are enabled and the module is loaded
let SafeExpressionEvaluatorRef: ExpressionEvaluator | undefined = undefined;

/**
 * Internal loader: dynamically load evaluator (used internally by simulate)
 */
async function loadEvaluator(): Promise<void> {
  if (!SafeExpressionEvaluatorRef) {
    const mod = await import('./safeExpressionEvaluator');
    SafeExpressionEvaluatorRef = mod.SafeExpressionEvaluator;
  }
}

/**
 * Test helper: allow tests to inject or load an evaluator reference synchronously.
 * Tests should import `SafeExpressionEvaluator` via dynamic import and then call
 * `_setEvaluatorRefForTests(mod.SafeExpressionEvaluator)`.
 */
export function _setEvaluatorRefForTests(ref: any): void {
  SafeExpressionEvaluatorRef = ref;
}

function bumpPatchVersion(v: string): string {
  const parts = v.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return v;
  parts[2] = parts[2] + 1;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

function clearAllCaches() {
  expandedExpressionCache.clear();
  compiledRateFunctions.clear();
  parsedGraphCache.clear();
  // Also bump versions for defense-in-depth if needed
  COMPILED_RATE_CACHE_VERSION = bumpPatchVersion(COMPILED_RATE_CACHE_VERSION);
  EXPANDED_EXPR_CACHE_VERSION = bumpPatchVersion(EXPANDED_EXPR_CACHE_VERSION);
  PARSED_GRAPH_CACHE_VERSION = bumpPatchVersion(PARSED_GRAPH_CACHE_VERSION);
}

// Register callback to clear all caches if security-sensitive flags are changed
registerCacheClearCallback(clearAllCaches);


/**
 * Try to evaluate a constant expression using the evaluator if present,
 * otherwise fallback to a safe parseFloat-based fallback (best-effort).
 */
function evaluateExpressionOrParse(expr: string): number {
  try {
    if (SafeExpressionEvaluatorRef && typeof SafeExpressionEvaluatorRef.evaluateConstant === 'function') {
      return SafeExpressionEvaluatorRef.evaluateConstant(expr);
    }
  } catch (e) {
    console.warn('[Worker] evaluateExpressionOrParse: evaluator failed:', e?.message ?? String(e));
  }
  const n = parseFloat(String(expr));
  return Number.isNaN(n) ? 0 : n;
}

// Backwards-compatible shim so legacy calls to `SafeExpressionEvaluator.evaluateConstant`
// inside this worker will continue to function by delegating to the dynamic ref or
// falling back to a parseFloat-based best-effort implementation.
const SafeExpressionEvaluator = {
  evaluateConstant: (expr: string) => evaluateExpressionOrParse(expr),
};

// Register a callback with the central feature-flag module so that when flags are
// toggled (e.g. functionalRatesEnabled => false) we can clear internal caches.
registerCacheClearCallback(() => {
  clearAllCaches();
  SafeExpressionEvaluatorRef = undefined;
  console.warn('[Worker] Functional rates disabled via featureFlags — caches cleared');
});

/** Testing helper: return current cache sizes (useful for unit tests) */
export function getCacheSizes() {
  return {
    expandedExpressionCacheSize: expandedExpressionCache.size,
    compiledRateFunctionsSize: compiledRateFunctions.size,
    parsedGraphCacheSize: parsedGraphCache.size,
    compiledVersion: COMPILED_RATE_CACHE_VERSION,
    expandedVersion: EXPANDED_EXPR_CACHE_VERSION,
    parsedVersion: PARSED_GRAPH_CACHE_VERSION,
  };
}



function preExpandExpression(
  expression: string,
  functions?: { name: string; args: string[]; expression: string }[]
): string {
  // Check cache first (versioned)
  const cacheKey = `${EXPANDED_EXPR_CACHE_VERSION}::${expression}`;
  const cached = expandedExpressionCache.get(cacheKey);
  if (cached !== undefined) return cached;

  // First, replace function calls with their expanded expressions
  let expandedExpr = expression;
  if (functions && functions.length > 0) {
    // Repeatedly expand function calls (handles nested calls)
    for (let pass = 0; pass < 10; pass++) {
      let foundFunction = false;
      for (const func of functions) {
        // BNG2 allows zero-argument functions with or without parentheses:
        //   - k_func() - with parentheses
        //   - k_func - without parentheses (just the function name as a word)
        // First try with parentheses, then try without
        const funcCallWithParens = new RegExp(`\\b${func.name}\\s*\\(\\s*\\)`, 'g');
        if (funcCallWithParens.test(expandedExpr)) {
          foundFunction = true;
          expandedExpr = expandedExpr.replace(funcCallWithParens, `(${func.expression})`);
        }
        // Also match function name without parentheses (zero-arg function used as bare name)
        // Only for zero-argument functions
        if (func.args.length === 0) {
          const funcCallNoParens = new RegExp(`\\b${func.name}\\b(?!\\s*\\()`, 'g');
          if (funcCallNoParens.test(expandedExpr)) {
            foundFunction = true;
            expandedExpr = expandedExpr.replace(funcCallNoParens, `(${func.expression})`);
          }
        }
      }
      if (!foundFunction) break;
    }
  }

  // expr-eval supports ^ as power; no replacement needed

  setBoundedCache(expandedExpressionCache, cacheKey, expandedExpr, MAX_EXPANDED_EXPRESSION_CACHE);
  return expandedExpr;
}

// Helper to get evaluator (ref or override or require)
function getEvaluator(override?: ExpressionEvaluator): ExpressionEvaluator | null {
  if (override) return override;
  if (SafeExpressionEvaluatorRef) return SafeExpressionEvaluatorRef;

  // Fallback for Node environment
  if (typeof (globalThis as any).require === 'function') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = (globalThis as any).require('./safeExpressionEvaluator');
      return (mod.SafeExpressionEvaluator ?? mod) as ExpressionEvaluator;
    } catch (e) {
      // Ignore
    }
  }
  return null;
}

export function getCompiledRateFunction(
  expandedExpr: string,
  varNames: string[],
  evaluatorOverride?: ExpressionEvaluator
): (context: Record<string, number>) => number {
  if (!getFeatureFlags().functionalRatesEnabled) {
    throw new Error('Functional rates temporarily disabled pending security review');
  }

  const evaluator = getEvaluator(evaluatorOverride);
  if (!evaluator) {
    throw new Error('SafeExpressionEvaluator not loaded; ensure functional rates are enabled and evaluator is initialized');
  }

  // Determine referenced variables from parsed expression and restrict to provided varNames
  let referenced: string[] = [];
  try {
    referenced = evaluator.getReferencedVariables(expandedExpr);
  } catch (e: any) {
    console.warn(`[getCompiledRateFunction] Could not extract variables for '${expandedExpr}': ${e?.message ?? String(e)}`);
    referenced = [];
  }

  const usedVars = referenced.filter((v) => varNames.includes(v));
  // Use hash for compact cache keys (Issue #4 fix)
  const cacheKey = `${COMPILED_RATE_CACHE_VERSION}::${fnv1aHash(expandedExpr)}__${usedVars.sort().join(',')}`;
  const cached = compiledRateFunctions.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const fn = evaluator.compile(expandedExpr, usedVars);
    setBoundedCache(compiledRateFunctions, cacheKey, fn, MAX_COMPILED_RATE_FUNCTIONS);
    return fn;
  } catch (e: any) {
    console.error(`[getCompiledRateFunction] Failed to compile '${expandedExpr}': ${e?.message ?? String(e)}`);
    const zeroFn = () => 0;
    setBoundedCache(compiledRateFunctions, cacheKey, zeroFn, MAX_COMPILED_RATE_FUNCTIONS);
    return zeroFn;
  }
}

export function evaluateFunctionalRate(
  expression: string,
  parameters: Record<string, number>,
  observableValues: Record<string, number>,
  functions?: { name: string; args: string[]; expression: string }[],
  prebuiltContext?: Record<string, number>,
  evaluatorOverride?: ExpressionEvaluator
): number {
  if (!getFeatureFlags().functionalRatesEnabled) {
    throw new Error('Functional rates temporarily disabled pending security review');
  }

  // Build context with parameters and observable values (or use prebuilt for performance)
  const context: Record<string, number> = prebuiltContext || { ...parameters, ...observableValues };

  // Get pre-expanded expression (cached)
  const expandedExpr = preExpandExpression(expression, functions);

  // Get compiled function (cached)
  const varNames = Object.keys(context);
  const fn = getCompiledRateFunction(expandedExpr, varNames, evaluatorOverride);

  try {
    const result = fn(context);
    if (expression.includes('rate_transcribe')) {
      //console.log(`[Debug] Evaluating rate_transcribe: ${expression}`);
      //console.log(`[Debug] Context keys: ${Object.keys(context).join(', ')}`);
      const tfNuc = context['TF_nuc'] ?? context['@NU:TF()'] ?? context['TF_nuc()'];
      if (Math.random() < 0.01) console.log(`[Debug] rate_transcribe result: ${result} (TF_nuc value: ${tfNuc})`);
    }
    if (typeof result !== 'number' || !isFinite(result)) {
      console.error(`[evaluateFunctionalRate] Expression '${expression}' evaluated to non-numeric: ${result}`);
      return 0;
    }
    return result;
  } catch (e: any) {
    console.error(`[evaluateFunctionalRate] Failed to evaluate '${expression}': ${e?.message ?? String(e)}`);
    return 0;
  }
}

function parseBNGL(jobId: number, bnglCode: string): BNGLModel {
  ensureNotCancelled(jobId);
  return parseBNGLModel(bnglCode);
}

/**
 * Convert worker's concreteReactions to GPUReaction[] format for WebGPU solver
 * Note: Dynamically imports WebGPU types when needed
 */
async function convertReactionsToGPU(
  concreteReactions: Array<{
    reactants: Int32Array;
    products: Int32Array;
    rateConstant: number;
  }>
): Promise<{ gpuReactions: any[]; rateConstants: number[] }> {
  const gpuReactions: any[] = [];
  const rateConstants: number[] = [];

  concreteReactions.forEach((rxn, idx) => {
    // Build reactant stoichiometry map
    const reactantMap = new Map<number, number>();
    for (let i = 0; i < rxn.reactants.length; i++) {
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
    rateConstants.push(rxn.rateConstant);
  });

  return { gpuReactions, rateConstants };
}

async function generateExpandedNetwork(jobId: number, inputModel: BNGLModel): Promise<BNGLModel> {
  console.log('[Worker] Starting network generation for model with', inputModel.species.length, 'species and', inputModel.reactionRules.length, 'rules');

  // Convert BNGLModel to graph structures
  const seedSpecies = inputModel.species.map((s) => BNGLParser.parseSpeciesGraph(s.name));

  // Create a map of CANONICAL seed species names to concentrations
  const seedConcentrationMap = new Map<string, number>();
  inputModel.species.forEach((s) => {
    const g = BNGLParser.parseSpeciesGraph(s.name);
    const canonicalName = GraphCanonicalizer.canonicalize(g);
    seedConcentrationMap.set(canonicalName, s.initialConcentration);
  });

  const formatSpeciesList = (list: string[]) => (list.length > 0 ? list.join(' + ') : '0');

  // Create sets for detecting functional rates (observables and functions)
  const observableNames = new Set(inputModel.observables.map((o) => o.name));
  const functionNames = new Set((inputModel.functions || []).map((f) => f.name));

  // Set of parameter names that may be changed via setParameter commands
  // (detect during rate expression checking to preserve as functional)
  const changingParams = new Set((inputModel.parameterChanges || []).map(c => c.parameter));

  // Helper to check if a rate expression contains observable, function, OR changing parameter references
  const isFunctionalRateExpr = (rateExpr: string): boolean => {
    if (!rateExpr) return false;
    for (const obsName of observableNames) {
      if (new RegExp(`\\b${obsName}\\b`).test(rateExpr)) return true;
    }
    // BNG2 allows functions to be used without parentheses when they have no arguments:
    //   e.g., `k_IKKKactivation` instead of `k_IKKKactivation()`
    // So we check for the function name as a word boundary match
    for (const funcName of functionNames) {
      if (new RegExp(`\\b${funcName}\\b`).test(rateExpr)) return true;
    }
    // Check for changing parameter references (for setParameter parity)
    for (const paramName of changingParams) {
      if (new RegExp(`\\b${paramName}\\b`).test(rateExpr)) return true;
    }
    return false;
  };

  const rules = inputModel.reactionRules.flatMap((r) => {
    const parametersMap = new Map(Object.entries(inputModel.parameters));

    // Check if this is a functional rate (depends on observables or functions)
    const isForwardFunctional = isFunctionalRateExpr(r.rate);
    const isReverseFunctional = r.reverseRate ? isFunctionalRateExpr(r.reverseRate) : false;

    if (r.rate.includes('rate_transcribe')) {
      console.log(`[Debug] Checking rate_transcribe functional: ${r.rate} -> ${isForwardFunctional}`);
      console.log(`[Debug] Function names: ${Array.from(functionNames).join(', ')}`);
      console.log(`[Debug] Observable names: ${Array.from(observableNames).join(', ')}`);
    }

    // For functional rates, use 0 as placeholder (will be evaluated dynamically at simulation time)
    // For static rates, try to evaluate
    let rate: number;
    if (isForwardFunctional) {
      rate = 0;
    } else {
      try {
        rate = BNGLParser.evaluateExpression(r.rate, parametersMap);
        if (isNaN(rate)) rate = 0;
      } catch (e) {
        console.warn('[Worker] Could not evaluate rate expression:', r.rate, '- using 0');
        rate = 0;
      }
    }

    let reverseRate: number;
    if (r.reverseRate) {
      if (isReverseFunctional) {
        reverseRate = 0;
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
    forwardRule.name = r.name;
    if (isForwardFunctional) {
      (forwardRule as unknown as { rateExpression?: string; isFunctionalRate?: boolean }).rateExpression = r.rate;
      (forwardRule as unknown as { rateExpression?: string; isFunctionalRate?: boolean }).isFunctionalRate = true;
    }

    if (r.constraints && r.constraints.length > 0) {
      forwardRule.applyConstraints(r.constraints, (s) => BNGLParser.parseSpeciesGraph(s));
    }

    if (r.isBidirectional) {
      const reverseRuleStr = `${formatSpeciesList(r.products)} -> ${formatSpeciesList(r.reactants)}`;
      const reverseRule = BNGLParser.parseRxnRule(reverseRuleStr, reverseRate);
      reverseRule.name = r.name + '_rev';
      if (isReverseFunctional) {
        (reverseRule as unknown as { rateExpression?: string; isFunctionalRate?: boolean }).rateExpression = r.reverseRate;
        (reverseRule as unknown as { rateExpression?: string; isFunctionalRate?: boolean }).isFunctionalRate = true;
      }
      return [forwardRule, reverseRule];
    }

    return [forwardRule];
  });

  // Use network options from BNGL file if available, with reasonable defaults
  const networkOpts = inputModel.networkOptions || {};
  const maxStoich = networkOpts.maxStoich ? new Map(Object.entries(networkOpts.maxStoich)) : 500;

  const generator = new NetworkGenerator({
    maxSpecies: 20000,
    maxIterations: networkOpts.maxIter ?? 5000,
    maxAgg: networkOpts.maxAgg ?? 500,
    maxStoich,
    // Pass compartment info for cBNGL volume scaling (bimolecular rates scaled by 1/volume)
    compartments: inputModel.compartments?.map((c) => ({
      name: c.name,
      dimension: c.dimension,
      size: c.size,
      parent: c.parent
    }))
  });

  // Set up progress callback to emit progress to main thread during simulation
  // Update frequency: 250ms chosen to balance UI responsiveness vs. postMessage overhead
  let lastProgressTime = 0;
  const progressCallback = (progress: GeneratorProgress) => {
    const now = Date.now();
    if (now - lastProgressTime >= 250) {
      lastProgressTime = now;
      ctx.postMessage({ id: jobId, type: 'generate_network_progress', payload: progress });
    }
  };

  let result: { species: Species[]; reactions: Rxn[] };
  try {
    result = await generator.generate(seedSpecies, rules, progressCallback);
  } catch (e: any) {
    console.error('[Worker] generator.generate() FAILED:', e.message);
    throw e;
  }

  const generatedSpecies = result.species.map((s: Species) => {
    const canonicalName = GraphCanonicalizer.canonicalize(s.graph);
    const concentration = seedConcentrationMap.get(canonicalName) || (s.concentration || 0);
    return { name: canonicalName, initialConcentration: concentration };
  });

  const generatedReactions = result.reactions.map((r: Rxn, idx: number) => {
    try {
      const reaction = {
        reactants: r.reactants.map((ridx: number) => GraphCanonicalizer.canonicalize(result.species[ridx].graph)),
        products: r.products.map((pidx: number) => GraphCanonicalizer.canonicalize(result.species[pidx].graph)),
        rate: r.rateExpression || String(r.rate),
        rateConstant: typeof r.rate === 'number' ? r.rate : 0,
        propensityFactor: (r as unknown as { propensityFactor?: number }).propensityFactor ?? 1
      };
      return reaction;
    } catch (e: any) {
      console.error(`[Worker] Error mapping reaction ${idx}:`, e.message);
      throw e;
    }
  });

  const generatedModel: BNGLModel = {
    ...inputModel,
    species: generatedSpecies,
    reactions: generatedReactions,
  };

  return generatedModel;
}

export async function simulate(jobId: number, inputModel: BNGLModel, options: SimulationOptions): Promise<SimulationResults> {
  const simulationStartTime = performance.now();
  ensureNotCancelled(jobId);
  console.log('[Worker] ⏱️ TIMING: Starting simulation');
  console.log('[Worker] Starting simulation with', inputModel.species.length, 'species and', inputModel.reactionRules?.length ?? 0, 'rules');

  // Strict parity: GDAT times are printed by BNG2 in scientific notation with
  // 12 digits after the decimal in the mantissa (i.e. `%.12e`).
  //
  // To match BNG2 under TIME_TOL=1e-10, we compute grid times in double precision
  // (same as BNG2) and then quantize them to the `%.12e`-printed value.
  //
  // CRITICAL: BNG2 uses ACCUMULATION (t_out += sample_time) rather than direct
  // multiplication (t_start + sample_time * n). This causes different floating-point
  // rounding errors that affect the final printed value. We must match BNG2's
  // accumulation semantics to achieve strict TIME_TOL parity.
  //
  // ROUNDING: At exact boundary cases (e.g., 6365.55555555555...), JS's toExponential
  // uses "round half to even" while BNG2 (glibc) uses "round half away from zero" or
  // a different tie-breaker. To match BNG2, we implement custom rounding that rounds
  // DOWN for positive tie-breaker cases (matching observed BNG2 behavior).

  /**
   * Format a number to BNG2-compatible scientific notation with 12 decimal digits.
   * Uses "round half down" for tie-breaker cases to match observed BNG2 printf behavior.
   */
  // Custom scientific notation formatter to match BNG2.pl's printf("%.12e") output
  // Rationale: BNG2 uses glibc's printf with specific rounding behavior for tie-breaking
  // (0.5 fractional case rounds DOWN for positive numbers). This function replicates that
  // behavior to ensure GDAT parity. The 1e-9 threshold is empirically chosen to handle
  // floating-point precision limits in JavaScript vs. C.
  // Note: This is intentionally "fragile" - it exists solely for output parity, not correctness.
  const toBngScientific12 = (x: number): string => {
    if (!Number.isFinite(x) || x === 0) {
      return x.toExponential(12);
    }

    const sign = x < 0 ? '-' : '';
    const absX = Math.abs(x);

    // Get exponent: floor(log10(absX))
    const exp = Math.floor(Math.log10(absX));

    // Normalized mantissa: absX / 10^exp should be in [1, 10)
    const scale = Math.pow(10, exp);
    const mantissa = absX / scale;

    // We need 13 significant digits total (1 before decimal + 12 after)
    // Multiply by 10^12 to get all significant digits as an integer
    const shifted = mantissa * 1e12;

    // Custom rounding: for tie-breaker cases, round DOWN (floor)
    // Check if we're at a tie (value ends in exactly .5 after shifting)
    const floored = Math.floor(shifted);
    const fraction = shifted - floored;

    // Tie condition: fraction is exactly 0.5 (or very close due to FP errors)
    // If tie, round DOWN. Otherwise, use normal rounding.
    let rounded: number;
    if (Math.abs(fraction - 0.5) < 1e-9) {
      // Tie-breaker: round DOWN (toward zero) for positive numbers
      rounded = floored;
    } else {
      // Normal rounding
      rounded = Math.round(shifted);
    }

    // Handle overflow case (e.g., 9.9999... rounds to 10.0)
    if (rounded >= 1e13) {
      rounded = Math.round(rounded / 10);
      const newExp = exp + 1;
      const mantStr = (rounded / 1e12).toFixed(12);
      const expSign = newExp >= 0 ? '+' : '-';
      const expAbs = Math.abs(newExp);
      const expPadded = expAbs < 100 ? String(expAbs).padStart(2, '0') : String(expAbs);
      return `${sign}${mantStr}e${expSign}${expPadded}`;
    }

    // Format mantissa with exactly 12 decimal places
    const mantStr = (rounded / 1e12).toFixed(12);
    const expSign = exp >= 0 ? '+' : '-';
    const expAbs = Math.abs(exp);
    const expPadded = expAbs < 100 ? String(expAbs).padStart(2, '0') : String(expAbs);

    return `${sign}${mantStr}e${expSign}${expPadded}`;
  };

  const quantizeBngPrintedTime = (t: number): number => {
    if (!Number.isFinite(t)) return t;

    // Use custom BNG2-compatible formatting
    const formatted = toBngScientific12(t);
    const parsed = Number(formatted);

    // Preserve exact-integer timestamps
    if (Number.isInteger(parsed)) return parsed;
    return parsed;
  };

  // Legacy function for backward compatibility
  const toBngGridTime = (
    phaseStart: number,
    phaseDuration: number,
    phaseSteps: number,
    outIdx: number
  ): number => {
    // For outIdx 0, return phase start
    if (outIdx === 0) {
      return quantizeBngPrintedTime(phaseStart);
    }
    // Use accumulation for non-zero indices
    const dtOut = phaseDuration / phaseSteps;
    let t_accum = phaseStart;
    for (let i = 0; i < outIdx; i++) {
      t_accum += dtOut;
    }
    return quantizeBngPrintedTime(t_accum);
  };

  const networkGenStart = performance.now();
  const expandedModel = await generateExpandedNetwork(jobId, inputModel);
  const networkGenTime = performance.now() - networkGenStart;
  console.log('[Worker] ⏱️ TIMING: Network generation took', networkGenTime.toFixed(0), 'ms');
  console.log('[Worker] After network expansion:', expandedModel.species.length, 'species and', expandedModel.reactions.length, 'reactions');

  const model: BNGLModel = JSON.parse(JSON.stringify(expandedModel));

  // Multi-phase simulation support: check if model has explicit simulation phases
  const hasMultiPhase = inputModel.simulationPhases && inputModel.simulationPhases.length > 0;

  // Build phases array, applying API-passed options as overrides
  let phases: Array<{
    method: 'ode' | 'ssa' | 'nf';
    t_start?: number;
    t_end?: number;
    n_steps?: number;
    continue_from_previous?: boolean;
    atol?: number;
    rtol?: number;
    suffix?: string;
    sparse?: boolean;
    steady_state?: boolean;
    print_functions?: boolean;
  }>;

  if (hasMultiPhase) {
    // Use model-defined phases as authored in the BNGL actions block.
    // IMPORTANT: Do NOT override per-phase t_end/n_steps from the UI's single-phase options.
    // Many published models (e.g., Hat 2016 / test7) rely on distinct durations per phase.
    phases = inputModel.simulationPhases!.map(p => ({
      ...p,
      // Allow global tolerances to override if provided.
      atol: options.atol ?? p.atol,
      rtol: options.rtol ?? p.rtol,
    }));
  } else {
    // No model-defined phases - create single phase from options
    const inferredMethod: 'ode' | 'ssa' =
      options.method === 'ssa'
        ? 'ssa'
        : options.method === 'ode'
          ? 'ode'
          : (inputModel.simulationOptions?.method === 'ssa' ? 'ssa' : 'ode');

    phases = [{
      method: inferredMethod,
      t_end: options.t_end ?? inputModel.simulationOptions?.t_end,
      n_steps: options.n_steps ?? inputModel.simulationOptions?.n_steps,
      atol: options.atol ?? inputModel.simulationOptions?.atol,
      rtol: options.rtol ?? inputModel.simulationOptions?.rtol,
    }];
  }

  // If user selected an explicit method, force all phases to that method.
  // If user selected 'default', respect the model-authored per-phase methods.
  if (options.method === 'ode' || options.method === 'ssa') {
    const forcedMethod: 'ode' | 'ssa' = options.method;
    phases = phases.map(p => ({ ...p, method: forcedMethod }));
  }

  const concentrationChanges = inputModel.concentrationChanges || [];
  const parameterChanges = inputModel.parameterChanges || [];

  // Output semantics for multi-phase BNGL actions:
  // - A new simulate_* with continue=>0 (or unspecified) starts a new output series.
  // - Subsequent simulate_* with continue=>1 append to the same output series.
  // For browser CSV export parity with BNG2, we emit the final output series:
  // the last phase plus any immediately-preceding continuation phases.
  let recordFromPhaseIdx = phases.length - 1;
  while (recordFromPhaseIdx > 0 && (phases[recordFromPhaseIdx].continue_from_previous ?? false)) {
    recordFromPhaseIdx -= 1;
  }

  if (hasMultiPhase) {
    console.log(`[Worker] Multi-phase simulation: ${phases.length} phases, ${concentrationChanges.length} concentration changes, ${parameterChanges.length} parameter changes`);
  }

  // Determine whether we are running an SSA-only plan.
  // If any ODE phase exists, we use the ODE codepath and can execute SSA phases inline.
  const allSsa = phases.every(p => p.method === 'ssa');

  // BNG2 prints function values as extra GDAT columns when `print_functions=>1`.
  // We only support printing zero-arg functions (foo()), which is what BNG uses for output columns.
  const printableFunctions = (model.functions || []).filter(f => (f.args?.length ?? 0) === 0);
  const shouldPrintFunctions =
    printableFunctions.length > 0 &&
    phases.slice(recordFromPhaseIdx).some(p => (p.print_functions ?? false) === true);
  const functionHeaders = shouldPrintFunctions ? printableFunctions.map(f => f.name) : [];

  const headers = ['time', ...model.observables.map((observable) => observable.name), ...functionHeaders];
  // Species headers for cdat-style output
  const speciesHeaders = model.species.map((s) => s.name);

  // --- OPTIMIZATION: Pre-process Network for Fast Simulation ---

  // 1. Map Species Names to Indices
  const speciesMap = new Map<string, number>();
  model.species.forEach((s, i) => speciesMap.set(s.name, i));
  const numSpecies = model.species.length;

  // 2. Pre-process Reactions into Concrete Indices
  // Detect functional rates (containing observables or function calls) that need dynamic evaluation
  const observableNames = new Set(model.observables.map(o => o.name));
  const functionNames = new Set((model.functions || []).map(f => f.name));
  // Also treat rates as functional if they reference parameters that are changed via setParameter().
  // This is required for parity with BNGL multi-phase scripts where parameters (e.g., stimulus) are
  // modified between phases and those parameters appear in reaction rate expressions.
  // const parameterChanges = inputModel.parameterChanges || []; // Already declared above
  console.log('[Worker] inputModel.parameterChanges:', JSON.stringify(parameterChanges));
  const changingParameterNames = new Set(parameterChanges.map(c => c.parameter));
  console.log('[Worker] Parameter changes:', parameterChanges);
  console.log('[Worker] Changing parameter names:', Array.from(changingParameterNames));

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
    // BNG2 allows functions to be used without parentheses when they have no arguments:
    //   e.g., `k_IKKKactivation` instead of `k_IKKKactivation()`
    // So we check for the function name as a word boundary match, not just `func_name\(`
    if (!isFunctionalRate) {
      for (const funcName of functionNames) {
        // Match function name with optional parentheses (for zero-arg functions)
        if (new RegExp(`\\b${funcName}\\b`).test(rateExpr)) {
          isFunctionalRate = true;
          break;
        }
      }
    }

    // Check for changing parameter references in the rate expression
    if (!isFunctionalRate && changingParameterNames.size > 0) {
      for (const paramName of changingParameterNames) {
        if (new RegExp(`\\b${paramName}\\b`).test(rateExpr)) {
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
      rate: rateExpr, // Preserve original rate string for recalculation
      isFunctionalRate,
      propensityFactor: r.propensityFactor ?? 1,
      productStoichiometries: r.productStoichiometries
    };
  }).filter(r => r !== null) as {
    reactants: Int32Array;
    products: Int32Array;
    rateConstant: number;
    rateExpression: string | null;
    rate: string;
    isFunctionalRate: boolean;
    propensityFactor: number;
    productStoichiometries?: number[];
  }[];


  // Count functional rates for logging
  const functionalRateCount = concreteReactions.filter(r => r.isFunctionalRate).length;
  if (functionalRateCount > 0) {
    console.log(`[Worker] ${functionalRateCount} of ${concreteReactions.length} reactions have functional rates`);
    if (!getFeatureFlags().functionalRatesEnabled) {
      console.error('[Worker] Functional rates temporarily disabled pending security review');
      // Clear & bump versions immediately for defense-in-depth
      clearAllCaches();
      throw new Error('Functional rates temporarily disabled pending security review');
    } else {
      // Lazy-load the evaluator module only when we actually need it
      if (!SafeExpressionEvaluatorRef) {
        try {
          await loadEvaluator();
        } catch (e: any) {
          console.error('[Worker] Failed to load SafeExpressionEvaluator module:', e?.message ?? String(e));
          throw new Error('Failed to initialize expression evaluator');
        }
      }
    }
  }

  // 3. Pre-process Observables (Cache matching species indices and coefficients)
  const concreteObservables = model.observables.map(obs => {
    // Split pattern by comma to handle multiple patterns (e.g. "A,B" or "pattern1, pattern2")
    // BUT only split on commas OUTSIDE parentheses to avoid breaking patterns like "p53(S15_S20~0,S46~0)"
    const splitPatternsSafe = (patternStr: string): string[] => {
      // BNGL observables often separate multiple patterns by whitespace
      // (e.g., Species Clusters EGFR==1 EGFR==2 ...), and sometimes by commas.
      // We split on commas only at top-level (not inside parentheses), then
      // further tokenize by whitespace while preserving count constraints with
      // optional spaces around operators (e.g., EGFR == 1).
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

      const patterns: string[] = [];
      const tokenRe = /([A-Za-z0-9_]+\s*(?:==|<=|>=|<|>)\s*\d+|[^\s]+)/g;
      for (const chunk of commaChunks) {
        const matches = Array.from(chunk.matchAll(tokenRe), m => m[1].trim()).filter(Boolean);
        if (matches.length > 0) patterns.push(...matches);
      }
      return patterns;
    };
    const patterns = splitPatternsSafe(obs.pattern);
    const matchingIndices: number[] = [];
    const coefficients: number[] = [];

    const countMoleculeInSpecies = (speciesStr: string, molName: string): number => {
      const cleanSpec = removeCompartment(speciesStr);
      const parts = cleanSpec.split('.');
      let count = 0;
      for (const part of parts) {
        const { cleanMol } = getMoleculeCompartment(part.trim());
        const nameMatch = cleanMol.match(/^([A-Za-z0-9_]+)/);
        const name = nameMatch?.[1];
        if (name === molName) count++;
      }
      return count;
    };

    const matchesCountConstraint = (speciesStr: string, constraint: string): boolean | null => {
      const m = constraint.trim().match(/^([A-Za-z0-9_]+)\s*(==|<=|>=|<|>)\s*(\d+)$/);
      if (!m) return null;
      const mol = m[1];
      const op = m[2];
      const n = Number.parseInt(m[3], 10);
      const c = countMoleculeInSpecies(speciesStr, mol);
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
            count = 1;
            break; // Species matches once
          }
          if (constraintMatch === false) {
            continue;
          }
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

  // 4. Initialize State Vector (Float64Array for speed)
  const state = new Float64Array(numSpecies);
  model.species.forEach((s, i) => state[i] = s.initialConcentration);

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

  const evaluateFunctionsForOutput = (observableValues: Record<string, number>) => {
    if (!shouldPrintFunctions) return {} as Record<string, number>;
    const fnValues: Record<string, number> = {};
    for (const fnDef of printableFunctions) {
      fnValues[fnDef.name] = evaluateFunctionalRate(
        fnDef.expression,
        model.parameters || {},
        observableValues,
        model.functions
      );
    }
    return fnValues;
  };

  // Define checkCancelled helper
  const checkCancelled = () => ensureNotCancelled(jobId);

  if (allSsa) {
    // SSA-only plan (supports multi-phase)
    // NOTE: Functional rates are not currently evaluated dynamically in SSA.
    if (functionalRateCount > 0) {
      console.warn('[Worker] SSA selected but functional rates were detected; SSA will ignore rate expressions and may be inaccurate.');
    }

    // Round initial state for SSA
    for (let i = 0; i < numSpecies; i++) state[i] = Math.round(state[i]);

    let globalTime = 0;
    for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
      const phase = phases[phaseIdx];
      const recordThisPhase = phaseIdx >= recordFromPhaseIdx;
      const shouldEmitPhaseStart = recordThisPhase && (phaseIdx === recordFromPhaseIdx || !(phase.continue_from_previous ?? false));

      // Apply parameter changes BEFORE this phase
      for (const change of parameterChanges) {
        if (change.afterPhaseIndex === phaseIdx - 1) {
          if (model.parameters) {
            let newValue: number;
            
            if (typeof change.value === 'number') {
              newValue = change.value;
            } else {
               // Try to evaluate as expression (matches concentration logic)
               try {
                  let expr = change.value;
                  for (const [pName, pVal] of Object.entries(model.parameters || {})) {
                    expr = expr.replace(new RegExp(`\\b${pName}\\b`, 'g'), String(pVal));
                  }
                  expr = expr.replace(/\^/g, '**');
                  newValue = SafeExpressionEvaluator.evaluateConstant(expr);
               } catch {
                  newValue = parseFloat(String(change.value)) || 0;
               }
            }
            
            model.parameters[change.parameter] = newValue;
            console.log(`[Worker] Phase ${phaseIdx}: setParameter("${change.parameter}") = ${newValue}`);
            
            // Re-evaluate rate constants for reactions that depend on this parameter
            // (Note: functional rates re-evaluate automatically at each step)
          }
        }
      }

      // Apply concentration changes BEFORE this phase
      for (const change of concentrationChanges) {
        if (change.afterPhaseIndex === phaseIdx - 1) {
          let resolvedValue: number;
          if (typeof change.value === 'number') {
            resolvedValue = change.value;
          } else {
            // Try to look up as parameter name first
            const paramValue = model.parameters?.[change.value];
            if (typeof paramValue === 'number') {
              resolvedValue = paramValue;
            } else {
              // Try to evaluate as expression (e.g., "1*1", "10*60")
              try {
                let expr = change.value;
                // Substitute parameter names in the expression
                for (const [pName, pVal] of Object.entries(model.parameters || {})) {
                  expr = expr.replace(new RegExp(`\\b${pName}\\b`, 'g'), String(pVal));
                }
                expr = expr.replace(/\^/g, '**');
                resolvedValue = SafeExpressionEvaluator.evaluateConstant(expr);
              } catch {
                // Fall back to parseFloat
                resolvedValue = parseFloat(String(change.value)) || 0;
              }
            }
          }

          // Robust species lookup: allow labeled species names ("Label: ...") and
          // fall back to BNGL structural pattern matching.
          // Note: Canonical species names use @comp::Species (double colon) format,
          // while BNGL files use @comp:Species (single colon). Normalize both.
          const normalizeCompartmentSyntax = (s: string) => s.replace(/^@([A-Za-z0-9_]+):(?!:)/, '@$1::');
          const wantedPattern = change.species.trim();
          const normalizedWanted = normalizeCompartmentSyntax(wantedPattern);

          let speciesIdx = speciesMap.get(normalizedWanted);
          if (speciesIdx === undefined) {
            // Also try original pattern in case speciesMap uses single-colon syntax
            speciesIdx = speciesMap.get(wantedPattern);
          }
          const normalizeSpeciesName = (name: string) => name.trim().replace(/^[^:]+:\s*/, '');

          if (speciesIdx === undefined) {
            for (const [speciesName, idx] of speciesMap.entries()) {
              if (normalizeSpeciesName(speciesName) === normalizedWanted) {
                speciesIdx = idx;
                break;
              }
            }
          }

          if (speciesIdx === undefined) {
            const matches: number[] = [];
            for (const [speciesName, idx] of speciesMap.entries()) {
              const normalized = normalizeSpeciesName(speciesName);
              if (isSpeciesMatch(normalized, wantedPattern)) {
                matches.push(idx);
              }
            }

            if (matches.length === 1) {
              speciesIdx = matches[0];
            } else if (matches.length > 1) {
              matches.sort((a, b) => a - b);
              console.warn(
                `[Worker] Phase ${phaseIdx}: setConcentration("${change.species}") matched ${matches.length} species; applying to the first match (species index ${matches[0]}).`
              );
              speciesIdx = matches[0];
            }
          }

          if (speciesIdx !== undefined) {
            console.log(`[Worker] Phase ${phaseIdx}: setConcentration("${change.species}") = ${resolvedValue} (species index ${speciesIdx})`);
            state[speciesIdx] = Math.round(resolvedValue);
          } else {
            console.warn(`[Worker] Phase ${phaseIdx}: Could not find species for setConcentration("${change.species}")`);
          }
        }
      }

      // Apply parameter changes BEFORE this phase
      for (const change of parameterChanges) {
        if (change.afterPhaseIndex === phaseIdx - 1) {
          let resolvedValue: number;
          if (typeof change.value === 'number') {
            resolvedValue = change.value;
          } else {
            try {
              let expr = change.value;
              for (const [pName, pVal] of Object.entries(model.parameters || {})) {
                expr = expr.replace(new RegExp(`\\b${pName}\\b`, 'g'), String(pVal));
              }
              expr = expr.replace(/\^/g, '**');
              resolvedValue = SafeExpressionEvaluator.evaluateConstant(expr);
            } catch (e) {
              console.warn(`[Worker] Failed to evaluate setParameter expression "${change.value}":`, e);
              resolvedValue = parseFloat(String(change.value)) || 0;
            }
          }

          console.log(`[Worker] Phase ${phaseIdx}: setParameter("${change.parameter}") = ${resolvedValue}`);
          if (inputModel.parameters) inputModel.parameters[change.parameter] = resolvedValue;
          if (model.parameters) model.parameters[change.parameter] = resolvedValue;
        }
      }

      const phaseTEnd = phase.t_end ?? options.t_end;
      const phaseNSteps = phase.n_steps ?? options.n_steps;

      let t = 0;
      let nextOutIdx = 1;
      let nextTOut = (phaseTEnd * nextOutIdx) / phaseNSteps;

      if (shouldEmitPhaseStart) {
        const outT0 = toBngGridTime(globalTime, phaseTEnd, phaseNSteps, 0);
        const obsValues = evaluateObservablesFast(state);
        data.push({ time: outT0, ...obsValues, ...evaluateFunctionsForOutput(obsValues) });
        const speciesPoint0: Record<string, number> = { time: outT0 };
        for (let i = 0; i < numSpecies; i++) speciesPoint0[speciesHeaders[i]] = state[i];
        speciesData.push(speciesPoint0);
      }

      // SSA event loop
      while (t < phaseTEnd) {
        checkCancelled();

        let aTotal = 0;
        const propensities = new Float64Array(concreteReactions.length);

        for (let i = 0; i < concreteReactions.length; i++) {
          const rxn = concreteReactions[i];
          let a = rxn.rateConstant * rxn.propensityFactor;
          for (let j = 0; j < rxn.reactants.length; j++) {
            a *= state[rxn.reactants[j]];
          }
          propensities[i] = a;
          aTotal += a;
        }

        if (aTotal === 0) {
          break;
        }

        const r1 = Math.random();
        const tau = (1 / aTotal) * Math.log(1 / r1);
        if (t + tau > phaseTEnd) {
          t = phaseTEnd;
          break;
        }
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

        while (t >= nextTOut && nextTOut <= phaseTEnd) {
          checkCancelled();
          if (recordThisPhase) {
            const outT = toBngGridTime(globalTime, phaseTEnd, phaseNSteps, nextOutIdx);
            const obsValues = evaluateObservablesFast(state);
            data.push({ time: outT, ...obsValues, ...evaluateFunctionsForOutput(obsValues) });
            const speciesPointLoop: Record<string, number> = { time: outT };
            for (let k = 0; k < numSpecies; k++) speciesPointLoop[speciesHeaders[k]] = state[k];
            speciesData.push(speciesPointLoop);
          }
          nextOutIdx += 1;
          nextTOut = (phaseTEnd * nextOutIdx) / phaseNSteps;
        }
      }

      // Fill remaining output steps to phase end
      while (nextTOut <= phaseTEnd + 1e-12) {
        if (recordThisPhase) {
          const outT = toBngGridTime(globalTime, phaseTEnd, phaseNSteps, nextOutIdx);
          const obsValues = evaluateObservablesFast(state);
          data.push({ time: outT, ...obsValues, ...evaluateFunctionsForOutput(obsValues) });
          const speciesPointFinal: Record<string, number> = { time: outT };
          for (let k = 0; k < numSpecies; k++) speciesPointFinal[speciesHeaders[k]] = state[k];
          speciesData.push(speciesPointFinal);
        }
        nextOutIdx += 1;
        nextTOut = (phaseTEnd * nextOutIdx) / phaseNSteps;
      }

      globalTime += phaseTEnd;
    }

    return { headers, data, speciesHeaders, speciesData, expandedReactions: model.reactions, expandedSpecies: model.species } satisfies SimulationResults;
  }

  {
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
        let term = `${rxn.rateConstant * rxn.propensityFactor}`;
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
            let velocity = rxn.rateConstant * rxn.propensityFactor;
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
          let velocity = rxn.rateConstant * rxn.propensityFactor;
          for (let j = 0; j < rxn.reactants.length; j++) {
            velocity *= yIn[rxn.reactants[j]];
          }
          for (let j = 0; j < rxn.reactants.length; j++) dydt[rxn.reactants[j]] -= velocity;
          for (let j = 0; j < rxn.products.length; j++) dydt[rxn.products[j]] += velocity;
        }
      };
    } else {
      // No JIT compilation possible due to large number; set placeholder and override below
      derivatives = (_yIn: Float64Array, dydt: Float64Array) => {
        dydt.fill(0);
      };
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

        // Prebuild context (Issue 5 optimization)
        const context = { ...model.parameters, ...obsValues };

        for (let i = 0; i < concreteReactions.length; i++) {
          const rxn = concreteReactions[i];

          // Get rate constant (evaluate dynamically if functional)
          let k: number;
          if (rxn.isFunctionalRate && rxn.rateExpression) {
            k = evaluateFunctionalRate(
              rxn.rateExpression,
              model.parameters,
              obsValues,
              model.functions,
              context // Pass the optimized prebuilt context
            );
          } else {
            k = rxn.rateConstant;
          }

          // Compute velocity = k * [R1] * [R2] * ...
          let velocity = k * rxn.propensityFactor;
          for (let j = 0; j < rxn.reactants.length; j++) {
            velocity *= yIn[rxn.reactants[j]];
          }

          // Update dydt
          for (let j = 0; j < rxn.reactants.length; j++) dydt[rxn.reactants[j]] -= velocity;
          for (let j = 0; j < rxn.products.length; j++) {
            const stoich = rxn.productStoichiometries ? rxn.productStoichiometries[j] : 1;
            dydt[rxn.products[j]] += velocity * stoich;
          }
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
      // Default to CVODE (BNG2 behavior). Some models can have huge rate ratios but still
      // integrate fine with CVODE; switching to the Rosenbrock-based sparse_implicit path
      // Users can still explicitly select `sparse_implicit` from the UI when desired.
      solverType = allMassAction ? 'cvode_jac' : 'cvode';
      console.log(
        `[Worker] Using ${solverType} solver for ${numSpecies} species ` +
        `(allMassAction=${allMassAction}${isExtremelyStiff ? `, extremelyStiff(rate ratio=${rateRatio.toExponential(2)})` : ''})`
      );
    }

    // ==== WebGPU Integration Path ====
    // If webgpu_rk4 is selected, use the GPU-accelerated solver
    if (solverType === 'webgpu_rk4') {
      console.log('[Worker] WebGPU RK4 solver requested');

      // Dynamically import WebGPU solver utilities and check availability
      let gpuAvailable = false;
      let WebGPUODESolverClass: any = undefined;
      try {
        const webgpuMod = await import('../src/services/WebGPUODESolver');
        WebGPUODESolverClass = webgpuMod.WebGPUODESolver;
        const isAvailableFn = webgpuMod.isWebGPUODESolverAvailable ?? null;
        if (typeof isAvailableFn === 'function') {
          // If it returns a promise, await it
          const res = isAvailableFn();
          gpuAvailable = res instanceof Promise ? await res : Boolean(res);
        }
      } catch (e) {
        gpuAvailable = false;
      }

      if (!gpuAvailable) {
        console.warn('[Worker] WebGPU not available, falling back to CPU RK4');
        solverType = 'rk4'; // Fall back to CPU RK4
      } else {
        // Convert reactions to GPU format
        const { gpuReactions, rateConstants } = await convertReactionsToGPU(concreteReactions);
        console.log(`[Worker] Converted ${gpuReactions.length} reactions to GPU format`);

        // Calculate timestep based on simulation parameters
        const gpu_t_end = phases[0]?.t_end ?? options.t_end ?? 100;
        const gpu_n_steps = phases[0]?.n_steps ?? options.n_steps ?? 100;
        const gpu_dt = gpu_t_end / (gpu_n_steps * 10); // 10 substeps per output point
        console.log(`[Worker] WebGPU dt=${gpu_dt.toExponential(2)} (t_end=${gpu_t_end}, n_steps=${gpu_n_steps})`);

        // Create WebGPU solver  
        const gpuSolver = new WebGPUODESolverClass(
          numSpecies,
          gpuReactions,
          rateConstants,
          {
            dt: gpu_dt,  // Use calculated timestep
            atol: options.atol ?? 1e-6,
            rtol: options.rtol ?? 1e-4,
            maxSteps: gpu_n_steps * 20, // Limit max steps
            // Pass model-derived options for driver/shader generation
            simulationOptions: model.simulationOptions ? { ...(model.simulationOptions as any) } : model.simulationOptions,
            simulationPhases: (model.simulationPhases || []).map((p: any) => ({ ...p })),
            concentrationChanges: (model.concentrationChanges || []).map((c: any) => ({ ...c })),
            parameterChanges: (model.parameterChanges || []).map((c: any) => ({ ...c })),
          }
        );

        // Compile shaders
        try {
          const compiled = await gpuSolver.compile();
          if (!compiled) {
            console.warn('[Worker] WebGPU shader compilation failed, falling back to CPU RK4');
            gpuSolver.dispose();
            solverType = 'rk4';
          } else {
            // Build output times
            const t_end = phases[0]?.t_end ?? options.t_end ?? 100;
            const n_steps = phases[0]?.n_steps ?? options.n_steps ?? 100;
            const outputTimes: number[] = [];
            for (let i = 0; i <= n_steps; i++) {
              outputTimes.push((t_end / n_steps) * i);
            }

            // Convert initial state to Float32Array
            const y0 = new Float32Array(state);

            console.log(`[Worker] Running WebGPU integration: t_end=${t_end}, n_steps=${n_steps}`);
            const gpuResult = await gpuSolver.integrate(y0, 0, t_end, outputTimes);

            console.log(`[Worker] WebGPU completed: ${gpuResult.steps} steps, ${gpuResult.gpuTime.toFixed(1)}ms GPU time`);

            // Convert results to standard format
            const data: Record<string, number>[] = [];
            const speciesData: Record<string, number>[] = [];

            for (let i = 0; i < gpuResult.concentrations.length; i++) {
              const conc = gpuResult.concentrations[i];
              const time = i < outputTimes.length ? outputTimes[i] : gpuResult.times[i];

              // Evaluate observables for this timepoint
              const y64 = new Float64Array(conc); // Convert to Float64 for observable evaluation
              const observableValues = evaluateObservablesFast(y64);
              data.push({ time, ...observableValues });

              // Species data
              const speciesPoint: Record<string, number> = { time };
              for (let j = 0; j < numSpecies; j++) {
                speciesPoint[speciesHeaders[j]] = conc[j];
              }
              speciesData.push(speciesPoint);
            }

            // Clean up GPU resources
            gpuSolver.dispose();

            const totalTime = performance.now() - simulationStartTime;
            console.log(`[Worker] ⏱️ TIMING: WebGPU simulation completed in ${totalTime.toFixed(0)}ms`);

            return {
              headers,
              data,
              speciesHeaders,
              speciesData,
              expandedReactions: model.reactions,
              expandedSpecies: model.species,
            };
          }
        } catch (error) {
          console.error('[Worker] WebGPU error, falling back to CPU:', error);
          solverType = 'rk4';
        }
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
    const userAtol = options.atol ?? model.simulationOptions?.atol ?? 1e-8;
    const userRtol = options.rtol ?? model.simulationOptions?.rtol ?? 1e-8;

    const solverOptions: any = {
      atol: userAtol,
      rtol: userRtol,
      maxSteps: options.maxSteps ?? 1000000,
      minStep: 1e-15,
      maxStep: options.maxStep ?? 0,  // 0 = unlimited, matching native BNG which uses CVodeSetMaxStep(cvode_mem, 0.0)
      solver: solverType as 'auto' | 'cvode' | 'cvode_jac' | 'rosenbrock23' | 'rk45' | 'rk4' | 'sparse_implicit' | 'webgpu_rk4',
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
    // Track BNG model time (absolute t_start/t_end). Note: `continue=>0` resets time but not concentrations.
    let modelTime = 0;

    // Per-simulation early-stop flag (steady state or recoverable solver error)
    let shouldStop = false;

    // Multi-phase simulation loop
    for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
      const phase = phases[phaseIdx];
      const isLastPhase = phaseIdx === phases.length - 1;
      const recordThisPhase = phaseIdx >= recordFromPhaseIdx;
      const shouldEmitPhaseStart = recordThisPhase && (phaseIdx === recordFromPhaseIdx || !(phase.continue_from_previous ?? false));

      // Reset per-phase early-stop state
      shouldStop = false;
      let solverError = false;

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
            // Try to look up as parameter name first
            const paramValue = model.parameters?.[change.value];
            if (typeof paramValue === 'number') {
              resolvedValue = paramValue;
            } else {
              // Try to evaluate as expression (e.g., "1*1", "10*60")
              try {
                let expr = change.value;
                // Substitute parameter names in the expression
                for (const [pName, pVal] of Object.entries(model.parameters || {})) {
                  expr = expr.replace(new RegExp(`\\b${pName}\\b`, 'g'), String(pVal));
                }
                expr = expr.replace(/\^/g, '**');
                resolvedValue = SafeExpressionEvaluator.evaluateConstant(expr);
              } catch {
                // Fall back to parseFloat
                resolvedValue = parseFloat(String(change.value)) || 0;
              }
            }
          }

          // Robust species lookup: allow labeled species names ("Label: ...") and
          // fall back to BNGL structural pattern matching.
          // Note: Canonical species names use @comp::Species (double colon) format,
          // while BNGL files use @comp:Species (single colon). Normalize both.
          const normalizeCompartmentSyntax = (s: string) => s.replace(/^@([A-Za-z0-9_]+):(?!:)/, '@$1::');
          const wantedPattern = change.species.trim();
          const normalizedWanted = normalizeCompartmentSyntax(wantedPattern);

          let speciesIdx = speciesMap.get(normalizedWanted);
          if (speciesIdx === undefined) {
            // Also try original pattern in case speciesMap uses single-colon syntax
            speciesIdx = speciesMap.get(wantedPattern);
          }
          const normalizeSpeciesName = (name: string) => name.trim().replace(/^[^:]+:\s*/, '');

          if (speciesIdx === undefined) {
            for (const [speciesName, idx] of speciesMap.entries()) {
              if (normalizeSpeciesName(speciesName) === normalizedWanted) {
                speciesIdx = idx;
                break;
              }
            }
          }

          if (speciesIdx === undefined) {
            const matches: number[] = [];
            for (const [speciesName, idx] of speciesMap.entries()) {
              const normalized = normalizeSpeciesName(speciesName);
              if (isSpeciesMatch(normalized, normalizedWanted)) {
                matches.push(idx);
              }
            }

            if (matches.length === 1) {
              speciesIdx = matches[0];
            } else if (matches.length > 1) {
              matches.sort((a, b) => a - b);
              console.warn(
                `[Worker] Phase ${phaseIdx}: setConcentration("${change.species}") matched ${matches.length} species; applying to the first match (species index ${matches[0]}).`
              );
              speciesIdx = matches[0];
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
      
      // Track valid parameter updates for re-evaluation trigger
      let parametersUpdated = false;

      for (const change of parameterChanges) {
        if (change.afterPhaseIndex === phaseIdx - 1) {
          let newVal: number;
          if (typeof change.value === 'number') {
            newVal = change.value;
          } else {
             // Try number parsing first
             const num = parseFloat(change.value);
             if (!isNaN(num) && String(num).trim() === String(change.value).trim()) {
                newVal = num;
             } else {
                 if (SafeExpressionEvaluatorRef) {
                   // Use compile for parameterized expressions
                   try {
                       const pKeys = Object.keys(model.parameters);
                       const compiled = SafeExpressionEvaluatorRef.compile(change.value, pKeys);
                       newVal = compiled(model.parameters);
                   } catch (e) {
                       console.warn('[Worker] Failed to evaluate param expr:', change.value, e);
                       newVal = 0;
                   }
                 } else {
                   console.warn('[Worker] Evaluator not available for parameter expression:', change.value);
                   newVal = 0;
                 }
             }
          }
          
          if (model.parameters && model.parameters[change.parameter] !== newVal) {
              console.log(`[Worker] Phase ${phaseIdx}: Applying parameter change: ${change.parameter} = ${newVal}`);
              model.parameters[change.parameter] = newVal;
              if (inputModel.parameters) inputModel.parameters[change.parameter] = newVal;
              parametersUpdated = true;
          }
        }
      }

      // Re-evaluate dependent parameters if any changes occurred
      if (parametersUpdated && model.paramExpressions && Object.keys(model.paramExpressions).length > 0) {
           console.log('[Worker] Re-evaluating dependent parameters...');
           if (SafeExpressionEvaluatorRef) {
               const overriddenParams = new Set<string>();
               parameterChanges.forEach(c => {
                   if (c.afterPhaseIndex < phaseIdx) {
                       overriddenParams.add(c.parameter);
                   }
               });

               for (let pass = 0; pass < 10; pass++) {
                   let anyChanged = false;
                   for (const [name, expr] of Object.entries(model.paramExpressions)) {
                       if (overriddenParams.has(name)) continue;

                       try {
                           const pKeys = Object.keys(model.parameters);
                           const compiled = SafeExpressionEvaluatorRef.compile(expr, pKeys);
                           const val = compiled(model.parameters);
                           
                           if (Math.abs(val - (model.parameters[name] || 0)) > 1e-12) {
                               model.parameters[name] = val;
                               if (inputModel.parameters) inputModel.parameters[name] = val;
                               anyChanged = true;
                           }
                       } catch (e) {
                           // Ignore transient errors
                       }
                   }
                   if (!anyChanged) break;
               }
           } else {
              console.warn('[Worker] Cannot re-evaluate dependent parameters - Evaluator not loaded.');
           }
      }


      // Recalculate rate constants for mass-action reactions if parameters changed
      // This ensures that setParameter("k", 0) actually updates the reaction rate k used by the solver
      if (parameterChanges.some(c => c.afterPhaseIndex === phaseIdx - 1)) {
        console.log(`[Worker] Phase ${phaseIdx}: Recalculating mass-action rate constants...`);

        // Ensure evaluator module is loaded (needed for compile even if no functional rates initially)
        if (!SafeExpressionEvaluatorRef) {
          await loadEvaluator();
        }

        const paramNames = Object.keys(model.parameters || {});
        const context = model.parameters || {};

        for (const rxn of concreteReactions) {
          // Only update if it's NOT a functional rate (functional rates are dynamic anyway)
          // AND it has a rate string that might be an expression of parameters
          if (!rxn.isFunctionalRate && rxn.rate && typeof rxn.rate === 'string') {
            try {
              // Compile and evaluate the rate constant expression
              // We use SafeExpressionEvaluatorRef!.compile because evaluateConstant doesn't support context
              // (loadEvaluator ensures SafeExpressionEvaluatorRef is populated)
              const compiled = SafeExpressionEvaluatorRef!.compile(rxn.rate, paramNames);
              const newK = compiled(context);
              console.log(`[Worker] Recalculating rate for rxn ${rxn.rate}: ${rxn.rateConstant} -> ${newK}`);
              if (!isNaN(newK) && isFinite(newK)) {
                // Only update if changed
                if (Math.abs(rxn.rateConstant - newK) > 1e-12) {
                  console.log(`[Worker] UPDATING rxn rate!`);
                  rxn.rateConstant = newK;
                }
              }
            } catch (e) {
              console.warn(`[Worker] Failed to recalc rate for ${rxn.rate}:`, e);
              // Ignore compilation/evaluation errors (e.g. if rate is not a valid expression of params)
            }
          }
        }
      }

      const phase_t_end = phase.t_end;
      const phase_n_steps = phase.n_steps;

      const phaseStart = phase.t_start !== undefined
        ? phase.t_start
        : ((phase.continue_from_previous ?? false) ? modelTime : 0);

      if ((phase.continue_from_previous ?? false) && Math.abs(phaseStart - modelTime) > 1e-9) {
        throw new Error(`t_start (${phaseStart}) must equal current model time (${modelTime}) for continuation`);
      }

      const phaseDuration = phase_t_end - phaseStart;
      if (!(phaseDuration > 0)) {
        throw new Error(`t_end (${phase_t_end}) must be greater than t_start (${phaseStart})`);
      }

      // Allow SSA phases to run inline in an otherwise ODE/mixed plan.
      if (phase.method === 'ssa') {
        if (functionalRateCount > 0) {
          console.warn('[Worker] SSA phase encountered but functional rates were detected; SSA will ignore rate expressions and may be inaccurate.');
        }

        // Round state for SSA
        for (let i = 0; i < numSpecies; i++) y[i] = Math.round(y[i]);

        let t = 0;
        let nextOutIdx = 1;
        let nextTOut = (phaseDuration * nextOutIdx) / phase_n_steps;

        if (shouldEmitPhaseStart) {
          const outT0 = toBngGridTime(phaseStart, phaseDuration, phase_n_steps, 0);
          const obsValues = evaluateObservablesFast(y);
          data.push({ time: outT0, ...obsValues, ...evaluateFunctionsForOutput(obsValues) });
          const s0: Record<string, number> = { time: outT0 };
          for (let i = 0; i < numSpecies; i++) s0[speciesHeaders[i]] = y[i];
          speciesData.push(s0);
        }

        while (t < phaseDuration) {
          checkCancelled();

          let aTotal = 0;
          const propensities = new Float64Array(concreteReactions.length);
          for (let i = 0; i < concreteReactions.length; i++) {
            const rxn = concreteReactions[i];
            let a = rxn.rateConstant;
            for (let j = 0; j < rxn.reactants.length; j++) {
              a *= y[rxn.reactants[j]];
            }
            propensities[i] = a;
            aTotal += a;
          }

          if (aTotal === 0) break;

          const r1 = Math.random();
          const tau = (1 / aTotal) * Math.log(1 / r1);
          if (t + tau > phaseDuration) {
            t = phaseDuration;
            break;
          }
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
          for (let j = 0; j < firedRxn.reactants.length; j++) y[firedRxn.reactants[j]]--;
          for (let j = 0; j < firedRxn.products.length; j++) y[firedRxn.products[j]]++;

          while (t >= nextTOut && nextTOut <= phaseDuration) {
            checkCancelled();
            if (recordThisPhase) {
              const outT = toBngGridTime(phaseStart, phaseDuration, phase_n_steps, nextOutIdx);
              const obsValues = evaluateObservablesFast(y);
              data.push({ time: outT, ...obsValues, ...evaluateFunctionsForOutput(obsValues) });
              const sp: Record<string, number> = { time: outT };
              for (let k = 0; k < numSpecies; k++) sp[speciesHeaders[k]] = y[k];
              speciesData.push(sp);
            }
            nextOutIdx += 1;
            nextTOut = (phaseDuration * nextOutIdx) / phase_n_steps;
          }
        }

        while (nextTOut <= phaseDuration + 1e-12) {
          if (recordThisPhase) {
            const outT = toBngGridTime(phaseStart, phaseDuration, phase_n_steps, nextOutIdx);
            const obsValues = evaluateObservablesFast(y);
            data.push({ time: outT, ...obsValues, ...evaluateFunctionsForOutput(obsValues) });
            const sp: Record<string, number> = { time: outT };
            for (let k = 0; k < numSpecies; k++) sp[speciesHeaders[k]] = y[k];
            speciesData.push(sp);
          }
          nextOutIdx += 1;
          nextTOut = (phaseDuration * nextOutIdx) / phase_n_steps;
        }

        modelTime = phase_t_end;
        continue;
      }

      // ODE phase: Create solver with phase-specific tolerances
      const phaseAtol = phase.atol ?? userAtol;
      const phaseRtol = phase.rtol ?? userRtol;
      const phaseSolverOptions = {
        ...solverOptions,
        atol: phaseAtol,
        rtol: phaseRtol
      };

      const solver = await createSolver(numSpecies, derivatives, phaseSolverOptions);
      let t = 0;

      // BNG2 steady_state behavior (Network3):
      // - check steady state at each output step
      // - compute dx = ||dydt||_2 / dim(x)
      // - stop immediately when dx < atol (rtol is not used for this criterion)
      const steadyStateEnabled = (phase.steady_state ?? !!options.steadyState) === true;
      const steadyStateAtol = phase.atol ?? 1e-8;
      const steadyStateDerivs = steadyStateEnabled ? new Float64Array(numSpecies) : null;

      // Only add initial point for the first recorded phase (avoid duplicate boundary points for continuation phases)
      if (shouldEmitPhaseStart) {
        const outT0 = toBngGridTime(phaseStart, phaseDuration, phase_n_steps, 0);
        const obsValues = evaluateObservablesFast(y);
        data.push({ time: outT0, ...obsValues, ...evaluateFunctionsForOutput(obsValues) });
        const odeSpeciesPoint0: Record<string, number> = { time: outT0 };
        for (let i = 0; i < numSpecies; i++) odeSpeciesPoint0[speciesHeaders[i]] = y[i];
        speciesData.push(odeSpeciesPoint0);
      }
      try {
        // Integration loop for this phase
        for (let i = 1; i <= phase_n_steps && !shouldStop; i += 1) {
          checkCancelled();
          const tTarget = (phaseDuration * i) / phase_n_steps;

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

            if (data.length > 1 || recordThisPhase) {
              console.warn(`[Worker] Returning ${data.length} partial time points up to t=${phaseStart + t}`);
              ctx.postMessage({
                type: 'progress',
                message: `Simulation stopped at t=${(phaseStart + t).toFixed(2)} (phase ${phaseIdx + 1}, ${data.length} time points)`,
                warning: userFriendlyMessage
              });
              shouldStop = true;
              solverError = true;
              break;
            } else {
              throw new Error(`${userFriendlyMessage}${suggestion ? '\n\nSuggestion: ' + suggestion : ''}`);
            }
          }

          // Update state
          y.set(result.y);
          t = result.t;

          // Record data for the final output series (last phase + continuation chain)
          if (recordThisPhase) {
            const outT = toBngGridTime(phaseStart, phaseDuration, phase_n_steps, i);
            const obsValues = evaluateObservablesFast(y);
            data.push({ time: outT, ...obsValues, ...evaluateFunctionsForOutput(obsValues) });
            const speciesPoint: Record<string, number> = { time: outT };
            for (let k = 0; k < numSpecies; k++) {
              speciesPoint[speciesHeaders[k]] = y[k];
            }
            speciesData.push(speciesPoint);
          }

          // BNG2 checks for steady state after printing the current output step.
          if (steadyStateEnabled) {
            derivatives(y, steadyStateDerivs!);
            let sumSq = 0;
            for (let k = 0; k < steadyStateDerivs!.length; k++) {
              const v = steadyStateDerivs![k];
              sumSq += v * v;
            }
            const dx = Math.sqrt(sumSq) / steadyStateDerivs!.length;
            if (dx < steadyStateAtol) {
              console.log(`[Worker] Phase ${phaseIdx}: Steady state reached at t=${phaseStart + tTarget} (dx=${dx})`);
              shouldStop = true;
            }
          }

          // Progress update for long-running phases
          if (i % Math.ceil(phase_n_steps / 10) === 0) {
            const phaseProgress = (i / phase_n_steps) * 100;
            const overallProgress = hasMultiPhase
              ? ((phaseIdx + phaseProgress / 100) / phases.length) * 100
              : phaseProgress;
            ctx.postMessage({
              type: 'progress',
              message: hasMultiPhase
                ? `Phase ${phaseIdx + 1}/${phases.length}: ${phaseProgress.toFixed(0)}%`
                : `Simulating: ${phaseProgress.toFixed(0)}%`,
              simulationProgress: overallProgress
            });
          }
        }
      } finally {
        // Free solver resources (important for CVODE WASM).
        try {
          (solver as any)?.destroy?.();
        } catch {
          // ignore
        }
      }

      // Update model time after this phase
      modelTime = phaseStart + t;

      // For non-final phases: only break entirely on solver ERROR, not steady state.
      // Steady state in equilibration phases is expected and should proceed to next phase.
      if (shouldStop && !isLastPhase) {
        // Check if it was an error or just steady state
        if (!solverError) {
          // If steady state reached, that's fine - continue to next phase
          console.log(`[Worker] Phase ${phaseIdx}: Steady state reached, proceeding to next phase`);
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

  throw new Error(`Unsupported simulation method: ${String(options.method)}`);
}

if (typeof ctx.addEventListener === 'function') {
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
          const p = payload as unknown;
          let model: BNGLModel | undefined;
          let options: SimulationOptions | undefined;

          if (isSimulateModelPayload(p)) {
            model = p.model;
            options = p.options;
          } else if (isSimulateModelIdPayload(p)) {
            const cached = cachedModels.get(p.modelId);
            if (!cached) throw new Error('Cached model not found in worker');
            touchCachedModel(p.modelId);
            options = p.options;

            if (!p.parameterOverrides || Object.keys(p.parameterOverrides).length === 0) {
              model = cached;
            } else {
              const overrides: Record<string, number> = p.parameterOverrides;
              const nextModel: BNGLModel = {
                ...cached,
                parameters: { ...(cached.parameters || {}), ...overrides },
                reactions: [],
              } as BNGLModel;

              (cached.reactions || []).forEach((r) => {
                const rateConst = nextModel.parameters[r.rate] ?? Number.parseFloat(r.rate);
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
        const p = payload as unknown;
        const model = isCacheModelPayload(p) ? p.model : undefined;
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
          // Preserve action-derived simulation metadata for parity and for simulateCached callers
          simulationOptions: model.simulationOptions ? { ...(model.simulationOptions as any) } : model.simulationOptions,
          simulationPhases: (model.simulationPhases || []).map((p: any) => ({ ...p })),
          concentrationChanges: (model.concentrationChanges || []).map((c: any) => ({ ...c })),
          parameterChanges: (model.parameterChanges || []).map((c: any) => ({ ...c })),
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
        const p = payload as unknown;
        const modelId = isReleaseModelPayload(p) ? p.modelId : undefined;
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
            let rateExpr: string | undefined;

            if (rate === undefined) {
              const parsed = parseFloat(r.rate);
              rate = isNaN(parsed) ? 0 : parsed;
            } else {
              // It was a parameter lookup. r.rate is the parameter name.
              rateExpr = r.rate;
            }
            const ruleStr = `${formatSpeciesList(r.reactants)} ${r.isBidirectional ? '<->' : '->'} ${formatSpeciesList(r.products)}`;
            const rxnRule = BNGLParser.parseRxnRule(ruleStr, rate);
            if (rateExpr) {
              rxnRule.rateExpression = rateExpr;
              console.log(`[generate_network] Preserved rate expression '${rateExpr}' for rule (calculated k=${rate})`);
            }
            return rxnRule;
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
            compartments: model.compartments
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
              rate: r.rateExpression || r.rate.toString(),
              rateConstant: r.rate,
              productStoichiometries: r.productStoichiometries
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
}

export { };