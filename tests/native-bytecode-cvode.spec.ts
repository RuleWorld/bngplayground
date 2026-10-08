import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { generateExpandedNetwork, simulate } from '@bngplayground/engine';
import { parseBNGL } from '../services/parseBNGL';
import { findRuleHubModelPath } from './helpers/rulehub';
import type { BNGLModel, SimulationOptions } from '../packages/engine/src/types';

const hasCvode = existsSync(join(process.cwd(), 'public', 'cvode.wasm'));
const abPath = findRuleHubModelPath('AB');
const maybeAbIt = (hasCvode && abPath) ? it : it.skip;
const maybeCvodeIt = hasCvode ? it : it.skip;

describe('native CVODE bytecode', () => {
  maybeAbIt('matches fallback CVODE on the AB tutorial', async () => {
    const code = readFileSync(abPath!, 'utf8');
    const parsed = parseBNGL(code);
    const expanded = await generateExpandedNetwork(parsed, () => {}, () => {});
    const model: BNGLModel = {
      ...parsed,
      reactions: expanded.reactions,
      species: expanded.species,
      concreteObservables: expanded.concreteObservables,
    };

    const callbacks = { checkCancelled() {}, postMessage() {} };
    const baseOptions = {
      method: 'ode',
      solver: 'auto',
      t_end: 10,
      n_steps: 200,
    } as const;

    const nativeResults = await simulate(1, model, {
      ...baseOptions,
      enableNativeBytecode: true,
    } as SimulationOptions & { enableNativeBytecode: boolean }, callbacks);

    const fallbackResults = await simulate(2, model, {
      ...baseOptions,
      disableNativeBytecode: true,
    } as SimulationOptions & { disableNativeBytecode: boolean }, callbacks);

    expect(nativeResults.data).toHaveLength(201);
    expect(fallbackResults.data).toHaveLength(201);

    const nativeLast = nativeResults.data[nativeResults.data.length - 1] as Record<string, number>;
    const fallbackLast = fallbackResults.data[fallbackResults.data.length - 1] as Record<string, number>;

    expect(nativeLast.time).toBeCloseTo(10, 12);
    expect(nativeLast.A).toBeCloseTo(fallbackLast.A, 10);
    expect(nativeLast.B).toBeCloseTo(fallbackLast.B, 10);
    expect(nativeLast.C).toBeCloseTo(fallbackLast.C, 10);
  });
  maybeCvodeIt('routes observable-dependent sparse requests to dense CVODE and matches dense results', async () => {
    const code = `
begin parameters
  k 0.05
end parameters
begin molecule types
  A()
  B()
end molecule types
begin seed species
  A() 20
  B() 0
end seed species
begin observables
  Molecules A_total A()
end observables
begin reaction rules
  A() -> B() k*A_total
end reaction rules
end model
`;
    const parsed = parseBNGL(code);
    const expanded = await generateExpandedNetwork(parsed, () => {}, () => {});
    const model: BNGLModel = {
      ...parsed,
      reactions: expanded.reactions,
      species: expanded.species,
      concreteObservables: expanded.concreteObservables,
    };
    expect(model.reactions.some((reaction) => reaction.isFunctionalRate)).toBe(true);

    const callbacks = { checkCancelled() {}, postMessage() {} };
    const options = { method: 'ode', t_end: 2, n_steps: 20, adaptiveCvodeTuning: false, collectSolverStats: true } as const;
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const sparseRequest = await simulate(3, model, {
        ...options,
        solver: 'cvode_sparse',
        enableNativeBytecode: true,
      } as SimulationOptions & { enableNativeBytecode: boolean }, callbacks);
      const dense = await simulate(4, model, {
        ...options,
        solver: 'cvode',
        enableNativeBytecode: true,
      } as SimulationOptions & { enableNativeBytecode: boolean }, callbacks);

      expect(warning.mock.calls.some(([message]) => String(message).includes('functional-rate dependencies') && String(message).includes('dense "cvode"'))).toBe(true);
      expect(sparseRequest.data).toHaveLength(dense.data.length);
      const sparseSteps = sparseRequest.solverStats?.[0]?.nsteps;
      const denseSteps = dense.solverStats?.[0]?.nsteps;
      if (typeof sparseSteps !== 'number' || typeof denseSteps !== 'number' || sparseSteps <= 0 || denseSteps <= 0) {
        throw new Error('Expected positive CVODE internal step counts for both sparse-request and dense trajectories.');
      }
      expect(Math.max(sparseSteps, denseSteps) / Math.min(sparseSteps, denseSteps)).toBeLessThanOrEqual(3);
      for (let i = 0; i < dense.data.length; i++) {
        const sparseRow = sparseRequest.data[i] as Record<string, number>;
        const denseRow = dense.data[i] as Record<string, number>;
        for (const key of Object.keys(denseRow)) {
          expect(sparseRow[key]).toBeCloseTo(denseRow[key], 8);
        }
      }
    } finally {
      warning.mockRestore();
    }
  });
  maybeCvodeIt('retains the native sparse analytical Jacobian for mass-action reactions', async () => {
    const code = `
begin parameters
  k 0.2
end parameters
begin molecule types
  A()
  B()
end molecule types
begin seed species
  A() 10
  B() 0
end seed species
begin reaction rules
  A() -> B() k
end reaction rules
end model
`;
    const parsed = parseBNGL(code);
    const expanded = await generateExpandedNetwork(parsed, () => {}, () => {});
    const model: BNGLModel = {
      ...parsed,
      reactions: expanded.reactions,
      species: expanded.species,
      concreteObservables: expanded.concreteObservables,
    };
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await simulate(7, model, {
        method: 'ode',
        solver: 'cvode_sparse',
        t_end: 1,
        n_steps: 10,
        adaptiveCvodeTuning: false,
        enableNativeBytecode: true,
      } as SimulationOptions & { enableNativeBytecode: boolean }, {
        checkCancelled() {},
        postMessage() {},
      });
      expect(result.data).toHaveLength(11);
      expect(warning.mock.calls.some(([message]) => String(message).includes('functional-rate dependencies'))).toBe(false);
    } finally {
      warning.mockRestore();
    }
  });


  maybeCvodeIt('preserves reaction degeneracy across a parameter change with native bytecode enabled', async () => {
    const code = `
begin parameters
  k 0.1
end parameters
begin molecule types
  A()
  B()
end molecule types
begin seed species
  A() 10
  B() 0
end seed species
begin reaction rules
  A() -> B() k
end reaction rules
end model
`;
    const callbacks = { checkCancelled() {}, postMessage() {} };
    const run = async (enableNativeBytecode: boolean) => {
      const parsed = parseBNGL(code);
      const expanded = await generateExpandedNetwork(parsed, () => {}, () => {});
      const model: BNGLModel = {
        ...parsed,
        reactions: expanded.reactions.map((reaction) => ({ ...reaction, degeneracy: 2 })),
        species: expanded.species,
        concreteObservables: expanded.concreteObservables,
        simulationPhases: [
          { method: 'ode', t_end: 1, n_steps: 10 },
          { method: 'ode', t_end: 2, n_steps: 10, continue: true },
        ],
        parameterChanges: [{ parameter: 'k', value: 0.2, afterPhaseIndex: 0 }],
      };
      return simulate(enableNativeBytecode ? 5 : 6, model, {
        method: 'ode',
        solver: 'cvode',
        t_end: 2,
        n_steps: 20,
        adaptiveCvodeTuning: false,
        enableNativeBytecode,
        disableNativeBytecode: !enableNativeBytecode,
      } as SimulationOptions & { enableNativeBytecode: boolean; disableNativeBytecode: boolean }, callbacks);
    };

    const native = await run(true);
    const javascript = await run(false);
    expect(native.data).toHaveLength(javascript.data.length);
    for (let i = 0; i < javascript.data.length; i++) {
      const nativeRow = native.data[i] as Record<string, number>;
      const javascriptRow = javascript.data[i] as Record<string, number>;
      for (const key of Object.keys(javascriptRow)) {
        expect(nativeRow[key]).toBeCloseTo(javascriptRow[key], 9);
      }
    }
  });

});

