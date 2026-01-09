/**
 * SparseLUSolver.ts - Pure TypeScript sparse LU factorization
 * 
 * Implements ILU(0) (Incomplete LU with zero fill-in) for use as a preconditioner
 * with iterative Krylov methods, or as a direct solver for sparse systems.
 * 
 * Inspired by Catalyst.jl's sparse Jacobian generation and SciML solvers.
 * This provides a browser-compatible alternative to KLU (SuiteSparse).
 */

/**
 * Compressed Sparse Row (CSR) matrix format
 */
export interface CSRMatrix {
  n: number;           // Matrix dimension (n x n)
  nnz: number;         // Number of non-zeros
  rowPtr: Int32Array;  // Row pointers (length n+1)
  colIdx: Int32Array;  // Column indices (length nnz)
  values: Float64Array; // Non-zero values (length nnz)
}

/**
 * ILU(0) factorization result
 */
export interface ILU0Factors {
  /** Lower triangular factor L (unit diagonal, stored explicitly) */
  L: CSRMatrix;
  /** Upper triangular factor U (including diagonal) */
  U: CSRMatrix;
  /** Permutation for numerical stability (row pivoting) */
  perm: Int32Array;
  /** Inverse permutation */
  invPerm: Int32Array;
}

/**
 * Create a CSR matrix from dense matrix (for small systems or testing)
 */
export function denseToCSR(dense: Float64Array, n: number): CSRMatrix {
  const rowPtr = new Int32Array(n + 1);
  const colIndices: number[] = [];
  const vals: number[] = [];

  for (let i = 0; i < n; i++) {
    rowPtr[i] = colIndices.length;
    for (let j = 0; j < n; j++) {
      const val = dense[i * n + j];
      if (Math.abs(val) > 1e-15) {
        colIndices.push(j);
        vals.push(val);
      }
    }
  }
  rowPtr[n] = colIndices.length;

  return {
    n,
    nnz: colIndices.length,
    rowPtr,
    colIdx: new Int32Array(colIndices),
    values: new Float64Array(vals)
  };
}

/**
 * Create CSR matrix from sparsity pattern and value function
 */
export function createCSR(
  n: number,
  rowPtr: Int32Array,
  colIdx: Int32Array,
  computeValues: (values: Float64Array) => void
): CSRMatrix {
  const nnz = rowPtr[n];
  const values = new Float64Array(nnz);
  computeValues(values);
  return { n, nnz, rowPtr, colIdx: colIdx.slice(), values };
}

/**
 * Compute ILU(0) factorization - Incomplete LU with zero fill-in
 * 
 * This preserves the sparsity pattern of the original matrix, making it
 * efficient for iterative methods with repeated factorizations.
 * 
 * @param A - CSR matrix to factorize
 * @returns ILU(0) factors L and U
 */
export function ilu0Factorize(A: CSRMatrix): ILU0Factors {
  const n = A.n;

  // Work arrays
  const rowStart = A.rowPtr;
  const colIdx = A.colIdx;

  // Copy values (will be modified in-place to contain L\U)
  const LU = new Float64Array(A.values);

  // Create diagonal index lookup for O(1) diagonal access
  const diagIdx = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    diagIdx[i] = -1;
    for (let p = rowStart[i]; p < rowStart[i + 1]; p++) {
      if (colIdx[p] === i) {
        diagIdx[i] = p;
        break;
      }
    }
    if (diagIdx[i] === -1) {
      // No diagonal element - add implicit zero (ILU will fail)
      console.warn(`[SparseLU] Row ${i} has no diagonal element`);
    }
  }

  // Create column position lookup for each row
  // colPos[i] maps column j -> position in row i (or -1 if not present)
  const colPos = new Map<number, Map<number, number>>();
  for (let i = 0; i < n; i++) {
    const rowMap = new Map<number, number>();
    for (let p = rowStart[i]; p < rowStart[i + 1]; p++) {
      rowMap.set(colIdx[p], p);
    }
    colPos.set(i, rowMap);
  }

  // IKJ variant of ILU(0)
  for (let i = 1; i < n; i++) {
    const rowI = colPos.get(i)!;

    // For each k < i where A[i,k] != 0
    for (let pk = rowStart[i]; pk < rowStart[i + 1]; pk++) {
      const k = colIdx[pk];
      if (k >= i) break; // Only process lower triangle

      const diagK = diagIdx[k];
      if (diagK === -1 || Math.abs(LU[diagK]) < 1e-15) continue;

      // LU[i,k] = LU[i,k] / LU[k,k]
      LU[pk] /= LU[diagK];
      const lik = LU[pk];

      // For each j > k where A[k,j] != 0
      const rowK = colPos.get(k);
      if (!rowK) continue;

      for (let pj = rowStart[k]; pj < rowStart[k + 1]; pj++) {
        const j = colIdx[pj];
        if (j <= k) continue; // Only process upper triangle of row k

        // If A[i,j] != 0, update: LU[i,j] -= LU[i,k] * LU[k,j]
        const posIJ = rowI.get(j);
        if (posIJ !== undefined) {
          LU[posIJ] -= lik * LU[pj];
        }
        // Note: ILU(0) ignores fill-in (positions not in original pattern)
      }
    }
  }

  // Extract L and U from combined LU array
  // L: lower triangular with unit diagonal
  // U: upper triangular including diagonal
  const lRowPtr = new Int32Array(n + 1);
  const uRowPtr = new Int32Array(n + 1);
  const lCols: number[] = [];
  const lVals: number[] = [];
  const uCols: number[] = [];
  const uVals: number[] = [];

  for (let i = 0; i < n; i++) {
    lRowPtr[i] = lCols.length;
    uRowPtr[i] = uCols.length;

    for (let p = rowStart[i]; p < rowStart[i + 1]; p++) {
      const j = colIdx[p];
      const val = LU[p];

      if (j < i) {
        // Lower triangular
        lCols.push(j);
        lVals.push(val);
      } else {
        // Upper triangular (including diagonal)
        uCols.push(j);
        uVals.push(val);
      }
    }

    // L has implicit unit diagonal
    lCols.push(i);
    lVals.push(1.0);
  }
  lRowPtr[n] = lCols.length;
  uRowPtr[n] = uCols.length;

  // Identity permutation (no pivoting in basic ILU(0))
  const perm = new Int32Array(n);
  const invPerm = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    perm[i] = i;
    invPerm[i] = i;
  }

  return {
    L: {
      n,
      nnz: lCols.length,
      rowPtr: lRowPtr,
      colIdx: new Int32Array(lCols),
      values: new Float64Array(lVals)
    },
    U: {
      n,
      nnz: uCols.length,
      rowPtr: uRowPtr,
      colIdx: new Int32Array(uCols),
      values: new Float64Array(uVals)
    },
    perm,
    invPerm
  };
}

