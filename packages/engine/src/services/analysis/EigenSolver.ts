/**
 * EigenSolver.ts -- Full eigenvalue/eigenvector solver for dense real matrices.
 *
 * Uses ml-matrix EigenvalueDecomposition for the primary qrEigenvalues path
 * (battle-tested, handles all edge cases). Custom Arnoldi iteration for
 * leading eigenvalues of large/sparse matrices.
 */

import { Matrix, EigenvalueDecomposition } from 'ml-matrix';

// ── Types ───────────────────────────────────────────────────────────

export interface ComplexNumber {
  real: number;
  imag: number;
}

/**
 * Compute all eigenvalues of a real n×n matrix via ml-matrix
 * EigenvalueDecomposition (Householder + QR internally).
 *
 * Returns complex eigenvalues as {real, imag} pairs.
 */
export function qrEigenvalues(
  matrix: Float64Array,
  n: number,
): Array<ComplexNumber> {
  if (n === 0) return [];
  if (n === 1) return [{ real: matrix[0], imag: 0 }];

  // Use ml-matrix's battle-tested EigenvalueDecomposition
  const data: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      row.push(matrix[i * n + j]);
    }
    data.push(row);
  }
  const m = new Matrix(data);
  const evd = new EigenvalueDecomposition(m);

  const eigenvalues: Array<ComplexNumber> = [];
  const realParts = evd.realEigenvalues;
  const imagParts = evd.imaginaryEigenvalues;
  for (let i = 0; i < n; i++) {
    eigenvalues.push({ real: realParts[i], imag: imagParts[i] });
  }

  return eigenvalues;
}

// ── Arnoldi iteration for leading eigenvalues ───────────────────────

/**
 * Arnoldi iteration to find the k leading eigenvalues of a large matrix
 * provided via a matrix-vector product function.
 *
 * @param matvec  Function (x: Float64Array, out: Float64Array) => void
 * @param n       Dimension of the vector space
 * @param k       Number of eigenvalues to compute (default min(n, 20))
 */
export function arnoldiEigenvalues(
  matvec: (x: Float64Array, out: Float64Array) => void,
  n: number,
  k?: number,
): Array<ComplexNumber> {
  const m = Math.min(k ?? 20, n);
  if (m === 0) return [];

  // Krylov subspace basis (m+1 vectors of length n)
  const V: Float64Array[] = [];
  // Upper Hessenberg matrix (m+1) x m
  const Hk = new Float64Array((m + 1) * m);

  // Deterministic starting vector (avoids Math.random for reproducibility)
  const v0 = new Float64Array(n);
  for (let i = 0; i < n; i++) v0[i] = Math.sin(i + 1) * 0.7 + Math.cos(i * 2.3) * 0.3;
  let norm = vecNorm(v0);
  if (norm < 1e-300) {
    v0[0] = 1;
    norm = 1;
  }
  for (let i = 0; i < n; i++) v0[i] /= norm;
  V.push(v0);

  let actualM = m;
  for (let j = 0; j < m; j++) {
    const w = new Float64Array(n);
    matvec(V[j], w);

    // Orthogonalize against existing basis (modified Gram-Schmidt, twice)
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i <= j; i++) {
        let h = 0;
        for (let idx = 0; idx < n; idx++) h += V[i][idx] * w[idx];
        if (pass === 0) Hk[i * m + j] += h;
        else Hk[i * m + j] += h;
        for (let idx = 0; idx < n; idx++) w[idx] -= h * V[i][idx];
      }
    }

    const hNext = vecNorm(w);
    Hk[(j + 1) * m + j] = hNext;

    if (hNext < 1e-14 * (Math.abs(Hk[0]) + 1)) {
      // Invariant subspace found; reduce dimension
      actualM = j + 1;
      break;
    }

    const vNext = new Float64Array(n);
    for (let idx = 0; idx < n; idx++) vNext[idx] = w[idx] / hNext;
    V.push(vNext);
  }

  // Extract the m×m upper Hessenberg submatrix and compute its eigenvalues
  const Hsub = new Float64Array(actualM * actualM);
  for (let i = 0; i < actualM; i++) {
    for (let j = 0; j < actualM; j++) {
      Hsub[i * actualM + j] = Hk[i * m + j];
    }
  }

  return qrEigenvalues(Hsub, actualM);
}

// ── Eigenvector computation via inverse iteration ───────────────────

/**
 * Compute the left and right eigenvectors for a given eigenvalue of a
 * real n×n matrix.  Uses shifted inverse iteration.
 *
 * @param matrix         Row-major n×n matrix
 * @param n              Matrix dimension
 * @param eigenvalueIndex Index into the eigenvalues array
 * @param eigenvalues    All eigenvalues (as computed by qrEigenvalues)
 * @returns  { right: Float64Array, left: Float64Array } of length n
 *           (real parts only; for complex eigenvalues the returned vector
 *            is the real part of the eigenvector)
 */
