import {
    analyzeModelStiffness,
    analyzeReactionInformation,
    computeFIM,
    profileLikelihood,
    simulate,
    sobolSensitivity,
    loadEvaluator,
} from '@bngplayground/engine';
import {
    parseModelOrThrow,
    validateModel,
    cloneExpandedModel,
    updateMassActionRates,
    expandModel,
    buildSimulationOptions,
    withDataOnlySimulationOutput,
    findUnreachableRules,
} from '../../services/engine.js';
import { handleSimulate } from '../../handlers/simulate.js';
import { handleGetContactMap } from '../../handlers/getContactMap.js';
import {
    buildReactionGraph,
    findReactionRoute,
    annotateRouteSupport,
    matchesParameter,
    extractMoleculeNames,
    buildReactionRuleMap,
    activeRulesFromFiringLog,
    projectEmpiricalToRuleFlow,
    type ReactionRoute,
} from './utils/graphUtils.js';
import {
    reachedSteadyState,
    detectOscillation,
    detectSurprises,
} from './utils/diagnosticsUtils.js';
import {
    detectDiminishingReturns,
    detectCrosstalk,
    assessSensitivityConvergence,
} from './utils/analysisUtils.js';
import { inferConservationHints, detectIrreversibleSteps } from './utils/ruleAnalysisUtils.js';
import { generateThreeRegisters } from './utils/summaryUtils.js';
import { checkPlausibility, detectCompilationSurprise } from './utils/plausibilityUtils.js';
import { normalizeWhitespace } from './utils/codeUtils.js';
import { queryPathwayCommons } from '../pathwayCommons/pathwayCommonsService.js';
import type { StiffnessResult, DynamicsResult, ProfileLikelihoodResult, RuleAttributionEntry, ContactMapStep } from './types.js';

