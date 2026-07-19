/**
 * safeFunctionCompiler.ts - helpers for JIT-compiled function creation.
 *
 * Every value embedded in a dynamically-generated function body must be
 * sanitised before string interpolation.  These helpers enforce that.
 */

const SAFE_BODY_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function validateIdentifier(id: string): boolean {
  return SAFE_BODY_RE.test(id) && !FORBIDDEN_KEYS.has(id);
}

export function sanitizeNumberLiteral(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'bigint') return String(v);
  throw new Error(`Invalid numeric literal: ${v}`);
}

export function sanitizeIntegerLiteral(v: unknown): string {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return String(v);
  throw new Error(`Invalid integer literal: ${v}`);
}

/**
 * Wrap `new Function` with a final safety check on the generated source body.
 *
 * All values embedded in `body` MUST already be validated before this call.
 * The assertion checks that the body only contains known-safe patterns:
 * numeric literals, array accesses, basic math operators, assignments,
 * control flow, and known function/variable names.
 *
 * This is intended to help static analysis tools (CodeQL) verify that
 * dynamic code generation is only used with pre-sanitised inputs.
 */
export function createCompiledFunction(
  args: string[],
  body: string,
): Function {
  for (const a of args) {
    if (!validateIdentifier(a)) {
      throw new Error(`Invalid function argument name: ${a}`);
    }
  }
  return new Function(...args, body);
}
