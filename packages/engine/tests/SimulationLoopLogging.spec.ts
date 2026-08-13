import { describe, expect, it, vi } from 'vitest';

import { simulate } from '../src/services/simulation/SimulationLoop';
import type { BNGLModel, SimulationOptions } from '../src/types';

describe('SimulationLoop production logging', () => {
  it('emits no informational or debug console output for a normal simulation', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const model: BNGLModel = {
      parameters: { k: 0.01 },
      moleculeTypes: [
        { name: 'FB', components: [] },
        { name: 'B', components: [] },
      ],
      compartments: [{ name: 'cell', dimension: 3, size: 2, resolvedVolume: 2 }],
      species: [
        { name: '@cell:FB()', initialConcentration: 100 },
        { name: '@cell:B()', initialConcentration: 0 },
      ],
      observables: [],
      reactions: [{
        reactants: ['@cell:FB()'],
        products: ['@cell:B()'],
        rate: 'k',
        rateConstant: 0.01,
      }],
      reactionRules: [],
      simulationPhases: [{ method: 'ssa', t_end: 0.1, n_steps: 2 }],
    };
    const options: SimulationOptions = {
      method: 'ssa',
      t_end: 0.1,
      n_steps: 2,
      seed: 1234,
      includeSpeciesData: false,
      includeExpandedNetwork: false,
    };

    try {
      const result = await simulate(1, model, options, {
        checkCancelled: () => {},
        postMessage: () => {},
      });

      expect(result.data.length).toBeGreaterThan(0);
      expect(logSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(debugSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      infoSpy.mockRestore();
      debugSpy.mockRestore();
    }
  });
});
