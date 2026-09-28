import { describe, expect, it } from 'vitest';
import { updatePreparedModel } from '../src/utils/preparedModel';
import type { BNGLModel } from '../src/types';

function makeModel(): BNGLModel {
  return {
    parameters: { k: 2, k2: 4, total: 10 },
    paramExpressions: { k2: '2*k' },
    moleculeTypes: [],
    species: [{ name: 'A()', initialConcentration: 10, initialExpression: 'total' }],
    observables: [],
    reactions: [{ reactants: ['A()'], products: [], rate: 'k2', rateConstant: 4 }],
    reactionRules: [],
  };
}

describe('prepared model updates', () => {
  it('refreshes dependent parameters and symbolic reaction rates without changing topology', () => {
    const model = makeModel();
    const result = updatePreparedModel(model, { k: 3 });

    expect(result.impact.affectedParameters).toContain('k2');
    expect(result.impact.affectsKinetics).toBe(true);
    expect(result.impact.topologyMayChange).toBe(false);
    expect(result.ratesChanged).toBe(true);
    expect(result.model.parameters.k2).toBe(6);
    expect(result.model.reactions[0].rateConstant).toBe(6);
    expect(model.parameters.k2).toBe(4);
  });

  it('refreshes seed expressions supplied outside the model and reports solver reset needs', () => {
    const model = makeModel();
    delete model.species[0].initialExpression;
    const seedExpressions = new Map([['A()', 'total']]);
    const result = updatePreparedModel(model, { total: 20 }, { seedExpressions });

    expect(result.impact.affectsInitialState).toBe(true);
    expect(result.impact.topologyMayChange).toBe(false);
    expect(result.initialStateChanged).toBe(true);
    expect(result.solverReinitRequired).toBe(true);
    expect(result.model.species[0].initialConcentration).toBe(20);
  });

  it('follows custom-function dependencies when refreshing dependent parameters', () => {
    const model = makeModel();
    model.functions = [{ name: 'scaledK', args: [], expression: 'k * 3' }];
    model.paramExpressions = { k2: 'scaledK()' };
    const result = updatePreparedModel(model, { k: 2 });
    expect(result.impact.affectedParameters).toContain('k2');
    expect(result.model.parameters.k2).toBe(6);
    expect(result.model.reactions[0].rateConstant).toBe(6);
  });

  it('mutates the supplied prepared object only when requested', () => {
    const model = makeModel();
    const result = updatePreparedModel(model, { k: 5 }, { mutate: true });
    expect(result.model).toBe(model);
    expect(model.parameters.k2).toBe(10);
    expect(model.reactions[0].rateConstant).toBe(10);
  });

  it('refreshes a changed compartment size and reports volume invalidation', () => {
    const model = makeModel();
    model.compartments = [{ name: 'cell', dimension: 3, size: 1 }];
    const result = updatePreparedModel(model, { cell: 2 });
    expect(result.impact.affectsVolumes).toBe(true);
    expect(result.volumesChanged).toBe(true);
    expect(result.solverReinitRequired).toBe(true);
    expect(result.model.compartments?.[0].resolvedVolume).toBe(2);
  });

  it('does not let an unsafe compartment name alter the parameter object prototype', () => {
    const model = makeModel();
    model.compartments = [{ name: '__proto__', dimension: 3, size: 1 }];
    model.paramExpressions = { __compartment___proto____: 'k' };
    const result = updatePreparedModel(model, { k: 3 });

    expect(Object.getPrototypeOf(result.model.parameters)).toBe(Object.prototype);
    expect(Object.hasOwn(result.model.parameters, '__proto__')).toBe(false);
  });
});
