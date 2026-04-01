/**
 * ConservationLaws.ts - Conservation law detection and system reduction
 * 
 * Inspired by Catalyst.jl's approach:
 * 1. Build stoichiometric matrix N where N[i,r] = net change of species i in reaction r
 * 2. Compute left null space of N (vectors v where v^T * N = 0)
 * 3. Each null space vector corresponds to a conservation law
 * 4. Eliminate dependent species to reduce ODE system size
 * 
 * For biochemical systems, conservation laws emerge from:
 * - Phosphorylation: A + A* = A_total
 * - Receptor binding: R + RL + RL* = R_total
 * - Enzyme conservation: E + ES = E_total
 */

import type { Rxn } from '../graph/core/Rxn';

/**
 * A conservation law represents a linear combination of species that remains constant over time.
 * For example, total enzyme `E_total = E + ES` or total receptor `R_total = R + RL + RL_p`.
 */
export interface ConservationLaw {
  /** Index of the dependent species to eliminate */
  dependentSpecies: number;
  /** Coefficients for all species in the conservation law */
  coefficients: Float64Array;
  /** Conserved total value (computed from initial conditions) */
  total: number;
  /** Human-readable description */
  description: string;
}

/**
 * The complete result of a conservation law analysis on a reaction network.
 * Divides the system into independent species (which must be integrated) and
 * dependent species (which can be algebraically calculated from the laws).
 */
export interface ConservationAnalysis {
  laws: ConservationLaw[];
  /** Indices of independent species (to keep in reduced system) */
  independentSpecies: number[];
  /** Indices of dependent species (to eliminate) */
  dependentSpecies: number[];
  /** Rank of stoichiometric matrix */
  rank: number;
}

/**
 * Constructs the stoichiometric matrix for a given reaction network.
 * The matrix N is of size (species_count) x (reaction_count), where N[i][r]
 * represents the net change in species `i` when reaction `r` fires.
 * 
 * @param reactions - The expanded reaction network.
 * @param nSpecies - Total number of unique species.
 * @returns A 2D array representing the stoichiometric matrix.
 */
export function buildStoichiometricMatrix(
  reactions: Rxn[],
  nSpecies: number
): number[][] {
  const N: number[][] = Array.from(
    { length: nSpecies },
    () => Array(reactions.length).fill(0)
  );

  for (let r = 0; r < reactions.length; r++) {
    const rxn = reactions[r];

    // Reactants are consumed (negative stoichiometry)
    for (const s of rxn.reactants) {
      N[s][r] -= 1;
    }

    // Products are produced (positive stoichiometry)
    for (const s of rxn.products) {
      N[s][r] += 1;
    }
  }

  return N;
}

/**
 * Computes the left null space of the stoichiometric matrix using Gaussian elimination.
 * 
 * Every vector `v` in the left null space satisfies `v^T * N = 0`, meaning that
 * `d/dt(v^T * y) = v^T * N * v_rxn = 0`. Thus, `v^T * y` is a conserved quantity.
 * 
 * @param N - Stoichiometric matrix (rows = species, cols = reactions).
 * @returns An array of null space basis vectors, each of length `nSpecies`.
 */
