// @ts-nocheck
/**
 * Comprehensive Parser Tests
 * Tests for BNGL syntax parsing edge cases and bng2.pl parity
 */
import { describe, it, expect } from 'vitest';
import { parseBNGL } from '../services/parseBNGL';

describe('parseBNGL - Parameter Resolution', () => {
  it('should resolve simple numeric parameters', () => {
    const code = `
      begin parameters
        k1 0.01
        k2 1.5e-3
      end parameters
    `;
    const model = parseBNGL(code);
    expect(model.parameters.k1).toBe(0.01);
    expect(model.parameters.k2).toBe(0.0015);
  });

  it('should resolve dependent parameters', () => {
    const code = `
      begin parameters
        a 10
        b a * 2
        c b + a
      end parameters
    `;
    const model = parseBNGL(code);
    expect(model.parameters.a).toBe(10);
    expect(model.parameters.b).toBe(20);
    expect(model.parameters.c).toBe(30);
  });

  it('should resolve circular dependencies gracefully', () => {
    const code = `
      begin parameters
        a b
        b c
        c 1
      end parameters
    `;
    const model = parseBNGL(code);
    expect(model.parameters.c).toBe(1);
    expect(model.parameters.b).toBe(1);
    expect(model.parameters.a).toBe(1);
  });

  it('should handle mathematical expressions in parameters', () => {
    const code = `
      begin parameters
        pi 3.14159
        r 2
        area pi * r^2
      end parameters
    `;
    const model = parseBNGL(code);
    expect(model.parameters.area).toBeCloseTo(12.566, 2);
  });
});

describe('parseBNGL - Molecule Types', () => {
  it('should parse simple molecule types', () => {
    const code = `
      begin molecule types
        A(b)
        B(a)
      end molecule types
    `;
    const model = parseBNGL(code);
    expect(model.moleculeTypes).toHaveLength(2);
    expect(model.moleculeTypes[0].name).toBe('A');
    expect(model.moleculeTypes[0].components).toContain('b');
  });

  it('should parse molecules with multiple components', () => {
    const code = `
      begin molecule types
        Receptor(ligand, kinase, state~U~P)
      end molecule types
    `;
    const model = parseBNGL(code);
    expect(model.moleculeTypes[0].components).toContain('ligand');
    expect(model.moleculeTypes[0].components).toContain('kinase');
    expect(model.moleculeTypes[0].components).toContain('state~U~P');
  });

  it('should handle molecules without components', () => {
    const code = `
      begin molecule types
        SimpleProtein
      end molecule types
    `;
    const model = parseBNGL(code);
    expect(model.moleculeTypes[0].name).toBe('SimpleProtein');
  });
});

describe('parseBNGL - Seed Species', () => {
  it('should parse simple seed species', () => {
    const code = `
      begin seed species
        A(b) 100
        B(a) 0
      end seed species
    `;
    const model = parseBNGL(code);
    expect(model.species).toHaveLength(2);
    expect(model.species[0].initialConcentration).toBe(100);
    expect(model.species[1].initialConcentration).toBe(0);
  });

  it('should handle species with parameter concentrations', () => {
    const code = `
      begin parameters
        A0 100
      end parameters
      begin seed species
        A(b) A0
      end seed species
    `;
    const model = parseBNGL(code);
    expect(model.species[0].initialConcentration).toBe(100);
  });

  it('should parse species with bonds', () => {
    const code = `
      begin seed species
        A(b!1).B(a!1) 50
      end seed species
    `;
    const model = parseBNGL(code);
    expect(model.species[0].name).toContain('A');
    expect(model.species[0].name).toContain('B');
  });
});

describe('parseBNGL - Observables', () => {
  it('should parse Molecules observables', () => {
    const code = `
      begin observables
        Molecules TotalA A
      end observables
    `;
    const model = parseBNGL(code);
    expect(model.observables[0].type).toBe('molecules');
    expect(model.observables[0].name).toBe('TotalA');
    expect(model.observables[0].pattern).toContain('A');
  });

  it('should parse Species observables', () => {
    const code = `
      begin observables
        Species FreeA A(b)
      end observables
    `;
    const model = parseBNGL(code);
    expect(model.observables[0].type).toBe('species');
    expect(model.observables[0].name).toBe('FreeA');
  });

  it('should handle observables with bond wildcards', () => {
    const code = `
      begin observables
        Molecules BoundA A(b!+)
        Molecules UnboundA A(b)
      end observables
    `;
    const model = parseBNGL(code);
    expect(model.observables[0].pattern).toContain('!+');
    expect(model.observables[1].pattern).not.toContain('!');
  });
});

