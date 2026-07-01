import { describe, it, expect } from 'vitest';
import { simulatePSA, PSASimulator } from '../../src/services/simulation/PSASimulator';
import type { BNGLModel } from '../../src/types';

describe('PSASimulator', () => {
  it('should run a basic simulation', async () => {
    const model: BNGLModel = {
      species: [
        { name: 'A', initialConcentration: 200, isConstant: false },
        { name: 'B', initialConcentration: 0, isConstant: false },
      ],
      reactions: [
        {
          name: 'A_to_B',
          reactants: ['A'],
          products: ['B'],
          rateConstant: 1.0,
          rate: ''
        },
      ],
      observables: [
        { name: 'ObsA', pattern: 'A', type: 'Molecules' },
        { name: 'ObsB', pattern: 'B', type: 'Molecules' },
      ],
      parameters: {},
      reactionRules: [],
      functions: [],
      compartments: [],
      moleculeTypes: []
    };

    const result = await simulatePSA(model, {
      t_end: 1,
      n_steps: 10,
      poplevel: 100,
      seed: 42,
      method: 'psa'
    });

    expect(result.headers).toEqual(['time', 'ObsA', 'ObsB']);
    expect(result.data.length).toBe(11);
    expect(result.data[0].ObsA).toBe(200);
    expect(result.data[0].ObsB).toBe(0);
  });

  it('should handle TotalRate reactions', async () => {
    const model: BNGLModel = {
      species: [
        { name: 'A', initialConcentration: 200, isConstant: false },
        { name: 'B', initialConcentration: 0, isConstant: false },
      ],
      reactions: [
        {
          name: 'A_to_B',
          reactants: ['A'],
          products: ['B'],
          rateConstant: 1.0,
          totalRate: true,
          rate: ''
        },
      ],
      observables: [
        { name: 'ObsA', pattern: 'A', type: 'Molecules' }
      ],
      parameters: {},
      reactionRules: [],
      functions: [],
      compartments: [],
      moleculeTypes: []
    };

    const result = await simulatePSA(model, {
      t_end: 1,
      n_steps: 2,
      poplevel: 100,
      seed: 42,
      method: 'psa'
    });
    expect(result.data.length).toBe(3);
  });

  it('should hit HAS scaling block with multiple reactants', async () => {
    const model: BNGLModel = {
      species: [
        { name: 'A', initialConcentration: 300, isConstant: false },
        { name: 'B', initialConcentration: 300, isConstant: false },
        { name: 'C', initialConcentration: 0, isConstant: false },
      ],
      reactions: [
        {
          name: 'A_plus_B_to_C',
          reactants: ['A', 'B'],
          products: ['C'],
          rateConstant: 0.001,
          rate: ''
        },
        {
          name: 'A_plus_A_to_C',
          reactants: ['A', 'A'],
          products: ['C'],
          rateConstant: 0.001,
          rate: ''
        }
      ],
      observables: [
        { name: 'ObsA', pattern: 'A', type: 'Molecules' },
        { name: 'ObsC', pattern: 'C', type: 'Molecules' }
      ],
      parameters: {},
      reactionRules: [],
      functions: [],
      compartments: [],
      moleculeTypes: []
    };

    const result = await simulatePSA(model, {
      t_end: 1,
      n_steps: 2,
      poplevel: 100,
      seed: 42,
      method: 'psa'
    });
    expect(result.data.length).toBe(3);
  });

  it('should correctly evaluate observables with multiple patterns and commas', async () => {
    const model: BNGLModel = {
      species: [
        { name: 'A(s~P)', initialConcentration: 10, isConstant: false },
        { name: 'B(s~P)', initialConcentration: 20, isConstant: false },
      ],
      reactions: [],
      observables: [
        { name: 'Phosphorylated', pattern: 'A(s~P), B(s~P)', type: 'Molecules' }
      ],
      parameters: {},
      reactionRules: [],
      functions: [],
      compartments: [],
      moleculeTypes: []
    };

    const result = await simulatePSA(model, {
      t_end: 1,
      n_steps: 1,
      seed: 42,
      method: 'psa'
    });
    expect(result.data[0].Phosphorylated).toBe(30);
  });

  it('should throw error for unknown species in reaction', async () => {
    const model: BNGLModel = {
      species: [{ name: 'A', initialConcentration: 10, isConstant: false }],
      reactions: [{ name: 'r1', reactants: ['Unknown'], products: [], rateConstant: 1, rate: '' }],
      observables: [],
      parameters: {},
      reactionRules: [],
      functions: [],
      compartments: [],
      moleculeTypes: []
    };
    await expect(simulatePSA(model, { t_end: 1, n_steps: 1, seed: 42, method: 'psa' })).rejects.toThrow('PSA simulation error: species "Unknown" not found in model species list.');
  });

  it('should throw error for unknown product species in reaction', async () => {
    const model: BNGLModel = {
      species: [{ name: 'A', initialConcentration: 10, isConstant: false }],
      reactions: [{ name: 'r1', reactants: ['A'], products: ['Unknown'], rateConstant: 1, rate: '' }],
      observables: [],
      parameters: {},
      reactionRules: [],
      functions: [],
      compartments: [],
      moleculeTypes: []
    };
    await expect(simulatePSA(model, { t_end: 1, n_steps: 1, seed: 42, method: 'psa' })).rejects.toThrow('PSA simulation error: species "Unknown" not found in model species list.');
  });
});
