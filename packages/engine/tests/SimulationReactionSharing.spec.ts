import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { simulate } from '../src/services/simulation/SimulationLoop';
import type { BNGLModel, SimulationOptions, SimulationResults } from '../src/types';

const { runNFsimSimulationMock } = vi.hoisted(() => ({
  runNFsimSimulationMock: vi.fn(),
}));

vi.mock('../src/services/simulation/nfsim/NFsimRunner', () => ({
  runNFsimSimulation: runNFsimSimulationMock,
}));

const callbacks = {
  checkCancelled: () => {},
  postMessage: () => {},
};

function createExpandedModel(): BNGLModel {
  return {
    parameters: { k: 0.1, initialA: 40 },
    moleculeTypes: [
      { name: 'A', components: [] },
      { name: 'B', components: [] },
    ],
    species: [
      { name: 'A()', initialConcentration: 40, initialExpression: 'initialA' },
      { name: 'B()', initialConcentration: 0 },
    ],
    observables: [
      { name: 'A_total', type: 'Molecules', pattern: 'A()' },
      { name: 'B_total', type: 'Molecules', pattern: 'B()' },
    ],
    concreteObservables: [
      { name: 'A_total', type: 'Molecules', indices: [0], coefficients: [1], volumes: [1] },
      { name: 'B_total', type: 'Molecules', indices: [1], coefficients: [1], volumes: [1] },
    ],
    reactions: [{
      reactants: ['A()'],
      products: ['B()'],
      productStoichiometries: [1],
      rate: 'k',
      rateConstant: 0.1,
      name: 'convert',
    }],
    reactionRules: [],
  };
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(Reflect.get(value, key), seen);
  }
  return Object.freeze(value);
}

function cloneModel(model: BNGLModel): BNGLModel {
  return structuredClone(model);
}

function trajectoryHash(result: SimulationResults): string {
  return createHash('sha256')
    .update(JSON.stringify({
      headers: result.headers,
      data: result.data,
      speciesHeaders: result.speciesHeaders,
      speciesData: result.speciesData,
    }))
    .digest('hex');
}

const ssaOptions: SimulationOptions = {
  method: 'ssa',
  t_end: 2,
  n_steps: 8,
  seed: 24680,
  includeSpeciesData: true,
};

describe('SimulationLoop expanded reaction sharing', () => {
  beforeEach(() => {
    runNFsimSimulationMock.mockReset();
  });

  it('simulates deeply frozen expanded reactions without cloning or changing trajectory data', async () => {
    const mutableModel = createExpandedModel();
    const frozenModel = deepFreeze(cloneModel(mutableModel));

    const expected = await simulate(1, mutableModel, ssaOptions, callbacks);
    const actual = await simulate(2, frozenModel, ssaOptions, callbacks);

    expect(actual.expandedReactions).toEqual(frozenModel.reactions);
    expect(actual.expandedReactions).not.toBe(frozenModel.reactions);
    expect(actual.expandedReactions?.[0]).not.toBe(frozenModel.reactions[0]);
    expect(actual.data).toEqual(expected.data);
    expect(actual.speciesData).toEqual(expected.speciesData);
    expect(trajectoryHash(actual)).toBe(trajectoryHash(expected));
    expect(frozenModel.parameters.k).toBe(0.1);
    expect(frozenModel.reactions[0].rateConstant).toBe(0.1);
  });

  it('keeps sequential parameter-change runs isolated with identical trajectory hashes', async () => {
    const baseModel = createExpandedModel();
    const sharedReactions = deepFreeze(baseModel.reactions);
    const highInitialModel = cloneModel(baseModel);
    highInitialModel.reactions = sharedReactions;
    highInitialModel.parameterChanges = [{
      parameter: 'initialA',
      value: 80,
      afterPhaseIndex: -1,
    }];
    const lowInitialModel = cloneModel(baseModel);
    lowInitialModel.reactions = sharedReactions;
    lowInitialModel.parameterChanges = [{
      parameter: 'initialA',
      value: 20,
      afterPhaseIndex: -1,
    }];
    const frozenHighInitialModel = deepFreeze(highInitialModel);
    const frozenLowInitialModel = deepFreeze(lowInitialModel);
    const highInputSnapshot = JSON.stringify(frozenHighInitialModel);
    const lowInputSnapshot = JSON.stringify(frozenLowInitialModel);

    const highInitial = await simulate(3, frozenHighInitialModel, ssaOptions, callbacks);
    const lowInitial = await simulate(4, frozenLowInitialModel, ssaOptions, callbacks);
    const lowInitialRepeat = await simulate(5, frozenLowInitialModel, ssaOptions, callbacks);

    expect(lowInitialRepeat.data).toEqual(lowInitial.data);
    expect(lowInitialRepeat.speciesData).toEqual(lowInitial.speciesData);
    expect(trajectoryHash(lowInitialRepeat)).toBe(trajectoryHash(lowInitial));
    expect(trajectoryHash(highInitial)).not.toBe(trajectoryHash(lowInitial));
    expect(highInitial.expandedReactions).toEqual(sharedReactions);
    expect(lowInitial.expandedReactions).toEqual(sharedReactions);
    expect(lowInitialRepeat.expandedReactions).toEqual(sharedReactions);
    expect(highInitial.expandedReactions).not.toBe(sharedReactions);
    expect(JSON.stringify(frozenHighInitialModel)).toBe(highInputSnapshot);
    expect(JSON.stringify(frozenLowInitialModel)).toBe(lowInputSnapshot);
    expect(frozenHighInitialModel.parameters.k).toBe(0.1);
    expect(frozenLowInitialModel.parameters.k).toBe(0.1);
    expect(frozenHighInitialModel.parameters.initialA).toBe(40);
    expect(frozenLowInitialModel.parameters.initialA).toBe(40);
    expect(sharedReactions[0].rateConstant).toBe(0.1);
  });

  it('keeps shared reactions immutable through a mixed ODE/NF workflow', async () => {
    const model = createExpandedModel();
    model.simulationPhases = [
      { method: 'ode', t_end: 0, n_steps: 1 },
      { method: 'nf', t_end: 1, n_steps: 1, continue: true },
    ];
    const frozenModel = deepFreeze(model);

    runNFsimSimulationMock.mockImplementation(async (phaseModel: BNGLModel) => {
      expect(phaseModel.reactions).toBe(frozenModel.reactions);
      expect(Object.isFrozen(phaseModel.reactions)).toBe(true);
      return {
        headers: ['time', 'A_total', 'B_total'],
        data: [
          { time: 0, A_total: 40, B_total: 0 },
          { time: 1, A_total: 36, B_total: 4 },
        ],
        speciesHeaders: ['A()', 'B()'],
        speciesData: [
          { time: 0, 'A()': 40, 'B()': 0 },
          { time: 1, 'A()': 36, 'B()': 4 },
        ],
      } satisfies SimulationResults;
    });

    const result = await simulate(6, frozenModel, {
      method: 'default',
      solver: 'rk4',
      t_end: 1,
      n_steps: 1,
      includeSpeciesData: true,
    }, callbacks);

    expect(runNFsimSimulationMock).toHaveBeenCalledOnce();
    expect(result.expandedReactions).toEqual(frozenModel.reactions);
    expect(result.expandedReactions).not.toBe(frozenModel.reactions);
    expect(frozenModel.reactions[0].rateConstant).toBe(0.1);
  });
});
