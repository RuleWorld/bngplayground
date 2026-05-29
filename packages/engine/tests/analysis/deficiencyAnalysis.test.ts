import { describe, it, expect } from 'vitest';
import type { BNGLReaction } from '../../src/types';
import {
    computeReactionComplexes,
    buildComplexGraph,
    computeLinkageClasses,
    computeStrongLinkageClasses,
    computeDeficiency,
    analyzeNetwork,
} from '../../src/services/analysis/DeficiencyAnalysis';

/** Helper to create a minimal BNGLReaction from reactant/product name lists. */
function rxn(reactants: string[], products: string[]): BNGLReaction {
    return {
        reactants,
        products,
        rate: 'k',
        rateConstant: 1,
    };
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('DeficiencyAnalysis', () => {
    // 1. Simple reversible A <-> B
    //    Complexes: {A}, {B}  → n = 2
    //    Linkage classes: 1 (A—B connected)
    //    Stoich rank: 1 (one independent reaction)
    //    δ = 2 - 1 - 1 = 0, weakly reversible
    describe('Simple reversible A <-> B', () => {
        const reactions = [rxn(['A'], ['B']), rxn(['B'], ['A'])];

        it('should have deficiency 0 and be weakly reversible', () => {
            const result = computeDeficiency(reactions);
            expect(result.deficiency).toBe(0);
            expect(result.numComplexes).toBe(2);
            expect(result.numLinkageClasses).toBe(1);
            expect(result.stoichRank).toBe(1);
            expect(result.isWeaklyReversible).toBe(true);
        });

        it('should diagnose unique positive equilibrium', () => {
            const result = analyzeNetwork(reactions);
            expect(result.diagnostics).toContain(
                'Guaranteed unique positive equilibrium (Deficiency Zero Theorem)',
            );
        });
    });

    // 2. Enzyme kinetics: E+S <-> ES -> E+P
    //    Complexes: {E,S}, {ES}, {E,P}  → n = 3
    //    Linkage classes: 1
    //    Species: E, S, ES, P → stoich matrix rank = 3 (4 species, 3 rxns, rank 3
    //    actually let's verify: stoich vectors for 3 rxns in 4-species space)
    //    Stoich vectors:
    //      r1 (E+S->ES): [-1,-1,+1, 0]
    //      r2 (ES->E+S): [+1,+1,-1, 0]
    //      r3 (ES->E+P): [+1, 0,-1,+1]
    //    r2 = -r1, so rank among {r1,r2,r3} = rank{r1,r3} = 2
    //    δ = 3 - 1 - 2 = 0
    //    Not weakly reversible (E+P has no outgoing edge back)
    //    Wait — let me reconsider. The complexes are {E+S}, {ES}, {E+P}.
    //    Edges: E+S -> ES, ES -> E+S, ES -> E+P.
    //    Undirected: one component. Directed SCCs: {E+S, ES} and {E+P}.
    //    So NOT weakly reversible. δ = 3 - 1 - 2 = 0.
    describe('Enzyme kinetics E+S <-> ES -> E+P', () => {
        const reactions = [
            rxn(['E', 'S'], ['ES']),
            rxn(['ES'], ['E', 'S']),
            rxn(['ES'], ['E', 'P']),
        ];

        it('should have deficiency 0 and not be weakly reversible', () => {
            const result = computeDeficiency(reactions);
            expect(result.deficiency).toBe(0);
            expect(result.numComplexes).toBe(3);
            expect(result.numLinkageClasses).toBe(1);
            expect(result.stoichRank).toBe(2);
            expect(result.isWeaklyReversible).toBe(false);
        });

        it('should diagnose no positive equilibrium', () => {
            const result = analyzeNetwork(reactions);
            expect(result.diagnostics).toContain('No positive equilibrium exists');
        });
    });

    // 3. Irreversible chain A -> B -> C
    //    Complexes: {A}, {B}, {C}  → n = 3
    //    Linkage classes: 1 (A—B—C connected undirected)
    //    Stoich rank: 2 (two independent stoich vectors)
    //    δ = 3 - 1 - 2 = 0, not weakly reversible
    describe('Irreversible chain A -> B -> C', () => {
        const reactions = [rxn(['A'], ['B']), rxn(['B'], ['C'])];

        it('should have deficiency 0 and not be weakly reversible', () => {
            const result = computeDeficiency(reactions);
            expect(result.deficiency).toBe(0);
            expect(result.numComplexes).toBe(3);
            expect(result.numLinkageClasses).toBe(1);
            expect(result.stoichRank).toBe(2);
            expect(result.isWeaklyReversible).toBe(false);
        });
    });

    // 4. Weakly reversible cycle A -> B -> C -> A
    //    Complexes: {A}, {B}, {C}  → n = 3
    //    Linkage classes: 1
    //    Stoich rank: 2
    //    δ = 3 - 1 - 2 = 0, weakly reversible
    describe('Weakly reversible cycle A -> B -> C -> A', () => {
        const reactions = [
            rxn(['A'], ['B']),
            rxn(['B'], ['C']),
            rxn(['C'], ['A']),
        ];

        it('should have deficiency 0 and be weakly reversible', () => {
            const result = computeDeficiency(reactions);
            expect(result.deficiency).toBe(0);
            expect(result.isWeaklyReversible).toBe(true);
            expect(result.numComplexes).toBe(3);
            expect(result.numLinkageClasses).toBe(1);
            expect(result.stoichRank).toBe(2);
        });

        it('should diagnose unique positive equilibrium', () => {
            const result = analyzeNetwork(reactions);
            expect(result.diagnostics).toContain(
                'Guaranteed unique positive equilibrium (Deficiency Zero Theorem)',
            );
        });
    });

    // 5. Dimerization 2A <-> A2
    //    Complexes: {A:2}, {A2:1}  → n = 2
    //    Linkage classes: 1
    //    Stoich rank: 1 (species A and A2, two species, one independent vector)
    //       Stoich: r1: [-2, +1], r2: [+2, -1] → rank 1
    //    δ = 2 - 1 - 1 = 0, weakly reversible
    describe('Dimerization 2A <-> A2', () => {
        const reactions = [
            rxn(['A', 'A'], ['A2']),
            rxn(['A2'], ['A', 'A']),
        ];

        it('should have deficiency 0 and be weakly reversible', () => {
            const result = computeDeficiency(reactions);
            expect(result.deficiency).toBe(0);
            expect(result.numComplexes).toBe(2);
            expect(result.numLinkageClasses).toBe(1);
            expect(result.stoichRank).toBe(1);
            expect(result.isWeaklyReversible).toBe(true);
        });
    });

    // 6. Open system: 0 -> A -> 0
    //    Complexes: {∅}, {A}  → n = 2
    //    Linkage classes: 1
    //    Stoich rank: 1
    //    δ = 2 - 1 - 1 = 0
    //    Weakly reversible (cycle ∅ -> A -> ∅)
    describe('Open system synthesis/degradation 0 -> A -> 0', () => {
        // Empty reactant list represents the zero complex
        const reactions = [
            rxn([], ['A']),
            rxn(['A'], []),
        ];

        it('should have deficiency 0', () => {
            const result = computeDeficiency(reactions);
            expect(result.deficiency).toBe(0);
            expect(result.numComplexes).toBe(2);
            expect(result.numLinkageClasses).toBe(1);
            expect(result.stoichRank).toBe(1);
        });

        it('should be weakly reversible (cycle through zero complex)', () => {
            const result = computeDeficiency(reactions);
            expect(result.isWeaklyReversible).toBe(true);
        });
    });

    // 7. Multiple linkage classes
    //    A <-> B and C <-> D (disconnected)
    //    Complexes: {A}, {B}, {C}, {D}  → n = 4
    //    Linkage classes: 2
    //    Stoich rank: 2
    //    δ = 4 - 2 - 2 = 0, weakly reversible
    describe('Multiple linkage classes: A <-> B, C <-> D', () => {
        const reactions = [
            rxn(['A'], ['B']),
            rxn(['B'], ['A']),
            rxn(['C'], ['D']),
            rxn(['D'], ['C']),
        ];

        it('should have 2 linkage classes and deficiency 0', () => {
            const result = computeDeficiency(reactions);
            expect(result.deficiency).toBe(0);
            expect(result.numComplexes).toBe(4);
            expect(result.numLinkageClasses).toBe(2);
            expect(result.stoichRank).toBe(2);
            expect(result.isWeaklyReversible).toBe(true);
        });

        it('should find 2 linkage classes via graph analysis', () => {
            const { complexes, speciesIndex } = computeReactionComplexes(reactions);
            const adj = buildComplexGraph(reactions, complexes, speciesIndex);
            const lc = computeLinkageClasses(adj);
            expect(lc.length).toBe(2);
        });
    });

    // 8. Complex network with multiple complexes sharing species
    //    A + B -> C, C -> A + B, A -> D, D -> A
    //    Complexes: {A+B}, {C}, {A}, {D}  → n = 4
    //    Linkage classes: 2 ({A+B, C} and {A, D})
    //    Species: A, B, C, D → stoich matrix:
    //      r1 (A+B->C): [-1,-1,+1, 0]
    //      r2 (C->A+B): [+1,+1,-1, 0]
    //      r3 (A->D):   [-1, 0, 0,+1]
    //      r4 (D->A):   [+1, 0, 0,-1]
    //    rank = 2 (r1 and r3 are independent; r2=-r1, r4=-r3)
    //    δ = 4 - 2 - 2 = 0, weakly reversible
    describe('Complex network with shared species', () => {
        const reactions = [
            rxn(['A', 'B'], ['C']),
            rxn(['C'], ['A', 'B']),
            rxn(['A'], ['D']),
            rxn(['D'], ['A']),
        ];

        it('should correctly handle complexes sharing species', () => {
            const result = computeDeficiency(reactions);
            expect(result.deficiency).toBe(0);
            expect(result.numComplexes).toBe(4);
            expect(result.numLinkageClasses).toBe(2);
            expect(result.stoichRank).toBe(2);
            expect(result.isWeaklyReversible).toBe(true);
        });
    });

    // Additional: deficiency-one network
    // A network with δ = 1 to test higher-deficiency diagnostics.
    // Consider: 0 -> A, A -> B, B -> 0, 2A -> B (or similar)
    // A more reliable δ=1 example:
    // Complexes: {A}, {B}, {A+B}, {2A}  (4 complexes)
    // Reactions: A -> B, B -> A+B, A+B -> 2A, 2A -> A
    // Let's verify: n=4, linkage=1, stoich rank=?
    // Species: A, B. Stoich vectors:
    //   A->B:    [-1,+1]
    //   B->A+B:  [+1, 0]
    //   A+B->2A: [+1,-1]
    //   2A->A:   [-1, 0]
    // rank = 2 (clearly [-1,1] and [1,0] are independent)
    // δ = 4 - 1 - 2 = 1
    describe('Deficiency one network', () => {
        const reactions = [
            rxn(['A'], ['B']),
            rxn(['B'], ['A', 'B']),
            rxn(['A', 'B'], ['A', 'A']),
            rxn(['A', 'A'], ['A']),
        ];

        it('should have deficiency 1', () => {
            const result = computeDeficiency(reactions);
            expect(result.deficiency).toBe(1);
        });

        it('should diagnose deficiency one condition', () => {
            const result = analyzeNetwork(reactions);
            expect(result.diagnostics).toContain(
                'Deficiency one: check conditions for multistationarity',
            );
        });
    });

    // Edge case: computeReactionComplexes correctly identifies unique complexes
    describe('computeReactionComplexes', () => {
        it('should identify zero complex for empty reactant/product lists', () => {
            const reactions = [rxn([], ['A'])];
            const { complexes } = computeReactionComplexes(reactions);
            // Should have 2 complexes: zero complex and {A}
            expect(complexes.length).toBe(2);
            const zeroComplex = complexes.find((c) => c.key === '0');
            expect(zeroComplex).toBeDefined();
            expect(zeroComplex!.composition.size).toBe(0);
        });

        it('should treat A+A as stoichiometry 2', () => {
            const reactions = [rxn(['A', 'A'], ['B'])];
            const { complexes } = computeReactionComplexes(reactions);
            const dimerComplex = complexes.find((c) => c.key !== '0' && c.composition.size === 1);
            expect(dimerComplex).toBeDefined();
            const coeff = Array.from(dimerComplex!.composition.values())[0];
            expect(coeff).toBe(2);
        });
    });

    // Edge case: strongly connected components
    describe('computeStrongLinkageClasses', () => {
        it('should find separate SCCs for irreversible chain', () => {
            const reactions = [rxn(['A'], ['B']), rxn(['B'], ['C'])];
            const { complexes, speciesIndex } = computeReactionComplexes(reactions);
            const adj = buildComplexGraph(reactions, complexes, speciesIndex);
            const sccs = computeStrongLinkageClasses(adj);
            // Each node is its own SCC in a chain
            expect(sccs.length).toBe(3);
        });

        it('should find single SCC for a cycle', () => {
            const reactions = [
                rxn(['A'], ['B']),
                rxn(['B'], ['C']),
                rxn(['C'], ['A']),
            ];
            const { complexes, speciesIndex } = computeReactionComplexes(reactions);
            const adj = buildComplexGraph(reactions, complexes, speciesIndex);
            const sccs = computeStrongLinkageClasses(adj);
            expect(sccs.length).toBe(1);
            expect(sccs[0].length).toBe(3);
        });
    });
});
