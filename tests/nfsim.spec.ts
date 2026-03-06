import { describe, it, expect, afterEach } from 'vitest';

import type { BNGLModel } from '../types';
import { runNFsimSimulation } from '@bngplayground/engine';
import { NFsimValidator, ValidationErrorType } from '@bngplayground/engine';
import { NFsimResultAdapter } from '@bngplayground/engine';

const minimalModel = (overrides: Partial<BNGLModel> = {}): BNGLModel => ({
  name: 'minimal',
  parameters: {},
  moleculeTypes: [],
  species: [{ name: 'A()', initialConcentration: 1 }],
  observables: [],
  reactions: [],
  reactionRules: [],
  ...overrides
});

afterEach(() => {
  const globalAny = globalThis as unknown as { __nfsimRuntime?: unknown };
  delete globalAny.__nfsimRuntime;
});

describe('NFsimValidator', () => {
  it('flags TotalRate modifiers and observable-dependent rates', () => {
    const model = minimalModel({
      observables: [{ name: 'ObsA', type: 'molecules', pattern: 'A()' }],
      reactionRules: [
        { reactants: ['A()'], products: ['A()'], rate: 'TotalRate(k1)', isBidirectional: false },
        { reactants: ['A()'], products: ['A()'], rate: 'ObsA * 2', isBidirectional: false }
      ]
    });

    const result = NFsimValidator.validateForNFsim(model);

    const types = result.errors.map((e) => e.type);
    expect(types).toContain(ValidationErrorType.TOTAL_RATE_MODIFIER);
    expect(types).toContain(ValidationErrorType.OBSERVABLE_DEPENDENT_RATE);
  });
});

describe('NFsimResultAdapter', () => {
  it('maps O1 headers to observable names', () => {
    const model = minimalModel({
      observables: [{ name: 'ObsA', type: 'molecules', pattern: 'A()' }]
    });

    const gdat = [
      'time\tO1',
      '0\t1',
      '1\t2'
    ].join('\n');

    const result = NFsimResultAdapter.adaptGdatToSimulationResults(gdat, model);

    const last = result.data[result.data.length - 1];
    expect(result.headers).toEqual(['time', 'ObsA']);
    expect(last?.ObsA).toBe(2);
  });
});

describe('runNFsimSimulation', () => {
  it('throws when runtime is required but missing', async () => {
    const model = minimalModel();

    await expect(
      runNFsimSimulation(model, { t_end: 1, n_steps: 1, requireRuntime: true })
    ).rejects.toThrow('NFsim WASM runtime not available');
  });

  it('uses the NFsim runtime when available', async () => {
    const globalAny = globalThis as unknown as { __nfsimRuntime?: { run: (xml: string) => string } };
    globalAny.__nfsimRuntime = {
      run: () => [
        'time\tO1',
        '0\t1',
        '1\t3'
      ].join('\n')
    };

    const model = minimalModel({
      observables: [{ name: 'ObsA', type: 'molecules', pattern: 'A()' }]
    });

    const result = await runNFsimSimulation(model, { t_end: 1, n_steps: 1 });

    const last = result.data[result.data.length - 1];
    expect(result.headers).toEqual(['time', 'ObsA']);
    expect(last?.ObsA).toBe(3);
  });

  it('falls back to SSA when runtime is missing', async () => {
    const model = minimalModel();
    const result = await runNFsimSimulation(model, { t_end: 1, n_steps: 1 });

    expect(result.headers[0]).toBe('time');
    expect(result.data.length).toBeGreaterThan(0);
  });
});
