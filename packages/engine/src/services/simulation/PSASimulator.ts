/**
 * PSASimulator.ts - Partitioned Stochastic Algorithm (PSA / Hybrid Adaptive Scaling)
 *
 * TypeScript port of the C++ PsaSimulator (bionetgen-cpp/src/engine/PsaSimulator.cpp)
 * which itself faithfully implements the adaptive_scaling_network() algorithm from
 * BNG2/Network3/src/network.cpp.
 *
 * PSA is a hybrid ODE/SSA method that partitions species into:
 *   - Population (ODE) species: concentration >= poplevel  (scaled propensities)
 *   - Particle  (SSA) species: concentration <  poplevel  (exact stochastic)
 *
 * The key idea is "Haseltine-Rawlings adaptive scaling" (HAS): reactions involving
 * high-copy species have their propensities scaled so that one SSA firing updates
 * multiple molecules, dramatically reducing the number of events while maintaining
 * correct steady-state statistics.
 *
 * Reference:
 *  - Haseltine & Rawlings (2002) "Approximate simulation of coupled fast and slow reactions"
 *  - Harris & Clancy (2006) "Partitioned-leaping for chemically reacting systems"
 *  - BNG2/Network3/src/network.cpp  (init_adaptive_scaling_network, adaptive_scaling_network)
 *  - bionetgen-cpp/src/engine/PsaSimulator.cpp
 */

import { SeededRandom } from '../../utils/random';
import { FenwickTree } from '../../utils/fenwickTree';
import { splitObservablePatterns } from '../../utils/observableUtils';
import { countPatternMatches } from '../parity/PatternMatcher';
import type { BNGLModel, SimulationOptions, SimulationResults } from '../../types';

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface PSAOptions extends SimulationOptions {
  /** Population threshold for ODE vs SSA partitioning (default 100) */
  poplevel?: number;
  /** Check products when computing scaling factors (default true) */
  pScaleChecker?: boolean;
}

interface PSAReaction {
  /** Reactant species indices (may repeat for stoichiometry > 1) */
  reactants: number[];
  /** Product species indices (may repeat for stoichiometry > 1) */
  products: number[];
  /** Rate constant (pre-evaluated numeric) */
  rateConstant: number;
  /** Whether this reaction uses TotalRate semantics */
  isTotalRate: boolean;
  /** Statistical factor (degeneracy) */
  statFactor: number;
  /** Current propensity */
  propensity: number;
  /** Current scaling factor */
  scaling: number;
  /** Rule name for debugging */
  ruleName?: string;
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

// ────────────────────────────────────────────────────────────────────
// PSASimulator
// ────────────────────────────────────────────────────────────────────

const scalingPowerCache = new Map<number, Float64Array>();

function getScalingPower(scaling: number, exp: number): number {
  if (exp === 0) return 1.0;
  if (exp === 1) return scaling;
  if (exp === -1) return 1.0 / scaling;
  if (exp === 2) return scaling * scaling;

  let expCache = scalingPowerCache.get(scaling);
  if (!expCache) {
    expCache = new Float64Array(16); // supports exponent 0 to 15
    expCache.fill(-1.0);
    scalingPowerCache.set(scaling, expCache);
  }

  if (exp > 0 && exp < 16) {
    let cachedVal = expCache[exp];
    if (cachedVal < 0) {
      cachedVal = Math.pow(scaling, exp);
      expCache[exp] = cachedVal;
    }
    return cachedVal;
  }

  return Math.pow(scaling, exp);
}

/**
 * Executes hybrid stochastic/deterministic simulations using the
 * Partitioned Stochastic Algorithm (PSA / HAS).
 *
 * High-copy species are grouped and fired in scaled batches,
 * while low-copy species use exact Gillespie SSA.
 *
 * @see simulatePSA
 */
export class PSASimulator {
  private rng: SeededRandom;

  constructor(seed: number = 12345) {
    this.rng = new SeededRandom(seed);
  }

  // ── Scaled propensity (HAS) ──────────────────────────────────────

