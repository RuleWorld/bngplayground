import { describe, it, expect } from 'vitest';
import { applyQSSAReduction } from '../../packages/engine/src/services/analysis/QSSAPreprocessor';
import type { BNGLModel } from '../../packages/engine/src/types';

describe('QSSAPreprocessor test with full parser', () => {
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
