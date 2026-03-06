
import { describe, it, expect } from 'vitest';
import { jitCompiler } from '@bngplayground/engine';

describe('JITCompiler Service', () => {

    describe('compile', () => {
        it('should compile simple A -> B', () => {
             // A -> B, k=2.0
             const nSpecies = 2;
             const rxns = [{
                 reactantIndices: [0],
                 reactantStoich: [1],
                 productIndices: [1],
                 productStoich: [1],
                 rateConstant: 2.0
             }];
             
             const compiled = jitCompiler.compile(rxns, nSpecies);
             expect(compiled).toBeDefined();
             expect(compiled.nSpecies).toBe(2);
             
             const y = new Float64Array([10, 0]);
             const dydt = new Float64Array(2);
             
             compiled.evaluate(0, y, dydt);
             
             expect(dydt[0]).toBeCloseTo(-20);
             expect(dydt[1]).toBeCloseTo(20);
        });

        it('should compile A + B -> C with parameter', () => {
             const nSpecies = 3;
             const rxns = [{
                 reactantIndices: [0, 1],
                 reactantStoich: [1, 1],
                 productIndices: [2],
                 productStoich: [1],
                 rateConstant: 'k1'
             }];
             const params = { k1: 0.5 };
             
             const compiled = jitCompiler.compile(rxns, nSpecies, params);
             
             const y = new Float64Array([4, 5, 0]);
             const dydt = new Float64Array(3);
             
             compiled.evaluate(0, y, dydt);
             
             expect(dydt[0]).toBeCloseTo(-10);
             expect(dydt[1]).toBeCloseTo(-10);
             expect(dydt[2]).toBeCloseTo(10); 
        });

        it('should handle higher order stoichiometry 2A -> B', () => {
             const nSpecies = 2;
             const rxns = [{
                 reactantIndices: [0],
                 reactantStoich: [2],
                 productIndices: [1],
                 productStoich: [1],
                 rateConstant: 1
             }];
             
             const compiled = jitCompiler.compile(rxns, nSpecies);
             
             const y = new Float64Array([3, 0]); 
             const dydt = new Float64Array(2);
             compiled.evaluate(0, y, dydt);
             
             expect(dydt[0]).toBeCloseTo(-18);
             expect(dydt[1]).toBeCloseTo(9);
        });
        
        it('should compile degradation A -> 0', () => {
             const rxns = [{
                 reactantIndices: [0],
                 reactantStoich: [1],
                 productIndices: [],
                 productStoich: [],
                 rateConstant: 5
             }];
             
             const compiled = jitCompiler.compile(rxns, 1);
             const y = new Float64Array([2]);
             const dydt = new Float64Array(1);
             compiled.evaluate(0, y, dydt);
             expect(dydt[0]).toBeCloseTo(-10);
        });
        
        it('should compile synthesis 0 -> A', () => {
             const rxns = [{
                 reactantIndices: [],
                 reactantStoich: [],
                 productIndices: [0],
                 productStoich: [1],
                 rateConstant: 3
             }];
             
             const compiled = jitCompiler.compile(rxns, 1);
             const y = new Float64Array([0]);
             const dydt = new Float64Array(1);
             compiled.evaluate(0, y, dydt);
             expect(dydt[0]).toBeCloseTo(3);
        });
        
        // Property / Fuzz Testing
        for (let i = 0; i < 20; i++) {
            it(`should correctly evaluate random network #${i}`, () => {
                const k = Math.random() * 10;
                const A_idx = 0;
                const B_idx = 1;
                const stoichA = Math.floor(Math.random() * 3) + 1;
                const nSpecies = 2;
                
                const rxns = [{
                    reactantIndices: [A_idx],
                    reactantStoich: [stoichA],
                    productIndices: [B_idx],
                    productStoich: [1],
                    rateConstant: k
                }];
                
                const compiled = jitCompiler.compile(rxns, nSpecies);
                
                const A_val = Math.random() * 5;
                const B_val = Math.random() * 5;
                const y = new Float64Array([A_val, B_val]);
                const dydt = new Float64Array(2);
                
                compiled.evaluate(0, y, dydt);
                
                const rate = k * Math.pow(A_val, stoichA);
                const expected_dA = -stoichA * rate;
                const expected_dB = rate;
                
                expect(dydt[0]).toBeCloseTo(expected_dA);
                expect(dydt[1]).toBeCloseTo(expected_dB);
            });
        }
    });
});
