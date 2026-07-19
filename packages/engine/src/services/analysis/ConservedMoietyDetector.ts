import { buildStoichiometryMatrix as buildStoichiometry } from '../../utils/stoichiometry';
/**
 * ConservedMoietyDetector.ts - Automatic conserved moiety detection and ODE system reduction
 *
 * Inspired by RoadRunner's ConservedMoietyConverter.  Given a reaction network,
 * detects linear conservation laws by computing the left nullspace of the
 * stoichiometry matrix, then optionally reduces the ODE system by eliminating
 * dependent species.
 *
 * A conserved moiety is a linear combination of species whose total
 * concentration is invariant under the dynamics:
 *
 *   sum_i c_i * y_i(t)  =  constant   for all t
 *
 * Example (enzyme kinetics):
 *   E + S <-> ES -> E + P
 *   Conservation laws:  [E] + [ES] = E_total,  [S] + [ES] + [P] = S_total
 */

/**
 * Minimal reaction representation consumed by the detector.
 * Reactant / product arrays contain species *indices* (0-based).  Repeated
 * entries encode stoichiometric multiplicity (e.g. `[0, 0]` means species 0
 * appears with stoichiometry 2).
 */
export interface ReactionEntry {
  reactants: ArrayLike<number>;
  products: ArrayLike<number>;
}

/** A single conservation law discovered from the stoichiometry matrix. */
export interface ConservedMoiety {
  /** Coefficient vector of length numSpecies.  Only entries at `speciesIndices` are non-zero. */
  coefficients: number[];
  /** Constant value of the conservation law (set by `computeConservationConstants`). */
  constant: number;
  /** Indices of species that participate (have non-zero coefficient). */
  speciesIndices: number[];
}

