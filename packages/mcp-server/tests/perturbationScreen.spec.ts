import { describe, expect, it } from 'vitest';
import { handlePerturbationScreen } from '../src/handlers/perturbationScreen.js';

const MIN_BINDING_MODEL = `begin model
begin parameters
  kf  0.1
  kr  0.01
end parameters
begin molecule types
  A(s)
  B(s)
end molecule types
begin seed species
  A(s)  100
  B(s)  100
end seed species
begin observables
  Molecules  FreeA  A(s)
  Molecules  FreeB  B(s)
  Molecules  Cplx   A(s!1).B(s!1)
end observables
begin reaction rules
  binding:  A(s) + B(s) <-> A(s!1).B(s!1)  kf, kr
end reaction rules
end model
`;

const MODEL_NO_RULES = `begin model
begin parameters
  kf  0.1
end parameters
begin molecule types
  A(s)
end molecule types
begin seed species
  A(s)  100
end seed species
begin observables
  Molecules  FreeA  A(s)
end observables
begin reaction rules
end reaction rules
end model
`;

const MODEL_STIFF_DIV_ZERO = `begin model
begin parameters
  kf 1
end parameters
begin molecule types
  A(s)
end molecule types
begin seed species
  A(s) 100
end seed species
begin observables
  Molecules A_tot A(s)
end observables
begin functions
  rate() = kf / (A_tot - 50) * (A_tot - 50)
end functions
begin reaction rules
  r1: A(s) -> 0 rate()
end reaction rules
end model
`;

describe('perturbation_screen handler', () => {
    // -------------------------------------------------------------------------
    // 1. Happy path & Optional fields fallback
    // -------------------------------------------------------------------------
    it('runs rule_knockout and returns at least the wildtype + one KO simulation', async () => {
        const result = await handlePerturbationScreen({
            code: MIN_BINDING_MODEL,
            observables: ['FreeA', 'Cplx'],
            perturbations: ['rule_knockout'],
            t_end: 10,
            n_steps: 50,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.summary).toBeDefined();
        expect(body.summary.totalSimulations).toBeGreaterThanOrEqual(2);
        expect(body.wildTypeTrajectory).toBeDefined();
        expect(body.wildTypeTrajectory.FreeA.length).toBeGreaterThan(0);
        expect(body.wildTypeTrajectory.Cplx.length).toBeGreaterThan(0);
        expect(Array.isArray(body.results)).toBe(true);
        expect(body.results.length).toBeGreaterThanOrEqual(1);
        expect(body.results[0].type).toBe('rule_knockout');
    }, 30000);

    it('handles missing optional fields by falling back gracefully', async () => {
        const result = await handlePerturbationScreen({
            code: MIN_BINDING_MODEL,
            observables: ['FreeA'],
            perturbations: ['rule_knockout'],
            t_end: 5,
            n_steps: 10,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.summary).toBeDefined();
        expect(body.results).toBeDefined();
        expect(body.results[0].aggregateScore).toBeDefined();
    });

    // -------------------------------------------------------------------------
    // 2. Malformed input (unparseable JSON, wrong types)
    // -------------------------------------------------------------------------
    it('rejects wrong types in arguments via Zod validation', async () => {
        const result = await handlePerturbationScreen({
            code: MIN_BINDING_MODEL,
            observables: 'not-an-array' as unknown as string[],
            perturbations: ['rule_knockout'],
            t_end: 10,
            n_steps: 50,
        });

        const body = JSON.parse(result.content[0].text);
        const errStr = body.error ?? body.message ?? JSON.stringify(body);
        expect(errStr).toMatch(/Invalid arguments for perturbation_screen/i);
    });

    it('rejects invalid perturbation types via Zod validation', async () => {
        const result = await handlePerturbationScreen({
            code: MIN_BINDING_MODEL,
            observables: ['FreeA'],
            perturbations: ['invalid_type_name' as any],
            t_end: 10,
            n_steps: 50,
        });

        const body = JSON.parse(result.content[0].text);
        const errStr = body.error ?? body.message ?? JSON.stringify(body);
        expect(errStr).toMatch(/Invalid arguments for perturbation_screen/i);
    });

    // -------------------------------------------------------------------------
    // 3. Boundary conditions (empty string, zero, very large numbers)
    // -------------------------------------------------------------------------
    it('rejects empty or blank model code with informative error', async () => {
        const result = await handlePerturbationScreen({
            code: '   ',
            observables: ['FreeA'],
            perturbations: ['rule_knockout'],
            t_end: 10,
            n_steps: 50,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.error ?? body.message ?? JSON.stringify(body)).toMatch(/non-empty string/i);
    });

    it('rejects observables not declared in the model with a structured error', async () => {
        const result = await handlePerturbationScreen({
            code: MIN_BINDING_MODEL,
            observables: ['NonExistentObservable'],
            perturbations: ['rule_knockout'],
            t_end: 10,
            n_steps: 50,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.error ?? body.message ?? JSON.stringify(body)).toMatch(/observable|not.*declared|not.*defined/i);
    });

    it('rejects excessive max_pairwise boundary check', async () => {
        const result = await handlePerturbationScreen({
            code: MIN_BINDING_MODEL,
            observables: ['FreeA'],
            perturbations: ['rule_knockout'],
            t_end: 10,
            n_steps: 50,
            max_pairwise: 2000,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.error ?? body.message ?? JSON.stringify(body)).toMatch(/max_pairwise > 1000/i);
    });

    it('rejects very large expected simulation counts', async () => {
        const rules = Array.from({ length: 301 }, (_, i) => `r${i}: A(s) -> B(s) kf`).join('\n');
        const largeModel = `begin model
begin parameters
  kf 0.1
end parameters
begin molecule types
  A(s)
  B(s)
end molecule types
begin seed species
  A(s) 100
  B(s) 0
end seed species
begin observables
  Molecules FreeA A(s)
end observables
begin reaction rules
${rules}
end reaction rules
end model
`;
        const result = await handlePerturbationScreen({
            code: largeModel,
            observables: ['FreeA'],
            perturbations: ['rule_knockout'],
            t_end: 1,
            n_steps: 2,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.error ?? body.message ?? JSON.stringify(body)).toMatch(/exceeds the limit of 300/i);
    });

    it('rejects gracefully when zero matching elements are found to perturb', async () => {
        const result = await handlePerturbationScreen({
            code: MODEL_NO_RULES,
            observables: ['FreeA'],
            perturbations: ['rule_knockout'],
            t_end: 10,
            n_steps: 50,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.error ?? body.message ?? JSON.stringify(body)).toMatch(/No perturbations could be applied/i);
    });

    it('rejects gracefully when all perturbed simulations fail', async () => {
        const result = await handlePerturbationScreen({
            code: MODEL_STIFF_DIV_ZERO,
            observables: ['A_tot'],
            perturbations: ['species_knockdown'],
            knockdown_fraction: 0.5,
            t_end: 1,
            n_steps: 2,
            method: 'ssa',
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.error ?? body.message ?? JSON.stringify(body)).toMatch(/All perturbed simulations failed|evaluated to non-numeric/i);
    });

    it('ranks results by aggregate score (descending)', async () => {
        const result = await handlePerturbationScreen({
            code: MIN_BINDING_MODEL,
            observables: ['Cplx'],
            perturbations: ['rule_knockout'],
            t_end: 10,
            n_steps: 50,
            metric: 'rmsd',
        });

        const body = JSON.parse(result.content[0].text);
        const scores = body.results.map((r: { aggregateScore: number }) => r.aggregateScore);
        for (let i = 1; i < scores.length; i++) {
            expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
        }
    }, 30000);
});
