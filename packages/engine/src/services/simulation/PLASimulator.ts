import { countPatternMatches } from '../parity/PatternMatcher';
/**
 * PLASimulator.ts - Partitioned Leaping Algorithm (PLA)
 *
 * TypeScript port of BNG2/Network3/src/pla/PLA.cpp
 * Implements a forward-Euler PLA that partitions reactions into:
 *   - Exact Stochastic (ES): solved by Gillespie SSA (next reaction method)
 *   - Deterministic (D): solved by forward Euler ODE update
 *   - Poisson tau-leaping (P): sampled from Poisson distributions
 *   - Langevin tau-leaping (L): normal approximation
 *
 * The algorithm iterates between tau selection and reaction classification
 * until a consistent (tau, classification vector) pair is found.
 *
 * Reference:
 *  - Haseltine & Rawlings (2002) "Approximate simulation of coupled fast and slow reactions"
 *  - Harris & Bhatt (2011) "Partitioned leaping algorithm for BioNetGen"
 *  - BNG2/Network3/src/pla/PLA.cpp, PLA.hh
 *
 * PARITY NOTE: The nextStep() loop mirrors PLA.cpp::nextStep(). The
 * classification enum values match the C++ RxnClassifier constants.
 */

import { SeededRandom } from '../../utils/random';
import type { SimulationOptions, SimulationResults, BNGLModel } from '../../types';
import { splitObservablePatterns } from '../../utils/observableUtils';

// ────────────────────────────────────────────────────────────────────
// Reaction classification constants (matches C++ RxnClassifier)
// ────────────────────────────────────────────────────────────────────
const enum RxnClass {
  EXACT_STOCHASTIC = 0,
  POISSON_TAU_LEAP = 1,
  LANGEVIN         = 2,
  DETERMINISTIC    = 3,
}

interface PLAReaction {
  /** Reactant species indices (may repeat for stoich > 1) */
  reactants: Int32Array;
  /** Product species indices (may repeat for stoich > 1) */
  products: Int32Array;
  /** Net stoichiometry change vector (species-indexed) */
  netChange: Float64Array;
  /** Unique reactant indices (no duplicates) */
  uniqReactantIdx: Int32Array;
  /** Stoichiometry for each unique reactant */
  uniqReactantStoich: Int32Array;
  /** Nonzero species indices in netChange */
  nzSpecies: Int32Array;
  /** Corresponding nonzero values in netChange */
  nzChange: Float64Array;
  /** Rate constant (numeric) */
  rateConstant: number;
  /** Current propensity a_v */
  propensity: number;
}

const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SAFE_OBJECT_KEY_PATTERN = /^[A-Za-z_@:.!~(),+\-][A-Za-z0-9_@:.!~(),+\-]*$/;

function isSafeObjectKey(key: string): boolean {
  return SAFE_OBJECT_KEY_PATTERN.test(key) && !UNSAFE_OBJECT_KEYS.has(key);
}

function setSafeNumberField(target: Record<string, number>, key: string, value: number): void {
  if (!isSafeObjectKey(key)) return;
  target[key] = value;
}

/**
 * Configuration options governing the behavior of the Partitioned Leaping Algorithm (PLA).
 */
export interface PLAOptions extends SimulationOptions {
  /** Error threshold for tau selection (default: 0.03) */
  epsilon?: number;
  /** Minimum firings threshold for Poisson/Langevin classification (default: 10) */
  pCrit?: number;
  /** Maximum tau-leap step size (default: Infinity) */
  tauLeapMax?: number;
}

// ────────────────────────────────────────────────────────────────────
// PLA Simulator
// ────────────────────────────────────────────────────────────────────
/**
 * Executes hybrid stochastic simulations using the Partitioned Leaping Algorithm (PLA).
 *
 * PLA accelerates exact stochastic simulation by partitioning reactions into Exact Stochastic (ES),
 * Poisson Tau-Leaping, Langevin, and Deterministic regimes based on propensity and molecule counts.
 * This allows fast reactions to leap forward in time while handling rare events exactly.
 *
 * @see simulatePLA
 */
export class PLASimulator {
  private rng: SeededRandom;
  private epsilon: number;
  private pCrit: number;
  private uniformBuffer = new Float64Array(4096);
  private uniformIdx = 4096;
  private normalBuffer = new Float64Array(4096);
  private normalIdx = 4096;

