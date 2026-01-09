// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { compile, evaluateConstant, isSafe, SafeExpressionEvaluator } from '../services/safeExpressionEvaluator';

describe('SafeExpressionEvaluator (AST allowlist)', () => {
  it('evaluates simple math with constants', () => {
    const val = evaluateConstant('sqrt(2) * pi');
    expect(val).toBeGreaterThan(4.44);
    expect(val).toBeLessThan(4.45);
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
    // expr-eval does not support comma operator or statements; should fail to parse
    expect(() => compile('1, 2', [])).toThrow();
  });

  it('exposes both function and class-style API for compatibility', () => {
    const fn = SafeExpressionEvaluator.compile('k1 + k2', ['k1', 'k2']);
    expect(fn({ k1: 1, k2: 2 })).toBe(3);
  });

  it('supports additional math functions and constants', () => {
    const fn = compile('atan2(y, x) + log10(v) + sign(n) + PI', ['y', 'x', 'v', 'n']);
    const out = fn({ y: 1, x: 1, v: 100, n: -3 });
    // atan2(1,1)=pi/4 ~=0.7854, log10(100)=2, sign(-3)=-1, PI~=3.14159 => total ~4.927
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
});

