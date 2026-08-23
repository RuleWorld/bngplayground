import { describe, it, expect } from 'vitest';
import { analyzeQSSA, applyQSSAReduction } from '../../packages/engine/src/services/analysis/QSSAPreprocessor';
import type { BNGLModel } from '../../packages/engine/src/types';

describe('QSSAPreprocessor test with full parser', () => {
    it('derives rate span only from parameters used in reaction rules, ignoring non-rate parameters like initial concentrations', () => {
        const model: BNGLModel = {
            parameters: {
                kf_fast: 1000,
                kr_fast: 1000,
                kcat_slow: 1,
                E_init: 0.001, // Very small concentration parameter that shouldn't be treated as a kinetic rate constant
                S_init: 5000,  // Very large initial species parameter
            },
            moleculeTypes: [],
            species: [
                { name: 'E(s)', initialConcentration: 0.001 },
                { name: 'S(s)', initialConcentration: 5000 },
                { name: 'ES(s)', initialConcentration: 0 },
                { name: 'P()', initialConcentration: 0 },
            ],
            observables: [],
            reactions: [],
            reactionRules: [
                {
                    name: 'fast_bind1',
                    reactants: ['E(s)', 'S(s)'],
                    products: ['ES(s)'],
                    rate: 'kf_fast',
                    isBidirectional: false,
                },
                {
                    name: 'fast_bind2',
                    reactants: ['E(s)', 'S(s)'],
                    products: ['ES(s)'],
                    rate: 'kf_fast',
                    isBidirectional: false,
                },
                {
                    name: 'fast_unbind',
                    reactants: ['ES(s)'],
                    products: ['E(s)', 'S(s)'],
                    rate: 'kr_fast',
                    isBidirectional: false,
                },
                {
                    name: 'slow_cat',
                    reactants: ['ES(s)'],
                    products: ['E(s)', 'P()'],
                    rate: 'kcat_slow',
                    isBidirectional: false,
                },
            ],
        };

        const result = analyzeQSSA(model, { fastSlowThreshold: 100 });
        const qssaCandidates = result.candidates.filter((c) => c.recommendation === 'QSSA');
        expect(qssaCandidates.length).toBeGreaterThan(0);
        expect(qssaCandidates.map((c) => c.species)).toContain('ES(s)');
    });

    it('should correctly identify compartmental species', async () => {
        const model: BNGLModel = {
            parameters: {},
            moleculeTypes: [],
            species: [
                { name: '@EC:A(b)', initialConcentration: 100 },
                { name: 'B(a)', initialConcentration: 100 },
                { name: '@PM:A(b!1).B(a!1)', initialConcentration: 0 },
            ],
            observables: [],
            reactionRules: [
                {
                    name: 'rule1_fwd',
                    reactants: ['@EC:A(b)', 'B(a)'],
                    products: ['@PM:A(b!1).B(a!1)'],
                    rate: 'kf',
                    isBidirectional: false
                }
            ]
        };

        const result = applyQSSAReduction(model, ['@PM:A(b!1).B(a!1)']);

        // Assertions for correctness based on QSSA logic
        expect(result.conservationLaws).toHaveLength(1);
        const speciesNames = result.conservationLaws[0].species;

        expect(speciesNames).toContain('@PM:A(b!1).B(a!1)');
        expect(speciesNames).toContain('B(a)');
        expect(speciesNames).toContain('@EC:A(b)');
    });
});
