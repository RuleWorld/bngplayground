/**
 * services/optimization/differentialEvolution.ts
 *
 * Async Differential Evolution (DE/rand/1/bin) global optimizer.
 *
 * Unlike Nelder-Mead/SBPLX (local), DE explores the full parameter space
 * via a population of candidate solutions - essential for multi-modal
 * objective landscapes typical of biochemical model fitting.
 *
 * Each generation: for every agent, build a mutant from 3 random others,
 * crossover with the current agent, and replace if the trial is better.
 * Evaluations within a generation are independent -> parallelizable.
 *
 * Follows the same async-objective interface as nelderMead.ts so it
 * plugs directly into paramFitter.ts.
 *
 * References:
 *   Storn and Price (1997), J Global Optim 11:341-359.
 *   Mitra et al. (2019), iScience 19:1012-1036 [PyBioNetFit].
 */

export interface DEOptions {
  /** Population size (default: 10 x dimension, min 5). */
  popSize?: number;
  /** Differential weight F in [0, 2] (default 0.8). */
  F?: number;
  /** Crossover probability CR in [0, 1] (default 0.9). */
  CR?: number;
  /** Maximum number of objective function evaluations (default 5000). */
  maxEval?: number;
  /** Convergence tolerance on best objective value change (default 1e-6). */
  ftol?: number;
  /** Number of stagnant generations before stopping (default 20). */
  patience?: number;
  /** Lower bounds per dimension (required for random initialization). */
  lowerBounds: number[];
  /** Upper bounds per dimension (required for random initialization). */
  upperBounds: number[];
  /** Seed for reproducibility (default: Date.now()). */
  seed?: number;
  /** Progress callback, called after each generation. */
  onProgress?: (info: DEProgress) => void;
  /** AbortSignal to cancel mid-run. */
  signal?: AbortSignal;
  /**
   * Maximum number of parallel evaluations per batch.
   * Set to navigator.hardwareConcurrency or your worker pool size.
   * Default: Infinity (all population members evaluated in parallel).
   */
  maxParallel?: number;
}

export interface DEProgress {
  generation: number;
  nEval: number;
  bestValue: number;
  bestX: Float64Array;
  /** Mean objective across the population (useful for convergence monitoring). */
  meanValue: number;
}

export interface DEResult {
  /** Best found parameter vector. */
  x: number[];
  /** Objective value at x. */
  value: number;
  /** Number of function evaluations performed. */
  nEval: number;
  /** Number of generations completed. */
  generations: number;
  /** Whether a convergence criterion was met. */
  converged: boolean;
  /** Reason for stopping. */
  stopReason: 'converged_f' | 'patience' | 'maxeval' | 'aborted';
}

// --- Xoshiro128** PRNG (lightweight, deterministic) -------------------------

class PRNG {
  private s: Uint32Array;

  constructor(seed: number) {
    this.s = new Uint32Array(4);
    // SplitMix32 seeding
    let z = (seed | 0) >>> 0;
    for (let i = 0; i < 4; i++) {
      z = (z + 0x9e3779b9) >>> 0;
      let t = z ^ (z >>> 16);
      t = Math.imul(t, 0x85ebca6b);
      t = t ^ (t >>> 13);
      t = Math.imul(t, 0xc2b2ae35);
      t = t ^ (t >>> 16);
      this.s[i] = t >>> 0;
    }
  }

  /** Uniform [0, 1) */
  random(): number {
    const s = this.s;
    const s1x5 = Math.imul(s[1], 5);
    const result = Math.imul(((s1x5 << 7) | (s1x5 >>> 25)) >>> 0, 9) >>> 0;
    const t = s[1] << 9;

    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];

    s[2] ^= t;
    s[3] = ((s[3] << 11) | (s[3] >>> 21)) >>> 0;

    return result / 0x100000000;
  }

  /** Random integer in [0, max) */
  randInt(max: number): number {
    return Math.floor(this.random() * max);
  }
}

// --- Helpers --------------------------------------------------------------

function initializePopulation(
  NP: number,
  n: number,
  x0: number[],
  lb: number[],
  ub: number[],
  rng: PRNG,
): number[][] {
  const pop: number[][] = new Array(NP);

  // First member = initial guess (clamped to bounds)
  pop[0] = x0.map((v, i) => Math.max(lb[i], Math.min(ub[i], v)));

  // Rest = random in [lb, ub]
  for (let i = 1; i < NP; i++) {
    pop[i] = new Array(n);
    for (let j = 0; j < n; j++) {
      pop[i][j] = lb[j] + rng.random() * (ub[j] - lb[j]);
    }
  }

  return pop;
}

