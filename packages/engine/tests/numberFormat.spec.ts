import { describe, it, expect } from 'vitest';
import { formatNumber, formatNumberBNGL, formatNumberDisplay } from '../src/utils/numberFormat';

describe('numberFormat', () => {
  describe('formatNumber', () => {
    it('returns "0" or nonFiniteValue for non-finite values', () => {
      expect(formatNumber(NaN)).toBe('0');
      expect(formatNumber(Infinity)).toBe('0');
      expect(formatNumber(-Infinity)).toBe('0');
      expect(formatNumber(NaN, { nonFiniteValue: 'NaN' })).toBe('NaN');
    });

    it('uses scientific notation above sciUpperThreshold', () => {
      expect(formatNumber(1e7, { sciUpperThreshold: 1e6 })).toBe((1e7).toExponential());
      expect(formatNumber(1001, { sciUpperThreshold: 1000 })).toBe((1001).toExponential());
    });

    it('uses scientific notation below sciLowerThreshold', () => {
      expect(formatNumber(1e-4, { sciLowerThreshold: 1e-3 })).toBe((1e-4).toExponential());
      expect(formatNumber(0.5, { sciLowerThreshold: 1 })).toBe((0.5).toExponential());
    });

    it('returns 0 natively without scientific notation even if 0 < lowerThreshold', () => {
      expect(formatNumber(0, { sciLowerThreshold: 1e-3 })).toBe('0');
      expect(formatNumber(0, { sciLowerThreshold: 1 })).toBe('0');
    });

    it('formats normal values with fixedPrecision if specified', () => {
      expect(formatNumber(1.2345, { fixedPrecision: 3 })).toBe('1.234');
      expect(formatNumber(1, { fixedPrecision: 3 })).toBe('1.000');
    });

    it('removes unnecessary trailing zeros without fixedPrecision', () => {
      expect(formatNumber(1.2300)).toBe('1.23');
      expect(formatNumber(1.0)).toBe('1');
      expect(formatNumber(10)).toBe('10'); // don't remove 0 before decimal
      expect(formatNumber(10.0)).toBe('10');
      expect(formatNumber(1.000000000)).toBe('1');
    });

    it('formats sci notation with sciPrecision if specified', () => {
      expect(formatNumber(1e7, { sciUpperThreshold: 1e6, sciPrecision: 2 })).toBe('1.00e+7');
    });
  });

  describe('formatNumberBNGL', () => {
    it('matches legacy BNGLWriter behavior', () => {
      expect(formatNumberBNGL(NaN)).toBe('0');
      expect(formatNumberBNGL(1e7)).toBe((1e7).toExponential());
      expect(formatNumberBNGL(1e-4)).toBe((1e-4).toExponential());
      expect(formatNumberBNGL(1.2300)).toBe('1.23');
      expect(formatNumberBNGL(0)).toBe('0');
    });
  });

  describe('formatNumberDisplay', () => {
    it('matches legacy ParameterScan behavior', () => {
      expect(formatNumberDisplay(NaN)).toBe('0');
      expect(formatNumberDisplay(1001)).toBe((1001).toExponential(2));
      expect(formatNumberDisplay(0.5)).toBe((0.5).toExponential(2));
      expect(formatNumberDisplay(1.2345)).toBe('1.234');
      expect(formatNumberDisplay(0)).toBe('0.000'); // 0 with 3 decimal places from toFixed(3)
    });
  });
});
