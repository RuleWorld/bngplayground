import { describe, it, expect } from 'vitest';
import { bnglFunction } from '../../../../src/lib/atomizer/writer/bnglWriter';

describe('bnglFunction', () => {
  it('should format Saturation style rules properly', () => {
    const reactants = ['S1'];
    const speciesWithConcFunctions = new Set<string>(['S1']);
    const sbmlToBnglId = new Map([['S1', 'S1']]);

    // Saturation rule without explicit substrate
    expect(bnglFunction(
      'Sat(k1, Km)',
      'rxn1',
      reactants,
      [],
      new Map(),
      new Map(),
      new Set(),
      new Set(),
      new Map(),
      new Set(),
      speciesWithConcFunctions,
      sbmlToBnglId
    )).toBe('Sat(k1, Km, S1_amt)');

    // Saturation rule with explicit substrate parameter
    expect(bnglFunction(
      'Sat(k1, Km, S1)',
      'rxn1',
      reactants,
      [],
      new Map(),
      new Map(),
      new Set(),
      new Set(),
      new Map(),
      new Set(),
      speciesWithConcFunctions,
      sbmlToBnglId
    )).toBe('((k1) * Sat(S1_amt, Km, S1_amt))');

    // MM rule
    expect(bnglFunction(
      'MM(k1, Km, S1)',
      'rxn1',
      reactants,
      [],
      new Map(),
      new Map(),
      new Set(),
      new Set(),
      new Map(),
      new Set(),
      speciesWithConcFunctions,
      sbmlToBnglId
    )).toBe('((k1) * MM(S1_amt, Km, S1_amt))');

    // Hill rule
    expect(bnglFunction(
      'Hill(k1, Km, S1, n)',
      'rxn1',
      reactants,
      [],
      new Map(),
      new Map(),
      new Set(),
      new Set(),
      new Map(),
      new Set(),
      speciesWithConcFunctions,
      sbmlToBnglId
    )).toBe('((k1) * (S1_amt)^(n) / ((Km)^(n) + (S1_amt)^(n)))');
  });

  it('should handle compartments in Math expressions', () => {
    const compartments = ['cytosol'];
    expect(bnglFunction('k1 * cytosol', 'rxn', [], compartments)).toBe('k1 * __compartment_cytosol__');
  });

  it('should handle assignmentRuleVariables and species references', () => {
    const assignmentRuleVariables = new Set(['myRule']);
    const speciesWithConcFunctions = new Set(['myRule', 'S1']);
    const sbmlToBnglId = new Map([['S1', 'S1']]);

    // Should replace with _c_myRule() and _c_S1() because it's not a saturation rule
    expect(bnglFunction('myRule * S1', 'rxn', [], [], new Map(), new Map(), assignmentRuleVariables, new Set(), new Map(), new Set(), speciesWithConcFunctions, sbmlToBnglId))
      .toBe('_c_myRule() * _c_S1()');

    // Without conc function
    const speciesWithConcFunctionsEmpty = new Set<string>();
    expect(bnglFunction('S1', 'rxn', [], [], new Map(), new Map(), new Set(), new Set(), new Map(), new Set(), speciesWithConcFunctionsEmpty, sbmlToBnglId))
      .toBe('S1_amt');
  });

  it('should handle reaction dictionary mappings', () => {
    const reactionDict = new Map([['rxn1', 'R1_net']]);
    expect(bnglFunction('rxn1 * 2', 'rxn', [], [], new Map(), reactionDict)).toBe('netflux_R1_net * 2');
  });

  it('should handle piecewise functions', () => {
    expect(bnglFunction('piecewise(v1, c1, v2, c2)', 'rxn', [])).toBe('if(c1, v1, if(c2, v2, 0))');
    expect(bnglFunction('piecewise(v1, c1, v2, c2, otherwise)', 'rxn', [])).toBe('if(c1, v1, if(c2, v2, otherwise))');
  });

  it('should format math functions properly', () => {
    expect(bnglFunction('pow(x, y)', 'rxn', [])).toBe('((x)^(y))');
    expect(bnglFunction('sqrt(x)', 'rxn', [])).toBe('((x)^(1/2))');
    expect(bnglFunction('exp(x)', 'rxn', [])).toBe('(2.71828182845905^(x))');
    expect(bnglFunction('log(x)', 'rxn', [])).toBe('ln(x)');
    expect(bnglFunction('log10(x)', 'rxn', [])).toBe('(ln(x)/2.302585093)');
    expect(bnglFunction('abs(x)', 'rxn', [])).toBe('if(x>=0,x,-(x))');
  });

  it('should replace special constants', () => {
    expect(bnglFunction('pi * exponentiale * true * false', 'rxn', [])).toBe('3.14159265358979 * 2.71828182845905 * 1 * 0');
  });

  it('should map sbml to bngl IDs', () => {
    const sbmlToBnglId = new Map([['complex_S1_S2', 'S3']]);
    expect(bnglFunction('Sat(k1, Km, complex_S1_S2)', 'rxn', [], [], new Map(), new Map(), new Set(), new Set(), new Map(), new Set(), new Set(['S3']), sbmlToBnglId))
      .toBe('((k1) * Sat(complex_S1_S2_amt, Km))');
  });

  it('should correctly normalize double negatives', () => {
    expect(bnglFunction('x --y', 'rxn', [])).toBe('x +y');
  });

  it('should handle comparison operators', () => {
    expect(bnglFunction('gt(a, b)', 'rxn', [])).toBe('(a > b)');
    expect(bnglFunction('leq(a, b)', 'rxn', [])).toBe('(a <= b)');
    expect(bnglFunction('neq(a, b)', 'rxn', [])).toBe('(a != b)');
    expect(bnglFunction('and(a, b)', 'rxn', [])).toBe('(a && b)');
    expect(bnglFunction('not(a)', 'rxn', [])).toBe('(!a)');
  });
});
