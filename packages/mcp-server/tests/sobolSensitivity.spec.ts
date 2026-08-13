import { describe, expect, it } from 'vitest';
import { handleSobolSensitivity } from '../src/handlers/sobolSensitivity.js';

const SIMPLE_MODEL = `begin model
begin parameters
  kf 0.1
  kr 0.01
end parameters
begin molecule types
  A(s)
  B(s)
end molecule types
begin seed species
  A(s) 100
  B(s) 100
end seed species
begin observables
  Molecules Cplx A(s!1).B(s!1)
  Molecules FreeA A(s)
end observables
begin reaction rules
  A(s) + B(s) <-> A(s!1).B(s!1) kf, kr
end reaction rules
end model
`;

describe('sobol_sensitivity handler', () => {
    it('succeeds on a valid model with minimum required options', async () => {
        const result = await handleSobolSensitivity({
            code: SIMPLE_MODEL,
            parameters: [
                { name: 'kf', min: 0.01, max: 0.5 },
                { name: 'kr', min: 0.001, max: 0.05 },
            ],
            n_samples: 5,
            n_bootstrap: 5,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body).toBeDefined();
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBeGreaterThan(0);

        const firstObsResult = body[0];
        expect(firstObsResult.observable).toBeDefined();
        expect(firstObsResult.firstOrder).toBeDefined();
        expect(firstObsResult.totalOrder).toBeDefined();
        expect(firstObsResult.totalVariance).toBeDefined();
        expect(firstObsResult.nSimulations).toBe(20); // 5 * (2 + 2)
    });

    it('handles missing optional fields by falling back to defaults', async () => {
        const result = await handleSobolSensitivity({
            code: SIMPLE_MODEL,
            parameters: [
                { name: 'kf', min: 0.01, max: 0.5 },
            ],
            n_samples: 4,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body).toBeDefined();
        expect(Array.isArray(body)).toBe(true);
        expect(body[0].firstOrder.length).toBe(1);
    });

    it('rejects empty or blank model code', async () => {
        const result = await handleSobolSensitivity({
            code: '   ',
            parameters: [
                { name: 'kf', min: 0.01, max: 0.5 },
            ],
            n_samples: 5,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.error ?? body.message ?? JSON.stringify(body)).toMatch(/non-empty string/i);
    });

    it('rejects empty parameters array', async () => {
        const result = await handleSobolSensitivity({
            code: SIMPLE_MODEL,
            parameters: [],
            n_samples: 5,
        });

        const body = JSON.parse(result.content[0].text);
        const errStr = body.error ?? body.message ?? JSON.stringify(body);
        expect(errStr).toMatch(/Invalid arguments for sobol_sensitivity|non-empty/i);
    });

    it('rejects wrong types in arguments via Zod validation', async () => {
        const result = await handleSobolSensitivity({
            code: SIMPLE_MODEL,
            parameters: 'not-an-array' as unknown as Array<{ name: string; min: number; max: number }>,
            n_samples: 5,
        });

        const body = JSON.parse(result.content[0].text);
        const errStr = body.error ?? body.message ?? JSON.stringify(body);
        expect(errStr).toMatch(/Invalid arguments for sobol_sensitivity|Expected array/i);
    });

    it('rejects non-existent parameters in the model', async () => {
        const result = await handleSobolSensitivity({
            code: SIMPLE_MODEL,
            parameters: [
                { name: 'non_existent_param', min: 0.01, max: 0.5 },
            ],
            n_samples: 5,
        });

        const body = JSON.parse(result.content[0].text);
        const errStr = body.error ?? body.message ?? JSON.stringify(body);
        expect(errStr).toMatch(/Unknown Sobol parameters/i);
    });

    it('rejects invalid parameter bounds where min >= max', async () => {
        const result = await handleSobolSensitivity({
            code: SIMPLE_MODEL,
            parameters: [
                { name: 'kf', min: 0.5, max: 0.1 },
            ],
            n_samples: 5,
        });

        const body = JSON.parse(result.content[0].text);
        const errStr = body.error ?? body.message ?? JSON.stringify(body);
        expect(errStr).toMatch(/Invalid Sobol parameter bounds/i);
    });

    it('rejects non-existent observables in request', async () => {
        const result = await handleSobolSensitivity({
            code: SIMPLE_MODEL,
            parameters: [
                { name: 'kf', min: 0.01, max: 0.5 },
            ],
            observables: ['NoSuchObservable'],
            n_samples: 5,
        });

        const body = JSON.parse(result.content[0].text);
        const errStr = body.error ?? body.message ?? JSON.stringify(body);
        expect(errStr).toMatch(/Unknown Sobol observables/i);
    });

    it('rejects invalid non-positive sample parameters via schema', async () => {
        const result = await handleSobolSensitivity({
            code: SIMPLE_MODEL,
            parameters: [
                { name: 'kf', min: 0.01, max: 0.5 },
            ],
            n_samples: -10,
        });

        const body = JSON.parse(result.content[0].text);
        const errStr = body.error ?? body.message ?? JSON.stringify(body);
        expect(errStr).toMatch(/Invalid arguments for sobol_sensitivity|Number must be greater than 0/i);
    });
});
