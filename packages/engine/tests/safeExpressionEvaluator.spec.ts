// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { SafeExpressionEvaluator } from '../src/utils/safeExpressionEvaluator';

const compile = SafeExpressionEvaluator.compile;
const evaluateConstant = SafeExpressionEvaluator.evaluateConstant;
const isSafe = SafeExpressionEvaluator.isSafe;

describe('SafeExpressionEvaluator (AST allowlist)', () => {
  it('evaluates simple math with constants', () => {
    const value = evaluateConstant('sqrt(2) * pi');
    expect(value).toBeGreaterThan(4.44);
    expect(value).toBeLessThan(4.45);
  });

  it('handles invalid expressions with fallbackNaN flag', () => {
    // With fallbackNaN=true, an invalid expression returns NaN
    expect(Number.isNaN(evaluateConstant('invalid_expression', true, true))).toBe(true);
    // With fallbackNaN=false (default), it returns 0
    expect(evaluateConstant('invalid_expression', false, true)).toBe(0);
  });

  it('compiles with param allowlist and evaluates', () => {
    const fn = compile('k1 * x / (km + x)', ['k1', 'x', 'km']);
    const out = fn({ k1: 0.5, x: 10, km: 5 });
    expect(out).toBeCloseTo(0.3333333333, 6);
  });

  it('rejects unknown variables at compile time', () => {
    expect(() => compile('k1 * EVIL', ['k1'])).toThrow(/unknown variables/i);
  });

  it('isSafe validates syntax and variables', () => {
    expect(isSafe('k1 + k2', ['k1', 'k2'])).toBe(true);
    expect(isSafe('k1 + unknownVar', ['k1'])).toBe(false);
    expect(isSafe(')))((({{{', ['k1'])).toBe(false);
  });

  it('disallows globals like console', () => {
    expect(() => compile('console.log(1)', [])).toThrow();
  });

  it('disallows unknown functions like importScripts', () => {
    expect(() => compile('importScripts(1)', [])).toThrow();
  });

  it('disallows property access like a.b', () => {
    expect(() => compile('a.b + 1', ['a'])).toThrow();
  });

  it('does not allow comma operator / multiple statements', () => {
    expect(() => compile('1, 2', [])).toThrow();
  });

  it('exposes both function and class-style API for compatibility', () => {
    const fn = SafeExpressionEvaluator.compile('k1 + k2', ['k1', 'k2']);
    expect(fn({ k1: 1, k2: 2 })).toBe(3);
  });

  it('supports additional math functions and constants', () => {
    const fn = compile('atan2(y, x) + log10(v) + sign(n) + PI', ['y', 'x', 'v', 'n']);
    const out = fn({ y: 1, x: 1, v: 100, n: -3 });
    expect(out).toBeGreaterThan(4.9);
    expect(out).toBeLessThan(5.0);
  });

  it('rejects overly deep nesting', () => {
    const deep = '1' + ' + ('.repeat(300) + '0' + ')'.repeat(300);
    expect(() => compile(deep, [])).toThrow(/nesting too deep/i);
  });

  it('getReferencedVariables returns variables used', () => {
    const vars = SafeExpressionEvaluator.getReferencedVariables('a + b * PI');
    expect(vars.includes('a')).toBe(true);
    expect(vars.includes('b')).toBe(true);
  });

  it('disallows factorial operator (5!)', () => {
    expect(() => compile('5!', [])).toThrow();
  });

  it('supports ternary operator (Issue #17)', () => {
    const fn = compile('x > 0 ? x : -x', ['x']);
    expect(fn({ x: 5 })).toBe(5);
    expect(fn({ x: -5 })).toBe(5);
  });

  it('supports FunctionProduct(a,b) for BNG2 parity', () => {
    const fn = compile('FunctionProduct(k1, k2)', ['k1', 'k2']);
    expect(fn({ k1: 2, k2: 3 })).toBe(6);
  });

  it('supports &&/|| logical operators (e.g. t>=sigma&&t<sigma+t_delta2)', () => {
    const fn = compile('t>=sigma&&t<sigma+t_delta2', ['t', 'sigma', 't_delta2']);
    expect(fn({ t: 1, sigma: 0, t_delta2: 2 })).toBe(1);
    expect(fn({ t: 3, sigma: 0, t_delta2: 2 })).toBe(0);
  });
});