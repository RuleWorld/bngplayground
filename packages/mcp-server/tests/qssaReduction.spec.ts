import { describe, expect, it } from 'vitest';
import { handleQssaReduction } from '../src/handlers/qssaReduction.js';

const MM_MODEL = `begin model
begin parameters
  kf     100.0
  kr     100.0
  kcat     1.0
end parameters
begin molecule types
  E(s)
  S(s)
  P()
end molecule types
begin seed species
  E(s)  10
  S(s)  1000
  P()   0
end seed species
begin observables
  Molecules  FreeE  E(s)
  Molecules  FreeS  S(s)
  Molecules  ES     E(s!1).S(s!1)
  Molecules  Prod   P()
end observables
begin reaction rules
  binding:    E(s) + S(s) <-> E(s!1).S(s!1)  kf, kr
  catalysis:  E(s!1).S(s!1) -> E(s) + P()    kcat
end reaction rules
end model
`;

const UNIFORM_RATES_MODEL = `begin model
begin parameters
  k1  1.0
  k2  1.0
  k3  1.0
end parameters
begin molecule types
  A()
  B()
  C()
end molecule types
begin seed species
  A()  10
  B()  0
  C()  0
end seed species
begin observables
  Molecules  Ac  A()
  Molecules  Bc  B()
  Molecules  Cc  C()
end observables
begin reaction rules
  A() -> B()  k1
  B() -> C()  k2
  C() -> A()  k3
end reaction rules
end model
`;

describe('qssa_reduction handler — analyze mode', () => {
    it('identifies candidates in a fast-slow separated MM model', async () => {
        const result = await handleQssaReduction({
            code: MM_MODEL,
            mode: 'analyze',
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.mode).toBe('analyze');
        expect(body.summary).toBeDefined();
        expect(Array.isArray(body.candidates)).toBe(true);
        const recommendations = body.candidates.map((c: { recommendation: string }) => c.recommendation);
        expect(recommendations).toContain('QSSA');
    });

    it('reports zero QSSA candidates for uniform-rate models', async () => {
        const result = await handleQssaReduction({
            code: UNIFORM_RATES_MODEL,
            mode: 'analyze',
            fast_slow_threshold: 100,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.mode).toBe('analyze');
        expect(body.summary.nRecommendedForQssa).toBe(0);
    });

    it('returns a speedup estimate when generate_reduced_model=true', async () => {
        const result = await handleQssaReduction({
            code: MM_MODEL,
            mode: 'analyze',
            generate_reduced_model: true,
        });

        const body = JSON.parse(result.content[0].text);
        if (body.summary.nRecommendedForQssa > 0) {
            expect(body.estimate).toBeDefined();
            expect(body.estimate.estimatedSpeedup).toBeGreaterThan(0);
        }
    });
});

describe('qssa_reduction handler — apply mode', () => {
    it('rejects apply mode without species_to_eliminate', async () => {
        const result = await handleQssaReduction({
            code: MM_MODEL,
            mode: 'apply',
        });
        const body = JSON.parse(result.content[0].text);
        expect(body.error ?? body.message ?? body.issues ?? JSON.stringify(body))
            .toMatch(/species_to_eliminate|non-empty/i);
    });

    it('rejects apply mode referencing unknown species', async () => {
        const result = await handleQssaReduction({
            code: MM_MODEL,
            mode: 'apply',
            species_to_eliminate: ['NotInModel()'],
        });
        const body = JSON.parse(result.content[0].text);
        expect(body.error ?? body.message ?? JSON.stringify(body))
            .toMatch(/species not in model|not.*in model|Available species/i);
    });

    it('rejects empty or blank model code', async () => {
        // Empty code
        const resultEmpty = await handleQssaReduction({
            code: '',
            mode: 'analyze',
        });
        const bodyEmpty = JSON.parse(resultEmpty.content[0].text);
        expect(bodyEmpty.error ?? bodyEmpty.message ?? JSON.stringify(bodyEmpty)).toMatch(/Model code must be a non-empty string/i);

        // Blank code
        const resultBlank = await handleQssaReduction({
            code: '   ',
            mode: 'analyze',
        });
        const bodyBlank = JSON.parse(resultBlank.content[0].text);
        expect(bodyBlank.error ?? bodyBlank.message ?? JSON.stringify(bodyBlank)).toMatch(/Model code must be a non-empty string/i);
    });

    it('returns structured error on garbage code', async () => {
        const result = await handleQssaReduction({
            code: 'invalid garbage text #@$',
            mode: 'analyze',
        });
        const body = JSON.parse(result.content[0].text);
        expect(body.error ?? body.message ?? JSON.stringify(body)).toMatch(/BNGL parse failed|at least one species/i);
    });

    it('rejects species_to_eliminate containing empty or blank strings', async () => {
        // Empty string
        const resultEmpty = await handleQssaReduction({
            code: MM_MODEL,
            mode: 'apply',
            species_to_eliminate: [''],
        });
        const bodyEmpty = JSON.parse(resultEmpty.content[0].text);
        expect(bodyEmpty.error ?? bodyEmpty.message ?? JSON.stringify(bodyEmpty)).toMatch(/species_to_eliminate must contain only non-empty, non-blank strings/i);

        // Blank string
        const resultBlank = await handleQssaReduction({
            code: MM_MODEL,
            mode: 'apply',
            species_to_eliminate: ['  '],
        });
        const bodyBlank = JSON.parse(resultBlank.content[0].text);
        expect(bodyBlank.error ?? bodyBlank.message ?? JSON.stringify(bodyBlank)).toMatch(/species_to_eliminate must contain only non-empty, non-blank strings/i);
    });

    it('handles malformed input / wrong types / missing parameters via parseArgs / structureError', async () => {
        // Missing code
        const resultMissing = await handleQssaReduction({
            mode: 'analyze',
        } as any);
        const bodyMissing = JSON.parse(resultMissing.content[0].text);
        expect(bodyMissing.error ?? bodyMissing.message ?? JSON.stringify(bodyMissing)).toMatch(/Required|expected string/i);

        // Numeric code
        const resultWrongType = await handleQssaReduction({
            code: 12345 as any,
            mode: 'analyze',
        });
        const bodyWrongType = JSON.parse(resultWrongType.content[0].text);
        expect(bodyWrongType.error ?? bodyWrongType.message ?? JSON.stringify(bodyWrongType)).toMatch(/Expected string, received number/i);
    });
});