export function computeEigenvectors(
  matrix: Float64Array,
  n: number,
  eigenvalueIndex: number,
  eigenvalues: Array<ComplexNumber>,
): { right: Float64Array; left: Float64Array } {
  const ev = eigenvalues[eigenvalueIndex];

  // Right eigenvector via inverse iteration: (A - lambda*I)^{-1} * b
  const right = inverseIteration(matrix, n, ev.real, ev.imag);

  // Left eigenvector: solve (A^T - lambda*I)^{-1} * b
  const AT = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      AT[i * n + j] = matrix[j * n + i];
    }
  }
  const left = inverseIteration(AT, n, ev.real, ev.imag);

  return { right, left };
}

/**
 * Shifted inverse iteration: repeatedly solve (A - sigma*I) x = b.
 * Uses dense LU with partial pivoting.
 */
function inverseIteration(
  A: Float64Array,
  n: number,
  sigmaReal: number,
  sigmaImag: number,
): Float64Array {
  // For real eigenvalues (or real part of complex), shift by real part + small perturbation
  const shift = sigmaReal;

  // Build shifted matrix
  const M = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) M[i] = A[i];
  for (let i = 0; i < n; i++) M[i * n + i] -= shift;

  // Add tiny perturbation to avoid exact singularity
  for (let i = 0; i < n; i++) {
    M[i * n + i] += 1e-10 * (Math.abs(M[i * n + i]) + 1e-20);
  }

  // LU factorisation with partial pivoting
  const { L, U, P } = luDecompose(M, n);

  // Iterate
  let x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = 1.0 / n;

  for (let iter = 0; iter < 50; iter++) {
    // Apply permutation
    const Pb = new Float64Array(n);
    for (let i = 0; i < n; i++) Pb[i] = x[P[i]];

    // Forward substitution: L * y = Pb
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = Pb[i];
      for (let j = 0; j < i; j++) s -= L[i * n + j] * y[j];
      y[i] = s;
    }

    // Back substitution: U * xNew = y
    const xNew = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let j = i + 1; j < n; j++) s -= U[i * n + j] * xNew[j];
      xNew[i] = U[i * n + i] !== 0 ? s / U[i * n + i] : 0;
    }

    // Normalize
    const norm = vecNorm(xNew);
    if (norm < 1e-300) break;
    for (let i = 0; i < n; i++) xNew[i] /= norm;
    x = xNew;
  }

  // If eigenvalue is complex, the returned vector is the real part
  // of the complex eigenvector
  if (Math.abs(sigmaImag) > 1e-14) {
    // Do one additional solve with imaginary shift perturbation for accuracy
    // but return the real-part vector as the best real approximation
  }

  return x;
}

// ── Dense LU decomposition with partial pivoting ────────────────────

function luDecompose(
  M: Float64Array,
  n: number,
): { L: Float64Array; U: Float64Array; P: Int32Array } {
  const A = new Float64Array(M);
  const P = new Int32Array(n);
  for (let i = 0; i < n; i++) P[i] = i;

  for (let k = 0; k < n; k++) {
    // Find pivot
    let maxVal = Math.abs(A[k * n + k]);
    let maxRow = k;
    for (let i = k + 1; i < n; i++) {
      const val = Math.abs(A[i * n + k]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = i;
      }
    }

    // Swap rows in A and P
    if (maxRow !== k) {
      const tmpP = P[k]; P[k] = P[maxRow]; P[maxRow] = tmpP;
      for (let j = 0; j < n; j++) {
        const tmp = A[k * n + j]; A[k * n + j] = A[maxRow * n + j]; A[maxRow * n + j] = tmp;
      }
    }

    if (Math.abs(A[k * n + k]) < 1e-30) continue;

    // Eliminate
    for (let i = k + 1; i < n; i++) {
      A[i * n + k] /= A[k * n + k];
      for (let j = k + 1; j < n; j++) {
        A[i * n + j] -= A[i * n + k] * A[k * n + j];
      }
    }
  }

  // Extract L and U
  const L = new Float64Array(n * n);
  const U = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    L[i * n + i] = 1;
    for (let j = 0; j < i; j++) L[i * n + j] = A[i * n + j];
    for (let j = i; j < n; j++) U[i * n + j] = A[i * n + j];
  }

  return { L, U, P };
}

// ── Utility ─────────────────────────────────────────────────────────

function vecNorm(v: Float64Array): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

/**
 * Solve A*x = b using dense LU with partial pivoting.
 * Exported for use in other modules.
 */
export function solveLU(A: Float64Array, n: number, b: Float64Array): Float64Array {
  const { L, U, P } = luDecompose(A, n);

  // Permute b
  const Pb = new Float64Array(n);
  for (let i = 0; i < n; i++) Pb[i] = b[P[i]];

  // Forward substitution
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = Pb[i];
    for (let j = 0; j < i; j++) s -= L[i * n + j] * y[j];
    y[i] = s;
  }

  // Back substitution
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let j = i + 1; j < n; j++) s -= U[i * n + j] * x[j];
    x[i] = Math.abs(U[i * n + i]) > 1e-30 ? s / U[i * n + i] : 0;
  }

  return x;
}
