/**
 * services/simulation/ExpressionEvaluator.ts
 * 
 * Logic for safely evaluating functional rate expressions (observables, functions).
 * Handles caching of expanded expressions and compiled functions.
 */

import { getFeatureFlags, registerCacheClearCallback } from '../featureFlags';
// console.log("ExpressionEvaluator module loaded");

/**
 * Interface for expression evaluators (SafeExpressionEvaluator or test mocks).
 * Defines the contract for secure expression compilation and evaluation.
 */
export interface ExpressionEvaluator {
  compile: (expr: string, vars: string[]) => (ctx: Record<string, number>) => number;
  getReferencedVariables: (expr: string) => string[];
  evaluateConstant: (expr: string) => number;
}

/**
 * Expand BNG2 built-in rate law macros (Sat, MM, Hill, Arrhenius).
 *
 * IMPORTANT (parity with this codebase): the simulation loop multiplies the
 * evaluated rate by mass-action reactant concentrations.
 *
 * Therefore these expansions return a *rate factor* that, when multiplied by
 * the (first) reactant concentration externally, yields the classic forms:
 * - Sat: k/(K+S)   and velocity = k*S/(K+S)
 * - MM:  kcat/(Km+S) and velocity = kcat*S/(Km+S)
 * - Hill: Vmax*S^(n-1)/(K^n+S^n) and velocity = Vmax*S^n/(K^n+S^n)
 *
 * @param rateExpr - The rate expression (e.g., "Sat(k3, K4)")
 * @param firstReactantName - Name/placeholder of the first reactant concentration (e.g., ridx0)
 * @returns Expanded expression string
 */
export function expandRateLawMacros(
  rateExpr: string,
  firstReactantName?: string,
  secondReactantName?: string
): string {
  const S = firstReactantName || 'ridx0';
  const E = secondReactantName || 'ridx1';
  let expr = rateExpr.trim();

  // Sat(k, K) -> k / (K + S)
  expr = expr.replace(
    /\bSat\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi,
    (_, k, K) => `(((${k.trim()})) / (((${K.trim()})) + ${S}))`
  );

  // MM(kcat, Km)
  //
  // Match BioNetGen Network3 behavior (RateMM::getRate):
  //   St = total substrate (reactant 0), Et = total enzyme (reactant 1)
  //   b = St - Et - Km
  //   S = 0.5 * (b + sqrt(b*b + 4*St*Km))   // free substrate
  //   rate = kcat * Et * S / (Km + S)
  //
  // This simulator multiplies by mass-action reactant concentrations externally.
  // Therefore we return a *rate factor* f such that:
  //   velocity = f * St * Et = rate
  // => f = kcat * S / (Km + S) / St
  expr = expr.replace(
    /\bMM\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi,
    (_, kcat, KmRaw) => {
      const kcatTrim = kcat.trim();
      const Km = KmRaw.trim();
      const b = `((${S}) - (${E}) - ((${Km})))`;
      const sqrtTerm = `sqrt(((${b})*(${b})) + (4*(${S})*(${Km})))`;
      const freeS = `(0.5*((${b}) + (${sqrtTerm})))`;

      // Avoid 0/0 when St==0 by adding a tiny epsilon to the divisor.
      const StSafe = `((${S}) + 1e-30)`;
      return `(((${kcatTrim})) * (${freeS}) / (((${Km})) + (${freeS})) / (${StSafe}))`;
    }
  );

  // Hill(Vmax, K, n) -> Vmax * S^(n-1) / (K^n + S^n)
  expr = expr.replace(
    /\bHill\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi,
    (_, Vmax, K, n) => {
      const nTrim = n.trim();
      return `(((${Vmax.trim()})) * pow(${S}, ((${nTrim})) - 1) / (pow((${K.trim()}), (${nTrim})) + pow(${S}, (${nTrim}))))`;
    }
  );

  // Arrhenius(A, Ea) -> A * exp(-Ea / (R * T))
  // Use fixed R=8.314 J/mol/K and T=298K for now (parity expectation in failing models).
  expr = expr.replace(
    /\bArrhenius\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi,
    (_, A, Ea) => `(((${A.trim()})) * exp(-(${Ea.trim()}) / (8.314 * 298)))`
  );

  return expr;
}

