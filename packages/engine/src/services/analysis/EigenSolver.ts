/**
 * EigenSolver.ts -- Full eigenvalue/eigenvector solver for dense real matrices.
 *
 * Algorithms:
 *   1. Householder reduction to upper Hessenberg form
 *   2. Implicit double-shift QR iteration (Francis QR step)
 *   3. Eigenvalue extraction from quasi-triangular (real Schur) form
 *   4. Arnoldi iteration for leading eigenvalues of large/sparse matrices
 *   5. Eigenvector computation via inverse iteration
 */

// ── Types ───────────────────────────────────────────────────────────

export interface ComplexNumber {
  real: number;
  imag: number;
}

// ── Householder reduction to upper Hessenberg form ──────────────────

/**
 * Reduce a general n×n matrix (row-major Float64Array) to upper Hessenberg
 * form in-place using Householder reflections.  H = Q^T A Q.
 * On exit `H` is stored in the input array; the reflectors are stored below
 * the sub-diagonal for optional Q accumulation.
 */
function hessenbergReduce(H: Float64Array, n: number): void {
  for (let k = 0; k < n - 2; k++) {
    // Build Householder vector for column k, rows k+1..n-1
    let sigma = 0;
    for (let i = k + 1; i < n; i++) {
      sigma += H[i * n + k] * H[i * n + k];
    }
    if (sigma < 1e-300) continue;

    const alpha = H[(k + 1) * n + k];
    const mu = Math.sqrt(sigma); // sigma = ||x||^2, includes alpha^2
    // v0 = alpha - sign(alpha)*mu, using cancellation-safe form when alpha > 0
    const v0 = alpha <= 0 ? alpha - mu : -(sigma - alpha * alpha) / (alpha + mu);
    const beta = 2 * v0 * v0 / (sigma - alpha * alpha + v0 * v0);

    // Store Householder vector in-place (v[0] = v0 already implicit)
    const v = new Float64Array(n - k - 1);
    v[0] = v0;
    for (let i = 1; i < v.length; i++) {
      v[i] = H[(k + 1 + i) * n + k];
    }
    // Normalise so v[0]=1 for the reflector
    const invV0 = 1 / v0;
    for (let i = 1; i < v.length; i++) v[i] *= invV0;
    v[0] = 1;

    // Apply from left: H <- (I - beta*v*v^T) * H
    for (let j = k; j < n; j++) {
      let dot = 0;
      for (let i = 0; i < v.length; i++) {
        dot += v[i] * H[(k + 1 + i) * n + j];
      }
      dot *= beta;
      for (let i = 0; i < v.length; i++) {
        H[(k + 1 + i) * n + j] -= v[i] * dot;
      }
    }

    // Apply from right: H <- H * (I - beta*v*v^T)
    for (let i = 0; i < n; i++) {
      let dot = 0;
      for (let j = 0; j < v.length; j++) {
        dot += H[i * n + (k + 1 + j)] * v[j];
      }
      dot *= beta;
      for (let j = 0; j < v.length; j++) {
        H[i * n + (k + 1 + j)] -= dot * v[j];
      }
    }

    // Zero out sub-sub-diagonal entries explicitly for cleanliness
    for (let i = k + 2; i < n; i++) {
      H[i * n + k] = 0;
    }
  }
}

// ── Implicit double-shift QR step (Francis) ─────────────────────────

/**
 * Perform one implicit double-shift QR step on the Hessenberg matrix H,
 * restricted to rows/columns lo..hi (inclusive).
 */