/**
 * Solve L * y = b (forward substitution)
 */
export function forwardSolve(L: CSRMatrix, b: Float64Array, y: Float64Array): void {
  const n = L.n;
  y.set(b);

  for (let i = 0; i < n; i++) {
    // y[i] -= sum(L[i,j] * y[j]) for j < i
    for (let p = L.rowPtr[i]; p < L.rowPtr[i + 1]; p++) {
      const j = L.colIdx[p];
      if (j < i) {
        y[i] -= L.values[p] * y[j];
      } else if (j === i) {
        // Divide by diagonal (should be 1 for unit L)
        y[i] /= L.values[p];
        break;
      }
    }
  }
}

/**
 * Solve U * x = y (backward substitution)
 */
export function backwardSolve(U: CSRMatrix, y: Float64Array, x: Float64Array): void {
  const n = U.n;
  x.set(y);

  for (let i = n - 1; i >= 0; i--) {
    // Find diagonal and compute x[i]
    let diag = 1.0;
    for (let p = U.rowPtr[i]; p < U.rowPtr[i + 1]; p++) {
      const j = U.colIdx[p];
      if (j === i) {
        diag = U.values[p];
      } else if (j > i) {
        x[i] -= U.values[p] * x[j];
      }
    }
    x[i] /= diag;
  }
}

/**
 * Solve A * x = b using ILU(0) factorization
 */
export function sparseSolve(factors: ILU0Factors, b: Float64Array, x: Float64Array): void {
  const n = factors.L.n;
  const y = new Float64Array(n);

  // Apply permutation: b_perm = P * b
  const bPerm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    bPerm[i] = b[factors.perm[i]];
  }

  // Solve L * y = b_perm
  forwardSolve(factors.L, bPerm, y);

  // Solve U * x_perm = y
  const xPerm = new Float64Array(n);
  backwardSolve(factors.U, y, xPerm);

  // Apply inverse permutation: x = P^T * x_perm
  for (let i = 0; i < n; i++) {
    x[factors.invPerm[i]] = xPerm[i];
  }
}

/**
 * Sparse matrix-vector product: y = A * x
 */
export function csrMatVec(A: CSRMatrix, x: Float64Array, y: Float64Array): void {
  const n = A.n;
  y.fill(0);

  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let p = A.rowPtr[i]; p < A.rowPtr[i + 1]; p++) {
      sum += A.values[p] * x[A.colIdx[p]];
    }
    y[i] = sum;
  }
}

/**
 * GMRES solver with ILU(0) preconditioner
 * Solves A * x = b iteratively
 * 
 * @param A - CSR matrix
 * @param b - Right-hand side
 * @param x - Solution (initial guess on input, solution on output)
 * @param precond - Optional ILU(0) preconditioner
 * @param tol - Convergence tolerance
 * @param maxIter - Maximum iterations
 * @returns Number of iterations (negative if not converged)
 */
