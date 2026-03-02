/**
 * services/optimization/sbplx.ts
 *
 * Async Subplex (SBPLX) optimizer – Nelder-Mead on rotating subspaces.
 *
 * Re-implementation of Rowan's "Subplex" algorithm (T. Rowan, 1990, PhD thesis,
 * University of Texas at Austin). SBPLX decomposes the parameter vector into
 * low-dimensional subspaces (2–5 dims) and runs Nelder-Mead within each
 * subspace. This dramatically reduces the total number of evaluations for
 * problems with ≥5 parameters compared to full-simplex Nelder-Mead.
 *
 * Works with async objective functions (e.g., ODE simulations via workers).
 *
 * See also: NLopt's implementation (nlopt/src/api/sbplx.c) for reference.
 */

import { nelderMead, NelderMeadOptions, NelderMeadResult } from './nelderMead';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SbplxOptions {
    /** Maximum total function evaluations (default 2000). */
    maxEval?: number;
    /** Convergence tolerance on function value (default 1e-6). */
    ftol?: number;
    /** Convergence tolerance on parameter values (default 1e-8). */
    xtol?: number;
    /** Initial step sizes for each dimension (default 0.1 * |x| or 0.1). */
    initialStep?: number | number[];
    /** Progress callback. */
    onProgress?: (info: SbplxProgress) => void;
    /** AbortSignal to cancel mid-run. */
    signal?: AbortSignal;
    /** Minimum subspace dimension (default 2). */
    minSubspaceDim?: number;
    /** Maximum subspace dimension (default 5). */
    maxSubspaceDim?: number;
}

export interface SbplxProgress {
    iteration: number;
    nEval: number;
    bestValue: number;
    bestX: Float64Array;
}

export interface SbplxResult {
    x: number[];
    value: number;
    nEval: number;
    iterations: number;
    converged: boolean;
    stopReason: 'converged_f' | 'converged_x' | 'maxeval' | 'aborted';
}

// ---------------------------------------------------------------------------
// Main algorithm
// ---------------------------------------------------------------------------

/**
 * Minimize an async function using the Subplex (SBPLX) algorithm.
 *
 * Decomposes parameters into small subspaces and runs Nelder-Mead on each.
 * Much more efficient than full NM for ≥5 parameters because it avoids
 * constructing an (n+1)-vertex simplex in high dimensions.
 */