function createTrialVector(
  pop: number[][],
  i: number,
  rng: PRNG,
  n: number,
  NP: number,
  CR: number,
  F: number,
  lb: number[],
  ub: number[]
): number[] {
  // Pick 3 distinct indices != i
  let a: number;
  let b: number;
  let c: number;
  do {
    a = rng.randInt(NP);
  } while (a === i);
  do {
    b = rng.randInt(NP);
  } while (b === i || b === a);
  do {
    c = rng.randInt(NP);
  } while (c === i || c === a || c === b);

  // Mutation: v = pop[a] + F * (pop[b] - pop[c])
  // Binomial crossover: trial[j] = v[j] if rand < CR or j == jrand
  const jrand = rng.randInt(n);
  const trial = new Array<number>(n);
  for (let j = 0; j < n; j++) {
    if (rng.random() < CR || j === jrand) {
      let v = pop[a][j] + F * (pop[b][j] - pop[c][j]);
      // Bounce-back reflection into bounds
      if (v < lb[j]) v = lb[j] + rng.random() * (pop[i][j] - lb[j]);
      if (v > ub[j]) v = ub[j] - rng.random() * (ub[j] - pop[i][j]);
      // Final clamp (safety)
      trial[j] = Math.max(lb[j], Math.min(ub[j], v));
    } else {
      trial[j] = pop[i][j];
    }
  }

  return trial;
}

// --- Core algorithm ----------------------------------------------------------

/**
 * Minimize an async function using Differential Evolution (DE/rand/1/bin).
 *
 * @param f    Async objective function. Must return a finite number.
 * @param x0   Initial guess (used as one member of the population).
 * @param opts Options (lowerBounds and upperBounds are required).
 */
export async function differentialEvolution(
  f: (x: number[]) => Promise<number>,
  x0: number[],
  opts: DEOptions,
): Promise<DEResult> {
  const n = x0.length;
  const NP = Math.max(5, opts.popSize ?? 10 * n);
  const F = opts.F ?? 0.8;
  const CR = opts.CR ?? 0.9;
  const maxEval = opts.maxEval ?? 5000;
  const ftol = opts.ftol ?? 1e-6;
  const patience = opts.patience ?? 20;
  const lb = opts.lowerBounds;
  const ub = opts.upperBounds;
  const signal = opts.signal;
  const maxParallel = Number.isFinite(opts.maxParallel)
    ? Math.max(1, Math.floor(opts.maxParallel as number))
    : Infinity;
  const rng = new PRNG(opts.seed ?? Date.now());

  // --- Initialize population ------------------------------------------------

  const pop = initializePopulation(NP, n, x0, lb, ub, rng);
  const fitness = new Float64Array(NP);

  // Evaluate initial population (parallel batches)
  let nEval = 0;
  await evaluateBatch(pop, fitness, 0, NP);

  let bestIdx = 0;
  for (let i = 1; i < NP; i++) {
    if (fitness[i] < fitness[bestIdx]) bestIdx = i;
  }

  let generation = 0;
  let stagnant = 0;
  let prevBest = fitness[bestIdx];

  // --- Main loop ------------------------------------------------------------

  while (nEval < maxEval) {
    if (signal?.aborted) return abortResult();

    // Build trial vectors for the entire population
    const trials: number[][] = new Array(NP);
    for (let i = 0; i < NP; i++) {
      trials[i] = createTrialVector(pop, i, rng, n, NP, CR, F, lb, ub);
    }

    // Evaluate all trials (parallel batches)
    const trialFitness = new Float64Array(NP);
    await evaluateBatch(trials, trialFitness, 0, NP);

    // Selection: keep trial if it's at least as good
    for (let i = 0; i < NP; i++) {
      if (trialFitness[i] <= fitness[i]) {
        pop[i] = trials[i];
        fitness[i] = trialFitness[i];
        if (fitness[i] < fitness[bestIdx]) bestIdx = i;
      }
    }

    generation++;

    // Convergence check
    const improvement = prevBest - fitness[bestIdx];
    if (improvement < ftol) {
      stagnant++;
    } else {
      stagnant = 0;
    }
    prevBest = fitness[bestIdx];

    // Progress callback
    const mean = Array.from(fitness).reduce((aVal, bVal) => aVal + bVal, 0) / NP;
    opts.onProgress?.({
      generation,
      nEval,
      bestValue: fitness[bestIdx],
      bestX: Float64Array.from(pop[bestIdx]),
      meanValue: mean,
    });

    if (stagnant >= patience) {
      return {
        x: [...pop[bestIdx]],
        value: fitness[bestIdx],
        nEval,
        generations: generation,
        converged: true,
        stopReason: 'patience',
      };
    }
  }

  return {
    x: [...pop[bestIdx]],
    value: fitness[bestIdx],
    nEval,
    generations: generation,
    converged: false,
    stopReason: 'maxeval',
  };

  // --- Helpers scoped within differentialEvolution ----------------------------

  async function evaluateBatch(
    vectors: number[][],
    out: Float64Array,
    start: number,
    count: number,
  ): Promise<void> {
    // Process in chunks of maxParallel to avoid overwhelming worker pools
    for (let offset = 0; offset < count; offset += maxParallel) {
      if (signal?.aborted) return;
      const batchEnd = Math.min(offset + maxParallel, count);
      const promises: Promise<number>[] = [];
      for (let i = offset; i < batchEnd; i++) {
        promises.push(f(vectors[start + i]));
      }
      const results = await Promise.all(promises);
      for (let i = 0; i < results.length; i++) {
        out[start + offset + i] = Number.isFinite(results[i]) ? results[i] : 1e12;
      }
      nEval += results.length;
    }
  }

  function abortResult(): DEResult {
    return {
      x: [...pop[bestIdx]],
      value: fitness[bestIdx],
      nEval,
      generations: generation,
      converged: false,
      stopReason: 'aborted',
    };
  }
}
