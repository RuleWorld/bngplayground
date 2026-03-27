import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { generateExpandedNetwork, simulate } from '@bngplayground/engine';
import { parseBNGL } from '../services/parseBNGL';
import { findRuleHubModelPath } from './helpers/rulehub';

const hasCvode = existsSync(join(process.cwd(), 'public', 'cvode.wasm'));
const modelPath = findRuleHubModelPath('eco_coevolution_host_parasite');
const maybeIt = hasCvode && modelPath ? it : it.skip;

describe('eco_coevolution_host_parasite CVODE regression', () => {
  maybeIt('does not emit catastrophic negative observables late in the trajectory', async () => {
    const code = readFileSync(modelPath!, 'utf8');
    const parsed = parseBNGL(code, { modelName: 'eco_coevolution_host_parasite' });
    const expanded = await generateExpandedNetwork(parsed as any, () => {}, () => {});
    const model = {
      ...parsed,
      reactions: expanded.reactions,
      species: expanded.species,
      concreteObservables: (expanded as any).concreteObservables,
    };

    const callbacks = { checkCancelled() {}, postMessage() {} };
    const results = await simulate(0, model as any, {
      method: 'ode',
      // Use auto so catastrophic CVODE divergence can fall back to Rosenbrock.
      solver: 'auto',
      t_end: 100,
      n_steps: 200,
    } as any, callbacks as any);

    expect(results.data).toHaveLength(201);

    for (const row of results.data as Array<Record<string, number>>) {
      for (const [key, value] of Object.entries(row)) {
        expect(Number.isFinite(value), `${key} should stay finite`).toBe(true);
        if (key !== 'time') {
          expect(value).toBeGreaterThan(-1e-8);
          expect(Math.abs(value)).toBeLessThan(1e6);
        }
      }
    }

    const last = results.data[results.data.length - 1] as Record<string, number>;
    expect(last.H_Lo).toBeGreaterThan(0);
    expect(last.P_Lo).toBeGreaterThan(0);
  });
});
