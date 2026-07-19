
import { describe, it, expect } from 'vitest';
import { jacobiEigenDecomposition, normInv, chi2Quantile } from '../../services/math/fimUtils';

describe('FIM Math Services', () => {

    describe('normInv (Inverse Normal CDF)', () => {
        it('should be close to 0 for p=0.5', () => {
            expect(normInv(0.5)).toBeCloseTo(0, 5);
        });
        it('should be roughly 1.96 for p=0.975', () => {
            expect(normInv(0.975)).toBeCloseTo(1.95996, 3);
        });
        it('should be roughly -1.96 for p=0.025', () => {
            expect(normInv(0.025)).toBeCloseTo(-1.95996, 3);
        });
        it('should be roughly 1 for p=0.8413', () => {
            expect(normInv(0.84134)).toBeCloseTo(1, 4);
        });
        it('should throw for 0', () => expect(() => normInv(0)).toThrow());
        it('should throw for 1', () => expect(() => normInv(1)).toThrow());

        // Check monotonicity for random points
        it('should be monotonic increasing', () => {
            let prev = -Infinity;
            for (let i = 1; i < 100; i++) {
                const p = i / 101;
                const res = normInv(p);
                expect(res).toBeGreaterThan(prev);
                prev = res;
            }
        });

        // Check symmetry
        for (let i = 1; i < 20; i++) {
            it(`should be symmetric for p=${i / 40}`, () => {
                const p = i / 40;
                const v1 = normInv(p);
                const v2 = normInv(1 - p);
                expect(v1).toBeCloseTo(-v2);
            });
        }
    });

    describe('chi2Quantile', () => {
        it('should be 3.84 for p=0.95, df=1', () => {
            expect(chi2Quantile(0.95, 1)).toBeCloseTo(3.841, 2);
        });
        // Test approximation validity for higher df
        it('should scale roughly with df (approximation)', () => {
            const q1 = chi2Quantile(0.95, 1);
            const q2 = chi2Quantile(0.95, 2);
            expect(q2).toBeCloseTo(q1 * 2, 0); // Logic says t * df/1
        });
    });

    describe('jacobiEigenDecomposition', () => {
        it('should decompose identity matrix', () => {
            const I = [[1, 0], [0, 1]];
            const { eigenvalues } = jacobiEigenDecomposition(I);
            // Eigs should be 1, 1
            expect(eigenvalues[0]).toBeCloseTo(1);
            expect(eigenvalues[1]).toBeCloseTo(1);
        });

        it('should decompose diagonal matrix', () => {
            const D = [[2, 0], [0, 3]];
            const { eigenvalues } = jacobiEigenDecomposition(D);
            // Sort check: 3, 2 (or 2, 3 depending on impl)
            // Implementation doesn't strictly sort output array?
            // Actually implementation extracts diag elements.
            // Jacobi usually converges to diagonalization.
            const sorted = eigenvalues.slice().sort();
            expect(sorted[0]).toBeCloseTo(2);
            expect(sorted[1]).toBeCloseTo(3);
        });

        // Property based testing: A = V D V^T
        const verifyDecomposition = (A: number[][], name: string) => {
            const n = A.length;
            const { eigenvalues, eigenvectors } = jacobiEigenDecomposition(A);

            // Reconstruct A' = V * D * V^T
            const Ap = Array.from({ length: n }, () => new Array(n).fill(0));
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    let sum = 0;
                    for (let k = 0; k < n; k++) {
                        // V * D
                        // (V[i][k] * lam[k]) * V[j][k]
                        sum += eigenvectors[i][k] * eigenvalues[k] * eigenvectors[j][k];
                    }
                    Ap[i][j] = sum;
                }
            }

            // Check A approx Ap
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    expect(Ap[i][j]).toBeCloseTo(A[i][j], 5); // 5 digits precision
                }
            }
        };

        it('should decompose symmetric 2x2', () => {
            const A = [[2, 1], [1, 2]];
            verifyDecomposition(A, 'sym2x2');
        });

        it('should decompose symmetric 3x3', () => {
            const A = [
                [4, 1, 2],
                [1, 5, 3],
                [2, 3, 6]
            ];
            verifyDecomposition(A, 'sym3x3');
        });

        // Random Matrix stress test
        for (let i = 0; i < 50; i++) {
            it(`should decompose random symmetric 4x4 matrix #${i}`, () => {
                const n = 4;
                // Generate random symmetric matrix
                const A = Array.from({ length: n }, () => new Array(n).fill(0));
                for (let r = 0; r < n; r++) {
                    for (let c = r; c < n; c++) {
                        const val = Math.random();
                        A[r][c] = val;
                        A[c][r] = val;
                    }
                }
                verifyDecomposition(A, `rand${i}`);
            });
        }
    });

});