  /**
   * Compute the scaled propensity and scaling factor for a reaction.
   * Faithful port of rxn_rate_scaled() from network.cpp / PsaSimulator.cpp.
   */
  private rxnRateScaled(
    rxn: PSAReaction,
    state: Float64Array,
    poplevel: number,
    pScaleChecker: boolean,
  ): { rate: number; scaling: number } {
    const { reactants, products, rateConstant, statFactor, isTotalRate } = rxn;
    const nReactants = reactants.length;

    // TotalRate: propensity = rateConstant, no scaling
    if (isTotalRate) {
      return { rate: rateConstant, scaling: 1 };
    }

    let rate = statFactor * rateConstant;

    // If poplevel <= 0 or no reactants, use standard SSA propensity
    if (poplevel <= 0 || nReactants === 0) {
      let n = 0;
      for (let i = 0; i < nReactants; i++) {
        if (i > 0 && reactants[i] === reactants[i - 1]) {
          n += 1;
        } else {
          n = 0;
        }
        rate *= Math.max(0, state[reactants[i]] - n);
      }
      return { rate, scaling: nReactants === 0 ? poplevel : 1 };
    }

    // HAS scaling computation (mirrors network.cpp lines 2686-2737)
    const upperBound = 2 * poplevel;
    let tempPop: number;
    let scaling: number;

    if (nReactants > 0) {
      if (state[reactants[0]] < upperBound) {
        tempPop = poplevel;
      } else {
        tempPop = state[reactants[0]];
        for (let i = 1; i < nReactants; i++) {
          if (state[reactants[i]] < upperBound) {
            tempPop = poplevel;
            break;
          } else if (state[reactants[i]] < tempPop) {
            tempPop = state[reactants[i]];
          }
        }
        // Check products too if pScaleChecker enabled
        if (pScaleChecker && tempPop >= upperBound) {
          for (let i = 0; i < products.length; i++) {
            if (state[products[i]] < upperBound) {
              tempPop = poplevel;
              break;
            } else if (state[products[i]] < tempPop) {
              tempPop = state[products[i]];
            }
          }
        }
      }
      scaling = Math.max(1, Math.floor(tempPop / poplevel));
    } else {
      // No reactants (zeroth-order): scaling = poplevel
      scaling = poplevel;
    }

    // Compute scaled propensity: rate * prod((X[r]/s - n)) * s^(nReactants-1)
    let scalingExp = 0;
    let n = 0;
    for (let i = 0; i < nReactants; i++) {
      scalingExp += 1;
      if (i > 0) {
        if (reactants[i] === reactants[i - 1]) {
          n += 1;
        } else {
          n = 0;
        }
      }
      rate *= (state[reactants[i]] / scaling - n);
    }
    rate *= getScalingPower(scaling, scalingExp - 1);

    if (rate < 0) rate = 0;

    return { rate, scaling };
  }

  // ── Concentration update (HAS) ──────────────────────────────────

  /**
   * Update concentrations after firing reaction irxn.
   * Changes are +/- scaling[irxn] instead of +/- 1.
   * Returns true if a force-update of all propensities is needed.
   */
  private updateConcentrationsHas(
    irxn: number,
    reactions: PSAReaction[],
    state: Float64Array,
    fixedSpecies: boolean[],
  ): boolean {
    const THRESH_OCC = 10;
    let forceUpdate = false;
    const rxn = reactions[irxn];
    const s = rxn.scaling;

    for (const ri of rxn.reactants) {
      if (ri < 0 || ri >= state.length) {
        throw new Error(`[PSASimulator] Reactant index out of bounds: ${ri}`);
      }
      if (!fixedSpecies[ri]) {
        state[ri] -= s;
        if (state[ri] < 1) state[ri] = 0;
        if (state[ri] < THRESH_OCC) forceUpdate = true;
      }
    }

    for (const pi of rxn.products) {
      if (pi < 0 || pi >= state.length) {
        throw new Error(`[PSASimulator] Product index out of bounds: ${pi}`);
      }
      if (!fixedSpecies[pi]) {
        state[pi] += s;
        if (state[pi] <= THRESH_OCC) forceUpdate = true;
      }
    }

    return forceUpdate;
  }

  // ── Dependency-based propensity update ───────────────────────────

  /**
   * Recompute propensities for reactions in the dependency list of irxn.
   */
  private updateRxnRatesHas(
    irxn: number,
    reactions: PSAReaction[],
    rxnUpdateRxn: number[][],
    state: Float64Array,
    poplevel: number,
    pScaleChecker: boolean,
    fenwick?: FenwickTree,
  ): number {
    // Incremental delta update (SSA's pattern: faster than full O(R) sum)
    let aDelta = 0;
    for (const jrxn of rxnUpdateRxn[irxn]) {
      const oldProp = reactions[jrxn].propensity;
      const { rate, scaling } = this.rxnRateScaled(reactions[jrxn], state, poplevel, pScaleChecker);
      reactions[jrxn].propensity = rate;
      reactions[jrxn].scaling = scaling;
      const delta = rate - oldProp;
      aDelta += delta;
      if (fenwick) fenwick.add(jrxn, delta);
    }
    return aDelta;
  }

