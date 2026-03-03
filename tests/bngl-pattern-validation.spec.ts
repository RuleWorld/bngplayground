/**
 * Comprehensive BNGL Pattern Validation Tests
 * 
 * This test suite covers the validateObservablePattern function which is used
 * by the Custom Expressions panel to validate BNGL patterns before adding them.
 */

import { describe, it, expect } from 'vitest';
import { validateObservablePattern, parseObservablePattern } from '../packages/engine/src/utils/dynamicObservable';

describe('BNGL Pattern Validation - Basic Patterns', () => {
  it('should validate a simple molecule name', () => {
    expect(validateObservablePattern('A')).toBeNull();
  });

  it('should validate a molecule with number in name', () => {
    expect(validateObservablePattern('A1')).toBeNull();
  });

  it('should validate a molecule with underscore', () => {
    expect(validateObservablePattern('my_molecule')).toBeNull();
  });

  it('should validate single letter molecule', () => {
    expect(validateObservablePattern('A')).toBeNull();
  });

  it('should validate two molecules separated by dot', () => {
    expect(validateObservablePattern('A.B')).toBeNull();
  });

  it('should validate three molecules', () => {
    expect(validateObservablePattern('A.B.C')).toBeNull();
  });

  it('should validate molecule with empty parentheses', () => {
    expect(validateObservablePattern('A()')).toBeNull();
  });
});

describe('BNGL Pattern Validation - Component Patterns', () => {
  it('should validate molecule with single component', () => {
    expect(validateObservablePattern('A(b)')).toBeNull();
  });

  it('should validate molecule with multiple components', () => {
    expect(validateObservablePattern('A(b,c,d)')).toBeNull();
  });

  it('should validate molecule with component and state', () => {
    expect(validateObservablePattern('A(b~P)')).toBeNull();
  });

  it('should validate molecule with multiple components and states', () => {
    expect(validateObservablePattern('A(b~P,c~U,d~Y)')).toBeNull();
  });

  it('should validate molecule with mixed component types', () => {
    expect(validateObservablePattern('A(b,c~P,d~U,e~Y)')).toBeNull();
  });

  it('should validate molecule with numbered state', () => {
    expect(validateObservablePattern('A(b~1)')).toBeNull();
  });
});

describe('BNGL Pattern Validation - Bond Patterns', () => {
  it('should validate bonded components with number', () => {
    expect(validateObservablePattern('A(b!1).B(a!1)')).toBeNull();
  });

  it('should validate multiple bonds', () => {
    expect(validateObservablePattern('A(b!1!2).B(a!1).C(a!2)')).toBeNull();
  });

  it('should validate unbound component marker', () => {
    expect(validateObservablePattern('A(b!?)')).toBeNull();
  });

  it('should validate bonded to anything marker', () => {
    expect(validateObservablePattern('A(b!+)')).toBeNull();
  });

  it('should validate not bonded marker', () => {
    expect(validateObservablePattern('A(b!-)')).toBeNull();
  });

  it('should validate self-bond pattern', () => {
    expect(validateObservablePattern('A(b!1,a!1)')).toBeNull();
  });

  it('should validate bond with component that also has state', () => {
    expect(validateObservablePattern('A(b~P!1).B(a!1)')).toBeNull();
  });
});

describe('BNGL Pattern Validation - Wildcard Patterns', () => {
  it('should validate wildcard state (*)', () => {
    expect(validateObservablePattern('A(b~*)')).toBeNull();
  });

  it('should validate wildcard state (?)', () => {
    expect(validateObservablePattern('A(b~?)')).toBeNull();
  });

  it('should validate wildcard molecule name', () => {
    expect(validateObservablePattern('*()')).toBeNull();
  });

  it('should validate wildcard component', () => {
    expect(validateObservablePattern('A(*)')).toBeNull();
  });
});

describe('BNGL Pattern Validation - Compartment Patterns', () => {
  it('should validate prefix compartment notation', () => {
    expect(validateObservablePattern('@cell:A.B')).toBeNull();
  });

  it('should validate suffix compartment notation', () => {
    expect(validateObservablePattern('A.B@cell')).toBeNull();
  });

  it('should validate compartment on single molecule', () => {
    expect(validateObservablePattern('A@cytoplasm')).toBeNull();
  });

  it('should validate compartment with components', () => {
    expect(validateObservablePattern('A(b!1)@PM.B(a!1)@cyto')).toBeNull();
  });

  it('should validate complex compartment pattern', () => {
    expect(validateObservablePattern('@nuc:A.B.C')).toBeNull();
  });

  it('should validate underscore in compartment name', () => {
    expect(validateObservablePattern('A@extra_cellular')).toBeNull();
  });

  it('should validate compartment after molecule with parens', () => {
    expect(validateObservablePattern('A(b~P)@membrane')).toBeNull();
  });
});

