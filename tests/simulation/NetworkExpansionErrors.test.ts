
import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateExpandedNetwork } from '@bngplayground/engine';
import { BNGLModel } from '../../types';
import * as ExpressionEvaluator from '../../services/simulation/ExpressionEvaluator';

describe('NetworkExpansion Error Handling', () => {

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const baseModel: BNGLModel = {
        species: [{ name: 'A(l,r)', initialConcentration: 100 }],
        moleculeTypes: [],
        reactions: [],
        reactionRules: [],
        observables: [],
        parameters: {},
        compartments: [],
        functions: [],
        networkOptions: {}
    };

    it('should respect maxIter limit for infinite polymerization', async () => {
        // Rule: A(r) + A(l) -> A(r!1).A(l!1)
        const polyModel: BNGLModel = {
            ...baseModel,
            reactionRules: [{
                name: 'Polymerization',
                rate: '1',
                reactants: ['A(r)', 'A(l)'],
                products: ['A(r!1).A(l!1)'],
                isBidirectional: false
            }],
            networkOptions: { maxIter: 2 } // Very low limit
        };

        // Expect it to throw or return partial. 
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

        // Expect it to resolve (stop gracefully) but log a warning
        await expect(generateExpandedNetwork(polyModel, () => { }, () => { }))
            .resolves.toBeDefined();

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringMatching(/maxIterations limit.*reached/i)
        );
    });

    it('should handle functional rate evaluation errors gracefully (warn and use 0)', async () => {
        const errorModel: BNGLModel = {
            ...baseModel,
            reactionRules: [{
                name: 'BrokenRate',
                rate: 'k_fail', // Undefined parameter
                reactants: ['A(l,r)'],
                products: ['A(l,r)'], // Null reaction effectively
                isBidirectional: false
            }],
            parameters: {},
            moleculeTypes: [],
            reactions: [],
        };

        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

        // Mock evaluateFunctionalRate to throw explicitly to simulate deep failure
        vi.spyOn(ExpressionEvaluator, 'evaluateFunctionalRate').mockImplementation(() => {
            throw new Error('Critical Math Error');
        });

        const result = await generateExpandedNetwork(errorModel, () => { }, () => { });

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Could not evaluate rate expression'),
            expect.anything(),
            expect.anything()
        );

        // Should have generated the rule with rate 0
        const rule = result.reactions.find(r => r.rateConstant === 0);
        expect(rule).toBeDefined();
    });
});
