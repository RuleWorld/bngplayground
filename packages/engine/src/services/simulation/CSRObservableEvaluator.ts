/**
 * CSRObservableEvaluator.ts
 *
 * CSR (Compressed Sparse Row) matrix-based observable evaluation for large
 * models. At scale (100+ observables), this avoids the V8 JIT deoptimization
 * that occurs when a single massive compiled function exceeds TurboFan's
 * optimization threshold.
 *
 * The observable matrix O has dimensions (numObservables x numSpecies).
 * O[i][j] = coefficient of species j in observable i.
 *
 * For each observable:  obsValue[i] = sum_j O[i][j] * y[j]
 *
 * Most observables only reference a small subset of species, so the matrix
 * is highly sparse. CSR format avoids iterating over zero entries.
 */

/**
 * CSR representation of the observable coefficient matrix.
 *
 * For a matrix with numObservables rows:
 *   rowPtr has length (numObservables + 1)
 *   colIdx and values have length nnz (number of non-zeros)
 *
 * Row i stores non-zero entries in colIdx[rowPtr[i]..rowPtr[i+1])
 * with corresponding values in values[rowPtr[i]..rowPtr[i+1]).
 */
export interface CSRObservableMatrix {
  rowPtr: Int32Array;
  colIdx: Int32Array;
  values: Float64Array;
  /** Optional per-entry volume factors for concentration-to-amount conversion. */
  volumeFactors: Float64Array | null;
  nnz: number;
  numObservables: number;
  numSpecies: number;
}

export interface ObservableDefinition {
  name: string;
  indices: Int32Array | number[];
  coefficients: Float64Array | number[];
  volumes?: Float64Array | number[];
}

/**
 * Build a CSR observable coefficient matrix from observable definitions.
 *
 * @param observables  Array of observable definitions with species indices and coefficients
 * @param numSpecies   Total number of species in the system
 * @param useAmounts   If true, species values are multiplied by volumes before coefficient
 * @returns CSR observable matrix
 */
export function buildCSRObservableMatrix(
  observables: ObservableDefinition[],
  numSpecies: number,
  useAmounts: boolean,
  defaultVolumes?: Float64Array
): CSRObservableMatrix {
  const numObservables = observables.length;

  // Phase 1: Count non-zeros
  let nnz = 0;
  for (let i = 0; i < numObservables; i++) {
    nnz += observables[i].indices.length;
  }

  // Phase 2: Allocate CSR arrays
  const rowPtr = new Int32Array(numObservables + 1);
  const colIdx = new Int32Array(nnz);
  const values = new Float64Array(nnz);
  const needVolumes = useAmounts;
  const volumeFactors = needVolumes ? new Float64Array(nnz) : null;

  // Phase 3: Fill CSR arrays
  let pos = 0;
  for (let i = 0; i < numObservables; i++) {
    rowPtr[i] = pos;
    const obs = observables[i];
    for (let j = 0; j < obs.indices.length; j++) {
      const specIdx = typeof obs.indices[j] === 'string'
        ? parseInt(obs.indices[j] as unknown as string, 10)
        : obs.indices[j] as number;
      colIdx[pos] = specIdx;
      values[pos] = typeof obs.coefficients[j] === 'string'
        ? parseFloat(obs.coefficients[j] as unknown as string)
        : obs.coefficients[j] as number;

      if (volumeFactors) {
        const obsVolumes = obs.volumes;
        if (obsVolumes && j < obsVolumes.length) {
          const v = typeof obsVolumes[j] === 'string'
            ? parseFloat(obsVolumes[j] as unknown as string)
            : obsVolumes[j] as number;
          volumeFactors[pos] = Number.isNaN(v) ? (defaultVolumes ? defaultVolumes[specIdx] : 1.0) : v;
        } else {
          volumeFactors[pos] = defaultVolumes ? defaultVolumes[specIdx] : 1.0;
        }
      }
      pos++;
    }
  }
  rowPtr[numObservables] = pos;

  return { rowPtr, colIdx, values, volumeFactors, nnz, numObservables, numSpecies };
}

/**
 * Evaluate all observables using CSR sparse matrix-vector product.
 *
 * This is the hot path for large-model observable computation.
 * output must have length >= numObservables.
 *
 * When useAmounts is true:
 *   obsValue[i] = sum_j coeff[j] * (y[specIdx[j]] * volume[j])
 * Otherwise:
 *   obsValue[i] = sum_j coeff[j] * y[specIdx[j]]
 *
 * @param matrix CSR observable matrix
 * @param y      Current species state vector
 * @param output Output buffer for observable values (length >= numObservables)
 */
export function evaluateObservablesCSR(
  matrix: CSRObservableMatrix,
  y: Float64Array,
  output: Float64Array
): void {
  const { rowPtr, colIdx, values, volumeFactors, numObservables } = matrix;

  if (volumeFactors) {
    // Amount-based: multiply species value by volume factor
    for (let i = 0; i < numObservables; i++) {
      let sum = 0.0;
      const start = rowPtr[i];
      const end = rowPtr[i + 1];
      for (let p = start; p < end; p++) {
        sum += values[p] * (y[colIdx[p]] * volumeFactors[p]);
      }
      output[i] = sum;
    }
  } else {
    // Concentration-based: direct coefficient * species value
    for (let i = 0; i < numObservables; i++) {
      let sum = 0.0;
      const start = rowPtr[i];
      const end = rowPtr[i + 1];
      for (let p = start; p < end; p++) {
        sum += values[p] * y[colIdx[p]];
      }
      output[i] = sum;
    }
  }
}

/**
 * Threshold for switching from JIT to CSR evaluation.
 * At 100+ observables, the single JIT function often exceeds V8's
 * TurboFan optimization limits and deoptimizes.
 */
export const CSR_OBSERVABLE_THRESHOLD = 100;

/**
 * Decide whether to use CSR sparse evaluation for observables.
 */
export function shouldUseCSRObservables(numObservables: number): boolean {
  return numObservables >= CSR_OBSERVABLE_THRESHOLD;
}
