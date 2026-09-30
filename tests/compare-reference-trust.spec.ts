/**
 * The trajectory gate must not manufacture failures from the reference side.
 *
 * Two failure modes are covered here, both of which reported a divergence that
 * belonged to something other than the model under test:
 *
 *  1. BNG2's `.gdat` is a superset of what the web simulator exports — it also
 *     writes the model's parameters and the `_rateLaw*` helpers it synthesises
 *     for functional rate rules. Requiring an identical column set failed
 *     parabola/polynomial/pt403/pt409/dallas/houston/Alabama, whose every
 *     shared column agreed to ~1e-13.
 *  2. RuleHub holds distinct models that share a basename (`egg.bngl` exists
 *     three times), and the reference generator keys its output on that
 *     basename. A web run can therefore be compared against another model's
 *     reference and report a divergence that is not its own.
 */
import { describe, it, expect } from 'vitest';

import { compareColumnCoverage, parameterValues, referenceMatchesModel } from '../tools/validation/compareShared';

describe('compareColumnCoverage', () => {
  it('accepts a reference that carries parameter columns the web cannot export', () => {
    // parabola: BNG2 writes a,b,c,d,e (the __FREE parameters) alongside x/par/line.
    const coverage = compareColumnCoverage(
      ['time', 'x', 'par', 'line'],
      ['time', 'x', 'a', 'b', 'c', 'd', 'e', 'par', 'line'],
    );
    expect(coverage.columnMatch).toBe(true);
    expect(coverage.matchedColumns).toEqual(['line', 'par', 'x']);
    expect(coverage.referenceOnlyColumns).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(coverage.webOnlyColumns).toEqual([]);
  });

  it('accepts a reference that carries BNG2-generated _rateLaw helpers', () => {
    // dallas/houston: BNG2 emits _rateLaw1.._rateLaw51 for the functional rate rules.
    const coverage = compareColumnCoverage(
      ['time', 'I_M', 'I_Q', 'PhiV'],
      ['time', 'I_M', 'I_Q', 'PhiV', '_rateLaw1', '_rateLaw3', '_rateLaw51'],
    );
    expect(coverage.columnMatch).toBe(true);
  });

  it('rejects a web column the reference does not report', () => {
    const coverage = compareColumnCoverage(['time', 'x', 'surprise'], ['time', 'x', 'a']);
    expect(coverage.columnMatch).toBe(false);
    expect(coverage.webOnlyColumns).toEqual(['surprise']);
  });

  it('reports low coverage instead of silently accepting a near-total mismatch', () => {
    const coverage = compareColumnCoverage(
      ['time', 'x', 'y', 'z', 'w'],
      ['time', 'x', 'a', 'b', 'c'],
    );
    expect(coverage.lowCoverage).toBe(true);
    expect(coverage.columnMatch).toBe(false);
  });

  it('ignores case and spacing differences when matching column names', () => {
    const coverage = compareColumnCoverage(['Time', 'I_M'], ['time', 'i_m']);
    expect(coverage.columnMatch).toBe(true);
    expect(coverage.matchedColumns).toEqual(['i_m']);
  });
});

describe('parameterValues', () => {
  it('reads both `name value` and `name=value` forms', () => {
    const values = parameterValues(
      ['begin model', 'begin parameters', '  k1 0.5', '  pi=2*asin(1)', '  bx 50 # molecules', 'end parameters', 'end model'].join('\n'),
    );
    expect(values.get('k1')).toBe('0.5');
    expect(values.get('pi')).toBe('2*asin(1)');
    expect(values.get('bx')).toBe('50');
  });

  it('resolves an undefined __FREE reference to 0, the way both engines do', () => {
    const values = parameterValues(
      ['begin parameters', '  a a__FREE', 'end parameters'].join('\n'),
    );
    expect(values.get('a')).toBe('0');
  });

  it('keeps a defined __FREE value', () => {
    const values = parameterValues(
      ['begin parameters', '  a__FREE 9.99e+01', '  a a__FREE', 'end parameters'].join('\n'),
    );
    expect(values.get('a')).toBe('9.99e+01');
  });
});

describe('referenceMatchesModel', () => {
  const mitraEgg = [
    'begin model',
    'begin parameters',
    '  a0 a0__FREE',
    '  a1 a1__FREE',
    '  a2 a2__FREE',
    '  pi=2*asin(1)',
    '  period 180',
    'end parameters',
    'begin reaction rules',
    '  0->t 1',
    'end reaction rules',
    'end model',
  ].join('\n');

  it('treats a generator-injected __FREE default as the same model', () => {
    const generated = [
      'begin model',
      'begin parameters',
      '  a0 a0__FREE',
      '  a1 a1__FREE',
      '  a2 a2__FREE',
      '  pi=2*asin(1)',
      '  period 180',
      "# [auto-generated] PyBNF __FREE defaults",
      'a0__FREE 0',
      'a1__FREE 0',
      'a2__FREE 0',
      'end parameters',
      'begin reaction rules',
      '  0->t 1',
      'end reaction rules',
      'end model',
      'generate_network({overwrite=>1})',
    ].join('\n');
    expect(referenceMatchesModel(generated, mitraEgg)).toBe(true);
  });

  it('rejects a reference generated from a sibling model that shares the basename', () => {
    // Hlavacek2018Egg/egg.bngl: the same model with fitted __FREE values baked in.
    const hlavacekEgg = [
      'begin model',
      'begin parameters',
      '  a0__FREE 9.99318747e+01',
      '  a1__FREE 1.00606018e+00',
      '  a2__FREE -7.52962956e-01',
      '  pi=2*asin(1)',
      '  period 180',
      '  a0 a0__FREE',
      '  a1 a1__FREE',
      '  a2 a2__FREE',
      'end parameters',
      'begin reaction rules',
      '  0->t 1',
      'end reaction rules',
      'end model',
    ].join('\n');
    expect(referenceMatchesModel(hlavacekEgg, mitraEgg)).toBe(false);
  });

  it('accepts a reference regenerated from the very same model', () => {
    const same = `${mitraEgg}\ngenerate_network({overwrite=>1})`;
    expect(referenceMatchesModel(same, mitraEgg)).toBe(true);
  });
});