  // ── Reaction selection ──────────────────────────────────────────

  /**
   * Select next reaction using sorted linear search (mirrors C++ select_next_rxn).
   * Returns reaction index, or nReactions if aTot == 0.
   */
  private selectNextRxn(
    reactions: PSAReaction[],
    aTot: number,
    propOrder: number[],
    fenwick: FenwickTree | null,
  ): number {
    const na = propOrder.length;
    if (aTot <= 0) return na;

    if (fenwick) {
      // O(log R) selection via Fenwick tree
      let attempts = 0;
      while (attempts < 10) {
        attempts++;
        let f = this.rng.next() * aTot;
        while (f === 0) f = this.rng.next() * aTot;
        const idx = fenwick.find(f);
        if (idx < na) return idx;
        // Overshot - retry with recalculated total
        aTot = fenwick.total();
        if (aTot <= 0) return na;
      }
      return na;
    }

    // Fallback: O(R) cumulative-sum with move-to-front
    let attempts = 0;
    while (attempts < 10) {
      attempts++;
      let f = this.rng.next() * aTot;
      while (f === 0) f = this.rng.next() * aTot;

      let aSum = 0;
      let irxn = 0;
      for (irxn = 0; irxn < na; irxn++) {
        aSum += reactions[propOrder[irxn]].propensity;
        if (f <= aSum) break;
        if (irxn > 0 && reactions[propOrder[irxn]].propensity > reactions[propOrder[irxn - 1]].propensity) {
          const tmp = propOrder[irxn];
          propOrder[irxn] = propOrder[irxn - 1];
          propOrder[irxn - 1] = tmp;
        }
      }

      if (irxn < na) return propOrder[irxn];
      if (aSum === 0) return na;
      aTot = aSum;
    }

    return na;
  }

  // ── Build dependency lists ──────────────────────────────────────

  private createUpdateLists(reactions: PSAReaction[], nSpecies: number): number[][] {
    const nReactions = reactions.length;
    // species -> set of reactions that have it as a reactant
    const asReactant: Set<number>[] = new Array(nSpecies);
    for (let i = 0; i < nSpecies; i++) asReactant[i] = new Set();

    for (let r = 0; r < nReactions; r++) {
      for (const idx of reactions[r].reactants) {
        asReactant[idx].add(r);
      }
    }

    const rxnUpdateRxn: number[][] = new Array(nReactions);
    for (let r = 0; r < nReactions; r++) {
      const depRxns = new Set<number>();
      for (const idx of reactions[r].reactants) {
        for (const depR of asReactant[idx]) depRxns.add(depR);
      }
      for (const idx of reactions[r].products) {
        for (const depR of asReactant[idx]) depRxns.add(depR);
      }
      rxnUpdateRxn[r] = Array.from(depRxns);
    }

    return rxnUpdateRxn;
  }

  // ── Main simulation ─────────────────────────────────────────────