export function gmres(
  A: CSRMatrix,
  b: Float64Array,
  x: Float64Array,
  precond?: ILU0Factors,
  tol: number = 1e-6,
  maxIter: number = 100
): number {
  const n = A.n;
  const restart = Math.min(maxIter, 50); // Restart parameter

  const r = new Float64Array(n);
  const Ax = new Float64Array(n);

  // Compute initial residual: r = b - A*x
  csrMatVec(A, x, Ax);
  for (let i = 0; i < n; i++) r[i] = b[i] - Ax[i];

  // Apply preconditioner to residual
  const z = new Float64Array(n);
  if (precond) {
    sparseSolve(precond, r, z);
  } else {
    z.set(r);
  }

  let rnorm = 0;
  for (let i = 0; i < n; i++) rnorm += z[i] * z[i];
  rnorm = Math.sqrt(rnorm);

  const bnorm = Math.sqrt(b.reduce((s, v) => s + v * v, 0)) || 1;

  if (rnorm / bnorm < tol) return 0;

  // Arnoldi vectors
  const V: Float64Array[] = [];
  const H: Float64Array[] = []; // Hessenberg matrix
  const s = new Float64Array(restart + 1);
  const cs = new Float64Array(restart);
  const sn = new Float64Array(restart);

  for (let iter = 0; iter < maxIter; iter += restart) {
    // Initialize
    V.length = 0;
    H.length = 0;
    s.fill(0);
    s[0] = rnorm;

    // v1 = z / ||z||
    const v0 = new Float64Array(n);
    for (let i = 0; i < n; i++) v0[i] = z[i] / rnorm;
    V.push(v0);

    let j: number;
    for (j = 0; j < restart && iter + j < maxIter; j++) {
      // w = A * M^{-1} * v[j]
      const w = new Float64Array(n);
      csrMatVec(A, V[j], w);

      if (precond) {
        const wPrec = new Float64Array(n);
        sparseSolve(precond, w, wPrec);
        w.set(wPrec);
      }

      // Arnoldi: orthogonalize against previous vectors
      const hCol = new Float64Array(j + 2);
      for (let i = 0; i <= j; i++) {
        let dot = 0;
        for (let k = 0; k < n; k++) dot += w[k] * V[i][k];
        hCol[i] = dot;
        for (let k = 0; k < n; k++) w[k] -= dot * V[i][k];
      }

      let wnorm = 0;
      for (let k = 0; k < n; k++) wnorm += w[k] * w[k];
      wnorm = Math.sqrt(wnorm);
      hCol[j + 1] = wnorm;
      H.push(hCol);

      // Add new basis vector
      const vNew = new Float64Array(n);
      if (wnorm > 1e-14) {
        for (let k = 0; k < n; k++) vNew[k] = w[k] / wnorm;
      }
      V.push(vNew);

      // Apply Givens rotations
      for (let i = 0; i < j; i++) {
        const temp = cs[i] * hCol[i] + sn[i] * hCol[i + 1];
        hCol[i + 1] = -sn[i] * hCol[i] + cs[i] * hCol[i + 1];
        hCol[i] = temp;
      }

      // New Givens rotation
      const delta = Math.sqrt(hCol[j] * hCol[j] + hCol[j + 1] * hCol[j + 1]);
      cs[j] = hCol[j] / delta;
      sn[j] = hCol[j + 1] / delta;
      hCol[j] = delta;
      hCol[j + 1] = 0;

      // Update residual
      s[j + 1] = -sn[j] * s[j];
      s[j] = cs[j] * s[j];

      rnorm = Math.abs(s[j + 1]);
      if (rnorm / bnorm < tol) {
        j++;
        break;
      }
    }

    // Back substitution
    const y = new Float64Array(j);
    for (let i = j - 1; i >= 0; i--) {
      y[i] = s[i];
      for (let k = i + 1; k < j; k++) {
        y[i] -= H[k][i] * y[k];
      }
      y[i] /= H[i][i];
    }

    // Update solution: x = x + V * y
    for (let i = 0; i < j; i++) {
      for (let k = 0; k < n; k++) {
        x[k] += y[i] * V[i][k];
      }
    }

    if (rnorm / bnorm < tol) {
      console.log(`[GMRES] Converged in ${iter + j} iterations, residual=${rnorm / bnorm}`);
      return iter + j;
    }

    // Compute new residual for restart
    csrMatVec(A, x, Ax);
    for (let i = 0; i < n; i++) r[i] = b[i] - Ax[i];
    if (precond) {
      sparseSolve(precond, r, z);
    } else {
      z.set(r);
    }
    rnorm = 0;
    for (let i = 0; i < n; i++) rnorm += z[i] * z[i];
    rnorm = Math.sqrt(rnorm);
  }

  console.warn(`[GMRES] Did not converge in ${maxIter} iterations, residual=${rnorm / bnorm}`);
  return -maxIter;
}