/** Information returned by `reduceSystem`. */
export interface ReducedSystemInfo {
  /** Number of ODEs in the reduced system. */
  reducedSize: number;
  /** Indices of species kept in the reduced ODE system. */
  independentSpecies: number[];
  /** Indices of species eliminated via conservation laws. */
  dependentSpecies: number[];
  /**
   * Given the independent species concentrations (in the order of
   * `independentSpecies`), reconstruct the full state vector of length
   * `numSpecies`.
   */
  reconstruct: (independentConcentrations: number[]) => number[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const EPS = 1e-10;

/**
 * Build the stoichiometry matrix S of size (numSpecies x numReactions).
 * S[i][r] = net change of species i when reaction r fires once.
 */
function buildStoichiometryMatrix(
  reactions: ReactionEntry[],
  numSpecies: number,
): number[][] {
  // Entries are already resolved species indices, so indexOf is identity.
  return buildStoichiometry(reactions, numSpecies, (index) => index);
}

/**
 * Compute the left nullspace of matrix S using Gaussian elimination with
 * partial pivoting on the augmented matrix [S | I].
 *
 * A vector v belongs to the left nullspace iff v^T * S = 0, i.e. N^T * v = 0
 * when viewed as the right nullspace of S^T.  We compute it by row-reducing
 * [S | I] (dimensions numSpecies x (numReactions + numSpecies)).  Rows whose
 * S-portion becomes entirely zero have the corresponding I-portion as a
 * nullspace basis vector.
 */
function leftNullspace(S: number[][]): number[][] {
  const nRows = S.length;
  if (nRows === 0) return [];
  const nCols = S[0].length;

  // Build augmented matrix [S | I]
  const aug: number[][] = S.map((row, i) => {
    const identity = new Array<number>(nRows).fill(0);
    identity[i] = 1;
    return [...row, ...identity];
  });

  const totalCols = nCols + nRows;

  // Forward elimination with partial pivoting on the S portion
  let pivotRow = 0;
  for (let col = 0; col < nCols && pivotRow < nRows; col++) {
    // Find row with largest absolute value in this column
    let bestRow = pivotRow;
    let bestVal = Math.abs(aug[pivotRow][col]);
    for (let r = pivotRow + 1; r < nRows; r++) {
      const v = Math.abs(aug[r][col]);
      if (v > bestVal) {
        bestVal = v;
        bestRow = r;
      }
    }

    if (bestVal < EPS) continue; // skip zero column

    // Swap
    if (bestRow !== pivotRow) {
      [aug[pivotRow], aug[bestRow]] = [aug[bestRow], aug[pivotRow]];
    }

    // Scale pivot row
    const scale = aug[pivotRow][col];
    for (let c = 0; c < totalCols; c++) {
      aug[pivotRow][c] /= scale;
    }

    // Eliminate in all other rows
    for (let r = 0; r < nRows; r++) {
      if (r === pivotRow) continue;
      const factor = aug[r][col];
      if (Math.abs(factor) < EPS) continue;
      for (let c = 0; c < totalCols; c++) {
        aug[r][c] -= factor * aug[pivotRow][c];
      }
    }

    pivotRow++;
  }

  // Extract nullspace vectors from rows whose S-portion is all zeros
  const vectors: number[][] = [];
  for (let r = 0; r < nRows; r++) {
    let allZero = true;
    for (let c = 0; c < nCols; c++) {
      if (Math.abs(aug[r][c]) > EPS) {
        allZero = false;
        break;
      }
    }
    if (!allZero) continue;

    const vec = aug[r].slice(nCols, nCols + nRows);

    // Normalize: first non-zero coefficient positive
    for (let i = 0; i < nRows; i++) {
      if (Math.abs(vec[i]) > EPS) {
        if (vec[i] < 0) {
          for (let j = 0; j < nRows; j++) vec[j] = -vec[j];
        }
        break;
      }
    }

    // Clean up floating-point noise
    for (let i = 0; i < nRows; i++) {
      if (Math.abs(vec[i]) < EPS) {
        vec[i] = 0;
      } else {
        const rounded = Math.round(vec[i]);
        if (Math.abs(vec[i] - rounded) < EPS) vec[i] = rounded;
      }
    }

    vectors.push(vec);
  }

  return vectors;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect conserved moieties in a reaction network.
 *
 * Builds the stoichiometry matrix and computes its left nullspace.  Each basis
 * vector of the nullspace corresponds to one conservation law.
 *
 * @param reactions  Array of reactions with integer species-index arrays.
 * @param numSpecies Total number of species in the system.
 * @returns Array of conserved moieties (conservation laws).  The `constant`
 *   field is initially 0; call `computeConservationConstants` to fill it in.
 */
export function detectConservedMoieties(
  reactions: ReactionEntry[],
  numSpecies: number,
): ConservedMoiety[] {
  if (numSpecies === 0) return [];
  if (reactions.length === 0) {
    // No reactions: every species is independently conserved.
    const moieties: ConservedMoiety[] = [];
    for (let i = 0; i < numSpecies; i++) {
      const coefficients = new Array<number>(numSpecies).fill(0);
      coefficients[i] = 1;
      moieties.push({ coefficients, constant: 0, speciesIndices: [i] });
    }
    return moieties;
  }

  // Single-species system: if the net stoichiometry for the only species is
  // zero across all reactions it is conserved; otherwise no conservation law.
  // The general algorithm handles this, but we note the edge case.

  const S = buildStoichiometryMatrix(reactions, numSpecies);
  const nullVectors = leftNullspace(S);

  return nullVectors.map((vec) => {
    const speciesIndices: number[] = [];
    for (let i = 0; i < numSpecies; i++) {
      if (vec[i] !== 0) speciesIndices.push(i);
    }
    return {
      coefficients: vec,
      constant: 0,
      speciesIndices,
    };
  });
}

/**
 * Compute the conserved constant for each moiety given initial concentrations.
 *
 * Fills in the `constant` field:  constant = sum_i c_i * y0[i].
 *
 * @param moieties  Array of conserved moieties (mutated in place and returned).
 * @param y0        Initial concentration vector of length numSpecies.
 * @returns The same `moieties` array with `constant` fields populated.
 */
export function computeConservationConstants(
  moieties: ConservedMoiety[],
  y0: number[],
): ConservedMoiety[] {
  for (const m of moieties) {
    let total = 0;
    for (const idx of m.speciesIndices) {
      total += m.coefficients[idx] * y0[idx];
    }
    m.constant = total;
  }
  return moieties;
}

/**
 * Reduce the ODE system by eliminating one dependent species per conservation
 * law.
 *
 * For each conservation law the species with the largest absolute coefficient
 * is chosen as "dependent" (ties broken by index).  That species is removed
 * from the ODE system and expressed as an algebraic function of the remaining
 * independent species:
 *
 *   y_dep = (constant - sum_{i != dep} c_i * y_i) / c_dep
 *
 * @param reactions             Reaction list (unused internally but accepted
 *                              for API symmetry with `detectConservedMoieties`).
 * @param numSpecies            Total species count.
 * @param initialConcentrations Initial concentration vector.
 * @param moieties              Conserved moieties (with constants already
 *                              computed via `computeConservationConstants`).
 * @returns Reduced system information including reconstruction function.
 */
export function reduceSystem(
  _reactions: ReactionEntry[],
  numSpecies: number,
  _initialConcentrations: number[],
  moieties: ConservedMoiety[],
): ReducedSystemInfo {
  if (moieties.length === 0) {
    // No conservation laws: all species are independent.
    const allIndices = Array.from({ length: numSpecies }, (_, i) => i);
    return {
      reducedSize: numSpecies,
      independentSpecies: allIndices,
      dependentSpecies: [],
      reconstruct: (indep) => [...indep],
    };
  }

  // Select dependent species greedily: for each moiety, pick the species with
  // the largest |coefficient| that hasn't already been chosen.
  const dependentSet = new Set<number>();
  const lawForDependent = new Map<
    number,
    { moiety: ConservedMoiety; depCoef: number }
  >();

  for (const m of moieties) {
    let bestIdx = -1;
    let bestAbsCoef = -1;
    for (const idx of m.speciesIndices) {
      if (dependentSet.has(idx)) continue;
      const absCoef = Math.abs(m.coefficients[idx]);
      if (absCoef > bestAbsCoef) {
        bestAbsCoef = absCoef;
        bestIdx = idx;
      }
    }
    if (bestIdx >= 0) {
      dependentSet.add(bestIdx);
      lawForDependent.set(bestIdx, {
        moiety: m,
        depCoef: m.coefficients[bestIdx],
      });
    }
  }

  const dependentSpecies = Array.from(dependentSet).sort((a, b) => a - b);
  const independentSpecies: number[] = [];
  for (let i = 0; i < numSpecies; i++) {
    if (!dependentSet.has(i)) independentSpecies.push(i);
  }

  const reducedSize = independentSpecies.length;

  // Build a fast index map: full index -> position in independentSpecies
  const fullToIndepPos = new Map<number, number>();
  for (let p = 0; p < independentSpecies.length; p++) {
    fullToIndepPos.set(independentSpecies[p], p);
  }

  /**
   * Reconstruct the full state vector from the independent concentrations.
   */
  const reconstruct = (independentConcentrations: number[]): number[] => {
    const y = new Array<number>(numSpecies).fill(0);

    // Fill independent species
    for (let p = 0; p < independentSpecies.length; p++) {
      y[independentSpecies[p]] = independentConcentrations[p];
    }

    // Compute dependent species from conservation laws
    for (const depIdx of dependentSpecies) {
      const entry = lawForDependent.get(depIdx)!;
      const m = entry.moiety;
      let sum = m.constant;
      for (const idx of m.speciesIndices) {
        if (idx === depIdx) continue;
        sum -= m.coefficients[idx] * y[idx];
      }
      y[depIdx] = sum / entry.depCoef;
    }

    return y;
  };

  return {
    reducedSize,
    independentSpecies,
    dependentSpecies,
    reconstruct,
  };
}
