import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseParameters, updateParameterInCode, perturbParameters, perturbParameterOverrides } from './bnglManipulation';

describe('bnglManipulation', () => {
    describe('parseParameters', () => {
        it('should correctly parse parameters from a simple block', () => {
            const code = `
begin parameters
    k1 1.0
    k2 2.5
    vol 100
end parameters
            `;
            const params = parseParameters(code);
            expect(params).toHaveLength(3);
            expect(params[0]).toEqual({ name: 'k1', value: 1.0, lineIndex: 2 });
            expect(params[1]).toEqual({ name: 'k2', value: 2.5, lineIndex: 3 });
            expect(params[2]).toEqual({ name: 'vol', value: 100, lineIndex: 4 });
        });

        it('should ignore comments', () => {
            const code = `
begin parameters
    # This is a comment
    k1 1.0 # Another comment
end parameters
            `;
            const params = parseParameters(code);
            expect(params).toHaveLength(1);
            expect(params[0].name).toBe('k1');
            expect(params[0].value).toBe(1.0);
        });

        it('should handle scientific notation', () => {
            const code = `
begin parameters
    k1 1e-3
    k2 2.5E4
end parameters
            `;
            const params = parseParameters(code);
            expect(params).toHaveLength(2);
            expect(params[0].value).toBe(0.001);
            expect(params[1].value).toBe(25000);
        });

        it('should return empty array if no parameter block', () => {
            const code = `
begin molecule types
    A()
end molecule types
            `;
            expect(parseParameters(code)).toHaveLength(0);
        });

        it('should handle invalid values or missing values', () => {
            const code = `
begin parameters
    k1 invalid
    k2
end parameters
            `;
            const params = parseParameters(code);
            expect(params).toHaveLength(0);
        });
    });

    describe('updateParameterInCode', () => {
        it('should update a parameter value', () => {
            const code = `
begin parameters
    k1 1.0 # comment
end parameters
            `;
            const params = parseParameters(code);
            const newCode = updateParameterInCode(code, params[0], 2.0);
            expect(newCode).toContain('k1 2 # comment');
        });

        it('should return original code if parameter index is invalid', () => {
            const code = `begin parameters\nk1 1.0\nend parameters`;
            const param = { name: 'k1', value: 1.0, lineIndex: 100 };
            const newCode = updateParameterInCode(code, param, 2.0);
            expect(newCode).toBe(code);
        });

        it('should handle updating parameters without comments', () => {
            const code = `
begin parameters
    k1 1.0
end parameters
            `;
            const params = parseParameters(code);
            const newCode = updateParameterInCode(code, params[0], 5.5);
            expect(newCode).toContain('k1 5.5');
        });

        it('should return original code if no match is found for regex', () => {
            const code = `
begin parameters
    k1 1.0
end parameters
            `;
            const params = parseParameters(code);
            const newCode = `
begin parameters
    k2 1.0
end parameters
            `;
            const result = updateParameterInCode(newCode, params[0], 2.0);
            expect(result).toBe(newCode);
        });
    });

    describe('perturbParameters', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should perturb parameter values within the specified variation percent', () => {
            const code = `
begin parameters
    k1 10.0
end parameters
            `;
            const variationPercent = 10;
            const newCode = perturbParameters(code, variationPercent);

            const newParams = parseParameters(newCode);
            expect(newParams).toHaveLength(1);
            const newValue = newParams[0].value;

            expect(newValue).toBeGreaterThanOrEqual(9.0);
            expect(newValue).toBeLessThanOrEqual(11.0);
        });

        it('should handle empty parameter block', () => {
            const code = `begin parameters\nend parameters`;
            const newCode = perturbParameters(code, 10);
            expect(newCode).toBe(code);
        });

    });

    describe('perturbParameterOverrides', () => {
         it('should perturb an object of parameters within specified percent', () => {
            const params = { k1: 100, k2: 50 };
            const variationPercent = 20;
            const newParams = perturbParameterOverrides(params, variationPercent);

            expect(newParams).toHaveProperty('k1');
            expect(newParams).toHaveProperty('k2');

            expect(newParams.k1).toBeGreaterThanOrEqual(80);
            expect(newParams.k1).toBeLessThanOrEqual(120);

            expect(newParams.k2).toBeGreaterThanOrEqual(40);
            expect(newParams.k2).toBeLessThanOrEqual(60);
         });

         it('should handle empty object', () => {
             const result = perturbParameterOverrides({}, 10);
             expect(result).toEqual({});
         });

         it('should handle objects with inherited properties (should ignore them)', () => {
             const params = Object.create({ inherited: 10 });
             params.k1 = 100;
             const result = perturbParameterOverrides(params, 10);
             expect(result).toHaveProperty('k1');
             expect(result).not.toHaveProperty('inherited');
         });
    });
});
