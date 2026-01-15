/**
 * services/simulation/NetworkExpansion.ts
 * 
 * Logic for generating the expanded reaction network from a BNGL model.
 * Decoupled from WebWorker specifics (uses callbacks for progress/cancellation).
 */

import { BNGLModel, GeneratorProgress } from '../../types';
import { BNGLParser } from '../../src/services/graph/core/BNGLParser';
import { Species } from '../../src/services/graph/core/Species';
import { Rxn } from '../../src/services/graph/core/Rxn';
import { NetworkGenerator } from '../../src/services/graph/NetworkGenerator';
import { GraphCanonicalizer } from '../../src/services/graph/core/Canonical';
import { containsRateLawMacro, evaluateFunctionalRate, expandRateLawMacros } from './ExpressionEvaluator';
import { formatSpeciesList } from '../parity/ParityService';
import { isFunctionalRateExpr } from '../parity/PatternMatcher';

export async function generateExpandedNetwork(
    inputModel: BNGLModel,
    checkCancelled: () => void,
    onProgress: (progress: GeneratorProgress) => void
): Promise<BNGLModel> {

    const splitByTopLevelCommas = (s: string): string[] => {
        const parts: string[] = [];
        let current = '';
        let depth = 0;
        for (const ch of s) {
            if (ch === '(') depth++;
            else if (ch === ')') depth = Math.max(0, depth - 1);
            if (ch === ',' && depth === 0) {
                const t = current.trim();
                if (t) parts.push(t);
                current = '';
                continue;
            }
            current += ch;
        }
        const t = current.trim();
        if (t) parts.push(t);
        return parts;
    };

    const normalizePattern = (s: string): string => s.replace(/\s+/g, '');

    const findObservableNameForPattern = (pattern: string): string | undefined => {
        const target = normalizePattern(pattern);
        for (const obs of inputModel.observables) {
            // Only consider Molecules/Species-style observables
            const t = String(obs.type ?? '').toLowerCase();
            if (t && t !== 'molecules' && t !== 'species') continue;

            const patterns = splitByTopLevelCommas(String(obs.pattern ?? ''));
            for (const p of patterns) {
                if (normalizePattern(p) === target) return obs.name;
            }
        }
        return undefined;
    };

    const __seedSpecies = inputModel.species.map((s) => BNGLParser.parseSpeciesGraph(s.name));

    const seedConcentrationMap = new Map<string, number>();
    inputModel.species.forEach((s) => {
        const g = BNGLParser.parseSpeciesGraph(s.name);
        const canonicalName = GraphCanonicalizer.canonicalize(g);
        seedConcentrationMap.set(canonicalName, s.initialConcentration);
    });

    const observableNames = new Set(inputModel.observables.map((o) => o.name));
    const functionNames = new Set((inputModel.functions || []).map((f) => f.name));
    const changingParams = new Set((inputModel.parameterChanges || []).map(c => c.parameter));

    const rules = inputModel.reactionRules.flatMap((r) => {
        // Use observable name for the first reactant when available to match BNG2 macro semantics.
        // Fallback to ridx0 placeholder (always provided at runtime).
        const forwardSubstrateVar = r.reactants.length > 0
            ? (findObservableNameForPattern(r.reactants[0]) ?? 'ridx0')
            : undefined;

        // Use placeholder names for reactants to avoid parsing issues with complex species names.
        // Note: expandRateLawMacros only needs a single symbol name for the substrate variable.
        const expandedRate = expandRateLawMacros(r.rate, forwardSubstrateVar);
        const hasMacro = containsRateLawMacro(r.rate);

        const isForwardFunctional = hasMacro ||
            isFunctionalRateExpr(expandedRate, observableNames, functionNames, changingParams);

        let rate: number;
        if (isForwardFunctional) {
            rate = 1; // Base rate for functional rules (NetworkGenerator needs a numeric rate)
        } else {
            try {
                rate = evaluateFunctionalRate(expandedRate, inputModel.parameters, {}, inputModel.functions);
                if (isNaN(rate)) rate = 0;
            } catch (e) {
                console.warn('[NetworkExpansion] Could not evaluate rate expression:', expandedRate, '- available parameters:', Object.keys(inputModel.parameters), '- using 0');
                rate = 0;
            }
        }

        let reverseRate: number;
        let expandedReverseRate: string | undefined = r.reverseRate;
        let isReverseFunctional = false;

        if (r.reverseRate) {
            // Reverse rule reactants are the forward products; still use ridx0 naming because
            // SimulationLoop only provides ridx* variables (not pidx*).
            const reverseSubstrateVar = r.products.length > 0
                ? (findObservableNameForPattern(r.products[0]) ?? 'ridx0')
                : undefined;

            const revExpanded = expandRateLawMacros(r.reverseRate, reverseSubstrateVar);
            expandedReverseRate = revExpanded;
            const reverseMacro = containsRateLawMacro(r.reverseRate);
            isReverseFunctional = reverseMacro ||
                isFunctionalRateExpr(revExpanded, observableNames, functionNames, changingParams);

            if (isReverseFunctional) {
                reverseRate = 1;
            } else {
                try {
                    reverseRate = evaluateFunctionalRate(revExpanded, inputModel.parameters, {}, inputModel.functions);
                    if (isNaN(reverseRate)) reverseRate = 0;
                } catch (e) {
                    console.warn('[NetworkExpansion] Could not evaluate reverse rate expression:', revExpanded, '- available parameters:', Object.keys(inputModel.parameters), '- using 0');
                    reverseRate = 0;
                }
            }
        } else {
            reverseRate = rate;
            expandedReverseRate = expandedRate;
            isReverseFunctional = isForwardFunctional;
        }

        const ruleStr = `${formatSpeciesList(r.reactants)} -> ${formatSpeciesList(r.products)}`;
        const forwardRule = BNGLParser.parseRxnRule(ruleStr, isForwardFunctional ? 1 : rate);
        forwardRule.name = r.name;
        if (isForwardFunctional) {
            (forwardRule as unknown as { rateExpression?: string; isFunctionalRate?: boolean; propensityFactor?: number }).rateExpression = expandedRate;
            (forwardRule as unknown as { rateExpression?: string; isFunctionalRate?: boolean; propensityFactor?: number }).isFunctionalRate = true;
            (forwardRule as unknown as { rateExpression?: string; isFunctionalRate?: boolean; propensityFactor?: number }).propensityFactor = 1;
        }

        if (r.constraints && r.constraints.length > 0) {
            forwardRule.applyConstraints(r.constraints, (s) => BNGLParser.parseSpeciesGraph(s));
        }

        if (r.isBidirectional) {
            const reverseRuleStr = `${formatSpeciesList(r.products)} -> ${formatSpeciesList(r.reactants)}`;
            const reverseRule = BNGLParser.parseRxnRule(reverseRuleStr, isReverseFunctional ? 1 : reverseRate);
            reverseRule.name = r.name + '_rev';
            if (isReverseFunctional && expandedReverseRate) {
                (reverseRule as unknown as { rateExpression?: string; isFunctionalRate?: boolean }).rateExpression = expandedReverseRate;
                (reverseRule as unknown as { rateExpression?: string; isFunctionalRate?: boolean }).isFunctionalRate = true;
            }
            return [forwardRule, reverseRule];
        }

        return [forwardRule];
    });

    // Debug: print prepared rules (name, numeric rate or rateExpression, isFunctional flag)
    try {
        console.log('[NetworkExpansion] Prepared rules:', rules.map(r => ({
            name: (r as any).name,
            rate: (r as any).rate ?? (r as any).rateExpression ?? null,
            isFunctional: !!(r as any).isFunctionalRate
        })));
    } catch (e) {
        console.warn('[NetworkExpansion] Failed to stringify prepared rules for debug:', e);
    }

    // Use network options from BNGL file if available, with reasonable defaults
    const networkOpts = inputModel.networkOptions || {};
    const maxStoich = networkOpts.maxStoich ? new Map(Object.entries(networkOpts.maxStoich)) : 500;

    const generator = new NetworkGenerator({
        maxSpecies: networkOpts.maxSpecies ?? 20000,
        maxReactions: networkOpts.maxReactions ?? 100000,
        maxIterations: networkOpts.maxIter ?? 5000,
        maxAgg: networkOpts.maxAgg ?? 500,
        maxStoich,
        // Pass compartment info for cBNGL volume scaling (bimolecular rates scaled by 1/volume)
        compartments: inputModel.compartments?.map((c) => ({
            name: c.name,
            dimension: c.dimension,
            size: c.size,
            parent: c.parent
        }))
    });

    // Set up progress callback
    // Update frequency: 250ms chosen to balance UI responsiveness
    let lastProgressTime = 0;
    const throttledProgressCallback = (progress: GeneratorProgress) => {
        const now = Date.now();
        if (now - lastProgressTime >= 250) {
            lastProgressTime = now;
            onProgress(progress);
        }
    };

    let result: { species: Species[]; reactions: Rxn[] };
    try {
        result = await generator.generate(__seedSpecies, rules, throttledProgressCallback);
        console.log(`[NetExpDebug] Generated ${result.reactions.length} reactions from ${rules.length} rules.`);
        // Final progress update
        onProgress({
            iteration: networkOpts.maxIter ?? 5000,
            species: result.species.length,
            reactions: result.reactions.length,
            memoryUsed: 0,
            timeElapsed: 0
        });
    } catch (e: any) {
        console.error('[NetworkExpansion] generator.generate() FAILED:', e.message);
        throw e;
    }

    checkCancelled();

    // Map of canonical seed names to their species objects for efficient lookup
    const seedMap = new Map<string, { isConstant: boolean }>();
    for (const sp of inputModel.species) {
        try {
            const seedG = BNGLParser.parseSpeciesGraph(sp.name);
            const canon = GraphCanonicalizer.canonicalize(seedG);
            seedMap.set(canon, { isConstant: !!sp.isConstant });
            console.error(`[NetworkExpansion] Seed: '${sp.name}' -> Canonical: '${canon}', Constant: ${sp.isConstant}`);
        } catch (e) {
            console.warn(`[NetworkExpansion] Could not parse seed species '${sp.name}':`, e);
        }
    }

    const generatedSpecies = result.species.map((s: Species) => {
        const canonicalName = GraphCanonicalizer.canonicalize(s.graph);
        const concentration = seedConcentrationMap.get(canonicalName) || (s.concentration || 0);

        // Lookup in pre-canonicalized seed map
        const seedInfo = seedMap.get(canonicalName);
        const isConstant = seedInfo?.isConstant || false;

        console.error(`[NetworkExpansion] Expanded Species: '${canonicalName}', Constant: ${isConstant}`);

        return { name: canonicalName, initialConcentration: concentration, isConstant };
    });

    const generatedReactions = result.reactions.map((r: Rxn, idx: number) => {
        try {
            const rateExpression = (r as any).rateExpression ?? null;
            // Rxn objects preserve `rateExpression` but do not carry an explicit
            // `isFunctionalRate` flag through network generation.
            // If a reaction has a `rateExpression`, it must be evaluated at runtime.
            const isFunctionalRate = rateExpression != null && String(rateExpression).trim().length > 0;

            const reaction = {
                reactants: r.reactants.map((ridx: number) => GraphCanonicalizer.canonicalize(result.species[ridx].graph)),
                products: r.products.map((pidx: number) => GraphCanonicalizer.canonicalize(result.species[pidx].graph)),
                rate: rateExpression || String(r.rate),
                rateConstant: typeof r.rate === 'number' ? r.rate : 0,
                isFunctionalRate,
                rateExpression,
                propensityFactor: (r as unknown as { propensityFactor?: number }).propensityFactor ?? 1,
                productStoichiometries: (r as any).productStoichiometries ?? null
            };
            return reaction;
        } catch (e: any) {
            console.error(`[NetworkExpansion] Error mapping reaction ${idx}:`, e.message);
            throw e;
        }
    });

    const generatedModel: BNGLModel = {
        ...inputModel,
        species: generatedSpecies,
        reactions: generatedReactions,
    };

    return generatedModel;
}
