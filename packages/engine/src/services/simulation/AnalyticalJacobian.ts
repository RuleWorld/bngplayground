/**
 * AnalyticalJacobian.ts - Closed-form Jacobian generation for mass-action kinetics.
 *
 * For stiff ODE systems, providing an analytical Jacobian to CVODE avoids N extra
 * RHS evaluations per Jacobian update (finite-difference approximation), yielding
 * 2-4x speedup on typical BioNetGen models.
 *
 * The Jacobian matrix J has entries:
 *   J[i][j] = df_i / dy_j = sum_r  S[i][r] * dv_r / dy_j
 *
 * where S is the stoichiometry matrix and v_r is the rate of reaction r.
 *
 * For mass-action kinetics:
 *   v_r = k_r * product_k( y[k]^stoich_k )
 *   dv_r/dy_j = k_r * stoich_j * y[j]^(stoich_j - 1) * product_{k != j}( y[k]^stoich_k )
 *
 * For functional rates, we fall back to finite-difference approximation on a
 * per-reaction basis (hybrid approach).
 *
 * The output matrix is stored **column-major** (dense) as CVODE expects:
 *   J[j * N + i] = df_i / dy_j
 *
 * Reference: bionetgen/bng2/Network3/src/run_network.cpp (Jac_full callback)
 */

import type { JacobianFunction } from './solvers/CVODESolver';

// ── Public types ───────────────────────────────────────────────────────

/**
 * Minimal reaction description consumed by the Jacobian builder.
 * Intentionally decoupled from the internal ConcreteReaction to keep
 * this module independently testable.
 */
export interface JacobianReaction {
  /** Species indices appearing as reactants (may repeat for stoich > 1). */
  reactants: ArrayLike<number>;
  /** Species indices appearing as products (may repeat for stoich > 1). */
  products: ArrayLike<number>;
  /** Effective rate constant (already includes propensityFactor * degeneracy * statFactor). */
  rateConstant: number;
  /** True when the rate depends on observables, time, or functions. */
  isFunctionalRate: boolean;
}

/**
 * Pre-compiled reaction data used by the generated Jacobian function.
 * Computing this once avoids repeated Map/Set construction on every callback.
 */
interface CompiledReaction {
  /** Net stoichiometry vector: netStoich[speciesIdx] = (product count - reactant count). */
  netStoich: Map<number, number>;
  /** Reactant stoichiometry: reactantStoich[speciesIdx] = count as reactant. */
  reactantStoich: Map<number, number>;
  /** Unique reactant indices (sorted for determinism). */
  reactantIndices: number[];
  /** Effective rate constant. */
  k: number;
  /** Whether this reaction uses functional rates (needs FD fallback). */
  isFunctional: boolean;
}

// ── Core builder ───────────────────────────────────────────────────────

/**
 * Compile the stoichiometry information for a single reaction.
 */
function compileReaction(rxn: JacobianReaction): CompiledReaction {
  // Build reactant stoichiometry map
  const reactantStoich = new Map<number, number>();
  for (let i = 0; i < rxn.reactants.length; i++) {
    const idx = rxn.reactants[i];
    reactantStoich.set(idx, (reactantStoich.get(idx) ?? 0) + 1);
  }

  // Build product stoichiometry map
  const productStoich = new Map<number, number>();
  for (let i = 0; i < rxn.products.length; i++) {
    const idx = rxn.products[i];
    productStoich.set(idx, (productStoich.get(idx) ?? 0) + 1);
  }

  // Net stoichiometry = products - reactants
  const netStoich = new Map<number, number>();
  const allSpecies = new Set<number>([...reactantStoich.keys(), ...productStoich.keys()]);
  for (const idx of allSpecies) {
    const net = (productStoich.get(idx) ?? 0) - (reactantStoich.get(idx) ?? 0);
    if (net !== 0) {
      netStoich.set(idx, net);
    }
  }

  const reactantIndices = Array.from(reactantStoich.keys()).sort((a, b) => a - b);

  return {
    netStoich,
    reactantStoich,
    reactantIndices,
    k: rxn.rateConstant,
    isFunctional: rxn.isFunctionalRate,
  };
}

/**
 * Compute dv_r/dy_j for a mass-action reaction r.
 *
 * v_r = k * product_m( y[m]^s_m )
 *
 * dv_r/dy_j = k * s_j * y[j]^(s_j - 1) * product_{m != j}( y[m]^s_m )
 *
 * If y[j] == 0 and s_j >= 2, the derivative is 0 (continuous extension).
 * If y[j] == 0 and s_j == 1, the product of other reactants still matters.
 */
