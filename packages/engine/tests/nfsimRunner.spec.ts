import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runNFsimSimulation } from '../src/services/simulation/nfsim/NFsimRunner';
import { runNFsim } from '../src/services/simulation/nfsim/NFsimLoader';
import { BNGLModel } from '../src/types';

// Mock the runNFsim loader
vi.mock('../src/services/simulation/nfsim/NFsimLoader', () => {
  return {
    runNFsim: vi.fn().mockImplementation(async (xml, options: { progressCallback?: (line: string) => void }) => {
      // Simulate calling the progress callback if provided
      if (options.progressCallback) {
        options.progressCallback('Sim time: 0.5');
      }
      return '# time ObsA\n0 100\n1.0 90';
    }),
  };
});

describe('NFsimRunner postMessage Resilience', () => {
  let baseModel: BNGLModel;

  beforeEach(() => {
    baseModel = {
      species: [{ name: 'A', initialConcentration: 100 }],
      reactions: [],
      observables: [{ name: 'ObsA', type: 'Molecules', pattern: 'A()' }],
      parameters: { k1: 0.1 },
      moleculeTypes: [{ name: 'A', components: [] }],
      reactionRules: [
        {
          name: 'rule1',
          reactants: ['A()'],
          products: ['A()'],
          rate: 'k1',
          isBidirectional: false,
        },
      ],
    };
  });

  it('should complete successfully even when globalThis.postMessage and self.postMessage are undefined', async () => {
    // 1. Temporarily save the original global postMessage / self
    const globalRecord = globalThis as unknown as Record<string, unknown>;
    const originalPostMessage = globalRecord.postMessage;
    const originalSelf = typeof self !== 'undefined' ? (self as unknown as Record<string, unknown>) : undefined;
    const originalSelfPostMessage = originalSelf?.postMessage;

    // 2. Remove or invalidate postMessage from globalThis
    delete globalRecord.postMessage;
    if (originalSelf !== undefined) {
      try {
        delete originalSelf.postMessage;
      } catch {
        originalSelf.postMessage = undefined;
      }
    }

    try {
      // 3. Execute the simulation. If there's an unguarded postMessage call, this will throw an error.
      const result = await runNFsimSimulation(baseModel, {
        t_end: 1.0,
        n_steps: 10,
        requireRuntime: true, // Force it to throw/fail on runtime error instead of falling back
      });

      // 4. Assert that it completed successfully and parsed the results
      expect(result).toBeDefined();
      expect(result.data).toHaveLength(2);
      expect(result.headers).toContain('ObsA');
    } finally {
      // Restore original state
      if (originalPostMessage !== undefined) {
        globalRecord.postMessage = originalPostMessage;
      }
      if (originalSelf !== undefined && originalSelfPostMessage !== undefined) {
        originalSelf.postMessage = originalSelfPostMessage;
      }
    }
  });

  it('retains result metadata by default and omits it without changing trajectory data', async () => {
    const defaultResult = await runNFsimSimulation(baseModel, {
      t_end: 1.0,
      n_steps: 10,
      requireRuntime: true,
    });
    const leanResult = await runNFsimSimulation(baseModel, {
      t_end: 1.0,
      n_steps: 10,
      requireRuntime: true,
      includeSpeciesData: false,
      includeExpandedNetwork: false,
    });
    const withoutSpeciesData = await runNFsimSimulation(baseModel, {
      t_end: 1.0,
      n_steps: 10,
      requireRuntime: true,
      includeSpeciesData: false,
    });
    const withoutExpandedNetwork = await runNFsimSimulation(baseModel, {
      t_end: 1.0,
      n_steps: 10,
      requireRuntime: true,
      includeExpandedNetwork: false,
    });

    expect(defaultResult).toHaveProperty('speciesHeaders');
    expect(defaultResult).toHaveProperty('speciesData');
    expect(defaultResult).toHaveProperty('expandedReactions');
    expect(defaultResult).toHaveProperty('expandedSpecies');

    expect(leanResult).not.toHaveProperty('speciesHeaders');
    expect(leanResult).not.toHaveProperty('speciesData');
    expect(leanResult).not.toHaveProperty('expandedReactions');
    expect(leanResult).not.toHaveProperty('expandedSpecies');

    expect(withoutSpeciesData).not.toHaveProperty('speciesHeaders');
    expect(withoutSpeciesData).not.toHaveProperty('speciesData');
    expect(withoutSpeciesData).toHaveProperty('expandedReactions');
    expect(withoutSpeciesData).toHaveProperty('expandedSpecies');

    expect(withoutExpandedNetwork).toHaveProperty('speciesHeaders');
    expect(withoutExpandedNetwork).toHaveProperty('speciesData');
    expect(withoutExpandedNetwork).not.toHaveProperty('expandedReactions');
    expect(withoutExpandedNetwork).not.toHaveProperty('expandedSpecies');

    for (const result of [leanResult, withoutSpeciesData, withoutExpandedNetwork]) {
      expect(result.headers).toEqual(defaultResult.headers);
      expect(result.data).toEqual(defaultResult.data);
    }

    for (const [, runtimeOptions] of vi.mocked(runNFsim).mock.calls) {
      expect(runtimeOptions).not.toHaveProperty('includeSpeciesData');
      expect(runtimeOptions).not.toHaveProperty('includeExpandedNetwork');
    }
  });
});