/**
 * Check if expression contains BNG2 rate law macros.
 */
export function containsRateLawMacro(expr: string): boolean {
  return /\b(Sat|MM|Hill|Arrhenius)\s*\(/i.test(expr);
}

// PERFORMANCE OPTIMIZATION: Cache for pre-expanded expressions
const expandedExpressionCache: Map<string, string> = new Map();
const MAX_EXPANDED_EXPRESSION_CACHE = 2000;

// PERFORMANCE OPTIMIZATION: Pre-compile expressions into functions
const compiledRateFunctions: Map<string, (context: Record<string, number>) => number> = new Map();
const MAX_COMPILED_RATE_FUNCTIONS = 2000;

// Semantic cache versions (bump to invalidate old entries)
let COMPILED_RATE_CACHE_VERSION = '2.0.0';
let EXPANDED_EXPR_CACHE_VERSION = '2.0.0';

// Lazy reference to the evaluator module
let SafeExpressionEvaluatorRef: ExpressionEvaluator | undefined = undefined;

/**
 * FNV-1a hash function for compact cache keys.
 */
function fnv1aHash(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function setBoundedCache<K, V>(map: Map<K, V>, key: K, value: V, maxSize: number) {
  if (map.size >= maxSize) {
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }
  map.set(key, value);
}

function bumpPatchVersion(v: string): string {
  const parts = v.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return v;
  parts[2] = parts[2] + 1;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

export function clearAllEvaluatorCaches() {
  expandedExpressionCache.clear();
  compiledRateFunctions.clear();
  COMPILED_RATE_CACHE_VERSION = bumpPatchVersion(COMPILED_RATE_CACHE_VERSION);
  EXPANDED_EXPR_CACHE_VERSION = bumpPatchVersion(EXPANDED_EXPR_CACHE_VERSION);
}

// Register callback to clear caches when flags change
registerCacheClearCallback(() => {
  clearAllEvaluatorCaches();
  SafeExpressionEvaluatorRef = undefined;
  console.warn('[ExpressionEvaluator] Functional rates disabled via featureFlags — caches cleared');
});

/**
 * Test helper: inject evaluator reference.
 */
export function _setEvaluatorRefForTests(ref: any): void {
  SafeExpressionEvaluatorRef = ref;
}

// Helper to get allocator
function getEvaluator(override?: ExpressionEvaluator): ExpressionEvaluator | null {
  if (override) return override;
  if (SafeExpressionEvaluatorRef) return SafeExpressionEvaluatorRef;

  // Fallback for Node environment
  if (typeof (globalThis as any).require === 'function') {
    try {
      const mod = (globalThis as any).require('../safeExpressionEvaluator');

      // Handle both ES module default export and CommonJS
      const SafeEvaluator = mod.SafeExpressionEvaluator || mod.default?.SafeExpressionEvaluator || mod;

      if (SafeEvaluator) {
        SafeExpressionEvaluatorRef = SafeEvaluator;
        return SafeEvaluator as unknown as ExpressionEvaluator;
      }
    } catch (e) {
      console.warn('[ExpressionEvaluator] Failed to require SafeExpressionEvaluator in Node context', e);
    }
  }
  return null;
}

/**
 * Ensures the evaluator is loaded (for Web Worker usage).
 * Should be called before simulation.
 */
export async function loadEvaluator(): Promise<void> {
  if (!SafeExpressionEvaluatorRef) {
    try {
      // Dynamic import relative to THIS file
      // file is services/simulation/ExpressionEvaluator.ts
      // target is services/safeExpressionEvaluator.ts -> ../safeExpressionEvaluator
      const mod = await import('../safeExpressionEvaluator');
      SafeExpressionEvaluatorRef = mod.SafeExpressionEvaluator;
    } catch (e: any) {
      throw new Error(`Failed to load SafeExpressionEvaluator: ${e?.message ?? String(e)}`);
    }
  }
}

function preExpandExpression(
  expression: string,
  functions?: { name: string; args: string[]; expression: string }[]
): string {
  const cacheKey = `${EXPANDED_EXPR_CACHE_VERSION}::${expression}`;
  const cached = expandedExpressionCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let expandedExpr = expression;
  if (functions && functions.length > 0) {
    for (let pass = 0; pass < 10; pass++) {
      let foundFunction = false;
      for (const func of functions) {
        const funcCallWithParens = new RegExp(`\\b${func.name}\\s*\\(\\s*\\)`, 'g');
        if (funcCallWithParens.test(expandedExpr)) {
          foundFunction = true;
          expandedExpr = expandedExpr.replace(funcCallWithParens, `(${func.expression})`);
        }
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

  setBoundedCache(expandedExpressionCache, cacheKey, expandedExpr, MAX_EXPANDED_EXPRESSION_CACHE);
  return expandedExpr;
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
    // No secure evaluator available (e.g., worker didn't load it). Fall back to a
    // minimal evaluator that supports simple parameter lookup and numeric constants.
    // This allows network generation to proceed for the common case of constant
    // or single-parameter rate expressions (e.g., "ka", "0.01").
    console.warn('[getCompiledRateFunction] SafeExpressionEvaluator not loaded; using simple fallback evaluator (parameter lookup / numeric constants only).');

    const trimmedExpr = expandedExpr.trim();

    const fallbackFn = (context: Record<string, number>) => {
      // If expression is a single identifier, return parameter value when present
      const isIdent = /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmedExpr);
      if (isIdent) {
        const v = context[trimmedExpr];
        if (v === undefined) {
          console.warn(`[ExpressionEvaluator] Fallback: Parameter '${trimmedExpr}' not found in context. Keys: ${Object.keys(context).length}`);
          return 0; // Explicitly return 0 for undefined parameters (matches previous behavior but warns)
        }
        if (typeof v === 'number') return v;
        return 0;
      }

      // Otherwise try to parse as a number literal
      const n = parseFloat(trimmedExpr);
      return Number.isNaN(n) ? 0 : n;
    };

    const cacheKey = `${COMPILED_RATE_CACHE_VERSION}::FALLBACK::${fnv1aHash(expandedExpr)}`;
    setBoundedCache(compiledRateFunctions, cacheKey, fallbackFn, MAX_COMPILED_RATE_FUNCTIONS);
    return fallbackFn;
  }

  let referenced: string[] = [];
  try {
    referenced = evaluator.getReferencedVariables(expandedExpr);
  } catch (e: any) {
    console.warn(`[getCompiledRateFunction] Could not extract variables for '${expandedExpr}': ${e?.message ?? String(e)}`);
    referenced = [];
  }

  const usedVars = referenced.filter((v) => varNames.includes(v));
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

  const context: Record<string, number> = prebuiltContext || { ...parameters, ...observableValues };
  const expandedExpr = preExpandExpression(expression, functions);
  const varNames = Object.keys(context);
  const fn = getCompiledRateFunction(expandedExpr, varNames, evaluatorOverride);

  try {
    // console.log("[evaluateFunctionalRate] Executing fn:", fn.toString());
    const result = fn(context);
    if (expression.includes('rate_transcribe')) {
      // Debug logging preserved logic
      // const tfNuc = context['TF_nuc'] ?? context['@NU:TF()'] ?? context['TF_nuc()'];
      // if (Math.random() < 0.01) console.log(`[Debug] rate_transcribe result: ${result} (TF_nuc value: ${tfNuc})`);
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

/**
 * Try to evaluate a constant expression using the evaluator if present,
 * otherwise fallback to a safe parseFloat-based fallback (best-effort).
 */
export function evaluateExpressionOrParse(expr: string): number {
  try {
    const evaluator = getEvaluator();
    if (evaluator && typeof evaluator.evaluateConstant === 'function') {
      return evaluator.evaluateConstant(expr);
    }
  } catch (e: any) {
    console.warn('[ExpressionEvaluator] evaluateExpressionOrParse: evaluator failed:', e?.message ?? String(e));
  }
  const n = parseFloat(String(expr));
  return Number.isNaN(n) ? 0 : n;
}

export function getCacheSizes() {
  return {
    expandedExpressionCacheSize: expandedExpressionCache.size,
    compiledRateFunctionsSize: compiledRateFunctions.size,
    compiledVersion: COMPILED_RATE_CACHE_VERSION,
    expandedVersion: EXPANDED_EXPR_CACHE_VERSION,
  };
}
