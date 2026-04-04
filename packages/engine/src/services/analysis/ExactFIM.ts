/**
 * ExactFIM.ts -- Exact Fisher Information Matrix using CVODES sensitivities.
 *
 * When sensitivities are obtained from CVODES forward sensitivity analysis,
 * the resulting FIM is exact (free of finite-difference truncation error).
 *
 * F_ij = sum_t sum_obs (1 / sigma_obs^2) * (dy_obs/dp_i)(t) * (dy_obs/dp_j)(t)
 */

import type { SensitivityResult } from './DifferentiableSolver';

// ── Types ───────────────────────────────────────────────────────────

export interface ExactFIMConfig {
  sensitivities: SensitivityResult;
  observableIndices: number[];
  observableSigmas: number[];
  parameterNames: string[];
  parameterValues?: Float64Array;
}

export interface ExactFIMResult {
  /** FIM matrix (nParams x nParams), stored row-major in a flat array */
  fim: Float64Array;
  /** Eigenvalues of FIM (sorted descending) */
  eigenvalues: Float64Array;
  /** Eigenvectors (columns of nParams x nParams matrix, row-major) */
  eigenvectors: Float64Array;
  /** Parameter correlations from inverse FIM */
  correlations: Float64Array;
  /** Confidence intervals from Cramer-Rao bound */
  cramerRaoBounds: Array<{ parameter: string; lower: number; upper: number }>;
}

// ── Implementation ──────────────────────────────────────────────────

export function computeExactFIM(config: ExactFIMConfig): ExactFIMResult {
  const { sensitivities, observableIndices, observableSigmas, parameterNames } = config;
  const nParams = parameterNames.length;
  const nTime = sensitivities.time.length;
  const nObs = observableIndices.length;

  // ── Build FIM ──
  const fim = new Float64Array(nParams * nParams);

  for (let t = 0; t < nTime; t++) {
    for (let oi = 0; oi < nObs; oi++) {
      const obsIdx = observableIndices[oi];
      const sigma = observableSigmas[oi];
      if (sigma < 1e-30) continue; // Guard against zero sigma
      const invSigmaSq = 1.0 / (sigma * sigma);

      for (let i = 0; i < nParams; i++) {
        const si = sensitivities.sensitivities[t][i][obsIdx];
        for (let j = i; j < nParams; j++) {
          const sj = sensitivities.sensitivities[t][j][obsIdx];
          const val = invSigmaSq * si * sj;
          fim[i * nParams + j] += val;
          if (i !== j) {
            fim[j * nParams + i] += val;
          }
        }
      }
    }
  }

  // ── Eigendecomposition (Jacobi method) ──
  const { eigenvalues, eigenvectors } = jacobiEigen(fim, nParams);

  // Sort eigenvalues descending
  const indices = Array.from({ length: nParams }, (_, i) => i);
  indices.sort((a, b) => eigenvalues[b] - eigenvalues[a]);
  const sortedEigenvalues = new Float64Array(nParams);
  const sortedEigenvectors = new Float64Array(nParams * nParams);
  for (let i = 0; i < nParams; i++) {
    sortedEigenvalues[i] = eigenvalues[indices[i]];
    for (let j = 0; j < nParams; j++) {
      sortedEigenvectors[j * nParams + i] = eigenvectors[j * nParams + indices[i]];
    }
  }

  // ── Invert FIM for covariance and correlations ──
  const invFIM = invertSymmetric(fim, nParams);
  const correlations = new Float64Array(nParams * nParams);
  const cramerRaoBounds: ExactFIMResult['cramerRaoBounds'] = [];

  // z_{0.975} for 95% CI
  const z = 1.959964;

  for (let i = 0; i < nParams; i++) {
    const varI = invFIM[i * nParams + i];
    const stdI = varI > 0 ? Math.sqrt(varI) : 0;

    const pVal = config.parameterValues?.[i] ?? 0;
    cramerRaoBounds.push({
      parameter: parameterNames[i],
      lower: pVal - z * stdI,
      upper: pVal + z * stdI,
    });

    for (let j = 0; j < nParams; j++) {
      const varJ = invFIM[j * nParams + j];
      const denom = Math.sqrt(Math.max(0, varI) * Math.max(0, varJ));
      correlations[i * nParams + j] = denom > 1e-30 ? invFIM[i * nParams + j] / denom : 0;
    }
  }

  return {
    fim,
    eigenvalues: sortedEigenvalues,
    eigenvectors: sortedEigenvectors,
    correlations,
    cramerRaoBounds,
  };
}

