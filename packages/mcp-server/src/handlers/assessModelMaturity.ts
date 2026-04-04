import { ToolArgs, ToolResult } from '../types/index.js';
import { z } from 'zod';
import { createToolResult, parseArgs, parseModelOrThrow, validateModel, findUnreachableRules } from '../services/engine.js';
import { analyzeModelStiffness } from '@bngplayground/engine';
import { structureError } from '../services/errors.js';

const assessModelMaturityArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    validation_history: z.array(z.object({
        dataset: z.string().describe('Dataset name or identifier'),
        source: z.string().describe('Citation or source'),
        date: z.string().optional().describe('Date of validation'),
        fit_quality: z.enum(['good', 'moderate', 'poor']).optional().describe('Quality of fit'),
    })).optional().describe('History of experimental validations'),
    parameter_sources: z.record(z.string(), z.object({
        source: z.string().describe('Source: "literature", "fit", "assumption", "measurement"'),
        citation: z.string().optional().describe('Citation if from literature'),
        value: z.number().describe('Parameter value'),
        uncertainty: z.number().optional().describe('Uncertainty if measured/fitted'),
    })).optional().describe('Per-parameter provenance information'),
    n_observables: z.number().int().positive().optional().describe('Number of measured observables'),
}).strict();

type AssessModelMaturityArgs = z.infer<typeof assessModelMaturityArgsSchema>;

export async function handleAssessModelMaturity(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('assess_model_maturity', assessModelMaturityArgsSchema, args) as AssessModelMaturityArgs;
        const model = parseModelOrThrow(parsedArgs.code);
        
        const validation = validateModel(model, false);
        const unreachableRules = findUnreachableRules(model);
        
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
        
        // Calculate maturity score
        let maturityScore = 0;
        const maxScore = 100;
        const factors: string[] = [];
        
        // Parse validation (15 points)
        if (validation.summary.errors === 0) {
            maturityScore += 15;
            factors.push('No parse errors (+15)');
        } else {
            factors.push(`Has ${validation.summary.errors} parse errors`);
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
        const validationHistory = parsedArgs.validation_history ?? [];
        if (validationHistory.length > 0) {
            maturityScore += 20;
            const goodFits = validationHistory.filter(v => v.fit_quality === 'good').length;
            const moderateFits = validationHistory.filter(v => v.fit_quality === 'moderate').length;
            factors.push(`Validated against ${validationHistory.length} dataset(s) (+20): ${goodFits} good, ${moderateFits} moderate`);
        } else {
            factors.push('No experimental validation history');
        }
        
        // Parameter provenance (20 points)
        const parameterSources = parsedArgs.parameter_sources ?? {};
        const modelParams = Object.keys(model.parameters);
        const sourcedParams = modelParams.filter(p => parameterSources[p] !== undefined);
        const measuredParams = modelParams.filter(p => parameterSources[p]?.source === 'measurement');
        const literatureParams = modelParams.filter(p => parameterSources[p]?.source === 'literature');
        const fittedParams = modelParams.filter(p => parameterSources[p]?.source === 'fit');
        const assumedParams = modelParams.filter(p => parameterSources[p]?.source === 'assumption' || !parameterSources[p]);
        
        if (sourcedParams.length === modelParams.length) {
            maturityScore += 20;
            factors.push('All parameters have provenance (+20)');
        } else if (sourcedParams.length > 0) {
            maturityScore += 10;
            factors.push(`Partial provenance: ${sourcedParams.length}/${modelParams.length} parameters (+10)`);
        } else {
            factors.push('No parameter provenance information');
        }
        
        // Parameter observability ratio (10 points)
        const nObs = parsedArgs.n_observables ?? model.observables.length;
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
        
        return createToolResult({
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
                good_fits: validationHistory.filter(v => v.fit_quality === 'good').length,
                moderate_fits: validationHistory.filter(v => v.fit_quality === 'moderate').length,
            },
            recommendations,
            summary: `Model maturity: ${maturityLevel} (${maturityScore}/${maxScore}). ${validationHistory.length > 0 ? `Validated against ${validationHistory.length} dataset(s). ` : ''}${recommendations.length > 0 ? recommendations.join('. ') : 'No critical issues.'}`,
        });
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error)));
        return createToolResult(structured);
    }
}
