import { describe, it, expect, beforeEach } from 'vitest';
import { BNGLParser, GraphCanonicalizer } from '@bngplayground/engine';
import { clearCanonicalCache } from '../../packages/engine/src/services/graph/core/Canonical';

/**
 * The canonicalization memo may only ever reuse a previously computed canonical
 * form for a structurally identical graph. These tests pin the two properties
 * that make it safe: a warm memo returns exactly what a cold one computes, and
 * a structurally different multi-molecule graph never inherits its
 * predecessor's answer.
 */

/** Canonical string with the memo cold, i.e. the memo's only source of truth. */
function coldCanonical(species: string): string {
  clearCanonicalCache();
  return GraphCanonicalizer.canonicalize(BNGLParser.parseSpeciesGraph(species));
}

/** Canonical string with whatever the memo already holds for that structure. */
function warmCanonical(species: string): string {
  return GraphCanonicalizer.canonicalize(BNGLParser.parseSpeciesGraph(species));
}

describe('GraphCanonicalizer memo', () => {

  beforeEach(() => {
    clearCanonicalCache();
  });

    it('returns the memoized form for a repeated multi-molecule structure', () => {
        const first = coldCanonical('A(b!1).B(b!1)');
        // Same structure again: a memo hit, and it must equal the cold answer.
        const second = warmCanonical('A(b!1).B(b!1)');
        expect(second).toBe(first);
    });

    it('is insensitive to bond-label renumbering between otherwise identical graphs', () => {
        // Two graphs that differ only in how bonds are numbered must still land
        // on the same canonical form, memo or no memo.
        expect(coldCanonical('A(b!1).B(b!1).C(c!1)')).toBe(coldCanonical('A(b!2).B(b!2).C(c!2)'));
        expect(warmCanonical('A(b!1).B(b!1).C(c!1)')).toBe(warmCanonical('A(b!2).B(b!2).C(c!2)'));
    });

    it('does not confuse distinct bonded topologies that share a local description', () => {
        // K3,3 and the triangular prism have identical per-component local
        // structure; a memo keyed on anything less than the whole adjacency
        // would hand one of them the other's canonical form.
        const bipartite = coldCanonical('A(b!1).B(c!1).A(b!2).C(c!2).B(d!3).C(d!3)');
        const other = coldCanonical('B(c!1).A(b!1).B(c!2).A(b!2).C(d!3).C(d!3)');
        expect(bipartite).not.toBe(other);
    });

    it('separates multi-molecule species that differ only in compartment', () => {
        expect(warmCanonical('@PM::A(b!1).B(b!1)')).not.toBe(warmCanonical('@ER::A(b!1).B(b!1)'));
    });

    it('separates multi-molecule species that differ only in component state', () => {
        expect(warmCanonical('A(b~u!1).B(b!1)')).not.toBe(warmCanonical('A(b~p!1).B(b!1)'));
    });

    it('separates multi-molecule species that differ only in bond wildcard', () => {
        expect(warmCanonical('A(b!1).B(b!1)')).not.toBe(warmCanonical('A(b!?).B(b!1)'));
    });

    it('keeps component states that differ only by index order distinct', () => {
        // A(x~u,y~p) vs A(x~p,y~u): identical as multisets, different as graphs.
        expect(warmCanonical('A(x~u!1,y~p).B(x!1)')).not.toBe(warmCanonical('A(x~p!1,y~u).B(x!1)'));
    });

    it('agrees with a cold memo across a batch of species', () => {
        const species = [
            'A(b!1).B(b!1)',
            'A(b!1).A(b!1)',
            'A(x!1,y!2).B(x!2,y!3).C(x!3,y!1)',
            'A(b!1).B(b!1,c!2).C(c!2)',
            'A(b~u!1).B(b~u!1)',
            'A()@PM.B()@ER',
        ];
        const cold = species.map(coldCanonical);
        // Warm every entry twice; the second pass can only be served from the memo.
        species.forEach(warmCanonical);
        expect(species.map(warmCanonical)).toEqual(cold);
    });

    it('survives repeated clear/rebuild cycles without drift', () => {
        const species = 'A(b!1).B(b!1,c!2).C(c!2)';
        const reference = coldCanonical(species);
        for (let i = 0; i < 5; i++) {
            expect(warmCanonical(species)).toBe(reference);
            clearCanonicalCache();
        }
    });

    it('recomputes after a graph is mutated in place', () => {
        const graph = BNGLParser.parseSpeciesGraph('A(b).B(c)');
        const before = GraphCanonicalizer.canonicalize(graph);
        graph.addBond(0, 0, 1, 0, 1);
        const after = GraphCanonicalizer.canonicalize(graph);
        expect(after).not.toBe(before);
        // The unbonded form is still reachable from the memo afterwards.
        expect(warmCanonical('A(b).B(c)')).toBe(before);
    });
});