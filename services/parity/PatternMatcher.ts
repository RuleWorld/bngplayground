/**
 * services/parity/PatternMatcher.ts
 * 
 * Helper functions for BNGL pattern matching, including compartment handling
 * and functional rate detection.
 * 
 * PARITY NOTE: This file implements logic similar to BNG2's isomorphism checks.
 * It combines graph matching (strict) with string normalization fallbacks (lenient)
 * to handle edge cases in web-parsed BNGL.
 */

import { BNGLParser } from '../../src/services/graph/core/BNGLParser';
import { getExpressionDependencies } from '../../src/parser/ExpressionDependencies';
import { GraphMatcher } from '../../src/services/graph/core/Matcher';
import { countEmbeddingDegeneracy } from '../../src/services/graph/core/degeneracy';
import { registerCacheClearCallback } from '../featureFlags';

export const getCompartment = (s: string) => {
    // Extract compartment prefix (e.g. @C::A or @C:A) or suffix (e.g. A@C)
    const prefix = s.match(/^@([A-Za-z0-9_]+)::?/);
    if (prefix) return prefix[1];
    const suffix = s.match(/@([A-Za-z0-9_]+)$/);
    if (suffix) return suffix[1];
    return null;
};

export const removeCompartment = (s: string) => {
    // Support both Web-style "@cell:Species" and BNG2-style "@cell::Species"
    return s.replace(/^@[A-Za-z0-9_]+::?/, '').replace(/@([A-Za-z0-9_]+)$/, (m, g) => {
        // Only remove if it's a trailing compartment suffix (not inside a bond chain)
        return '';
    });
};

// -------------------------------------------------------------------------
// Graph Caching (Performance Optimization)
// -------------------------------------------------------------------------

// Observable pattern matching cache - bounded to prevent unbounded growth across simulations
const parsedGraphCache = new Map<string, ReturnType<typeof BNGLParser.parseSpeciesGraph>>();
const MAX_PARSED_GRAPH_CACHE = 1000;
let PARSED_GRAPH_CACHE_VERSION = '1.0.0';

const setBoundedCache = <K, V>(cache: Map<K, V>, key: K, value: V, maxSize: number): void => {
    if (maxSize <= 0) return;
    // Refresh insertion order (Map preserves insertion order, so delete+set moves to end)
    cache.delete(key);
    cache.set(key, value);
    if (cache.size > maxSize) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) {
            cache.delete(oldestKey);
        }
    }
};

export function parseGraphCached(str: string) {
    const cacheKey = `${PARSED_GRAPH_CACHE_VERSION}::${str}`;
    const cached = parsedGraphCache.get(cacheKey);
    if (cached) return cached;
    const parsed = BNGLParser.parseSpeciesGraph(str);
    setBoundedCache(parsedGraphCache, cacheKey, parsed, MAX_PARSED_GRAPH_CACHE);
    return parsed;
}

registerCacheClearCallback(() => {
    parsedGraphCache.clear();
    PARSED_GRAPH_CACHE_VERSION = '1.0.1'; // Bump version just in case
});

// --- Helper: Count ALL embeddings of a single-molecule pattern into a target molecule ---
// For Molecules observables, BNG2 counts all ways the pattern can embed.
function countMoleculeEmbeddings(patMol: string, specMol: string): number {
    try {
        // FIX: BNG2 treats "mRNA" and "mRNA()" as equivalent for matching.
        // Normalize bare molecule names by adding empty parentheses.
        const normalizedPat = /^[A-Za-z0-9_]+$/.test(patMol) ? patMol + '()' : patMol;

        // Clone the cached graph to avoid accidental mutation.
        const cachedPat = parseGraphCached(normalizedPat);
        const patGraph = cachedPat.clone();

        const specGraph = parseGraphCached(specMol);

        // Strict graph embedding check
        if (!GraphMatcher.matchesPattern(patGraph, specGraph)) {
            return 0;
        }

        // Single-molecule observable: count all valid component assignments within the molecule.
        // Reference: BNG2 pattern matching semantics (VF2 algorithm or similar).
        const match = { moleculeMap: new Map<number, number>([[0, 0]]), componentMap: new Map<string, string>() };
        return countEmbeddingDegeneracy(patGraph, specGraph, match);
    } catch {
        return 0;
    }
}

