import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    parseParameters,
    updateParameterInCode,
    perturbParameters,
    perturbParameterOverrides,
} from '../src/utils/bnglManipulation';

describe('bnglManipulation', () => {
    describe('parseParameters', () => {
        it('should correctly parse parameters within a block', () => {
            const bngl = `
begin parameters
    k1 1.0
    k2 2.5e-3 # comment
    k3 0
end parameters
            `;
            const params = parseParameters(bngl);
            expect(params).toHaveLength(3);
            expect(params[0]).toMatchObject({ name: 'k1', value: 1.0, lineIndex: 2 });
            expect(params[1]).toMatchObject({ name: 'k2', value: 0.0025, lineIndex: 3 });
            expect(params[2]).toMatchObject({ name: 'k3', value: 0, lineIndex: 4 });
        });

        it('should ignore lines outside the parameter block', () => {
            const bngl = `
k0 5.0
begin parameters
    k1 1.0
end parameters
k2 2.0
            `;
            const params = parseParameters(bngl);
            expect(params).toHaveLength(1);
            expect(params[0].name).toBe('k1');
        });

        it('should ignore comments inside the block', () => {
            const bngl = `
begin parameters
    # This is a comment
    k1 1.0
end parameters
            `;
            const params = parseParameters(bngl);
            expect(params).toHaveLength(1);
            expect(params[0].name).toBe('k1');
        });

        it('should ignore invalid number formats', () => {
            const bngl = `
begin parameters
    k1 invalid_number
end parameters
            `;
            const params = parseParameters(bngl);
            expect(params).toHaveLength(0);
        });
    });

    describe('updateParameterInCode', () => {
        it('should update parameter value correctly in code', () => {
            const bngl = `
begin parameters
    k1 1.0 # This is k1
end parameters
            `;
            const params = parseParameters(bngl);
            const updatedBngl = updateParameterInCode(bngl.trim(), { ...params[0], lineIndex: 1 }, 2.5); // lineIndex: 1 in trimmed version
            expect(updatedBngl).toContain('k1 2.5 # This is k1');
        });

        it('should return original code if parameter index is out of bounds', () => {
            const bngl = `begin parameters\nk1 1.0\nend parameters`;
            const updatedBngl = updateParameterInCode(bngl, { name: 'k1', value: 1.0, lineIndex: 10 }, 2.5);
            expect(updatedBngl).toBe(bngl);
        });

        it('should return original code if parameter name is not found on the line', () => {
            const bngl = `begin parameters\nk1 1.0\nend parameters`;
            // Fake parameter pointing to 'begin parameters' line
            const updatedBngl = updateParameterInCode(bngl, { name: 'k2', value: 1.0, lineIndex: 1 }, 2.5);
            expect(updatedBngl).toBe(bngl);
        });
    });

    describe('perturbParameters', () => {
        beforeEach(() => {
            // Mock Math.random to return 0.5 for predictable perturbation
            // With randomFactor = (0.5 * 2 - 1) * (10 / 100) = 0
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should perturb parameters with predictability (0 variation)', () => {
            const bngl = `
begin parameters
    k1 10.0 # comment
end parameters
            `.trim();
            const perturbedBngl = perturbParameters(bngl, 10);
            expect(perturbedBngl).toContain('k1 10 # comment'); // Math.random() = 0.5 -> 0 change
        });

        it('should perturb parameters with positive variation', () => {
            vi.spyOn(Math, 'random').mockReturnValue(1); // randomFactor = (1 * 2 - 1) * 0.1 = 0.1
            const bngl = `
begin parameters
    k1 10.0 # comment
end parameters
            `.trim();
            const perturbedBngl = perturbParameters(bngl, 10);
            expect(perturbedBngl).toContain('k1 11 # comment');
        });

        it('should perturb parameters with negative variation', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0); // randomFactor = (0 * 2 - 1) * 0.1 = -0.1
            const bngl = `
begin parameters
    k1 10.0 # comment
end parameters
            `.trim();
            const perturbedBngl = perturbParameters(bngl, 10);
            expect(perturbedBngl).toContain('k1 9 # comment');
        });
    });

    describe('perturbParameterOverrides', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should perturb an object of parameters with positive variation', () => {
            vi.spyOn(Math, 'random').mockReturnValue(1); // Max positive variation
            const params = { k1: 10, k2: 20 };
            const perturbed = perturbParameterOverrides(params, 10); // 10% variation
            expect(perturbed.k1).toBeCloseTo(11); // 10 * 1.1
            expect(perturbed.k2).toBeCloseTo(22); // 20 * 1.1
        });

        it('should perturb an object of parameters with negative variation', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0); // Max negative variation
            const params = { k1: 10, k2: 20 };
            const perturbed = perturbParameterOverrides(params, 10); // 10% variation
            expect(perturbed.k1).toBeCloseTo(9); // 10 * 0.9
            expect(perturbed.k2).toBeCloseTo(18); // 20 * 0.9
        });

        it('should leave parameter values unchanged when variationPercent is 0', () => {
            vi.spyOn(Math, 'random').mockReturnValue(1); // Try to force max variation
            const params = { k1: 10, k2: 20 };
            const perturbed = perturbParameterOverrides(params, 0); // 0% variation
            expect(perturbed.k1).toBeCloseTo(10);
            expect(perturbed.k2).toBeCloseTo(20);
        });

        it('should leave parameter values unchanged when random gives exact mid-point', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5); // Mid point
            const params = { k1: 10, k2: 20 };
            const perturbed = perturbParameterOverrides(params, 10); // 10% variation
            expect(perturbed.k1).toBeCloseTo(10);
            expect(perturbed.k2).toBeCloseTo(20);
        });

        it('should handle zero value correctly (stays zero due to multiplicative noise)', () => {
            vi.spyOn(Math, 'random').mockReturnValue(1); // Max positive variation
            const params = { k0: 0 };
            const perturbed = perturbParameterOverrides(params, 10); // 10% variation
            expect(perturbed.k0).toBeCloseTo(0);
        });

        it('should handle empty parameter objects', () => {
            const perturbed = perturbParameterOverrides({}, 10);
            expect(perturbed).toEqual({});
        });

        it('should ignore properties from prototype chain', () => {
            vi.spyOn(Math, 'random').mockReturnValue(1);
            const proto = { kProto: 30 };
            const params = Object.create(proto);
            params.k1 = 10;
            const perturbed = perturbParameterOverrides(params, 10);
            expect(perturbed.k1).toBeCloseTo(11);
            expect(perturbed).not.toHaveProperty('kProto');
        });
    });
});
