/**
 * QSSAPreprocessor.ts - Quasi-Steady-State Approximation preprocessing
 * 
 * Identifies fast-slow reaction systems and suggests species that can be
 * treated as quasi-steady-state (QSS) to reduce model complexity.
 */

import type { BNGLModel } from '../../types';
import { BNGLParser } from '../graph/core/BNGLParser';
import { GraphCanonicalizer } from '../graph/core/Canonical';

export interface QSSACandidate {
    species: string;
    fastReactions: number;
    slowReactions: number;
    ratio: number;
    recommendation: 'QSSA' | 'CONSERVATION' | 'NONE';
    rationale: string;
}

export interface QSSAResult {
    candidates: QSSACandidate[];
    summary: string;
    reducedModel?: {
        eliminatedSpecies: string[];
        modifiedReactions: number;
        estimatedSpeedup: number;
    };
}

export interface QSSAOptions {
    /**
     * Rate constant ratio threshold above which a species is considered fast
     * Default: 100x difference
     */
    fastSlowThreshold?: number;
    /**
     * Minimum number of fast reactions for QSSA consideration
     * Default: 2
     */
    minFastReactions?: number;
    /**
     * Whether to generate a reduced model
     */
    generateReducedModel?: boolean;
}

const DEFAULT_OPTIONS: Required<QSSAOptions> = {
    fastSlowThreshold: 100,
    minFastReactions: 2,
    generateReducedModel: false,
};

function findMatchingSpeciesName(pattern: string, availableSpecies: string[], availableSpeciesSet?: Set<string>): string | undefined {
    // ⚡ Bolt Optimization: Use fast path with Set if provided to skip expensive closure/array overhead
    if (availableSpeciesSet) {
        if (availableSpeciesSet.has(pattern)) return pattern;
    } else {
        if (availableSpecies.includes(pattern)) return pattern;
    }

    // Attempt multiple resolution strategies to match canonical strings
    try {
        const graph = BNGLParser.parseSpeciesGraph(pattern, false);
        const toStringMatch = graph.toString();
        if (availableSpeciesSet ? availableSpeciesSet.has(toStringMatch) : availableSpecies.includes(toStringMatch)) return toStringMatch;

        // Canonical form
        const canonMatch = GraphCanonicalizer.canonicalize(graph);
        if (availableSpeciesSet ? availableSpeciesSet.has(canonMatch) : availableSpecies.includes(canonMatch)) return canonMatch;

        // Check against canonical forms of available species to be completely safe
        for (const sp of availableSpecies) {
            try {
                const spGraph = BNGLParser.parseSpeciesGraph(sp, false);
                if (GraphCanonicalizer.canonicalize(spGraph) === canonMatch) {
                    return sp;
                }
            } catch {
                // Ignore parse errors on available species
            }
        }
    } catch {
        // Ignore parsing errors for exact matches
    }

    return undefined;
}