// --- Helper: Check if Species Matches Pattern (Boolean) ---
export function isSpeciesMatch(speciesStr: string, pattern: string): boolean {
    const patComp = getCompartment(pattern);
    const specComp = getCompartment(speciesStr);

    if (patComp && patComp !== specComp) return false;

    const cleanPat = removeCompartment(pattern);
    const cleanSpec = removeCompartment(speciesStr);

    try {
        const cachedPat = parseGraphCached(cleanPat);
        const patGraph = cachedPat.clone();

        const specGraph = parseGraphCached(cleanSpec);
        const match = GraphMatcher.matchesPattern(patGraph, specGraph);

        return match;
    } catch {
        // Final fallback: simple string contains. 
        // Necessary for robustness against parser crashes on malformed inputs during live edit.
        return cleanSpec.includes(cleanPat);
    }
}

/**
 * Counts the number of molecules in a species that can serve as the "anchor" (first molecule)
 * for a match of a multi-molecule pattern. This follows BNG2 semantics for Molecules observables.
 */
export function countMultiMoleculePatternMatches(speciesStr: string, pattern: string): number {
    const patComp = getCompartment(pattern);
    const specComp = getCompartment(speciesStr);

    if (patComp && patComp !== specComp) return 0;

    const cleanPat = removeCompartment(pattern);
    const cleanSpec = removeCompartment(speciesStr);

    try {
        const cachedPat = parseGraphCached(cleanPat);
        const patGraph = cachedPat.clone();

        const specGraph = parseGraphCached(cleanSpec);

        // BNG2 semantics for Molecules observables (multi-molecule patterns):
        // Count ALL embeddings of the pattern into the species.

        const maps = GraphMatcher.findAllMaps(patGraph, specGraph);
        return maps.length;
    } catch {
        return 0;
    }
}

// --- Helper: Count Matches for Molecules Observable ---
export function countPatternMatches(speciesStr: string, patternStr: string): number {
    const patComp = getCompartment(patternStr);
    const specComp = getCompartment(speciesStr);

    const cleanPat = removeCompartment(patternStr);
    const cleanSpec = removeCompartment(speciesStr);

    if (patComp && patComp !== specComp) return 0;

    if (cleanPat.includes('.')) {
        // Multi-molecule pattern: stricter species-level compartment check for now
        return countMultiMoleculePatternMatches(speciesStr, patternStr);
    } else {
        // Single-molecule pattern: use findAllMaps on the whole species graph.
        // This is robust to complexes (no splitting) and correctly handles BNG2 Molecules semantics.
        try {
            const cachedPat = parseGraphCached(cleanPat);
            const patGraph = cachedPat.clone();

            const specGraph = parseGraphCached(cleanSpec);


            const maps = GraphMatcher.findAllMaps(patGraph, specGraph);
            return maps.length;
        } catch {
            return 0;
        }
    }
}

// Helper to check if a rate expression contains observable, function, OR changing parameter references
// This implementation uses a robust parser (getExpressionDependencies) so it is NOT the cause of
// the "observable-dependent rate" false positive in NFsim validation.
export const isFunctionalRateExpr = (
    rateExpr: string,
    observableNames: Set<string>,
    functionNames: Set<string>,
    changingParams: Set<string>
): boolean => {
    if (!rateExpr) return false;

    // Use ANTLR parser to extract all dependencies (observables, functions, parameters)
    const dependencies = getExpressionDependencies(rateExpr);

    for (const dep of dependencies) {
        if (observableNames.has(dep)) return true;
        if (functionNames.has(dep)) return true;
        if (changingParams.has(dep)) return true;
    }
    return false;
};
