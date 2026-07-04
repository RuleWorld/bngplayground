import { describe, it, expect } from 'vitest';
import type { BNGLModel } from '../types';
import {
  applyParameterOverrides,
  expressionReferencesAny,
} from '../services/workerHandlers/applyParameterOverrides';

/**
 * A0/B0 are initial-value parameters: they set seed-species amounts through the
 * species' initialExpression, not the species name. These tests pin the fix that
 * refreshes those baked initial amounts when such a parameter is overridden — the
 * bug that made A0/B0 look insensitive (blank rows) in the FIM correlation heatmap.
 */

function makeModel(): BNGLModel {
  return {
    parameters: { A0: 100, B0: 50, ka: 1.0, kd: 0.1 },
    functions: [],
    species: [
      { name: 'A()', initialConcentration: 100, initialExpression: 'A0' },
      { name: 'B()', initialConcentration: 50, initialExpression: 'B0' },
      { name: 'C()', initialConcentration: 0, initialExpression: '0' },
    ],
    reactions: [
      { reactants: ['A()', 'B()'], products: ['C()'], rate: 'ka', rateConstant: 1.0 },
      { reactants: ['C()'], products: ['A()', 'B()'], rate: 'kd', rateConstant: 0.1 },
    ],
  } as unknown as BNGLModel;
}

const speciesAmount = (m: BNGLModel, name: string) =>
  m.species.find((s) => s.name === name)!.initialConcentration;

describe('applyParameterOverrides — seed-amount parameters', () => {
  it('refreshes the initial amount when an initial-value parameter is overridden', () => {
    const out = applyParameterOverrides(makeModel(), { A0: 110 });
    expect(speciesAmount(out, 'A()')).toBeCloseTo(110, 9);
    expect(out.parameters.A0).toBe(110);
  });

  it('only touches the species that depend on the overridden parameter', () => {
    const out = applyParameterOverrides(makeModel(), { B0: 60 });
    expect(speciesAmount(out, 'B()')).toBeCloseTo(60, 9);
    expect(speciesAmount(out, 'A()')).toBe(100); // A0 unchanged -> A() untouched
    expect(speciesAmount(out, 'C()')).toBe(0);
  });

  it('scales compound initial expressions, preserving the original factor', () => {
    const m = makeModel();
    m.species = [
      { name: 'D()', initialConcentration: 200, initialExpression: 'A0*2' },
    ] as BNGLModel['species'];
    const out = applyParameterOverrides(m, { A0: 110 });
    expect(speciesAmount(out, 'D()')).toBeCloseTo(220, 9);
  });

  it('preserves a unit-normalization factor baked into the original amount', () => {
    // Suppose the built amount was half the raw expression value (e.g. a scaling
    // applied at build time): C0 = 0.5 * A0. Overriding A0 should keep that 0.5.
    const m = makeModel();
    m.species = [
      { name: 'A()', initialConcentration: 50, initialExpression: 'A0' }, // baked 50 for A0=100
    ] as BNGLModel['species'];
    const out = applyParameterOverrides(m, { A0: 110 });
    expect(speciesAmount(out, 'A()')).toBeCloseTo(55, 9); // 0.5 * 110
  });
});

describe('applyParameterOverrides — rate constants and direct overrides', () => {
  it('updates a reaction rate constant when its rate parameter is overridden', () => {
    const out = applyParameterOverrides(makeModel(), { kd: 0.2 });
    const rev = out.reactions.find((r) => r.rate === 'kd')!;
    expect(rev.rateConstant).toBeCloseTo(0.2, 9);
    // A rate-only override does not move initial amounts.
    expect(speciesAmount(out, 'A()')).toBe(100);
  });

  it('still supports overriding a species amount directly by species name', () => {
    const out = applyParameterOverrides(makeModel(), { 'A()': 42 });
    expect(speciesAmount(out, 'A()')).toBe(42);
  });

  it('returns the cached model unchanged when there are no overrides', () => {
    const cached = makeModel();
    expect(applyParameterOverrides(cached, {})).toBe(cached);
  });
});

describe('expressionReferencesAny', () => {
  it('matches whole identifier tokens only', () => {
    expect(expressionReferencesAny('A0', new Set(['A0']))).toBe(true);
    expect(expressionReferencesAny('A0*2+B0', new Set(['B0']))).toBe(true);
    expect(expressionReferencesAny('B0', new Set(['A0']))).toBe(false);
    expect(expressionReferencesAny('A01', new Set(['A0']))).toBe(false); // no partial match
    expect(expressionReferencesAny('0', new Set(['A0']))).toBe(false);
    expect(expressionReferencesAny('A0', new Set())).toBe(false);
  });
});