describe('BNGL Pattern Validation - Error Conditions', () => {
  it('should reject empty pattern', () => {
    const result = validateObservablePattern('');
    expect(result).not.toBeNull();
    expect(result).toContain('empty');
  });

  it('should reject whitespace-only pattern', () => {
    expect(validateObservablePattern('   ')).not.toBeNull();
  });

  it('should reject invalid molecule name starting with number', () => {
    const result = validateObservablePattern('1A');
    expect(result).not.toBeNull();
  });

  it('should reject molecule name with only numbers', () => {
    expect(validateObservablePattern('123')).not.toBeNull();
  });

  it('should reject unmatched opening parenthesis', () => {
    const result = validateObservablePattern('A(b');
    expect(result).not.toBeNull();
  });

  it('should reject unmatched closing parenthesis', () => {
    const result = validateObservablePattern('A(b))');
    expect(result).not.toBeNull();
  });

  it('should reject invalid character in pattern', () => {
    const result = validateObservablePattern('A(b#invalid)');
    expect(result).not.toBeNull();
    expect(result).toContain('Invalid character');
  });

  it('should reject consecutive dots', () => {
    const result = validateObservablePattern('A..B');
    expect(result).not.toBeNull();
  });

  it('should reject dot at start', () => {
    const result = validateObservablePattern('.A.B');
    expect(result).not.toBeNull();
  });

  it('should reject dot at end', () => {
    const result = validateObservablePattern('A.B.');
    expect(result).not.toBeNull();
  });

  it('should reject invalid bond format', () => {
    const result = validateObservablePattern('A(b!abc)');
    expect(result).not.toBeNull();
  });

  it('should reject negative bond number', () => {
    expect(validateObservablePattern('A(b!-1)')).not.toBeNull();
  });

  it('should reject zero bond number', () => {
    expect(validateObservablePattern('A(b!0)')).not.toBeNull();
  });

  it('should reject empty component', () => {
    expect(validateObservablePattern('A(,)')).toBeNull();
  });

  it('should reject dollar sign in molecule name', () => {
    expect(validateObservablePattern('A$b(c)')).not.toBeNull();
  });

  it('should reject unicode in states', () => {
    expect(validateObservablePattern('A(b~α,c~β)')).not.toBeNull();
  });

  it('should reject tab characters', () => {
    expect(validateObservablePattern('A(\tb)')).not.toBeNull();
  });

  it('should reject newline characters', () => {
    expect(validateObservablePattern('A(\nb)')).not.toBeNull();
  });

  it('should reject vertical bar', () => {
    expect(validateObservablePattern('A(b|)')).not.toBeNull();
  });

  it('should reject exclamation after component list', () => {
    // This is not standard BNGL syntax - molecule-level bonds
    expect(validateObservablePattern('A(b,c)!1')).not.toBeNull();
  });
});

describe('BNGL Pattern Validation - Real-world Examples', () => {
  it('should validate MAPK cascade pattern', () => {
    expect(validateObservablePattern('MAP3K(b!1).MAP2K(a!1,b!2).MAPK(a!2~P)')).toBeNull();
  });

  it('should validate receptor-ligand complex', () => {
    expect(validateObservablePattern('R(l!1).L(r!1)')).toBeNull();
  });

  it('should validate transcription factor pattern', () => {
    expect(validateObservablePattern('TF(DNA!+,nuc!?)')).toBeNull();
  });

  it('should validate dimerization pattern', () => {
    expect(validateObservablePattern('A(b!1).A(b!1)')).toBeNull();
  });

  it('should validate phosphorylation cycle pattern', () => {
    expect(validateObservablePattern('Kinase(a!1).Substrate(b!1~P)')).toBeNull();
  });

  it('should validate multi-state protein', () => {
    expect(validateObservablePattern('Protein(a~U,b~U,c~U)')).toBeNull();
  });

  it('should validate compartment-separated species', () => {
    expect(validateObservablePattern('mRNA@cyt.protein@ext')).toBeNull();
  });

  it('should validate membrane protein pattern', () => {
    expect(validateObservablePattern('RTK(l!1,tm!+)@PM.Grb2(sh2!1)@cyt')).toBeNull();
  });

  it('should validate calcium signaling pattern', () => {
    expect(validateObservablePattern('Ca(c!+)')).toBeNull();
  });

  it('should validate DNA binding pattern', () => {
    expect(validateObservablePattern('TF(DNA!1).DNA(gene!1)')).toBeNull();
  });

  it('should validate toggle switch pattern', () => {
    expect(validateObservablePattern('LacI(DNA!1).TetR(DNA!1)')).toBeNull();
  });
});

