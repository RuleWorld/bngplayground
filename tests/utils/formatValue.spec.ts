import { describe, it, expect } from 'vitest';
import { formatValue } from '../../src/utils/formatValue';

describe('formatValue', () => {
  it('should return "—" for undefined, null, or non-finite numbers', () => {
    expect(formatValue(undefined)).toBe('—');
    expect(formatValue(null as any)).toBe('—');
    expect(formatValue(NaN)).toBe('—');
    expect(formatValue(Infinity)).toBe('—');
    expect(formatValue(-Infinity)).toBe('—');
  });

  it('should return "0" for 0', () => {
    expect(formatValue(0)).toBe('0');
  });

  it('should use exponential notation for very small numbers (|v| < 1e-3)', () => {
    expect(formatValue(0.0009)).toBe('9.00e-4');
    expect(formatValue(-0.0009)).toBe('-9.00e-4');
    expect(formatValue(0.00001234)).toBe('1.23e-5');
  });

  it('should use exponential notation for very large numbers (|v| >= 1e4)', () => {
    expect(formatValue(10000)).toBe('1.00e+4');
    expect(formatValue(-10000)).toBe('-1.00e+4');
    expect(formatValue(123456)).toBe('1.23e+5');
  });

  it('should format intermediate numbers with up to 4 decimal places without trailing zeros', () => {
    expect(formatValue(1)).toBe('1');
    expect(formatValue(1.2)).toBe('1.2');
    expect(formatValue(1.2345)).toBe('1.2345');
    expect(formatValue(1.23456)).toBe('1.2346'); // Tests rounding
    expect(formatValue(-1.23456)).toBe('-1.2346');
    expect(formatValue(9999.9999)).toBe('9999.9999');
  });
});
