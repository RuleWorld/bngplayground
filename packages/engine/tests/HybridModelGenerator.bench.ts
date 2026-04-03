import { bench, describe } from 'vitest';
import { HybridModelGenerator } from '../src/services/simulation/HybridModelGenerator';
import type { BNGLModel, BNGLMoleculeType, BNGLSpecies, ReactionRule } from '../src/types';

describe('HybridModelGenerator performance', () => {
  // Generate a large model
  const moleculeTypes: BNGLMoleculeType[] = [];
  const popTypes: any[] = [];
  const species: BNGLSpecies[] = [];
  const popMaps: any[] = [];
  const reactionRules: ReactionRule[] = [];

  for (let i = 0; i < 5000; i++) {
    moleculeTypes.push({ name: `Molecule_${i}`, components: [] });
  }
  for (let i = 0; i < 1000; i++) {
    popTypes.push({ name: `PopType_${i}`, components: [] });
    species.push({ name: `PopType_${i}()`, initialConcentration: 1 });
    popMaps.push({ pattern: `PopType_${i}()`, populationName: `PopType_${i}`, lumpingRate: '1' });
  }
  for (let i = 0; i < 1000; i++) {
    reactionRules.push({
      name: `r_${i}`,
      reactants: [`Molecule_1()`, `PopType_${i}()`],
      products: [`Molecule_2()`],
      rate: '1',
      isBidirectional: false
    });
  }

  const model: BNGLModel = {
    name: 'benchmark_model',
    parameters: {},
    moleculeTypes,
    species,
    observables: [],
    reactionRules,
    reactions: [],
    populationTypes: popTypes,
    populationMaps: popMaps
  };

  bench('generate', async () => {
    await HybridModelGenerator.generate(model);
  });

  bench('partitionRules', () => {
    HybridModelGenerator.partitionRules(model, popTypes.map(pt => ({ moleculeName: pt.name, treatAsPopulation: true })));
  });
});