  constructor(seed: number = 12345, options: Partial<PLAOptions> = {}) {
    this.rng = new SeededRandom(seed);
    this.epsilon = options.epsilon ?? 0.03;
    this.pCrit = options.pCrit ?? 10;
  }

  private fillUniformBuffer(): void {
    const size = this.uniformBuffer.length;
    for (let i = 0; i < size; i++) {
      this.uniformBuffer[i] = this.rng.next();
    }
    this.uniformIdx = 0;
  }

  private nextUniform(): number {
    if (this.uniformIdx >= this.uniformBuffer.length) {
      this.fillUniformBuffer();
    }
    return this.uniformBuffer[this.uniformIdx++];
  }

  private fillNormalBuffer(): void {
    const size = this.normalBuffer.length;
    for (let i = 0; i < size; i += 2) {
      let u1 = this.rng.next();
      const u2 = this.rng.next();
      while (u1 <= 1e-15) {
        u1 = this.rng.next();
      }
      const r = Math.sqrt(-2 * Math.log(u1));
      const theta = 2 * Math.PI * u2;
      this.normalBuffer[i] = r * Math.cos(theta);
      if (i + 1 < size) {
        this.normalBuffer[i + 1] = r * Math.sin(theta);
      }
    }
    this.normalIdx = 0;
  }

  private nextNormal(): number {
    if (this.normalIdx >= this.normalBuffer.length) {
      this.fillNormalBuffer();
    }
    return this.normalBuffer[this.normalIdx++];
  }

