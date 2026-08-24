/**
 * Chemical Reaction Network Theory (CRNT) — Deficiency Analysis
 *
 * Implements the classical deficiency framework (Feinberg, Horn & Jackson) for
 * BioNetGen reaction networks.  The deficiency δ of a network is defined as:
 *
 *     δ = n − ℓ − s
 *
 * where n = number of distinct complexes, ℓ = number of linkage classes
 * (connected components of the complex graph, undirected), and s = rank of
 * the stoichiometry matrix.
 *
 * The **Deficiency Zero Theorem** states: if δ = 0 and the network is weakly
 * reversible, then there exists exactly one positive steady state in each
 * stoichiometric compatibility class, for *any* choice of rate constants.
 *
 * Inspired by Catalyst.jl's `network_analysis.jl`.
 */

import type { BNGLReaction } from '../../types';

// ── Public types ────────────────────────────────────────────────────────────

/** A reaction complex is a multiset of species: species-index → stoichiometry. */
export interface ReactionComplex {
    /** Mapping from species index (0-based) to stoichiometric coefficient. */
    composition: Map<number, number>;
    /** Canonical string key for fast equality comparison. */
    key: string;
}

export interface DeficiencyResult {
    deficiency: number;
    numComplexes: number;
    numLinkageClasses: number;
    stoichRank: number;
    isWeaklyReversible: boolean;
}

