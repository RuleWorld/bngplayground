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

import { BNGLParser } from '../graph/core/BNGLParser';
import { GraphCanonicalizer } from '../graph/core/Canonical';
import { getExpressionDependencies } from '../../parser/ExpressionDependencies';
import { GraphMatcher } from '../graph/core/Matcher';
import { countEmbeddingDegeneracy } from '../graph/core/degeneracy';
import { registerCacheClearCallback } from '../../featureFlags';

const factorial = (n: number): number => {
    if (!Number.isFinite(n) || n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
};

const getWildcardComponentSymmetryFactor = (pattern: ReturnType<typeof BNGLParser.parseSpeciesGraph>): number => {
    let factor = 1;

    for (const molecule of pattern.molecules) {
        const counts = new Map<string, number>();
        for (const component of molecule.components) {
            // Handle parser-normalized observable patterns such as P(s!?,s!?,c~T)
            // where equivalent repeated unconstrained wildcard sites should
            // not contribute multiplicatively to Molecules observable counts.
            if (component.wildcard !== '?' || component.edges.size !== 0) continue;
            const signature = `${component.name}|${component.state ?? ''}|${component.wildcard}`;
            counts.set(signature, (counts.get(signature) ?? 0) + 1);
        }

        for (const count of counts.values()) {
            if (count > 1) factor *= factorial(count);
        }
    }

    return factor;
};

const getObservablePatternSymmetryFactor = (pattern: ReturnType<typeof BNGLParser.parseSpeciesGraph>): number => {
    const auto = GraphMatcher.getPatternAutomorphismFactor(pattern);
    const wildcardFactor = getWildcardComponentSymmetryFactor(pattern);
    const resolvedAuto = Number.isFinite(auto) && auto > 0 ? auto : 1;
    const resolvedWildcard = Number.isFinite(wildcardFactor) && wildcardFactor > 0 ? wildcardFactor : 1;
    return Math.max(resolvedAuto, resolvedWildcard);
};

const normalizeLegacySuffixCompartment = (s: string): string => {
    if (!s) return s;
    // Normalize legacy BNGL syntax like `B@EC()` to canonical `B()@EC`.
    // Apply globally to support multi-molecule patterns such as `A@CP().B@PM()`.
    return s.replace(/([A-Za-z_][A-Za-z0-9_]*)@([A-Za-z0-9_]+)\(([^()]*)\)/g, (_m, mol, comp, args) => {
        const inside = String(args ?? '');
        return `${mol}(${inside})@${comp}`;
    });
};

export const getCompartment = (s: string) => {
    const normalized = normalizeLegacySuffixCompartment(s);
    // Extract compartment prefix (e.g. @C::A or @C:A) or suffix (e.g. A@C)
    const prefix = normalized.match(/^@([A-Za-z0-9_]+)::?/);
    if (prefix) return prefix[1];
    const suffix = normalized.match(/@([A-Za-z0-9_]+)$/);
    if (suffix) return suffix[1];
    return null;
};

export const removeCompartment = (s: string) => {
    const normalized = normalizeLegacySuffixCompartment(s);
    // Support both Web-style "@cell:Species" and BNG2-style "@cell::Species"
    return normalized.replace(/^@[A-Za-z0-9_]+::?/, '').replace(/@([A-Za-z0-9_]+)$/, (m, g) => {
        // Only remove if it's a trailing compartment suffix (not inside a bond chain)
        return '';
    });
};

const normalizeBareMoleculePattern = (s: string): string => {
    return /^[A-Za-z0-9_]+$/.test(s) ? `${s}()` : s;
};

const parseSimpleCompartmentMoleculePattern = (
    pattern: string
): { molecule: string; compartment: string; style: 'prefix' | 'suffix' } | null => {
    const p = normalizeLegacySuffixCompartment(pattern.trim());
    const m1 = p.match(/^@([A-Za-z0-9_]+)::?([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(\s*\))?$/);
    if (m1) return { compartment: m1[1], molecule: m1[2], style: 'prefix' };
    const m2 = p.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(\s*\))?@([A-Za-z0-9_]+)$/);
    if (m2) return { molecule: m2[1], compartment: m2[2], style: 'suffix' };
    return null;
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

const normalizeGraphString = (s: string): string => {
    try {
        const g = BNGLParser.parseSpeciesGraph(s);
        return GraphCanonicalizer.canonicalize(g);
    } catch {
        return s;
    }
};


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

        // BNG2 uses exact bond-count matching at specified component sites (strict):
        // if pattern says Cyclin(b!1) [1 bond at b], species Cyclin(b!1!2) [2 bonds at b] must NOT match.
        // allowExtraTargetBonds: false enforces this for ALL Molecules-type observable matching.
        const maps = GraphMatcher.findAllMaps(patGraph, specGraph, { allowExtraTargetBonds: false, symmetryBreaking: false });
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
    const rawPat = normalizeLegacySuffixCompartment(pattern.trim());
    const rawSpec = normalizeLegacySuffixCompartment(speciesStr.trim());
    const isMultiMoleculePattern = rawPat.includes('.');
    const patPrefixComp = rawPat.match(/^@([A-Za-z0-9_]+)::?/)?.[1] ?? null;
    if (patPrefixComp) {
        const specComp = getCompartment(rawSpec);
        if (specComp && specComp !== patPrefixComp) return false;
        try {
            const cleanPat = normalizeBareMoleculePattern(rawPat);
            const cleanSpec = normalizeBareMoleculePattern(rawSpec);
            const p = parseGraphCached(cleanPat).clone();
            const s = parseGraphCached(cleanSpec).clone();
            p.compartment = undefined;
            s.compartment = undefined;
            for (const m of p.molecules) m.compartment = undefined;
            for (const m of s.molecules) m.compartment = undefined;
            return GraphMatcher.matchesPattern(p, s, { allowExtraTargetBonds: true });
        } catch {
            // Fall through to canonical-string path.
        }
    }

    const cleanPat = normalizeBareMoleculePattern(rawPat);
    const cleanSpec = normalizeBareMoleculePattern(rawSpec);
    const graphPat = normalizeGraphString(cleanPat);
    const graphSpec = normalizeGraphString(cleanSpec);

    try {
        const cachedPat = parseGraphCached(graphPat);
        const patGraph = cachedPat.clone();

        const specGraph = parseGraphCached(graphSpec);
        const match = GraphMatcher.matchesPattern(patGraph, specGraph, { allowExtraTargetBonds: true });

        return match;
    } catch {
        // Final fallback: simple string contains. 
        // Necessary for robustness against parser crashes on malformed inputs during live edit.
        return graphSpec.includes(graphPat);
    }
}

