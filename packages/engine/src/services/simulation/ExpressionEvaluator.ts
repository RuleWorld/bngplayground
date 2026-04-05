/**
 * services/simulation/ExpressionEvaluator.ts
 * 
 * Logic for safely evaluating functional rate expressions (observables, functions).
 * Handles caching of expanded expressions and compiled functions.
 */

import { getFeatureFlags, registerCacheClearCallback } from '../../featureFlags';
import { SafeExpressionEvaluator as SafeExpressionEvaluatorStatic } from '../../utils/safeExpressionEvaluator';
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
 * Expand BNG2 built-in rate law macros (Sat, MM, Hill, FunctionProduct).
 *
 * PARITY NOTE: This logic replicates BNG2's pre-processing of rate laws (defined in `BNGAction.pm` / `RateLaw.cpp`).
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

  // FunctionProduct("f1(...)","f2(...)") -> (f1(...)) * (f2(...))
  // BNG2 emits quoted argument strings for FunctionProduct in some formats.
  expr = expr.replace(
    /\bFunctionProduct\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/gi,
    (_, lhs, rhs) => `((${lhs.trim()}) * (${rhs.trim()}))`
  );

  // Sat(k, K) -> k / (K + S)
  // BNG2: Saturation kinetics (single substrate)
  expr = expr.replace(
    /\bSat\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi,
    (_, k, K) => `(((${k.trim()})) / (((${K.trim()})) + ${S}))`
  );

  // MM(kcat, Km)
  //
  // PARITY NOTE: Matches BioNetGen Network3 behavior (RateMM::getRate).
  // Implicitly assumes reaction is S + E -> P + E (or similar).
  //   St = total substrate (reactant 0), Et = total enzyme (reactant 1)
  //   b = St - Et - Km
  //   S = 0.5 * (b + sqrt(b*b + 4*St*Km))   // free substrate approximation
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


  return expr;
}

/**
 * Check if expression contains BNG2 rate law macros.
 */
