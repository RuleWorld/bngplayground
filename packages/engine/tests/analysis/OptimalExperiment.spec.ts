import { describe, expect, it } from 'vitest';
import { analyzeOptimalExperiment } from '../../src/services/analysis/OptimalExperiment';
import { parseBNGLWithANTLR } from '../../src/parser/BNGLParserWrapper';
import { generateExpandedNetwork } from '../../src/services/simulation/NetworkExpansion';

const DECAY_MODEL = `begin model
begin parameters
  k 0.1
end parameters
begin molecule types
  A()
end molecule types
begin seed species
  A() 100
end seed species
begin observables
  Molecules A_tot A()
end observables
begin reaction rules
  A() -> 0 k
end reaction rules
end model
`;

describe('analyzeOptimalExperiment engine service', () => {
    it('selects timepoints with highest rate of change for dynamic observables', async () => {
        const parsed = parseBNGLWithANTLR(DECAY_MODEL);
        expect(parsed.success).toBe(true);
        const model = parsed.model!;
        const expanded = await generateExpandedNetwork(model, () => {}, () => {});

        // Candidate times from early (high slope) to late (plateau near 0)
        const candidateTimes = [0, 5, 10, 20, 50, 100];

        const result = await analyzeOptimalExperiment({
            model,
            expandedModel: expanded,
            observables: ['A_tot'],
            candidateTimes,
            nSamples: 20,
            method: 'ode',
            tEnd: 100,
        });

        expect(result.recommendations).toHaveLength(1);
        const rec = result.recommendations[0];
        expect(rec.observable).toBe('A_tot');
        expect(rec.suggested_times).toHaveLength(3);
        // Times with highest rate of change / magnitude should be selected (earlier time points)
        expect(rec.suggested_times[0]).toBeLessThan(rec.suggested_times[1]);
        expect(rec.suggested_times[1]).toBeLessThan(rec.suggested_times[2]);
        // The earliest candidate times have the steepest slope for first order decay
        expect(rec.suggested_times).toContain(0);
        expect(rec.suggested_times).toContain(5);
    });

    it('works with default clone/rate functions when optional callbacks are omitted', async () => {
        const parsed = parseBNGLWithANTLR(DECAY_MODEL);
        const model = parsed.model!;
        const expanded = await generateExpandedNetwork(model, () => {}, () => {});

        const result = await analyzeOptimalExperiment({
            model,
            expandedModel: expanded,
            observables: ['A_tot'],
            candidateTimes: [10, 20, 30],
            nSamples: 10,
            method: 'ode',
            tEnd: 50,
        });

        expect(result.summary).toContain('Analyzed 1 observables across 3 candidate timepoints');
        expect(result.recommendations[0].suggested_times).toEqual([10, 20, 30]);
    });
});
