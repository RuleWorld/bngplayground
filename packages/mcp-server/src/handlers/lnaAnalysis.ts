import {
    computeLNASteadyState,
    computeLNATimeCourse,
    loadEvaluator,
} from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { lnaAnalysisArgsSchema } from '../schemas/index.js';
import {
    createToolResult,
    parseArgs,
    parseModelOrThrow,
    expandModel,
} from '../services/engine.js';
import { structureError } from '../services/errors.js';

/**
 * lna_analysis
 *
 * Linear Noise Approximation (van Kampen system-size expansion). Two modes:
 *   - "steady_state": Newton-raphson to the deterministic fixed point, then
 *     solve the Lyapunov equation A·C + C·Aᵀ + D = 0 for the covariance.
 *   - "time_course": augment the ODE with dC/dt = A(t)·C + C·Aᵀ + D(t), integrate
 *     with RK4.
 *
 * Engine entry points: `computeLNASteadyState(config)` and
 * `computeLNATimeCourse(config)` from
 * `packages/engine/src/services/analysis/LinearNoiseApproximation.ts`
 * (already exported from the engine barrel at line 230).
 *
 * Returns analytical mean, covariance (or covariances-over-time), per-species
 * coefficient-of-variation and Fano factor — all in closed form, orders of
 * magnitude faster than SSA ensemble estimation.
 */
export async function handleLnaAnalysis(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('lna_analysis', lnaAnalysisArgsSchema, args);
        await loadEvaluator();

        const model = parseModelOrThrow(parsedArgs.code);
        const expanded = await expandModel(model);

        if (parsedArgs.mode === 'time_course' && parsedArgs.t_end === undefined) {
            return createToolResult(structureError(
                new Error('mode="time_course" requires t_end'),
            ));
        }

        const reactions = expanded.reactions ?? [];
        if (reactions.length === 0) {
            return createToolResult(structureError(
                new Error('Expanded model has no reactions — cannot compute LNA'),
            ));
        }

        const volume = parsedArgs.volume ?? 1;

        if (parsedArgs.mode === 'steady_state') {
            const result = computeLNASteadyState({
                model,
                reactions,
                species: expanded.species,
                volume,
            });

            if (!result.converged) {
                return createToolResult({
                    mode: 'steady_state',
                    converged: false,
                    warning: 'Newton-raphson did not converge to a steady state. ' +
                             'Covariance values should be treated as approximate.',
                    speciesNames: result.speciesNames,
                    mean: result.mean,
                    cv: result.cv,
                    fano: result.fano,
                    ...(parsedArgs.include_covariance_matrix !== false
                        ? { covariance: result.covariance }
                        : {}),
                });
            }

            return createToolResult({
                mode: 'steady_state',
                converged: true,
                volume,
                speciesNames: result.speciesNames,
                mean: result.mean,
                cv: result.cv,
                fano: result.fano,
                ...(parsedArgs.include_covariance_matrix !== false
                    ? { covariance: result.covariance }
                    : {}),
            });
        }

        // mode: time_course
        const result = computeLNATimeCourse({
            model,
            reactions,
            species: expanded.species,
            volume,
            timeDependent: true,
            t_end: parsedArgs.t_end!,
            n_steps: parsedArgs.n_steps ?? 100,
        });

        return createToolResult({
            mode: 'time_course',
            volume,
            speciesNames: result.speciesNames,
            times: result.times,
            means: result.means,
            variances: result.variances,
            ...(parsedArgs.include_covariance_matrix !== false
                ? { covariances: result.covariances }
                : {}),
        });
    } catch (error) {
        return createToolResult(structureError(error instanceof Error ? error : new Error(String(error))));
    }
}