  async simulate(
    model: BNGLModel,
    options: PSAOptions,
  ): Promise<SimulationResults> {
    const numSpecies = model.species.length;
    const poplevel = options.poplevel ?? 100;
    const pScaleChecker = options.pScaleChecker ?? true;

    // Build species index map
    const speciesMap = new Map<string, number>();
    model.species.forEach((s, i) => speciesMap.set(s.name, i));

    // Convert model reactions to PSA format
    const reactions: PSAReaction[] = (model.reactions || []).map(r => {
      const reactantIndices = r.reactants.map(name => {
        const idx = speciesMap.get(name);
        if (idx === undefined) throw new Error(`PSA simulation error: species "${name}" not found in model species list.`);
        return idx;
      });
      const productIndices = r.products.map(name => {
        const idx = speciesMap.get(name);
        if (idx === undefined) throw new Error(`PSA simulation error: species "${name}" not found in model species list.`);
        return idx;
      });

      // Sort reactant indices for correct handling of homodimer stoichiometry
      reactantIndices.sort((a, b) => a - b);

      return {
        reactants: reactantIndices,
        products: productIndices,
        rateConstant: r.rateConstant || 0,
        isTotalRate: r.totalRate ?? false,
        statFactor: r.statFactor ?? 1,
        propensity: 0,
        scaling: 1,
        ruleName: r.name,
      };
    });

    const nReactions = reactions.length;

    // Build dependency lists
    const rxnUpdateRxn = this.createUpdateLists(reactions, numSpecies);

    // Fixed species
    const fixedSpecies = model.species.map(s => s.isConstant ?? false);

    // Initialize state (round to nearest integer for stochastic simulation)
    const state = new Float64Array(numSpecies);
    model.species.forEach((s, i) => {
      state[i] = Math.round(s.initialConcentration);
    });

    // Initialize propensities using rxnRateScaled
    let aTot = 0;
    for (let i = 0; i < nReactions; i++) {
      const { rate, scaling } = this.rxnRateScaled(reactions[i], state, poplevel, pScaleChecker);
      reactions[i].propensity = rate;
      reactions[i].scaling = scaling;
      aTot += rate;
    }

    // Propensity ordering for sorted linear search
    const propOrder: number[] = new Array(nReactions);
    for (let i = 0; i < nReactions; i++) propOrder[i] = i;

    // Fenwick tree for O(log R) reaction selection
    const fenwick = new FenwickTree(nReactions);
    const initProps: number[] = new Array(nReactions);
    for (let i = 0; i < nReactions; i++) initProps[i] = reactions[i].propensity;
    fenwick.build(initProps);

    // Build observable evaluator
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

    // Time parameters
    const t_end = options.t_end;
    const n_steps = options.n_steps;
    const dt = t_end / n_steps;

    // Output collection
    const data: Record<string, number>[] = [];
    const headers = ['time', ...model.observables.map(o => o.name)];

    // Record initial state
    data.push({ time: 0, ...evaluateObservables(state) });

    let t = 0;
    const MAX_TOTAL_STEPS = 1_000_000_000;
    let nSteps = 0;
    let hitMaxSteps = false;
    let recalcCount = 0;

    // === MAIN SIMULATION LOOP (mirrors adaptive_scaling_network) ===
    for (let step = 1; step <= n_steps; step++) {
      const tEndInterval = step * dt;
      let tRemain = tEndInterval - t;

      while (tRemain > 0) {
        if (nSteps >= MAX_TOTAL_STEPS) {
          hitMaxSteps = true;
          break;
        }

        // Periodic full aTot resync for numerical hygiene
        if (recalcCount++ >= 100) {
          recalcCount = 0;
          aTot = 0;
          const rebuildVals: number[] = new Array(nReactions);
          for (let i = 0; i < nReactions; i++) {
            rebuildVals[i] = reactions[i].propensity;
            aTot += reactions[i].propensity;
          }
          fenwick.build(rebuildVals);
        }

        // Determine time to next reaction
        let rnd = this.rng.next();
        while (rnd === 0 || rnd === 1) rnd = this.rng.next();
        const tau = -Math.log(rnd) / aTot;

        tRemain -= tau;

        // Don't fire if reaction occurs past the current interval endpoint
        if (tRemain < 0) break;

        // Select next reaction
        const irxn = this.selectNextRxn(reactions, aTot, propOrder, fenwick);
        if (irxn === nReactions) break; // aTot = 0

        // Fire reaction (HAS update: changes by +/- scaling)
        const forceUpdate = this.updateConcentrationsHas(irxn, reactions, state, fixedSpecies);
        nSteps++;

        // Update propensities (incremental delta, periodic full resync above)
        aTot += this.updateRxnRatesHas(irxn, reactions, rxnUpdateRxn, state, poplevel, pScaleChecker, fenwick);
      }

      if (hitMaxSteps) {
        t = tEndInterval - Math.max(0, tRemain);
      } else {
        t = tEndInterval;
      }

      // Record state at this output time
      data.push({ time: step * dt, ...evaluateObservables(state) });

      if (hitMaxSteps) break;
    }

    // Fill remaining output points if stopped early
    while (data.length <= n_steps) {
      data.push({ time: data.length * dt, ...evaluateObservables(state) });
    }

    return { headers, data };
  }
}

/**
 * Runs a hybrid stochastic simulation using the Partitioned Stochastic Algorithm (PSA).
 *
 * PSA uses Haseltine-Rawlings adaptive scaling to efficiently handle models with both
 * high-copy (population) and low-copy (particle) species. Reactions involving high-copy
 * species are fired in scaled batches, while low-copy species use exact Gillespie SSA.
 *
 * @param model - The parsed BNGL model (with expanded network).
 * @param options - PSA simulation options including poplevel threshold.
 * @returns Time series data for model observables.
 */
export async function simulatePSA(
  model: BNGLModel,
  options: PSAOptions,
): Promise<SimulationResults> {
  const simulator = new PSASimulator(options.seed);
  return simulator.simulate(model, options);
}
