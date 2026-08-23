import { describe, expect, it } from 'vitest';
import { handleOptimalExperiment } from '../src/handlers/optimalExperiment.js';

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

const SIMPLE_MODEL = `begin model
begin parameters
  k 1.0
end parameters
begin molecule types
  A()
end molecule types
begin seed species
  A() 10
end seed species
begin observables
  Molecules Atot A()
end observables
begin reaction rules
  A() -> 0 k
end reaction rules
end model
`;

const NO_OBS_MODEL = `begin model
begin parameters
  k 1.0
end parameters
begin molecule types
  A()
end molecule types
begin seed species
  A() 10
end seed species
begin reaction rules
  A() -> 0 k
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

        const body = result.structuredContent as any;
        expect(body.recommendations).toHaveLength(1);
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

        const body = result.structuredContent as any;
        expect(body.recommendations.length).toBeGreaterThan(0);
        expect(body.summary).toMatch(/Analyzed \d+ observables across \d+ candidate timepoints/i);
    }, 30000);

    it('succeeds on a valid model with default optional fields', async () => {
        const result = await handleOptimalExperiment({ code: SIMPLE_MODEL });
        expect(result.structuredContent).toBeDefined();
        const content = result.structuredContent as any;
        expect(content.recommendations).toHaveLength(1);
        expect(content.recommendations[0].observable).toBe('Atot');
    });

    it('handles malformed inputs (wrong types)', async () => {
        const result = await handleOptimalExperiment({ code: 12345 as any });
        expect(result.structuredContent).toBeDefined();
        const content = result.structuredContent as any;
        expect(content.error).toContain('Invalid input: expected string, received number');
    });

    it('rejects empty or whitespace-only code strings', async () => {
        const result = await handleOptimalExperiment({ code: '   ' });
        expect(result.structuredContent).toBeDefined();
        const content = result.structuredContent as any;
        expect(content.error).toContain('Model code must be a non-empty string.');
    });

    it('rejects garbage / unparseable BNGL code', async () => {
        const result = await handleOptimalExperiment({ code: 'NOT_VALID_BNGL @#$%' });
        expect(result.structuredContent).toBeDefined();
        const content = result.structuredContent as any;
        expect(content.error).toMatch(/BNGL parse failed|no observables|does not define any observables/i);
    });

    it('rejects model with no defined observables when no explicit observables are specified', async () => {
        const result = await handleOptimalExperiment({ code: NO_OBS_MODEL });
        expect(result.structuredContent).toBeDefined();
        const content = result.structuredContent as any;
        expect(content.error).toContain('Model does not define any observables to analyze for optimal design.');
    });

    it('rejects requested observables not in model', async () => {
        const result = await handleOptimalExperiment({
            code: SIMPLE_MODEL,
            observables: ['NON_EXISTENT_OBS'],
        });
        expect(result.structuredContent).toBeDefined();
        const content = result.structuredContent as any;
        expect(content.error).toContain('observables references names not defined in model: NON_EXISTENT_OBS');
    });

    it('rejects non-positive or non-finite values in candidate_times', async () => {
        const result = await handleOptimalExperiment({
            code: SIMPLE_MODEL,
            candidate_times: [-10, 20],
        });
        expect(result.structuredContent).toBeDefined();
        const content = result.structuredContent as any;
        expect(content.error).toContain('candidate_times must contain only positive finite numbers.');
    });

    it('rejects non-positive t_end', async () => {
        const result = await handleOptimalExperiment({
            code: SIMPLE_MODEL,
            t_end: -5,
        });
        expect(result.structuredContent).toBeDefined();
        const content = result.structuredContent as any;
        expect(content.error).toContain('Invalid arguments for optimal_experiment: t_end: Too small');
    });
});
