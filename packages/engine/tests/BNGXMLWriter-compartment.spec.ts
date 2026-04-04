import { describe, it, expect } from 'vitest';
import { BNGXMLWriter, parseBNGLStrict as parseBNGL } from '../src/index';
import type { BNGLModel } from '../src/types';

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
        expect(xml).toContain('<compartment id="C1"');
        expect(xml).toContain('<compartment id="C2"');

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

    describe('outside attribute on compartments', () => {
        it('emits outside attribute when compartment has a parent', () => {
            const model: BNGLModel = {
                name: 'nested_compartments',
                parameters: {},
                moleculeTypes: [{ name: 'A', components: [] }],
                compartments: [
                    { name: 'EC', dimension: 3, size: 1 },
                    { name: 'PM', dimension: 2, size: 1, parent: 'EC' },
                    { name: 'CP', dimension: 3, size: 1, parent: 'PM' }
                ],
                species: [{ name: 'A()', initialConcentration: 100 }],
                observables: [],
                reactionRules: [],
                reactions: [],
                functions: []
            };

            const xml = BNGXMLWriter.write(model);

            // EC has no parent — no outside attribute
            expect(xml).toMatch(/<compartment id="EC" spatialDimensions="3" size="1"\/>/);

            // PM has parent EC
            expect(xml).toMatch(/<compartment id="PM" spatialDimensions="2" size="1" outside="EC"\/>/);

            // CP has parent PM
            expect(xml).toMatch(/<compartment id="CP" spatialDimensions="3" size="1" outside="PM"\/>/);
        });

        it('omits outside attribute when no parent is defined', () => {
            const model: BNGLModel = {
                name: 'flat_compartments',
                parameters: {},
                moleculeTypes: [{ name: 'A', components: [] }],
                compartments: [
                    { name: 'C1', dimension: 3, size: 1 },
                    { name: 'C2', dimension: 3, size: 1 }
                ],
                species: [{ name: 'A()', initialConcentration: 100 }],
                observables: [],
                reactionRules: [],
                reactions: [],
                functions: []
            };

            const xml = BNGXMLWriter.write(model);

            expect(xml).not.toContain('outside=');
        });

        it('uses spatialDimensions attribute for BNG2 parity', () => {
            const model: BNGLModel = {
                name: 'dimension_check',
                parameters: {},
                moleculeTypes: [{ name: 'A', components: [] }],
                compartments: [
                    { name: 'C1', dimension: 2, size: 0.5 }
                ],
                species: [{ name: 'A()', initialConcentration: 100 }],
                observables: [],
                reactionRules: [],
                reactions: [],
                functions: []
            };

            const xml = BNGXMLWriter.write(model);

            expect(xml).toContain('spatialDimensions="2"');
            expect(xml).not.toContain('dimension=');
        });

        it('round-trips nested compartments from BNGL through BNGXMLWriter', () => {
            const bngl = `
begin parameters
end parameters
begin molecule types
    A()
end molecule types
begin compartments
    EC  3  1.0
    PM  2  1.0  EC
    CP  3  1.0  PM
end compartments
begin seed species
    A()@CP 100
end seed species
begin observables
end observables
begin reaction rules
end reaction rules
            `;

            const model = parseBNGL(bngl);
            const xml = BNGXMLWriter.write(model);

            expect(xml).toMatch(/<compartment id="EC" spatialDimensions="3" size="1"\/>/);
            expect(xml).toContain('outside="EC"');
            expect(xml).toContain('outside="PM"');
        });
    });

    describe('moveConnected attribute on ChangeCompartment', () => {
        it('emits moveConnected="1" when rule has moveConnected flag', () => {
            const model: BNGLModel = {
                name: 'move_connected_test',
                parameters: { k: 1 },
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
                        rate: 'k',
                        isBidirectional: false,
                        moveConnected: true
                    }
                ],
                reactions: [],
                functions: []
            };

            const xml = BNGXMLWriter.write(model);

            expect(xml).toMatch(/<ChangeCompartment id="RR1_RP1_M1" destination="C2" moveConnected="1"\/>/);
        });

        it('omits moveConnected when rule does not have the flag', () => {
            const model: BNGLModel = {
                name: 'no_move_connected',
                parameters: { k: 1 },
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
                        rate: 'k',
                        isBidirectional: false,
                        moveConnected: false
                    }
                ],
                reactions: [],
                functions: []
            };

            const xml = BNGXMLWriter.write(model);

            expect(xml).toContain('<ChangeCompartment');
            expect(xml).not.toContain('moveConnected');
        });

        it('emits moveConnected on both directions of bidirectional transport rule', () => {
            const model: BNGLModel = {
                name: 'bidi_move_connected',
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
                        isBidirectional: true,
                        moveConnected: true
                    }
                ],
                reactions: [],
                functions: []
            };

            const xml = BNGXMLWriter.write(model);

            // Both forward and reverse should have moveConnected
            const matches = xml.match(/moveConnected="1"/g);
            expect(matches).toHaveLength(2);
        });

        it('round-trips MoveConnected from BNGL through BNGXMLWriter', () => {
            const bngl = `
begin parameters
    k 1.0
end parameters
begin molecule types
    A()
end molecule types
begin compartments
    C1  3  1.0
    C2  3  1.0
end compartments
begin seed species
    A()@C1 100
end seed species
begin observables
    Molecules A_C1 A()@C1
    Molecules A_C2 A()@C2
end observables
begin reaction rules
    A()@C1 -> A()@C2 k MoveConnected
end reaction rules
            `;

            const model = parseBNGL(bngl);
            expect(model.reactionRules[0].moveConnected).toBe(true);

            const xml = BNGXMLWriter.write(model);
            expect(xml).toContain('moveConnected="1"');
        });
    });
});
