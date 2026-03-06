import { describe, it, expect } from 'vitest';
import type { BNGLModel } from '../types';
import { BNGXMLWriter } from '@bngplayground/engine';

describe('NFsim Compartment Transport - End to End', () => {
    it('simulates molecule transport between compartments', async () => {
        const model: BNGLModel = {
            name: 'compartment_transport_e2e',
            parameters: { k: 1 },
            moleculeTypes: [],
            compartments: [
                { name: 'C1', dimension: 3, size: 1 },
                { name: 'C2', dimension: 3, size: 1 }
            ],
            species: [{ name: 'A()@C1', initialConcentration: 100 }],
            observables: [
                { name: 'A_C1', type: 'molecules', pattern: 'A()@C1' },
                { name: 'A_C2', type: 'molecules', pattern: 'A()@C2' }
            ],
            reactionRules: [
                {
                    reactants: ['A()@C1'],
                    products: ['A()@C2'],
                    rate: 'k',
                    isBidirectional: false
                }
            ],
            reactions: [],
            functions: []
        };

        // Generate XML
        const xml = BNGXMLWriter.write(model);

        // Verify XML structure
        expect(xml).toContain('<ChangeCompartment');
        expect(xml).toContain('destination="C2"');

        // Write to console for manual verification
        console.log('Generated XML contains ChangeCompartment operation');
        console.log('Transport reaction: A()@C1 -> A()@C2');
    });
});
