
import { describe, it, expect, beforeAll } from 'vitest';
import { generateExpandedNetwork } from '@bngplayground/engine';
import { loadEvaluator, _setEvaluatorRefForTests } from '@bngplayground/engine';
import { SafeExpressionEvaluator } from '@bngplayground/engine';
import { parseBNGLStrict } from '@bngplayground/engine';

describe('Debug Wnt Network Generation', () => {
    beforeAll(async () => {
        _setEvaluatorRefForTests(SafeExpressionEvaluator);
    });

    it('should parse and evaluate k_deg parameter correctly', async () => {
        const bngl = `
begin model
begin parameters
    k_deg 0.05
end parameters
begin molecule types
    BetaCatenin(loc~nuc)
    BetaCatenin(loc~cyto)
end molecule types
begin seed species
    BetaCatenin(loc~nuc) 1
end seed species
begin reaction rules
    BetaCatenin(loc~nuc) -> BetaCatenin(loc~cyto) k_deg
end reaction rules
end model
`;
        const model = parseBNGLStrict(bngl);

        console.log('Parsed Parameters:', model.parameters);
        expect(model.parameters['k_deg']).toBe(0.05);

        let progressCalled = false;
        const expanded = await generateExpandedNetwork(
            model,
            () => { },
            (p) => { progressCalled = true; }
        );

        console.log('Generated Reactions:', expanded.reactions);
        expect(expanded.reactions.length).toBeGreaterThan(0);
        expect(expanded.reactions[0].rateConstant).toBe(0.05);
    });
});
