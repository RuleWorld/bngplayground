/**
 * SparseStoichiometry.ts
 *
 * CSR (Compressed Sparse Row) stoichiometry matrix for accelerating
 * derivative computation in large ODE models.
 *
 * The stoichiometry matrix S has dimensions (numSpecies x numReactions).
 * S[i][j] = net stoichiometry change of species i due to reaction j.
 *
 * For mass-action kinetics:  dydt = S * v(y)
 *   where v is the vector of reaction velocities.
 *
 * Using CSR format avoids iterating over zero entries, which is significant
 * when most species are unaffected by most reactions (sparsity > 50%).
 */

/**
 * CSR representation of the stoichiometry matrix.
 *
 * For a matrix with numSpecies rows:
 *   rowPtr has length (numSpecies + 1)
 *   colIdx and values have length nnz (number of non-zeros)
 *
 * Row i stores non-zero entries in colIdx[rowPtr[i]..rowPtr[i+1])
 * with corresponding values in values[rowPtr[i]..rowPtr[i+1]).
 */
export interface CSRStoichiometryMatrix {
  rowPtr: Int32Array;
  colIdx: Int32Array;
  values: Float64Array;
  nnz: number;
  numSpecies: number;
  numReactions: number;
}

/**
 * Minimal reaction descriptor needed for stoichiometry construction.
 * Matches the ConcreteReaction shape in SimulationLoop.ts.
 */
export interface StoichiometryReaction {
  reactants: Int32Array | number[];
  products: Int32Array | number[];
  productStoichiometries?: number[];
}

/**
 * Build a CSR stoichiometry matrix from the model's reactions.
 *
 * Each reaction j contributes:
 *   S[reactantIdx][j] -= 1          (for each reactant occurrence)
 *   S[productIdx][j]  += stoich     (for each product, default stoich=1)
 *
 * Constant species are excluded (their rows will be empty) via the
 * optional constantMask.
 *
 * @param reactions  Array of reactions with reactant/product index arrays
 * @param numSpecies Total number of species in the system
 * @param constantMask Optional boolean array; true = species is constant (excluded from S)
 * @returns CSR stoichiometry matrix
 */
export function buildCSRStoichiometry(
  reactions: StoichiometryReaction[],
  numSpecies: number,
  constantMask?: boolean[]
): CSRStoichiometryMatrix {
  const numReactions = reactions.length;

  // Phase 1: Build dense-per-row intermediate using a Map for each species row.
  // Map<reactionIndex, netStoichiometry>
  const rowMaps: Map<number, number>[] = new Array(numSpecies);
  for (let i = 0; i < numSpecies; i++) {
    rowMaps[i] = new Map();
  }

  for (let j = 0; j < numReactions; j++) {
    const rxn = reactions[j];

    // Reactants: each occurrence subtracts 1
    for (let k = 0; k < rxn.reactants.length; k++) {
      const specIdx = rxn.reactants[k];
      if (constantMask && constantMask[specIdx]) continue;
      const current = rowMaps[specIdx].get(j) ?? 0;
      rowMaps[specIdx].set(j, current - 1);
    }

    // Products: each occurrence adds stoichiometry (default 1)
    for (let k = 0; k < rxn.products.length; k++) {
      const specIdx = rxn.products[k];
      if (constantMask && constantMask[specIdx]) continue;
      const stoich = rxn.productStoichiometries ? rxn.productStoichiometries[k] : 1;
      const current = rowMaps[specIdx].get(j) ?? 0;
      rowMaps[specIdx].set(j, current + stoich);
    }
  }

  // Phase 2: Count non-zeros (exclude entries that cancel to zero)
  let nnz = 0;
  for (let i = 0; i < numSpecies; i++) {
    for (const val of rowMaps[i].values()) {
      if (val !== 0) nnz++;
    }
  }

  // Phase 3: Allocate and fill CSR arrays
  const rowPtr = new Int32Array(numSpecies + 1);
  const colIdx = new Int32Array(nnz);
  const values = new Float64Array(nnz);

  let pos = 0;
  for (let i = 0; i < numSpecies; i++) {
    rowPtr[i] = pos;
    // Collect and sort column indices for deterministic ordering
    const entries: [number, number][] = [];
    for (const [col, val] of rowMaps[i].entries()) {
      if (val !== 0) {
        entries.push([col, val]);
      }
    }
    entries.sort((a, b) => a[0] - b[0]);
    for (const [col, val] of entries) {
      if (pos >= nnz) {
        throw new Error('[SparseStoichiometry] CSR position overflow while building matrix');
      }
      if (col < 0 || col >= numReactions) {
        throw new Error(`[SparseStoichiometry] Column index out of bounds: ${col}`);
      }
      colIdx[pos] = col;
      values[pos] = val;
      pos++;
    }
  }
  if (numSpecies >= rowPtr.length) {
    throw new Error('[SparseStoichiometry] Invalid rowPtr terminal index');
  }
  rowPtr[numSpecies] = pos;

  return { rowPtr, colIdx, values, nnz, numSpecies, numReactions };
}

/**
 * Sparse CSR matrix-vector product: dydt = S * reactionVelocities.
 *
 * This is the hot path for large-model derivative computation.
 * dydt must be pre-zeroed by the caller.
 *
 * @param S  CSR stoichiometry matrix (numSpecies x numReactions)
 * @param reactionVelocities  Dense vector of length numReactions
 * @param dydt  Output vector of length numSpecies (must be zeroed beforehand)
 */
export function sparseCSRDgemv(
  S: CSRStoichiometryMatrix,
  reactionVelocities: Float64Array,
  dydt: Float64Array
): void {
  const { rowPtr, colIdx, values, numSpecies } = S;
  for (let i = 0; i < numSpecies; i++) {
    let sum = 0.0;
    const start = rowPtr[i];
    const end = rowPtr[i + 1];
    for (let p = start; p < end; p++) {
      const col = colIdx[p];
      if (col < 0 || col >= reactionVelocities.length) {
        throw new Error(`[SparseStoichiometry] Invalid reaction velocity index: ${col}`);
      }
      sum += values[p] * reactionVelocities[col];
    }
    dydt[i] += sum;
  }
}

/**
 * Compute the sparsity fraction of the stoichiometry matrix.
 * Returns a value between 0 (fully dense) and 1 (all zeros).
 */
export function computeSparsity(numSpecies: number, numReactions: number, nnz: number): number {
  const total = numSpecies * numReactions;
  if (total === 0) return 1;
  return 1 - (nnz / total);
}

/**
 * Decide whether to use the sparse path.
 * Uses the sparse path when:
 *   - numSpecies >= 20 (threshold below which overhead is not worthwhile)
 *   - sparsity > 0.5 (more than 50% of the stoichiometry entries are zero)
 */
export function shouldUseSparse(numSpecies: number, numReactions: number, nnz: number): boolean {
  if (numSpecies < 20) return false;
  return computeSparsity(numSpecies, numReactions, nnz) > 0.5;
}
