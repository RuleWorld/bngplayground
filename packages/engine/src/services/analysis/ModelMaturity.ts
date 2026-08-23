import { BNGLModel } from '../../types';
import { analyzeModelStiffness } from '../simulation/cvodeStiffConfig';
import { findUnreachableRules } from './UnreachableRules';
import { BNGLParser } from '../graph/core/BNGLParser';

export interface ModelMaturityHistoryEntry {
    dataset: string;
    source: string;
    date?: string;
    fit_quality?: 'good' | 'moderate' | 'poor';
    fitQuality?: 'good' | 'moderate' | 'poor';
}

export interface ModelMaturityParameterSource {
    source: string; // "literature" | "fit" | "assumption" | "measurement"
    citation?: string;
    value: number;
    uncertainty?: number;
}

export interface ModelMaturityInput {
    validation_history?: ModelMaturityHistoryEntry[];
    validationHistory?: ModelMaturityHistoryEntry[];
    parameter_sources?: Record<string, ModelMaturityParameterSource>;
    parameterSources?: Record<string, ModelMaturityParameterSource>;
    n_observables?: number;
    nObservables?: number;
}

export interface ModelMaturityResult {
    maturity_score: number;
    maturity_level: 'prototype' | 'development' | 'validation' | 'mature';
    max_score: number;
    factors: string[];
    provenance: Record<string, { source: string; citation?: string; value?: number; uncertainty?: number }>;
    parameter_breakdown: {
        measured: string[];
        literature: string[];
        fitted: string[];
        assumed: string[];
    };
    validation_summary: {
        datasets: number;
        good_fits: number;
        moderate_fits: number;
    };
    recommendations: string[];
    summary: string;
}

/**
 * Computes model maturity assessment score, maturity level, recommendations,
 * and parameter breakdown on a parsed BioNetGen model.
 *
 * @param model - The parsed BNGLModel object.
 * @param input - Optional parameter provenance, validation history, and observable counts.
 * @returns Standardized ModelMaturityResult payload.
 */
