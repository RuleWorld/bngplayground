import { describe, it, expect } from 'vitest';
import {
  normInv,
  chi2Quantile,
  jacobiEigenDecomposition,
  matMul,
  matTranspose,
  invertSymmetricMatrix,
} from '../src/utils/mathUtils';

describe('normInv', () => {
  it('returns ~0 for p=0.5', () => {
    expect(normInv(0.5)).toBeCloseTo(0, 6);
  });

  it('returns ~1.96 for p=0.975', () => {
    expect(normInv(0.975)).toBeCloseTo(1.96, 2);
  });

  it('returns ~-1.96 for p=0.025', () => {
    expect(normInv(0.025)).toBeCloseTo(-1.96, 2);
  });

  it('returns ~2.576 for p=0.995', () => {
    expect(normInv(0.995)).toBeCloseTo(2.576, 2);
  });

  it('handles extreme lower tail (p=0.001)', () => {
    expect(normInv(0.001)).toBeCloseTo(-3.09, 1);
  });

  it('throws for p <= 0', () => {
    expect(() => normInv(0)).toThrow();
    expect(() => normInv(-0.5)).toThrow();
  });

  it('throws for p >= 1', () => {
    expect(() => normInv(1)).toThrow();
    expect(() => normInv(1.5)).toThrow();
  });
});

describe('chi2Quantile', () => {
  it('returns ~3.841 for p=0.95, df=1', () => {
    expect(chi2Quantile(0.95, 1)).toBeCloseTo(3.841, 1);
  });

  it('returns ~0.004 for p=0.05, df=1', () => {
    expect(chi2Quantile(0.05, 1)).toBeCloseTo(0.00393, 2);
  });

  it('returns ~5.991 for p=0.95, df=2', () => {
    expect(chi2Quantile(0.95, 2)).toBeCloseTo(5.991, 0);
  });

  it('returns ~7.815 for p=0.95, df=3', () => {
    expect(chi2Quantile(0.95, 3)).toBeCloseTo(7.815, 0);
  });

  it('throws for invalid p', () => {
    expect(() => chi2Quantile(0)).toThrow();
    expect(() => chi2Quantile(1)).toThrow();
  });
});

describe('jacobiEigenDecomposition', () => {
  it('decomposes a 2x2 diagonal matrix', () => {
    const A = [
      [3, 0],
      [0, 5],
    ];
    const { eigenvalues, eigenvectors } = jacobiEigenDecomposition(A);
    const sorted = [...eigenvalues].sort((a, b) => a - b);
    expect(sorted[0]).toBeCloseTo(3, 6);
    expect(sorted[1]).toBeCloseTo(5, 6);
    expect(eigenvectors.length).toBe(2);
  });

  it('decomposes a known 3x3 symmetric matrix', () => {
    // A = [[2, -1, 0], [-1, 2, -1], [0, -1, 2]]
    // Eigenvalues: 2, 2 ± sqrt(2)
    const A = [
      [2, -1, 0],
      [-1, 2, -1],
      [0, -1, 2],
    ];
    const { eigenvalues } = jacobiEigenDecomposition(A);
    const sorted = [...eigenvalues].sort((a, b) => a - b);
    expect(sorted[0]).toBeCloseTo(2 - Math.SQRT2, 6);
    expect(sorted[1]).toBeCloseTo(2, 6);
    expect(sorted[2]).toBeCloseTo(2 + Math.SQRT2, 6);
  });

  it('reconstructs A = V D V^T', () => {
    const A = [
      [5, 2, 1],
      [2, 3, 1],
      [1, 1, 4],
    ];
    const { eigenvalues, eigenvectors } = jacobiEigenDecomposition(A);
    const n = A.length;

    // A = V * diag(eigenvalues) * V^T
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += eigenvectors[i][k] * eigenvalues[k] * eigenvectors[j][k];
        }
        expect(sum).toBeCloseTo(A[i][j], 6);
      }
    }
  });
});

describe('matMul', () => {
  it('multiplies identity correctly', () => {
    const I = [[1, 0], [0, 1]];
    const A = [[3, 4], [5, 6]];
    expect(matMul(I, A)).toEqual(A);
    expect(matMul(A, I)).toEqual(A);
  });

  it('multiplies 2x2 matrices', () => {
    const A = [[1, 2], [3, 4]];
    const B = [[5, 6], [7, 8]];
    expect(matMul(A, B)).toEqual([[19, 22], [43, 50]]);
  });
});

describe('matTranspose', () => {
  it('transposes a 2x3 matrix', () => {
    const A = [[1, 2, 3], [4, 5, 6]];
    expect(matTranspose(A)).toEqual([[1, 4], [2, 5], [3, 6]]);
  });
});

describe('invertSymmetricMatrix', () => {
  it('inverts identity matrix', () => {
    const I = [[1, 0], [0, 1]];
    const inv = invertSymmetricMatrix(I);
    expect(inv).not.toBeNull();
    expect(inv![0][0]).toBeCloseTo(1);
    expect(inv![0][1]).toBeCloseTo(0);
    expect(inv![1][0]).toBeCloseTo(0);
    expect(inv![1][1]).toBeCloseTo(1);
  });

  it('inverts a 2x2 SPD matrix', () => {
    const A = [[4, 2], [2, 3]];
    const inv = invertSymmetricMatrix(A);
    expect(inv).not.toBeNull();
    // A^-1 = [[3/8, -1/4], [-1/4, 1/2]] (det=8)
    expect(inv![0][0]).toBeCloseTo(3 / 8, 6);
    expect(inv![0][1]).toBeCloseTo(-1 / 4, 6);
    expect(inv![1][1]).toBeCloseTo(1 / 2, 6);
  });

  it('A * A^-1 = I', () => {
    const A = [[5, 2, 1], [2, 3, 1], [1, 1, 4]];
    const inv = invertSymmetricMatrix(A);
    expect(inv).not.toBeNull();
    const product = matMul(A, inv!);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(product[i][j]).toBeCloseTo(i === j ? 1 : 0, 6);
      }
    }
  });

  it('returns null for singular matrix', () => {
    const A = [[1, 1], [1, 1]];
    expect(invertSymmetricMatrix(A)).toBeNull();
  });

  it('inverts a 1x1 matrix', () => {
    const A = [[4]];
    const inv = invertSymmetricMatrix(A);
    expect(inv).not.toBeNull();
    expect(inv![0][0]).toBeCloseTo(0.25, 6);
  });

  it('handles an empty matrix', () => {
    const A: number[][] = [];
    const inv = invertSymmetricMatrix(A);
    expect(inv).toEqual([]);
  });

  it('returns null for non-positive definite matrix', () => {
    const A = [[-4, 2], [2, 3]];
    expect(invertSymmetricMatrix(A)).toBeNull();
  });
});