export function containsRateLawMacro(expr: string): boolean {
  return /\b(Sat|MM|Hill|FunctionProduct)\s*\(/i.test(expr);
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

  // Prefer static module resolution first; this is robust in Vitest/TS source mode.
  if (SafeExpressionEvaluatorStatic) {
    SafeExpressionEvaluatorRef = SafeExpressionEvaluatorStatic;
    return SafeExpressionEvaluatorRef;
  }

  // Fallback for Node environment (used in tests / NodeJS runtime).
  // We attempt an absolute path resolution to avoid relative require issues
  // when code is executed from different directories or packaged outputs.
  if (typeof (globalThis as any).require === 'function') {
    try {
      const candidateModulePaths = ['../../utils/safeExpressionEvaluator'];
      try {
        // Prefer absolute file path candidates in Node ESM/CJS interop contexts.
        const { fileURLToPath } = (globalThis as any).require('url');
        const resolvedNoExt = fileURLToPath(new URL('../../utils/safeExpressionEvaluator', import.meta.url));
        candidateModulePaths.unshift(resolvedNoExt, `${resolvedNoExt}.js`, `${resolvedNoExt}.ts`);
      } catch {
        // Ignore and fall back to relative path only.
      }

      for (const modulePath of candidateModulePaths) {
        try {
          const mod = (globalThis as any).require(modulePath);
          const SafeEvaluator = mod.SafeExpressionEvaluator || mod.default?.SafeExpressionEvaluator || mod;
          if (SafeEvaluator) {
            SafeExpressionEvaluatorRef = SafeEvaluator;
            return SafeEvaluator as unknown as ExpressionEvaluator;
          }
        } catch {
          // Try next candidate path.
        }
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
    if (SafeExpressionEvaluatorStatic) {
      SafeExpressionEvaluatorRef = SafeExpressionEvaluatorStatic;
      return;
    }

    try {
      // Dynamic import remains as an extra fallback for runtime/module-boundary cases.
      const mod = await import('../../utils/safeExpressionEvaluator');
      SafeExpressionEvaluatorRef = mod.SafeExpressionEvaluator;
    } catch (e: any) {
      throw new Error(
        `Failed to load the SafeExpressionEvaluator module: ${e?.message ?? String(e)}. ` +
        'This module is required for evaluating functional rate expressions (e.g., Michaelis-Menten, Hill). ' +
        'If you do not need functional rates, ensure all rate constants are numeric literals.'
      );
    }
  }
}

function preExpandExpression(
  expression: string,
  functions?: { name: string; args: string[]; expression: string }[]
): string {
  const fnSignature = (functions && functions.length > 0)
    ? functions
      .map((f) => `${f.name}(${(f.args || []).join(',')})=${f.expression}`)
      .sort()
      .join('||')
    : '';
  const cacheKey = `${EXPANDED_EXPR_CACHE_VERSION}::${expression}::${fnv1aHash(fnSignature)}`;
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
    const providedVars = new Set(varNames);
    const missingVars = referenced.filter(v => !providedVars.has(v));

    console.error(`[getCompiledRateFunction] Failed to compile '${expandedExpr}'`);
    if (missingVars.length > 0) {
      console.error(`  - Missing variables: ${missingVars.join(', ')}`);
      console.error(`  - Provided variables: ${varNames.slice(0, 20).join(', ')}${varNames.length > 20 ? '...' : ''}`);
    }
    console.error(`  - Error: ${e?.message ?? String(e)}`);

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
    if (!isFinite(result)) {
      console.warn(`[SafeExpressionEvaluator] Expression evaluated to non-finite: ${expression} => ${result}`);
    }
    if (typeof result !== 'number' || isNaN(result)) {
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

/**
 * Pre-compiled rate function entry: holds the compiled evaluator function
 * and the pre-expanded expression for a single functional-rate reaction.
 */
export interface PreCompiledRate {
  /** The AST-walk compiled function (safe evaluator). */
  fn: (context: Record<string, number>) => number;
  /** The pre-expanded expression string (macros + user functions already inlined). */
  expandedExpr: string;
  /** Original expression (for debugging). */
  originalExpr: string;
}

/**
 * Pre-compile all functional rate expressions at simulation setup time.
 *
 * This eliminates per-step overhead from:
 *  - cache lookups in getCompiledRateFunction()
 *  - Object.keys() to extract variable names
 *  - preExpandExpression() re-expansion
 *  - feature flag checks
 *
 * Call once before the integration loop starts. The returned array is indexed
 * by the reaction's position in the `expressions` input array.
 *
 * @param expressions - Rate expression strings (one per functional-rate reaction).
 * @param varNames - All variable names available in the evaluation context
 *                   (parameter names + observable names + species names + ridxN).
 * @param functions - Model-defined user functions for macro expansion.
 * @param evaluatorOverride - Optional evaluator override (for testing).
 * @returns Array of PreCompiledRate objects, same length as `expressions`.
 */
export function preCompileFunctionalRates(
  expressions: string[],
  varNames: string[],
  functions?: { name: string; args: string[]; expression: string }[],
  evaluatorOverride?: ExpressionEvaluator
): PreCompiledRate[] {
  // One-time feature flag check at setup rather than per-step
  if (!getFeatureFlags().functionalRatesEnabled) {
    throw new Error('Functional rates temporarily disabled pending security review');
  }

  const results: PreCompiledRate[] = new Array(expressions.length);

  for (let i = 0; i < expressions.length; i++) {
    const originalExpr = expressions[i];
    const expandedExpr = preExpandExpression(originalExpr, functions);
    const fn = getCompiledRateFunction(expandedExpr, varNames, evaluatorOverride);
    results[i] = { fn, expandedExpr, originalExpr };
  }

  return results;
}

// ---------------------------------------------------------------------------
// JIT compilation via new Function() for maximum hot-loop performance (16.7x)
// ---------------------------------------------------------------------------

/** Allowlist of math functions that can appear in JIT-compiled expressions. */
const JIT_ALLOWED_FUNCTIONS: Record<string, string> = {
  abs: 'Math.abs',
  acos: 'Math.acos',
  asin: 'Math.asin',
  atan: 'Math.atan',
  atan2: 'Math.atan2',
  ceil: 'Math.ceil',
  cos: 'Math.cos',
  exp: 'Math.exp',
  floor: 'Math.floor',
  ln: 'Math.log',
  log: 'Math.log',
  log10: 'Math.log10',
  log2: 'Math.log2',
  max: 'Math.max',
  min: 'Math.min',
  pow: 'Math.pow',
  round: 'Math.round',
  sign: 'Math.sign',
  sin: 'Math.sin',
  sqrt: 'Math.sqrt',
  tan: 'Math.tan',
  sinh: 'Math.sinh',
  cosh: 'Math.cosh',
  tanh: 'Math.tanh',
  hypot: 'Math.hypot',
};

/**
 * Check whether an expression is safe for JIT compilation via new Function().
 *
 * Returns `false` for expressions that use:
 *  - The BNG `if()` function (ternary semantics differ from JS `if`)
 *  - `mratio` or other non-Math builtins
 *  - Any identifier that is not a known variable or allowed function
 *  - String manipulation, property access, assignment, etc.
 */
export function isJITSafe(expandedExpr: string, knownVars: Set<string>): boolean {
  // Reject anything with property access, assignment, semicolons, or template literals
  if (/[;`\[\]{}]|\.(?![0-9])|\b(var|let|const|function|return|this|new|delete|typeof|void|import|export|class|throw|try|catch|finally|while|for|do|switch|with|yield|async|await)\b/.test(expandedExpr)) {
    return false;
  }

  // Reject assignment operators: = but not ==, !=, <=, >=
  if (/(?<![=!<>])=(?!=)/.test(expandedExpr)) {
    return false;
  }

  // Extract all identifiers (word tokens not preceded by a dot)
  const identifiers = expandedExpr.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
  for (const id of identifiers) {
    if (knownVars.has(id)) continue;
    if (id in JIT_ALLOWED_FUNCTIONS) continue;
    // It could be a numeric suffix like e10 from scientific notation — skip
    if (/^[eE]\d*$/.test(id)) continue;
    return false;
  }

  return true;
}

/**
 * Convert an expanded expression into a JS function body string.
 *
 * Replaces:
 *  - `^` with `**` (JS exponentiation)
 *  - Known math function names with their `Math.*` equivalents
 *  - Variable references with `ctx.varName` property access
 *
 * @returns A function body string suitable for `new Function('ctx', body)`.
 */
function buildJITFunctionBody(expandedExpr: string, knownVars: Set<string>): string {
  let body = expandedExpr;

  // Replace ^ with ** for JS exponentiation (but not inside identifiers)
  body = body.replace(/\^/g, '**');

  // Replace function calls: funcName( -> Math.funcName(
  for (const [name, jsName] of Object.entries(JIT_ALLOWED_FUNCTIONS)) {
    const regex = new RegExp(`\\b${name}\\s*\\(`, 'g');
    body = body.replace(regex, `${jsName}(`);
  }

  // Replace variable references with ctx.varName
  // Process longest names first to avoid partial replacements
  const sortedVars = Array.from(knownVars).sort((a, b) => b.length - a.length);
  for (const v of sortedVars) {
    // Only replace standalone identifiers not already prefixed by 'ctx.' or 'Math.'
    const regex = new RegExp(`(?<!\\.)\\b${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    body = body.replace(regex, `ctx.${v}`);
  }

  return `return ${body};`;
}

/**
 * Compile a rate expression to a native JS function via `new Function()`.
 *
 * This gives ~16.7x speedup over the AST-walk evaluator by producing a direct
 * JavaScript function that V8 can JIT-optimize.
 *
 * @param expandedExpr - The pre-expanded expression (macros already inlined).
 * @param varNames - All variable names available in the evaluation context.
 * @param enableJIT - Whether JIT compilation is enabled (default: true).
 * @returns The JIT-compiled function, or `null` if the expression cannot be JIT-compiled.
 */
export function compileRateToJIT(
  expandedExpr: string,
  varNames: string[],
  enableJIT: boolean = true
): ((ctx: Record<string, number>) => number) | null {
  if (!enableJIT) return null;

  const knownVars = new Set(varNames);
  if (!isJITSafe(expandedExpr, knownVars)) return null;

  try {
    const body = buildJITFunctionBody(expandedExpr, knownVars);
    // eslint-disable-next-line no-new-func
    const fn = new Function('ctx', body) as (ctx: Record<string, number>) => number;

    // Sanity check: evaluate with zeros to verify it doesn't throw
    const testCtx: Record<string, number> = {};
    for (const v of varNames) testCtx[v] = 0;
    const testResult = fn(testCtx);
    if (typeof testResult !== 'number') return null;

    return fn;
  } catch {
    return null;
  }
}

/**
 * Pre-compile functional rates with JIT where possible, falling back to AST-walk.
 *
 * Combines Optimization A (pre-resolve) and Optimization B (JIT) into a single
 * setup-time pass. Each returned entry has either `jitFn` (fast path) or `astFn`
 * (safe fallback), plus diagnostic info.
 */
export interface PreCompiledRateWithJIT {
  /** JIT-compiled native JS function (fastest path), or null if not JIT-safe. */
  jitFn: ((ctx: Record<string, number>) => number) | null;
  /** AST-walk compiled function (safe fallback). Always present. */
  astFn: (ctx: Record<string, number>) => number;
  /** Whether this rate uses the JIT path. */
  isJIT: boolean;
  /** The pre-expanded expression. */
  expandedExpr: string;
  /** Original expression (for debugging). */
  originalExpr: string;
}

/**
 * Pre-compile all functional rate expressions with JIT optimization.
 *
 * At simulation setup time, this:
 *  1. Pre-expands macros and user functions (once, not per-step)
 *  2. Compiles the AST-walk evaluator (safe fallback)
 *  3. Attempts JIT compilation via new Function() for maximum speed
 *
 * @param expressions - Rate expression strings.
 * @param varNames - All context variable names.
 * @param functions - Model-defined user functions.
 * @param enableJIT - Whether to attempt JIT compilation (default: true).
 * @param evaluatorOverride - Optional evaluator override (for testing).
 */
export function preCompileFunctionalRatesWithJIT(
  expressions: string[],
  varNames: string[],
  functions?: { name: string; args: string[]; expression: string }[],
  enableJIT: boolean = true,
  evaluatorOverride?: ExpressionEvaluator
): PreCompiledRateWithJIT[] {
  if (!getFeatureFlags().functionalRatesEnabled) {
    throw new Error('Functional rates temporarily disabled pending security review');
  }

  const results: PreCompiledRateWithJIT[] = new Array(expressions.length);

  for (let i = 0; i < expressions.length; i++) {
    const originalExpr = expressions[i];
    const expandedExpr = preExpandExpression(originalExpr, functions);
    const astFn = getCompiledRateFunction(expandedExpr, varNames, evaluatorOverride);
    const jitFn = compileRateToJIT(expandedExpr, varNames, enableJIT);

    results[i] = {
      jitFn,
      astFn,
      isJIT: jitFn !== null,
      expandedExpr,
      originalExpr,
    };
  }

  const jitCount = results.filter(r => r.isJIT).length;
  if (expressions.length > 0) {
    console.log(`[ExpressionEvaluator] Pre-compiled ${expressions.length} functional rates: ${jitCount} JIT, ${expressions.length - jitCount} AST-walk`);
  }

  return results;
}

export function getCacheSizes() {
  return {
    expandedExpressionCacheSize: expandedExpressionCache.size,
    compiledRateFunctionsSize: compiledRateFunctions.size,
    compiledVersion: COMPILED_RATE_CACHE_VERSION,
    expandedVersion: EXPANDED_EXPR_CACHE_VERSION,
  };
}
