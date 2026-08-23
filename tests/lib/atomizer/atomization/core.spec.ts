import { describe, it, expect } from 'vitest';
import { disambiguateCollidingSpecies } from '../../../../src/lib/atomizer/atomization/core';
import { Species, Molecule, Component } from '../../../../src/lib/atomizer/core/structures';
import type { SpeciesCompositionTable, SCTEntry, SBMLModel, SBMLSpecies } from '../../../../src/lib/atomizer/config/types';

describe('disambiguateCollidingSpecies', () => {
  it('should add __sp discriminator component when species share pattern and compartment', () => {
    // Create two distinct SBML species ppERKc and ppERKn sharing cytosol compartment and identical structure M_ppERK
    const sp1 = new Species();
    const mol1 = new Molecule('ppERK');
    mol1.addComponent(new Component('s', '', [], ['P']));
    sp1.addMolecule(mol1);

    const sp2 = new Species();
    const mol2 = new Molecule('ppERK');
    mol2.addComponent(new Component('s', '', [], ['P']));
    sp2.addMolecule(mol2);

    const sct: SpeciesCompositionTable = {
      entries: new Map<string, SCTEntry>([
        ['ppERKc', {
          structure: sp1,
          components: ['ppERK'],
          sbmlId: 'ppERKc',
          isElemental: true,
          modifications: new Map(),
          weight: 1,
          bonds: [],
        }],
        ['ppERKn', {
          structure: sp2,
          components: ['ppERK'],
          sbmlId: 'ppERKn',
          isElemental: true,
          modifications: new Map(),
          weight: 1,
          bonds: [],
        }],
      ]),
      dependencies: new Map(),
      reverseDependencies: new Map(),
      sortedSpecies: ['ppERKc', 'ppERKn'],
      weights: [['ppERKc', 1], ['ppERKn', 1]],
    };

    const model: SBMLModel = {
      id: 'model1',
      name: 'model1',
      compartments: new Map(),
      species: new Map<string, SBMLSpecies>([
        ['ppERKc', {
          id: 'ppERKc',
          name: 'ppERKc',
          compartment: 'cytosol',
          initialConcentration: 1,
          initialAmount: 0,
          substanceUnits: '',
          hasOnlySubstanceUnits: false,
          boundaryCondition: false,
          constant: false,
          annotations: [],
        }],
        ['ppERKn', {
          id: 'ppERKn',
          name: 'ppERKn',
          compartment: 'cytosol',
          initialConcentration: 1,
          initialAmount: 0,
          substanceUnits: '',
          hasOnlySubstanceUnits: false,
          boundaryCondition: false,
          constant: false,
          annotations: [],
        }],
      ]),
      parameters: new Map(),
      reactions: new Map(),
      rules: [],
      functionDefinitions: new Map(),
      events: [],
      initialAssignments: [],
      speciesByCompartment: new Map(),
      unitDefinitions: new Map(),
    };

    const count = disambiguateCollidingSpecies(sct, model);
    expect(count).toBe(2);

    const entry1 = sct.entries.get('ppERKc')!;
    const entry2 = sct.entries.get('ppERKn')!;

    const disc1 = entry1.structure.molecules[0].components.find((c: Component) => c.name === '__sp');
    const disc2 = entry2.structure.molecules[0].components.find((c: Component) => c.name === '__sp');

    expect(disc1).toBeDefined();
    expect(disc1?.activeState).toBe('ppERKc');

    expect(disc2).toBeDefined();
    expect(disc2?.activeState).toBe('ppERKn');
  });

  it('should be a no-op when species have different compartments or different patterns', () => {
    const sp1 = new Species();
    const mol1 = new Molecule('ERK');
    sp1.addMolecule(mol1);

    const sp2 = new Species();
    const mol2 = new Molecule('MEK');
    sp2.addMolecule(mol2);

    const sct: SpeciesCompositionTable = {
      entries: new Map<string, SCTEntry>([
        ['S1', {
          structure: sp1,
          components: ['ERK'],
          sbmlId: 'S1',
          isElemental: true,
          modifications: new Map(),
          weight: 1,
          bonds: [],
        }],
        ['S2', {
          structure: sp2,
          components: ['MEK'],
          sbmlId: 'S2',
          isElemental: true,
          modifications: new Map(),
          weight: 1,
          bonds: [],
        }],
      ]),
      dependencies: new Map(),
      reverseDependencies: new Map(),
      sortedSpecies: ['S1', 'S2'],
      weights: [['S1', 1], ['S2', 1]],
    };

    const model: SBMLModel = {
      id: 'model2',
      name: 'model2',
      compartments: new Map(),
      species: new Map<string, SBMLSpecies>([
        ['S1', {
          id: 'S1',
          name: 'S1',
          compartment: 'cytosol',
          initialConcentration: 1,
          initialAmount: 0,
          substanceUnits: '',
          hasOnlySubstanceUnits: false,
          boundaryCondition: false,
          constant: false,
          annotations: [],
        }],
        ['S2', {
          id: 'S2',
          name: 'S2',
          compartment: 'cytosol',
          initialConcentration: 1,
          initialAmount: 0,
          substanceUnits: '',
          hasOnlySubstanceUnits: false,
          boundaryCondition: false,
          constant: false,
          annotations: [],
        }],
      ]),
      parameters: new Map(),
      reactions: new Map(),
      rules: [],
      functionDefinitions: new Map(),
      events: [],
      initialAssignments: [],
      speciesByCompartment: new Map(),
      unitDefinitions: new Map(),
    };

    const count = disambiguateCollidingSpecies(sct, model);
    expect(count).toBe(0);

    const disc1 = sct.entries.get('S1')!.structure.molecules[0].components.find((c: Component) => c.name === '__sp');
    expect(disc1).toBeUndefined();
  });
});
