import { describe, it, expect } from 'vitest';
import { computeDynamicObservable, validateObservablePattern } from '../packages/engine/src/utils/dynamicObservable';
import { SimulationResults } from '../types';

describe('Dynamic Observable Category - Comprehensive Testing', () => {
    // Enable debug logging for these specific tests
    (global as any).DEBUG_DYNAMIC_OBS = true;

    const createMockResults = (speciesNames: string[], speciesConcentrations: number[]): SimulationResults => {
        const timePoint0: Record<string, number> = { time: 0 };
        const speciesPoint0: Record<string, number> = {};
        
        speciesNames.forEach((name, i) => {
            speciesPoint0[name] = speciesConcentrations[i] || 0;
        });

        return {
            headers: ['time'],
            data: [timePoint0],
            speciesHeaders: speciesNames,
            speciesData: [speciesPoint0]
        };
    };

    describe('BNGL Pattern Matching - Bond Syntax', () => {
        const speciesNames = [
            'A(b)',                 // species 0: free A
            'A(b!1).B(a!1)',         // species 1: A-B complex
            'A(b!1).A(b!1)',         // species 2: A-A homodimer
        ];

        it('should correctly match specific bonds (!1)', () => {
            const results = createMockResults(speciesNames, [10, 20, 30]);
            const result = computeDynamicObservable(
                { name: 'dimer', pattern: 'A(b!1).B(a!1)', type: 'molecules' },
                results,
                speciesNames
            );
            expect(result.values[0]).toBe(20);
        });

        it('should correctly match bond wildcard (!+)', () => {
            const results = createMockResults(speciesNames, [10, 20, 30]);
            const result = computeDynamicObservable(
                { name: 'boundA', pattern: 'A(b!+)', type: 'molecules' },
                results,
                speciesNames
            );
            // species 1 (20) + species 2 (30 * 2) = 80
            expect(result.values[0]).toBe(80);
        });

        it('should correctly match strict unbound (!-)', () => {
            const results = createMockResults(speciesNames, [10, 20, 30]);
            const result = computeDynamicObservable(
                { name: 'freeA', pattern: 'A(b!-)', type: 'molecules' },
                results,
                speciesNames
            );
            // Only species 0 is unbound.
            expect(result.values[0]).toBe(10);
        });

        it('should match everything with no bond annotation (standard observable behavior)', () => {
            const results = createMockResults(speciesNames, [10, 20, 30]);
            const result = computeDynamicObservable(
                { name: 'anyA', pattern: 'A()', type: 'molecules' },
                results,
                speciesNames
            );
            // species 0 (10) + species 1 (20) + species 2 (30 * 2) = 90
            expect(result.values[0]).toBe(90);
        });
    });

    describe('BNGL Pattern Matching - State Syntax', () => {
        const speciesNames = ['A(s~u)', 'A(s~p)'];

        it('should correctly match specific states (~u, ~p)', () => {
            const results = createMockResults(speciesNames, [10, 20]);
            const resultU = computeDynamicObservable(
                { name: 'u', pattern: 'A(s~u)', type: 'molecules' },
                results,
                speciesNames
            );
            expect(resultU.values[0]).toBe(10);
        });

        it('should correctly match state wildcards (~?)', () => {
            const results = createMockResults(speciesNames, [10, 20]);
            const result = computeDynamicObservable(
                { name: 'any', pattern: 'A(s~?)', type: 'molecules' },
                results,
                speciesNames
            );
            expect(result.values[0]).toBe(30);
        });
    });

    describe('Mixed Math Expressions', () => {
        const speciesNames = ['A(b)', 'B(a)', 'A(b!1).B(a!1)'];
        const parameters = new Map([['kd', 1.5], ['A0', 100]]);

        it('should evaluate mixed math and patterns (scaling)', () => {
            const results = createMockResults(speciesNames, [10, 20, 5]);
            // A(b!1).B(a!1) is species 2 (conc 5)
            const result = computeDynamicObservable(
                { name: 'scaledDimer', pattern: '2 * A(b!1).B(a!1)', type: 'molecules' },
                results,
                speciesNames,
                parameters
            );
            // Result should be 2 * 5 = 10
            expect(result.values[0]).toBe(10);
        });

        it('should evaluate complex mixed expressions with parameters', () => {
            const results = createMockResults(speciesNames, [10, 20, 5]);
            const result = computeDynamicObservable(
                { name: 'complex', pattern: '(A(b!-) + B(a!-)) / A0 + kd', type: 'molecules' },
                results,
                speciesNames,
                parameters
            );
            // A(b!-) = 10, B(a!-) = 20. (10 + 20) / 100 + 1.5 = 1.8
            expect(result.values[0]).toBeCloseTo(1.8, 5);
        });
    });

    describe('Validation Logic', () => {
        it('should validate valid mixed expressions', () => {
            expect(validateObservablePattern('A(b) + B(a)')).toBeNull();
            expect(validateObservablePattern('2 * A(b!+) - 0.5')).toBeNull();
            expect(validateObservablePattern('exp(-kd * time) * A(b)')).toBeNull();
            // The one that failed according to user image
            expect(validateObservablePattern('A(b!1).B(a!1) + B0')).toBeNull();
            expect(validateObservablePattern('A(b!1) . B(a!1) + B0')).toBeNull();
        });

        it('should reject invalid BNGL within math', () => {
            expect(validateObservablePattern('A((b))')).not.toBeNull();
            expect(validateObservablePattern('A(b!1)..B(a!1)')).not.toBeNull();
        });
    });

    describe('Complex BNGL Patterns from JBM', () => {
        it('should parse and match complex JBM-style patterns', () => {
            const speciesNames = ['Rec(l,r!1).Rec(l,r!1)']; // Dimerized receptor
            const results = createMockResults(speciesNames, [50]);
            
            // "Rec(r!+)" matches receptors in a dimer
            const result = computeDynamicObservable(
                { name: 'dimerRec', pattern: 'Rec(r!+)', type: 'molecules' },
                results,
                speciesNames
            );
            expect(result.values[0]).toBe(100);
        });
    });
});
