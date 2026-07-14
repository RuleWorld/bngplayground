import { describe, it, expect } from 'vitest';
import { parseGdat } from '../../src/services/simulation/GdatParser';

describe('GdatParser', () => {
  it('parses standard space-separated gdat with header', () => {
    const gdat = `
# time O1 O2
0 1 2
1 3 4
    `;
    const result = parseGdat(gdat);
    expect(result.headers).toEqual(['time', 'O1', 'O2']);
    expect(result.data).toEqual([
      { time: 0, O1: 1, O2: 2 },
      { time: 1, O1: 3, O2: 4 },
    ]);
    expect(result.rawHeaderLine).toBe('# time O1 O2');
  });

  it('parses comma-separated gdat with header', () => {
    const gdat = `
# time,O1,O2
0,1,2
1,3,4
    `;
    const result = parseGdat(gdat);
    expect(result.headers).toEqual(['time', 'O1', 'O2']);
    expect(result.data).toEqual([
      { time: 0, O1: 1, O2: 2 },
      { time: 1, O1: 3, O2: 4 },
    ]);
  });

  it('parses tab-separated gdat with header', () => {
    const gdat = `
# time\tO1\tO2
0\t1\t2
1\t3\t4
    `;
    const result = parseGdat(gdat);
    expect(result.headers).toEqual(['time', 'O1', 'O2']);
    expect(result.data).toEqual([
      { time: 0, O1: 1, O2: 2 },
      { time: 1, O1: 3, O2: 4 },
    ]);
  });

  it('handles missing header (infers headers from data)', () => {
    const gdat = `
0 1 2
1 3 4
    `;
    const result = parseGdat(gdat);
    expect(result.headers).toEqual(['time', 'O1', 'O2']);
    expect(result.data).toEqual([
      { time: 0, O1: 1, O2: 2 },
      { time: 1, O1: 3, O2: 4 },
    ]);
    expect(result.rawHeaderLine).toBeUndefined();
  });

  it('ignores comments and empty lines', () => {
    const gdat = `
# time O1 O2
# This is a comment
0 1 2

1 3 4
    `;
    const result = parseGdat(gdat);
    expect(result.headers).toEqual(['time', 'O1', 'O2']);
    expect(result.data).toEqual([
      { time: 0, O1: 1, O2: 2 },
      { time: 1, O1: 3, O2: 4 },
    ]);
  });

  it('handles headers that are not named "time"', () => {
    const gdat = `
# T O1 O2
0 1 2
1 3 4
    `;
    const result = parseGdat(gdat);
    expect(result.headers).toEqual(['T', 'O1', 'O2']);
    expect(result.data).toEqual([
      { T: 0, O1: 1, O2: 2 },
      { T: 1, O1: 3, O2: 4 },
    ]);
  });

  it('ignores extra columns in data', () => {
    const gdat = `
# time O1
0 1 2
1 3 4
    `;
    const result = parseGdat(gdat);
    expect(result.headers).toEqual(['time', 'O1']);
    expect(result.data).toEqual([
      { time: 0, O1: 1 },
      { time: 1, O1: 3 },
    ]);
  });

  it('handles empty gdat', () => {
    const result = parseGdat('');
    expect(result.headers).toEqual(['time']);
    expect(result.data).toEqual([]);
  });

  it('handles non-numeric values gracefully (sets to 0 if NaN)', () => {
    const gdat = `
# time O1
0 NaN
1 abc
    `;
    const result = parseGdat(gdat);
    expect(result.headers).toEqual(['time', 'O1']);
    expect(result.data).toEqual([
      { time: 0, O1: 0 },
      { time: 1, O1: 0 },
    ]);
  });

  it('parses scientific notation', () => {
    const gdat = `
# time O1
0 1e-3
1 2.5E4
    `;
    const result = parseGdat(gdat);
    expect(result.headers).toEqual(['time', 'O1']);
    expect(result.data).toEqual([
      { time: 0, O1: 0.001 },
      { time: 1, O1: 25000 },
    ]);
  });
});
