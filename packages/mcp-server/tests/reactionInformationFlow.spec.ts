import { describe, expect, it } from 'vitest';
import { handleReactionInformationFlow } from '../src/handlers/reactionInformationFlow.js';

const LINEAR_CASCADE = `begin model
begin parameters
  k1  0.5
  k2  0.3
  k3  0.2
end parameters
begin molecule types
  A()
  B()
end molecule types
begin seed species
  A()  20
  B()  0
end seed species
begin observables
  Molecules  Acount  A()
  Molecules  Bcount  B()
end observables
begin reaction rules
  produce_A:  0 -> A()       k1
  A_to_B:     A() -> B()     k2
  consume_B:  B() -> 0       k3
end reaction rules
end model
`;

describe('reaction_information_flow handler', () => {
    it('produces a non-empty empirical causal graph for a linear cascade', async () => {
        const result = await handleReactionInformationFlow({
            code: LINEAR_CASCADE,
            t_end: 200,
            n_steps: 1000,
            seed: 42,
            n_shuffles: 50,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.summary.nFiringEvents).toBeGreaterThan(50);
        expect(body.entropy.length).toBe(3);
        expect(body.mutualInformation.length).toBeGreaterThanOrEqual(0);
        expect(body.transferEntropy.length).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(body.empiricalCausalGraph)).toBe(true);
    }, 60000);

    it('emits a warning when the firing count is too low for reliable IT estimation', async () => {
        const result = await handleReactionInformationFlow({
            code: LINEAR_CASCADE,
            t_end: 0.01,
            n_steps: 5,
            seed: 1,
        });
        const body = JSON.parse(result.content[0].text);
        expect(body.warning ?? body.error ?? '').toBeTruthy();
    }, 30000);

    it('returns structural comparison when requested', async () => {
        const result = await handleReactionInformationFlow({
            code: LINEAR_CASCADE,
            t_end: 200,
            n_steps: 1000,
            seed: 42,
            compare_structural_graph: true,
            n_shuffles: 50,
        });
        const body = JSON.parse(result.content[0].text);
        expect(body.structuralComparison).toBeDefined();
        expect(body.structuralComparison.nConcordant).toBeTypeOf('number');
        expect(body.structuralComparison.nEmergent).toBeTypeOf('number');
        expect(body.structuralComparison.nStructuralOnly).toBeTypeOf('number');
        expect(Array.isArray(body.structuralComparison.concordant)).toBe(true);
    }, 60000);

    it('rejects models with no reactions', async () => {
        const EMPTY_MODEL = `begin model
begin parameters
end parameters
begin molecule types
  X()
end molecule types
begin seed species
  X()  10
end seed species
begin observables
  Molecules  Xc  X()
end observables
begin reaction rules
end reaction rules
end model
`;
        const result = await handleReactionInformationFlow({
            code: EMPTY_MODEL,
            t_end: 10,
            n_steps: 10,
        });
        const body = JSON.parse(result.content[0].text);
        expect(body.error ?? body.message ?? JSON.stringify(body)).toMatch(/no reactions|no firings/i);
    });
});