export function computeLeftNullSpace(N: number[][]): number[][] {
  const nSpecies = N.length;
  if (nSpecies === 0) return [];
  const nReactions = N[0].length;

  // Work with transpose N^T (nReactions x nSpecies)
  // Augment with identity: [N^T | I] of size nReactions x (nSpecies + nReactions)
  // After row reduction, rows with zero in N^T portion have the null space in I portion

  // Actually, we need: find vectors c such that c^T * N = 0
  // Equivalently: N^T * c = 0 (right null space of N^T)
  // 
  // Use augmented matrix approach: [N | I] and row reduce
  // If row becomes [0...0 | v], then v is in left null space

  // Build augmented matrix [N | I_nSpecies]
  const augmented: number[][] = N.map((row, i) => {
    const identity = Array(nSpecies).fill(0);
    identity[i] = 1;
    return [...row, ...identity];
  });

  const EPS = 1e-10;
  const nAugCols = nReactions + nSpecies;

  // Gaussian elimination with partial pivoting on the N portion
  let pivotRow = 0;
  const pivotCols: number[] = []; // Track which columns have pivots

  for (let col = 0; col < nReactions && pivotRow < nSpecies; col++) {
    // Find pivot in this column
    let maxVal = Math.abs(augmented[pivotRow][col]);
    let maxRow = pivotRow;
    for (let r = pivotRow + 1; r < nSpecies; r++) {
      if (Math.abs(augmented[r][col]) > maxVal) {
        maxVal = Math.abs(augmented[r][col]);
        maxRow = r;
      }
    }

    if (maxVal < EPS) continue; // Column is zero or nearly zero, skip

    // Swap rows
    if (maxRow !== pivotRow) {
      [augmented[pivotRow], augmented[maxRow]] = [augmented[maxRow], augmented[pivotRow]];
    }

    // Scale pivot row
    const scale = augmented[pivotRow][col];
    for (let c = 0; c < nAugCols; c++) {
      augmented[pivotRow][c] /= scale;
    }

    // Eliminate column in other rows
    for (let r = 0; r < nSpecies; r++) {
      if (r === pivotRow) continue;
      const factor = augmented[r][col];
      if (Math.abs(factor) < EPS) continue;
      for (let c = 0; c < nAugCols; c++) {
        augmented[r][c] -= factor * augmented[pivotRow][c];
      }
    }

    pivotCols.push(col);
    pivotRow++;
  }

  const rank = pivotRow;
  const nullDimension = nSpecies - rank;

  const shouldLog = process.env.CONSERVATION_LAWS_DEBUG === '1';
  if (shouldLog) {
    console.log(`[ConservationLaws] Stoichiometric rank: ${rank}, null space dimension: ${nullDimension}`);
  }

  // Rows with all zeros in N portion are in the left null space
  // The identity portion gives us the coefficients
  const nullSpaceVectors: number[][] = [];

  for (let r = 0; r < nSpecies; r++) {
    let isZeroRow = true;
    for (let c = 0; c < nReactions; c++) {
      if (Math.abs(augmented[r][c]) > EPS) {
        isZeroRow = false;
        break;
      }
    }

    if (isZeroRow) {
      // Extract the identity portion as null space vector
      const vec = augmented[r].slice(nReactions, nReactions + nSpecies);

      // Normalize: make first non-zero entry positive
      let firstNonZero = 0;
      for (let i = 0; i < nSpecies; i++) {
        if (Math.abs(vec[i]) > EPS) {
          firstNonZero = i;
          break;
        }
      }
      if (vec[firstNonZero] < 0) {
        for (let i = 0; i < nSpecies; i++) vec[i] = -vec[i];
      }

      // Clean up near-zero entries
      for (let i = 0; i < nSpecies; i++) {
        if (Math.abs(vec[i]) < EPS) vec[i] = 0;
        // Round to integers if close (most biochemical systems have integer coefficients)
        const rounded = Math.round(vec[i]);
        if (Math.abs(vec[i] - rounded) < EPS) vec[i] = rounded;
      }

      nullSpaceVectors.push(vec);
    }
  }

  return nullSpaceVectors;
}

/**
 * Analyzes a reaction network to find linear conservation laws (mass conservation).
 * 
 * Identifies conserved cycles (like phosphorylation states or bound/unbound receptor states)
 * and calculates their constant total amounts based on initial concentrations. It heuristically
 * selects the best "dependent" species to eliminate from the ODE system for numerical stability.
 *
 * @param reactions - The expanded reaction network.
 * @param nSpecies - Total number of unique species.
 * @param initialConcentrations - The starting state vector, used to evaluate the conserved totals.
 * @param speciesNames - Optional mapping of species indices to names for generating human-readable descriptions.
 * @returns A complete analysis detailing the discovered laws and the optimal split of independent/dependent species.
 */
