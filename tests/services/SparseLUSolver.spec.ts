
import { describe, it, expect } from 'vitest';
import { 
    denseToCSR, 
    ilu0Factorize, 
    forwardSolve, 
    backwardSolve, 
    sparseSolve, 
    csrMatVec,
    gmres,
    CSRMatrix 
} from '@bngplayground/engine';

describe('SparseLUSolver Service', () => {

    describe('Matrix Utils', () => {
        it('should convert dense to CSR', () => {
            const dense = new Float64Array([
                1, 0, 2,
                0, 3, 0,
                4, 5, 6
            ]);
            const csr = denseToCSR(dense, 3);
            
            expect(csr.n).toBe(3);
            expect(csr.nnz).toBe(6);
            expect(csr.rowPtr).toEqual(new Int32Array([0, 2, 3, 6]));
            expect(csr.values).toEqual(new Float64Array([1, 2, 3, 4, 5, 6]));
            expect(csr.colIdx).toEqual(new Int32Array([0, 2, 1, 0, 1, 2]));
        });

        it('should compute Matrix-Vector product', () => {
             const dense = new Float64Array([
                 2, 0, 0,
                 0, 3, 4,
                 0, 0, 5
             ]);
             const csr = denseToCSR(dense, 3);
             const x = new Float64Array([1, 1, 1]);
             const y = new Float64Array(3);
             
             csrMatVec(csr, x, y);
             // y[0] = 2*1 = 2
             // y[1] = 3*1 + 4*1 = 7
             // y[2] = 5*1 = 5
             expect(y[0]).toBe(2);
             expect(y[1]).toBe(7);
             expect(y[2]).toBe(5);
        });
    });

    describe('ILU0 Factorization', () => {
        it('should factorize diagonal matrix perfectly', () => {
            const dense = new Float64Array([
                2, 0,
                0, 4
            ]);
            const csr = denseToCSR(dense, 2);
            const factors = ilu0Factorize(csr);
            
            // L should be I (unit diagonal)
            // U should be A
            expect(factors.U.values[0]).toBeCloseTo(2);
            expect(factors.U.values[1]).toBeCloseTo(4);
        });

        it('should factorize lower triangular matrix', () => {
             const dense = new Float64Array([
                 2, 0,
                 1, 3
             ]);
             const csr = denseToCSR(dense, 2);
             const factors = ilu0Factorize(csr);
             
             // U should be diagonal (2, 3)
             // L should hold the 1 (normalized by U_kk: 1/2 = 0.5)
             // Wait, ILU0 in-place algo:
             // LU[1,0] /= LU[0,0] => 1/2 = 0.5.
             // L = [[1, 0], [0.5, 1]]
             // U = [[2, 0], [0, 3]]
             
             // L = [[1, 0], [0.5, 1]]
             // L values structure: Row 0 [1.0]. Row 1 [0.5, 1.0].
             // values: [1.0, 0.5, 1.0]
             
             expect(factors.L.values[0]).toBeCloseTo(1.0);
             expect(factors.L.values[1]).toBeCloseTo(0.5);
             
             // U check
             expect(factors.U.values[0]).toBeCloseTo(2);
             expect(factors.U.values[1]).toBeCloseTo(3);
        });
    });

    describe('Solvers', () => {
        it('should solve triangular systems', () => {
             // L = [[1, 0], [2, 1]]
             // U = [[2, 1], [0, 3]]
             // A = L*U = [[2, 1], [4, 5]]
             // b = [3, 9] (solution x=[1, 1])
             
             // Setup L
             // CSR for L (unit diag implicit):
             // Row 0: empty
             // Row 1: col 0, val 2.
             const L: CSRMatrix = {
                 n: 2, nnz: 1, 
                 rowPtr: new Int32Array([0, 0, 1]),
                 colIdx: new Int32Array([0]),
                 values: new Float64Array([2])
             };
             
             // Setup U
             // CSR for U (explicit diag):
             // Row 0: col 0 val 2, col 1 val 1
             // Row 1: col 1 val 3
             const U: CSRMatrix = {
                 n: 2, nnz: 3,
                 rowPtr: new Int32Array([0, 2, 3]),
                 colIdx: new Int32Array([0, 1, 1]),
                 values: new Float64Array([2, 1, 3])
             };
             
             const b = new Float64Array([3, 9]); // perm setup later
             
             // Forward solve Ly = b
             // y1 = 3
             // y2 + 2*y1 = 9 => y2 = 9 - 6 = 3.
             const y = new Float64Array(2);
             forwardSolve(L, b, y);
             expect(y[0]).toBeCloseTo(3);
             expect(y[1]).toBeCloseTo(3);
             
             // Backward solve Ux = y
             // 2x1 + x2 = 3
             // 3x2 = 3 => x2 = 1
             // 2x1 + 1 = 3 => 2x1=2 => x1=1
             const x = new Float64Array(2);
             backwardSolve(U, y, x);
             expect(x[0]).toBeCloseTo(1);
             expect(x[1]).toBeCloseTo(1);
        });

        it('should solve system using sparseSolve wrapper', () => {
             const dense = new Float64Array([
                 4, 1,
                 1, 3
             ]);
             const csr = denseToCSR(dense, 2);
             const factors = ilu0Factorize(csr);
             
             const xTarget = new Float64Array([1, 2]); // b = [6, 7]
             const b = new Float64Array([6, 7]);
             const x = new Float64Array(2);
             
             sparseSolve(factors, b, x);
             
             expect(x[0]).toBeCloseTo(1);
             expect(x[1]).toBeCloseTo(2);
        });
    });

    describe('GMRES', () => {
        it('should solve system iteratively', () => {
             // 10x10 diagonal matrix
             const n = 10;
             const dense = new Float64Array(n*n).fill(0);
             for(let i=0; i<n; i++) dense[i*n+i] = i+1; // 1 to 10
             
             const csr = denseToCSR(dense, n);
             const xTarget = new Float64Array(n).fill(1);
             const b = new Float64Array(n);
             csrMatVec(csr, xTarget, b);
             
             const x = new Float64Array(n).fill(0);
             // Solve
             const iters = gmres(csr, b, x, undefined, 1e-8, 20);
             
             expect(iters).toBeGreaterThan(0);
             for(let i=0; i<n; i++) {
                 expect(x[i]).toBeCloseTo(1);
             }
        });
        
        it('should solve generic sparse system', () => {
             // Tridiagonal -1, 2, -1
             const n = 20;
             const rowPtr = new Int32Array(n+1);
             const colIdx = [];
             const vals = [];
             
             for(let i=0; i<n; i++) {
                 rowPtr[i] = colIdx.length;
                 if(i>0) { colIdx.push(i-1); vals.push(-1); }
                 colIdx.push(i); vals.push(2);
                 if(i<n-1) { colIdx.push(i+1); vals.push(-1); }
             }
             rowPtr[n] = colIdx.length;
             
             const csr: CSRMatrix = {
                 n, nnz: colIdx.length,
                 rowPtr,
                 colIdx: new Int32Array(colIdx),
                 values: new Float64Array(vals)
             };
             
             const xTarget = new Float64Array(n).fill(1);
             const b = new Float64Array(n);
             csrMatVec(csr, xTarget, b);
             
             // Use ILU preconditioner
             const factors = ilu0Factorize(csr);
             const x = new Float64Array(n).fill(0);
             
             const iters = gmres(csr, b, x, factors, 1e-6);
             expect(iters).toBeGreaterThan(0);
             expect(iters).toBeLessThan(n); // Preconditioned should be fast
             
             expect(x[0]).toBeCloseTo(1);
             expect(x[n-1]).toBeCloseTo(1);
        });
    });
});
