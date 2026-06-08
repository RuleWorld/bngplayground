import { describe, it, expect } from 'vitest';
import { parsePEtab, parsePEtabCombined } from '../../src/services/analysis/petabImport';

describe('PEtabImport', () => {
  it('parses PEtab files correctly', () => {
    const files = new Map<string, string>();
    files.set('parameters.tsv', `
parameterId\tparameterScale\tlowerBound\tupperBound\tnominalValue\testimate
p1\tlin\t0.1\t10\t1\t1
p2\tlog\t0.01\t100\t0.5\t0
`);
    files.set('measurements.tsv', `
observableId\tsimulationConditionId\ttime\tmeasurement
obs1\tcond1\t1.0\t5.5
obs1\tcond1\t2.0\t10.1
`);
    files.set('conditions.tsv', `
conditionId\tp1\tp2
cond1\t2.0\t3.0
`);
    files.set('observables.tsv', `
observableId\tobservableFormula\tobservableTransformation\tnoiseFormula\tnoiseDistribution
obs1\tA+B\tlin\t1.0\tnormal
`);
    files.set('problem.yaml', `
format_version: 1
`);

    const result = parsePEtab(files);

    expect(result.parameters.length).toBe(2);
    expect(result.parameters[0].parameterId).toBe('p1');
    expect(result.parameters[0].estimate).toBe(true);
    expect(result.parameters[0].parameterScale).toBe('lin');

    expect(result.measurements.length).toBe(2);
    expect(result.measurements[0].time).toBe(1.0);
    expect(result.measurements[0].values['obs1']).toBe(5.5);

    expect(result.conditions.size).toBe(1);
    expect(result.conditions.get('cond1')).toEqual({ p1: 2.0, p2: 3.0 });

    expect(result.observables.length).toBe(1);
    expect(result.observables[0].observableId).toBe('obs1');
    expect(result.observables[0].observableFormula).toBe('A+B');

    expect(result.paramBounds.length).toBe(1);
    expect(result.paramBounds[0].name).toBe('p1');
    expect(result.paramBounds[0].min).toBe(0.1);
    expect(result.paramBounds[0].max).toBe(10);
  });

  it('handles missing files or empty problem gracefully with warnings', () => {
    const files = new Map<string, string>();
    expect(() => parsePEtab(files)).toThrowError(/no parameters.tsv file was found/);
  });

  it('parses combined PEtab format correctly', () => {
    const combined = `
[parameters]
parameterId\tparameterScale\tlowerBound\tupperBound\tnominalValue\testimate
k1\tlin\t0.1\t10\t1\t1

[measurements]
observableId\tsimulationConditionId\ttime\tmeasurement
obsA\tdefault\t0.0\t10
obsA\tdefault\t10.0\t5
`;

    const result = parsePEtabCombined(combined);

    expect(result.parameters.length).toBe(1);
    expect(result.parameters[0].parameterId).toBe('k1');

    expect(result.measurements.length).toBe(2);
    expect(result.measurements[0].time).toBe(0.0);
    expect(result.measurements[1].time).toBe(10.0);
    expect(result.measurements[0].values['obsA']).toBe(10);
    expect(result.measurements[1].values['obsA']).toBe(5);
  });
});

