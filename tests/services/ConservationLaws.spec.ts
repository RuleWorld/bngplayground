
import { describe, it, expect } from 'vitest';
import { 
    buildStoichiometricMatrix, 
    computeLeftNullSpace, 
    findConservationLaws, 
    createReducedSystem, 
    ConservationLaw 
} from '@bngplayground/engine';

// Mock Rxn interface based on usage
interface MockRxn {
    reactants: number[];
    products: number[];
}

describe('ConservationLaws Service', () => {

    describe('buildStoichiometricMatrix', () => {
        it('should build correct matrix for A -> B', () => {
            const reactions: MockRxn[] = [{ reactants: [0], products: [1] }];
            const N = buildStoichiometricMatrix(reactions as any, 2);
            expect(N[0][0]).toBe(-1);
            expect(N[1][0]).toBe(1);
        });

        it('should handle A + B -> C', () => {
            const reactions: MockRxn[] = [{ reactants: [0, 1], products: [2] }];
            const N = buildStoichiometricMatrix(reactions as any, 3);
            expect(N[0][0]).toBe(-1);
            expect(N[1][0]).toBe(-1);
            expect(N[2][0]).toBe(1);
        });

        it('should handle empty reactions', () => {
            const N = buildStoichiometricMatrix([], 5);
            expect(N).toHaveLength(5);
            expect(N[0]).toHaveLength(0);
        });
    });

    describe('computeLeftNullSpace', () => {
        it('should find conservation in A <-> B', () => {
            const N = [
                [-1, 1],
                [1, -1]
            ];
            const nullSpace = computeLeftNullSpace(N);
            expect(nullSpace.length).toBeGreaterThan(0);
            
            const vec = nullSpace[0];
            expect(vec).toHaveLength(2);
            expect(vec[0]).toBe(1);
            expect(vec[1]).toBe(1);
        });

        it('should find 2 laws for A <-> B, C <-> D', () => {
            const N = [
                [-1, 1, 0, 0], 
                [1, -1, 0, 0], 
                [0, 0, -1, 1], 
                [0, 0, 1, -1] 
            ];
            const nullSpace = computeLeftNullSpace(N);
            expect(nullSpace).toHaveLength(2);
        });

        it('should return empty keys for full rank system', () => {
            const N = [[-1]];
            const nullSpace = computeLeftNullSpace(N);
            expect(nullSpace).toHaveLength(0);
        });

        // Property-based testing
        for(let i=0; i<20; i++) {
            it(`should satisfy N^T * v = 0 for random matrix #${i}`, () => {
                const rows = 3;
                const cols = 4;
                // Create random matrix (-2 to 2)
                const N: number[][] = Array.from({length: rows}, () => 
                    Array.from({length: cols}, () => Math.floor(Math.random() * 5) - 2)
                );
                
                const nullSpace = computeLeftNullSpace(N);
                
                // Verify each vector v in null space: v * N = 0
                // v is [rows] length. N is [rows][cols].
                // result is [cols] length (all zeros).
                for (const v of nullSpace) {
                     for (let c = 0; c < cols; c++) {
                         let sum = 0;
                         for (let r = 0; r < rows; r++) {
                             sum += v[r] * N[r][c];
                         }
                         expect(sum).toBeCloseTo(0);
                     }
                }
            });
        }
    });

    describe('findConservationLaws', () => {
        it('should identify Total A in A <-> B', () => {
            const reactions: MockRxn[] = [
                { reactants: [0], products: [1] },
                { reactants: [1], products: [0] }
            ];
            const initials = new Float64Array([10, 0]);
            const analysis = findConservationLaws(reactions as any, 2, initials, ['A', 'B']);

            expect(analysis.laws).toHaveLength(1);
            expect(analysis.laws[0].total).toBe(10);
            expect(analysis.laws[0].description).toContain('A + B');
            expect(analysis.rank).toBe(1);
        });

        it('should handle moiety conservation in E + S <-> ES -> E + P', () => {
            const reactions: MockRxn[] = [
                { reactants: [0, 1], products: [2] },
                { reactants: [2], products: [0, 1] },
                { reactants: [2], products: [0, 3] }
            ];
            const initials = new Float64Array([10, 100, 0, 0]);
            const analysis = findConservationLaws(reactions as any, 4, initials, ['E', 'S', 'ES', 'P']);

            const eLaw = analysis.laws.find(l => l.description.includes('E') && l.description.includes('ES'));
            expect(eLaw).toBeDefined();
            expect(eLaw?.total).toBe(10);
        });
    });

    describe('createReducedSystem', () => {
        it('should consistently reduce and expand state', () => {
             const laws: ConservationLaw[] = [{
                 dependentSpecies: 0,
                 coefficients: new Float64Array([1, 1]),
                 total: 10,
                 description: 'A + B = 10'
             }];
             const analysis = {
                 laws,
                 dependentSpecies: [0],
                 independentSpecies: [1],
                 rank: 1
             }; // Mock partial
             
             const sys = createReducedSystem(analysis as any, 2);
             
             const yFull = new Float64Array([3, 7]);
             const yRed = sys.reduce(yFull);
             expect(yRed).toHaveLength(1);
             expect(yRed[0]).toBe(7);
             
             const yRestored = sys.expand(yRed);
             expect(yRestored[0]).toBeCloseTo(3);
             expect(yRestored[1]).toBe(7);
        });

        it('should clamp negative values during expansion', () => {
            const laws: ConservationLaw[] = [{
                 dependentSpecies: 0,
                 coefficients: new Float64Array([1, 1]),
                 total: 10,
                 description: 'A + B = 10'
             }];
             const analysis = {
                 laws,
                 dependentSpecies: [0],
                 independentSpecies: [1],
                 rank: 1
             };
             const sys = createReducedSystem(analysis as any, 2);
             
             const yRed = new Float64Array([11]);
             const yRestored = sys.expand(yRed);
             expect(yRestored[0]).toBe(0);
        });
    });

});
