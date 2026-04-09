import { describe, it, expect } from 'vitest';
import { SBMLWriter } from '../src/services/export/SBMLWriter';
import type { BNGLModel } from '../src/types';
import type { ExpandedNetwork } from '../src/interfaces/SimulationEngine';

describe('SBMLWriter', () => {
  const mockModel: BNGLModel = {
    name: 'test_model',
    parameters: { k1: 0.1 },
    moleculeTypes: [{ name: 'AKT', components: ['Y~U~P'] }],
    species: [{ name: 'AKT(Y~U)', initialConcentration: 100 }],
    reactions: [],
    reactionRules: [
      {
        name: 'r1',
        reactants: ['AKT(Y~U)'],
        products: ['AKT(Y~P)'],
        rate: 'k1',
        isBidirectional: false
      }
    ],
    observables: [],
    functions: [],
    compartments: [{ name: 'cell', dimension: 3, size: 1 }]
  };

  it('generates a valid SBML L3V2 skeleton from a BNGLModel', () => {
    const xml = SBMLWriter.write(mockModel, undefined, { includeSBO: true });
    expect(xml).toContain('xmlns="http://www.sbml.org/sbml/level3/version2/core"');
    expect(xml).toContain('<model id="test_model"');
    expect(xml).toContain('<compartment id="cell"');
    expect(xml).toContain('<parameter id="k1" name="k1" value="0.1"');
    expect(xml).toContain('sboTerm="SBO:0000216"'); // Phosphorylation
  });

  it('includes MIRIAM annotations when requested', () => {
    const xml = SBMLWriter.write(mockModel, undefined, { includeAnnotations: true });
    expect(xml).toContain('<annotation>');
    expect(xml).toContain('xmlns:bqbiol="http://biomodels.net/biology-qualifiers/"');
    expect(xml).toContain('<bqbiol:is>');
    // A usually doesn't have a static match unless it's AKT/AKT1 etc, but we can check the block structure
  });

  it('generates a full SBML from an expanded network', () => {
    const mockNetwork: ExpandedNetwork = {
      species: [
        { name: 'AKT(Y~U)', initialConcentration: 100 },
        { name: 'AKT(Y~P)', initialConcentration: 0 }
      ],
      reactions: [
        { reactants: ['AKT(Y~U)'], products: ['AKT(Y~P)'], rate: '0.1', rateConstant: 0.1 }
      ],
      observableExpressions: new Map(),
      parameterValues: new Map()
    };

    const xml = SBMLWriter.write(mockModel, mockNetwork, { includeSBO: true });
    expect(xml).toContain('<species id="AKT_Y_U_"');
    expect(xml).toContain('<reaction id="R1"');
    expect(xml).toContain('<kineticLaw>');
    expect(xml).toContain('<ci>AKT_Y_U_</ci>');
    expect(xml).toContain('<cn>0.1</cn>');
  });
});
