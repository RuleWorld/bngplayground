import { readFileSync, existsSync } from 'fs';
import { parseBNGL } from '../../services/parseBNGL';
import { simulate } from '@bngplayground/engine';
import { SimulationOptions } from '../../types';
import { describe, it, expect } from 'vitest';
import { findRuleHubModelPath } from '../helpers/rulehub';

describe('stat3-mediated-transcription simulation parity', () => {
  it('should produce non-zero Total_pSTAT3 at early timepoints', async (ctx) => {
    const file = findRuleHubModelPath('stat3-mediated-transcription');
    if (!file || !existsSync(file)) {
      ctx.skip();
      return;
    }
    const code = readFileSync(file, 'utf8');
    const model = parseBNGL(code);

    const options: SimulationOptions = { method: 'ode', t_end: 1, n_steps: 2 }; // tiny run to check early behavior

    const { generateExpandedNetwork } = await import('../../services/simulation/NetworkExpansion');
    const expanded = await generateExpandedNetwork(model, () => {}, (p: any) => {});

    const results = await simulate(0, expanded, options, {
      checkCancelled: () => {},
      postMessage: () => {}
    });

    // Find the row for time 0.5 (t_end/n_steps gives steps=2 -> times 0, 0.5, 1?)
    const row = results.data.find(r => Math.abs(r.time - 0.5) < 1e-6) || results.data[1];
    console.log('Row 1:', row);
    expect(row['Total_pSTAT3']).toBeGreaterThan(0);
  }, 20000);
});
