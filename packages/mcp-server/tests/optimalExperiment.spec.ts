import { describe, expect, it, vi } from 'vitest';
import { handleOptimalExperiment } from '../src/handlers/optimalExperiment.js';
import * as engine from '@bngplayground/engine';

vi.mock('@bngplayground/engine', async (importOriginal) => {
  const original = await importOriginal<typeof import('@bngplayground/engine')>();
  return {
    ...original,
    analyzeOptimalExperiment: vi.fn(original.analyzeOptimalExperiment),
  };
});

const SATURATION_MODEL = `begin model
begin parameters
  L_total  10.0
  kf       0.1
  kr       0.5
  R_total  100
end parameters
begin molecule types
  L(r)
  R(l)
end molecule types
begin seed species
  L(r)  L_total
  R(l)  R_total
end seed species
begin observables
  Molecules  Bound   L(r!1).R(l!1)
  Molecules  FreeR   R(l)
end observables
begin reaction rules
  L(r) + R(l) <-> L(r!1).R(l!1)  kf, kr
end reaction rules
end model
`;

describe('optimal_experiment handler', () => {
    it('produces experiment recommendations for valid input', async () => {
        const result = await handleOptimalExperiment({
            code: SATURATION_MODEL,
            observables: ['Bound'],
            candidate_times: [10, 20, 30],
            n_samples: 5,
            t_end: 50,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.recommendations).toBeDefined();
        expect(Array.isArray(body.recommendations)).toBe(true);
        expect(body.recommendations.length).toBe(1);
        expect(body.recommendations[0].observable).toBe('Bound');
        expect(body.recommendations[0].suggested_times).toEqual([10, 20, 30]);
        expect(['high', 'moderate', 'low']).toContain(body.recommendations[0].expected_identifiability);
        expect(body.recommendations[0].rationale).toBeDefined();
        expect(body.summary).toMatch(/Analyzed 1 observables across 3 candidate timepoints/i);
    }, 30000);

    it('handles default values when observables and candidate_times are omitted', async () => {
        const result = await handleOptimalExperiment({
            code: SATURATION_MODEL,
            t_end: 10,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.recommendations).toBeDefined();
        expect(body.recommendations.length).toBeGreaterThan(0);
        expect(body.summary).toMatch(/Analyzed \d+ observables across \d+ candidate timepoints/i);
    }, 30000);

    it('handles empty or blank code input gracefully', async () => {
        const result = await handleOptimalExperiment({
            code: '   ',
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.recommendations).toBeDefined();
        expect(body.recommendations).toEqual([]);
    });

    it('handles invalid model code without crashing', async () => {
        const result = await handleOptimalExperiment({
            code: 'nonsense code',
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.recommendations).toBeDefined();
        expect(body.recommendations).toEqual([]);
    });
});
