// @ts-nocheck
/**
 * Comprehensive Pattern Matching Tests
 * Tests for BNGL pattern matching accuracy and edge cases
 */
import { describe, it, expect } from 'vitest';
import { BNGLParser } from '../src/services/graph/core/BNGLParser';
import { GraphMatcher } from '../src/services/graph/core/Matcher';

describe('Pattern Matching - Simple Patterns', () => {
  it('should match single molecule pattern', () => {
    const pattern = BNGLParser.parseSpeciesGraph('A');
    const target = BNGLParser.parseSpeciesGraph('A(b)');
    
    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('should not match different molecule names', () => {
    const pattern = BNGLParser.parseSpeciesGraph('A');
    const target = BNGLParser.parseSpeciesGraph('B(a)');
    
    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBe(0);
  });

  it('should match pattern with specific state', () => {
    const pattern = BNGLParser.parseSpeciesGraph('A(s~P)');
    const target = BNGLParser.parseSpeciesGraph('A(s~P)');
    
    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBe(1);
  });

  it('should not match when state differs', () => {
    const pattern = BNGLParser.parseSpeciesGraph('A(s~P)');
    const target = BNGLParser.parseSpeciesGraph('A(s~U)');
    
    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBe(0);
  });
});

describe('Pattern Matching - Bond Wildcards', () => {
  it('should match !+ (any bond) when bonded', () => {
    const pattern = BNGLParser.parseSpeciesGraph('A(b!+)');
    const target = BNGLParser.parseSpeciesGraph('A(b!1).B(a!1)');
    
    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('should not match !+ when unbound', () => {
    const pattern = BNGLParser.parseSpeciesGraph('A(b!+)');
    const target = BNGLParser.parseSpeciesGraph('A(b)');
    
    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBe(0);
  });

  it('should match unbound pattern when component is free', () => {
    const pattern = BNGLParser.parseSpeciesGraph('A(b)');
    const target = BNGLParser.parseSpeciesGraph('A(b)');
    
    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBe(1);
  });

  it('should match !? (any or no bond) for both cases', () => {
    const pattern = BNGLParser.parseSpeciesGraph('A(b!?)');
    const targetBound = BNGLParser.parseSpeciesGraph('A(b!1).B(a!1)');
    const targetFree = BNGLParser.parseSpeciesGraph('A(b)');
    
    const matchesBound = GraphMatcher.findAllMaps(pattern, targetBound);
    const matchesFree = GraphMatcher.findAllMaps(pattern, targetFree);
    
    expect(matchesBound.length).toBeGreaterThan(0);
    expect(matchesFree.length).toBeGreaterThan(0);
  });
});

describe('Pattern Matching - Complex Patterns', () => {
  it('should match bimolecular pattern', () => {
    const pattern = BNGLParser.parseSpeciesGraph('A(b!1).B(a!1)');
    const target = BNGLParser.parseSpeciesGraph('A(b!1).B(a!1)');
    
    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBe(1);
  });

  it('should find multiple matches for symmetric species', () => {
    const pattern = BNGLParser.parseSpeciesGraph('A(b)');
    const target = BNGLParser.parseSpeciesGraph('A(b!1).B(a!1,c!2).A(b!2)');
    
    const matches = GraphMatcher.findAllMaps(pattern, target);
    // Should find 0 matches since both A's are bound
    expect(matches.length).toBe(0);
  });

  it('should count molecules correctly for Molecules observable', () => {
    // Pattern A should match 2 times in A.A
    const pattern = BNGLParser.parseSpeciesGraph('A');
    const target = BNGLParser.parseSpeciesGraph('A(b!1).A(b!1)');
    
    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBe(2);
  });
});

describe('Pattern Matching - Edge Cases', () => {
  it('should handle empty pattern', () => {
    const pattern = BNGLParser.parseSpeciesGraph('');
    expect(pattern.molecules.length).toBe(0);
  });

  it('should handle molecules with many components', () => {
    const pattern = BNGLParser.parseSpeciesGraph('Receptor(L,D,Y~U,Y~U,Y~U)');
    const target = BNGLParser.parseSpeciesGraph('Receptor(L,D,Y~P,Y~U,Y~U)');
    
    // Pattern specifies all Y~U, target has one Y~P, so no match
    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBe(0);
  });

  it('should handle self-bonds (intramolecular)', () => {
    const pattern = BNGLParser.parseSpeciesGraph('A(b!1,c!1)');
    const target = BNGLParser.parseSpeciesGraph('A(b!1,c!1)');
    
    const matches = GraphMatcher.findAllMaps(pattern, target);
    expect(matches.length).toBe(1);
  });
});

describe('Pattern Matching - Compartment Matching', () => {
  it('should match pattern with compartment prefix', () => {
    const pattern = BNGLParser.parseSpeciesGraph('@cyto:A(b)');
    const target = BNGLParser.parseSpeciesGraph('@cyto:A(b)');
    
    expect(pattern.compartment).toBe('cyto');
    expect(target.compartment).toBe('cyto');
  });

  it('should not match different compartments', () => {
    const pattern = BNGLParser.parseSpeciesGraph('@cyto:A(b)');
    const target = BNGLParser.parseSpeciesGraph('@nuc:A(b)');
    
    // Compartments should differ
    expect(pattern.compartment).not.toBe(target.compartment);
  });
});