  private drawPoisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 30) {
      const z = this.nextNormal();
      return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
    }
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.nextUniform();
    } while (p > L);
    return k - 1;
  }

  // ── Propensity helpers ────────────────────────────────────────────

  /**
   * Mass-action propensity for a reaction.
   * Handles unimolecular, bimolecular (including A+A), and higher order.
   */
  private computePropensity(rxn: PLAReaction, state: Float64Array): number {
    let prop = rxn.rateConstant;

    // Use precomputed unique reactant indices and stoichiometries
    const uIdx = rxn.uniqReactantIdx;
    const uStoich = rxn.uniqReactantStoich;
    for (let i = 0; i < uIdx.length; i++) {
      const pop = state[uIdx[i]];
      const stoich = uStoich[i];
      if (stoich === 1) {
        prop *= pop;
      } else if (stoich === 2) {
        prop *= pop * (pop - 1) / 2;
      } else {
        // General binomial coefficient: C(pop, stoich)
        let factor = 1;
        for (let j = 0; j < stoich; j++) {
          factor *= (pop - j) / (j + 1);
        }
        prop *= factor;
      }
    }

    return Math.max(0, prop);
  }

  private updateAllPropensities(reactions: PLAReaction[], state: Float64Array): void {
    for (const rxn of reactions) {
      rxn.propensity = this.computePropensity(rxn, state);
    }
  }

  // ── Tau calculation ───────────────────────────────────────────────

  /**
   * Compute tau using the Cao et al. (2006) formula:
   *   tau = min_i { max(epsilon*x_i, 1) / |mu_i|, (max(epsilon*x_i, 1))^2 / sigma2_i }
   * where mu_i and sigma2_i are the expected change and variance in species i.
   */
  private computeTau(
    reactions: PLAReaction[],
    classif: Int32Array,
    state: Float64Array,
    numSpecies: number
  ): number {
    const mu = new Float64Array(numSpecies);
    const sigma2 = new Float64Array(numSpecies);

    // Accumulate mu and sigma2 reaction-by-reaction over nonzero netChange entries
    for (let v = 0; v < reactions.length; v++) {
      if (classif[v] === RxnClass.EXACT_STOCHASTIC) continue;
      const prop = reactions[v].propensity;
      if (prop < 1e-15) continue;
      const nzSp = reactions[v].nzSpecies;
      const nzCh = reactions[v].nzChange;
      for (let k = 0; k < nzSp.length; k++) {
        const change = nzCh[k];
        const spIdx = nzSp[k];
        mu[spIdx] += change * prop;
        sigma2[spIdx] += change * change * prop;
      }
    }

    let minTau = Infinity;
    for (let i = 0; i < numSpecies; i++) {
      const xi = state[i];
      const threshold = Math.max(this.epsilon * xi, 1.0);
      if (Math.abs(mu[i]) > 1e-15) {
        minTau = Math.min(minTau, threshold / Math.abs(mu[i]));
      }
      if (sigma2[i] > 1e-15) {
        minTau = Math.min(minTau, (threshold * threshold) / sigma2[i]);
      }
    }

    return minTau;
  }

  // ── Reaction classification ───────────────────────────────────────

  /**
   * Classify each reaction as ES, Poisson, Langevin, or Deterministic.
   * Based on the expected number of firings in tau:
   *   lambda_v = a_v * tau.
   *
   * - lambda_v < pCrit → ES
   * - lambda_v >= pCrit but sqrt(lambda_v) is significant → Poisson
   * - lambda_v large enough for CLT → Langevin or Deterministic
   */
  private classifyReactions(
    reactions: PLAReaction[],
    classif: Int32Array,
    tau: number,
    initialClassification: boolean
  ): void {
    for (let v = 0; v < reactions.length; v++) {
      if (!initialClassification && classif[v] === RxnClass.EXACT_STOCHASTIC) {
        // Don't reclassify reactions already marked ES
        continue;
      }

      const lambda = reactions[v].propensity * tau;

      if (lambda < this.pCrit) {
        classif[v] = RxnClass.EXACT_STOCHASTIC;
      } else if (lambda < 100) {
        classif[v] = RxnClass.POISSON_TAU_LEAP;
      } else if (lambda < 1000) {
        classif[v] = RxnClass.LANGEVIN;
      } else {
        classif[v] = RxnClass.DETERMINISTIC;
      }
    }
  }

  // ── Firing generators ─────────────────────────────────────────────

  /**
   * Generate firings for non-ES reactions.
   * - Deterministic: k_v = a_v * tau (continuous)
   * - Poisson: k_v ~ Poisson(a_v * tau)
   * - Langevin: k_v ~ N(a_v * tau, a_v * tau)
   */
  private generateFirings(
    reactions: PLAReaction[],
    classif: Int32Array,
    tau: number,
    firings: Float64Array
  ): void {
    for (let v = 0; v < reactions.length; v++) {
      if (classif[v] === RxnClass.EXACT_STOCHASTIC) {
        firings[v] = 0;
        continue;
      }

      const lambda = reactions[v].propensity * tau;
      if (lambda <= 0) {
        firings[v] = 0;
        continue;
      }

      switch (classif[v]) {
        case RxnClass.DETERMINISTIC:
          firings[v] = lambda;
          break;
        case RxnClass.POISSON_TAU_LEAP:
          firings[v] = this.drawPoisson(lambda);
          break;
        case RxnClass.LANGEVIN: {
          // Normal approximation: N(lambda, lambda)
          const z = this.nextNormal();
          firings[v] = Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
          break;
        }
      }
    }
  }

  // ── SSA for ES reactions ──────────────────────────────────────────

  /**
   * Get time to next firing for a specific ES reaction
   * (First Reaction Method: tau = -ln(r) / a_v)
   */
  private getTauES(rxn: PLAReaction): number {
    const rate = rxn.propensity;
    if (rate <= 0) return Infinity;
    const r = this.nextUniform();
    if (r <= 0 || r >= 1) return Infinity;
    return -Math.log(r) / rate;
  }

  // ── Post-leap checker ─────────────────────────────────────────────

  /**
   * Check if the leap is valid (no negative populations).
   * If invalid, halve tau and re-generate firings.
   * Returns true if the leap is valid after possible correction.
   */
  private postLeapCheck(
    state: Float64Array,
    reactions: PLAReaction[],
    firings: Float64Array,
    numSpecies: number
  ): boolean {
    // Compute the proposed new state
    const proposed = new Float64Array(numSpecies);
    proposed.set(state);

    for (let v = 0; v < reactions.length; v++) {
      const k = firings[v];
      if (k === 0) continue;
      for (let i = 0; i < numSpecies; i++) {
        proposed[i] += reactions[v].netChange[i] * k;
      }
    }

    // Check for negative populations
    for (let i = 0; i < numSpecies; i++) {
      if (proposed[i] < -0.5) {  // Allow small numerical noise
        return false;
      }
    }
    return true;
  }

  // ── Apply firings ─────────────────────────────────────────────────

  private applyFirings(
    state: Float64Array,
    reactions: PLAReaction[],
    firings: Float64Array,
    numSpecies: number
  ): void {
    for (let v = 0; v < reactions.length; v++) {
      const k = firings[v];
      if (k === 0) continue;
      for (let i = 0; i < numSpecies; i++) {
        state[i] += reactions[v].netChange[i] * k;
      }
    }
    // Clamp to non-negative
    for (let i = 0; i < numSpecies; i++) {
      if (state[i] < 0) state[i] = 0;
    }
  }

  // ── Main PLA step (mirrors PLA.cpp::nextStep) ─────────────────────

  /**
   * Perform one PLA step.
   *
   * Algorithm:
   * 1. Calculate initial tau from tau-calculator
   * 2. Classify reactions
   * 3. Iterate until consistent (tau, classif)
   * 4. Generate firings and apply
   * 5. Post-leap check; if invalid, halve firings and retry
   *
   * Returns the time step taken.
   */
  private nextStep(
    reactions: PLAReaction[],
    state: Float64Array,
    numSpecies: number,
    maxTau: number
  ): number {
    const nRxn = reactions.length;
    const classif = new Int32Array(nRxn);
    const firings = new Float64Array(nRxn);
    const alreadyES = new Uint8Array(nRxn);

    // Update propensities
    this.updateAllPropensities(reactions, state);

    // Step 1: Calculate initial tau
    // Use all reactions for initial tau (all classified as non-ES initially)
    classif.fill(RxnClass.POISSON_TAU_LEAP); // placeholder
    let tau = this.computeTau(reactions, classif, state, numSpecies);
    tau = Math.min(tau, maxTau);

    if (tau <= 0 || !isFinite(tau) || tau === Infinity) {
      // Check if total propensity is zero → system is dead
      const totalProp = reactions.reduce((s, r) => s + r.propensity, 0);
      if (totalProp < 1e-15) return Infinity;
      tau = maxTau;
    }

    // Step 2: Classify reactions with this tau
    this.classifyReactions(reactions, classif, tau, true);

    // Step 3: Iterate to find consistent (tau, classif) pair
    let esRxnIdx = -1;
    let tauES = Infinity;
    let fireES = false;

    for (let iter = 0; iter < 100; iter++) {
      let done = true;
      let allES = true;

      for (let v = 0; v < nRxn; v++) {
        if (classif[v] === RxnClass.EXACT_STOCHASTIC) {
          if (!alreadyES[v]) {
            alreadyES[v] = 1;
            const tauESv = this.getTauES(reactions[v]);
            if (tauESv < tauES) {
              esRxnIdx = v;
              tauES = tauESv;
            }
          }
        } else {
          allES = false;
        }
      }

      // If tauES < tau or all reactions are ES, set tau = tauES
      if (tauES < tau || allES) {
        tau = tauES;
        fireES = true;
        if (!allES) {
          done = false;
          // Reclassify non-ES reactions with reduced tau
          this.classifyReactions(reactions, classif, tau, false);
        }
      }

      if (done) break;
    }

    // Enforce maxTau
    if (tau > maxTau) {
      tau = maxTau;
      fireES = false;
    }

    // Step 4: Fire reactions
    const allES = classif.every(c => c === RxnClass.EXACT_STOCHASTIC);

    if (allES) {
      // Pure SSA step: fire the single ES reaction with minimum tau
      if (tau <= maxTau && esRxnIdx >= 0 && reactions[esRxnIdx].propensity > 0) {
        const rxn = reactions[esRxnIdx];
        // Fire once
        for (let j = 0; j < rxn.reactants.length; j++) {
          const reactantIndex = rxn.reactants[j];
          if (reactantIndex < 0 || reactantIndex >= state.length) {
            throw new Error(`[PLASimulator] Reactant index out of bounds: ${reactantIndex}`);
          }
          state[reactantIndex]--;
        }
        for (let j = 0; j < rxn.products.length; j++) {
          const productIndex = rxn.products[j];
          if (productIndex < 0 || productIndex >= state.length) {
            throw new Error(`[PLASimulator] Product index out of bounds: ${productIndex}`);
          }
          state[productIndex]++;
        }
      }
    } else {
      // PLA step: generate firings for all non-ES reactions
      this.generateFirings(reactions, classif, tau, firings);

      // Post-leap check
      let valid = this.postLeapCheck(state, reactions, firings, numSpecies);
      let corrections = 0;
      while (!valid && corrections < 10) {
        // Halve firings (simple correction strategy)
        for (let v = 0; v < nRxn; v++) {
          if (classif[v] !== RxnClass.EXACT_STOCHASTIC) {
            firings[v] = Math.floor(firings[v] / 2);
          }
        }
        fireES = false; // tau reduced, don't fire ES
        valid = this.postLeapCheck(state, reactions, firings, numSpecies);
        corrections++;
      }

      // Apply firings
      this.applyFirings(state, reactions, firings, numSpecies);

      // Fire ES reaction if tau = tauES and not corrected
      if (fireES && esRxnIdx >= 0 && reactions[esRxnIdx].propensity > 0) {
        const rxn = reactions[esRxnIdx];
        for (let j = 0; j < rxn.reactants.length; j++) {
          const reactantIndex = rxn.reactants[j];
          if (reactantIndex < 0 || reactantIndex >= state.length) {
            throw new Error(`[PLASimulator] Reactant index out of bounds: ${reactantIndex}`);
          }
          state[reactantIndex]--;
        }
        for (let j = 0; j < rxn.products.length; j++) {
          const productIndex = rxn.products[j];
          if (productIndex < 0 || productIndex >= state.length) {
            throw new Error(`[PLASimulator] Product index out of bounds: ${productIndex}`);
          }
          state[productIndex]++;
        }
      }
    }

    // Clamp
    for (let i = 0; i < numSpecies; i++) {
      if (state[i] < 0) state[i] = 0;
    }

    return tau;
  }

  // ── Main simulation loop ──────────────────────────────────────────

  async simulate(
    model: BNGLModel,
    options: PLAOptions
  ): Promise<SimulationResults> {
    const numSpecies = model.species.length;

    // Convert model reactions to PLA format
    const speciesMap = new Map<string, number>();
    model.species.forEach((s, i) => speciesMap.set(s.name, i));

    const reactions: PLAReaction[] = (model.reactions || []).map(r => {
      const reactantIndices = r.reactants.map(name => {
        const idx = speciesMap.get(name);
        if (idx === undefined) throw new Error(`PLA simulation error: species "${name}" referenced in a reaction was not found in the model species list. Ensure all reactant and product species are defined in the seed species block.`);
        return idx;
      });
      const productIndices = r.products.map(name => {
        const idx = speciesMap.get(name);
        if (idx === undefined) throw new Error(`PLA simulation error: species "${name}" referenced in a reaction was not found in the model species list. Ensure all reactant and product species are defined in the seed species block.`);
        return idx;
      });

      // Compute net change vector
      const netChange = new Float64Array(numSpecies);
      for (const idx of reactantIndices) netChange[idx]--;
      for (const idx of productIndices) netChange[idx]++;

      // Precompute unique reactant indices and stoichiometries
      const stoichMap = new Map<number, number>();
      for (const idx of reactantIndices) stoichMap.set(idx, (stoichMap.get(idx) || 0) + 1);
      const uniqReactantIdx = new Int32Array(stoichMap.size);
      const uniqReactantStoich = new Int32Array(stoichMap.size);
      let si = 0;
      for (const [idx, stoich] of stoichMap) {
        uniqReactantIdx[si] = idx;
        uniqReactantStoich[si] = stoich;
        si++;
      }

      // Precompute nonzero netChange entries (sparse representation)
      const nzList: number[] = [];
      const nzValList: number[] = [];
      for (let i = 0; i < numSpecies; i++) {
        if (netChange[i] !== 0) {
          nzList.push(i);
          nzValList.push(netChange[i]);
        }
      }
      const nzSpecies = new Int32Array(nzList);
      const nzChange = new Float64Array(nzValList);

      return {
        reactants: new Int32Array(reactantIndices),
        products: new Int32Array(productIndices),
        netChange,
        uniqReactantIdx,
        uniqReactantStoich,
        nzSpecies,
        nzChange,
        rateConstant: r.rateConstant || 0,
        propensity: 0,
      };
    });

    // Initialize state (molecule counts for stochastic simulation)
    const state = new Float64Array(numSpecies);
    model.species.forEach((s, i) => {
      state[i] = s.initialConcentration;
    });

    // Time parameters
    const t_end = options.t_end;
    const n_steps = options.n_steps;
    const dt_out = t_end / n_steps;

    // Build observable evaluator (simplified pattern matching for PLA)
    const observableIndices: Map<string, { indices: number[]; coefficients: number[] }> = new Map();
    for (const obs of model.observables) {
      const matchingIndices: number[] = [];
      const coefficients: number[] = [];
      
      const patterns = splitObservablePatterns(obs.pattern);
      
      for (let i = 0; i < numSpecies; i++) {
        let count = 0;
        for (const pat of patterns) {
            count += countPatternMatches(model.species[i].name, pat);
        }
        if (count > 0) {
          matchingIndices.push(i);
          coefficients.push(count);
        }
      }
      observableIndices.set(obs.name, { indices: matchingIndices, coefficients });
    }

    const evaluateObservables = (currentState: Float64Array): Record<string, number> => {
      const row: Record<string, number> = Object.create(null) as Record<string, number>;
      for (const obs of model.observables) {
        if (obs.name === '__proto__' || obs.name === 'constructor' || obs.name === 'prototype') continue;
        const info = observableIndices.get(obs.name);
        if (info) {
          let sum = 0;
          for (let j = 0; j < info.indices.length; j++) {
            sum += currentState[info.indices[j]] * info.coefficients[j];
          }
          setSafeNumberField(row, obs.name, sum);
        } else {
          setSafeNumberField(row, obs.name, 0);
        }
      }
      return row;
    };

    // Output collection
    const data: Record<string, number>[] = [];
    const headers = ['time', ...model.observables.map(o => o.name)];

    let t = 0;
    let nextOutput = 0;
    let outputIndex = 0;

    // Record initial state
    const initialRow: Record<string, number> = { time: 0, ...evaluateObservables(state) };
    data.push(initialRow);
    outputIndex++;
    nextOutput = outputIndex * dt_out;

    // Simulation loop (mirrors PLA.cpp::run)
    const MAX_STEPS = options.maxSteps ?? 100_000_000;
    let step = 0;

    while (t < t_end && step < MAX_STEPS) {
      step++;

      // Compute maxTau to not overshoot next output time
      const maxTau = nextOutput - t;

      // Take one PLA step
      const tau = this.nextStep(reactions, state, numSpecies, maxTau);

      if (!isFinite(tau) || tau === Infinity) {
        // System is dead, fill remaining output
        while (outputIndex <= n_steps) {
          const row: Record<string, number> = {
            time: outputIndex * dt_out,
            ...evaluateObservables(state),
          };
          data.push(row);
          outputIndex++;
        }
        break;
      }

      t += tau;

      // Output at specified intervals
      if (t >= nextOutput - 1e-12) {
        const row: Record<string, number> = { time: t, ...evaluateObservables(state) };
        data.push(row);
        outputIndex++;
        nextOutput = outputIndex * dt_out;
      }
    }

    // Final output if not already recorded
    if (data.length <= n_steps) {
      const row: Record<string, number> = { time: t, ...evaluateObservables(state) };
      data.push(row);
    }

    return { headers, data };
  }
}

/**
 * Runs a hybrid stochastic simulation using the Partitioned Leaping Algorithm (PLA).
 *
 * PLA is an approximate accelerated stochastic method. It dynamically partitions reactions into
 * continuous deterministic, Langevin, Poisson tau-leaping, and Exact Stochastic regimes at every step.
 * It is best suited for systems with widely separated time scales (fast equilibria mixed with slow reactions)
 * and relatively high copy numbers (>100 molecules per species).
 *
 * @param model - The parsed BNGL model.
 * @param options - PLA-specific simulation options (e.g. error tolerances, critical boundaries).
 * @returns Time series data for the model observables.
 */
export async function simulatePLA(
  model: BNGLModel,
  options: PLAOptions
): Promise<SimulationResults> {
  const simulator = new PLASimulator(options.seed, options);
  return simulator.simulate(model, options);
}
