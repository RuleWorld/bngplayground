import { describe, it, expect } from 'vitest';
import { BNGXMLWriter } from '@bngplayground/engine';
import type { BNGLModel } from '../../types';

describe('BNGXMLWriter - Compartment Transport', () => {
    it('generates ChangeCompartment operation for molecule transport between compartments', () => {
        const model: BNGLModel = {
            name: 'compartment_transport',
            parameters: { k: 1 },
            moleculeTypes: [],
            compartments: [
                { name: 'C1', dimension: 3, size: 1 },
                { name: 'C2', dimension: 3, size: 1 }
            ],
            species: [
                { name: 'A()@C1', initialConcentration: 100 }
            ],
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

        const xml = BNGXMLWriter.write(model);

        // Verify XML contains compartments
        expect(xml).toContain('<Compartment id="C1"');
        expect(xml).toContain('<Compartment id="C2"');

        // Verify XML contains ChangeCompartment operation
        expect(xml).toContain('<ChangeCompartment');
        expect(xml).toContain('destination="C2"');

        // Verify the operation references the correct molecule
        expect(xml).toContain('<ListOfOperations>');
        expect(xml).toMatch(/<ChangeCompartment id="RR1_RP1_M1" destination="C2"\/>/);
    });

    it('does not generate ChangeCompartment when compartments are the same', () => {
        const model: BNGLModel = {
            name: 'no_transport',
            parameters: { k: 1 },
            moleculeTypes: [],
            compartments: [{ name: 'C1', dimension: 3, size: 1 }],
            species: [{ name: 'A()@C1', initialConcentration: 100 }],
            observables: [],
            reactionRules: [
                {
                    reactants: ['A()@C1'],
                    products: ['A()@C1'],
                    rate: 'k',
                    isBidirectional: false
                }
            ],
            functions: [],
            reactions: []
        };

        const xml = BNGXMLWriter.write(model);

        // Should not contain ChangeCompartment since compartment doesn't change
        expect(xml).not.toContain('<ChangeCompartment');
    });

    it('generates ChangeCompartment for bidirectional transport', () => {
        const model: BNGLModel = {
            name: 'bidirectional_transport',
            parameters: { kf: 1, kr: 0.5 },
            moleculeTypes: [],
            compartments: [
                { name: 'C1', dimension: 3, size: 1 },
                { name: 'C2', dimension: 3, size: 1 }
            ],
            species: [{ name: 'A()@C1', initialConcentration: 100 }],
            observables: [],
            reactionRules: [
                {
                    reactants: ['A()@C1'],
                    products: ['A()@C2'],
                    rate: 'kf',
                    reverseRate: 'kr',
                    isBidirectional: true
                }
            ],
            functions: [],
            reactions: []
        };

        const xml = BNGXMLWriter.write(model);

        // Should contain two reaction rules (forward and reverse)
        expect(xml).toContain('id="RR1"');
        expect(xml).toContain('id="RR1_rev"');

        // Both should have ChangeCompartment operations
        expect(xml).toMatch(/<ChangeCompartment id="RR1_RP1_M1" destination="C2"\/>/);
        expect(xml).toMatch(/<ChangeCompartment id="RR1_rev_RP1_M1" destination="C1"\/>/);
    });

    it('handles complex molecules with state changes and compartment changes', () => {
        const model: BNGLModel = {
            name: 'complex_transport',
            parameters: { k: 1 },
            moleculeTypes: [],
            compartments: [
                { name: 'C1', dimension: 3, size: 1 },
                { name: 'C2', dimension: 3, size: 1 }
            ],
            species: [{ name: 'A(s~0)@C1', initialConcentration: 100 }],
            observables: [],
            reactionRules: [
                {
                    reactants: ['A(s~0)@C1'],
                    products: ['A(s~1)@C2'],
                    rate: 'k',
                    isBidirectional: false
                }
            ],
            functions: [],
            reactions: []
        };

        const xml = BNGXMLWriter.write(model);

        // Should contain both StateChange AND ChangeCompartment
        expect(xml).toContain('<StateChange');
        expect(xml).toContain('finalState="1"');
        expect(xml).toContain('<ChangeCompartment');
        expect(xml).toContain('destination="C2"');
    });
});
