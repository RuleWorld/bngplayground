import { describe, it, expect } from 'vitest';
import { buildMolecularGraph } from '../../services/igraphNetworkAnalysis';
import type { BNGLModel } from '../../packages/engine/src/types';

describe('buildMolecularGraph', () => {
  it('should build a molecular graph linking molecule types found in the same pattern', () => {
    const model = {
      moleculeTypes: [
        { name: 'A', components: [] },
        { name: 'B', components: [] },
        { name: 'C', components: [] }
      ],
      reactionRules: [
        {
          reactants: ['A(b!1).B(a!1)'], // A and B are linked
          products: ['A(b)', 'B(a)'],
          rate: 'k1',
          isBidirectional: false
        },
        {
          reactants: ['A(c!1).C(a!1)'], // A and C are linked
          products: ['A(c)', 'C(a)'],
          rate: 'k2',
          isBidirectional: false
        }
      ],
      reactions: [],
      species: [],
      parameters: {},
      observables: []
    } as unknown as BNGLModel;

    const payload = buildMolecularGraph(model);

    expect(payload.graphType).toBe('molecular');
    expect(payload.directed).toBe(false);
    expect(payload.nodeLabels).toEqual(['A', 'B', 'C']);

    // A=0, B=1, C=2
    // Expect edge 0-1 and 0-2
    expect(payload.edges).toHaveLength(2);
    expect(payload.edges).toEqual(
      expect.arrayContaining([
        { from: 0, to: 1 },
        { from: 0, to: 2 }
      ])
    );
  });

  it('should also include links from expanded reactions', () => {
    const model = {
      moleculeTypes: [
        { name: 'X', components: [] },
        { name: 'Y', components: [] }
      ],
      reactionRules: [],
      reactions: [
        {
          reactants: ['X(y!1).Y(x!1)'], // X and Y are linked
          products: ['X(y)', 'Y(x)'],
          rateConstant: 1
        }
      ],
      species: [],
      parameters: {},
      observables: []
    } as unknown as BNGLModel;

    const payload = buildMolecularGraph(model);
    expect(payload.nodeLabels).toEqual(['X', 'Y']);
    expect(payload.edges).toHaveLength(1);
    expect(payload.edges).toEqual(
      expect.arrayContaining([
        { from: 0, to: 1 }
      ])
    );
  });

  it('should ignore duplicate links across multiple rules', () => {
    const model = {
      moleculeTypes: [
        { name: 'A', components: [] },
        { name: 'B', components: [] }
      ],
      reactionRules: [
        { reactants: ['A(b!1).B(a!1)'], products: [], rate: 'k', isBidirectional: false },
        { reactants: ['B(a!1).A(b!1)'], products: [], rate: 'k', isBidirectional: false } // duplicate
      ],
      reactions: [],
      species: [],
      parameters: {},
      observables: []
    } as unknown as BNGLModel;

    const payload = buildMolecularGraph(model);
    expect(payload.edges).toHaveLength(1);
    expect(payload.edges).toEqual([{ from: 0, to: 1 }]);
  });

  it('should handle complex patterns spanning multiple molecule types', () => {
    const model = {
      moleculeTypes: [
        { name: 'M1', components: [] },
        { name: 'M2', components: [] },
        { name: 'M3', components: [] },
        { name: 'M4', components: [] }
      ],
      reactionRules: [
        {
          reactants: ['M1(a!1).M2(b!1,c!2).M3(d!2)'], // M1, M2, M3 are fully connected
          products: [],
          rate: 'k1',
          isBidirectional: false
        }
      ],
      reactions: [],
      species: [],
      parameters: {},
      observables: []
    } as unknown as BNGLModel;

    const payload = buildMolecularGraph(model);
    expect(payload.edges).toHaveLength(3); // (0,1), (0,2), (1,2)
    expect(payload.edges).toEqual(
      expect.arrayContaining([
        { from: 0, to: 1 },
        { from: 0, to: 2 },
        { from: 1, to: 2 }
      ])
    );
  });
});