// ── Jacobi eigendecomposition for symmetric matrices ────────────────

function jacobiEigen(
  A: Float64Array,
  n: number,
): { eigenvalues: Float64Array; eigenvectors: Float64Array } {
  // Work on a copy
  const M = new Float64Array(A);
  // Initialize eigenvectors to identity
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;

  const maxIter = 100 * n * n;

  for (let iter = 0; iter < maxIter; iter++) {
    // Find largest off-diagonal element
    let maxVal = 0;
    let p = 0;
    let q = 1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const absVal = Math.abs(M[i * n + j]);
        if (absVal > maxVal) {
          maxVal = absVal;
          p = i;
          q = j;
        }
      }
    }

    if (maxVal < 1e-15) break;

    // Compute rotation angle
    const app = M[p * n + p];
    const aqq = M[q * n + q];
    const apq = M[p * n + q];

    let c: number, s: number;
    if (Math.abs(app - aqq) < 1e-30) {
      c = Math.SQRT1_2;
      s = Math.SQRT1_2;
    } else {
      const tau = (aqq - app) / (2 * apq);
      const t = Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      c = 1 / Math.sqrt(1 + t * t);
      s = t * c;
    }

    // Apply rotation to M
    for (let i = 0; i < n; i++) {
      if (i === p || i === q) continue;
      const mip = M[i * n + p];
      const miq = M[i * n + q];
      M[i * n + p] = c * mip - s * miq;
      M[p * n + i] = M[i * n + p];
      M[i * n + q] = s * mip + c * miq;
      M[q * n + i] = M[i * n + q];
    }

    M[p * n + p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    M[q * n + q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    M[p * n + q] = 0;
    M[q * n + p] = 0;

    // Update eigenvectors
    for (let i = 0; i < n; i++) {
      const vip = V[i * n + p];
      const viq = V[i * n + q];
      V[i * n + p] = c * vip - s * viq;
      V[i * n + q] = s * vip + c * viq;
    }
  }

  const eigenvalues = new Float64Array(n);
  for (let i = 0; i < n; i++) eigenvalues[i] = M[i * n + i];

  return { eigenvalues, eigenvectors: V };
}

// ── Symmetric matrix inversion via Cholesky / direct for small n ────

function invertSymmetric(A: Float64Array, n: number): Float64Array {
  // For small matrices, use Gauss-Jordan elimination
  // Augmented matrix [A | I]
  const aug = new Float64Array(n * 2 * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      aug[i * 2 * n + j] = A[i * n + j];
    }
    aug[i * 2 * n + n + i] = 1;
  }

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxVal = Math.abs(aug[col * 2 * n + col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(aug[row * 2 * n + col]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }

    if (maxVal < 1e-30) {
      // Singular -- return zeros
      return new Float64Array(n * n);
    }

    // Swap rows
    if (maxRow !== col) {
      for (let j = 0; j < 2 * n; j++) {
        const tmp = aug[col * 2 * n + j];
        aug[col * 2 * n + j] = aug[maxRow * 2 * n + j];
        aug[maxRow * 2 * n + j] = tmp;
      }
    }

    // Scale pivot row
    const pivot = aug[col * 2 * n + col];
    for (let j = 0; j < 2 * n; j++) {
      aug[col * 2 * n + j] /= pivot;
    }

    // Eliminate column
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row * 2 * n + col];
      for (let j = 0; j < 2 * n; j++) {
        aug[row * 2 * n + j] -= factor * aug[col * 2 * n + j];
      }
    }
  }

  // Extract inverse
  const inv = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      inv[i * n + j] = aug[i * 2 * n + n + j];
    }
  }

  return inv;
}