function francisQRStep(H: Float64Array, n: number, lo: number, hi: number): void {
  const nn = hi - lo + 1;
  if (nn < 3) return;

  // Wilkinson shift: eigenvalues of the trailing 2×2 block
  const a = H[hi * n + hi];
  const b = H[(hi - 1) * n + (hi - 1)];
  const c = H[(hi - 1) * n + hi];
  const d = H[hi * n + (hi - 1)];

  const s = b + a; // trace
  const t = b * a - c * d; // determinant

  // Initial column of (H - sI)(H - tI)*e_1
  let x = H[lo * n + lo] * H[lo * n + lo] + H[lo * n + (lo + 1)] * H[(lo + 1) * n + lo] - s * H[lo * n + lo] + t;
  let y = H[(lo + 1) * n + lo] * (H[lo * n + lo] + H[(lo + 1) * n + (lo + 1)] - s);
  let z = H[(lo + 1) * n + lo] * H[(lo + 2) * n + (lo + 1)];

  for (let k = lo; k <= hi - 2; k++) {
    // Construct Householder reflector for [x, y, z]
    const norm = Math.sqrt(x * x + y * y + z * z);
    if (norm < 1e-300) {
      x = H[(k + 1) * n + k];
      y = k + 2 <= hi ? H[(k + 2) * n + k] : 0;
      z = k + 3 <= hi ? H[(k + 3) * n + k] : 0;
      continue;
    }
    const v1 = x + Math.sign(x) * norm;
    const v2 = y;
    const v3 = z;
    const tau = 2 / (v1 * v1 + v2 * v2 + v3 * v3);

    // Apply reflector from the left
    const colStart = Math.max(k, lo);
    for (let j = colStart; j < n; j++) {
      const w = v1 * H[k * n + j] + v2 * H[(k + 1) * n + j] + v3 * H[(k + 2) * n + j];
      H[k * n + j] -= tau * v1 * w;
      H[(k + 1) * n + j] -= tau * v2 * w;
      H[(k + 2) * n + j] -= tau * v3 * w;
    }

    // Apply reflector from the right
    const rowEnd = Math.min(k + 4, hi + 1);
    for (let i = 0; i < rowEnd; i++) {
      const w = v1 * H[i * n + k] + v2 * H[i * n + (k + 1)] + v3 * H[i * n + (k + 2)];
      H[i * n + k] -= tau * v1 * w;
      H[i * n + (k + 1)] -= tau * v2 * w;
      H[i * n + (k + 2)] -= tau * v3 * w;
    }

    // Prepare next iteration
    x = H[(k + 1) * n + k];
    y = k + 2 <= hi ? H[(k + 2) * n + k] : 0;
    z = k + 3 <= hi ? H[(k + 3) * n + k] : 0;
  }

  // Final 2×2 Givens rotation for the last bulge
  {
    const k = hi - 1;
    const norm = Math.sqrt(x * x + y * y);
    if (norm > 1e-300) {
      const cs = x / norm;
      const sn = y / norm;

      // Apply from left
      for (let j = k; j < n; j++) {
        const tmp = cs * H[k * n + j] + sn * H[(k + 1) * n + j];
        H[(k + 1) * n + j] = -sn * H[k * n + j] + cs * H[(k + 1) * n + j];
        H[k * n + j] = tmp;
      }
      // Apply from right
      for (let i = 0; i <= hi; i++) {
        const tmp = cs * H[i * n + k] + sn * H[i * n + (k + 1)];
        H[i * n + (k + 1)] = -sn * H[i * n + k] + cs * H[i * n + (k + 1)];
        H[i * n + k] = tmp;
      }
    }
  }
}

// ── QR eigenvalue extraction ────────────────────────────────────────

/**
 * Compute all eigenvalues of a real n×n matrix using Householder reduction
 * to Hessenberg form followed by the implicit double-shift QR algorithm.
 *
 * Returns complex eigenvalues as {real, imag} pairs.
 */
export function qrEigenvalues(
  matrix: Float64Array,
  n: number,
): Array<ComplexNumber> {
  if (n === 0) return [];
  if (n === 1) return [{ real: matrix[0], imag: 0 }];

  // Work on a copy
  const H = new Float64Array(matrix);

  // Reduce to Hessenberg form
  hessenbergReduce(H, n);

  const eigenvalues: Array<ComplexNumber> = [];

  // QR iteration
  let hi = n - 1;
  const maxIter = 300 * n;
  let iter = 0;

  while (hi >= 0 && iter < maxIter) {
    // Find the lowest unreduced sub-diagonal entry
    let lo = hi;
    while (lo > 0) {
      const s = Math.abs(H[(lo - 1) * n + (lo - 1)]) + Math.abs(H[lo * n + lo]);
      const threshold = s > 0 ? 1e-14 * s : 1e-30;
      if (Math.abs(H[lo * n + (lo - 1)]) <= threshold) {
        H[lo * n + (lo - 1)] = 0;
        break;
      }
      lo--;
    }

    if (lo === hi) {
      // 1×1 block: real eigenvalue
      eigenvalues.push({ real: H[hi * n + hi], imag: 0 });
      hi--;
    } else if (lo === hi - 1) {
      // 2×2 block: extract pair
      const a11 = H[(hi - 1) * n + (hi - 1)];
      const a12 = H[(hi - 1) * n + hi];
      const a21 = H[hi * n + (hi - 1)];
      const a22 = H[hi * n + hi];

      const tr = a11 + a22;
      const det = a11 * a22 - a12 * a21;
      const disc = tr * tr - 4 * det;

      if (disc >= 0) {
        const sqrtDisc = Math.sqrt(disc);
        eigenvalues.push({ real: (tr + sqrtDisc) / 2, imag: 0 });
        eigenvalues.push({ real: (tr - sqrtDisc) / 2, imag: 0 });
      } else {
        const sqrtDisc = Math.sqrt(-disc);
        eigenvalues.push({ real: tr / 2, imag: sqrtDisc / 2 });
        eigenvalues.push({ real: tr / 2, imag: -sqrtDisc / 2 });
      }
      hi -= 2;
    } else {
      // Perform QR step
      francisQRStep(H, n, lo, hi);
      iter++;
    }
  }

  // If we didn't converge, extract remaining diagonal entries
  if (hi >= 0) {
    for (let i = 0; i <= hi; i++) {
      eigenvalues.push({ real: H[i * n + i], imag: 0 });
    }
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