export async function diagnoseModelDeep(args: {
    code?: string;
    method?: 'ode' | 'ssa' | 'nf' | 'default';
    t_end?: number;
    n_steps?: number;
    n_samples?: number;
    n_bootstrap?: number;
    max_parameters?: number;
    validate_dynamics?: boolean;
    experimental_data?: Array<{
        time: number;
        observables: Record<string, number>;
        errors?: Record<string, number>;
    }>;
}): Promise<{
    validation: { valid: boolean; errors: number; warnings: number };
    structure: { species: number; reactionRules: number; observables: number; parameters: number };
    stiffness: StiffnessResult;
    dynamics: DynamicsResult;
    conservation: { count: number; preview: string[] };
    sobol?: { observable: string; topFirstOrder: Array<{ name: string; value: number }>; topTotalOrder: Array<{ name: string; value: number }> };
    fim?: { conditionNumber: number; identifiableParams: string[]; unidentifiableParams: string[] };
    ruleAttribution?: RuleAttributionEntry[];
    parameterSelection?: { strategy: string; candidates: number; analyzed: number; selectedParameters: string[] };
    profileLikelihood?: { profiles: Record<string, { identifiability: string; ci: { lower: number; upper: number } | null; flat: boolean }>; threshold: number; baselineSSR: number };
    summary: { technical: string; biological: string; strategic: string };
    compilationSurprise?: { numRules: number; numGeneratedSpecies: number; numGeneratedReactions: number; surpriseLevel: 'high' | 'moderate' | 'none'; warning?: string };
    irreversibleSteps?: Array<{ rule: string; type: string; controllingParameters: string[]; note: string }>;
    plausibilityChecks?: Array<{ parameter: string; value: number; issue: string; physicalBound: number; message: string }>;
    unreachableAnalysis?: { unreachableRules: string[]; totalRules: number; performanceNote: string };
    surprises?: Array<{ type: 'overshoot' | 'oscillation' | 'decorrelation' | 'insensitive_parameter' | 'unexpected_sensitivity'; description: string; observable?: string; parameter?: string }>;
    diminishingReturns?: { detected: boolean; message: string };
    convergenceAssessment?: { insightSaturated: boolean; recommendation: 'continue_analysis' | 'collect_more_data' | 'done'; message: string };
    crosstalkWarnings?: Array<{ molecule: string; pathways: number; rules: string[]; warning: string }>;
    pathwayCommons?: {
        summary: string;
        confirmedInteractions: number;
        missingInteractions: Array<{ source: string; type: string; target: string }>;
    };
}> {
    if (!args.code) {
        throw new Error('No BNGL code provided for model diagnosis.');
    }

    const model = parseModelOrThrow(args.code);
    const reactionRules = model.reactionRules ?? [];
    const validation = validateModel(model, false);

    // --- Unreachable rules analysis ---
    let unreachableAnalysis: { unreachableRules: string[]; totalRules: number; performanceNote: string } | undefined;
    try {
        const unreachableRules = findUnreachableRules(model);
        const totalRules = reactionRules.length;

        if (unreachableRules.length > 0) {
            unreachableAnalysis = {
                unreachableRules,
                totalRules,
                performanceNote: `${unreachableRules.length} of ${totalRules} rules are unreachable from the seed species. ` +
                    `These rules can never fire and may indicate missing seed species or modeling errors: ` +
                    `${unreachableRules.join(', ')}.`
            };
        } else {
            unreachableAnalysis = {
                unreachableRules: [],
                totalRules,
                performanceNote: `All ${totalRules} rules are reachable from the seed species.`
            };
        }
    } catch {
        // Non-fatal: if unreachable analysis fails, continue with the rest of the pipeline
        unreachableAnalysis = undefined;
    }

    const crosstalkWarnings = detectCrosstalk(reactionRules, model.moleculeTypes ?? []);

    const rateConstants = reactionRules.map((rule) => {
        if (rule.isFunctionalRate) return NaN;
        const paramValue = model.parameters[rule.rate];
        if (Number.isFinite(paramValue)) return Number(paramValue);
        const numericRate = Number(rule.rate);
        return Number.isFinite(numericRate) ? numericRate : NaN;
    }).filter((value) => Number.isFinite(value)) as number[];

    const stiffness = analyzeModelStiffness(rateConstants, {
        hasFunctionalRates: reactionRules.some((rule) => rule.isFunctionalRate),
        systemSize: model.species.length,
    });

    const simulation = await handleSimulate({
        code: args.code,
        method: args.method ?? 'ode',
        t_end: args.t_end ?? 10,
        n_steps: args.n_steps ?? 100,
        include_species_data: false,
    });

    const timeSeries = simulation.structuredContent.data as Array<Record<string, number>>;
    const observableNames = model.observables.map((obs) => obs.name).filter((name) => name in (timeSeries[0] ?? {}));
    const firstObservable = observableNames[0];
    const series = firstObservable ? timeSeries.map((row) => Number(row[firstObservable] ?? 0)) : [];

    const conservationPreview = inferConservationHints(
        reactionRules.map((rule, index) => `${rule.name ?? `rule_${index + 1}`}: ${rule.reactants.join(' + ')} -> ${rule.products.join(' + ')}`),
    );

    let sobolSummary: { observable: string; topFirstOrder: Array<{ name: string; value: number }>; topTotalOrder: Array<{ name: string; value: number }> } | undefined;
    let diminishingReturns: { detected: boolean; message: string } | undefined;
    let convergenceAssessment: { insightSaturated: boolean; recommendation: 'continue_analysis' | 'collect_more_data' | 'done'; message: string } | undefined;
    let fimSummary: { conditionNumber: number; identifiableParams: string[]; unidentifiableParams: string[] } | undefined;
    let ruleAttribution: RuleAttributionEntry[] | undefined;
    let parameterSelection: { strategy: string; candidates: number; analyzed: number; selectedParameters: string[] } | undefined;

    const allParameterEntries = Object.entries(model.parameters)
        .filter(([, value]) => Number.isFinite(value))
        .sort(([a], [b]) => a.localeCompare(b));

    const maxParameters = Math.max(1, Math.min(args.max_parameters ?? 5, 20));

    let profileLikelihoodResult: ProfileLikelihoodResult | undefined = undefined;
    let compilationSurprise: { numRules: number; numGeneratedSpecies: number; numGeneratedReactions: number; surpriseLevel: 'high' | 'moderate' | 'none'; warning?: string } | undefined = undefined;
    let irreversibleSteps: Array<{ rule: string; type: string; controllingParameters: string[]; note: string }> = [];
    let plausibilityChecks: Array<{ parameter: string; value: number; issue: string; physicalBound: number; message: string }> = [];
    let surprises: Array<{ type: 'overshoot' | 'oscillation' | 'decorrelation' | 'insensitive_parameter' | 'unexpected_sensitivity'; description: string; observable?: string; parameter?: string }> = [];

    if (allParameterEntries.length > 0) {
        let parameterEntries: Array<[string, number]>;
        const ruleDescriptors = reactionRules.map((rule, index) => ({
            name: rule.name ?? `rule_${index + 1}`,
            reactants: rule.reactants,
            products: rule.products,
            rate: normalizeWhitespace(rule.rate),
        }));
        const parameterRuleCounts = ruleDescriptors.reduce<Record<string, number>>((acc, rule) => {
            for (const [name] of allParameterEntries) {
                if (matchesParameter(rule.rate, name)) {
                    acc[name] = (acc[name] ?? 0) + 1;
                }
            }
            return acc;
        }, {});
        const reactionGraph = buildReactionGraph(ruleDescriptors);
        const observableTargets = model.observables.map((observable) => ({
            name: observable.name,
            molecules: new Set(extractMoleculeNames(observable.pattern)),
        }));

        const expandedModel = await expandModel(model);
        
        const numGeneratedSpecies = expandedModel.species?.length ?? 0;
        const numGeneratedReactions = expandedModel.reactions?.length ?? 0;
        const numRules = reactionRules.length;
        
        const surpriseResult = detectCompilationSurprise(numRules, numGeneratedSpecies, numGeneratedReactions);
        compilationSurprise = {
            numRules,
            numGeneratedSpecies,
            numGeneratedReactions,
            surpriseLevel: surpriseResult.level,
            ...(surpriseResult.warning ? { warning: surpriseResult.warning } : {}),
        };

        irreversibleSteps = detectIrreversibleSteps(reactionRules);

        plausibilityChecks = checkPlausibility(model.parameters, model.species.map(s => s.name));

        const simOptions = withDataOnlySimulationOutput(buildSimulationOptions({
            method: args.method,
            t_end: args.t_end,
            n_steps: args.n_steps,
        }));

        await loadEvaluator();
        const simulateWithOverrides = async (overrides: Record<string, number>) => {
            const runModel = cloneExpandedModel(expandedModel);
            Object.entries(overrides).forEach(([key, value]) => {
                runModel.parameters[key] = value;
            });
            updateMassActionRates(runModel);
            return simulate(0, runModel, simOptions, {
                checkCancelled: () => { },
                postMessage: () => { },
            });
        };

        if (allParameterEntries.length <= maxParameters) {
            parameterEntries = allParameterEntries;
            parameterSelection = {
                strategy: 'magnitude',
                candidates: allParameterEntries.length,
                analyzed: allParameterEntries.length,
                selectedParameters: parameterEntries.map(([name]) => name),
            };
        } else {
            const triageCandidates = allParameterEntries.slice(0, Math.min(allParameterEntries.length, 30));
            const baselineValue = firstObservable ? Number(timeSeries[timeSeries.length - 1]?.[firstObservable] ?? 0) : Number.NaN;

            if (firstObservable && Number.isFinite(baselineValue)) {
                const triageScores: Array<{ name: string; value: number; score: number }> = [];
                for (const [name, value] of triageCandidates) {
                    const delta = Math.max(Math.abs(value) * 0.1, 1e-6);
                    const perturbed = await simulateWithOverrides({ [name]: value + delta });
                    const perturbedEnd = Number(perturbed.data[perturbed.data.length - 1]?.[firstObservable] ?? baselineValue);
                    const scale = Math.max(Math.abs(baselineValue), 1e-9);
                    const score = Math.abs((perturbedEnd - baselineValue) / scale);
                    triageScores.push({ name, value, score });
                }

                parameterEntries = triageScores.sort((a, b) => b.score - a.score).slice(0, maxParameters).map((entry) => [entry.name, entry.value] as [string, number]);
                parameterSelection = {
                    strategy: 'triage_end_observable',
                    candidates: triageCandidates.length,
                    analyzed: parameterEntries.length,
                    selectedParameters: parameterEntries.map(([name]) => name),
                };
            } else {
                parameterEntries = [...allParameterEntries].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, maxParameters);
                parameterSelection = {
                    strategy: 'magnitude',
                    candidates: allParameterEntries.length,
                    analyzed: parameterEntries.length,
                    selectedParameters: parameterEntries.map(([name]) => name),
                };
            }
        }

        const sobolParams = parameterEntries.map(([name, value]) => {
            const magnitude = Math.max(1e-6, Math.abs(value));
            return { name, min: magnitude * 0.1, max: magnitude * 10 };
        });

        const sobolResults = await sobolSensitivity({
            simulate: simulateWithOverrides,
            params: sobolParams,
            observables: model.observables.slice(0, 1).map((obs) => obs.name),
            N: args.n_samples ?? 64,
            nBootstrap: args.n_bootstrap ?? 100,
            seed: 42,
        });

        const firstSobol = sobolResults[0];
        if (firstSobol) {
            const topFirstOrder = [...firstSobol.firstOrder].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 3).map((entry) => ({ name: entry.name, value: entry.value }));
            const topTotalOrder = [...firstSobol.totalOrder].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 3).map((entry) => ({ name: entry.name, value: entry.value }));
            sobolSummary = { observable: firstSobol.observable, topFirstOrder, topTotalOrder };
            diminishingReturns = detectDiminishingReturns(topFirstOrder) ?? undefined;
            surprises = detectSurprises(timeSeries, observableNames, {
                firstOrder: topFirstOrder,
                totalOrder: topTotalOrder,
            }, parameterRuleCounts);

            const sensitiveParams = topFirstOrder.reduce<string[]>((acc, p) => {
                if (Math.abs(p.value) > 0.01) acc.push(p.name);
                return acc;
            }, []);
            const hasStrongSignal = topFirstOrder.length > 0 && Math.abs(topFirstOrder[0].value) > 0.1;
            const signalToNoise = hasStrongSignal ? Math.abs(topFirstOrder[0].value) / (Math.abs(topFirstOrder[0].value - (topTotalOrder[0]?.value ?? 0)) + 0.01) : 0;
            const doubledSampleCount = Math.max((args.n_samples ?? 64) * 2, (args.n_samples ?? 64) + 16);
            const secondPassSobol = await sobolSensitivity({
                simulate: simulateWithOverrides,
                params: sobolParams,
                observables: model.observables.slice(0, 1).map((obs) => obs.name),
                N: doubledSampleCount,
                nBootstrap: args.n_bootstrap ?? 100,
                seed: 84,
            });
            const secondSobol = secondPassSobol[0];
            const convergence = secondSobol
                ? assessSensitivityConvergence(
                    { firstOrder: topFirstOrder, totalOrder: topTotalOrder },
                    {
                        firstOrder: [...secondSobol.firstOrder].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 3).map((entry) => ({ name: entry.name, value: entry.value })),
                        totalOrder: [...secondSobol.totalOrder].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 3).map((entry) => ({ name: entry.name, value: entry.value })),
                    },
                )
                : undefined;
            
            if (!hasStrongSignal) {
                convergenceAssessment = {
                    insightSaturated: false,
                    recommendation: 'collect_more_data',
                    message: 'No strong sensitivity signals detected. Collect more experimental data or reconsider observable selection.',
                };
            } else if (convergence?.insightSaturated) {
                convergenceAssessment = {
                    insightSaturated: true,
                    recommendation: 'done',
                    message: `Sensitivity classifications are stable after a 2x Sobol rerun${convergence.baselineSensitive.length > 0 ? ` (${convergence.baselineSensitive.join(', ')})` : ''}. Additional analysis is unlikely to change which parameters matter.`,
                };
            } else if (diminishingReturns?.detected && sensitiveParams.length <= 1) {
                convergenceAssessment = {
                    insightSaturated: true,
                    recommendation: 'done',
                    message: 'Single dominant parameter identified with clear sensitivity. Additional analysis is unlikely to yield new insights.',
                };
            } else if (signalToNoise > 10) {
                convergenceAssessment = {
                    insightSaturated: true,
                    recommendation: 'done',
                    message: 'High signal-to-noise ratio (>10). First-order effects dominate; interaction effects are minimal.',
                };
            } else if (convergence && convergence.changedParameters.length > 0) {
                convergenceAssessment = {
                    insightSaturated: false,
                    recommendation: 'continue_analysis',
                    message: `Sensitivity classifications changed after increasing Sobol samples (${convergence.changedParameters.join(', ')}). Continue analysis before concluding saturation.`,
                };
            } else {
                convergenceAssessment = {
                    insightSaturated: false,
                    recommendation: 'continue_analysis',
                    message: 'Multiple sensitive parameters with notable interaction effects. Continue with FIM and profile likelihood analysis.',
                };
            }

            let contactMapResult: any;
            try {
                contactMapResult = await handleGetContactMap({ code: args.code ?? '' });
            } catch (error) {
                console.warn('Failed to build contact map:', error);
                contactMapResult = { structuredContent: { nodes: [], edges: [] } };
            }
            const contactMapEdges = contactMapResult.structuredContent?.edges || [];

            ruleAttribution = topFirstOrder.map((entry) => {
                // Token-aware attribution: a rule "uses" the parameter only if its rate
                // references it as a whole identifier (so k1 does not match k10 / k1_deg).
                const implicatedRuleDescriptors = ruleDescriptors.filter((rule) => matchesParameter(rule.rate, entry.name)).slice(0, 5);
                const implicatedRules = implicatedRuleDescriptors.map((rule) => rule.name);

                // Seed the downstream search at the reactant molecules of the parameter's own
                // rule(s); fall back to products for synthesis rules with no reactants.
                let seedMolecules = Array.from(new Set(implicatedRuleDescriptors.flatMap((rule) => rule.reactants.flatMap(extractMoleculeNames))));
                if (seedMolecules.length === 0) {
                    seedMolecules = Array.from(new Set(implicatedRuleDescriptors.flatMap((rule) => rule.products.flatMap(extractMoleculeNames))));
                }

                // Shortest DIRECTED, rule-labeled route from the parameter's rule to an
                // observable species (a mechanistic hypothesis for how the influence propagates).
                let route: ReactionRoute | null = null;
                let targetObservable: string | undefined;
                for (const observable of observableTargets) {
                    if (observable.molecules.size === 0) continue;
                    const candidate = findReactionRoute(reactionGraph, seedMolecules, observable.molecules, 8);
                    if (!candidate) continue;
                    if (!route || candidate.edges.length < route.edges.length) {
                        route = candidate;
                        targetObservable = observable.name;
                    }
                }

                // Falsifiability hook. The default (ODE) diagnosis has no empirical
                // information-flow data, so the route is reported as an unchecked structural
                // hypothesis. Supplying an empirical edge set here marks each step supported.
                const { edges: routeEdges, status: support } = annotateRouteSupport(route?.edges ?? [], undefined);
                const routeMolecules = route?.nodes ?? [];

                // Concrete contact-map steps for the implicated rules (unchanged).
                const contactMapPath: ContactMapStep[] = [];
                if (contactMapEdges && Array.isArray(contactMapEdges)) {
                    for (const ruleDesc of implicatedRuleDescriptors.slice(0, 5)) {
                        const ruleEdges = contactMapEdges.filter((edge: any) => edge.ruleIds?.includes(ruleDesc.name) || edge.ruleLabels?.includes(ruleDesc.name));
                        for (const edge of ruleEdges.slice(0, 3)) {
                            const fromMatch = edge.from?.match(/^([A-Za-z][A-Za-z0-9_]*)/);
                            const molecule = fromMatch ? fromMatch[1] : 'unknown';
                            const rawInteraction = edge.interactionType || 'binding';
                            let interaction: 'binding' | 'state_change' | 'synthesis' | 'degradation' = 'binding';
                            if (rawInteraction === 'state_change' || rawInteraction === 'synthesis' || rawInteraction === 'degradation') {
                                interaction = rawInteraction;
                            }
                            contactMapPath.push({
                                molecule,
                                site: edge.from?.includes('(') ? edge.from?.match(/\(([^)]+)\)/)?.[1] : undefined,
                                interaction,
                                rule: ruleDesc.name,
                            });
                        }
                    }
                }

                const qualifierText =
                    support === 'trivial' ? "the parameter's rule directly involves the observed species"
                    : support === 'dynamically_supported' ? "corroborated by the model's information flow"
                    : support === 'partially_supported' ? "partially corroborated by the model's information flow"
                    : support === 'structural_only' ? "not corroborated by the model's information flow"
                    : "a structural hypothesis, not yet checked against the model's dynamics";

                const routeText = routeMolecules.length > 0
                    ? (routeEdges.length > 0
                        ? `${routeMolecules.join(' → ')} (via ${routeEdges.map((e) => e.rule).join(', ')})`
                        : routeMolecules.join(' → '))
                    : undefined;

                const narrative = implicatedRules.length > 0
                    ? `Global sensitivity establishes that ${entry.name} influences ${targetObservable ?? 'the target observable'} (S1=${entry.value.toFixed(3)}); it acts through ${implicatedRules[0]}` +
                      (routeText ? `, and can propagate along ${routeText}` : '') +
                      ` — ${qualifierText}.`
                    : undefined;

                return {
                    parameter: entry.name,
                    firstOrder: entry.value,
                    implicatedRules,
                    ...(targetObservable ? { targetObservable } : {}),
                    ...(routeMolecules.length > 0 ? { topologyPath: routeMolecules } : {}),
                    ...(routeEdges.length > 0 ? { route: routeEdges } : {}),
                    support,
                    ...(contactMapPath.length > 0 ? { contactMapPath } : {}),
                    ...(narrative ? { narrative } : {}),
                };
            });

            // Opt-in dynamical validation: check each route step against the model's own
            // stochastic dynamics. A step is supported if its rule actually fires; the whole
            // route is additionally corroborated if every hand-off appears in the empirical
            // transfer-entropy graph. Guarded so a failure never breaks the diagnosis.
            if (args.validate_dynamics && ruleAttribution && ruleAttribution.some((r) => r.route && r.route.length > 0)) {
                try {
                    const reactions = expandedModel.reactions ?? [];
                    if (reactions.length > 0) {
                        const runModel = cloneExpandedModel(expandedModel);
                        updateMassActionRates(runModel);
                        const simRes = await simulate(0, runModel, {
                            method: 'ssa',
                            t_end: args.t_end ?? 100,
                            n_steps: args.n_steps ?? 100,
                            seed: 42,
                            recordFirings: true,
                            maxFiringEvents: 100000,
                        } as any, { checkCancelled: () => {}, postMessage: () => {} });
                        const firingLog = simRes.firingLog ?? [];
                        if (firingLog.length >= 50) {
                            const analysis = analyzeReactionInformation({ firingLog, nReactions: reactions.length });
                            const reactionRule = buildReactionRuleMap(firingLog);
                            const activeRules = activeRulesFromFiringLog(firingLog);
                            const ruleFlow = projectEmpiricalToRuleFlow(analysis.empiricalCausalGraph, reactionRule);
                            ruleAttribution = ruleAttribution.map((entry) => {
                                if (!entry.route || entry.route.length === 0) return entry;
                                const { edges, status, informationFlowCorroborated } = annotateRouteSupport(entry.route, { activeRules, ruleFlow });
                                return {
                                    ...entry,
                                    route: edges,
                                    support: status,
                                    ...(informationFlowCorroborated !== undefined ? { informationFlowCorroborated } : {}),
                                };
                            });
                        }
                    }
                } catch (error) {
                    console.warn('Dynamical route validation skipped:', error);
                }
            }
        }

        const fimResult = await computeFIM({
            simulate: simulateWithOverrides,
            parameters: Object.fromEntries(parameterEntries),
            parameterNames: parameterEntries.map(([name]) => name),
            allTimepoints: true,
            logParameters: false,
            approxProfile: false,
        });

        fimSummary = { conditionNumber: fimResult.conditionNumber, identifiableParams: fimResult.identifiableParams, unidentifiableParams: fimResult.unidentifiableParams };

        if (args.experimental_data && args.experimental_data.length > 0) {
            try {
                const experimentalDataForProfile = args.experimental_data.map(dp => ({ 
                    time: dp.time, 
                    values: dp.observables,
                    ...(dp.errors ? { errors: dp.errors } : {})
                }));
                profileLikelihoodResult = await profileLikelihood({
                    simulate: simulateWithOverrides,
                    parameters: Object.fromEntries(parameterEntries),
                    parameterNames: parameterEntries.map(([name]) => name),
                    experimentalData: experimentalDataForProfile,
                    nGrid: 15,
                    rangeFactor: 10,
                });
            } catch (error) {
                console.warn('Profile likelihood computation failed:', error);
            }
        }
    }

    if (surprises.length === 0) {
        surprises = detectSurprises(timeSeries, observableNames);
    }

    const summary = generateThreeRegisters({
        sobol: sobolSummary,
        fim: fimSummary,
        profileLikelihood: profileLikelihoodResult,
        stiffness: { category: stiffness.category, ratio: stiffness.rateRatio, features: stiffness.features },
        dynamics: { reaches_steady_state: reachedSteadyState(series), likely_oscillatory: detectOscillation(series) },
        structure: { species: model.species.length, reactionRules: reactionRules.length, observables: model.observables.length, parameters: Object.keys(model.parameters).length },
        ruleAttribution,
        unreachableAnalysis,
    });

    let pathwayCommons: {
        summary: string;
        confirmedInteractions: number;
        missingInteractions: Array<{ source: string; type: string; target: string }>;
    } | undefined;

    try {
        const pcResult = await queryPathwayCommons(args.code);
        if (pcResult.confirmedInteractions.length > 0 || pcResult.missingInteractions.length > 0) {
            pathwayCommons = {
                summary: pcResult.summary,
                confirmedInteractions: pcResult.confirmedInteractions.length,
                missingInteractions: pcResult.missingInteractions.slice(0, 5).map((interaction) => ({
                    source: interaction.source,
                    type: interaction.type,
                    target: interaction.target,
                })),
            };
        }
    } catch {
        // Non-fatal when network is unavailable or the API is unreachable.
    }

    return {
        validation: { valid: validation.valid, errors: validation.summary.errors, warnings: validation.summary.warnings },
        structure: { species: model.species.length, reactionRules: reactionRules.length, observables: model.observables.length, parameters: Object.keys(model.parameters).length },
        stiffness: { category: stiffness.category, ratio: stiffness.rateRatio, features: stiffness.features },
        dynamics: { reaches_steady_state: reachedSteadyState(series), likely_oscillatory: detectOscillation(series) },
        conservation: { count: conservationPreview.length, preview: conservationPreview },
        compilationSurprise,
        ...(irreversibleSteps.length > 0 ? { irreversibleSteps } : {}),
        ...(plausibilityChecks.length > 0 ? { plausibilityChecks } : {}),
        ...(unreachableAnalysis ? { unreachableAnalysis } : {}),
        ...(surprises.length > 0 ? { surprises } : {}),
        ...(diminishingReturns ? { diminishingReturns } : {}),
        ...(convergenceAssessment ? { convergenceAssessment } : {}),
        ...(crosstalkWarnings.length > 0 ? { crosstalkWarnings } : {}),
        ...(sobolSummary ? { sobol: sobolSummary } : {}),
        ...(fimSummary ? { fim: fimSummary } : {}),
        ...(ruleAttribution ? { ruleAttribution } : {}),
        ...(parameterSelection ? { parameterSelection } : {}),
        ...(profileLikelihoodResult ? { profileLikelihood: profileLikelihoodResult } : {}),
        ...(pathwayCommons ? { pathwayCommons } : {}),
        summary,
    };
}