function massActionDerivative(
  compiled: CompiledReaction,
  j: number,
  y: Float64Array,
): number {
  const sj = compiled.reactantStoich.get(j);
  if (sj === undefined || sj === 0) return 0;

  const yj = y[j];

  // Edge case: y[j] == 0
  if (yj === 0) {
    // dv/dy_j involves y[j]^(s_j - 1). If s_j >= 2, this is 0.
    // If s_j == 1, the y[j] term drops out and we get k * product of others.
    if (sj >= 2) return 0;
    // sj == 1: compute k * product_{m != j}( y[m]^s_m )
    let prod = compiled.k;
    for (const m of compiled.reactantIndices) {
      if (m === j) continue;
      const sm = compiled.reactantStoich.get(m)!;
      const ym = y[m];
      if (ym === 0) return 0; // entire product is zero
      if (sm === 1) {
        prod *= ym;
      } else if (sm === 2) {
        prod *= ym * ym;
      } else {
        prod *= ym ** sm;
      }
    }
    return prod;
  }

  // General case: dv/dy_j = k * s_j * y[j]^(s_j-1) * product_{m != j}(y[m]^s_m)
  let result = compiled.k * sj;

  // y[j]^(s_j - 1)
  if (sj === 1) {
    // y[j]^0 = 1, nothing to multiply
  } else if (sj === 2) {
    result *= yj;
  } else {
    result *= yj ** (sj - 1);
  }

  // product of other reactants
  for (const m of compiled.reactantIndices) {
    if (m === j) continue;
    const sm = compiled.reactantStoich.get(m)!;
    const ym = y[m];
    if (ym === 0) return 0;
    if (sm === 1) {
      result *= ym;
    } else if (sm === 2) {
      result *= ym * ym;
    } else {
      result *= ym ** sm;
    }
  }

  return result;
}

/**
 * Compute the full mass-action rate v_r for a reaction (used for FD fallback).
 */