export interface NetworkAnalysisResult extends DeficiencyResult {
    complexes: ReactionComplex[];
    linkageClasses: number[][];
    strongLinkageClasses: number[][];
    diagnostics: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a canonical string key for a complex composition so that two
 * complexes with the same species–stoichiometry pairs compare equal.
 * The zero complex (empty reactant/product list) maps to the key "0".
 */
function complexKey(composition: Map<number, number>): string {
    if (composition.size === 0) return '0';
    const entries = Array.from(composition.entries()).sort((a, b) => a[0] - b[0]);
    return entries.map(([idx, coeff]) => `${idx}:${coeff}`).join('+');
}

/**
 * Map a species name list (from BNGLReaction.reactants / .products) to a
 * composition map.  Duplicate names are summed (e.g. ["A","A"] → {A: 2}).
 *
 * The `speciesIndex` map is populated on the fly: every new name receives
 * the next available integer index.
 */
function buildComposition(
    names: string[],
    speciesIndex: Map<string, number>,
): Map<number, number> {
    const comp = new Map<number, number>();
    for (const raw of names) {
        const name = raw.trim();
        if (name === '' || name === '0' || name === 'Null' || name === 'Trash') continue;
        if (!speciesIndex.has(name)) {
            speciesIndex.set(name, speciesIndex.size);
        }
        const idx = speciesIndex.get(name)!;
        comp.set(idx, (comp.get(idx) ?? 0) + 1);
    }
    return comp;
}

// ── Core algorithms ─────────────────────────────────────────────────────────

/**
 * Extract the set of unique reaction complexes from the reaction list.
 *
 * Each reaction contributes two complexes: one for its reactant side and one
 * for its product side.  The zero complex is included when a reaction has an
 * empty reactant or product list (synthesis / degradation reactions).
 */
export function computeReactionComplexes(
    reactions: BNGLReaction[],
    _numSpecies?: number,
): { complexes: ReactionComplex[]; speciesIndex: Map<string, number> } {
    const speciesIndex = new Map<string, number>();
    const seen = new Map<string, number>(); // key → index in complexes[]
    const complexes: ReactionComplex[] = [];

    const register = (composition: Map<number, number>): number => {
        const key = complexKey(composition);
        if (seen.has(key)) return seen.get(key)!;
        const idx = complexes.length;
        complexes.push({ composition, key });
        seen.set(key, idx);
        return idx;
    };

    for (const rxn of reactions) {
        register(buildComposition(rxn.reactants, speciesIndex));
        register(buildComposition(rxn.products, speciesIndex));
    }

    return { complexes, speciesIndex };
}

/**
 * Build a directed graph on complexes: an edge from the source complex to
 * the product complex for every reaction.
 *
 * Returns an adjacency list (complex-index → Set of successor indices).
 */
export function buildComplexGraph(
    reactions: BNGLReaction[],
    complexes: ReactionComplex[],
    speciesIndex: Map<string, number>,
): Map<number, Set<number>> {
    const keyToIdx = new Map<string, number>();
    for (let i = 0; i < complexes.length; i++) {
        keyToIdx.set(complexes[i].key, i);
    }

    const adj = new Map<number, Set<number>>();
    for (let i = 0; i < complexes.length; i++) {
        adj.set(i, new Set());
    }

    for (const rxn of reactions) {
        const srcComp = buildComposition(rxn.reactants, speciesIndex);
        const tgtComp = buildComposition(rxn.products, speciesIndex);
        const srcKey = complexKey(srcComp);
        const tgtKey = complexKey(tgtComp);
        const srcIdx = keyToIdx.get(srcKey)!;
        const tgtIdx = keyToIdx.get(tgtKey)!;
        adj.get(srcIdx)!.add(tgtIdx);
    }

    return adj;
}

/**
 * Find connected components (linkage classes) of the **undirected** version
 * of the complex graph via BFS.
 */
export function computeLinkageClasses(
    adj: Map<number, Set<number>>,
): number[][] {
    const n = adj.size;
    // Build undirected adjacency
    const undirected = new Map<number, Set<number>>();
    for (let i = 0; i < n; i++) undirected.set(i, new Set());
    for (const [u, neighbours] of adj) {
        for (const v of neighbours) {
            undirected.get(u)!.add(v);
            undirected.get(v)!.add(u);
        }
    }

    const visited = new Set<number>();
    const components: number[][] = [];
    for (let i = 0; i < n; i++) {
        if (visited.has(i)) continue;
        const component: number[] = [];
        const queue = [i];
        visited.add(i);
        while (queue.length > 0) {
            const cur = queue.shift()!;
            component.push(cur);
            for (const nb of undirected.get(cur)!) {
                if (!visited.has(nb)) {
                    visited.add(nb);
                    queue.push(nb);
                }
            }
        }
        components.push(component.sort((a, b) => a - b));
    }

    return components;
}

/**
 * Find strongly connected components via Tarjan's algorithm.
 */
export function computeStrongLinkageClasses(
    adj: Map<number, Set<number>>,
): number[][] {
    const n = adj.size;
    let index = 0;
    const indices = new Map<number, number>();
    const lowlink = new Map<number, number>();
    const onStack = new Set<number>();
    const stack: number[] = [];
    const sccs: number[][] = [];

    function strongConnect(v: number): void {
        indices.set(v, index);
        lowlink.set(v, index);
        index++;
        stack.push(v);
        onStack.add(v);

        for (const w of adj.get(v) ?? []) {
            if (!indices.has(w)) {
                strongConnect(w);
                lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
            } else if (onStack.has(w)) {
                lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
            }
        }

        if (lowlink.get(v) === indices.get(v)) {
            const scc: number[] = [];
            let w: number;
            do {
                w = stack.pop()!;
                onStack.delete(w);
                scc.push(w);
            } while (w !== v);
            sccs.push(scc.sort((a, b) => a - b));
        }
    }

    for (let i = 0; i < n; i++) {
        if (!indices.has(i)) strongConnect(i);
    }

    return sccs;
}

/**
 * A CRN is *weakly reversible* iff every linkage class equals exactly one
 * strong linkage class — i.e. every connected component is strongly connected.
 */
export function isWeaklyReversible(
    _adj: Map<number, Set<number>>,
    linkageClasses: number[][],
    strongLinkageClasses: number[][],
): boolean {
    // Build a set of sets (as sorted-key strings) for fast comparison.
    const sccKeys = new Set<string>(
        strongLinkageClasses.map((scc) => scc.slice().sort((a, b) => a - b).join(',')),
    );
    for (const lc of linkageClasses) {
        const key = lc.slice().sort((a, b) => a - b).join(',');
        if (!sccKeys.has(key)) return false;
    }
    return true;
}

/**
 * Build the stoichiometry matrix and compute its rank via Gaussian
 * elimination with partial pivoting (exact for rational coefficients that
 * are integers, which stoichiometries always are).
 */
function computeStoichiometryRank(
    reactions: BNGLReaction[],
    speciesIndex: Map<string, number>,
): number {
    const numSpecies = speciesIndex.size;
    const numReactions = reactions.length;
    if (numSpecies === 0 || numReactions === 0) return 0;

    // Build stoichiometry matrix (numSpecies × numReactions)
    const mat: number[][] = [];
    for (let i = 0; i < numSpecies; i++) {
        mat.push(new Array(numReactions).fill(0));
    }

    for (let j = 0; j < numReactions; j++) {
        const rxn = reactions[j];
        // Subtract reactant stoichiometries
        for (const raw of rxn.reactants) {
            const name = raw.trim();
            if (name === '' || name === '0' || name === 'Null' || name === 'Trash') continue;
            const idx = speciesIndex.get(name);
            if (idx !== undefined) mat[idx][j] -= 1;
        }
        // Add product stoichiometries
        for (const raw of rxn.products) {
            const name = raw.trim();
            if (name === '' || name === '0' || name === 'Null' || name === 'Trash') continue;
            const idx = speciesIndex.get(name);
            if (idx !== undefined) mat[idx][j] += 1;
        }
    }

    // Gaussian elimination with partial pivoting to find rank
    const rows = numSpecies;
    const cols = numReactions;
    const EPS = 1e-12;
    let rank = 0;
    const m = mat.map((r) => r.slice()); // copy

    for (let col = 0; col < cols && rank < rows; col++) {
        // Find pivot
        let maxVal = Math.abs(m[rank][col]);
        let maxRow = rank;
        for (let row = rank + 1; row < rows; row++) {
            if (Math.abs(m[row][col]) > maxVal) {
                maxVal = Math.abs(m[row][col]);
                maxRow = row;
            }
        }
        if (maxVal < EPS) continue;

        // Swap rows
        [m[rank], m[maxRow]] = [m[maxRow], m[rank]];

        // Eliminate below
        const pivot = m[rank][col];
        for (let row = rank + 1; row < rows; row++) {
            const factor = m[row][col] / pivot;
            for (let c = col; c < cols; c++) {
                m[row][c] -= factor * m[rank][c];
            }
        }
        rank++;
    }

    return rank;
}

/**
 * Compute the deficiency of a reaction network.
 *
 *     δ = |complexes| − |linkage_classes| − rank(stoichiometry_matrix)
 */
export function computeDeficiency(
    reactions: BNGLReaction[],
    numSpecies?: number,
): DeficiencyResult {
    const { complexes, speciesIndex } = computeReactionComplexes(reactions, numSpecies);
    const adj = buildComplexGraph(reactions, complexes, speciesIndex);
    const linkage = computeLinkageClasses(adj);
    const strong = computeStrongLinkageClasses(adj);
    const weaklyRev = isWeaklyReversible(adj, linkage, strong);
    const stoichRank = computeStoichiometryRank(reactions, speciesIndex);

    const deficiency = complexes.length - linkage.length - stoichRank;

    return {
        deficiency,
        numComplexes: complexes.length,
        numLinkageClasses: linkage.length,
        stoichRank,
        isWeaklyReversible: weaklyRev,
    };
}

/**
 * Full CRNT analysis with diagnostic messages.
 */
export function analyzeNetwork(
    reactions: BNGLReaction[],
    numSpecies?: number,
): NetworkAnalysisResult {
    const { complexes, speciesIndex } = computeReactionComplexes(reactions, numSpecies);
    const adj = buildComplexGraph(reactions, complexes, speciesIndex);
    const linkage = computeLinkageClasses(adj);
    const strong = computeStrongLinkageClasses(adj);
    const weaklyRev = isWeaklyReversible(adj, linkage, strong);
    const stoichRank = computeStoichiometryRank(reactions, speciesIndex);

    const deficiency = complexes.length - linkage.length - stoichRank;

    const diagnostics: string[] = [];

    if (deficiency === 0 && weaklyRev) {
        diagnostics.push(
            'Guaranteed unique positive equilibrium (Deficiency Zero Theorem)',
        );
    } else if (deficiency === 0 && !weaklyRev) {
        diagnostics.push('No positive equilibrium exists');
    } else if (deficiency === 1) {
        diagnostics.push('Deficiency one: check conditions for multistationarity');
    } else if (deficiency > 1) {
        diagnostics.push('Higher deficiency: complex dynamics possible');
    }

    return {
        deficiency,
        numComplexes: complexes.length,
        numLinkageClasses: linkage.length,
        stoichRank,
        isWeaklyReversible: weaklyRev,
        complexes,
        linkageClasses: linkage,
        strongLinkageClasses: strong,
        diagnostics,
    };
}
