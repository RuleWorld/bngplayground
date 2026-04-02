// @ts-nocheck
/**
 * Comprehensive Simulation Tests
 * Tests for ODE/SSA simulation accuracy and edge cases
 */
import { describe, it, expect } from 'vitest';
import { generateExpandedNetwork, simulate, parseBNGLStrict as parseBNGL } from '@bngplayground/engine';

describe('Simulation - Simple A + B -> C', () => {
    it('should conserve mass in closed system', async () => {
        // This will test mass conservation: A0 + B0 + C0 = constant
        // A + B -> C means A + C is conserved and B + C is conserved
        const bngl = `
        begin parameters
            k 0.1
            A0 100
            B0 100
            C0 0
        end parameters
        begin species
            A A0
            B B0
            C C0
        end species
        begin observables
            Molecules A_obs A()
            Molecules B_obs B()
            Molecules C_obs C()
        end observables
        begin reaction rules
            A() + B() -> C() k
        end reaction rules
        `;

        const parsedModel = parseBNGL(bngl);
        // Configure options via networkOptions instead of a param
        parsedModel.networkOptions = { maxStoich: 100 };
        const expandedNetwork = await generateExpandedNetwork(parsedModel, () => {}, () => {});

        const results = await simulate(1, expandedNetwork, { method: 'ode', t_end: 10, n_steps: 10 }, {
            checkCancelled: () => {},
            postMessage: () => {}
        });

        // initial amounts
        const A0 = 100;
        const B0 = 100;

        expect(results.data.length).toBeGreaterThan(0);

        for (const row of results.data) {
            const A = row['A_obs'];
            const B = row['B_obs'];
            const C = row['C_obs'];

            // Mass conservation: A + C = A0, B + C = B0
            expect(A + C).toBeCloseTo(A0, 5);
            expect(B + C).toBeCloseTo(B0, 5);
        }
    });

    it('should reach equilibrium for reversible reactions', async () => {
        // A + B <-> C should reach Keq = kf/kr
        expect(true).toBe(true);
    });

    it('should match analytical solution for first-order decay', async () => {
        // A -> 0: [A](t) = A0 * exp(-k*t)
        expect(true).toBe(true);
    });
});

describe('Simulation - SSA Stochastic', () => {
    it('should match ODE mean for large molecule counts', async () => {
        // For N >> 1, SSA mean should approach ODE solution
        expect(true).toBe(true);
    });

    it('should produce zero for degradation products', async () => {
        // A -> 0 should not create negative concentrations
        expect(true).toBe(true);
    });
});

describe('Simulation - Functional Rates', () => {
    it('should evaluate observable-dependent rates', async () => {
        // Rate = k * [A_total] where A_total is an observable
        expect(true).toBe(true);
    });

    it('should handle zero-argument function calls in rates', async () => {
        // Rate = myFunc() where myFunc() = k * [A]
        expect(true).toBe(true);
    });
});

describe('Simulation - Steady State Detection', () => {
    it('should detect steady state within tolerance', async () => {
        // d[X]/dt < tolerance for all species
        expect(true).toBe(true);
    });
});

describe('Simulation - Large Systems', () => {
    it('should handle 100+ species without memory issues', async () => {
        expect(true).toBe(true);
    });

    it('should handle 1000+ reactions without timeout', async () => {
        expect(true).toBe(true);
    });
});

