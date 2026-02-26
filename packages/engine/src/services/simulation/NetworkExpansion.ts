/**
 * services/simulation/NetworkExpansion.ts
 * 
 * Logic for generating the expanded reaction network from a BNGL model.
 * Decoupled from WebWorker specifics (uses callbacks for progress/cancellation).
 * 
 * PARITY NOTE: This file orchestrates the "generate_network" action found in BNG2.
 * Reference: bionetgen/bng2/Network3/src/run_network.cpp (C++ implementation)
 * Reference: bionetgen/bng2/Perl2/BNGAction.pm (Perl coordination)
 */

import type { BNGLModel, GeneratorProgress } from '../../types';
import { BNGLParser } from '../graph/core/BNGLParser';
import { Species } from '../graph/core/Species';
import { Rxn } from '../graph/core/Rxn';
import { NetworkGenerator } from '../graph/NetworkGenerator';
import { GraphCanonicalizer } from '../graph/core/Canonical';
import { GraphMatcher } from '../graph/core/Matcher';
import { containsRateLawMacro, evaluateFunctionalRate, expandRateLawMacros } from './ExpressionEvaluator';
import { formatSpeciesList } from '../parity/ParityService';
import { isFunctionalRateExpr, countPatternMatches, isSpeciesMatch, removeCompartment, getCompartment } from '../parity/PatternMatcher';

/**
 * Main entry point for network generation.
 * Coordinates input parsing, rule expansion, and network generation.
 */
