/**
 * services/simulation/ExpressionEvaluator.ts
 * 
 * Logic for safely evaluating functional rate expressions (observables, functions).
 * Handles caching of expanded expressions and compiled functions.
 */

import { getFeatureFlags, registerCacheClearCallback } from '../../featureFlags';
import { SafeExpressionEvaluator as SafeExpressionEvaluatorStatic } from '../../utils/safeExpressionEvaluator';
import { compileExpressionToBytecode } from '../analysis/ExpressionBytecodeCompiler';
// console.log("ExpressionEvaluator module loaded");

/**
 * Interface for expression evaluators (SafeExpressionEvaluator or test mocks).
 * Defines the contract for secure expression compilation and evaluation.
 */
export interface ExpressionEvaluator {
  compile: (expr: string, vars: string[]) => (ctx: Record<string, number>) => number;
  getReferencedVariables: (expr: string) => string[];
  evaluateConstant: (expr: string) => number;
  isSafe?: (expr: string, vars: string[]) => boolean;
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
        let fileURLToPath;
        try {
            fileURLToPath = (globalThis as any).require('url')?.fileURLToPath;
        } catch {
            fileURLToPath = null;
        }
        if (typeof fileURLToPath === 'function') {
           const resolvedNoExt = fileURLToPath(new URL('../../utils/safeExpressionEvaluator', import.meta.url));
           candidateModulePaths.unshift(resolvedNoExt, `${resolvedNoExt}.js`, `${resolvedNoExt}.ts`);
        }
      } catch {
        // Ignore and fall back to relative path only.
      }

      for (const modulePath of candidateModulePaths) {
        // Validate the path against expected safe absolute/relative paths to prevent traversal.
        // We only allow exactly the hardcoded relative path, or absolute paths derived directly from it.
        let isSafePath = false;
        if (modulePath === '../../utils/safeExpressionEvaluator') {
          isSafePath = true;
        } else if (typeof modulePath === 'string') {
          const normalizedPath = modulePath.replace(/\\/g, '/');
          let resolvedBase: string | null = null;

          try {
            let fileURLToPath;
            try {
               fileURLToPath = (globalThis as any).require('url')?.fileURLToPath;
            } catch {
               fileURLToPath = null;
            }
            if (typeof fileURLToPath === 'function') {
              resolvedBase = fileURLToPath(new URL('../../utils/safeExpressionEvaluator', import.meta.url)).replace(/\\/g, '/');
            }
          } catch {
             // Fallback
          }

          if (resolvedBase && (normalizedPath === resolvedBase || normalizedPath === `${resolvedBase}.js` || normalizedPath === `${resolvedBase}.ts`)) {
             isSafePath = true;
          } else if (!resolvedBase) {
             // Strict exact string match validation to prevent path traversal with malicious prefixes
             if (normalizedPath === '../../utils/safeExpressionEvaluator' ||
                 normalizedPath === '../../utils/safeExpressionEvaluator.js' ||
                 normalizedPath === '../../utils/safeExpressionEvaluator.ts' ||
                 normalizedPath === './utils/safeExpressionEvaluator' ||
                 normalizedPath === './utils/safeExpressionEvaluator.js' ||
                 normalizedPath === './utils/safeExpressionEvaluator.ts') {
                 isSafePath = true;
             }
          }
        }

        if (!isSafePath) {
          continue;
        }

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

function isIdentifierChar(ch: string | undefined): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    ch === '_' ||
    ch === '$'
  );
}

function _replaceWholeWord(source: string, target: string, replacement: string): string {
  let result = '';

  for (let i = 0; i < source.length; ) {
    if (
      source.startsWith(target, i) &&
      !isIdentifierChar(source[i - 1]) &&
      !isIdentifierChar(source[i + target.length])
    ) {
      result += replacement;
      i += target.length;
      continue;
    }

    result += source[i];
    i++;
  }

  return result;
}

