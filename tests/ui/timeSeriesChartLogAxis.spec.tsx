import { describe, expect, it } from 'vitest';
import { buildLogTicks, computeLogYAxisDomain } from '../../components/charts/TimeSeriesChart';

const SERIES = [{ name: 'A0' }, { name: 'Obs' }];

/** Mirrors the log transform `plotData` applies: values <= 0 become `null`. */
function toLogPlotData(rows: Array<Record<string, number | null>>) {
  return rows.map(row => {
    const next: Record<string, unknown> = {};
    for (const s of SERIES) {
      const raw = row[s.name];
      next[`__${s.name}`] = raw !== null && raw > 0 ? Math.log10(raw) : null;
    }
    return next;
  });
}

describe('computeLogYAxisDomain', () => {
  it('ignores points that cannot be plotted on a log axis', () => {
    // Zero, negative and missing observables all land in the same bucket as a
    // real point of 1 unless they are filtered before the numeric conversion.
    const plotData = toLogPlotData([
      { A0: 10, Obs: 0 },
      { A0: 1000, Obs: -5 },
      { A0: null, Obs: null },
    ]);

    expect(computeLogYAxisDomain(plotData, SERIES)).toEqual([1, 3]);
  });

  it('is not pulled up to log10(1) by a series with no plottable values', () => {
    const plotData = toLogPlotData([
      { A0: 10, Obs: null },
      { A0: 1000, Obs: 0 },
    ]);

    // [1, 3] in log10 space, i.e. a raw floor of 10. Treating the nulls as
    // log10(1) would yield [0, 3] and clip everything between 1 and 10.
    expect(computeLogYAxisDomain(plotData, SERIES)).toEqual([1, 3]);
  });

  it('spans the full data range including sub-unity values', () => {
    const plotData = toLogPlotData([
      { A0: 5e-4, Obs: null },
      { A0: 1.58e-2, Obs: 3 },
      { A0: 5.01e-1, Obs: null },
    ]);

    // A0 supplies the floor (5e-4); Obs supplies the ceiling (3).
    expect(computeLogYAxisDomain(plotData, SERIES)).toEqual([Math.log10(5e-4), Math.log10(3)]);
  });

  it('returns undefined when nothing is plottable, so the axis falls back to auto', () => {
    const plotData = toLogPlotData([{ A0: 0, Obs: -1 }, { A0: null, Obs: null }]);

    expect(computeLogYAxisDomain(plotData, SERIES)).toBeUndefined();
  });

  it('excludes NaN points rather than treating them as the domain floor', () => {
    const plotData = [{ __A0: 2, __Obs: Number.NaN }];

    expect(computeLogYAxisDomain(plotData, SERIES)).toEqual([2, 2]);
  });
});

describe('buildLogTicks', () => {
  it('places ticks on decades across a six-decade span', () => {
    expect(buildLogTicks(-3, 3)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });

  it('falls back to 1-2-5 subdivisions inside a narrow span', () => {
    expect(buildLogTicks(1, 2)).toEqual([
      1,
      1 + Math.log10(2),
      1 + Math.log10(5),
      2,
    ]);
  });

  it('returns only the domain edges when no tick fits inside a sub-decade span', () => {
    expect(buildLogTicks(Math.log10(50), Math.log10(90))).toEqual([
      Math.log10(50),
      Math.log10(90),
    ]);
  });

  it('strides across very wide spans instead of emitting every decade', () => {
    expect(buildLogTicks(-9, 9)).toEqual([-9, -6, -3, 0, 3, 6, 9]);
  });

  it('produces ticks that stay inside a data-derived log domain', () => {
    const plotData = toLogPlotData([{ A0: 5e-4, Obs: null }, { A0: 0.501, Obs: null }]);
    const domain = computeLogYAxisDomain(plotData, SERIES)!;

    const ticks = buildLogTicks(domain[0], domain[1]);

    expect(ticks[0]).toBeGreaterThanOrEqual(domain[0]);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(domain[1]);
    // Three visible decades take the 1-2-5 subdivision path, so every tick is
    // a decade or a 2x/5x multiple of one.
    expect(ticks.map(t => Number((10 ** t).toFixed(6)))).toEqual([
      0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5,
    ]);
  });
});
