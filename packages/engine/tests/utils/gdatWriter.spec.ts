import { describe, it, expect } from 'vitest';
import { gdatFromResults } from '../../src/utils/gdatWriter';
import type { SimulationResults } from '../../src/types';

describe('gdatFromResults', () => {
  it('should correctly format SimulationResults into a gdat string', () => {
    const results: SimulationResults = {
      headers: ['time', 'A', 'B'],
      data: [
        { time: 0, A: 10, B: 0 },
        { time: 1, A: 5, B: 5 },
        { time: 2, A: 0, B: 10 }
      ]
    };

    const expected = `# time\tA\tB
0\t10\t0
1\t5\t5
2\t0\t10
`;

    expect(gdatFromResults(results)).toBe(expected);
  });

  it('should infer headers if headers array is empty', () => {
    const results: SimulationResults = {
      headers: [],
      data: [
        { time: 0, A: 10 },
        { time: 1, A: 5, B: 5 }
      ]
    };

    const expected = `# time\tA\tB
0\t10\tNaN
1\t5\t5
`;
    expect(gdatFromResults(results)).toBe(expected);
  });

  it('should handle missing data appropriately by returning just the header', () => {
    const results: SimulationResults = {
      headers: ['time', 'A'],
      data: []
    };

    const expected = `# time\tA\n`;
    expect(gdatFromResults(results)).toBe(expected);
  });

  it('should return empty string or # if both data and headers are empty', () => {
    const results: SimulationResults = {
      headers: [],
      data: []
    };

    // Based on implementation:
    // rows = []
    // headers = inferHeaders([]) -> []
    // lines = [`# `]
    // join('\n') -> `# \n`
    const expected = `# \n`;
    expect(gdatFromResults(results)).toBe(expected);
  });

  it('should handle undefined values and Infinity gracefully, replacing with NaN or handling depending on implementation', () => {
    const results: SimulationResults = {
      headers: ['time', 'A', 'B'],
      data: [
        { time: 0, A: 10, B: Infinity },
        { time: 1, A: undefined as any, B: NaN }
      ]
    };

    const expected = `# time\tA\tB
0\t10\tNaN
1\tNaN\tNaN
`;
    expect(gdatFromResults(results)).toBe(expected);
  });
});
