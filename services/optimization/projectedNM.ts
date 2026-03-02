/**
 * services / optimization / projectedNM.ts
    *
 * Async Projected Nelder - Mead optimizer(bound - constrained).
 *
 * Implements bound - respecting Nelder - Mead with an optional logarithmic penalty barrier.
 * This is a practical bound - aware derivative - free optimizer that properly
    * handles parameter bounds, unlike standard Nelder - Mead which ignores them.
 *
 * Bound enforcement strategy:
 * 1. Simplex vertices are clamped to bounds during construction.
 * 2. Reflection / expansion / contraction points are projected back to feasible region.
 * 3. A logarithmic barrier penalty prevents the optimizer from approaching bounds.
 *
 * For the full COBYLA experience, use NLopt - js directly when a synchronous
    * simulation path becomes available.
 */

import { NelderMeadProgress, NelderMeadResult } from './nelderMead';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectedNMOptions {
    /** Maximum number of function evaluations (default 2000). */
    maxEval?: number;
    /** Convergence tolerance on function value (default 1e-6). */
    ftol?: number;
    /** Convergence tolerance on parameter values (default 1e-8). */
    xtol?: number;
    /** Initial step size for simplex construction (default 0.1 × |x| or 0.1). */
    initialStep?: number | number[];
    /** Lower bounds for each parameter. */
    lowerBounds?: number[];
    /** Upper bounds for each parameter. */
    upperBounds?: number[];
    /** Barrier penalty strength (default 0, set >0 to penalize near-bound solutions). */
    barrierStrength?: number;
    /** Progress callback, called after each full iteration. */
    onProgress?: (info: NelderMeadProgress) => void;
    /** AbortSignal to cancel mid-run. */
    signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALPHA = 1.0;   // reflection
const GAMMA = 2.0;   // expansion
const RHO = 0.5;   // contraction
const SIGMA = 0.5;   // shrink

// ---------------------------------------------------------------------------
// Main algorithm
// ---------------------------------------------------------------------------

/**
 * Minimize an async function with bound constraints using
 * constrained Nelder-Mead.
 */
export async function projectedNM(
    f: (x: number[]) => Promise<number>,
    x0: number[],
    opts: ProjectedNMOptions = {}
): Promise<NelderMeadResult> {
    const n = x0.length;
    const maxEval = opts.maxEval ?? 2000;
    const ftol = opts.ftol ?? 1e-6;
    const xtol = opts.xtol ?? 1e-8;
    const signal = opts.signal;
    const lb = opts.lowerBounds ?? new Array(n).fill(-Infinity);
    const ub = opts.upperBounds ?? new Array(n).fill(Infinity);
    const barrierStrength = opts.barrierStrength ?? 0;

    // Project a point into the feasible region.
    const project = (x: number[]): number[] =>
        x.map((v, i) => Math.max(lb[i], Math.min(ub[i], v)));

    // Wrap the objective with a logarithmic barrier.
    const fBarrier = async (x: number[]): Promise<number> => {
        const xp = project(x);
        let val = await f(xp);
        if (barrierStrength > 0) {
            for (let i = 0; i < n; i++) {
                const range = ub[i] - lb[i];
                if (!isFinite(range) || range <= 0) continue;
                const distLo = xp[i] - lb[i];
                const distHi = ub[i] - xp[i];
                if (distLo > 0 && distHi > 0) {
                    val -= barrierStrength * (Math.log(distLo / range) + Math.log(distHi / range));
                }
            }
        }
        return val;
    };

    // Build initial simplex with projected vertices.
    const simplex: number[][] = Array.from({ length: n + 1 }, () => project([...x0]));
    for (let i = 0; i < n; i++) {
        const rawStep = Array.isArray(opts.initialStep)
            ? opts.initialStep[i]
            : (opts.initialStep ?? (Math.abs(x0[i]) > 1e-10 ? 0.1 * Math.abs(x0[i]) : 0.1));

        // Ensure step doesn't push us out of bounds.
        const range = ub[i] - lb[i];
        const step = isFinite(range) ? Math.min(rawStep, 0.4 * range) : rawStep;
        simplex[i + 1][i] += step;
        simplex[i + 1] = project(simplex[i + 1]);
    }

    // Evaluate all initial vertices.
    let nEval = 0;
    const fVal = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
        if (signal?.aborted) return aborted(simplex, fVal, nEval);
        fVal[i] = await fBarrier(simplex[i]);
        nEval++;
    }

    let iter = 0;
    const centroid = new Array<number>(n);
    const xr = new Array<number>(n);
    const xe = new Array<number>(n);
    const xc = new Array<number>(n);

    while (nEval < maxEval) {
        if (signal?.aborted) return aborted(simplex, fVal, nEval);

        // Sort: index 0 = best, index n = worst.
        const order = Array.from({ length: n + 1 }, (_, i) => i).sort((a, b) => fVal[a] - fVal[b]);
        reorder(simplex, fVal, order);

        // Check function-value convergence.
        const spread = fVal[n] - fVal[0];
        if (spread < ftol && spread >= 0) {
            return {
                x: project([...simplex[0]]), value: fVal[0], nEval, iterations: iter,
                converged: true, stopReason: 'converged_f'
            };
        }

        // Check parameter-space convergence.
        if (maxParamChange(simplex, n) < xtol) {
            return {
                x: project([...simplex[0]]), value: fVal[0], nEval, iterations: iter,
                converged: true, stopReason: 'converged_x'
            };
        }

        // Centroid of all vertices except worst.
        centroid.fill(0);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i][j];
        for (let j = 0; j < n; j++) centroid[j] /= n;

        // Reflection (projected).
        for (let j = 0; j < n; j++) xr[j] = centroid[j] + ALPHA * (centroid[j] - simplex[n][j]);
        const xrP = project([...xr]);
        const fr = await fBarrier(xrP); nEval++;

        if (fr < fVal[0]) {
            // Expansion (projected).
            for (let j = 0; j < n; j++) xe[j] = centroid[j] + GAMMA * (xrP[j] - centroid[j]);
            const xeP = project([...xe]);
            const fe = await fBarrier(xeP); nEval++;
            if (fe < fr) {
                simplex[n] = xeP; fVal[n] = fe;
            } else {
                simplex[n] = xrP; fVal[n] = fr;
            }
        } else if (fr < fVal[n - 1]) {
            simplex[n] = xrP; fVal[n] = fr;
        } else {
            // Contraction (projected).
            if (fr < fVal[n]) {
                for (let j = 0; j < n; j++) xc[j] = centroid[j] + RHO * (xrP[j] - centroid[j]);
                const xcP = project([...xc]);
                const fc = await fBarrier(xcP); nEval++;
                if (fc <= fr) {
                    simplex[n] = xcP; fVal[n] = fc;
                } else {
                    await shrink(simplex, fVal, fBarrier, n, project); nEval += n;
                }
            } else {
                for (let j = 0; j < n; j++) xc[j] = centroid[j] - RHO * (centroid[j] - simplex[n][j]);
                const xcP = project([...xc]);
                const fc = await fBarrier(xcP); nEval++;
                if (fc < fVal[n]) {
                    simplex[n] = xcP; fVal[n] = fc;
                } else {
                    await shrink(simplex, fVal, fBarrier, n, project); nEval += n;
                }
            }
        }

        iter++;

        if (opts.onProgress && iter % 5 === 0) {
            const best = fVal.indexOf(Math.min(...fVal));
            opts.onProgress({
                iteration: iter, nEval,
                bestValue: fVal[best],
                bestX: Float64Array.from(project(simplex[best])),
            });
        }
    }

    // Max evals reached.
    const best = fVal.indexOf(Math.min(...fVal));
    return {
        x: project([...simplex[best]]), value: fVal[best], nEval, iterations: iter,
        converged: false, stopReason: 'maxeval'
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reorder(simplex: number[][], fVal: Float64Array, order: number[]) {
    const tmpS = simplex.map(v => [...v]);
    const tmpF = Float64Array.from(fVal);
    for (let i = 0; i <= order.length - 1; i++) {
        simplex[i] = tmpS[order[i]];
        fVal[i] = tmpF[order[i]];
    }
}

async function shrink(
    simplex: number[][], fVal: Float64Array,
    f: (x: number[]) => Promise<number>, n: number,
    project: (x: number[]) => number[]
) {
    for (let i = 1; i <= n; i++) {
        for (let j = 0; j < n; j++) {
            simplex[i][j] = simplex[0][j] + SIGMA * (simplex[i][j] - simplex[0][j]);
        }
        simplex[i] = project(simplex[i]);
        fVal[i] = await f(simplex[i]);
    }
}

function maxParamChange(simplex: number[][], n: number): number {
    let maxChange = 0;
    for (let i = 1; i <= n; i++) {
        for (let j = 0; j < n; j++) {
            maxChange = Math.max(maxChange, Math.abs(simplex[i][j] - simplex[0][j]));
        }
    }
    return maxChange;
}

function aborted(
    simplex: number[][], fVal: Float64Array, nEval: number
): NelderMeadResult {
    const best = Array.from(fVal).indexOf(Math.min(...fVal));
    return {
        x: [...simplex[best]], value: fVal[best], nEval,
        iterations: 0, converged: false, stopReason: 'aborted'
    };
}
