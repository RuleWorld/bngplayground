import { describe, expect, it } from 'vitest';
import { extendFunction } from '../../src/lib/atomizer/writer/bnglWriter';
import { SBMLFunctionDefinition } from '../../src/lib/atomizer/config/types';

describe('extendFunction', () => {
  it('substitutes zero-argument functions', () => {
    const params = new Map<string, number | string>();
    const funcs = new Map<string, SBMLFunctionDefinition>([
      ['kPlus', { id: 'kPlus', name: 'kPlus', arguments: [], math: '1.5' }]
    ]);

    const result = extendFunction('kPlus() * 2', params, funcs);
    expect(result).toBe('(1.5) * 2');
  });

  it('substitutes single-argument functions', () => {
    const params = new Map<string, number | string>();
    const funcs = new Map<string, SBMLFunctionDefinition>([
      ['square', { id: 'square', name: 'square', arguments: ['x'], math: 'x * x' }]
    ]);

    const result = extendFunction('square(5) + square(a)', params, funcs);
    // 5 -> (5)
    // a -> (a)
    expect(result).toBe('((5) * (5)) + ((a) * (a))');
  });

  it('substitutes multi-argument functions', () => {
    const params = new Map<string, number | string>();
    const funcs = new Map<string, SBMLFunctionDefinition>([
      ['add', { id: 'add', name: 'add', arguments: ['x', 'y'], math: 'x + y' }]
    ]);

    const result = extendFunction('add(2, 3) * add(a, b)', params, funcs);
    expect(result).toBe('((2) + (3)) * ((a) + (b))');
  });

  it('substitutes multi-argument functions with complex arguments', () => {
    const params = new Map<string, number | string>();
    const funcs = new Map<string, SBMLFunctionDefinition>([
      ['func', { id: 'func', name: 'func', arguments: ['x', 'y'], math: 'x + y' }]
    ]);

    const result = extendFunction('func(a(x), b(y))', params, funcs);
    expect(result).toBe('((a(x)) + (b(y)))');
  });

  it('substitutes parameter values', () => {
    const params = new Map<string, number | string>([
      ['k1', 10],
      ['k2', '20.5']
    ]);
    const funcs = new Map<string, SBMLFunctionDefinition>();

    const result = extendFunction('k1 * x + k2', params, funcs);
    expect(result).toBe('10 * x + 20.5');
  });

  it('does not substitute parts of words', () => {
    const params = new Map<string, number | string>([
      ['k1', 10]
    ]);
    const funcs = new Map<string, SBMLFunctionDefinition>();

    const result = extendFunction('k1 * my_k1_var', params, funcs);
    expect(result).toBe('10 * my_k1_var');
  });

  it('substitutes both functions and parameters', () => {
    const params = new Map<string, number | string>([
      ['p1', 5]
    ]);
    const funcs = new Map<string, SBMLFunctionDefinition>([
      ['f', { id: 'f', name: 'f', arguments: ['x'], math: 'x * p1' }]
    ]);

    const result = extendFunction('f(10) + p1', params, funcs);
    expect(result).toBe('((10) * 5) + 5');
  });
});
