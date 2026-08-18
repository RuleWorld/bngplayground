import { analyzeQSSA, applyQSSAReduction, loadEvaluator } from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { qssaReductionArgsSchema } from '../schemas/index.js';
import {
    createToolResult,
    parseArgs,
    parseModelOrThrow,
} from '../services/engine.js';
import { structureError } from '../services/errors.js';

/**
 * qssa_reduction
 *
 * Quasi-steady-state approximation preprocessing and reduction.
 *
 * Engine entry points: `analyzeQSSA(model, options)` and
 * `applyQSSAReduction(model, speciesToEliminate)` from
 * `packages/engine/src/services/analysis/QSSAPreprocessor.ts`.
 * These require the engine barrel export added in PR 1 of this plan.
 *
 * Two modes:
 *   - "analyze": identify candidate fast-slow species for QSSA/conservation,
 *     returning per-species recommendation + rationale + optional speedup
 *     estimate. Non-destructive — no model changes.
 *   - "apply": eliminate the specified species via QSSA, returning the reduced
 *     model plus detected conservation laws and a speedup estimate.
 *
 * The `reduce_model` tool already in the registry is a *different* reduction:
 * it's regularization-based parameter pruning (L1/L2 + fitParameters +
 * pruneModel). QSSA operates at the structural level — identifying fast
 * transients that reach pseudo-equilibrium rapidly and can be algebraically
 * eliminated from the ODE system. The two tools are complementary: QSSA
 * compresses the state space; reduce_model compresses the parameter space.
 */
export async function handleQssaReduction(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('qssa_reduction', qssaReductionArgsSchema, args);
        await loadEvaluator();

        if (!parsedArgs.code || parsedArgs.code.trim() === '') {
            return createToolResult(structureError(
                new Error('Model code must be a non-empty string.'),
            ));
        }

        const model = parseModelOrThrow(parsedArgs.code);
        if (!model.species || model.species.length === 0) {
            return createToolResult(structureError(
                new Error('Model must contain at least one species definition.'),
            ));
        }

        if (parsedArgs.mode === 'analyze') {
            const qssaOptions: {
                fastSlowThreshold?: number;
                minFastReactions?: number;
                generateReducedModel?: boolean;
            } = {};
            if (parsedArgs.fast_slow_threshold !== undefined) {
                qssaOptions.fastSlowThreshold = parsedArgs.fast_slow_threshold;
            }
            if (parsedArgs.min_fast_reactions !== undefined) {
                qssaOptions.minFastReactions = parsedArgs.min_fast_reactions;
            }
            if (parsedArgs.generate_reduced_model !== undefined) {
                qssaOptions.generateReducedModel = parsedArgs.generate_reduced_model;
            }

            const result = analyzeQSSA(model, {
                ...qssaOptions,
            });

            const recommendedForQssa = result.candidates.filter(
                (c) => c.recommendation === 'QSSA',
            );
            const recommendedForConservation = result.candidates.filter(
                (c) => c.recommendation === 'CONSERVATION',
            );

            return createToolResult({
                mode: 'analyze',
                summary: {
                    nCandidates: result.candidates.length,
                    nRecommendedForQssa: recommendedForQssa.length,
                    nRecommendedForConservation: recommendedForConservation.length,
                    textSummary: result.summary,
                },
                candidates: result.candidates,
                ...(result.reducedModel
                    ? { estimate: result.reducedModel }
                    : {}),
            });
        }

        // mode: apply
        const species = parsedArgs.species_to_eliminate!;

        // Validate species_to_eliminate contains non-empty/non-blank names.
        const invalidSpecies = species.filter((s) => !s || s.trim() === '');
        if (invalidSpecies.length > 0) {
            return createToolResult(structureError(
                new Error('species_to_eliminate must contain only non-empty, non-blank strings.'),
            ));
        }

        // Validate that every requested species exists in the model.
        const modelSpeciesNames = new Set((model.species ?? []).map((s) => s.name));
        const unknownSpecies = species.filter((s) => !modelSpeciesNames.has(s));
        if (unknownSpecies.length > 0) {
            return createToolResult(structureError(
                new Error(
                    `species_to_eliminate references species not in model: ${unknownSpecies.join(', ')}. ` +
                    `Available species: ${[...modelSpeciesNames].slice(0, 20).join(', ')}${modelSpeciesNames.size > 20 ? '...' : ''}`,
                ),
            ));
        }

        const reduction = applyQSSAReduction(model, species);

        return createToolResult({
            mode: 'apply',
            summary: {
                nEliminatedSpecies: reduction.eliminatedSpecies.length,
                nConservationLaws: reduction.conservationLaws.length,
                nModifiedReactions: reduction.modifiedReactions,
                estimatedSpeedup: reduction.estimatedSpeedup,
            },
            eliminatedSpecies: reduction.eliminatedSpecies,
            conservationLaws: reduction.conservationLaws,
            notes: reduction.notes,
            reducedModel: {
                parameterCount: Object.keys(reduction.model.parameters).length,
                speciesCount: (reduction.model.species ?? []).length,
                reactionRulesCount: (reduction.model.reactionRules ?? []).length,
            },
        });
    } catch (error) {
        return createToolResult(structureError(error instanceof Error ? error : new Error(String(error), { cause: error })));
    }
}