function _findFunctionCallStart(source: string, fnName: string, fromIndex: number): number {
  const prefix = `${fnName}(`;
  let searchIndex = fromIndex;

  while (true) {
    const startIdx = source.indexOf(prefix, searchIndex);
    if (startIdx === -1) return -1;
    if (!isIdentifierChar(source[startIdx - 1])) return startIdx;
    searchIndex = startIdx + 1;
  }
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

const BYTECODE_ALLOWED_FUNCTIONS = new Set<string>([
  ...Object.keys(JIT_ALLOWED_FUNCTIONS),
  'if',
  'not',
]);

const OP_STOP = 0xFF;

interface BytecodeProgram {
  code: Uint8Array;
  view: DataView;
}

function compileRateToBytecodeProgram(expandedExpr: string, varNames: string[]): BytecodeProgram | null {
  const compiled = compileExpressionToBytecode(
    expandedExpr,
    {},
    varNames,
    []
  );
  if (!compiled) return null;

  return {
    code: compiled.bytecode,
    view: new DataView(compiled.bytecode.buffer, compiled.bytecode.byteOffset, compiled.bytecode.byteLength),
  };
}

function buildBytecodeEvaluator(
  program: BytecodeProgram,
  varNames: string[]
): (ctx: Record<string, number>) => number {
  // Reuse buffers across calls to avoid per-step allocations in hot loops.
  const valueSlots = new Float64Array(varNames.length);
  const stack = new Float64Array(Math.max(64, program.code.length));

  return (ctx: Record<string, number>) => {
    for (let i = 0; i < varNames.length; i++) {
      const value = ctx[varNames[i]];
      valueSlots[i] = typeof value === 'number' ? value : 0;
    }

    const code = program.code;
    const view = program.view;
    let pc = 0;
    let sp = 0;

    while (pc < code.length) {
      const op = code[pc++];
      if (op === OP_STOP) break;

      switch (op) {
        case 0: { // PUSH_CONST
          const val = view.getFloat64(pc, true);
          pc += 8;
          stack[sp++] = val;
          break;
        }
        case 1:
        case 2: { // PUSH_SPEC / PUSH_OBS
          const idx = view.getInt32(pc, true);
          pc += 4;
          stack[sp++] = (idx >= 0 && idx < valueSlots.length) ? valueSlots[idx] : 0;
          break;
        }
        case 3: { // ADD
          const b = stack[--sp];
          stack[sp - 1] += b;
          break;
        }
        case 4: { // SUB
          const b = stack[--sp];
          stack[sp - 1] -= b;
          break;
        }
        case 5: { // MUL
          const b = stack[--sp];
          stack[sp - 1] *= b;
          break;
        }
        case 6: { // DIV
          const b = stack[--sp];
          stack[sp - 1] /= b;
          break;
        }
        case 7: { // POW
          const b = stack[--sp];
          stack[sp - 1] = stack[sp - 1] ** b;
          break;
        }
        case 8: // NEG
          stack[sp - 1] = -stack[sp - 1];
          break;
        case 9: // EXP
          stack[sp - 1] = Math.exp(stack[sp - 1]);
          break;
        case 10: // LOG
          stack[sp - 1] = Math.log(stack[sp - 1]);
          break;
        case 11: // LOG10
          stack[sp - 1] = Math.log10(stack[sp - 1]);
          break;
        case 12: // SQRT
          stack[sp - 1] = Math.sqrt(stack[sp - 1]);
          break;
        case 13: // ABS
          stack[sp - 1] = Math.abs(stack[sp - 1]);
          break;
        case 14: // SIN
          stack[sp - 1] = Math.sin(stack[sp - 1]);
          break;
        case 15: // COS
          stack[sp - 1] = Math.cos(stack[sp - 1]);
          break;
        case 16: // CEIL
          stack[sp - 1] = Math.ceil(stack[sp - 1]);
          break;
        case 17: // FLOOR
          stack[sp - 1] = Math.floor(stack[sp - 1]);
          break;
        case 18: // ROUND
          stack[sp - 1] = Math.round(stack[sp - 1]);
          break;
        case 19: // TAN
          stack[sp - 1] = Math.tan(stack[sp - 1]);
          break;
        case 20: // ASIN
          stack[sp - 1] = Math.asin(stack[sp - 1]);
          break;
        case 21: // ACOS
          stack[sp - 1] = Math.acos(stack[sp - 1]);
          break;
        case 22: // ATAN
          stack[sp - 1] = Math.atan(stack[sp - 1]);
          break;
        case 23: { // MAX
          const b = stack[--sp];
          stack[sp - 1] = Math.max(stack[sp - 1], b);
          break;
        }
        case 24: { // MIN
          const b = stack[--sp];
          stack[sp - 1] = Math.min(stack[sp - 1], b);
          break;
        }
        case 25: { // IF_ELSE
          const elseVal = stack[--sp];
          const thenVal = stack[--sp];
          const cond = stack[--sp];
          stack[sp++] = cond !== 0 ? thenVal : elseVal;
          break;
        }
        case 26: { // LT
          const b = stack[--sp];
          stack[sp - 1] = stack[sp - 1] < b ? 1 : 0;
          break;
        }
        case 27: { // GT
          const b = stack[--sp];
          stack[sp - 1] = stack[sp - 1] > b ? 1 : 0;
          break;
        }
        case 28: { // LE
          const b = stack[--sp];
          stack[sp - 1] = stack[sp - 1] <= b ? 1 : 0;
          break;
        }
        case 29: { // GE
          const b = stack[--sp];
          stack[sp - 1] = stack[sp - 1] >= b ? 1 : 0;
          break;
        }
        case 30: { // EQ
          const b = stack[--sp];
          stack[sp - 1] = stack[sp - 1] === b ? 1 : 0;
          break;
        }
        case 31: { // NE
          const b = stack[--sp];
          stack[sp - 1] = stack[sp - 1] !== b ? 1 : 0;
          break;
        }
        case 32: { // AND
          const b = stack[--sp];
          stack[sp - 1] = (stack[sp - 1] !== 0 && b !== 0) ? 1 : 0;
          break;
        }
        case 33: { // OR
          const b = stack[--sp];
          stack[sp - 1] = (stack[sp - 1] !== 0 || b !== 0) ? 1 : 0;
          break;
        }
        case 34: // NOT
          stack[sp - 1] = stack[sp - 1] === 0 ? 1 : 0;
          break;
        default:
          return 0;
      }
    }

    return sp > 0 ? stack[sp - 1] : 0;
  };
}

/**
 * Check whether an expression is safe for JIT compilation via new Function().
 *
 * Returns `false` for expressions that use:
 *  - `mratio` or other non-Math builtins
 *  - Any identifier that is not a known variable or allowed function
 *  - String manipulation, property access, assignment, etc.
 */
export function isJITSafe(expandedExpr: string, knownVars: Set<string>): boolean {
  // Use SafeExpressionEvaluator's AST parser to guarantee the string is a valid mathematical expression
  // with no unsupported JS syntax, property access, or unexpected function calls.
  if (!SafeExpressionEvaluatorStatic || typeof SafeExpressionEvaluatorStatic.isSafe !== 'function') {
    // Fail securely: if we cannot securely validate the expression using the AST parser,
    // we must reject JIT compilation to prevent code injection.
    return false;
  }

  if (!SafeExpressionEvaluatorStatic.isSafe(expandedExpr, Array.from(knownVars))) {
    return false;
  }

  // The AST parser validates that the expression is mathematically safe.
  // However, JIT compilation via new Function() only supports a strict subset of
  // mathematical functions (defined in BYTECODE_ALLOWED_FUNCTIONS).
  // Some functions (such as BNG's if()) are supported by the bytecode VM but not
  // by dynamic-code emission; compileRateToJIT handles that by falling back to
  // bytecode execution when dynamic-code emission is unavailable.

  // Extract all identifiers (word tokens not preceded by a dot)
  const identifiers = expandedExpr.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
  for (const id of identifiers) {
    if (knownVars.has(id)) continue;
    if (BYTECODE_ALLOWED_FUNCTIONS.has(id)) continue;
    // It could be a numeric suffix like e10 from scientific notation - skip
    if (/^[eE]\d*$/.test(id)) continue;
    return false; // Found an unsupported identifier/function for JIT
  }

  return true;
}

/**
 * Compile a rate expression to the secure fast path.
 *
 * Priority order:
 *  1. Bytecode VM (no dynamic code generation)
 *  2. SafeExpressionEvaluator fallback
 *
 * @param expandedExpr - The pre-expanded expression (macros already inlined).
 * @param varNames - All variable names available in the evaluation context.
 * @param enableJIT - Whether functional-rate precompilation is enabled (default: true).
 * @returns The compiled function, or `null` if the expression cannot be compiled.
 */
export function compileRateToJIT(
  expandedExpr: string,
  varNames: string[],
  enableJIT: boolean = true
): ((ctx: Record<string, number>) => number) | null {
  if (!enableJIT) return null;

  const knownVars = new Set(varNames);
  if (!isJITSafe(expandedExpr, knownVars)) {
    return null;
  }

  // Dynamic-code emission via `new Function` was removed to satisfy CodeQL
  // and keep this path strictly non-evaluative.
  void getFeatureFlags().enableJitFastPath;

  // Secure default fast path: compile once to bytecode and execute via a static VM.
  const bytecodeProgram = compileRateToBytecodeProgram(expandedExpr, varNames);
  if (bytecodeProgram) {
    return buildBytecodeEvaluator(bytecodeProgram, varNames);
  }

  const evaluator = getEvaluator();
  if (!evaluator) return null;

  try {
    const referenced = evaluator.getReferencedVariables(expandedExpr);
    const usedVars = referenced.filter((v) => knownVars.has(v));
    return evaluator.compile(expandedExpr, usedVars);
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