export function analyzeQSSA(
    model: BNGLModel,
    options: QSSAOptions = {}
): QSSAResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    const reactionRules = model.reactionRules ?? [];
    const species = model.species ?? [];
    const parameters = model.parameters ?? {};
    
    const speciesReactionMap: Record<string, { fast: number; slow: number; reactions: string[] }> = {};
    
    for (const sp of species) {
        speciesReactionMap[sp.name] = { fast: 0, slow: 0, reactions: [] };
    }
    
    // Derive kinetic rate values only from parameters and rate literals actually referenced in reaction rules,
    // ignoring non-rate parameters like initial concentrations, compartment volumes, or totals.
    const rateParamNames = new Set<string>();
    for (const rule of reactionRules) {
        if (rule.rate && rule.rate in parameters) {
            rateParamNames.add(rule.rate);
        }
        if (rule.reverseRate && rule.reverseRate in parameters) {
            rateParamNames.add(rule.reverseRate);
        }
    }

    const rateValues: number[] = [];
    for (const pName of rateParamNames) {
        const val = parameters[pName];
        const numVal = typeof val === 'number' ? val : parseFloat(String(val));
        if (Number.isFinite(numVal) && numVal > 0) {
            rateValues.push(numVal);
        }
    }
    for (const rule of reactionRules) {
        if (!rule.isFunctionalRate) {
            if (rule.rate && !(rule.rate in parameters)) {
                const numeric = parseFloat(rule.rate);
                if (Number.isFinite(numeric) && numeric > 0) {
                    rateValues.push(Math.abs(numeric));
                }
            }
            if (rule.reverseRate && !(rule.reverseRate in parameters)) {
                const numeric = parseFloat(rule.reverseRate);
                if (Number.isFinite(numeric) && numeric > 0) {
                    rateValues.push(Math.abs(numeric));
                }
            }
        }
    }

    const maxRate = rateValues.length > 0 ? Math.max(...rateValues) : 0;
    const minRate = rateValues.length > 0 ? Math.min(...rateValues) : 0;
    const globalRateSpan = minRate > 0 ? maxRate / minRate : 0;

    // ⚡ Bolt Optimization: Pre-compute the set of available species for O(1) lookups
    const availableSpeciesArray = Object.keys(speciesReactionMap);
    const availableSpeciesSet = new Set(availableSpeciesArray);

    for (const rule of reactionRules) {
        let rateValue: number;
        
        if (rule.isFunctionalRate) {
            rateValue = 1;
        } else {
            const paramVal = parameters[rule.rate];
            if (typeof paramVal === 'number' && Number.isFinite(paramVal)) {
                rateValue = Math.abs(paramVal);
            } else {
                const numeric = parseFloat(rule.rate);
                rateValue = Number.isFinite(numeric) ? Math.abs(numeric) : 1;
            }
        }
        
        const isFast = maxRate > 0 && rateValue >= maxRate / opts.fastSlowThreshold;
        

        const allMols = [...rule.reactants, ...rule.products];
        for (const molExpr of allMols) {
            const canonicalMatch = findMatchingSpeciesName(molExpr, availableSpeciesArray, availableSpeciesSet);
            if (canonicalMatch && speciesReactionMap[canonicalMatch]) {
                if (isFast) {
                    speciesReactionMap[canonicalMatch].fast++;
                } else {
                    speciesReactionMap[canonicalMatch].slow++;
                }
                speciesReactionMap[canonicalMatch].reactions.push(rule.name ?? 'unnamed');
            }
        }
    }
    
    const candidates: QSSACandidate[] = [];
    
    for (const [spName, data] of Object.entries(speciesReactionMap)) {
        if (data.fast < opts.minFastReactions) continue;
        
        const totalReactions = data.fast + data.slow;
        const ratio = totalReactions > 0 ? data.fast / totalReactions : 0;
        
        let recommendation: QSSACandidate['recommendation'] = 'NONE';
        let rationale: string;
        
        if (ratio >= 0.7 && data.fast >= opts.minFastReactions) {
            recommendation = 'QSSA';
            rationale = `${data.fast}/${totalReactions} reactions are fast (rate >= ${opts.fastSlowThreshold}x median)`;
        } else if (data.slow === 0 && data.fast >= 1) {
            recommendation = 'CONSERVATION';
            rationale = 'Species only participates in fast reactions - may be conserved';
        } else {
            rationale = 'Not enough fast reactions for reliable QSSA';
        }
        
        if (recommendation !== 'NONE') {
            candidates.push({
                species: spName,
                fastReactions: data.fast,
                slowReactions: data.slow,
                ratio,
                recommendation,
                rationale,
            });
        }
    }
    
    candidates.sort((a, b) => b.ratio - a.ratio);

    // Apply global rate span threshold check based on rate parameters. If the overall rate constant span
    // is smaller than fastSlowThreshold, QSSA candidates are not reliable.
    const normalizedCandidates = globalRateSpan < opts.fastSlowThreshold
        ? candidates.filter((c) => c.recommendation !== 'QSSA')
        : candidates;
    
    // ⚡ Bolt Optimization: Replace O(N) chained array methods (.filter().length, .filter().slice().map())
    // with a single loop to calculate counts and extract the top QSSA candidates.
    let qssaCount = 0;
    let conservationCount = 0;
    const topQssaCandidates: string[] = [];

    for (const c of normalizedCandidates) {
        if (c.recommendation === 'QSSA') {
            qssaCount++;
            if (topQssaCandidates.length < 3) {
                topQssaCandidates.push(c.species);
            }
        } else if (c.recommendation === 'CONSERVATION') {
            conservationCount++;
        }
    }
    
    let summary: string;
    if (qssaCount === 0 && conservationCount === 0) {
        summary = 'No QSSA candidates found. Model appears well-balanced or lacks fast-slow separation.';
    } else {
        summary = `Found ${qssaCount} QSSA candidate${qssaCount !== 1 ? 's' : ''} and ${conservationCount} conservation law${conservationCount !== 1 ? 's' : ''}.`;
        if (qssaCount > 0) {
            summary += ` Consider using QSSA for: ${topQssaCandidates.join(', ')}${qssaCount > 3 ? '...' : ''}.`;
        }
    }
    
    let reducedModel: QSSAResult['reducedModel'] | undefined;
    
    if (opts.generateReducedModel && qssaCount > 0) {
        reducedModel = {
            eliminatedSpecies: topQssaCandidates,
            modifiedReactions: topQssaCandidates.length * 2,
            estimatedSpeedup: Math.pow(2, topQssaCandidates.length),
        };
    }
    
    return {
        candidates: normalizedCandidates,
        summary,
        ...(reducedModel ? { reducedModel } : {}),
    };
}

export interface QSSAReductionResult {
    model: BNGLModel;
    eliminatedSpecies: string[];
    conservationLaws: Array<{
        conservedTotal: number;
        species: string[];
        coefficients: number[];
    }>;
    modifiedReactions: number;
    estimatedSpeedup: number;
    notes: string[];
}