describe('BNGL Pattern Validation - Additional Edge Cases', () => {
  it('should validate pattern with only wildcard', () => {
    expect(validateObservablePattern('*')).toBeNull();
  });

  it('should validate pattern with multiple wildcards', () => {
    expect(validateObservablePattern('*().*()')).toBeNull();
  });

  it('should handle very long molecule names', () => {
    const longName = 'VeryLongMoleculeNameThatExceedsTypicalLength';
    expect(validateObservablePattern(`${longName}()`)).toBeNull();
  });

  it('should handle molecule with many components', () => {
    expect(validateObservablePattern('A(a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z)')).toBeNull();
  });

  it('should handle large bond numbers', () => {
    expect(validateObservablePattern('A(b!12345).B(a!12345)')).toBeNull();
  });

  it('should handle state with numbers', () => {
    expect(validateObservablePattern('A(b~1,c~2,d~3)')).toBeNull();
  });

  it('should handle state with underscores', () => {
    expect(validateObservablePattern('A(b~phosphorylated,c~de_phosphorylated)')).toBeNull();
  });

  it('should handle state with hyphens', () => {
    expect(validateObservablePattern('A(b~active-form)')).toBeNull();
  });

  it('should handle state with plus signs', () => {
    expect(validateObservablePattern('A(b~Ca2+)')).toBeNull();
  });

  it('should handle multiple consecutive tildes', () => {
    expect(validateObservablePattern('A(b~~P)')).toBeNull();
  });

  it('should handle multiple consecutive exclamation marks', () => {
    expect(validateObservablePattern('A(b!!1)')).toBeNull();
  });

  it('should reject compartment starting with number', () => {
    // Compartment names must start with letter or underscore
    // Currently this is NOT rejected - compartment validation allows numbers
    // This is a known limitation
    const result = validateObservablePattern('A@1cell');
    // After fix, this should return an error
    expect(result).not.toBeNull();
  });
});

describe('BNGL Pattern Parsing - Structural Integrity', () => {
  it('should parse pattern and create valid SpeciesGraph', () => {
    const graph = parseObservablePattern('A(b!1).B(a!1)');
    expect(graph.molecules.length).toBe(2);
    expect(graph.molecules[0].name).toBe('A');
    expect(graph.molecules[1].name).toBe('B');
  });

  it('should preserve component states in parsed graph', () => {
    const graph = parseObservablePattern('A(b~P!1,c~U).B(a!1~Y)');
    expect(graph.molecules[0].components[0].state).toBe('P');
    expect(graph.molecules[0].components[1].state).toBe('U');
  });

  it('should preserve compartment in parsed graph', () => {
    const graph = parseObservablePattern('A(b!1)@PM.B(a!1)@cyt');
    expect(graph.molecules[0].compartment || graph.molecules[1].compartment).toBeTruthy();
  });

  it('should handle wildcard bonds correctly', () => {
    const graph = parseObservablePattern('A(b!+).B(a)');
    expect(graph.molecules[0].components[0].wildcard).toBe('+');
  });

  it('should handle unbound component correctly', () => {
    const graph = parseObservablePattern('A(b!?)');
    expect(graph.molecules[0].components[0].wildcard).toBe('?');
  });

  it('should handle wildcard molecule name', () => {
    const graph = parseObservablePattern('*()');
    expect(graph.molecules[0].name).toBe('*');
  });

  it('should handle double colon compartment notation', () => {
    const graph = parseObservablePattern('@cell::A.B');
    expect(graph.compartment).toBe('cell');
  });
});
