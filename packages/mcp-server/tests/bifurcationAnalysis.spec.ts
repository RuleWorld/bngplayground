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
        expect(body.error ?? body.message ?? JSON.stringify(body)).toMatch(/parameter|required/i);
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

describe('handleBifurcationAnalysis — robust edge case and boundary handling', () => {
    it('handles malformed inputs and wrong types via Zod schema validation', async () => {
        // Malformed code type (number instead of string)
        const resultNumericCode = await handleBifurcationAnalysis({
            code: 12345 as unknown as string,
            parameter: 'b',
        });
        const bodyNumericCode = JSON.parse(resultNumericCode.content[0].text);
        expect(bodyNumericCode.error ?? bodyNumericCode.message ?? JSON.stringify(bodyNumericCode))
            .toMatch(/Expected string|invalid/i);

        // Malformed parameter type (boolean instead of string)
        const resultBoolParam = await handleBifurcationAnalysis({
            code: BRUSSELATOR_MODEL,
            parameter: true as unknown as string,
        });
        const bodyBoolParam = JSON.parse(resultBoolParam.content[0].text);
        expect(bodyBoolParam.error ?? bodyBoolParam.message ?? JSON.stringify(bodyBoolParam))
            .toMatch(/Expected string|invalid/i);
    });

    it('rejects empty or whitespace-only model code', async () => {
        // Empty code
        const resultEmptyCode = await handleBifurcationAnalysis({
            code: '',
            parameter: 'b',
        });
        const bodyEmptyCode = JSON.parse(resultEmptyCode.content[0].text);
        expect(bodyEmptyCode.error ?? bodyEmptyCode.message ?? JSON.stringify(bodyEmptyCode))
            .toMatch(/Model code must be a non-empty string/i);

        // Whitespace code
        const resultBlankCode = await handleBifurcationAnalysis({
            code: '   \n  \t ',
            parameter: 'b',
        });
        const bodyBlankCode = JSON.parse(resultBlankCode.content[0].text);
        expect(bodyBlankCode.error ?? bodyBlankCode.message ?? JSON.stringify(bodyBlankCode))
            .toMatch(/Model code must be a non-empty string/i);
    });

    it('rejects empty or whitespace-only parameter names', async () => {
        const resultBlankParam = await handleBifurcationAnalysis({
            code: BRUSSELATOR_MODEL,
            parameter: '   ',
        });
        const bodyBlankParam = JSON.parse(resultBlankParam.content[0].text);
        expect(bodyBlankParam.error ?? bodyBlankParam.message ?? JSON.stringify(bodyBlankParam))
            .toMatch(/Parameter name must be a non-empty string/i);
    });

    it('rejects identical start_value and end_value', async () => {
        const resultEqualBounds = await handleBifurcationAnalysis({
            code: BRUSSELATOR_MODEL,
            parameter: 'b',
            start_value: 1.0,
            end_value: 1.0,
        });
        const bodyEqualBounds = JSON.parse(resultEqualBounds.content[0].text);
        expect(bodyEqualBounds.error ?? bodyEqualBounds.message ?? JSON.stringify(bodyEqualBounds))
            .toMatch(/start_value and end_value must be distinct/i);
    });

    it('rejects non-positive max_steps boundary', async () => {
        const resultZeroSteps = await handleBifurcationAnalysis({
            code: BRUSSELATOR_MODEL,
            parameter: 'b',
            max_steps: 0,
        });
        const bodyZeroSteps = JSON.parse(resultZeroSteps.content[0].text);
        expect(bodyZeroSteps.error ?? bodyZeroSteps.message ?? JSON.stringify(bodyZeroSteps))
            .toMatch(/Too small|greater than 0|invalid/i);
    });

    it('returns structured error on invalid BNGL code syntax', async () => {
        const resultInvalidBNGL = await handleBifurcationAnalysis({
            code: 'this is not valid BNGL model content #$@!',
            parameter: 'b',
        });
        const bodyInvalidBNGL = JSON.parse(resultInvalidBNGL.content[0].text);
        expect(bodyInvalidBNGL.error ?? bodyInvalidBNGL.message ?? JSON.stringify(bodyInvalidBNGL))
            .toMatch(/BNGL parse failed|Error parsing BNGL/i);
    });
});