describe('parseBNGL - Reaction Rules', () => {
  it('should parse unidirectional rules', () => {
    const code = `
      begin parameters
        kf 0.01
      end parameters
      begin reaction rules
        A(b) + B(a) -> A(b!1).B(a!1) kf
      end reaction rules
    `;
    const model = parseBNGL(code);
    expect(model.reactionRules).toHaveLength(1);
    expect(model.reactionRules[0].isBidirectional).toBe(false);
    expect(model.reactionRules[0].reactants).toHaveLength(2);
    expect(model.reactionRules[0].products).toHaveLength(1);
  });

  it('should parse bidirectional rules', () => {
    const code = `
      begin parameters
        kf 0.01
        kr 0.1
      end parameters
      begin reaction rules
        A(b) + B(a) <-> A(b!1).B(a!1) kf, kr
      end reaction rules
    `;
    const model = parseBNGL(code);
    expect(model.reactionRules[0].isBidirectional).toBe(true);
    expect(model.reactionRules[0].rate).toBe('kf');
    expect(model.reactionRules[0].reverseRate).toBe('kr');
  });

  it('should handle state change rules', () => {
    const code = `
      begin parameters
        k 0.01
      end parameters
      begin reaction rules
        A(s~U) -> A(s~P) k
      end reaction rules
    `;
    const model = parseBNGL(code);
    expect(model.reactionRules[0].reactants[0]).toContain('~U');
    expect(model.reactionRules[0].products[0]).toContain('~P');
  });

  it('should parse degradation rules (product = 0)', () => {
    const code = `
      begin parameters
        kd 0.01
      end parameters
      begin reaction rules
        A(b) -> 0 kd
      end reaction rules
    `;
    const model = parseBNGL(code);
    expect(model.reactionRules[0].products).toHaveLength(0);
  });

  it('should parse synthesis rules (reactant = 0)', () => {
    const code = `
      begin parameters
        ks 1.0
      end parameters
      begin reaction rules
        0 -> A(b) ks
      end reaction rules
    `;
    const model = parseBNGL(code);
    expect(model.reactionRules[0].reactants).toHaveLength(0);
    expect(model.reactionRules[0].products).toHaveLength(1);
  });

  it('should preserve molecule-level compartments in product complexes', () => {
    const code = `
      begin parameters
        kf 1
      end parameters
      begin reaction rules
        SARM(b)@Cyt + TLR3(t)@End_M -> SARM(b!1)@Cyt.TLR3(t!1)@End_M kf
      end reaction rules
    `;
    const model = parseBNGL(code);
    const product = model.reactionRules[0].products[0];
    expect(product).toMatch(/SARM\([^)]*\)@Cyt/);
    expect(product).toContain('TLR3');
    expect(product).toContain('@End_M');
  });
});

describe('parseBNGL - Functions', () => {
  it('should parse zero-argument functions', () => {
    const code = `
      begin parameters
        k0 1.0
      end parameters
      begin functions
        myFunc() k0 * 2
      end functions
    `;
    const model = parseBNGL(code);
    expect(model.functions).toHaveLength(1);
    expect(model.functions![0].name).toBe('myFunc');
    expect(model.functions![0].args).toHaveLength(0);
  });
});

describe('parseBNGL - Compartments', () => {
  it('should parse compartments with dimensions', () => {
    const code = `
      begin compartments
        EC 3 1.0
        PM 2 0.01 EC
        CP 3 1.0 PM
      end compartments
    `;
    const model = parseBNGL(code);
    expect(model.compartments).toHaveLength(3);
    expect(model.compartments![0].name).toBe('EC');
    expect(model.compartments![0].dimension).toBe(3);
    expect(model.compartments![1].parent).toBe('EC');
  });
});

describe('parseBNGL - Comments', () => {
  it('should strip single-line comments', () => {
    const code = `
      begin parameters
        # This is a comment
        k1 0.01 # inline comment
      end parameters
    `;
    const model = parseBNGL(code);
    expect(model.parameters.k1).toBe(0.01);
  });
});

describe('parseBNGL - Edge Cases', () => {
  it('should handle empty blocks', () => {
    const code = `
      begin parameters
      end parameters
      begin molecule types
      end molecule types
    `;
    const model = parseBNGL(code);
    expect(Object.keys(model.parameters)).toHaveLength(0);
    expect(model.moleculeTypes).toHaveLength(0);
  });

  it('should handle missing blocks', () => {
    const code = `
      begin parameters
        k1 1
      end parameters
    `;
    const model = parseBNGL(code);
    expect(model.parameters.k1).toBe(1);
    expect(model.species).toHaveLength(0);
  });

  it('should handle line continuations with backslash', () => {
    const code = `
      begin reaction rules
        A(b) + B(a) -> \\
          A(b!1).B(a!1) 0.01
      end reaction rules
    `;
    const model = parseBNGL(code);
    expect(model.reactionRules).toHaveLength(1);
  });
});