function _massActionRate(compiled: CompiledReaction, y: Float64Array): number {
  let rate = compiled.k;
  for (const m of compiled.reactantIndices) {
    const sm = compiled.reactantStoich.get(m)!;
    const ym = y[m];
    if (ym === 0) return 0;
    if (sm === 1) {
      rate *= ym;
    } else if (sm === 2) {
      rate *= ym * ym;
    } else {
      rate *= ym ** sm;
    }
  }
  return rate;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Build a Jacobian function from a list of reactions and species count.
 *
 * Returns a function that fills a column-major dense matrix J:
 *   J[j * N + i] = df_i / dy_j
 *
 * For mass-action reactions, the Jacobian is computed analytically.
 * For functional-rate reactions, finite differences are used per-reaction
 * using the provided RHS function (hybrid approach).
 *
 * @param reactions - Array of reaction descriptors.
 * @param numSpecies - Total number of species (N).
 * @param rhsFunction - Optional RHS function for finite-difference fallback on functional rates.
 *                       Signature: (y, dydt) => void.
 * @returns A JacobianFunction: (y: Float64Array, J: Float64Array) => void.
 */
export function buildJacobianFunction(
  reactions: JacobianReaction[],
  numSpecies: number,
  rhsFunction?: (y: Float64Array, dydt: Float64Array) => void,
): JacobianFunction {
  const N = numSpecies;

  // Pre-compile all reactions
  const compiled: CompiledReaction[] = reactions.map(compileReaction);

  // Separate mass-action and functional reactions
  const massActionRxns = compiled.filter(r => !r.isFunctional);
  const functionalRxns = compiled.filter(r => r.isFunctional);
  const hasFunctional = functionalRxns.length > 0;

  // Pre-allocate scratch arrays for FD fallback
  let fdDydt0: Float64Array | null = null;
  let fdDydt1: Float64Array | null = null;
  let fdYPerturbed: Float64Array | null = null;
  if (hasFunctional && rhsFunction) {
    fdDydt0 = new Float64Array(N);
    fdDydt1 = new Float64Array(N);
    fdYPerturbed = new Float64Array(N);
  }

  return function analyticalJacobian(y: Float64Array, J: Float64Array): void {
    // Zero out the Jacobian matrix
    J.fill(0);

    // ── Analytical part: mass-action reactions ──
    for (let r = 0; r < massActionRxns.length; r++) {
      const rxn = massActionRxns[r];

      // For each species j that is a reactant in this reaction,
      // compute dv_r/dy_j and accumulate S[i][r] * dv_r/dy_j into J.
      for (const j of rxn.reactantIndices) {
        const dvdy_j = massActionDerivative(rxn, j, y);
        if (dvdy_j === 0) continue;

        // Accumulate into J[j * N + i] for each species i with nonzero net stoichiometry
        for (const [i, S_ir] of rxn.netStoich) {
          J[j * N + i] += S_ir * dvdy_j;
        }
      }
    }

    // ── Finite-difference part: functional-rate reactions ──
    if (hasFunctional && rhsFunction && fdDydt0 && fdDydt1 && fdYPerturbed) {
      // Compute base RHS
      rhsFunction(y, fdDydt0);

      const sqrtEps = 1.4901161193847656e-8; // sqrt(machine epsilon for double)

      for (let j = 0; j < N; j++) {
        // Perturbation size: relative to |y[j]| with absolute floor to avoid
        // catastrophic cancellation when y[j] is zero or near-zero.
        const h = sqrtEps * Math.abs(y[j]) + 1e-8;

        // Perturb y[j]
        fdYPerturbed.set(y);
        fdYPerturbed[j] += h;

        // Compute perturbed RHS
        rhsFunction(fdYPerturbed, fdDydt1);

        // FD approximation: only add contributions from functional reactions.
        // We compute the full FD column and subtract the mass-action analytical contribution.
        // This isolates the functional-rate contribution and avoids double-counting.

        const hInv = 1.0 / h;

        // ⚡ Bolt Performance Optimization:
        // Pre-calculate mass-action contributions for this j over all species i.
        // This reduces time complexity from O(N^2 * R) to O(N * R + N) inside this hot loop.
        const massActionContribs = new Float64Array(N);
        for (const rxn of massActionRxns) {
          const sj = rxn.reactantStoich.get(j);
          if (!sj) continue;
          const deriv = massActionDerivative(rxn, j, y);
          if (deriv === 0) continue;
          for (const [i, S_ir] of rxn.netStoich) {
            massActionContribs[i] += S_ir * deriv;
          }
        }

        for (let i = 0; i < N; i++) {
          // Only add FD contribution for rows affected by functional reactions.
          // We identify these as species with nonzero net stoichiometry in any
          // functional reaction.
          // For efficiency, we check the FD delta: if there's a difference
          // between FD and what's already in J, it must come from functional rates.
          const fdEntry = (fdDydt1[i] - fdDydt0[i]) * hInv;
          // The mass-action contribution to this column entry was already added.
          // We need to compute what mass-action alone would give for this (i,j):
          const massActionContrib = massActionContribs[i];
          // The functional-rate contribution is the difference
          const funcContrib = fdEntry - massActionContrib;
          if (funcContrib !== 0) {
            J[j * N + i] += funcContrib;
          }
        }
      }
    }
  };
}

/**
 * Check whether a set of reactions is purely mass-action (no functional rates).
 */
export function isPurelyMassAction(reactions: JacobianReaction[]): boolean {
  return reactions.every(r => !r.isFunctionalRate);
}

/**
 * Compute the analytical Jacobian for a set of mass-action reactions at a given state.
 * Convenience wrapper that allocates the output matrix.
 *
 * @returns Column-major dense Jacobian as Float64Array of length N*N.
 */
export function computeJacobian(
  reactions: JacobianReaction[],
  numSpecies: number,
  y: Float64Array,
): Float64Array {
  const J = new Float64Array(numSpecies * numSpecies);
  const jacFn = buildJacobianFunction(reactions, numSpecies);
  jacFn(y, J);
  return J;
}

/**
 * Compute a finite-difference Jacobian approximation for comparison/testing.
 *
 * @param rhsFunction - The ODE right-hand side function: (y, dydt) => void.
 * @param y - Current state vector.
 * @param numSpecies - Number of species.
 * @returns Column-major dense Jacobian as Float64Array of length N*N.
 */
export function computeFiniteDifferenceJacobian(
  rhsFunction: (y: Float64Array, dydt: Float64Array) => void,
  y: Float64Array,
  numSpecies: number,
): Float64Array {
  const N = numSpecies;
  const J = new Float64Array(N * N);
  const dydt0 = new Float64Array(N);
  const dydt1 = new Float64Array(N);
  const yPerturbed = new Float64Array(N);

  const sqrtEps = 1.4901161193847656e-8;

  // Compute base RHS
  rhsFunction(y, dydt0);

  for (let j = 0; j < N; j++) {
    // Perturbation size: relative + absolute floor for near-zero values
    const h = sqrtEps * Math.abs(y[j]) + 1e-8;

    yPerturbed.set(y);
    yPerturbed[j] += h;

    rhsFunction(yPerturbed, dydt1);

    const hInv = 1.0 / h;
    for (let i = 0; i < N; i++) {
      J[j * N + i] = (dydt1[i] - dydt0[i]) * hInv;
    }
  }

  return J;
}