export function findConservationLaws(
  reactions: Rxn[],
  nSpecies: number,
  initialConcentrations: Float64Array,
  speciesNames?: string[]
): ConservationAnalysis {
  const N = buildStoichiometricMatrix(reactions, nSpecies);
  const nullSpace = computeLeftNullSpace(N);

  const laws: ConservationLaw[] = [];
  const dependentSet = new Set<number>();

  for (const vec of nullSpace) {
    // Compute conserved total from initial conditions
    let total = 0;
    const involvedSpecies: string[] = [];

    for (let i = 0; i < nSpecies; i++) {
      if (Math.abs(vec[i]) > 1e-10) {
        total += vec[i] * initialConcentrations[i];
        const coef = vec[i] === 1 ? '' : `${vec[i]}*`;
        involvedSpecies.push(`${coef}${speciesNames?.[i] ?? `S${i}`}`);
      }
    }

    // Choose species with largest absolute coefficient to eliminate
    // Prefer species with larger initial concentration for numerical stability
    let maxIdx = -1;
    let maxScore = -Infinity;
    for (let i = 0; i < nSpecies; i++) {
      if (Math.abs(vec[i]) > 1e-10 && !dependentSet.has(i)) {
        // Score = |coefficient| * (1 + log(1 + concentration))
        const score = Math.abs(vec[i]) * (1 + Math.log(1 + initialConcentrations[i]));
        if (score > maxScore) {
          maxScore = score;
          maxIdx = i;
        }
      }
    }

    if (maxIdx >= 0) {
      dependentSet.add(maxIdx);

      const description = `${involvedSpecies.join(' + ')} = ${total.toExponential(3)}`;
      if (process.env.CONSERVATION_LAWS_DEBUG === '1') {
        console.log(`[ConservationLaws] Found: ${description}`);
      }

      laws.push({
        dependentSpecies: maxIdx,
        coefficients: new Float64Array(vec),
        total,
        description
      });
    }
  }

  // Classify species
  const dependentSpecies = Array.from(dependentSet).sort((a, b) => a - b);
  const independentSpecies: number[] = [];
  for (let i = 0; i < nSpecies; i++) {
    if (!dependentSet.has(i)) {
      independentSpecies.push(i);
    }
  }

  if (process.env.CONSERVATION_LAWS_DEBUG === '1') {
    console.log(`[ConservationLaws] ${laws.length} conservation laws, ${independentSpecies.length} independent species`);
  }

  return {
    laws,
    independentSpecies,
    dependentSpecies,
    rank: nSpecies - nullSpace.length
  };
}

/**
 * Generates transformation functions to execute ODE integration on a reduced state space.
 *
 * By eliminating dependent species using conservation laws, the ODE system size is reduced,
 * often improving numerical stability and bypassing rank-deficiency issues in the Jacobian.
 * Provides closure functions to map between the full state `y` and the reduced state `y_r`,
 * as well as wrappers to project the derivative and Jacobian functions.
 * 
 * @param analysis - The conservation laws and species classification.
 * @param nSpecies - Total number of species in the full system.
 * @returns An object containing the reduced size and bidirectional state mapping functions.
 */
