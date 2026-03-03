/**
 * Test for BNGXMLWriter molecule type inference
 * 
 * Verifies that models without explicit molecule types (like BLBR)
 * can still generate valid XML by inferring types from species.
 */

import { describe, it, expect } from 'vitest';
import { BNGXMLWriter } from '../services/simulation/BNGXMLWriter';
import type { BNGLModel } from '../types';

describe('BNGXMLWriter Molecule Type Inference', () => {
  it('should infer molecule types from species when not explicitly defined', () => {
    // BLBR-like model with no explicit molecule types
    const model: BNGLModel = {
      name: 'BLBR_Test',
      parameters: {
        kp1: 1,
        km1: 1,
        R0: 1000,
        L0: 1000
      },
      moleculeTypes: [], // Empty - should be inferred
      species: [
        { name: 'R(r,r)', initialConcentration: 1000 },
        { name: 'L(l,l)', initialConcentration: 1000 }
      ],
      observables: [
        { type: 'Species', name: 'R1', pattern: 'R()' }
      ],
      reactionRules: [
        {
          name: 'LigandAddition',
          reactants: ['R(r)', 'L(l,l)'],
          products: ['R(r!1).L(l!1,l)'],
          rate: 'kp1',
          isBidirectional: true,
          reverseRate: 'km1'
        }
      ],
      reactions: [],
      compartments: [],
      functions: [],
      networkOptions: {},
      simulationOptions: {},
      simulationPhases: [],
      concentrationChanges: [],
      parameterChanges: [],
      actions: [],
      paramExpressions: {}
    };

    // Generate XML
    const xml = BNGXMLWriter.write(model);

    // Verify XML contains ListOfMoleculeTypes
    expect(xml).toContain('<ListOfMoleculeTypes>');
    expect(xml).toContain('</ListOfMoleculeTypes>');

    // Verify molecule types R and L are present
    expect(xml).toContain('<MoleculeType id="R">');
    expect(xml).toContain('<MoleculeType id="L">');

    // Verify components are present
    expect(xml).toContain('<ComponentType id="r">');
    expect(xml).toContain('<ComponentType id="l">');

    // Verify it's not empty (should have at least 2 molecule types)
    const moleculeTypeMatches = xml.match(/<MoleculeType id="/g);
    expect(moleculeTypeMatches).toBeTruthy();
    expect(moleculeTypeMatches!.length).toBeGreaterThanOrEqual(2);

    console.log('[XML Inference Test] Generated XML has', moleculeTypeMatches!.length, 'molecule types');
  });

  it('should validate models with inferred molecule types', () => {
    const model: BNGLModel = {
      name: 'Test',
      parameters: {},
      moleculeTypes: [], // Empty
      species: [
        { name: 'A(x)', initialConcentration: 100 }
      ],
      observables: [],
      reactionRules: [
        {
          name: 'R1',
          reactants: ['A(x)'],
          products: ['A(x!1).A(x!1)'],
          rate: '1.0',
          isBidirectional: false
        }
      ],
      reactions: [],
      compartments: [],
      functions: [],
      networkOptions: {},
      simulationOptions: {},
      simulationPhases: [],
      concentrationChanges: [],
      parameterChanges: [],
      actions: [],
      paramExpressions: {}
    };

    // Validation should pass (species exist, even if moleculeTypes is empty)
    const validation = BNGXMLWriter.validate(model);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should fail validation when both moleculeTypes and species are empty', () => {
    const model: BNGLModel = {
      name: 'Empty',
      parameters: {},
      moleculeTypes: [],
      species: [], // Empty
      observables: [],
      reactionRules: [
        {
          name: 'R1',
          reactants: ['A(x)'],
          products: ['A(x!1).A(x!1)'],
          rate: '1.0',
          isBidirectional: false
        }
      ],
      reactions: [],
      compartments: [],
      functions: [],
      networkOptions: {},
      simulationOptions: {},
      simulationPhases: [],
      concentrationChanges: [],
      parameterChanges: [],
      actions: [],
      paramExpressions: {}
    };

    const validation = BNGXMLWriter.validate(model);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it('should infer molecule types from reaction rules when species are simple', () => {
    const model: BNGLModel = {
      name: 'RuleInference',
      parameters: {},
      moleculeTypes: [],
      species: [
        { name: 'A', initialConcentration: 100 } // Simple species without components
      ],
      observables: [],
      reactionRules: [
        {
          name: 'R1',
          reactants: ['A(x)', 'B(y)'],
          products: ['A(x!1).B(y!1)'],
          rate: '1.0',
          isBidirectional: false
        }
      ],
      reactions: [],
      compartments: [],
      functions: [],
      networkOptions: {},
      simulationOptions: {},
      simulationPhases: [],
      concentrationChanges: [],
      parameterChanges: [],
      actions: [],
      paramExpressions: {}
    };

    const xml = BNGXMLWriter.write(model);

    // Should infer A and B from reaction rules
    expect(xml).toContain('<MoleculeType id="A">');
    expect(xml).toContain('<MoleculeType id="B">');
    expect(xml).toContain('<ComponentType id="x">');
    expect(xml).toContain('<ComponentType id="y">');
  });
});
