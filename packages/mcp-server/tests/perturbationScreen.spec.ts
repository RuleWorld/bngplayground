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

describe('perturbation_screen handler', () => {
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