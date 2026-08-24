/**
 * services/optimization/paramFitter.ts
 *
 * App-level thin wrapper around the engine's pure `fitParameters` function.
 *
 * This file is the ONLY place where browser-specific concerns (bnglService worker,
 * modelId caching) are wired into the parameter fitting pipeline. All numerical
 * fitting logic lives in @bngplayground/engine.
 *
 * Algorithm selection:
 *   'nelder-mead'  (default) – robust, derivative-free, good for 2–15 params
 *   'sbplx'        – Subplex (NM on rotating subspaces, 2–3x fewer evals for >=5 params)
 *   'projected-nm' – bound-constrained NM with projected simplex and barrier penalty
 *   'bobyqa'       – uses SBPLX until synchronous solver bridge enables NLopt-js
 */

import { BNGLModel } from '../../types';
import { bnglService } from '../bnglService';
import type {
    FitAlgorithm,
    FitConfig as EngineFitConfig,
    FitProgress,
    FitResult,
    ParamBounds,
    ExperimentalDataPoint,
    RegularizationConfig,
} from '@bngplayground/engine';
import { fitParameters as engineFitParameters } from '@bngplayground/engine';

// Re-export engine types so consumers of this file don't need two import paths.
export type { FitAlgorithm, FitProgress, FitResult, ParamBounds, ExperimentalDataPoint };

// ---------------------------------------------------------------------------
// App-level config (extends engine config with browser-specific fields)
// ---------------------------------------------------------------------------

export interface FitConfig {
    model: BNGLModel;
    /** Prepared model ID for simulateCached (avoids re-parsing each eval). */
    modelId: number;
    paramBounds: ParamBounds[];
    experimentalData: ExperimentalDataPoint[];
    algorithm?: FitAlgorithm;
    /** Max number of forward ODE evaluations (default 500). */
    maxEval?: number;
    /** Absolute function-value tolerance (default 1e-6). */
    ftol?: number;
    /** BPSL constraint text (one constraint per line). */
    bpslConstraints?: string;
    /** Weight for BPSL penalty relative to SSE (default 1.0). */
    bpslWeight?: number;
    /** Optional regularization config for L1/L2/elastic-net fitting. */
    regularization?: RegularizationConfig;
    onProgress?: (p: FitProgress) => void;
    signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Fit model parameters to experimental time-course data by minimizing SSE.
 *
 * Delegates all numerical work to the engine's pure fitParameters; only
 * bridges the bnglService worker here.
 */
export async function fitParameters(cfg: FitConfig): Promise<FitResult> {
    const {
        model, modelId, paramBounds, experimentalData,
        algorithm, maxEval, ftol, bpslConstraints, bpslWeight, regularization, onProgress, signal,
    } = cfg;

    const timePoints = experimentalData.map(d => d.time);
    const tEnd = timePoints[timePoints.length - 1];
    const nSteps = timePoints.length - 1;

    /** Delegate a single ODE evaluation to the browser worker pool. */
    const simulateFn: EngineFitConfig['simulate'] = async (_overrides, _options) => {
        return bnglService.simulateCached(modelId, _overrides, {
            method: 'ode',
            t_end: tEnd,
            n_steps: nSteps,
            atol: 1e-8,
            rtol: 1e-6,
            includeSpeciesData: false,
            includeExpandedNetwork: false,
        });
    };

    const engineCfg: EngineFitConfig = {
        model,
        paramBounds,
        experimentalData,
        simulate: simulateFn,
        algorithm,
        maxEval,
        ftol,
        bpslConstraints,
        bpslWeight,
        regularization,
        onProgress,
        signal,
    };

    return engineFitParameters(engineCfg);
}
