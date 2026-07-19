import { describe, expect, it } from 'vitest';
import { buildDirectedReactionGraph } from '../../src/services/patterns/reactionGraph';
import { extractMoleculeNames } from '../../src/services/patterns/patternTokens';

describe('buildDirectedReactionGraph', () => {
    it('builds a directed reactant->product graph over species (identity nodes)', () => {
        const edges = buildDirectedReactionGraph([
            { reactants: ['S1'], products: ['S2'] },
            { reactants: ['S2'], products: ['S1', 'S3'] },
        ]);
        expect(edges.map((e) => `${e.from}->${e.to}`).sort()).toEqual(['S1->S2', 'S2->S1', 'S2->S3']);
        expect(edges.every((e) => e.label === undefined)).toBe(true);
    });

    it('extracts molecule nodes and applies rule labels', () => {
        const edges = buildDirectedReactionGraph(
            [{ name: 'bind', reactants: ['A(b)'], products: ['A(b!1).B(a!1)'] }],
            { nodesOf: extractMoleculeNames, labelOf: (r) => r.name },
        );
        expect(edges.some((e) => e.from === 'A' && e.to === 'B' && e.label === 'bind')).toBe(true);
        expect(edges.some((e) => e.from === e.to)).toBe(false); // no self-loops
    });

    it('keeps parallel edges from distinct rules but collapses duplicates', () => {
        const edges = buildDirectedReactionGraph(
            [
                { name: 'r1', reactants: ['A'], products: ['B'] },
                { name: 'r2', reactants: ['A'], products: ['B'] },
                { name: 'r1', reactants: ['A'], products: ['B'] },
            ],
            { labelOf: (r) => r.name },
        );
        expect(edges.length).toBe(2);
        expect(edges.every((e) => e.from === 'A' && e.to === 'B')).toBe(true);
    });
});
