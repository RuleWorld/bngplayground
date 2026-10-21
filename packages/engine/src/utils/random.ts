/**
 * src/utils/random.ts
 *
 * Fast, seeded pseudo-random number generator (Mulberry32).
 * Use this for stochastic simulations (SSA, NFsim) to ensure reproducibility.
 * 
 * Reference: https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 */

export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    // Basic 32-bit hash of the seed to avoid bad initial states
    this.state = seed | 0;
  }

  /**
   * Returns a pseudo-random float in [0, 1)
   */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Helper for choosing a value from a collection based on weights
   */

  /**
   * Alias for next() - returns pseudo-random float in [0, 1).
   */
  random(): number {
    return this.next();
  }

  /**
   * Poisson random variate.
   * Knuth algorithm for lambda <= 30; normal approximation for lambda > 30.
   *
   * Reference: Knuth, TAOCP Vol 2, Section 3.4.1
   */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 30) {
      // Normal approximation: Poisson(lambda) ≈ N(lambda, lambda)
      const u1 = this.next();
      const u2 = this.next();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
    }
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }

  /**
   * Exponential random variate with rate parameter.
   * Returns -ln(U) / rate where U ~ Uniform(0,1).
   */
  exponential(rate: number): number {
    if (rate <= 0) return Infinity;
    return -Math.log(this.next()) / rate;
  }

  pickIndex(weights: Float64Array | number[], totalWeight: number): number {
    const r = this.next() * totalWeight;
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += weights[i];
      if (r <= sum) return i;
    }
    return weights.length - 1;
  }
}

/** Return a fresh positive seed in NFsim's supported 1..999999 range. */
export function createRandomSimulationSeed(): number {
  return Math.floor(Math.random() * 999_999) + 1;
}
