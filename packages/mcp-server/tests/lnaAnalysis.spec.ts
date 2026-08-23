import { describe, expect, it } from 'vitest';
import { handleLnaAnalysis } from '../src/handlers/lnaAnalysis.js';

const BIRTH_DEATH_MODEL = `begin model
begin parameters
  k_prod  10.0
  k_deg   0.1
end parameters
begin molecule types
  X()
end molecule types
begin seed species
  X()  0
end seed species
begin observables
  Molecules  Xcount  X()
end observables
begin reaction rules
  birth: 0 -> X()       k_prod
  death: X() -> 0       k_deg
end reaction rules
end model
`;

const DIMERIZATION_MODEL = `begin model
begin parameters
  kf  0.001
  kr  0.1
end parameters
begin molecule types
  M(s)
end molecule types
begin seed species
  M(s)  100
end seed species
begin observables
  Molecules  Monomer  M(s)
  Molecules  Dimer    M(s!1).M(s!1)
end observables
begin reaction rules
  M(s) + M(s) <-> M(s!1).M(s!1)   kf, kr
end reaction rules
end model
`;

describe('lna_analysis handler — steady state', () => {
    it('recovers the Poisson result for birth-death (Fano≈1, CV≈1/√mean)', async () => {
        const result = await handleLnaAnalysis({
            code: BIRTH_DEATH_MODEL,
            mode: 'steady_state',
            volume: 1,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.mode).toBe('steady_state');
        expect(body.speciesNames).toContain('X()');

        const xIdx = body.speciesNames.indexOf('X()');
        expect(body.mean[xIdx]).toBeGreaterThan(99);
        expect(body.mean[xIdx]).toBeLessThan(101);

        expect(body.fano[xIdx]).toBeGreaterThan(0.9);
        expect(body.fano[xIdx]).toBeLessThan(1.1);

        expect(body.cv[xIdx]).toBeGreaterThan(0.08);
        expect(body.cv[xIdx]).toBeLessThan(0.12);
    }, 30000);

    it('returns a covariance matrix by default', async () => {
        const result = await handleLnaAnalysis({
            code: BIRTH_DEATH_MODEL,
            mode: 'steady_state',
        });
        const body = JSON.parse(result.content[0].text);
        expect(body.covariance).toBeDefined();
        expect(Array.isArray(body.covariance)).toBe(true);
    });

    it('omits covariance when include_covariance_matrix=false', async () => {
        const result = await handleLnaAnalysis({
            code: BIRTH_DEATH_MODEL,
            mode: 'steady_state',
            include_covariance_matrix: false,
        });
        const body = JSON.parse(result.content[0].text);
        expect(body.covariance).toBeUndefined();
    });

    it('handles multi-species models without crashing', async () => {
        const result = await handleLnaAnalysis({
            code: DIMERIZATION_MODEL,
            mode: 'steady_state',
        });
        const body = JSON.parse(result.content[0].text);
        expect(body.speciesNames.length).toBeGreaterThanOrEqual(2);
        expect(body.cv.every((v: number) => Number.isFinite(v))).toBe(true);
        expect(body.fano.every((v: number) => Number.isFinite(v))).toBe(true);
    }, 30000);
});

describe('lna_analysis handler — time course', () => {
    it('requires t_end when mode is time_course', async () => {
        const result = await handleLnaAnalysis({
            code: BIRTH_DEATH_MODEL,
            mode: 'time_course',
        });
        const body = JSON.parse(result.content[0].text);
        expect(body.error ?? body.message ?? JSON.stringify(body)).toMatch(/t_end/i);
    });

    it('produces means and variances of length n_steps+1', async () => {
        const result = await handleLnaAnalysis({
            code: BIRTH_DEATH_MODEL,
            mode: 'time_course',
            t_end: 50,
            n_steps: 20,
        });
        const body = JSON.parse(result.content[0].text);
        expect(body.mode).toBe('time_course');
        expect(body.times.length).toBeGreaterThanOrEqual(20);
        expect(body.means.length).toBe(body.times.length);
        expect(body.variances.length).toBe(body.times.length);

        const xIdx = body.speciesNames.indexOf('X()');
        expect(body.variances[0][xIdx]).toBeCloseTo(0, 3);
        expect(body.variances[body.variances.length - 1][xIdx]).toBeGreaterThan(0);
    }, 30000);
});

describe('lna_analysis handler — edge cases & robustness', () => {
    it('rejects empty or blank model code with a structured error', async () => {
        const result = await handleLnaAnalysis({
            code: '   ',
            mode: 'steady_state',
        });
        const body = JSON.parse(result.content[0].text);
        expect(body.error).toMatch(/must be a non-empty and non-blank string/i);
    });

    it('rejects malformed inputs / wrong types gracefully', async () => {
        // volume of wrong type
        const resultVal = await handleLnaAnalysis({
            code: BIRTH_DEATH_MODEL,
            mode: 'steady_state',
            volume: 'not-a-number' as any,
        });
        const bodyVal = JSON.parse(resultVal.content[0].text);
        expect(bodyVal.error).toMatch(/volume/i);

        // code of wrong type
        const resultCode = await handleLnaAnalysis({
            code: 12345 as any,
            mode: 'steady_state',
        });
        const bodyCode = JSON.parse(resultCode.content[0].text);
        expect(bodyCode.error).toMatch(/code/i);
    });

    it('handles garbage/unparseable BNGL code by returning structured parse error', async () => {
        const result = await handleLnaAnalysis({
            code: 'not even close to BNGL @#$%^&*',
            mode: 'steady_state',
        });
        const body = JSON.parse(result.content[0].text);
        expect(body.error).toMatch(/BNGL parse failed|has no reactions/i);
    });

    it('validates boundary conditions: non-positive volume or t_end is rejected', async () => {
        const resultVolume = await handleLnaAnalysis({
            code: BIRTH_DEATH_MODEL,
            mode: 'steady_state',
            volume: 0,
        });
        const bodyVolume = JSON.parse(resultVolume.content[0].text);
        expect(bodyVolume.error).toMatch(/volume/i);

        const resultTEnd = await handleLnaAnalysis({
            code: BIRTH_DEATH_MODEL,
            mode: 'time_course',
            t_end: -5,
        });
        const bodyTEnd = JSON.parse(resultTEnd.content[0].text);
        expect(bodyTEnd.error).toMatch(/t_end/i);
    });

    it('rejects model with zero reaction rules', async () => {
        const NO_RULES_MODEL = `begin model
begin parameters
end parameters
begin molecule types
  A()
end molecule types
begin seed species
  A() 10
end seed species
begin reaction rules
end reaction rules
end model
`;
        const result = await handleLnaAnalysis({
            code: NO_RULES_MODEL,
            mode: 'steady_state',
        });
        const body = JSON.parse(result.content[0].text);
        expect(body.error).toMatch(/has no reactions/i);
    });

    it('handles missing optional fields by falling back to default values', async () => {
        const result = await handleLnaAnalysis({
            code: BIRTH_DEATH_MODEL,
            // omitting mode (defaults to steady_state), volume (defaults to 1), include_covariance_matrix (defaults to true)
        });
        const body = JSON.parse(result.content[0].text);
        expect(body.mode).toBe('steady_state');
        expect(body.volume).toBe(1);
        expect(body.covariance).toBeDefined();
    });
});