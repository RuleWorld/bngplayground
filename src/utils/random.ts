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