export function assessModelMaturity(model: BNGLModel, input?: ModelMaturityInput): ModelMaturityResult {
    // 1. Core verification metrics
    const unreachableRules = findUnreachableRules(model);

    let parseErrorsCount = 0;
    if (model.observables.length === 0) {
        parseErrorsCount++;
    }
    Object.entries(model.parameters).forEach(([name, value]) => {
        if (!Number.isFinite(value)) {
            parseErrorsCount++;
        }
    });
    model.observables.forEach((observable) => {
        const patternIssue = BNGLParser.validatePattern(observable.pattern);
        if (patternIssue) {
            parseErrorsCount++;
        }
    });

    const reactionRules = model.reactionRules ?? [];
    const rateConstants = reactionRules.map((rule) => {
        if (rule.isFunctionalRate) return NaN;
        const paramValue = model.parameters[rule.rate];
        if (Number.isFinite(paramValue)) return Number(paramValue);
        const numericRate = Number(rule.rate);
        return Number.isFinite(numericRate) ? numericRate : NaN;
    }).filter((v) => Number.isFinite(v));

    const stiffness = analyzeModelStiffness(rateConstants, {
        hasFunctionalRates: reactionRules.some((rule) => rule.isFunctionalRate),
        systemSize: model.species.length,
    });

    // 2. Score Calculation
    let maturityScore = 0;
    const maxScore = 100;
    const factors: string[] = [];

    // Parse validation (15 points)
    if (parseErrorsCount === 0) {
        maturityScore += 15;
        factors.push('No parse errors (+15)');
    } else {
        factors.push(`Has ${parseErrorsCount} parse errors`);
    }

    // Structure (15 points)
    const structureScore = Math.min(15, model.moleculeTypes.length * 1.5 + reactionRules.length * 0.5);
    maturityScore += structureScore;
    factors.push(`Structure: ${structureScore.toFixed(1)}/15`);

    // No unreachable rules (10 points)
    if (unreachableRules.length === 0) {
        maturityScore += 10;
        factors.push('All rules reachable (+10)');
    } else {
        factors.push(`${unreachableRules.length} unreachable rules`);
    }

    // Stiffness appropriate (10 points)
    if (stiffness.category === 'mild' || stiffness.category === 'moderate') {
        maturityScore += 10;
        factors.push(`Stiffness ${stiffness.category} (+10)`);
    } else {
        factors.push(`Stiffness: ${stiffness.category}`);
    }

    // Experimental validation history (20 points)
    const validationHistory = input?.validationHistory ?? input?.validation_history ?? [];
    if (validationHistory.length > 0) {
        maturityScore += 20;
        const goodFits = validationHistory.filter(v => (v.fitQuality ?? v.fit_quality) === 'good').length;
        const moderateFits = validationHistory.filter(v => (v.fitQuality ?? v.fit_quality) === 'moderate').length;
        factors.push(`Validated against ${validationHistory.length} dataset(s) (+20): ${goodFits} good, ${moderateFits} moderate`);
    } else {
        factors.push('No experimental validation history');
    }

    // Parameter provenance (20 points)
    const parameterSources = input?.parameterSources ?? input?.parameter_sources ?? {};
    const modelParams = Object.keys(model.parameters);
    const sourcedParams = modelParams.filter(p => parameterSources[p] !== undefined);
    const measuredParams = modelParams.filter(p => parameterSources[p]?.source === 'measurement');
    const literatureParams = modelParams.filter(p => parameterSources[p]?.source === 'literature');
    const fittedParams = modelParams.filter(p => parameterSources[p]?.source === 'fit');
    const assumedParams = modelParams.filter(p => {
        const src = parameterSources[p];
        return !src || src.source === 'assumption';
    });

    if (sourcedParams.length === modelParams.length && modelParams.length > 0) {
        maturityScore += 20;
        factors.push('All parameters have provenance (+20)');
    } else if (sourcedParams.length > 0) {
        maturityScore += 10;
        factors.push(`Partial provenance: ${sourcedParams.length}/${modelParams.length} parameters (+10)`);
    } else {
        factors.push('No parameter provenance information');
    }

    // Parameter observability ratio (10 points)
    const nObs = input?.nObservables ?? input?.n_observables ?? model.observables.length;
    const nParams = modelParams.length;
    if (nObs > 0 && nParams > 0) {
        const ratio = nObs / nParams;
        if (ratio >= 1) {
            maturityScore += 10;
            factors.push(`Good parameter/observable ratio ${ratio.toFixed(1)} (+10)`);
        } else if (ratio >= 0.5) {
            maturityScore += 5;
            factors.push(`Moderate ratio ${ratio.toFixed(1)} (+5)`);
        } else {
            factors.push(`Low ratio ${ratio.toFixed(1)} - may be unidentifiable`);
        }
    }

    // Determine maturity level
    let maturityLevel: 'prototype' | 'development' | 'validation' | 'mature';
    if (maturityScore >= 80) {
        maturityLevel = 'mature';
    } else if (maturityScore >= 60) {
        maturityLevel = 'validation';
    } else if (maturityScore >= 40) {
        maturityLevel = 'development';
    } else {
        maturityLevel = 'prototype';
    }

    const recommendations: string[] = [];

    if (unreachableRules.length > 0) {
        recommendations.push('Remove or fix unreachable rules');
    }
    if (stiffness.category === 'severe') {
        recommendations.push('Address stiff system - consider solver changes or timescale separation');
    }
    if (validationHistory.length === 0) {
        recommendations.push('Validate against experimental data to advance maturity');
    }
    if (assumedParams.length > 0) {
        const paramList = assumedParams.slice(0, 5).join(', ');
        recommendations.push(`Parameter(s) with no source: ${paramList}${assumedParams.length > 5 ? '...' : ''}. Consider measuring or citing literature.`);
    }
    if (nObs < nParams) {
        recommendations.push('Add more observables or reduce parameters for identifiability');
    }

    // Build parameter provenance report
    const provenanceReport: Record<string, { source: string; citation?: string; value?: number; uncertainty?: number }> = {};
    for (const p of modelParams) {
        if (parameterSources[p]) {
            provenanceReport[p] = {
                source: parameterSources[p].source,
                citation: parameterSources[p].citation,
                value: parameterSources[p].value,
                uncertainty: parameterSources[p].uncertainty,
            };
        } else {
            provenanceReport[p] = { source: 'unknown' };
        }
    }

    const summary = `Model maturity: ${maturityLevel} (${maturityScore}/${maxScore}). ` +
        `${validationHistory.length > 0 ? `Validated against ${validationHistory.length} dataset(s). ` : ''}` +
        `${recommendations.length > 0 ? recommendations.join('. ') : 'No critical issues.'}`;

    return {
        maturity_score: maturityScore,
        maturity_level: maturityLevel,
        max_score: maxScore,
        factors,
        provenance: provenanceReport,
        parameter_breakdown: {
            measured: measuredParams,
            literature: literatureParams,
            fitted: fittedParams,
            assumed: assumedParams,
        },
        validation_summary: {
            datasets: validationHistory.length,
            good_fits: validationHistory.filter(v => (v.fitQuality ?? v.fit_quality) === 'good').length,
            moderate_fits: validationHistory.filter(v => (v.fitQuality ?? v.fit_quality) === 'moderate').length,
        },
        recommendations,
        summary,
    };
}
