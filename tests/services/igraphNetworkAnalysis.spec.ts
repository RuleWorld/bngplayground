import { describe, it, expect } from 'vitest';
import { buildReactionGraph, buildMolecularGraph, buildRegulatoryGraph, buildGraphPayload } from '../../services/igraphNetworkAnalysis';
import type { BNGLModel } from '../../types';

describe('igraphNetworkAnalysis', () => {

  const createMockModel = (overrides: Partial<BNGLModel> = {}): BNGLModel => ({
    parameters: {},
    moleculeTypes: [],
    species: [],
    observables: [],
    reactions: [],
    reactionRules: [],
    ...overrides
  });

  describe('buildReactionGraph', () => {
    it('should correctly build a reaction graph with simple A -> B', () => {
      const model = createMockModel({
        species: [
          { name: 'A', initialConcentration: 0 },
          { name: 'B', initialConcentration: 0 }
        ],
        reactions: [
          {
            reactants: ['A'],
            products: ['B'],
            rate: 'k',
            rateConstant: 1
          }
        ]
      });

      const payload = buildReactionGraph(model);

      expect(payload.graphType).toBe('reaction');
      expect(payload.directed).toBe(true);
      expect(payload.nodeLabels).toEqual(['A', 'B']);

      // Node 'A' is index 0, 'B' is index 1
      expect(payload.edges).toEqual([{ from: 0, to: 1 }]);
    });

    it('should ignore self-loops', () => {
      const model = createMockModel({
        species: [
          { name: 'A', initialConcentration: 0 },
        ],
        reactions: [
          {
            reactants: ['A'],
            products: ['A'],
            rate: 'k',
            rateConstant: 1
          }
        ]
      });

      const payload = buildReactionGraph(model);
      expect(payload.edges).toEqual([]);
    });

    it('should handle complex reactions A + B -> C', () => {
      const model = createMockModel({
        species: [
          { name: 'A', initialConcentration: 0 },
          { name: 'B', initialConcentration: 0 },
          { name: 'C', initialConcentration: 0 }
        ],
        reactions: [
          {
            reactants: ['A', 'B'],
            products: ['C'],
            rate: 'k',
            rateConstant: 1
          }
        ]
      });

      const payload = buildReactionGraph(model);

      expect(payload.nodeLabels).toEqual(['A', 'B', 'C']);
      // A (0) -> C (2) and B (1) -> C (2)
      expect(payload.edges).toContainEqual({ from: 0, to: 2 });
      expect(payload.edges).toContainEqual({ from: 1, to: 2 });
      expect(payload.edges.length).toBe(2);
    });

    it('should ignore unknown species in reactants or products', () => {
      const model = createMockModel({
        species: [
          { name: 'A', initialConcentration: 0 },
          { name: 'B', initialConcentration: 0 }
        ],
        reactions: [
          {
            reactants: ['A', 'Unknown1'],
            products: ['B', 'Unknown2'],
            rate: 'k',
            rateConstant: 1
          }
        ]
      });

      const payload = buildReactionGraph(model);

      expect(payload.nodeLabels).toEqual(['A', 'B']);
      expect(payload.edges).toEqual([{ from: 0, to: 1 }]);
    });
  });

  describe('buildMolecularGraph', () => {
    it('should extract molecular contact map from rules', () => {
      const model = createMockModel({
        moleculeTypes: [
          { name: 'A', components: [] },
          { name: 'B', components: [] },
          { name: 'C', components: [] }
        ],
        reactionRules: [
          {
            reactants: ['A(b!1).B(a!1,c~p)'],
            products: ['A(b)+B(a,c~p)'],
            rate: 'k',
            isBidirectional: false
          }
        ]
      });

      const payload = buildMolecularGraph(model);

      expect(payload.graphType).toBe('molecular');
      expect(payload.directed).toBe(false);
      expect(payload.nodeLabels).toEqual(['A', 'B', 'C']);

      // A and B appear together in pattern, so there's an edge between them (0-1)
      expect(payload.edges).toEqual([{ from: 0, to: 1 }]);
    });

    it('should build a molecular graph linking molecule types found in the same pattern', () => {
      const model = createMockModel({
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
        ]
      });

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
      const model = createMockModel({
        moleculeTypes: [
          { name: 'X', components: [] },
          { name: 'Y', components: [] }
        ],
        reactions: [
          {
            reactants: ['X(y!1).Y(x!1)'], // X and Y are linked
            products: ['X(y)', 'Y(x)'],
            rateConstant: 1
          }
        ]
      });

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
      const model = createMockModel({
        moleculeTypes: [
          { name: 'A', components: [] },
          { name: 'B', components: [] }
        ],
        reactionRules: [
          { reactants: ['A(b!1).B(a!1)'], products: [], rate: 'k', isBidirectional: false },
          { reactants: ['B(a!1).A(b!1)'], products: [], rate: 'k', isBidirectional: false } // duplicate
        ]
      });

      const payload = buildMolecularGraph(model);
      expect(payload.edges).toHaveLength(1);
      expect(payload.edges).toEqual([{ from: 0, to: 1 }]);
    });

    it('should handle complex patterns spanning multiple molecule types', () => {
      const model = createMockModel({
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
        ]
      });

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

  describe('buildRegulatoryGraph', () => {
    it('should extract regulatory influence graph', () => {
      const model = createMockModel({
        moleculeTypes: [
          { name: 'Kinase', components: [] },
          { name: 'Substrate', components: [] }
        ],
        reactionRules: [
          {
            // Kinase is on LHS only (well, usually it's both sides for catalyst, but for testing)
            // Let's make an explicit rule: Kinase() -> Substrate()
            reactants: ['Kinase()'],
            products: ['Substrate()'],
            rate: 'k',
            isBidirectional: false
          }
        ]
      });

      const payload = buildRegulatoryGraph(model);

      expect(payload.graphType).toBe('regulatory');
      expect(payload.directed).toBe(true);
      expect(payload.nodeLabels).toEqual(['Kinase', 'Substrate']);

      // Kinase (0) -> Substrate (1)
      expect(payload.edges).toEqual([{ from: 0, to: 1 }]);
    });
  });

  describe('buildGraphPayload dispatch', () => {
    it('should dispatch to reaction graph', () => {
      const model = createMockModel({
        species: [{ name: 'A', initialConcentration: 0 }, { name: 'B', initialConcentration: 0 }],
        reactions: [{ reactants: ['A'], products: ['B'], rate: 'k', rateConstant: 1 }]
      });
      const payload = buildGraphPayload(model, 'reaction');
      expect(payload.graphType).toBe('reaction');
    });

    it('should throw if reaction requested without reactions', () => {
      const model = createMockModel({ species: [] });
      expect(() => buildGraphPayload(model, 'reaction')).toThrow(/requires network expansion/);
    });

    it('should dispatch to molecular graph', () => {
      const model = createMockModel({
        moleculeTypes: [{ name: 'A', components: [] }]
      });
      const payload = buildGraphPayload(model, 'molecular');
      expect(payload.graphType).toBe('molecular');
    });

    it('should throw if molecular requested without molecule types', () => {
      const model = createMockModel({ moleculeTypes: [] });
      expect(() => buildGraphPayload(model, 'molecular')).toThrow(/requires at least one molecule type/);
    });
  });
});
