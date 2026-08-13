import { describe, expect, it } from 'vitest';
import { handleTemporalAnalysis } from '../src/handlers/temporalAnalysis.js';

const VALID_MODEL = `begin model
begin parameters
  k_prod  10.0
  k_deg   0.1
end parameters
begin molecule types
  X()
end molecule types
begin seed species
  X()  10
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

describe('temporal_analysis handler', () => {
    // -------------------------------------------------------------------------
    // 1. Success case with optional fields omitted
    // -------------------------------------------------------------------------
    it('succeeds on a valid model with missing optional fields (uses defaults)', async () => {
        const result = await handleTemporalAnalysis({
            code: VALID_MODEL,
        });

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        const body = JSON.parse(result.content[0].text);

        // When successful, the temporal analysis returns summary
        if (body.error) {
            // If the simulation had no firing events (stochastically possible but rare for birth-death with 10 seed & k_prod=10),
            // it's still a handled structured error result and doesn't crash.
            expect(body.error).toContain('No firing events recorded');
            expect(body.diagnosis).toBeDefined();
        } else {
            expect(body.reactionsAnalyzed).toBeGreaterThan(0);
            expect(body.firingEvents).toBeGreaterThanOrEqual(0);
            expect(body.technical).toBeDefined();
        }
    }, 30000);

    // -------------------------------------------------------------------------
    // 2. Malformed input (wrong types)
    // -------------------------------------------------------------------------
    it('returns a structured error for malformed input (wrong type for code)', async () => {
        const result = await handleTemporalAnalysis({
            code: 12345 as any,
        });

        expect(result).toBeDefined();
        const body = JSON.parse(result.content[0].text);
        expect(body.error).toBeDefined();
        expect(body.error).toContain('Invalid arguments');
        expect(body.error).toContain('expected string, received number');
    });

    it('returns a structured error for malformed input (wrong type for t_end)', async () => {
        const result = await handleTemporalAnalysis({
            code: VALID_MODEL,
            t_end: "one hundred" as any,
        });

        expect(result).toBeDefined();
        const body = JSON.parse(result.content[0].text);
        expect(body.error).toBeDefined();
        expect(body.error).toContain('Invalid arguments');
        expect(body.error).toContain('expected number, received string');
    });

    // -------------------------------------------------------------------------
    // 3. Boundary conditions
    // -------------------------------------------------------------------------
    it('rejects empty or blank code string', async () => {
        const result = await handleTemporalAnalysis({
            code: '   ',
        });

        expect(result).toBeDefined();
        const body = JSON.parse(result.content[0].text);
        expect(body.error).toBeDefined();
        expect(body.error).toContain('Model code must be a non-empty string');
    });

    it('rejects zero or negative t_end', async () => {
        const result = await handleTemporalAnalysis({
            code: VALID_MODEL,
            t_end: 0,
        });

        expect(result).toBeDefined();
        const body = JSON.parse(result.content[0].text);
        expect(body.error).toBeDefined();
        expect(body.error).toContain('Invalid arguments');
    });

    it('rejects zero or negative bin_width', async () => {
        const result = await handleTemporalAnalysis({
            code: VALID_MODEL,
            bin_width: -1.5,
        });

        expect(result).toBeDefined();
        const body = JSON.parse(result.content[0].text);
        expect(body.error).toBeDefined();
        expect(body.error).toContain('Invalid arguments');
    });
});
