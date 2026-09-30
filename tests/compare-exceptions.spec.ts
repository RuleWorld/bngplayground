/**
 * The reference comparator must decide whether a model is comparable from the
 * model source, not from a list of model names. A name list meant every new
 * scan/bifurcate or SSA model had to be added by hand, and each entry silently
 * suppressed every *other* failure for that model too.
 */
import { describe, it, expect } from 'vitest';

import { detectUnsupportedFeature, EXPECTED_MISMATCHES } from '../tools/validation/compareShared';

const withActions = (body: string) => `begin model\nbegin reactions\nend reactions\n${body}\nend model\n`;

describe('detectUnsupportedFeature', () => {
  it('returns null for an ordinary ODE model', () => {
    const bngl = withActions('simulate({method=>"ode",t_end=>100,n_steps=>10})');
    expect(detectUnsupportedFeature(bngl)).toBeNull();
  });

  it('detects parameter_scan without being told the model name', () => {
    const bngl = withActions('parameter_scan({parameter=>"k1",par_min=>1,par_max=>10,n_scan_pts=>10})');
    expect(detectUnsupportedFeature(bngl)).toMatch(/scan\/bifurcate/);
  });

  it('detects bifurcate', () => {
    expect(detectUnsupportedFeature(withActions('bifurcate({parameter=>"k1"})'))).toMatch(/scan\/bifurcate/);
  });

  it('detects a simulate method that is not ODE', () => {
    expect(detectUnsupportedFeature(withActions('simulate({method=>"ssa",t_end=>10})'))).toMatch(
      /method mismatch: web=ODE, BNG2=ssa/
    );
    expect(detectUnsupportedFeature(withActions('simulate({method=>"nf",t_end=>10})'))).toMatch(/BNG2=nf/);
  });

  it('treats an unspecified or default method as comparable', () => {
    expect(detectUnsupportedFeature(withActions('simulate({t_end=>10})'))).toBeNull();
    expect(detectUnsupportedFeature(withActions('simulate({method=>"default",t_end=>10})'))).toBeNull();
  });

  it('ignores commented-out actions', () => {
    const bngl = withActions('# parameter_scan({parameter=>"k1"})\n# simulate({method=>"ssa"})');
    expect(detectUnsupportedFeature(bngl)).toBeNull();
  });

  it('flags a commented scan only if it is not a comment', () => {
    const bngl = 'begin model\nsimulate({method=>"ode"})\nparameter_scan({})\nend model';
    expect(detectUnsupportedFeature(bngl)).toMatch(/scan\/bifurcate/);
  });
});

describe('EXPECTED_MISMATCHES is not a per-model catch-all', () => {
  it('holds only solver-behaviour justifications', () => {
    for (const [model, reason] of Object.entries(EXPECTED_MISMATCHES)) {
      expect(reason).not.toMatch(/__FREE|scan\/bifurcate|method mismatch/i);
      expect(model).not.toMatch(/tofit/i);
    }
  });

  it('no longer allowlists PyBNF fitting templates that are now comparable', () => {
    // These were suppressed as "__FREE params not set"; both engines now
    // resolve X__FREE to 0, so they must be compared like any other model.
    for (const key of ['06degranulationmodeltofit', 'rafiground', 'example5fit', 'pt303']) {
      const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
      expect(EXPECTED_MISMATCHES[normalized]).toBeUndefined();
    }
  });

  it('stays small', () => {
    expect(Object.keys(EXPECTED_MISMATCHES).length).toBeLessThanOrEqual(6);
  });
});
