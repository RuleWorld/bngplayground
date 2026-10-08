import { describe, expect, it } from 'vitest';
import { updatePreparedModel, findSeedSpeciesForParameter } from '../src/utils/preparedModel';
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

  it('overrides a literal initial amount or symbolic seed directly', () => {
    const model = makeModel();
    model.species.push({ name: 'B()', initialConcentration: 3, initialExpression: '3' });
    const out = updatePreparedModel(model, { 'A()': 7, 'B()': 12 });
    expect(out.model.species[0].initialConcentration).toBe(7);
    expect(out.model.species[0].initialExpression).toBe('7');
    expect(out.model.species[1].initialConcentration).toBe(12);
    expect(out.model.species[1].initialExpression).toBe('12');
    expect(model.species[0].initialExpression).toBe('total');
  });

  it('discovers all initial dependencies through expressions, aliases and custom functions', () => {
    const model = makeModel();
    model.parameters = { L0: 10, R0: 1, dose: 5, multiplier: 2, seed: 10, k: 1 };
    model.paramExpressions = { seed: 'dose * multiplier' };
    model.functions = [{ name: 'extraSeed', args: [], expression: 'R0 * 3' }];
    model.species = [
      { name: 'L', initialConcentration: 10, initialExpression: 'L0' },
      { name: 'R', initialConcentration: 1, initialExpression: 'R0' },
      { name: 'X', initialConcentration: 20, initialExpression: '2 * seed' },
      { name: 'Y', initialConcentration: 3, initialExpression: 'extraSeed()' },
      { name: 'literal', initialConcentration: 5, initialExpression: '5' },
    ];
    expect(findSeedSpeciesForParameter(model, 'L0')).toEqual(['L']);
    expect(findSeedSpeciesForParameter(model, 'R0')).toEqual(['R', 'Y']);
    expect(findSeedSpeciesForParameter(model, 'dose')).toEqual(['X']);
    expect(findSeedSpeciesForParameter(model, 'multiplier')).toEqual(['X']);
    expect(findSeedSpeciesForParameter(model, 'k')).toEqual([]);
  });

  it('retains compound seed expressions under parameter scans', () => {
    const model = makeModel();
    model.species[0] = { name: 'A()', initialConcentration: 20, initialExpression: '2 * total' };
    const out = updatePreparedModel(model, { total: 15 });
    expect(out.model.species[0].initialConcentration).toBe(30);
    expect(out.model.species[0].initialExpression).toBe('2 * total');
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
