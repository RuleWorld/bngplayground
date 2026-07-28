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

  // Phase 1: Build dense-per-row intermediate using parallel arrays for each species row.
  // ⚡ Bolt Optimization: Replace O(N) Maps and O(N log N) sorting with linear array aggregation.
  // Because j naturally increases linearly, column indices within each species row
  // are appended in non-decreasing order automatically.
  const rowColIdx: number[][] = new Array(numSpecies);
  const rowVals: number[][] = new Array(numSpecies);
  for (let i = 0; i < numSpecies; i++) {
    rowColIdx[i] = [];
    rowVals[i] = [];
  }

  for (let j = 0; j < numReactions; j++) {
    const rxn = reactions[j];

    // Reactants: each occurrence subtracts 1
    for (let k = 0; k < rxn.reactants.length; k++) {
      const specIdx = rxn.reactants[k];
      if (constantMask && constantMask[specIdx]) continue;
      rowColIdx[specIdx].push(j);
      rowVals[specIdx].push(-1);
    }

    // Products: each occurrence adds stoichiometry (default 1)
    for (let k = 0; k < rxn.products.length; k++) {
      const specIdx = rxn.products[k];
      if (constantMask && constantMask[specIdx]) continue;
      const stoich = rxn.productStoichiometries ? rxn.productStoichiometries[k] : 1;
      rowColIdx[specIdx].push(j);
      rowVals[specIdx].push(stoich);
    }
  }

  // Phase 2 & 3: Run-length encode adjacent identical column indices to find net stoichiometry,
  // pushing non-zero aggregates to flat arrays.
  const rowPtr = new Int32Array(numSpecies + 1);
  const allCols: number[] = [];
  const allVals: number[] = [];
  let pos = 0;

  for (let i = 0; i < numSpecies; i++) {
    rowPtr[i] = pos;
    const cols = rowColIdx[i];
    const vals = rowVals[i];
    const len = cols.length;

    if (len === 0) continue;

    let currentCol = cols[0];
    let currentVal = vals[0];

    for (let k = 1; k < len; k++) {
      if (cols[k] === currentCol) {
        currentVal += vals[k];
      } else {
        if (currentVal !== 0) {
          if (currentCol < 0 || currentCol >= numReactions) {
            throw new Error(`[SparseStoichiometry] Column index out of bounds: ${currentCol}`);
          }
          allCols.push(currentCol);
          allVals.push(currentVal);
          pos++;
        }
        currentCol = cols[k];
        currentVal = vals[k];
      }
    }
    // Push the final aggregated entry
    if (currentVal !== 0) {
      if (currentCol < 0 || currentCol >= numReactions) {
        throw new Error(`[SparseStoichiometry] Column index out of bounds: ${currentCol}`);
      }
      allCols.push(currentCol);
      allVals.push(currentVal);
      pos++;
    }
  }

  if (numSpecies >= rowPtr.length) {
    throw new Error('[SparseStoichiometry] Invalid rowPtr terminal index');
  }
  rowPtr.set([pos], numSpecies);

  const colIdx = new Int32Array(allCols);
  const values = new Float64Array(allVals);

  const matrix = { rowPtr, colIdx, values, nnz: pos, numSpecies, numReactions };
  validateCSR(matrix, numReactions);
  return matrix;
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
      sum += values[p] * reactionVelocities[colIdx[p]];
    }
    dydt[i] += sum;
  }
}

export function validateCSR(S: CSRStoichiometryMatrix, numReactionVelocities: number): void {
  for (let p = 0; p < S.nnz; p++) {
    if (S.colIdx[p] < 0 || S.colIdx[p] >= numReactionVelocities) {
      throw new Error(`[SparseStoichiometry] Invalid column index ${S.colIdx[p]} at position ${p}`);
    }
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