export async function generateExpandedNetwork(
    inputModel: BNGLModel,
    checkCancelled: () => void,
    onProgress: (progress: GeneratorProgress) => void
): Promise<BNGLModel> {

    // Helper: Split pattern string by commas, respecting parentheses depth.
    // Use Case: Observables like "A(), B()" need to be split, but "A(b,c)" should not.
    // CAUTION: Regex splitting on ',' fails for nested parenthesis.
    // Reference: BNG2 relies on proper tokenization; this is a lightweight parser equivalent.
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

    // Helper: Remove whitespace from comparison strings.
    // BNG2 is generally whitespace-insensitive for pattern matching.
    const normalizePattern = (s: string): string => s.replace(/\s+/g, '');

    // Helper: Identify if a reactant pattern string maps to a defined Observable.
    // BNG2 Logic: In rate laws, "A()" might refer to the concentration of observable "A".
    // We need to resolve this name to pass it correctly to the simulation loop.
    const findObservableNameForPattern = (pattern: string): string | undefined => {
        const target = normalizePattern(pattern);
        for (const obs of inputModel.observables) {
            // Only consider Molecules/Species-style observables (Molecules is default in BNGL)
            // Reference: BNG2 Manual - Observable types.
            const t = String(obs.type ?? '').toLowerCase();
            if (t && t !== 'molecules' && t !== 'species') continue;

            const patterns = splitByTopLevelCommas(String(obs.pattern ?? ''));
            for (const p of patterns) {
                if (normalizePattern(p) === target) return obs.name;
            }
        }
        return undefined;
    };

    // -------------------------------------------------------------------------
    // 1. Initial Species Setup
    // -------------------------------------------------------------------------

    // BNG2 Logic: Seed species are the starting points for network generation.
    // They are parsed from the BNGL string representation into Graph form.
    const __seedSpecies = inputModel.species.map((s) => BNGLParser.parseSpeciesGraph(s.name));

    const evalParameterMap = new Map<string, number>();
    for (const [name, value] of Object.entries(inputModel.parameters || {})) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
            evalParameterMap.set(name, numeric);
        }
    }
    // BNGL uses Na in seed expressions generated from SBML concentration imports.
    if (!evalParameterMap.has('Na')) {
        evalParameterMap.set('Na', 1);
    }
    const inferSeedCompartment = (speciesName: string): string => {
        const prefixedCompartment = speciesName.match(/^@([^:]+)::?/);
        if (prefixedCompartment?.[1]) return prefixedCompartment[1];
        const atSuffix = speciesName.match(/@([^@:\s]+)$/);
        return atSuffix?.[1] || '';
    };
    const normalizeAmountLikeSeedExpression = (
        expression: string,
        evaluated: number,
        speciesName: string
    ): number => {
        if (!Number.isFinite(evaluated)) return 0;
        const compartment = inferSeedCompartment(speciesName);
        if (!compartment) return evaluated;
        const volumeKey = `__compartment_${compartment}__`;
        const volume = Number(evalParameterMap.get(volumeKey));
        if (!Number.isFinite(volume) || volume <= 0 || Math.abs(volume - 1) < 1e-12) return evaluated;
        const hasNaLikeToken = /\bNa\b/.test(expression) || /\bquantity_to_number_factor\b/.test(expression);
        if (!hasNaLikeToken) return evaluated;
        const compact = expression.replace(/\s+/g, '');
        const hasVolumeToken = compact.includes(volumeKey);
        const hasVolumeInDenominator = compact.includes(`/${volumeKey}`);
        if (!hasVolumeToken || hasVolumeInDenominator) return evaluated;
        const normalized = evaluated / volume;
        return Number.isFinite(normalized) && normalized >= 0 ? normalized : evaluated;
    };
    const evalFunctionMap = new Map(
        (inputModel.functions || []).map((f) => [f.name, { args: f.args, expr: f.expression } as any])
    );
    const resolveSeedConcentration = (species: { name?: string; initialConcentration: number; initialExpression?: string }): number => {
        const raw = (species as any).initialConcentration;
        if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
        if (typeof raw === 'string' && raw.trim().length > 0) {
            const parsed = Number(raw);
            if (Number.isFinite(parsed)) return parsed;
        }
        const expression = typeof species.initialExpression === 'string' ? species.initialExpression.trim() : '';
        if (!expression) return 0;
        try {
            const evaluated = BNGLParser.evaluateExpression(
                expression,
                evalParameterMap,
                new Set(),
                evalFunctionMap
            );
            if (!Number.isFinite(evaluated)) return 0;
            return normalizeAmountLikeSeedExpression(expression, evaluated, String(species.name || ''));
        } catch {
            return 0;
        }
    };
    const resolvedSeedConcentrations = inputModel.species.map((s) => resolveSeedConcentration(s));

    // CRITICAL FIX (Parity Issue 2): Map Canonical Names -> Initial Concentrations
    // BNG2 evaluates species concentrations *after* parameters.
    // In our Visitor, we pre-evaluate them. Here, we build a lookup map.
    // When generating species, we check this map to assign the correct initial value (e.g. "A0" -> 100).
    // Reference: BNG2.pl parameter evaluation order.
    const seedConcentrationMap = new Map<string, number>();
    inputModel.species.forEach((s, index) => {
        const g = BNGLParser.parseSpeciesGraph(s.name);
        const canonicalName = GraphCanonicalizer.canonicalize(g);
        seedConcentrationMap.set(canonicalName, resolvedSeedConcentrations[index] ?? 0);
    });

    // -------------------------------------------------------------------------
    // 2. Rule Preparation
    // -------------------------------------------------------------------------

    // Pre-calculate sets for fast lookup during functional rate detection.
    const observableNames = new Set(inputModel.observables.map((o) => o.name));
    const functionNames = new Set((inputModel.functions || []).map((f) => f.name));
    const changingParams = new Set((inputModel.parameterChanges || []).map(c => c.parameter));

    // Build a map of local functions (BNG2 %x:: syntax).
    // A "local function" has args (e.g., f_synth(x)) and evaluates observables
    // within the REACTANT SPECIES rather than globally. BNG2 computes these as
    // per-reaction constant parameters at network-generation time.
    // Reference: BNG2 RxnRule.pm – local function expansion.
    interface LocalFnDef {
        contextVar: string;
        observablePatterns: Record<string, string>; // obsName -> pattern string
        bodyTemplate: string; // expression with obsName(var) refs replaced by just obsName
    }
    const localFunctionMap = new Map<string, LocalFnDef>();
    for (const fn of (inputModel.functions || [])) {
        if (fn.args.length === 1) {
            const contextVar = fn.args[0];
            const escapedCtx = contextVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const obsCallRe = new RegExp(`\\b([A-Za-z_][A-Za-z0-9_]*)\\s*\\(\\s*${escapedCtx}\\s*\\)`, 'g');
            const observablePatterns: Record<string, string> = {};
            let bodyTemplate = fn.expression;
            let callMatch: RegExpExecArray | null;
            // Reset lastIndex for global regex on each function
            obsCallRe.lastIndex = 0;
            while ((callMatch = obsCallRe.exec(fn.expression)) !== null) {
                const obsName = callMatch[1];
                const obs = inputModel.observables.find((o) => o.name === obsName);
                if (obs) {
                    observablePatterns[obsName] = obs.pattern;
                    // strip the "(var)" from body template so result is just obsName
                    bodyTemplate = bodyTemplate.replace(callMatch[0], obsName);
                }
            }
            if (Object.keys(observablePatterns).length > 0) {
                localFunctionMap.set(fn.name, { contextVar, observablePatterns, bodyTemplate });
            }
        }
    }

    // Helper: Detect a local-function call in a rate expression and return its context, or null.
    const detectLocalFn = (rateStr: string): (LocalFnDef & { functionName: string }) | null => {
        for (const [fnName, localFn] of localFunctionMap) {
            const escapedFn = fnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const escapedCtx = localFn.contextVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const callRe = new RegExp(`^\\s*${escapedFn}\\s*\\(\\s*${escapedCtx}\\s*\\)\\s*$`);
            if (callRe.test(rateStr)) return { ...localFn, functionName: fnName };
        }
        return null;
    };

    // BNG2 Rule: Rules are expanded from the model definition.
    // We map over each rule to determine if it uses functional rates (non-mass action).
    const rules = inputModel.reactionRules.flatMap((r) => {
        // BNG2 Semantics: The first reactant often defines the "substrate" variable in rate laws.
        // E.g., for "A() -> B() k_cat*A", we need to map "A" to the runtime observable.
        const forwardSubstrateVar = r.reactants.length > 0
            ? (findObservableNameForPattern(r.reactants[0]) ?? 'ridx0')
            : undefined;

        // Use placeholder names (ridx0, etc.) for reactants to avoid ambiguity in complex expressions.
        const expandedRate = expandRateLawMacros(r.rate, forwardSubstrateVar);
        const hasMacro = containsRateLawMacro(r.rate); // Logic like Sat() or MM()

        // Detect local function call (must be checked BEFORE isFunctionalRateExpr below).
        // Local functions are NOT dynamic rates; they're evaluated per-species at network-generation time.
        const localFnDetected = detectLocalFn(r.rate);

        // Check if the rate depends on observables, functions, or changing parameters (Time dependent).
        // FIX: Do NOT mark as functional if only dependent on changing parameters.
        // Local function calls are also excluded here since they are handled separately.
        const isForwardFunctional = !localFnDetected && (hasMacro ||
            isFunctionalRateExpr(expandedRate, observableNames, functionNames, new Set()));

        let rate: number;
        if (r.isArrhenius) {
            // Arrhenius rates are computed by NetworkGenerator from energy patterns
            rate = 0;
        } else if (localFnDetected) {
            // Local function: rate will be computed per-species in NetworkGenerator.
            // Use 0 as placeholder; NetworkGenerator overrides this via localFunctionContext.
            rate = 0;
        } else if (isForwardFunctional) {
            // For functional rates, the base rateConstant is effectively 1 (or a scaling factor).
            // The actual rate is calculated at every time step in SimulationLoop.
            rate = 1;
        } else {
            try {
                // Parity Check: Evaluate constant expressions using the Model's parameter context.
                const paramMap = new Map(Object.entries(inputModel.parameters || {}));
                rate = BNGLParser.evaluateExpression(expandedRate, paramMap, new Set(), new Map((inputModel.functions || []).map(f => [f.name, { args: f.args, expr: f.expression } as any])));
                if (isNaN(rate)) rate = 0;
            } catch (e) {
                console.warn('[NetworkExpansion] Could not evaluate rate expression:', expandedRate, '- available parameters:', Object.keys(inputModel.parameters || {}), '- using 0');
                rate = 0;
            }
        }

        // -------------------------------------------------------------------------
        // Reverse Rule Handling (Bidirectional Rules)
        // -------------------------------------------------------------------------
        let reverseRate: number;
        let expandedReverseRate: string | undefined = r.reverseRate;
        let isReverseFunctional = false;

        if (r.reverseRate) {
            // BNG2 Logic: Bidirectional rules are split into two unidirectional rules.
            // Reverse rule reactants are the forward products.
            // Reference: BNGAction.pm (transform_rules)
            const reverseSubstrateVar = r.products.length > 0
                ? (findObservableNameForPattern(r.products[0]) ?? 'ridx0')
                : undefined;

            const revExpanded = expandRateLawMacros(r.reverseRate, reverseSubstrateVar);
            expandedReverseRate = revExpanded;
            const reverseMacro = containsRateLawMacro(r.reverseRate);
            isReverseFunctional = reverseMacro ||
                isFunctionalRateExpr(revExpanded, observableNames, functionNames, new Set());

            if (r.isReverseArrhenius) {
                // Arrhenius rates are computed by NetworkGenerator from energy patterns
                reverseRate = 0;
            } else if (isReverseFunctional) {
                reverseRate = 1;
            } else {
                try {
                    const paramMap = new Map(Object.entries(inputModel.parameters || {}));
                    reverseRate = BNGLParser.evaluateExpression(revExpanded, paramMap, new Set(), new Map((inputModel.functions || []).map(f => [f.name, { args: f.args, expr: f.expression } as any])));
                    if (isNaN(reverseRate)) reverseRate = 0;
                } catch (e) {
                    console.warn('[NetworkExpansion] Could not evaluate reverse rate expression:', revExpanded, '- available parameters:', Object.keys(inputModel.parameters || {}), '- using 0');
                    reverseRate = 0;
                }
            }
        } else {
            // For reversible rules without explicit reverse rate, assume symmetry (rare in BNGL, usually explicit).
            reverseRate = rate;
            expandedReverseRate = expandedRate;
            isReverseFunctional = isForwardFunctional;
        }

        // Create Forward Rule Object
        const ruleStr = `${formatSpeciesList(r.reactants)} -> ${formatSpeciesList(r.products)}`;

        const forwardRule = BNGLParser.parseRxnRule(
            ruleStr,
            isForwardFunctional ? 1 : rate,
            undefined,
            {
                isMoveConnected: !!(r as any).moveConnected,
                isMatchOnce: !!(r as any).matchOnce,
            }
        );
        if (r.name) {
            forwardRule.name = r.name;
        }
        if ((r as any).deleteMolecules) {
            (forwardRule as any).isDeleteMolecules = true;
            let globalMolOffset = 0;
            const deleteIndices: number[] = [];
            for (const reactantPattern of forwardRule.reactants) {
                for (let molIdx = 0; molIdx < reactantPattern.molecules.length; molIdx++) {
                    deleteIndices.push(globalMolOffset + molIdx);
                }
                globalMolOffset += reactantPattern.molecules.length;
            }
            forwardRule.deleteMolecules = deleteIndices;
        }
        // Preserve BNGL rule modifiers.
        (forwardRule as any).totalRate = !!(r as any).totalRate;
        // Always preserve original rate expression for parameter updates
        (forwardRule as any).originalRate = expandedRate;
        (forwardRule as unknown as { rateExpression?: string; isFunctionalRate?: boolean; propensityFactor?: number }).rateExpression = expandedRate;

        if (isForwardFunctional) {
            (forwardRule as any).isFunctionalRate = true;
            (forwardRule as any).propensityFactor = 1;
        }

        // Local function: tag the rule so NetworkGenerator can compute per-species rates.
        // These are BNG2-style %x:: rules where f(x) evaluates observable patterns within
        // the matched reactant species (a constant per concrete reaction at network-gen time).
        if (localFnDetected) {
            (forwardRule as any).localFunctionContext = {
                functionName: localFnDetected.functionName,
                contextVar: localFnDetected.contextVar,
                observablePatterns: localFnDetected.observablePatterns,
                bodyTemplate: localFnDetected.bodyTemplate,
            };
            // Local function rates are statically computed; no dynamic rateExpression.
            (forwardRule as any).rateExpression = undefined;
            (forwardRule as any).originalRate = undefined;
        }

            // Propagate Arrhenius fields for forward rule
            if (r.isArrhenius) {
                (forwardRule as any).isArrhenius = true;
                (forwardRule as any).arrheniusPhi = r.arrheniusPhi;
                (forwardRule as any).arrheniusEact = r.arrheniusEact;
                (forwardRule as any).arrheniusA = r.arrheniusA;
            }
        

        // Apply Constraints (if any)
        if (r.constraints && r.constraints.length > 0) {
            forwardRule.applyConstraints(r.constraints, (s) => BNGLParser.parseSpeciesGraph(s));
        }

        // Create Reverse Rule Object if Bidirectional
        if (r.isBidirectional) {
            const reverseRuleStr = `${formatSpeciesList(r.products)} -> ${formatSpeciesList(r.reactants)}`;
            const reverseRule = BNGLParser.parseRxnRule(
                reverseRuleStr,
                isReverseFunctional ? 1 : reverseRate,
                undefined,
                {
                    isMoveConnected: !!(r as any).moveConnected,
                    isMatchOnce: !!(r as any).matchOnce,
                }
            );
            if (r.name) {
                reverseRule.name = r.name + '_rev';
            }

            const reverseConstraints: string[] = [];
            for (const c of forwardRule.excludeReactants) {
                reverseConstraints.push(`exclude_products(${c.reactantIndex + 1}, ${c.pattern.toString()})`);
            }
            for (const c of forwardRule.includeReactants) {
                reverseConstraints.push(`include_products(${c.reactantIndex + 1}, ${c.pattern.toString()})`);
            }
            for (const c of forwardRule.excludeProducts) {
                reverseConstraints.push(`exclude_reactants(${c.productIndex + 1}, ${c.pattern.toString()})`);
            }
            for (const c of forwardRule.includeProducts) {
                reverseConstraints.push(`include_reactants(${c.productIndex + 1}, ${c.pattern.toString()})`);
            }
            if (reverseConstraints.length > 0) {
                reverseRule.applyConstraints(reverseConstraints, (s) => BNGLParser.parseSpeciesGraph(s));
            }

            (reverseRule as any).totalRate = !!(r as any).totalRate;
            (reverseRule as any).originalRate = expandedReverseRate;
            (reverseRule as any).rateExpression = expandedReverseRate;

            if (isReverseFunctional && expandedReverseRate) {
                (reverseRule as any).isFunctionalRate = true;
            }

            // Propagate Arrhenius fields for reverse rule
            if (r.isReverseArrhenius) {
                (reverseRule as any).isArrhenius = true;
                (reverseRule as any).arrheniusPhi = r.reverseArrheniusPhi;
                (reverseRule as any).arrheniusEact = r.reverseArrheniusEact;
                (reverseRule as any).arrheniusA = r.reverseArrheniusA;
            } else if (r.isArrhenius) {
                // Fallback to symmetry-based reverse if only forward is Arrhenius
                (reverseRule as any).isArrhenius = true;
                // Reverse Arrhenius symmetry factor: 1 - phi (BNG2 parity)
                (reverseRule as any).arrheniusPhi = r.arrheniusPhi ? `1 - (${r.arrheniusPhi})` : "0.5";
                (reverseRule as any).arrheniusEact = r.arrheniusEact;
                (reverseRule as any).arrheniusA = r.arrheniusA;
            }

            return [forwardRule, reverseRule];
        }

        return [forwardRule];
    });

    const VERBOSE_NETEXP_DEBUG = false; // set true to enable network expansion debug
    if (VERBOSE_NETEXP_DEBUG) {
        try {
            console.log('[NetworkExpansion] Prepared rules:', rules.map(r => ({
                name: (r as any).name,
                rate: (r as any).rate ?? (r as any).rateExpression ?? null,
                isFunctional: !!(r as any).isFunctionalRate
            })));
        } catch (e) {
            console.warn('[NetworkExpansion] Failed to stringify prepared rules for debug:', e);
        }
    }

    // -------------------------------------------------------------------------
    // 3. Network Generator Initialization
    // -------------------------------------------------------------------------

    // Use network options from BNGL file if available, with reasonable defaults
    // Reference: BNG2 generic_generate_network arguments.
    // maxStoich: Limits size of complexes (prevent infinite polymerization).
    const networkOpts = inputModel.networkOptions || {};
    const maxStoich = networkOpts.maxStoich ? new Map(Object.entries(networkOpts.maxStoich)) : 500;

    // Instantiate the core generator (Parity with BNG2 Network3 C++ engine)
    const generator = new NetworkGenerator({
        maxSpecies: networkOpts.maxSpecies ?? 20000,
        maxReactions: networkOpts.maxReactions ?? 100000,
        maxIterations: networkOpts.maxIter ?? 5000,
        maxAgg: networkOpts.maxAgg ?? 500,
        maxStoich,
        // Model Compartment definitions for volume scaling
        // Reference: cBNGL volume scaling in Network3/src/network.cpp
        compartments: inputModel.compartments?.map((c) => ({
            name: c.name,
            dimension: c.dimension,
            size: c.size,
            parent: c.parent
        })),
        seedConcentrationMap,
        energyPatterns: inputModel.energyPatterns,
        parameters: new Map(Object.entries(inputModel.parameters || {}))
    });

    // ... (rest of generation code same) ... 
    // (omitted for brevity, skipping to result mapping)
    // Actually I can't skip with replace_file_content unless I replace a chunk.

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
        if (VERBOSE_NETEXP_DEBUG) console.log(`[NetExpDebug] Generated ${result.reactions.length} reactions from ${rules.length} rules.`);
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
    type SeedEntry = { graph: ReturnType<typeof BNGLParser.parseSpeciesGraph>; concentration: number; isConstant: boolean };
    const seedEntries = inputModel.species.map((sp, i) => ({
        graph: __seedSpecies[i],
        concentration: resolvedSeedConcentrations[i] ?? 0,
        isConstant: !!sp.isConstant,
    })) as SeedEntry[];
    for (const sp of inputModel.species) {
        try {
            const seedG = BNGLParser.parseSpeciesGraph(sp.name);
            const canon = GraphCanonicalizer.canonicalize(seedG);
            seedMap.set(canon, { isConstant: !!sp.isConstant });
            if (VERBOSE_NETEXP_DEBUG) console.log(`[NetworkExpansion] Seed: '${sp.name}' -> Canonical: '${canon}', Constant: ${sp.isConstant}`);
        } catch (e) {
            console.warn(`[NetworkExpansion] Could not parse seed species '${sp.name}':`, e);
        }
    }

    // -------------------------------------------------------------------------
    // 4. Map Results to API Format
    // -------------------------------------------------------------------------

    // BNG2 Logic: Identify Species and assign Initial Concentrations.
    // Unlike implicit simulation, we must map back to the input "seed" concentrations.
    const generatedSpecies = result.species.map((s: Species) => {
        // Canonicalize the graph representation for consistent string keys.
        const canonicalName = GraphCanonicalizer.canonicalize(s.graph);
        let matchedSeedEntry: SeedEntry | undefined;

        // Lookup exact match in the pre-calculated seed map.
        let concentration = seedConcentrationMap.get(canonicalName);

        // PARITY FIX: Loose Matching for Compartment Syntax
        // BNG2 allows flexible compartment syntax (`A@C` vs `A` in `C`).
        // If exact canonical match fails, we normalize whitespace and try again.
        if (concentration === undefined) {
            const normalizedTarget = canonicalName.replace(/\s+/g, '');
            for (const [seedCanon, seedConc] of seedConcentrationMap.entries()) {
                if (seedCanon.replace(/\s+/g, '') === normalizedTarget) {
                    concentration = seedConc;
                    if (VERBOSE_NETEXP_DEBUG) console.log(`[NetworkExpansion] Found concentration via loose match for '${canonicalName}': ${concentration}`);
                    break;
                }
            }
        }

        // Structural fallback for canonicalization-order discrepancies.
        // This ensures seed concentrations transfer even if canonical string formatting differs.
        if (concentration === undefined) {
            for (const entry of seedEntries) {
                const forward = GraphMatcher.matchesPattern(entry.graph, s.graph);
                if (!forward) continue;
                const backward = GraphMatcher.matchesPattern(s.graph, entry.graph);
                if (!backward) continue;
                concentration = entry.concentration;
                matchedSeedEntry = entry;
                if (VERBOSE_NETEXP_DEBUG) {
                    console.log(`[NetworkExpansion] Found concentration via structural match for '${canonicalName}': ${concentration}`);
                }
                break;
            }
        }

        // Default to 0 if no seed match found (generated species start at 0).
        if (concentration === undefined) {
            concentration = (s.concentration || 0);
        }

        // Check if this species was marked as "Constant" (Fixed concentration) in inputs.
        // Reference: BNG2 "Species" block attributes.
        const seedInfo = seedMap.get(canonicalName);
        const isConstant = seedInfo?.isConstant ?? matchedSeedEntry?.isConstant ?? false;

        if (VERBOSE_NETEXP_DEBUG) {
            console.log(`[NetworkExpansion] Expanded Species: '${canonicalName}', Conc: ${concentration}, Constant: ${isConstant}`);
        }

        return { name: canonicalName, initialConcentration: concentration, isConstant };
    });

    const observableNamesSet = new Set(inputModel.observables.map(o => o.name));
    const functionNamesSet = new Set((inputModel.functions || []).map(f => f.name));
    const changingParameterNames = new Set<string>();
    if (inputModel.parameterChanges) {
        inputModel.parameterChanges.forEach(c => changingParameterNames.add(c.parameter));
    }

    // Preserve TotalRate on generated reactions even if the core generator drops it.
    const totalRateByRuleName = new Map<string, boolean>();
    for (const rr of inputModel.reactionRules) {
        if (!rr.name) continue;
        const val = !!(rr as any).totalRate;
        totalRateByRuleName.set(rr.name, val);
        if (rr.isBidirectional) totalRateByRuleName.set(rr.name + '_rev', val);
    }

    // BNG2 Logic: Map generated reactions to output format.
    // Ensure all reactants/products are canonicalized strings.
    const generatedReactions = result.reactions.map((r: Rxn, idx: number) => {
        try {
            const rateExpression = (r as any).rateExpression ?? null;
            const statFactor = Number.isFinite((r as any).statFactor) ? Number((r as any).statFactor) : 1;
            const foldedRateExpression =
                rateExpression != null && Math.abs(statFactor - 1) > 1e-15
                    ? `(${statFactor})*(${rateExpression})`
                    : rateExpression;
            // Functional Rate Flag Logic:
            // Rxn objects generated by NetworkGenerator preserve `rateExpression` strings but loose the boolean flag.
            // We re-derive it: if a rate expression exists, it IS a functional rate.
            const isFunctionalRate = foldedRateExpression != null && isFunctionalRateExpr(foldedRateExpression, observableNamesSet, functionNamesSet, changingParameterNames);
            const degeneracy = (r as any).degeneracy ?? 1;

            const rxnName = (r as any).name ?? '';
            const totalRate = (r as any).totalRate ?? totalRateByRuleName.get(rxnName) ?? false;

            const reaction = {
                reactants: r.reactants.map((ridx: number) => GraphCanonicalizer.canonicalize(result.species[ridx].graph)),
                products: r.products.map((pidx: number) => GraphCanonicalizer.canonicalize(result.species[pidx].graph)),
                // FIX: Use originalRate to preserve parameter names for non-functional updates
                rate: foldedRateExpression || (r as any).originalRate || String(r.rate),
                rateConstant: typeof r.rate === 'number' ? r.rate : 0,
                isFunctionalRate,
                rateExpression: foldedRateExpression,
                degeneracy,
                totalRate,
                // Preserve the rule name so NetworkExporter can look up pre-assigned _rateLawN names
                name: rxnName,
                propensityFactor: (r as unknown as { propensityFactor?: number }).propensityFactor ?? 1,
                productStoichiometries: (r as any).productStoichiometries ?? null,
                scalingVolume: (r as any).scalingVolume ?? null
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

    // -------------------------------------------------------------------------
    // 5. Pre-Compute Concrete Observables (Performance Optimization)
    // -------------------------------------------------------------------------

    // Optimization: Inverted Index (Molecule Name -> Species Indices)
    // BNG2 Naive Approach: Iterate all species for all observables (O(S * O)).
    // Optimized Approach: Filter candidate species by molecule content first.
    // Reduces complexity to O(O * Candidates), massive speedup for large networks.
    const molToSpecies = new Map<string, Set<number>>();
    generatedSpecies.forEach((s, idx) => {
        // Extract base molecule names from the string representation
        const mols = s.name.split('.').map(m => {
            const bare = m.replace(/^@[^:]+::?/, '').replace(/@[^@]+$/, '');
            return bare.split('(')[0];
        });
        mols.forEach(m => {
            if (!molToSpecies.has(m)) molToSpecies.set(m, new Set());
            molToSpecies.get(m)!.add(idx);
        });
    });

    try {
        (generatedModel as any).concreteObservables = inputModel.observables.map(obs => {
            const patterns = splitByTopLevelCommas(String(obs.pattern || ''));
            const coeffMap = new Map<number, number>();

            // Helper: Check count constraints (e.g., A(b!+) matches if b is bound).
            // Matches BNG2 syntax like 'match>=5' or specific connectivity checks.
            const matchesCountConstraint = (speciesStr: string, constraint: string): boolean | null => {
                const m = constraint.trim().match(/^([A-Za-z0-9_]+)\s*(==|<=|>=|<|>)\s*(\d+)$/);
                if (!m) return null;
                const mol = m[1];
                const op = m[2];
                const n = Number.parseInt(m[3], 10);
                const c = countPatternMatches(speciesStr, mol);
                switch (op) {
                    case '==': return c === n;
                    case '<=': return c <= n;
                    case '>=': return c >= n;
                    case '<': return c < n;
                    case '>': return c > n;
                    default: return null;
                }
            };

            const obsType = (obs.type ?? '').toLowerCase();

            for (const pat of patterns) {
                const trimmedPat = pat.trim();
                if (!trimmedPat) continue;

                // Optimization Step 1: Filter Candidates
                // Remove compartment tags to find base molecules required by the pattern.
                const cleanPat = removeCompartment(trimmedPat);
                const patMols = cleanPat.split('.').map(m => m.split('(')[0]).filter(Boolean);

                let candidates: Iterable<number> = generatedSpecies.keys();

                // Intersect sets of species containing ALL required molecules.
                if (patMols.length > 0) {
                    let candidateSet: Set<number> | null = null;
                    for (const pm of patMols) {
                        const set = molToSpecies.get(pm);
                        if (!set) { candidateSet = new Set(); break; }
                        if (!candidateSet) candidateSet = new Set(set);
                        else {
                            for (const c of candidateSet) {
                                if (!set.has(c)) candidateSet.delete(c);
                            }
                        }
                        if (candidateSet.size === 0) break;
                    }
                    candidates = candidateSet ?? [];
                }

                // Optimization Step 2: Detailed Matching on Candidates
                for (const i of candidates) {
                    const s = generatedSpecies[i];
                    let count = 0;

                    if (obsType === 'species') {
                        // "Species" Type Observable: pattern must match the FULL species pattern.
                        // Do not split on '.' because that turns multi-molecule patterns (e.g., L.L)
                        // into independent monomer checks and overcounts dimers/complexes.
                        const cMatch = matchesCountConstraint(s.name, trimmedPat);
                        if (cMatch === true) {
                            count = 1;
                        } else if (cMatch === null && isSpeciesMatch(s.name, trimmedPat)) {
                            count = 1;
                        }
                    } else {
                        // "Molecules" Type Observable (Default): Counts individual pattern matches within species.
                        count = countPatternMatches(s.name, trimmedPat);
                    }

                    if (count > 0) {
                        coeffMap.set(i, (coeffMap.get(i) ?? 0) + count);
                    }
                }
            }

            // Convert map to parallel arrays for cache efficiency in SimulationLoop.
            // CRITICAL FIX (Serialization Bug):
            // Use standard Arrays (number[]), NOT Int32Array/Float64Array.
            // TypedArrays serialize to objects ({"0":...}) when passed to WebWorkers, which breaks iteration.
            const matchingIndices: number[] = [];
            const coefficients: number[] = [];
            const volumes: number[] = [];

            const sortedEntries = Array.from(coeffMap.entries()).sort((a, b) => a[0] - b[0]);
            for (const [idx, count] of sortedEntries) {
                const s = generatedSpecies[idx];
                matchingIndices.push(idx);
                coefficients.push(count);

                // Observables are reported in amount units (conc * vol in ODE mode),
                // consistent with BNG2 GDAT output for both Molecules and Species types.
                let vol = 1.0;
                if (inputModel.compartments && inputModel.compartments.length > 0) {
                    const specCompName = getCompartment(s.name);
                    const comp = inputModel.compartments.find(c => c.name === specCompName);
                    if (comp) {
                        vol = (comp as any).resolvedVolume ?? comp.size ?? 1.0;
                    }
                }
                volumes.push(vol);
            }
            
            return {
                name: obs.name,
                type: obs.type,
                indices: matchingIndices,
                coefficients: coefficients,
                volumes: volumes
            };
        });
    } catch (e) {
        console.warn('[NetworkExpansion] Failed to pre-compute concrete observables:', e?.message ?? e);
    }

    return generatedModel;
}
