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
  it('keeps expanded metadata by default and can omit it without changing headers or data', async () => {
    const model = createExpandedModel();
    const options: SimulationOptions = {
      method,
      t_end: 1,
      n_steps: 4,
      seed: 12345,
      includeSpeciesData: false,
      ...(method === 'ode' ? { solver: 'rk4' as const } : {}),
    };

    const defaultResult = await simulate(1, model, options, callbacks);
    const leanResult = await simulate(2, model, {
      ...options,
      includeExpandedNetwork: false,
    }, callbacks);

    expect(defaultResult.expandedReactions).toEqual(model.reactions);
    expect(defaultResult.expandedSpecies).toEqual(model.species);
    expect(leanResult).not.toHaveProperty('expandedReactions');
    expect(leanResult).not.toHaveProperty('expandedSpecies');
    expect(leanResult.headers).toEqual(defaultResult.headers);
    expect(leanResult.data).toEqual(defaultResult.data);
  });
});
