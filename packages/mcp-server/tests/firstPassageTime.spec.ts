import { describe, expect, it } from 'vitest';
import { handleFirstPassageTime } from '../src/handlers/firstPassageTime.js';

const LOW_COUNT_BINDING = `begin model
begin parameters
  kf  0.05
  kr  0.001
end parameters
begin molecule types
  A(s)
  B(s)
end molecule types
begin seed species
  A(s)  20
  B(s)  20
end seed species
begin observables
  Molecules  Cplx   A(s!1).B(s!1)
  Molecules  FreeA  A(s)
end observables
begin reaction rules
  A(s) + B(s) <-> A(s!1).B(s!1)  kf, kr
end reaction rules
end model
`;

describe('first_passage_time handler', () => {
    it('returns a distribution per threshold for a small ensemble', async () => {
        const result = await handleFirstPassageTime({
            code: LOW_COUNT_BINDING,
            thresholds: [
                { observable: 'Cplx', value: 5, direction: 'above', label: 'Cplx≥5' },
                { observable: 'Cplx', value: 10, direction: 'above', label: 'Cplx≥10' },
            ],
            n_trajectories: 20,
            t_end: 100,
            n_steps: 200,
            seed: 42,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.summary.nTrajectoriesSuccessful).toBeGreaterThanOrEqual(15);
        expect(body.distributions).toHaveLength(2);

        const dFive = body.distributions.find((d: { label: string }) => d.label === 'Cplx≥5');
        expect(dFive.crossingFraction).toBeGreaterThan(0.5);
        expect(dFive.mean).toBeGreaterThan(0);
        expect(Number.isFinite(dFive.mean)).toBe(true);
    }, 60000);

    it('rejects threshold referencing an undeclared observable', async () => {
        const result = await handleFirstPassageTime({
            code: LOW_COUNT_BINDING,
            thresholds: [{ observable: 'NotAnObservable', value: 1, direction: 'above' }],
            n_trajectories: 2,
            t_end: 10,
            n_steps: 20,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.error ?? body.message ?? JSON.stringify(body)).toMatch(/observables not in model/i);
    });

    it('rejects oversized ensembles', async () => {
        const result = await handleFirstPassageTime({
            code: LOW_COUNT_BINDING,
            thresholds: [{ observable: 'Cplx', value: 1, direction: 'above' }],
            n_trajectories: 999,
            t_end: 10,
            n_steps: 20,
        });

        const body = JSON.parse(result.content[0].text);
        const errStr = body.error ?? body.message ?? body.issues ?? JSON.stringify(body);
        expect(String(errStr)).toMatch(/500|too.*large|not supported/i);
    });

    it('reports crossingFraction < 1 when threshold is effectively unreachable', async () => {
        const result = await handleFirstPassageTime({
            code: LOW_COUNT_BINDING,
            thresholds: [{ observable: 'Cplx', value: 1000, direction: 'above', label: 'impossible' }],
            n_trajectories: 10,
            t_end: 50,
            n_steps: 50,
            seed: 42,
        });

        const body = JSON.parse(result.content[0].text);
        const d = body.distributions.find((x: { label: string }) => x.label === 'impossible');
        expect(d.crossingFraction).toBe(0);
        expect(d.nCrossings).toBe(0);
    }, 30000);
});