/**
 * Counts the number of molecules in a species that can serve as the "anchor" (first molecule)
 * for a match of a multi-molecule pattern. This follows BNG2 semantics for Molecules observables.
 */
export function countMultiMoleculePatternMatches(speciesStr: string, pattern: string): number {
    const rawPat = normalizeLegacySuffixCompartment(pattern.trim());
    const rawSpec = normalizeLegacySuffixCompartment(speciesStr.trim());

    const cleanPat = normalizeBareMoleculePattern(rawPat);
    const cleanSpec = normalizeBareMoleculePattern(rawSpec);
    const graphPat = normalizeGraphString(cleanPat);
    const graphSpec = normalizeGraphString(cleanSpec);

    try {
        const cachedPat = parseGraphCached(graphPat);
        const patGraph = cachedPat.clone();

        const specGraph = parseGraphCached(graphSpec);

        // BNG2 uses exact bond-count matching at specified component sites (strict, same as NetworkExporter).
        const maps = GraphMatcher.findAllMaps(patGraph, specGraph, { allowExtraTargetBonds: false });
        if (maps.length === 0) return 0;
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

// --- Helper: Count Matches for Molecules Observable ---
export function countPatternMatches(speciesStr: string, patternStr: string): number {
    const normalizedPattern = normalizeLegacySuffixCompartment(patternStr.trim());
    const isMultiMoleculePattern = normalizedPattern.includes('.');
    const patPrefixComp = normalizedPattern.match(/^@([A-Za-z0-9_]+)::?/)?.[1] ?? null;
    if (patPrefixComp) {
        const specComp = getCompartment(speciesStr);
        if (specComp && specComp !== patPrefixComp) return 0;
        try {
            const rawPat = normalizeLegacySuffixCompartment(patternStr.trim());
            const rawSpec = normalizeLegacySuffixCompartment(speciesStr.trim());
            const cleanPat = normalizeBareMoleculePattern(rawPat);
            const cleanSpec = normalizeBareMoleculePattern(rawSpec);
            const p = parseGraphCached(cleanPat).clone();
            const s = parseGraphCached(cleanSpec).clone();
            p.compartment = undefined;
            s.compartment = undefined;
            for (const m of p.molecules) m.compartment = undefined;
            for (const m of s.molecules) m.compartment = undefined;
            const maps = GraphMatcher.findAllMaps(p, s, { allowExtraTargetBonds: false });
            if (maps.length === 0) return 0;
            let total = 0;
            for (const map of maps) {
                const d = countEmbeddingDegeneracy(p, s, map);
                total += Number.isFinite(d) && d > 0 ? d : 1;
            }
            return total;
        } catch {
            // Fall through to non-prefix paths below.
        }
    }

    // Fast path for simple compartment-molecule observable patterns (e.g. "@PM:L").
    // For compartmental complexes, BNG2 observable semantics align with the species
    // anchor compartment (e.g. @PM::...), not only explicit per-molecule @suffix tags.
    const simpleCompPattern = parseSimpleCompartmentMoleculePattern(patternStr);
    if (simpleCompPattern) {
        if (simpleCompPattern.style === 'prefix') {
            const speciesCompartment = getCompartment(speciesStr);
            if (speciesCompartment !== simpleCompPattern.compartment) return 0;
        }
        try {
            const specGraph = parseGraphCached(normalizeLegacySuffixCompartment(speciesStr.trim()));
            let count = 0;
            for (const mol of specGraph.molecules) {
                if (mol.name !== simpleCompPattern.molecule) continue;
                const effectiveComp = mol.compartment ?? specGraph.compartment ?? null;
                if (effectiveComp === simpleCompPattern.compartment) count++;
            }
            return count;
        } catch {
            // Fallback to lightweight string parsing.
            const normalized = normalizeLegacySuffixCompartment(speciesStr.trim());
            const body = normalized.replace(/^@[A-Za-z0-9_]+::?/, '');
            const chunks = body.split('.').map((c) => c.trim()).filter(Boolean);
            let count = 0;
            for (const chunk of chunks) {
                const chunkComp = chunk.match(/@([A-Za-z0-9_]+)$/)?.[1] ?? getCompartment(speciesStr);
                const noComp = chunk.replace(/@([A-Za-z0-9_]+)$/, '');
                const nameMatch = noComp.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(|$)/);
                if (nameMatch && nameMatch[1] === simpleCompPattern.molecule && chunkComp === simpleCompPattern.compartment) count++;
            }
            return count;
        }
    }

    const rawPat = normalizeLegacySuffixCompartment(patternStr.trim());
    const rawSpec = normalizeLegacySuffixCompartment(speciesStr.trim());

    const cleanPat = normalizeBareMoleculePattern(rawPat);
    const cleanSpec = normalizeBareMoleculePattern(rawSpec);

    const graphPat = normalizeGraphString(cleanPat);
    const graphSpec = normalizeGraphString(cleanSpec);

    if (graphPat.includes('.')) {
        return countMultiMoleculePatternMatches(graphSpec, graphPat);
    } else {
        return countMoleculeEmbeddings(graphPat, graphSpec);
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
