/**
 * services/optimization/nelderMead.ts
 *
 * Async Nelder-Mead (downhill simplex) optimizer.
 *
 * Works with async objective functions, making it suitable for ODE-based
 * parameter fitting where each evaluation requires a worker round-trip.
 *
 * Reference: Nelder & Mead (1965), Computer Journal 7(4):308–313.
 */

export interface NelderMeadOptions {
  /** Maximum number of function evaluations (default 2000). */
  maxEval?: number;
  /** Convergence tolerance on function value (default 1e-6). */
  ftol?: number;
  /** Convergence tolerance on parameter values (default 1e-8). */
  xtol?: number;
  /** Initial step size for simplex construction (default 0.1 × |x| or 0.1). */
  initialStep?: number | number[];
  /** Progress callback, called after each full iteration. */
  onProgress?: (info: NelderMeadProgress) => void;
  /** AbortSignal to cancel mid-run. */
  signal?: AbortSignal;
}

export interface NelderMeadProgress {
  iteration: number;
  nEval: number;
  bestValue: number;
  bestX: Float64Array;
}

export interface NelderMeadResult {
  /** Best found parameter vector. */
  x: number[];
  /** Objective value at x. */
  value: number;
  /** Number of function evaluations performed. */
  nEval: number;
  /** Number of outer iterations. */
  iterations: number;
  /** Whether a convergence criterion was met. */
  converged: boolean;
  /** Reason for stopping. */
  stopReason: 'converged_f' | 'converged_x' | 'maxeval' | 'aborted';
}

/** Nelder-Mead reflection/expansion/contraction coefficients. */
const ALPHA = 1.0;  // reflection
const GAMMA = 2.0;  // expansion
const RHO   = 0.5;  // contraction
const SIGMA = 0.5;  // shrink

/**
 * Minimize an async function using Nelder-Mead.
 *
 * @param f   Async objective function. Must return a finite number.
 * @param x0  Initial parameter vector.
 * @param opts Options.
 */
export async function nelderMead(
  f: (x: number[]) => Promise<number>,
  x0: number[],
  opts: NelderMeadOptions = {}
): Promise<NelderMeadResult> {
  const n = x0.length;
  const maxEval = opts.maxEval ?? 2000;
  const ftol    = opts.ftol    ?? 1e-6;
  const xtol    = opts.xtol    ?? 1e-8;
  const signal  = opts.signal;

  // Build initial simplex: first vertex = x0, remaining n vertices = x0 + step along each axis.
  const simplex: number[][] = Array.from({ length: n + 1 }, () => [...x0]);
  for (let i = 0; i < n; i++) {
    const step = Array.isArray(opts.initialStep)
      ? opts.initialStep[i]
      : (opts.initialStep ?? (Math.abs(x0[i]) > 1e-10 ? 0.1 * Math.abs(x0[i]) : 0.1));
    simplex[i + 1][i] += step;
  }

  // Evaluate all initial simplex vertices.
  let nEval = 0;
  const fVal = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    if (signal?.aborted) return aborted(simplex, fVal, nEval);
    fVal[i] = await f(simplex[i]);
    nEval++;
  }

  let iter = 0;

  // Helper array ops (allocate once).
  const centroid = new Array<number>(n);
  const xr  = new Array<number>(n);
  const xe  = new Array<number>(n);
  const xc  = new Array<number>(n);

  while (nEval < maxEval) {
    if (signal?.aborted) return aborted(simplex, fVal, nEval);

    // Sort vertices: index 0 = best, index n = worst.
    const order = Array.from({ length: n + 1 }, (_, i) => i).sort((a, b) => fVal[a] - fVal[b]);
    reorder(simplex, fVal, order);

    // Check function-value convergence.
    const spread = fVal[n] - fVal[0];
    if (spread < ftol && spread >= 0) {
      return {
        x: [...simplex[0]], value: fVal[0], nEval, iterations: iter,
        converged: true, stopReason: 'converged_f'
      };
    }

    // Check parameter-space convergence.
    if (maxParamChange(simplex, n) < xtol) {
      return {
        x: [...simplex[0]], value: fVal[0], nEval, iterations: iter,
        converged: true, stopReason: 'converged_x'
      };
    }

    // Compute centroid of all vertices except the worst.
    centroid.fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i][j];
    for (let j = 0; j < n; j++) centroid[j] /= n;

    // Reflection.
    for (let j = 0; j < n; j++) xr[j] = centroid[j] + ALPHA * (centroid[j] - simplex[n][j]);
    const fr = await f(xr); nEval++;

    if (fr < fVal[0]) {
      // Expansion.
      for (let j = 0; j < n; j++) xe[j] = centroid[j] + GAMMA * (xr[j] - centroid[j]);
      const fe = await f(xe); nEval++;
      if (fe < fr) {
        simplex[n] = [...xe]; fVal[n] = fe;
      } else {
        simplex[n] = [...xr]; fVal[n] = fr;
      }
    } else if (fr < fVal[n - 1]) {
      // Accept reflection.
      simplex[n] = [...xr]; fVal[n] = fr;
    } else {
      // Contraction.
      if (fr < fVal[n]) {
        // Outside contraction.
        for (let j = 0; j < n; j++) xc[j] = centroid[j] + RHO * (xr[j] - centroid[j]);
        const fc = await f(xc); nEval++;
        if (fc <= fr) {
          simplex[n] = [...xc]; fVal[n] = fc;
        } else {
          await shrink(simplex, fVal, f, n); nEval += n;
        }
      } else {
        // Inside contraction.
        for (let j = 0; j < n; j++) xc[j] = centroid[j] - RHO * (centroid[j] - simplex[n][j]);
        const fc = await f(xc); nEval++;
        if (fc < fVal[n]) {
          simplex[n] = [...xc]; fVal[n] = fc;
        } else {
          await shrink(simplex, fVal, f, n); nEval += n;
        }
      }
    }

    iter++;

    // Emit progress every 5 iterations.
    if (opts.onProgress && iter % 5 === 0) {
      // Re-sort to get best.
      const best = fVal.indexOf(Math.min(...fVal));
      opts.onProgress({
        iteration: iter, nEval,
        bestValue: fVal[best],
        bestX: Float64Array.from(simplex[best])
      });
    }
  }

  // Max evals reached.
  const best = fVal.indexOf(Math.min(...fVal));
  return {
    x: [...simplex[best]], value: fVal[best], nEval, iterations: iter,
    converged: false, stopReason: 'maxeval'
  };
}

// ---------- helpers --------------------------------------------------------

function reorder(simplex: number[][], fVal: Float64Array, order: number[]) {
  const tmpS = simplex.map(v => [...v]);
  const tmpF = Float64Array.from(fVal);
  for (let i = 0; i <= order.length - 1; i++) {
    simplex[i] = tmpS[order[i]];
    fVal[i]    = tmpF[order[i]];
  }
}

async function shrink(
  simplex: number[][], fVal: Float64Array,
  f: (x: number[]) => Promise<number>, n: number
) {
  for (let i = 1; i <= n; i++) {
    for (let j = 0; j < n; j++) {
      simplex[i][j] = simplex[0][j] + SIGMA * (simplex[i][j] - simplex[0][j]);
    }
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
