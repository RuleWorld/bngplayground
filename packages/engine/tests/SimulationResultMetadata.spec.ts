import { describe, expect, it } from 'vitest';
import { simulate } from '../src/services/simulation/SimulationLoop';
import type { BNGLModel, SimulationOptions } from '../src/types';

const callbacks = {
  checkCancelled: () => {},
  postMessage: () => {},
};

function createExpandedModel(): BNGLModel {
  return {
    parameters: { k: 0.1 },
    moleculeTypes: [],
    species: [
      { name: 'A()', initialConcentration: 12 },
      { name: 'B()', initialConcentration: 0 },
    ],
    observables: [
      { name: 'A_total', type: 'molecules', pattern: 'A()' },
      { name: 'B_total', type: 'molecules', pattern: 'B()' },
    ],
    concreteObservables: [
      { name: 'A_total', type: 'molecules', indices: [0], coefficients: [1], volumes: [1] },
      { name: 'B_total', type: 'molecules', indices: [1], coefficients: [1], volumes: [1] },
    ],
    reactions: [{
      reactants: ['A()'],
      products: ['B()'],
      rate: 'k',
      rateConstant: 0.1,
    }],
    reactionRules: [],
  };
}

describe.each(['ssa', 'ode'] as const)('SimulationLoop %s result metadata', (method) => {
  it('omits expanded metadata by default and returns it only when requested', async () => {
    const model = createExpandedModel();
    const options: SimulationOptions = {
      method,
      t_end: 1,
      n_steps: 4,
      seed: 12345,
      ...(method === 'ode' ? { solver: 'rk4' as const } : {}),
    };

    const defaultResult = await simulate(1, model, options, callbacks);
    const richResult = await simulate(2, model, {
      ...options,
      includeSpeciesData: true,
      includeExpandedNetwork: true,
    }, callbacks);

    expect(defaultResult).not.toHaveProperty('speciesHeaders');
    expect(defaultResult).not.toHaveProperty('speciesData');
    expect(defaultResult).not.toHaveProperty('speciesDataBySuffix');
    expect(defaultResult).not.toHaveProperty('expandedReactions');
    expect(defaultResult).not.toHaveProperty('expandedSpecies');
    expect(richResult.speciesData).toBeDefined();
    expect(richResult.expandedReactions).toEqual(model.reactions);
    expect(richResult.expandedSpecies).toEqual(model.species);
    expect(richResult.headers).toEqual(defaultResult.headers);
    expect(richResult.data).toEqual(defaultResult.data);
  });
});
