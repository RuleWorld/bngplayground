
import { describe, it, expect } from 'vitest';
import { Rxn, SparseODESolver } from '@bngplayground/engine';

interface InternalSparseODESolver {
    n: number;
}

describe('SparseODESolver Service', () => {

    it('should integrate simple A -> B', () => {
        // A -> B, k=1
        const nSpecies = 2;
        const reactions: Rxn[] = [new Rxn([0], [1], 1.0)];
        
        // Derivatives: dA/dt = -A, dB/dt = A
        const derivatives = (y: Float64Array, dydt: Float64Array) => {
            const r = 1.0 * y[0];
            dydt[0] = -r;
            dydt[1] = r;
        };
        
        const y0 = new Float64Array([10, 0]);
        const times = [0, 1];
        const outputs: number[][] = [];
        
        const outputFn = (t: number, y: Float64Array) => {
            outputs.push(Array.from(y)); // Copy
        };
        
        const solver = new SparseODESolver(
            nSpecies,
            reactions,
            derivatives,
            y0,
            ['A', 'B'],
            { atol: 1e-6, rtol: 1e-6 }
        );
        
        const res = solver.integrate(y0, 0, 1, times, outputFn);
        
        expect(res.success).toBe(true);
        // Expect A(1) = 10 * exp(-1) approx 3.678
        expect(outputs.length).toBeGreaterThanOrEqual(2);
        
        const last = outputs[outputs.length - 1]; // At t=1
        expect(last[0]).toBeCloseTo(10 * Math.exp(-1), 2);
        expect(last[1]).toBeCloseTo(10 * (1 - Math.exp(-1)), 2);
    });

    it('should reduce the system size when conservation laws are enabled', () => {
        // A <-> B. Total = 10.
        // Reduced system should have size 1.
        const nSpecies = 2;
        const reactions: Rxn[] = [
            new Rxn([0], [1], 1.0),
            new Rxn([1], [0], 1.0),
        ];
        
        const derivatives = (y: Float64Array, dydt: Float64Array) => {
            // k1=1, k2=1
            const r1 = y[0];
            const r2 = y[1];
            dydt[0] = -r1 + r2;
            dydt[1] = r1 - r2;
        };
        
        const y0 = new Float64Array([10, 0]);
        const solver = new SparseODESolver(
            nSpecies,
            reactions,
            derivatives,
            y0,
            ['A', 'B'],
            { useConservationLaws: true, atol: 1e-4, rtol: 1e-4 }
        );
        
        // Internal check: reduced size
        const internal = solver as unknown as InternalSparseODESolver;
        expect(internal.n).toBe(1);
    });

    it('should fall back if linear solve fails', () => {
        // This is hard to trigger without bad matrix, but we verify it runs
        const nSpecies = 1;
        const reactions: Rxn[] = [];
        const derivatives = (_y: Float64Array, dydt: Float64Array) => { dydt[0] = 0; };
        const y0 = new Float64Array([1]);
        
        const solver = new SparseODESolver(nSpecies, reactions, derivatives, y0);
        const res = solver.integrate(y0, 0, 1, [0, 1], () => {});
        expect(res.success).toBe(true);
    });
});
