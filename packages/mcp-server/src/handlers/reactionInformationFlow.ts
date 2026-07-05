import {
    analyzeReactionInformation,
    compareCausalGraphs,
    simulate,
    loadEvaluator,
    buildStructuralEdges,
} from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { reactionInformationFlowArgsSchema } from '../schemas/index.js';
import {
    createToolResult,
    parseArgs,
    parseModelOrThrow,
    expandModel,
    cloneExpandedModel,
    updateMassActionRates,
} from '../services/engine.js';
import { structureError } from '../services/errors.js';

/**
 * reaction_information_flow
 *
 * Information-theoretic analysis of SSA reaction firing events:
 *   - per-reaction entropy
 *   - pairwise mutual information (with shuffle-based p-values)
 *   - transfer entropy (directed information flow)
 *   - phase locking via FFT
 *   - empirical causal graph derived from transfer entropy
 *   - optional: comparison of empirical vs structural edges
 *
 * Engine entry points: `analyzeReactionInformation(config)` and
 * `compareCausalGraphs(empirical, structural)` from
 * `packages/engine/src/services/analysis/ReactionInformationTheory.ts`
 * (types exported from the engine barrel at line 201).
 *
 * Requires recordFirings=true on the SSA run, which is gated by the
 * simulateArgsSchema extension in this PR.
 *
 * This capability is the "mechanistic causal tracing" paper hook most
 * literally: the emergent causal graph from firing-event information flow,
 * compared against the structural rule graph, produces directly-auditable
 * claims about which mechanisms the model's dynamics actually instantiate.
 */
export async function handleReactionInformationFlow(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('reaction_information_flow', reactionInformationFlowArgsSchema, args);
        await loadEvaluator();

        const model = parseModelOrThrow(parsedArgs.code);
        const expanded = await expandModel(model);

        const reactions = expanded.reactions ?? [];
        if (reactions.length === 0) {
            return createToolResult(structureError(
                new Error('Expanded model has no reactions — cannot analyze information flow'),
            ));
        }

        const runModel = cloneExpandedModel(expanded);
        updateMassActionRates(runModel);

        const simResult = await simulate(0, runModel, {
            method: 'ssa',
            t_end: parsedArgs.t_end,
            n_steps: parsedArgs.n_steps,
            seed: parsedArgs.seed,
            recordFirings: true,
            maxFiringEvents: parsedArgs.max_firing_events ?? 100000,
        } as any, { checkCancelled: () => {}, postMessage: () => {} });

        if (!simResult.firingLog || simResult.firingLog.length === 0) {
            return createToolResult(structureError(
                new Error(
                    'SSA produced no reaction firings. ' +
                    'Check that t_end is long enough and initial species counts are positive.',
                ),
            ));
        }

        if (simResult.firingLog.length < 50) {
            return createToolResult({
                warning: `Only ${simResult.firingLog.length} firing events recorded. ` +
                         `Information-theoretic estimates below ~50 events are unreliable; ` +
                         `increase t_end or initial species counts.`,
                nFiringEvents: simResult.firingLog.length,
                entropy: [],
                mutualInformation: [],
                transferEntropy: [],
                phaseLocking: [],
                empiricalCausalGraph: [],
            });
        }

        const analysis = analyzeReactionInformation({
            firingLog: simResult.firingLog,
            nReactions: reactions.length,
            binWidth: parsedArgs.bin_width,
            nShuffles: parsedArgs.n_shuffles,
            historyLength: parsedArgs.history_length,
            minCoFirings: parsedArgs.min_co_firings,
        });

        let structuralComparison: ReturnType<typeof compareCausalGraphs> | undefined;
        if (parsedArgs.compare_structural_graph) {
            const structural = buildStructuralEdges(reactions);
            structuralComparison = compareCausalGraphs(analysis.empiricalCausalGraph, structural);
        }

        return createToolResult({
            summary: {
                nFiringEvents: simResult.firingLog.length,
                nReactions: reactions.length,
                nSignificantMI: analysis.mutualInformation.filter((m) => m.pValue < 0.05).length,
                nSignificantTE: analysis.transferEntropy.filter((t) => t.pValue < 0.05).length,
                nPhaseLocked: analysis.phaseLocking.filter((p) => p.isLocked).length,
            },
            entropy: analysis.entropy,
            mutualInformation: analysis.mutualInformation,
            transferEntropy: analysis.transferEntropy,
            phaseLocking: analysis.phaseLocking,
            empiricalCausalGraph: analysis.empiricalCausalGraph,
            ...(structuralComparison ? {
                structuralComparison: {
                    nConcordant: structuralComparison.concordant.length,
                    nStructuralOnly: structuralComparison.structuralOnly.length,
                    nEmergent: structuralComparison.emergent.length,
                    concordant: structuralComparison.concordant,
                    structuralOnly: structuralComparison.structuralOnly,
                    emergent: structuralComparison.emergent,
                },
            } : {}),
        });
    } catch (error) {
        return createToolResult(structureError(error instanceof Error ? error : new Error(String(error))));
    }
}