describe('PEtabImport - advanced handling', () => {
  it('handles errors if measurements file missing', () => {
    const files = new Map<string, string>();
    files.set('parameters.tsv', `
parameterId\tparameterScale\tlowerBound\tupperBound\tnominalValue\testimate
p1\tlin\t0.1\t10\t1\t1
`);
    expect(() => parsePEtab(files)).toThrowError(/no measurements.tsv file was found/);
  });

  it('handles spaces and lists in yaml', () => {
    const files = new Map<string, string>();
    files.set('parameters.tsv', `
parameterId\testimate
p1\t1
`);
    files.set('measurements.tsv', `
observableId\ttime\tmeasurement
obs1\t1.0\t5.5
`);
    files.set('.yaml', `
# Comment
format_version: 1
problems:
  - problem1
  - problem2
`);

    const result = parsePEtab(files);
    // As long as yaml doesn't crash
    expect(result.parameters.length).toBe(1);
    expect(result.warnings.length).toBe(0);
  });

  it('returns empty measurements list when no data is parsed from measurements.tsv', () => {
      const files = new Map<string, string>();
      files.set('parameters.tsv', 'parameterId\testimate\np1\t1\n');
      files.set('measurements.tsv', '# just comments\n');
      const result = parsePEtab(files);
      expect(result.measurements.length).toBe(0);
  });

  it('adds warning if no parameters are marked to estimate', () => {
      const files = new Map<string, string>();
      files.set('parameters.tsv', 'parameterId\testimate\np1\t0\n');
      files.set('measurements.tsv', 'observableId\ttime\tmeasurement\nobs1\t1.0\t5.5\n');
      const result = parsePEtab(files);
      expect(result.warnings.some(w => w.includes('No parameters marked for estimation'))).toBe(true);
  });

  it('skips invalid rows in conditions', () => {
      const files = new Map<string, string>();
      files.set('parameters.tsv', 'parameterId\testimate\np1\t1\n');
      files.set('measurements.tsv', 'observableId\ttime\tmeasurement\nobs1\t1.0\t5.5\n');
      files.set('conditions.tsv', 'conditionId\tp1\tinvalid\ncond1\t2.0\tnotanumber\n');
      const result = parsePEtab(files);
      expect(result.conditions.get('cond1')).toEqual({ p1: 2.0 });
  });

  it('parses partially invalid rows in parameters', () => {
      const files = new Map<string, string>();
      files.set('parameters.tsv', 'parameterId\testimate\n1\n');
      files.set('measurements.tsv', 'observableId\ttime\tmeasurement\nobs1\t1.0\t5.5\n');
      const result = parsePEtab(files);
      expect(result.parameters.length).toBe(1);
  });

  it('skips invalid rows in measurements', () => {
      const files = new Map<string, string>();
      files.set('parameters.tsv', 'parameterId\testimate\np1\t1\n');
      files.set('measurements.tsv', 'observableId\ttime\tmeasurement\n\t1.0\t5.5\n');
      const result = parsePEtab(files);
      expect(result.measurements.length).toBe(0);
  });

  it('parses partially invalid rows in observables', () => {
      const files = new Map<string, string>();
      files.set('parameters.tsv', 'parameterId\testimate\np1\t1\n');
      files.set('measurements.tsv', 'observableId\ttime\tmeasurement\nobs1\t1.0\t5.5\n');
      files.set('observables.tsv', 'observableId\tobservableFormula\nA\n');
      const result = parsePEtab(files);
      expect(result.observables.length).toBe(1);
  });
});

describe('PEtabImport - YAML edge cases', () => {
  it('tests yaml simple parser comment strip', () => {
    const files = new Map<string, string>();
    files.set('parameters.tsv', `
parameterId\tparameterScale\tlowerBound\tupperBound\tnominalValue\testimate
p1\tlin\t0.1\t10\t1\t1
`);
    files.set('measurements.tsv', `
observableId\tsimulationConditionId\ttime\tmeasurement
obs1\tcond1\t1.0\t5.5
`);
    files.set('.yaml', `
# Comment
format_version: 1
problems:
  - problem1 # comment
  - problem2
`);

    const result = parsePEtab(files);
    // As long as yaml doesn't crash
    expect(result.parameters.length).toBe(1);
    expect(result.warnings.length).toBe(0);
  });

  it('tests unhandled yaml list block', () => {
    const files = new Map<string, string>();
    files.set('parameters.tsv', `
parameterId\tparameterScale\tlowerBound\tupperBound\tnominalValue\testimate
p1\tlin\t0.1\t10\t1\t1
`);
    files.set('measurements.tsv', `
observableId\tsimulationConditionId\ttime\tmeasurement
obs1\tcond1\t1.0\t5.5
`);
    files.set('.yaml', `
- item1
- item2
`);

    const result = parsePEtab(files);
    // As long as yaml doesn't crash
    expect(result.parameters.length).toBe(1);
    expect(result.warnings.length).toBe(0);
  });

  it('tests yaml with list missing currentKey', () => {
    const files = new Map<string, string>();
    files.set('parameters.tsv', `
parameterId\tparameterScale\tlowerBound\tupperBound\tnominalValue\testimate
p1\tlin\t0.1\t10\t1\t1
`);
    files.set('measurements.tsv', `
observableId\tsimulationConditionId\ttime\tmeasurement
obs1\tcond1\t1.0\t5.5
`);
    files.set('.yaml', `
key1:
- item1
- item2
key2:
`);

    const result = parsePEtab(files);
    // As long as yaml doesn't crash
    expect(result.parameters.length).toBe(1);
    expect(result.warnings.length).toBe(0);
  });
});
