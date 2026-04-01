import {
    analyzeModelStiffness,
    computeFIM,
    formatBNGL,
    parseBNGLWithANTLR,
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
    findUnreachableRules,
} from '../../services/engine.js';
import { handleSimulate } from '../../handlers/simulate.js';
import { handleGetContactMap } from '../../handlers/getContactMap.js';
import {
    buildMoleculeGraph,
    findShortestPath,
    extractMoleculeNames,
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
import type { StiffnessResult, DynamicsResult, ProfileLikelihoodResult } from './types.js';

export async function diagnoseModelDeep(args: {
    code?: string;
    method?: 'ode' | 'ssa' | 'nf' | 'default';
    t_end?: number;
    n_steps?: number;
    n_samples?: number;
    n_bootstrap?: number;
    max_parameters?: number;
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
    mechanisticCausalTrace?: Array<{
        parameter: string;
        firstOrder: number;
        implicatedRules: string[];
        targetObservable?: string;
        topologyPath?: string[];
        contactMapPath?: Array<{ molecule: string; site?: string; interaction: string; rule: string }>;
        narrative?: string;
    }>;
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
    } catch (err) {
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
    let mechanisticCausalTrace: Array<{ parameter: string; firstOrder: number; implicatedRules: string[]; targetObservable?: string; topologyPath?: string[] }> | undefined;
    let parameterSelection: { strategy: string; candidates: number; analyzed: number; selectedParameters: string[] } | undefined;

    const allParameterEntries = Object.entries(model.parameters)
        .filter(([, value]) => Number.isFinite(value))
        .sort(([a], [b]) => a.localeCompare(b));

    const maxParameters = Math.max(1, Math.min(args.max_parameters ?? 5, 20));
    let parameterEntries: Array<[string, number]> = [];

    let profileLikelihoodResult: ProfileLikelihoodResult | undefined = undefined;
    let compilationSurprise: { numRules: number; numGeneratedSpecies: number; numGeneratedReactions: number; surpriseLevel: 'high' | 'moderate' | 'none'; warning?: string } | undefined = undefined;
    let irreversibleSteps: Array<{ rule: string; type: string; controllingParameters: string[]; note: string }> = [];
    let plausibilityChecks: Array<{ parameter: string; value: number; issue: string; physicalBound: number; message: string }> = [];
    let surprises: Array<{ type: 'overshoot' | 'oscillation' | 'decorrelation' | 'insensitive_parameter' | 'unexpected_sensitivity'; description: string; observable?: string; parameter?: string }> = detectSurprises(timeSeries, observableNames);

    if (allParameterEntries.length > 0) {
        const ruleDescriptors = reactionRules.map((rule, index) => ({
            name: rule.name ?? `rule_${index + 1}`,
            reactants: rule.reactants,
            products: rule.products,
            rate: normalizeWhitespace(rule.rate),
        }));
        const parameterRuleCounts = ruleDescriptors.reduce<Record<string, number>>((acc, rule) => {
            for (const [name] of allParameterEntries) {
                if (rule.rate.includes(name)) {
                    acc[name] = (acc[name] ?? 0) + 1;
                }
            }
            return acc;
        }, {});
        const moleculeGraph = buildMoleculeGraph(ruleDescriptors);
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

        const simOptions = buildSimulationOptions({
            method: args.method,
            t_end: args.t_end,
            n_steps: args.n_steps,
        });

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

            const sensitiveParams = topFirstOrder.filter(p => Math.abs(p.value) > 0.01).map(p => p.name);
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

            mechanisticCausalTrace = topFirstOrder.map((entry) => {
                const implicatedRuleDescriptors = ruleDescriptors.filter((rule) => rule.rate.includes(entry.name)).slice(0, 5);
                const implicatedRules = implicatedRuleDescriptors.map((rule) => rule.name);
                const sourceMolecules = Array.from(new Set(implicatedRuleDescriptors.flatMap((rule) => [...rule.reactants.flatMap(extractMoleculeNames), ...rule.products.flatMap(extractMoleculeNames)])));

                let bestPath: string[] = [];
                let targetObservable: string | undefined;
                for (const observable of observableTargets) {
                    if (observable.molecules.size === 0) continue;
                    const path = findShortestPath(moleculeGraph, sourceMolecules, observable.molecules, 8);
                    if (path.length === 0) continue;
                    if (bestPath.length === 0 || path.length < bestPath.length) {
                        bestPath = path;
                        targetObservable = observable.name;
                    }
                }

                const contactMapPath: Array<{ molecule: string; site?: string; interaction: string; rule: string }> = [];
                if (contactMapEdges && Array.isArray(contactMapEdges)) {
                    for (const ruleDesc of implicatedRuleDescriptors.slice(0, 5)) {
                        const ruleEdges = contactMapEdges.filter((edge: any) => edge.ruleIds?.includes(ruleDesc.name) || edge.ruleLabels?.includes(ruleDesc.name));
                        for (const edge of ruleEdges.slice(0, 3)) {
                            const fromMatch = edge.from?.match(/^([A-Za-z][A-Za-z0-9_]*)/);
                            const molecule = fromMatch ? fromMatch[1] : 'unknown';
                            contactMapPath.push({
                                molecule,
                                site: edge.from?.includes('(') ? edge.from?.match(/\(([^)]+)\)/)?.[1] : undefined,
                                interaction: edge.interactionType || 'binding',
                                rule: ruleDesc.name,
                            });
                        }
                    }
                }

                return {
                    parameter: entry.name,
                    firstOrder: entry.value,
                    implicatedRules,
                    ...(targetObservable ? { targetObservable } : {}),
                    ...(bestPath.length > 0 ? { topologyPath: bestPath } : {}),
                    ...(contactMapPath.length > 0 ? { contactMapPath } : {}),
                    narrative: contactMapPath.length > 0
                        ? `${entry.name} governs ${implicatedRules[0] ?? 'a rule'}: ${contactMapPath.map(step => `${step.molecule}${step.site ? `(${step.site})` : ''} [${step.interaction}]`).join(' → ')}${targetObservable ? ` → observed via ${targetObservable}` : ''}`
                        : bestPath.length > 0
                            ? `${entry.name} governs ${implicatedRules[0] ?? 'a rule'}: ${bestPath.join(' → ')}${targetObservable ? ` → observed via ${targetObservable}` : ''}`
                            : undefined,
                };
            });
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

    const summary = generateThreeRegisters({
        sobol: sobolSummary,
        fim: fimSummary,
        profileLikelihood: profileLikelihoodResult,
        stiffness: { category: stiffness.category, ratio: stiffness.rateRatio, features: stiffness.features },
        dynamics: { reaches_steady_state: reachedSteadyState(series), likely_oscillatory: detectOscillation(series) },
        structure: { species: model.species.length, reactionRules: reactionRules.length, observables: model.observables.length, parameters: Object.keys(model.parameters).length },
        mechanisticCausalTrace,
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
        ...(mechanisticCausalTrace ? { mechanisticCausalTrace } : {}),
        ...(parameterSelection ? { parameterSelection } : {}),
        ...(profileLikelihoodResult ? { profileLikelihood: profileLikelihoodResult } : {}),
        ...(pathwayCommons ? { pathwayCommons } : {}),
        summary,
    };
}
