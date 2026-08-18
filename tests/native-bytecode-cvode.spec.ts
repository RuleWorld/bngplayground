import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { generateExpandedNetwork, simulate } from '@bngplayground/engine';
import { parseBNGL } from '../services/parseBNGL';
import { findRuleHubModelPath } from './helpers/rulehub';

const hasCvode = existsSync(join(process.cwd(), 'public', 'cvode.wasm'));
const maybeIt = hasCvode ? it : it.skip;

describe('native CVODE bytecode', () => {
  maybeIt('matches fallback CVODE on the AB tutorial', async () => {
    const modelPath = findRuleHubModelPath('AB');
    if (!modelPath) {
      console.warn('Skipping test: AB model not found in RuleHub');
      return;
    }
    const code = readFileSync(modelPath, 'utf8');
    const parsed = parseBNGL(code);
    const expanded = await generateExpandedNetwork(parsed as any, () => {}, () => {});
    const model = {
      ...parsed,
      reactions: expanded.reactions,
      species: expanded.species,
      concreteObservables: (expanded as any).concreteObservables,
    };

    const callbacks = { checkCancelled() {}, postMessage() {} };
    const baseOptions = {
      method: 'ode',
      solver: 'auto',
      t_end: 10,
      n_steps: 200,
    } as const;

    const nativeResults = await simulate(1, model as any, {
      ...baseOptions,
      enableNativeBytecode: true,
    } as any, callbacks as any);

    const fallbackResults = await simulate(2, model as any, {
      ...baseOptions,
      disableNativeBytecode: true,
    } as any, callbacks as any);

    expect(nativeResults.data).toHaveLength(201);
    expect(fallbackResults.data).toHaveLength(201);

    const nativeLast = nativeResults.data[nativeResults.data.length - 1] as Record<string, number>;
    const fallbackLast = fallbackResults.data[fallbackResults.data.length - 1] as Record<string, number>;

    expect(nativeLast.time).toBeCloseTo(10, 12);
    expect(nativeLast.A).toBeCloseTo(fallbackLast.A, 10);
    expect(nativeLast.B).toBeCloseTo(fallbackLast.B, 10);
    expect(nativeLast.C).toBeCloseTo(fallbackLast.C, 10);
  });
});