export function applyQSSAReduction(
    model: BNGLModel,
    speciesToEliminate: string[]
): QSSAReductionResult {
    const eliminatedSet = new Set(speciesToEliminate);
    
    // Build stoichiometric matrix from reactions
    const speciesNames = (model.species ?? []).map(s => s.name);
    // ⚡ Bolt Optimization: Populate speciesIndex iteratively to avoid intermediate array allocations
    const speciesIndex = new Map<string, number>();
    for (let i = 0; i < speciesNames.length; i++) {
        speciesIndex.set(speciesNames[i], i);
    }
    const nSpecies = speciesNames.length;
    
    const reactions = model.reactionRules ?? [];
    const nReactions = reactions.length;
    
    // ⚡ Bolt Optimization: Pre-compute the set of available species for O(1) lookups
    const availableSpeciesSet = new Set(speciesNames);

    // Build stoichiometric matrix N[species][reaction]
    const N: number[][] = Array.from({ length: nSpecies }, () => Array(nReactions).fill(0));
    
    for (let r = 0; r < nReactions; r++) {
        const rule = reactions[r];
        
        // Products add to stoichiometry
        for (const prod of rule.products) {
            const spName = findMatchingSpeciesName(prod, speciesNames, availableSpeciesSet);
            if (spName !== undefined) {
                const idx = speciesIndex.get(spName);
                if (idx !== undefined) {
                    N[idx][r] += 1;
                }
            }
        }
        
        // Reactants subtract from stoichiometry
        for (const reac of rule.reactants) {
            const spName = findMatchingSpeciesName(reac, speciesNames, availableSpeciesSet);
            if (spName !== undefined) {
                const idx = speciesIndex.get(spName);
                if (idx !== undefined) {
                    N[idx][r] -= 1;
                }
            }
        }
    }
    
    // Compute left null space to find conservation laws
    const conservationLaws: Array<{ conservedTotal: number; species: string[]; coefficients: number[] }> = [];
    // ⚡ Bolt Optimization: Use a loop instead of .map().filter() to populate eliminatedIndices safely
    const eliminatedIndices = new Set<number>();
    for (const name of speciesToEliminate) {
        const idx = speciesIndex.get(name);
        if (idx !== undefined) {
            eliminatedIndices.add(idx);
        }
    }
    
    // For each eliminated species, derive its conservation law from reactions
    // QSSA: the fast species reaches equilibrium much faster than other species
    // We express eliminated species as algebraic functions of independent species
    
    const notes: string[] = [];
    
    // Build modified model - keep all rules but mark eliminated species as dependent
    // In true QSSA, we'd replace d[X]/dt = 0 with algebraic constraint
    // For now, we note that these species should be treated as QSSA
    
    const modifiedRules: typeof model.reactionRules = [];
    const ruleNamesModified: string[] = [];
    
    for (const rule of reactions) {
        const hasEliminatedReactant = rule.reactants.some(r => {
            const spName = findMatchingSpeciesName(r, speciesNames, availableSpeciesSet);
            return spName && eliminatedSet.has(spName);
        });
        const hasEliminatedProduct = rule.products.some(p => {
            const spName = findMatchingSpeciesName(p, speciesNames, availableSpeciesSet);
            return spName && eliminatedSet.has(spName);
        });
        
        if (hasEliminatedReactant || hasEliminatedProduct) {
            ruleNamesModified.push(rule.name ?? 'unnamed');
        }
        
        modifiedRules.push(rule);
    }
    
    // Extract conservation relationships for eliminated species
    // These describe how eliminated species relate to total conserved quantities
    for (const elimName of speciesToEliminate) {
        const elimIdx = speciesIndex.get(elimName);
        if (elimIdx === undefined) continue;
        
        // Find rows in stoichiometric matrix where this species appears
        // to understand its conservation pattern
        const coeffs: number[] = [];
        const involvedSpecies: string[] = [];
        
        for (let s = 0; s < nSpecies; s++) {
            let netCoef = 0;
            for (let r = 0; r < nReactions; r++) {
                netCoef += N[s][r];
            }
            
            // Only include species that appear in reactions affecting eliminated species
            if (Math.abs(netCoef) > 1e-10 && !eliminatedSet.has(speciesNames[s])) {
                coeffs.push(netCoef);
                involvedSpecies.push(speciesNames[s]);
            }
        }
        
        if (involvedSpecies.length > 0) {
            // This is a simplified conservation law
            // True QSSA requires solving: d[X_fast]/dt = 0 = f(X_slow)
            conservationLaws.push({
                conservedTotal: 0, // Would be computed from initial conditions
                species: [elimName, ...involvedSpecies],
                coefficients: [1, ...coeffs],
            });
        }
    }
    
    // Build result model - for now, keep original structure
    // The key value is identifying which species are QSSA candidates
    // and providing their conservation relationships
    const resultModel: BNGLModel = {
        ...model,
        reactionRules: modifiedRules,
    };
    
    const estimatedSpeedup = Math.pow(2, speciesToEliminate.length);
    
    notes.push(`Identified ${speciesToEliminate.length} QSSA candidate(s)`);
    notes.push('Conservation laws derived - actual QSSA requires solving algebraic constraints');
    notes.push('Model structure preserved - use with QSSA-enabled solver for reduction');
    
    return {
        model: resultModel,
        eliminatedSpecies: speciesToEliminate,
        conservationLaws,
        modifiedReactions: ruleNamesModified.length,
        estimatedSpeedup,
        notes,
    };
}
