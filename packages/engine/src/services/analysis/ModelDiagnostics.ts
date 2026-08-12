import { BNGLModel } from '../../types';
import { analyzeModelStiffness, getOptimalCVODEConfig } from '../simulation/cvodeStiffConfig';

export interface ModelDiagnostics {
    stiffness: {
        category: 'mild' | 'moderate' | 'severe' | 'extreme';
        ratio: number;
        rationale: string;
    };
    estimation: {
        seeds: number;
        rules: number;
        parameters: number;
        potentialComplexity: 'normal' | 'high' | 'very_high';
    };
}

/**
 * Performs deep, shared-engine model diagnostics including numerical stiffness
 * analysis, solver configuration recommendations, and complexity estimation.
 *
 * @param model - The parsed BNGLModel object.
 * @returns Structured ModelDiagnostics report.
 */
export function diagnoseModel(model: BNGLModel): ModelDiagnostics {
    // 1. Numerical stiffness analysis
    const ruleRates = (model.reactionRules ?? []).map((r) => {
        if (r.isFunctionalRate) return NaN;
        const val = model.parameters[r.rate];
        if (val !== undefined) return val;
        const num = Number(r.rate);
        return Number.isFinite(num) ? num : NaN;
    }).filter((v) => !Number.isNaN(v));

    const rateConstants = [
        ...(model.reactions?.map((r) => r.rateConstant) ?? []),
        ...ruleRates,
    ];

    const stiffness = analyzeModelStiffness(rateConstants, {
        hasFunctionalRates:
            model.reactions?.some((r) => r.isFunctionalRate) ||
            model.reactionRules?.some((r) => r.isFunctionalRate),
        systemSize: model.species.length,
    });
    const recommendedConfig = getOptimalCVODEConfig(stiffness);

    // 2. Complexity estimation
    const totalFactor = (model.reactionRules?.length ?? 0) * model.species.length;
    const potentialComplexity =
        totalFactor > 50000 ? 'very_high' : totalFactor > 5000 ? 'high' : 'normal';

    return {
        stiffness: {
            category: stiffness.category,
            ratio: stiffness.rateRatio,
            rationale: recommendedConfig.rationale,
        },
        estimation: {
            seeds: model.species.length,
            rules: model.reactionRules?.length ?? 0,
            parameters: Object.keys(model.parameters).length,
            potentialComplexity,
        },
    };
}