export async function sbplx(
    f: (x: number[]) => Promise<number>,
    x0: number[],
    opts: SbplxOptions = {}
): Promise<SbplxResult> {
    const n = x0.length;
    const maxEval = opts.maxEval ?? 2000;
    const ftol = opts.ftol ?? 1e-6;
    const xtol = opts.xtol ?? 1e-8;
    const signal = opts.signal;
    const minSub = opts.minSubspaceDim ?? 2;
    const maxSub = Math.min(opts.maxSubspaceDim ?? 5, n);

    // Current best point.
    let x = [...x0];
    let fx = await f(x);
    let nEval = 1;
    let iter = 0;
    let prevFx = Infinity;

    // Step sizes per dimension.
    const step = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        if (Array.isArray(opts.initialStep)) {
            step[i] = opts.initialStep[i];
        } else {
            step[i] = opts.initialStep ?? (Math.abs(x0[i]) > 1e-10 ? 0.1 * Math.abs(x0[i]) : 0.1);
        }
    }

    // Change magnitudes from previous cycle (for subspace partitioning).
    const delta = new Float64Array(n);
    // Initialize delta with step sizes.
    for (let i = 0; i < n; i++) delta[i] = step[i];

    // Permutation: tracks dimension ordering by sensitivity.
    const perm = Array.from({ length: n }, (_, i) => i);

    while (nEval < maxEval) {
        if (signal?.aborted) {
            return { x, value: fx, nEval, iterations: iter, converged: false, stopReason: 'aborted' };
        }

        // Check convergence on function value.
        if (iter > 0 && Math.abs(prevFx - fx) < ftol) {
            return { x, value: fx, nEval, iterations: iter, converged: true, stopReason: 'converged_f' };
        }

        // Check convergence on parameter values.
        if (iter > 0 && paramChangeNorm(delta, n) < xtol) {
            return { x, value: fx, nEval, iterations: iter, converged: true, stopReason: 'converged_x' };
        }

        prevFx = fx;

        // Sort dimensions by |delta| descending (most sensitive first).
        perm.sort((a, b) => Math.abs(delta[b]) - Math.abs(delta[a]));

        // Partition sorted dimensions into subspaces.
        const subspaces = partitionSubspaces(perm, n, minSub, maxSub);

        // Optimize each subspace in sequence.
        for (const sub of subspaces) {
            if (signal?.aborted) break;
            if (nEval >= maxEval) break;

            const subDim = sub.length;

            // Build sub-problem: extract subspace variables.
            const subX0 = sub.map(i => x[i]);
            const subStep = sub.map(i => step[i]);

            // Create objective that only varies the subspace dimensions.
            const subF = async (sx: number[]): Promise<number> => {
                const xFull = [...x];
                for (let j = 0; j < subDim; j++) xFull[sub[j]] = sx[j];
                return f(xFull);
            };

            // Budget: allocate evals proportional to subspace dimensionality.
            const subMaxEval = Math.min(
                Math.max(10 * (subDim + 1), 50),
                maxEval - nEval
            );

            // Run NM on this subspace.
            const nmOpts: NelderMeadOptions = {
                maxEval: subMaxEval,
                ftol,
                xtol,
                initialStep: subStep,
                signal,
            };

            const nmResult: NelderMeadResult = await nelderMead(subF, subX0, nmOpts);
            nEval += nmResult.nEval;

            // Update best point and delta.
            if (nmResult.value < fx) {
                for (let j = 0; j < subDim; j++) {
                    delta[sub[j]] = nmResult.x[j] - x[sub[j]];
                    x[sub[j]] = nmResult.x[j];
                    // Adapt step sizes based on movement.
                    step[sub[j]] = Math.max(
                        Math.abs(delta[sub[j]]) * 0.5,
                        step[sub[j]] * 0.5,
                        1e-12
                    );
                }
                fx = nmResult.value;
            } else {
                // No improvement: shrink step sizes for this subspace.
                for (let j = 0; j < subDim; j++) {
                    delta[sub[j]] = 0;
                    step[sub[j]] *= 0.5;
                }
            }
        }

        iter++;

        // Emit progress.
        if (opts.onProgress && iter % 1 === 0) {
            opts.onProgress({
                iteration: iter,
                nEval,
                bestValue: fx,
                bestX: Float64Array.from(x),
            });
        }
    }

    return {
        x,
        value: fx,
        nEval,
        iterations: iter,
        converged: false,
        stopReason: 'maxeval',
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Partition `n` sorted dimension indices into subspaces of size [minSub,maxSub].
 */
function partitionSubspaces(
    perm: number[],
    n: number,
    minSub: number,
    maxSub: number
): number[][] {
    const subspaces: number[][] = [];
    let start = 0;

    while (start < n) {
        let end = Math.min(start + maxSub, n);
        const remaining = n - end;

        // If the remaining dimensions would be too small for a subspace,
        // extend this one to absorb them.
        if (remaining > 0 && remaining < minSub) {
            end = n;
        }

        subspaces.push(perm.slice(start, end));
        start = end;
    }

    return subspaces;
}

/**
 * Compute the max-norm of the change vector.
 */
function paramChangeNorm(delta: Float64Array, n: number): number {
    let maxChange = 0;
    for (let i = 0; i < n; i++) {
        const d = Math.abs(delta[i]);
        if (d > maxChange) maxChange = d;
    }
    return maxChange;
}