export function createReducedSystem(
  analysis: ConservationAnalysis,
  nSpecies: number
): {
  /** Number of independent species */
  reducedSize: number;
  /** Map full state y to reduced state y_r */
  reduce: (y: Float64Array) => Float64Array;
  /** Map reduced state y_r to full state y */
  expand: (y_r: Float64Array) => Float64Array;
  /** Transform full derivative function to reduced form */
  transformDerivatives: (
    fullDerivatives: (y: Float64Array, dydt: Float64Array) => void
  ) => (y_r: Float64Array, dydt_r: Float64Array) => void;
  /** Transform full Jacobian function to reduced form */
  transformJacobian: (
    fullJacobian: (y: Float64Array, J: Float64Array) => void,
    columnMajor?: boolean
  ) => (y_r: Float64Array, J_r: Float64Array) => void;
} {
  const { laws, independentSpecies, dependentSpecies } = analysis;
  const reducedSize = independentSpecies.length;

  const solveLinearSystem = (Ain: number[][], bin: number[]): number[] | null => {
    const n = bin.length;
    // Defensive copies (small systems: typically <= 50)
    const A = Ain.map(row => row.slice());
    const b = bin.slice();
    const EPS = 1e-14;

    for (let col = 0; col < n; col++) {
      // Partial pivot
      let pivotRow = col;
      let maxAbs = Math.abs(A[col][col]);
      for (let r = col + 1; r < n; r++) {
        const v = Math.abs(A[r][col]);
        if (v > maxAbs) {
          maxAbs = v;
          pivotRow = r;
        }
      }
      if (maxAbs < EPS) return null;

      if (pivotRow !== col) {
        [A[col], A[pivotRow]] = [A[pivotRow], A[col]];
        [b[col], b[pivotRow]] = [b[pivotRow], b[col]];
      }

      const pivot = A[col][col];
      for (let c = col; c < n; c++) A[col][c] /= pivot;
      b[col] /= pivot;

      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const factor = A[r][col];
        if (Math.abs(factor) < EPS) continue;
        for (let c = col; c < n; c++) A[r][c] -= factor * A[col][c];
        b[r] -= factor * b[col];
      }
    }

    return b;
  };

  // Precompute index mappings
  const fullToReduced = new Int32Array(nSpecies).fill(-1);
  for (let i = 0; i < independentSpecies.length; i++) {
    fullToReduced[independentSpecies[i]] = i;
  }

  // For each dependent species, compute: y[dep] = (total - sum(coef[j]*y[j] for j != dep)) / coef[dep]
  const dependentCoefs = laws.map(law => {
    const dep = law.dependentSpecies;
    const coef = law.coefficients[dep];
    return { dep, coef, law };
  });

  // Precompute a coupled linear system for dependent reconstruction.
  // Each conservation law provides one equation; we solve all dependent species together:
  //   sum_{d in dependent} coef_d * y_d = total - sum_{i in independent} coef_i * y_i
  const depIndex = new Map<number, number>();
  for (let i = 0; i < dependentSpecies.length; i++) depIndex.set(dependentSpecies[i], i);

  const depSystem = (() => {
    const m = dependentSpecies.length;
    if (m === 0) return null;

    // Build constant A and coefficient lists for b (independent contributions)
    const A: number[][] = Array.from({ length: m }, () => Array(m).fill(0));
    const bTotals = new Float64Array(m);
    const indepTerms: Array<Array<{ idx: number; coef: number }>> = Array.from({ length: m }, () => []);

    // We expect one law per dependent species.
    for (let row = 0; row < laws.length; row++) {
      const law = laws[row];
      const dep = law.dependentSpecies;
      const rowIdx = depIndex.get(dep);
      if (rowIdx === undefined) continue;

      bTotals[rowIdx] = law.total;

      // Dependent coefficients become A entries; independent coefficients contribute to b.
      for (let j = 0; j < nSpecies; j++) {
        const c = law.coefficients[j];
        if (Math.abs(c) < 1e-15) continue;
        const dj = depIndex.get(j);
        if (dj !== undefined) {
          A[rowIdx][dj] += c;
        } else {
          // Independent or otherwise not eliminated
          indepTerms[rowIdx].push({ idx: j, coef: c });
        }
      }
    }

    return { A, bTotals, indepTerms, m };
  })();

  // Precompute reconstruction matrix Q (N x reducedSize)
  // y = Q * y_r + constant_offset
  // dy/dy_r = Q
  const Q = new Float64Array(nSpecies * reducedSize);
  for (let j = 0; j < reducedSize; j++) {
    // Identity part for independent species
    Q[independentSpecies[j] + j * nSpecies] = 1;
  }
  if (depSystem) {
    const { A, indepTerms, m } = depSystem;
    for (let j = 0; j < reducedSize; j++) {
      const indepIdx = independentSpecies[j];
      const solverB = new Array<number>(m).fill(0);
      for (let row = 0; row < m; row++) {
        const term = indepTerms[row].find(t => t.idx === indepIdx);
        if (term) solverB[row] = -term.coef;
      }
      const solverX = solveLinearSystem(A, solverB);
      if (solverX) {
        for (let row = 0; row < m; row++) {
          const depIdx = dependentSpecies[row];
          Q[depIdx + j * nSpecies] = solverX[row];
        }
      }
    }
  }

  const reconstructDependentSpecies = (y: Float64Array) => {
    if (!depSystem) {
      // Fall back to sequential reconstruction (historical behavior)
      for (const { dep, coef, law } of dependentCoefs) {
        let sum = law.total;
        for (let j = 0; j < nSpecies; j++) {
          if (j !== dep && Math.abs(law.coefficients[j]) > 1e-15) {
            sum -= law.coefficients[j] * y[j];
          }
        }
        y[dep] = sum / coef;
        if (y[dep] < 0) y[dep] = 0;
      }
      return;
    }

    const { A, bTotals, indepTerms, m } = depSystem;
    const b = new Array<number>(m);
    for (let row = 0; row < m; row++) {
      let rhs = bTotals[row];
      for (const term of indepTerms[row]) rhs -= term.coef * y[term.idx];
      b[row] = rhs;
    }

    const x = solveLinearSystem(A, b);
    if (!x) {
      // If system is singular/ill-conditioned, revert to sequential.
      for (const { dep, coef, law } of dependentCoefs) {
        let sum = law.total;
        for (let j = 0; j < nSpecies; j++) {
          if (j !== dep && Math.abs(law.coefficients[j]) > 1e-15) {
            sum -= law.coefficients[j] * y[j];
          }
        }
        y[dep] = sum / coef;
        if (y[dep] < 0) y[dep] = 0;
      }
      return;
    }

    for (let i = 0; i < dependentSpecies.length; i++) {
      const idx = dependentSpecies[i];
      const v = x[i];
      // Clamp only tiny negative numerical noise.
      y[idx] = v < 0 && v > -1e-9 ? 0 : v;
      if (y[idx] < 0) y[idx] = 0;
    }
  };

  return {
    reducedSize,

    reduce(y: Float64Array): Float64Array {
      const y_r = new Float64Array(reducedSize);
      for (let i = 0; i < reducedSize; i++) {
        y_r[i] = y[independentSpecies[i]];
      }
      return y_r;
    },

    expand(y_r: Float64Array): Float64Array {
      const y = new Float64Array(nSpecies);

      // First, fill in independent species
      for (let i = 0; i < reducedSize; i++) {
        y[independentSpecies[i]] = y_r[i];
      }

      reconstructDependentSpecies(y);

      return y;
    },

    transformDerivatives(
      fullDerivatives: (y: Float64Array, dydt: Float64Array) => void
    ): (y_r: Float64Array, dydt_r: Float64Array) => void {
      const fullY = new Float64Array(nSpecies);
      const fullDydt = new Float64Array(nSpecies);

      return (y_r: Float64Array, dydt_r: Float64Array) => {
        // Expand to full state
        for (let i = 0; i < reducedSize; i++) {
          fullY[independentSpecies[i]] = y_r[i];
        }

        reconstructDependentSpecies(fullY);

        // Compute full derivatives
        fullDerivatives(fullY, fullDydt);

        // Extract reduced derivatives
        for (let i = 0; i < reducedSize; i++) {
          dydt_r[i] = fullDydt[independentSpecies[i]];
        }
      };
    },

    transformJacobian(
      fullJacobian: (y: Float64Array, J: Float64Array) => void,
      columnMajor = true
    ): (y_r: Float64Array, J_r: Float64Array) => void {
      const fullY = new Float64Array(nSpecies);
      const fullJ = new Float64Array(nSpecies * nSpecies);

      return (y_r: Float64Array, J_r: Float64Array) => {
        // Expand to full state
        for (let i = 0; i < reducedSize; i++) {
          fullY[independentSpecies[i]] = y_r[i];
        }
        reconstructDependentSpecies(fullY);

        // Compute full Jacobian
        fullJacobian(fullY, fullJ);

        // Compute reduced Jacobian: Jr = P * J_full * Q
        // Jr[i, j] = d(f_i)/d(y_r,j) = sum_m (df_i/dy_m) * (dy_m/d y_r,j)
        // Jr[i, j] = sum_m J[I[i], m] * Q[m, j]
        J_r.fill(0);

        if (columnMajor) {
          // Jr[i + j * reducedSize]
          for (let j = 0; j < reducedSize; j++) {
            for (let i = 0; i < reducedSize; i++) {
              const rowIdxFull = independentSpecies[i];
              let sum = 0;
              for (let m = 0; m < nSpecies; m++) {
                const qVal = Q[m + j * nSpecies];
                if (qVal !== 0) {
                  sum += fullJ[rowIdxFull + m * nSpecies] * qVal;
                }
              }
              J_r[i + j * reducedSize] = sum;
            }
          }
        } else {
          // Jr[i * reducedSize + j]
          for (let i = 0; i < reducedSize; i++) {
            const rowIdxFull = independentSpecies[i];
            for (let j = 0; j < reducedSize; j++) {
              let sum = 0;
              for (let m = 0; m < nSpecies; m++) {
                const qVal = Q[m + j * nSpecies];
                if (qVal !== 0) {
                  sum += fullJ[rowIdxFull * nSpecies + m] * qVal;
                }
              }
              J_r[i * reducedSize + j] = sum;
            }
          }
        }
      };
    }
  };
}
