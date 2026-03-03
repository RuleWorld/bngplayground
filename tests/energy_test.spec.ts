import { describe, it, expect } from 'vitest';
import { parseBNGLWithANTLR } from '../packages/engine/src/parser/BNGLParserWrapper';
import { NetworkGenerator } from '../packages/engine/src/services/graph/NetworkGenerator';
import { BNGLParser } from '../packages/engine/src/services/graph/core/BNGLParser';

describe('Energy Modeling and Arrhenius Rate Law', () => {
    it('should parse energy patterns and calculate Arrhenius rates correctly', async () => {
        const bngl = `
begin parameters
    phi 0.5
    Eact 10
end parameters

begin molecule types
    A()
    B()
end molecule types

begin seed species
    A() 1.0
end seed species

begin energy patterns
    A() 5
    B() 15
end energy patterns

begin reaction rules
    A() -> B() arrhenius(phi, Eact)
end reaction rules
`;

        const parseResult = parseBNGLWithANTLR(bngl);
        expect(parseResult.success).toBe(true);
        expect(parseResult.model).toBeDefined();
        
        const model = parseResult.model!;
        expect(model.energyPatterns).toHaveLength(2);
        expect(model.energyPatterns?.[0].value).toBe(5);
        expect(model.energyPatterns?.[1].value).toBe(15);
        
        const rule = model.reactionRules[0];
        expect(rule.isArrhenius).toBe(true);
        expect(rule.arrheniusPhi).toBe('phi');
        expect(rule.arrheniusEact).toBe('Eact');

        // Convert ReactionRule to RxnRule
        const seedSpecies = model.species.map(s => BNGLParser.parseSpeciesGraph(s.name));
        const rxnRules = model.reactionRules.map(r => {
            const rxnRule = BNGLParser.parseRxnRule(`${r.reactants.join('+')} -> ${r.products.join('+')}`, 0);
            rxnRule.isArrhenius = r.isArrhenius;
            rxnRule.arrheniusPhi = r.arrheniusPhi;
            rxnRule.arrheniusEact = r.arrheniusEact;
            return rxnRule;
        });

        const generator = new NetworkGenerator({
            energyPatterns: model.energyPatterns,
            parameters: new Map(Object.entries(model.parameters))
        });

        const { species, reactions } = await generator.generate(seedSpecies, rxnRules);

        expect(species).toHaveLength(2);
        expect(reactions).toHaveLength(1);

        const rxn = reactions[0];
        const G_reactants = 5;
        const G_products = 15;
        const deltaG = G_products - G_reactants; // 10
        const phi = 0.5;
        const Eact = 10;
        const expectedRate = Math.exp(-(Eact + phi * deltaG)); // exp(-15)

        expect(rxn.rate).toBeCloseTo(expectedRate, 10);
    });
});
