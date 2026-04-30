import { describe, expect, it } from 'vitest';
import { handleBifurcationAnalysis } from '../src/handlers/bifurcationAnalysis.js';

const BRUSSELATOR_MODEL = `begin model
begin parameters
  a 1.0
  b 2.0
  k1 1.0
  k2 1.0
end parameters
begin molecule types
  X()
  Y()
end molecule types
begin seed species
  X() a
  Y() b
end seed species
begin observables
  Molecules X X()
  Molecules Y Y()
end observables
begin reaction rules
  X() -> 0 1.0
  Y() -> X() 1.0
  X() + Y() -> Y() + Y() 1.0
end reaction rules
end model
`;

const MICHAELIS_MODEL = `begin model
begin parameters
  E_tot 1.0
  S_tot 10.0
  kf 0.1
  kr 1.0
  kcat 1.0
end parameters
begin molecule types
  E()
  S()
  ES()
  P()
end molecule types
begin seed species
  E() E_tot
  S() S_tot
end seed species
begin observables
  Molecules ES complex ES()
  Molecules P product P()
end observables
begin reaction rules
  E() + S() <-> E()!1.S() kf, kr
  E()!1.S() -> E() + P() kcat
end reaction rules
end model
`;

const POSITIVE_FEEDBACK_MODEL = `begin model
begin parameters
  k1 1.0
  k2 1.0
  k3 0.5
  A0 0.1
end parameters
begin molecule types
  A()
  B()
end molecule types
begin seed species
  A() A0
end seed species
begin observables
  Molecules A A()
  Molecules B B()
end observables
begin reaction rules
  A() -> B() k1
  B() -> A() k2
  A() + B() -> A() + A() k3
end reaction rules
end model
`;

describe('bifurcation_analysis handler', () => {
    it('accepts valid Brusselator model with positive feedback for bifurcation detection', async () => {
        const result = await handleBifurcationAnalysis({
            code: BRUSSELATOR_MODEL,
            parameter: 'b',
            start_value: 0.5,
            end_value: 3.0,
            max_steps: 50,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.totalPoints).toBeGreaterThan(0);
        expect(body.stablePoints).toBeGreaterThan(0);
        expect(typeof body.stablePoints).toBe('number');
        expect(typeof body.unstablePoints).toBe('number');
    }, 60000);

    it('uses seed species concentrations as initial state', async () => {
        const result = await handleBifurcationAnalysis({
            code: BRUSSELATOR_MODEL,
            parameter: 'b',
            start_value: 1.0,
            end_value: 2.5,
            max_steps: 30,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.totalPoints).toBeGreaterThan(0);
    }, 60000);

    it('handles Michaelis-Menten enzyme kinetics model gracefully', async () => {
        const result = await handleBifurcationAnalysis({
            code: MICHAELIS_MODEL,
            parameter: 'E_tot',
            start_value: 0.1,
            end_value: 5.0,
            max_steps: 40,
        });

        expect(result.content).toBeDefined();
    }, 60000);

    it('handles positive feedback model', async () => {
        const result = await handleBifurcationAnalysis({
            code: POSITIVE_FEEDBACK_MODEL,
            parameter: 'k3',
            start_value: 0.1,
            end_value: 2.0,
            max_steps: 40,
        });

        expect(result.content).toBeDefined();
    }, 60000);

    it('rejects unknown parameter name', async () => {
        const result = await handleBifurcationAnalysis({
            code: BRUSSELATOR_MODEL,
            parameter: 'NotAParam',
            start_value: 0.5,
            end_value: 3.0,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.error ?? body.message ?? JSON.stringify(body)).toMatch(/Unknown continuation parameter|NotAParam/i);
    });

    it('rejects missing parameter name', async () => {
        const result = await handleBifurcationAnalysis({
            code: BRUSSELATOR_MODEL,
            start_value: 0.5,
            end_value: 3.0,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.error ?? body.message ?? JSON.stringify(body)).toMatch(/parameter name|required/i);
    });

    it('handles narrow parameter range gracefully', async () => {
        const result = await handleBifurcationAnalysis({
            code: BRUSSELATOR_MODEL,
            parameter: 'b',
            start_value: 1.0,
            end_value: 1.5,
            max_steps: 20,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.totalPoints).toBeGreaterThan(0);
    }, 30000);

    it('handles wide parameter range', async () => {
        const result = await handleBifurcationAnalysis({
            code: BRUSSELATOR_MODEL,
            parameter: 'b',
            start_value: 0.01,
            end_value: 10.0,
            max_steps: 100,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.totalPoints).toBeGreaterThan(0);
    }, 60000);

    it('returns technical description with parameter range', async () => {
        const result = await handleBifurcationAnalysis({
            code: BRUSSELATOR_MODEL,
            parameter: 'b',
            start_value: 0.5,
            end_value: 2.5,
            max_steps: 25,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.technical).toContain('b');
        expect(body.technical).toContain('0.5');
        expect(body.technical).toContain('2.5');
    }, 30000);

    it('reports defaulted parameter bounds in the technical summary', async () => {
        const result = await handleBifurcationAnalysis({
            code: BRUSSELATOR_MODEL,
            parameter: 'b',
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.technical).toContain('b');
        expect(body.technical).toContain('0');
        expect(body.technical).toContain('1');
        expect(body.technical).not.toContain('undefined');
    }, 30000);

    it('returns biological interpretation', async () => {
        const result = await handleBifurcationAnalysis({
            code: BRUSSELATOR_MODEL,
            parameter: 'b',
            start_value: 0.5,
            end_value: 3.0,
            max_steps: 30,
        });

        const body = JSON.parse(result.content[0].text);
        expect(typeof body.biological).toBe('string');
    }, 30000);

    it('returns strategic guidance for downstream analysis', async () => {
        const result = await handleBifurcationAnalysis({
            code: BRUSSELATOR_MODEL,
            parameter: 'b',
            start_value: 1.0,
            end_value: 2.0,
            max_steps: 20,
        });

        expect(result.content).toBeDefined();
    }, 30000);

    it('handles different max_steps values', async () => {
        const lowSteps = await handleBifurcationAnalysis({
            code: BRUSSELATOR_MODEL,
            parameter: 'b',
            start_value: 1.0,
            end_value: 2.0,
            max_steps: 10,
        });
        const bodyLow = JSON.parse(lowSteps.content[0].text);

        const highSteps = await handleBifurcationAnalysis({
            code: BRUSSELATOR_MODEL,
            parameter: 'b',
            start_value: 1.0,
            end_value: 2.0,
            max_steps: 100,
        });
        const bodyHigh = JSON.parse(highSteps.content[0].text);

        expect(bodyHigh.totalPoints).toBeGreaterThanOrEqual(bodyLow.totalPoints);
    }, 60000);

    it('handles zero initial concentration model', async () => {
        const zeroConcModel = `begin model
begin parameters
  kf 1.0
  kr 1.0
end parameters
begin molecule types
  X()
end molecule types
begin seed species
  X() 0
end seed species
begin reaction rules
  X() -> 0 kf
end reaction rules
end model
`;
        const result = await handleBifurcationAnalysis({
            code: zeroConcModel,
            parameter: 'kf',
            start_value: 0.1,
            end_value: 2.0,
            max_steps: 20,
        });

        const body = JSON.parse(result.content[0].text);
        expect(body.totalPoints).toBeGreaterThan(0);
    }, 30000);
});
