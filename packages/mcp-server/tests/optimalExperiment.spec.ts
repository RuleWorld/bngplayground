import { describe, expect, it } from 'vitest';
import { handleOptimalExperiment } from '../src/handlers/optimalExperiment.js';

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

describe('optimal_experiment handler — edge cases & robustness', () => {
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
