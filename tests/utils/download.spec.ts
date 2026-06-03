import { describe, it, expect } from 'vitest';
import { toCsv } from '../../src/utils/download';

describe('toCsv', () => {
  it('should handle empty or null data', () => {
    expect(toCsv([], ['time'])).toBe('');
    expect(toCsv(null as any, ['time'])).toBe('');
    expect(toCsv(undefined as any, ['time'])).toBe('');
  });

  it('should format data to CSV correctly', () => {
    const data = [
      { time: 0, A: 1, B: 2.5 },
      { time: 1, A: 2, B: 3.5 }
    ];
    const headers = ['time', 'A', 'B'];
    const csv = toCsv(data, headers);

    // time column should be formatted using toBngScientific12
    const expected = [
      'time,A,B',
      '0.000000000000e+00,1,2.5',
      '1.000000000000e+00,2,3.5'
    ].join('\n');

    expect(csv).toBe(expected);
  });

  it('should ensure time is the first column even if not first in headers', () => {
    const data = [
      { time: 0, A: 1 }
    ];
    // A is before time
    const headers = ['A', 'time'];
    const csv = toCsv(data, headers);

    const expected = [
      'time,A',
      '0.000000000000e+00,1'
    ].join('\n');

    expect(csv).toBe(expected);
  });

  it('should handle missing values', () => {
    const data = [
      { time: 0, A: 1 },
      { time: 1 } // missing A
    ];
    const headers = ['time', 'A'];
    const csv = toCsv(data, headers);

    const expected = [
      'time,A',
      '0.000000000000e+00,1',
      '1.000000000000e+00,' // empty string for missing value
    ].join('\n');

    expect(csv).toBe(expected);
  });
});
