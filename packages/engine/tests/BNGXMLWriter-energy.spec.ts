import { describe, it, expect } from 'vitest';
import { BNGXMLWriter, parseBNGLStrict as parseBNGL } from '../src/index';
import type { BNGLModel } from '../src/types';

describe('BNGXMLWriter - Energy Patterns', () => {
    it('emits ListOfEnergyPatterns for a model with energy patterns', () => {
        const model: BNGLModel = {
            name: 'energy_model',
            parameters: { Gf_AB: 5.0, kf: 1.0 },
            moleculeTypes: [
                { name: 'A', components: ['b'] },
                { name: 'B', components: ['a'] }
            ],
            compartments: [],
            species: [
                { name: 'A(b)', initialConcentration: 100 },
                { name: 'B(a)', initialConcentration: 100 }
            ],
            observables: [
                { name: 'AB', type: 'Molecules', pattern: 'A(b!1).B(a!1)' }
            ],
            reactionRules: [
                {
                    reactants: ['A(b)', 'B(a)'],
                    products: ['A(b!1).B(a!1)'],
                    rate: 'kf',
                    isBidirectional: false
                }
            ],
            energyPatterns: [
                { name: 'ep_AB', pattern: 'A(b!1).B(a!1)', expression: 'Gf_AB', value: 5.0 }
            ],
            reactions: [],
            functions: []
        };

        const xml = BNGXMLWriter.write(model);

        // Verify ListOfEnergyPatterns is present
        expect(xml).toContain('<ListOfEnergyPatterns>');
        expect(xml).toContain('</ListOfEnergyPatterns>');

        // Verify EnergyPattern element with correct attributes
        expect(xml).toContain('<EnergyPattern id="EP1"');
        expect(xml).toContain('expression="Gf_AB"');

        // Verify nested Pattern with molecules and bonds
        expect(xml).toContain('<Pattern id="EP1_P1">');
        expect(xml).toContain('<ListOfMolecules>');
        expect(xml).toContain('<Molecule');
        expect(xml).toContain('name="A"');
        expect(xml).toContain('name="B"');
        expect(xml).toContain('<ListOfBonds>');
    });

    it('emits multiple energy patterns in order', () => {
        const model: BNGLModel = {
            name: 'multi_energy',
            parameters: { Gf_AB: 5.0, Gf_AC: 3.0 },
            moleculeTypes: [
                { name: 'A', components: ['b', 'c'] },
                { name: 'B', components: ['a'] },
                { name: 'C', components: ['a'] }
            ],
            compartments: [],
            species: [
                { name: 'A(b,c)', initialConcentration: 100 },
                { name: 'B(a)', initialConcentration: 100 },
                { name: 'C(a)', initialConcentration: 100 }
            ],
            observables: [],
            reactionRules: [],
            energyPatterns: [
                { pattern: 'A(b!1).B(a!1)', expression: 'Gf_AB', value: 5.0 },
                { pattern: 'A(c!1).C(a!1)', expression: 'Gf_AC', value: 3.0 }
            ],
            reactions: [],
            functions: []
        };

        const xml = BNGXMLWriter.write(model);

        expect(xml).toContain('<EnergyPattern id="EP1"');
        expect(xml).toContain('expression="Gf_AB"');
        expect(xml).toContain('<EnergyPattern id="EP2"');
        expect(xml).toContain('expression="Gf_AC"');
    });

    it('omits ListOfEnergyPatterns when model has no energy patterns', () => {
        const model: BNGLModel = {
            name: 'no_energy',
            parameters: { k: 1 },
            moleculeTypes: [{ name: 'A', components: [] }],
            compartments: [],
            species: [{ name: 'A()', initialConcentration: 100 }],
            observables: [],
            reactionRules: [],
            reactions: [],
            functions: []
        };

        const xml = BNGXMLWriter.write(model);

        expect(xml).not.toContain('ListOfEnergyPatterns');
        expect(xml).not.toContain('EnergyPattern');
    });

    it('places ListOfEnergyPatterns after ListOfFunctions and before </model>', () => {
        const model: BNGLModel = {
            name: 'ordering_test',
            parameters: { Gf_AB: 5.0 },
            moleculeTypes: [
                { name: 'A', components: ['b'] },
                { name: 'B', components: ['a'] }
            ],
            compartments: [],
            species: [{ name: 'A(b)', initialConcentration: 100 }],
            observables: [],
            reactionRules: [],
            energyPatterns: [
                { pattern: 'A(b!1).B(a!1)', expression: 'Gf_AB' }
            ],
            reactions: [],
            functions: []
        };

        const xml = BNGXMLWriter.write(model);

        const functionsEnd = xml.indexOf('</ListOfFunctions>');
        const energyStart = xml.indexOf('<ListOfEnergyPatterns>');
        const modelEnd = xml.indexOf('</model>');

        expect(functionsEnd).toBeGreaterThan(-1);
        expect(energyStart).toBeGreaterThan(-1);
        expect(modelEnd).toBeGreaterThan(-1);
        expect(functionsEnd).toBeLessThan(energyStart);
        expect(energyStart).toBeLessThan(modelEnd);
    });

    it('escapes special XML characters in expression', () => {
        const model: BNGLModel = {
            name: 'escape_test',
            parameters: {},
            moleculeTypes: [{ name: 'A', components: ['b'] }],
            compartments: [],
            species: [{ name: 'A(b)', initialConcentration: 100 }],
            observables: [],
            reactionRules: [],
            energyPatterns: [
                { pattern: 'A(b)', expression: 'G&F<1>' }
            ],
            reactions: [],
            functions: []
        };

        const xml = BNGXMLWriter.write(model);

        // Expression should be XML-escaped
        expect(xml).toContain('expression="G&amp;F&lt;1&gt;"');
    });

    it('round-trips a parsed eBNGL model through BNGXMLWriter', () => {
        const bngl = `
begin parameters
    Gf_AB  5.0
    kf     1.0
    kr     0.1
end parameters

begin molecule types
    A(b)
    B(a)
end molecule types

begin seed species
    A(b) 100
    B(a) 100
end seed species

begin energy patterns
    A(b!1).B(a!1)  Gf_AB
end energy patterns

begin reaction rules
    A(b) + B(a) <-> A(b!1).B(a!1) kf, kr
end reaction rules

begin observables
    Molecules AB A(b!1).B(a!1)
end observables
        `;

        const model = parseBNGL(bngl);
        const xml = BNGXMLWriter.write(model);

        // Verify energy patterns were parsed and serialized
        expect(xml).toContain('<ListOfEnergyPatterns>');
        expect(xml).toContain('<EnergyPattern id="EP1"');
        expect(xml).toContain('expression="Gf_AB"');
        expect(xml).toContain('<Pattern id="EP1_P1">');
        expect(xml).toContain('<ListOfMolecules>');
        expect(xml).toContain('<ListOfBonds>');
        expect(xml).toContain('</ListOfEnergyPatterns>');
    });
});
