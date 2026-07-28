import { analyzeModelStiffness, getOptimalCVODEConfig } from '@bngplayground/engine';
import { ToolArgs, ToolResult } from '../types/index.js';
import { diagnoseArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, parseModelOrThrow, validateModel } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleDiagnose(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('diagnose', diagnoseArgsSchema, args);
        const model = parseModelOrThrow(parsedArgs.code);

        // 1. Structural Checks
        const validation = validateModel(model, false);

        // 2. Numerical stiffness analysis
        const ruleRates = (model.reactionRules ?? []).map(r => {
            if (r.isFunctionalRate) return NaN;
            const val = model.parameters[r.rate];
            if (val !== undefined) return val;
            const num = Number(r.rate);
            return isFinite(num) ? num : NaN;
        }).filter(v => !isNaN(v));

        const rateConstants = [
            ...(model.reactions?.map(r => r.rateConstant) ?? []),
            ...ruleRates
        ];

        const stiffness = analyzeModelStiffness(rateConstants, {
            hasFunctionalRates: model.reactions?.some(r => r.isFunctionalRate) || model.reactionRules?.some(r => r.isFunctionalRate),
            systemSize: model.species.length
        });
        const recommendedConfig = getOptimalCVODEConfig(stiffness);

        // 3. Complexity estimation
        const totalFactor = (model.reactionRules?.length ?? 0) * model.species.length;
        const estimation = {
            seeds: model.species.length,
            rules: model.reactionRules?.length ?? 0,
            parameters: Object.keys(model.parameters).length,
            potentialComplexity: totalFactor > 50000 ? 'very_high' : totalFactor > 5000 ? 'high' : 'normal'
        };

        return createToolResult({
            validation: {
                errors: validation.summary.errors,
                warnings: validation.summary.warnings
            },
            stiffness: {
                category: stiffness.category,
                ratio: stiffness.rateRatio,
                rationale: recommendedConfig.rationale
            },
            estimation
        });
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
