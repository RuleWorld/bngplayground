
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as Engine from '@bngplayground/engine';
import { BNGLModel } from '../../types';

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

        // Expansion still stops gracefully at max_iter and resolves with what it
        // built. The truncation is reported through the result, not console
        // output: console text is incidental and was never a contract callers
        // could read.
        const result = await Engine.generateExpandedNetwork(polyModel, () => { }, () => { });

        expect(result.networkComplete).toBe(false);
        expect(result.networkWarning).toMatch(/iterations limit/i);
    });

    it('should handle functional rate evaluation errors gracefully by skipping the invalid rule', async () => {
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
        vi.spyOn(Engine, 'evaluateFunctionalRate').mockImplementation(() => {
            throw new Error('Critical Math Error');
        });

        const result = await Engine.generateExpandedNetwork(errorModel, () => { }, () => { });

        // Current behavior is to suppress the invalid rule rather than emit a zero-rate reaction.
        expect(result).toBeDefined();
        expect(result.reactions).toHaveLength(0);
        expect(consoleSpy).not.toHaveBeenCalled();
    });
});
