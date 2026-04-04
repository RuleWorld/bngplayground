
import { describe, it, expect } from 'vitest';
import { roundForInput, computeDefaultBounds, generateRange, validateScanSettings, DEFAULT_ZERO_DELTA, formatNumber } from '@bngplayground/engine';

describe('ParameterScan Analysis Service', () => {

    describe('roundForInput', () => {
        it('should round normally', () => expect(roundForInput(1.2345678)).toBe('1.234568'));
        it('should handle integers', () => expect(roundForInput(10)).toBe('10'));
        it('should handle zero', () => expect(roundForInput(0)).toBe('0'));
        it('should handle small numbers', () => expect(roundForInput(0.000001)).toBe('0.000001'));
        it('should handle very small numbers (rounding to 0)', () => expect(roundForInput(0.0000001)).toBe('0'));
        it('should handle negative numbers', () => expect(roundForInput(-5.5555555)).toBe('-5.555555')); // Math.round(-5.5) is -5 in JS
        it('should return empty string for NaN', () => expect(roundForInput(NaN)).toBe(''));
        it('should return empty string for Infinity', () => expect(roundForInput(Infinity)).toBe(''));
        it('should handle large integers', () => expect(roundForInput(1000000)).toBe('1000000'));
        it('should preserve user precision if low', () => expect(roundForInput(1.2)).toBe('1.2'));
    });

    describe('computeDefaultBounds', () => {
        it('should return 0, delta for 0', () => {
            const [l, u] = computeDefaultBounds(0);
            expect(l).toBe(0);
            expect(u).toBe(DEFAULT_ZERO_DELTA);
        });
        it('should return +/- 10% for 100', () => {
            const [l, u] = computeDefaultBounds(100);
            expect(l).toBeCloseTo(90);
            expect(u).toBeCloseTo(110);
        });
        it('should return +/- 10% for 1', () => {
            const [l, u] = computeDefaultBounds(1);
            expect(l).toBeCloseTo(0.9);
            expect(u).toBeCloseTo(1.1);
        });
        it('should return 0,0 for NaN', () => expect(computeDefaultBounds(NaN)).toEqual([0, 0]));
        it('should return 0,0 for negative', () => expect(computeDefaultBounds(-10)).toEqual([0, 0]));
        it('should handle large values', () => {
            const [l, u] = computeDefaultBounds(1e6);
            expect(l).toBeCloseTo(900000);
            expect(u).toBeCloseTo(1100000);
        });
        it('should clamp lower bound to 0', () => {
            // Technically 10% logic keeps it positive if input positive.
            // If input close to 0? 1e-10 -> 0.9e-10, 1.1e-10.
            const [l, u] = computeDefaultBounds(1e-10);
            expect(l).toBeGreaterThan(0);
        });
        // Add more permutations
        for (let i = 0; i < 10; i++) {
            it(`should compute valid bounds for random input ${i}`, () => {
                const val = Math.random() * 100;
                const [l, u] = computeDefaultBounds(val);
                expect(l).toBeLessThan(val);
                expect(u).toBeGreaterThan(val);
            });
        }
    });

    describe('formatNumber helper', () => {
        it('uses scientific notation when value < 1', () => {
            expect(formatNumber(0.5)).toBe('5.00e-1');
            expect(formatNumber(-0.01)).toBe('-1.00e-2');
        });
        it('uses scientific notation when value > 1000', () => {
            expect(formatNumber(1001)).toBe('1.00e+3');
            expect(formatNumber(-12345)).toBe('-1.23e+4');
        });
        it('uses plain formatting for 1 <= value <= 1000', () => {
            expect(formatNumber(1)).toBe('1.000');
            expect(formatNumber(999.9)).toBe('999.900');
            expect(formatNumber(1000)).toBe('1000.000');
        });
    });

    describe('generateRange (Linear)', () => {
        it('should generate simple 0-10 range', () => {
            const r = generateRange(0, 10, 11);
            expect(r[0]).toBe(0);
            expect(r[10]).toBe(10);
            expect(r.length).toBe(11);
        });
        it('should handle 1 step (start only)', () => {
            expect(generateRange(0, 10, 1)).toEqual([0]);
        });
        it('should handle 2 steps (start, end)', () => {
            expect(generateRange(0, 10, 2)).toEqual([0, 10]);
        });
        it('should handle floating point precision', () => {
            const r = generateRange(0, 1, 3); // 0, 0.5, 1
            expect(r).toEqual([0, 0.5, 1]);
        });
        it('should handle negative range', () => {
            const r = generateRange(-10, 0, 11);
            expect(r[0]).toBe(-10);
            expect(r[10]).toBe(0);
        });
        it('should handle decreasing range', () => {
            const r = generateRange(10, 0, 11);
            expect(r[0]).toBe(10);
            expect(r[1]).toBe(9);
            expect(r[10]).toBe(0);
        });
        // Stress test linear
        for (let i = 0; i < 20; i++) {
            it(`should generate correct length for linear input ${i}`, () => {
                const steps = 5 + i;
                const r = generateRange(0, 100, steps);
                expect(r.length).toBe(steps);
                expect(r[0]).toBe(0);
                expect(r[r.length - 1]).toBe(100);
            });
        }
    });

    describe('generateRange (Log)', () => {
        it('should generate log range 1-100', () => {
            const r = generateRange(1, 100, 3, true); // 1, 10, 100
            expect(r[0]).toBe(1);
            expect(r[1]).toBeCloseTo(10);
            expect(r[2]).toBe(100);
        });
        it('should fallback to linear if start is 0', () => {
            const r = generateRange(0, 10, 3, true);
            expect(r).toEqual([0, 5, 10]);
        });
        it('should fallback to linear if start is negative', () => {
            const r = generateRange(-1, 10, 3, true);
            // Linear from -1 to 10: -1, 4.5, 10
            expect(r[0]).toBe(-1);
            expect(r[2]).toBe(10);
        });
        it('should handle fractional log range', () => {
            const r = generateRange(0.1, 10, 3, true); // 0.1, 1, 10
            expect(r[0]).toBe(0.1);
            expect(r[1]).toBeCloseTo(1);
            expect(r[2]).toBe(10);
        });
        // Stress test log
        for (let i = 0; i < 20; i++) {
            it(`should generate correct length for log input ${i}`, () => {
                const steps = 5 + i;
                const r = generateRange(1, 1000, steps, true);
                expect(r.length).toBe(steps);
                expect(r[0]).toBe(1);
                // Last point might have precision issues but should be close
                expect(Math.abs(r[r.length - 1] - 1000)).toBeLessThan(1e-9);
            });
        }
    });



    describe('validateScanSettings', () => {
        it('should accept valid input', () => {
            expect(validateScanSettings('k', '0', '10', '10', false)).toBe(true);
        });
        it('should reject empty param', () => {
            expect(validateScanSettings('', '0', '10', '10', false)).toBe(false);
        });
        it('should reject empty start', () => {
            expect(validateScanSettings('k', '', '10', '10', false)).toBe(false);
        });
        it('should reject non-numeric start', () => {
            expect(validateScanSettings('k', 'abc', '10', '10', false)).toBe(false);
        });
        it('should reject invalid steps < 1', () => {
            expect(validateScanSettings('k', '0', '10', '0', false)).toBe(false);
        });
        it('should reject negative steps', () => {
            expect(validateScanSettings('k', '0', '10', '-5', false)).toBe(false);
        });
        it('should reject log with 0 start', () => {
            expect(validateScanSettings('k', '0', '10', '10', true)).toBe(false);
        });
        it('should reject log with negative end', () => {
            expect(validateScanSettings('k', '1', '-10', '10', true)).toBe(false);
        });
        it('should allow linear with negative range', () => {
            expect(validateScanSettings('k', '-10', '10', '10', false)).toBe(true);
        });

        // Permutations of validity
        const validP = 'p';
        const validS = '1';
        const validE = '10';
        const validSt = '5';

        it('rejects missing end', () => expect(validateScanSettings(validP, validS, '', validSt, false)).toBe(false));
        it('rejects missing steps', () => expect(validateScanSettings(validP, validS, validE, '', false)).toBe(false));
        it('rejects Infinity', () => expect(validateScanSettings(validP, 'Infinity', validE, validSt, false)).toBe(false));

        // Generate 20 random tests
        for (let i = 0; i < 20; i++) {
            it(`should handle random validation input ${i}`, () => {
                const isBad = Math.random() > 0.5;
                const s = isBad ? 'bad' : '10';
                expect(validateScanSettings(validP, s, validE, validSt, false)).toBe(!isBad);
            });
        }
    });
});
