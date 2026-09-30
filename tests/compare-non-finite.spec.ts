/**
 * The trajectory gate's readers must not confuse a non-finite *value* with a
 * malformed cell.
 *
 * Both halves of this were broken at different times in the same session, and
 * each failure looked like an engine defect rather than a gate defect:
 *
 *  - The web exporter writes `-Infinity` / `Infinity` / `NaN` for a non-finite
 *    simulation result, because BNG2 evaluates with mu::Parser and writes
 *    `1.#INF` for the same thing. An earlier version emitted an empty cell
 *    instead, which the gate cannot parse back as a number.
 *  - The reader then used `parseFloat`, which reads `-Infinity` as NaN and
 *    throws. pt403 and pt409 reported as hard errors rather than comparisons.
 *
 * The reading is deliberately asymmetric: `Number()` so the IEEE literals parse
 * as values, but a genuinely non-numeric cell must still throw, and `1.#INF`
 * must NOT become the number 1 the way `parseFloat` read it.
 */
import { describe, it, expect } from 'vitest';

import { parseCSV, parseGDAT } from '../tools/validation/compareShared';

describe('parseCSV', () => {
  it('reads the IEEE literals the exporter writes as values, not errors', () => {
    const { headers, data } = parseCSV(
      [
        'time,lnV,V',
        '0,0,-Infinity',
        '1,1,Infinity',
        '2,2,NaN',
      ].join('\n'),
    );
    expect(headers).toEqual(['time', 'lnV', 'V']);
    expect(data[0]).toEqual([0, 0, -Infinity]);
    expect(data[1]).toEqual([1, 1, Infinity]);
    expect(Number.isNaN(data[2][2])).toBe(true);
  });

  it('still rejects a cell that is not a number at all', () => {
    // The relaxation above must not turn into "accept anything": a genuinely
    // malformed cell means the two sides are not comparable, which is a
    // different diagnosis and must stay an error.
    expect(() => parseCSV(['time,A', '0,not-a-number'].join('\n'))).toThrow(/Non-numeric CSV value/);
  });

  it('reads a plain empty cell as an error rather than a silent zero', () => {
    expect(() => parseCSV(['time,A', '0,'].join('\n'))).toThrow(/Non-numeric CSV value/);
  });
});

describe('parseGDAT', () => {
  it('does not read BNG2 infinity markers as the leading digit', () => {
    // `parseFloat('1.#INF')` is 1, so a failed reference solve scored as a
    // value of 1 and then compared within tolerance against a web run that also
    // produced 1 — a silent pass on a diverged run.
    const { data } = parseGDAT(
      ['# Time A', '0 1', '1 1.#INF', '2 3'].join('\n'),
    );
    expect(data[0][1]).toBe(1);
    expect(Number.isNaN(data[1][1])).toBe(true);
    expect(data[2][1]).toBe(3);
  });

  it('reads an ordinary numeric row unchanged', () => {
    const { headers, data } = parseGDAT(['# Time A B', '0 1 2', '1 3 4'].join('\n'));
    expect(headers).toEqual(['Time', 'A', 'B']);
    expect(data).toEqual([[0, 1, 2], [1, 3, 4]]);
  });
});
