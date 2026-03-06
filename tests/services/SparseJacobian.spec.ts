
import { describe, it, expect } from 'vitest';
import { 
    computeJacobianSparsity, 
    buildJacobianContributions, 
    generateSparseJacobianFunction 
} from '@bngplayground/engine';

// Mock Rxn
interface MockRxn {
    reactants: number[];
    products: number[];
    rate?: number;
}

describe('SparseJacobian Service', () => {

    describe('computeJacobianSparsity', () => {
        it('should detect diagonal for degradation A -> 0', () => {
            const rxns: MockRxn[] = [{ reactants: [0], products: [] }];
            const res = computeJacobianSparsity(rxns as any, 1);
            
            // J[0][0] is non-zero (dA/dt depends on A)
            expect(res.nnz).toBe(1);
            expect(res.rowPtr).toHaveLength(2); // n+1
            expect(res.colIdx[0]).toBe(0);
        });

        it('should detect pattern for A -> B', () => {
             // A -> B
             // dA/dt = -k*A. (Depends on A)
             // dB/dt = k*A. (Depends on A)
             const rxns: MockRxn[] = [{ reactants: [0], products: [1] }];
             const res = computeJacobianSparsity(rxns as any, 2);
             
             // Row 0 (A): Depends on A (0).
             // Row 1 (B): Depends on A (0).
             // Non-zeros: (0,0), (1,0).
             // CSR:
             // rowPtr: [0, 1, 2]
             // colIdx: [0, 0]
             
             expect(res.nnz).toBe(2);
             expect(res.rowPtr[0]).toBe(0);
             expect(res.rowPtr[1]).toBe(1);
             expect(res.rowPtr[2]).toBe(2);
             expect(res.colIdx[0]).toBe(0);
             expect(res.colIdx[1]).toBe(0);
        });

        it('should detect pattern for A + B -> C', () => {
             const rxns: MockRxn[] = [{ reactants: [0, 1], products: [2] }];
             const res = computeJacobianSparsity(rxns as any, 3);
             
             // All species (0,1,2) depend on Reactants (0,1)
             // Rows 0,1,2 should each have cols 0,1.
             // Total nnz = 3 * 2 = 6.
             expect(res.nnz).toBe(6);
        });
    });

    describe('generateSparseJacobianFunction', () => {
        it('should compute Jacobian for A -> B (k=2)', () => {
            const nSpecies = 2;
            const rxns = [{ reactants: [0], products: [1], rate: 2 }];
            const sparsity = computeJacobianSparsity(rxns as any, nSpecies);
            const contributions = buildJacobianContributions(rxns as any, nSpecies, sparsity);
            
            const evaluate = generateSparseJacobianFunction(rxns as any, nSpecies, sparsity, contributions);
            
            const y = new Float64Array([10, 5]);
            const data = new Float64Array(sparsity.nnz);
            
            evaluate(y, data);
            
            // Non-zeros: (0,0) and (1,0).
            // dA/dt = -2*A. d(dA/dt)/dA = -2.
            // dB/dt = 2*A. d(dB/dt)/dA = 2.
            // Map:
            // ptr 0 -> J[0][0] = -2
            // ptr 1 -> J[1][0] = 2
            
            expect(data[0]).toBeCloseTo(-2);
            expect(data[1]).toBeCloseTo(2);
        });

        it('should compute for A + B -> C (k=1)', () => {
             const nSpecies = 3;
             const rxns = [{ reactants: [0, 1], products: [2], rate: 1 }];
             const sparsity = computeJacobianSparsity(rxns as any, nSpecies);
             const contributions = buildJacobianContributions(rxns as any, nSpecies, sparsity);
             const evaluate = generateSparseJacobianFunction(rxns as any, nSpecies, sparsity, contributions);
             
             const y = new Float64Array([2, 3, 0]); // A=2, B=3
             const data = new Float64Array(sparsity.nnz);
             evaluate(y, data);
             
             // Rate = A*B.
             // dA/dt = -rate. d/dA = -B = -3. d/dB = -A = -2.
             // dB/dt = -rate. d/dA = -3. d/dB = -2.
             // dC/dt = rate. d/dA = 3. d/dB = 2.
             
             // Check specific entries based on sparsity order
             // Sparsity: All rows depend on 0, 1.
             // Row 0: cols 0, 1. (ptr 0, 1) -> -3, -2
             // Row 1: cols 0, 1. (ptr 2, 3) -> -3, -2
             // Row 2: cols 0, 1. (ptr 4, 5) -> 3, 2
             
             expect(data[0]).toBeCloseTo(-3);
             expect(data[1]).toBeCloseTo(-2);
             expect(data[2]).toBeCloseTo(-3);
             expect(data[3]).toBeCloseTo(-2);
             expect(data[4]).toBeCloseTo(3);
             expect(data[5]).toBeCloseTo(2);
        });

        it('should handle zero concentrations gracefully', () => {
             const nSpecies = 2;
             const rxns = [{ reactants: [0], products: [1], rate: 1 }];
             const sparsity = computeJacobianSparsity(rxns as any, nSpecies);
             const contributions = buildJacobianContributions(rxns as any, nSpecies, sparsity);
             const evaluate = generateSparseJacobianFunction(rxns as any, nSpecies, sparsity, contributions);
             
             const y = new Float64Array([0, 0]);
             const data = new Float64Array(sparsity.nnz);
             evaluate(y, data);
             
             // deriv of -k*A wrt A is -k = -1. Even if A=0.
             expect(data[0]).toBeCloseTo(-1);
             expect(data[1]).toBeCloseTo(1);
        });
        
        // Property tests
        for(let i=0; i<20; i++) {
             it(`should match numerical approximation #${i}`, () => {
                 // Random A->B or A+B->C
                 const k = Math.random() + 0.1;
                 const type = Math.random() > 0.5 ? 'uni' : 'bi';
                 const nSpecies = 3;
                 
                 let rxns;
                 if (type === 'uni') {
                     rxns = [{ reactants: [0], products: [1], rate: k }];
                 } else {
                     rxns = [{ reactants: [0, 1], products: [2], rate: k }];
                 }
                 
                 const sparsity = computeJacobianSparsity(rxns as any, nSpecies);
                 const contributions = buildJacobianContributions(rxns as any, nSpecies, sparsity);
                 const evaluate = generateSparseJacobianFunction(rxns as any, nSpecies, sparsity, contributions);
                 
                 const y = new Float64Array([Math.random(), Math.random(), 0]);
                 const analyticalData = new Float64Array(sparsity.nnz);
                 evaluate(y, analyticalData);
                 
                 // Numerical diff
                 const eps = 1e-6;
                 const getRates = (yy: Float64Array) => {
                     const rate = type === 'uni' ? k * yy[0] : k * yy[0] * yy[1];
                     const dy = new Float64Array(3);
                     if (type === 'uni') {
                         dy[0] -= rate; dy[1] += rate;
                     } else {
                         dy[0] -= rate; dy[1] -= rate; dy[2] += rate;
                     }
                     return dy;
                 };
                 
                 const yBase = new Float64Array(y);
                 const dyBase = getRates(yBase);
                 
                 const ptr = 0;
                 for (let r = 0; r < nSpecies; r++) {
                     for (let p = sparsity.rowPtr[r]; p < sparsity.rowPtr[r+1]; p++) {
                         const c = sparsity.colIdx[p];
                         
                         // Perturb y[c]
                         y[c] += eps;
                         const dyPerturb = getRates(y);
                         y[c] -= eps; // Restore
                         
                         const numDeriv = (dyPerturb[r] - dyBase[r]) / eps;
                         const anaDeriv = analyticalData[p];
                         
                         expect(anaDeriv).toBeCloseTo(numDeriv, 3); // Lower precision for finite diff
                     }
                 }
             });
        }
    });

});
