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

import { BNGLParser } from '../../src/services/graph/core/BNGLParser.ts';
import { getExpressionDependencies } from '../../src/parser/ExpressionDependencies.ts';
import { GraphMatcher } from '../../src/services/graph/core/Matcher.ts';
import { countEmbeddingDegeneracy } from '../../src/services/graph/core/degeneracy.ts';
import { registerCacheClearCallback } from '../featureFlags.ts';

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

const normalizeBareMoleculePattern = (s: string): string => {
    return /^[A-Za-z0-9_]+$/.test(s) ? `${s}()` : s;
};

const getLeadingCompartment = (s: string): string | null => {
    const prefix = s.match(/^@([A-Za-z0-9_]+)::?/);
    return prefix ? prefix[1] : null;
};

const removeLeadingCompartment = (s: string): string => s.replace(/^@[A-Za-z0-9_]+::?/, '');

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
        const normalizedPat = normalizeBareMoleculePattern(patMol);

        // Clone the cached graph to avoid accidental mutation.
        const cachedPat = parseGraphCached(normalizedPat);
        const patGraph = cachedPat.clone();

        const specGraph = parseGraphCached(specMol);

        const maps = GraphMatcher.findAllMaps(patGraph, specGraph);
        if (maps.length === 0) return 0;
        // Always account for component-level degeneracy for single-molecule observables.
        // GraphMatcher may return one molecule mapping while symmetric components (e.g., A(b,b))
        // still provide multiple valid embeddings for a pattern like A(b).
        let total = 0;
        for (const map of maps) {
            const d = countEmbeddingDegeneracy(patGraph, specGraph, map);
            total += Number.isFinite(d) && d > 0 ? d : 1;
        }
        return total;
    } catch {
        return 0;
    }
}

// --- Helper: Check if Species Matches Pattern (Boolean) ---
export function isSpeciesMatch(speciesStr: string, pattern: string): boolean {
    const rawPat = pattern.trim();
    const rawSpec = speciesStr.trim();

    const patPrefixComp = getLeadingCompartment(rawPat);
    const specPrefixComp = getLeadingCompartment(rawSpec);
    if (patPrefixComp && patPrefixComp !== specPrefixComp) return false;

    const cleanPat = normalizeBareMoleculePattern(patPrefixComp ? removeLeadingCompartment(rawPat) : rawPat);
    const cleanSpec = patPrefixComp ? removeLeadingCompartment(rawSpec) : rawSpec;

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
    const rawPat = pattern.trim();
    const rawSpec = speciesStr.trim();

    const patPrefixComp = getLeadingCompartment(rawPat);
    const specPrefixComp = getLeadingCompartment(rawSpec);
    if (patPrefixComp && patPrefixComp !== specPrefixComp) return 0;

    const cleanPat = normalizeBareMoleculePattern(patPrefixComp ? removeLeadingCompartment(rawPat) : rawPat);
    const cleanSpec = patPrefixComp ? removeLeadingCompartment(rawSpec) : rawSpec;

    try {
        const cachedPat = parseGraphCached(cleanPat);
        const patGraph = cachedPat.clone();

        const specGraph = parseGraphCached(cleanSpec);

        const maps = GraphMatcher.findAllMaps(patGraph, specGraph);
        if (maps.length === 0) return 0;

        return maps.length;
    } catch {
        return 0;
    }
}

// --- Helper: Count Matches for Molecules Observable ---
export function countPatternMatches(speciesStr: string, patternStr: string): number {
    const rawPat = patternStr.trim();
    const rawSpec = speciesStr.trim();

    const patPrefixComp = getLeadingCompartment(rawPat);
    const specPrefixComp = getLeadingCompartment(rawSpec);
    if (patPrefixComp && patPrefixComp !== specPrefixComp) return 0;

    const cleanPat = normalizeBareMoleculePattern(patPrefixComp ? removeLeadingCompartment(rawPat) : rawPat);
    const cleanSpec = patPrefixComp ? removeLeadingCompartment(rawSpec) : rawSpec;

    if (cleanPat.includes('.')) {
        return countMultiMoleculePatternMatches(cleanSpec, cleanPat);
    } else {
        return countMoleculeEmbeddings(cleanPat, cleanSpec);
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

    // Fallback: if the parser missed a user-defined function call, detect it via regex.
    if (functionNames.size > 0) {
        const escapedNames = Array.from(functionNames).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const fnRegex = new RegExp(`\\b(?:${escapedNames.join('|')})\\s*\\(`);
        if (fnRegex.test(rateExpr)) return true;
    }
    return false;
};
