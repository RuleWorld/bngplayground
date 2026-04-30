import { describe, expect, it } from 'vitest';
import { handleDoseResponse } from '../src/handlers/doseResponse.js';

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

describe('dose_response handler', () => {
    it('produces a response curve with at least nPoints entries', async () => {
        const result = await handleDoseResponse({
            code: SATURATION_MODEL,
            input_parameter: 'L_total',
            input_min: 0.1,
            input_max: 1000,
            observables: ['Bound'],
            n_points: 20,
            log_scale: true,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.inputParameter).toBe('L_total');
        expect(Array.isArray(body.curves)).toBe(true);
        expect(body.curves.length).toBe(1);
        expect(body.curves[0].observable).toBe('Bound');
        expect(body.curves[0].doses.length).toBe(20);
        expect(body.curves[0].responses.length).toBe(20);
    }, 30000);

    it('rejects unknown input_parameter with a structured error', async () => {
        const result = await handleDoseResponse({
            code: SATURATION_MODEL,
            input_parameter: 'NotARealParam',
            input_min: 0.1,
            input_max: 10,
            observables: ['Bound'],
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.error ?? body.message ?? JSON.stringify(body)).toMatch(/not declared|not.*model\.parameters/i);
    });

    it('rejects inverted dose range', async () => {
        const result = await handleDoseResponse({
            code: SATURATION_MODEL,
            input_parameter: 'L_total',
            input_min: 100,
            input_max: 1,
            observables: ['Bound'],
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.error ?? body.message ?? JSON.stringify(body)).toMatch(/input_min.*less than|strictly less/i);
    });

    it('returns monotonically non-decreasing response for saturation binding', async () => {
        const result = await handleDoseResponse({
            code: SATURATION_MODEL,
            input_parameter: 'L_total',
            input_min: 0.1,
            input_max: 1000,
            observables: ['Bound'],
            n_points: 15,
            log_scale: true,
        });

        const body = JSON.parse(result.content[0].text);
        const responses: number[] = body.curves[0].responses;
        for (let i = 1; i < responses.length; i++) {
            expect(responses[i]).toBeGreaterThanOrEqual(responses[i - 1] - 0.1);
        }
    }, 30000);

      it('supports simulate method and returns non-empty curves', async () => {
        const result = await handleDoseResponse({
          code: SATURATION_MODEL,
          input_parameter: 'L_total',
          input_min: 0.1,
          input_max: 1000,
          observables: ['Bound'],
          method: 'simulate',
          n_points: 12,
          t_end: 100,
          log_scale: true,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.methodUsed).toBe('simulate');
        expect(body.curves[0].doses.length).toBeGreaterThan(0);
        expect(body.curves[0].responses.length).toBe(body.curves[0].doses.length);
      }, 30000);
});