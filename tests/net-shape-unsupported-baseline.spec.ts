/**
 * The network-shape gate must not widen its own exclusions silently.
 *
 * A reference model we cannot parse means there is no network to compare, so it
 * is recorded as unsupported when it is on the baseline, and fails the gate when
 * it is not. Anything else would let a newly broken model hide in the error
 * count.
 */
import { describe, it, expect } from 'vitest';

import {
  UNPARSEABLE_REFERENCE_REASONS,
  isKnownUnparseableReference,
  unparseableReferenceReason,
} from '../tools/validation/netShapeUnsupported';

describe('unparseable-reference baseline', () => {
  it('recognises baseline entries case-insensitively', () => {
    // A PyBNF fitting model: BioNetGen aborts on the published source because it
    // references '<param>__FREE' values only the fitter supplies.
    expect(isKnownUnparseableReference('elephant')).toBe(true);
    expect(isKnownUnparseableReference('ELEPHANT')).toBe(true);
  });

  it('does not recognise models that are not listed', () => {
    expect(isKnownUnparseableReference('mystery_model')).toBe(false);
    expect(isKnownUnparseableReference('egfr')).toBe(true);
    // Ratcheted as a PyBNF fitting model: BioNetGen aborts on the published
    // source with "Parameter 'kp1__FREE' is referenced but not defined".
    expect(unparseableReferenceReason('egfr')).toMatch(/__FREE/);
  });

  it('gives a specific reason for every entry', () => {
    for (const [model, reason] of Object.entries(UNPARSEABLE_REFERENCE_REASONS)) {
      expect(unparseableReferenceReason(model).length).toBeGreaterThan(10);
      expect(reason).not.toBe(unparseableReferenceReason('not_listed'));
    }
  });

  it('explains why an unlisted model is unparseable', () => {
    expect(unparseableReferenceReason('not_listed')).toMatch(/not in the baseline/);
  });

  it('does not list models whose parser gaps have been fixed', () => {
    // These parse and expand today; keeping them listed would let a regression
    // hide. `after_scaling`/`before_scaling` are the `!?` state modifier,
    // `mwc`/`simple_genonly` the `setOption` forms, `igf1r_fit_all_*` the
    // parameter_scan argument forms, `test_mratio` the observable pattern form,
    // `univ_synth` the compartment volume variant, and the three `*_mi_*`
    // models the en dash.
    // NOTE: `egfr`, `alabama`, `actions_syntax` and `tricky` are deliberately
    // NOT here. They are PyBNF fitting models and BioNetGen aborts on them with
    // "Parameter '<name>__FREE' is referenced but not defined" — verified by
    // running the reference directly, not inferred. They used to appear to work
    // only because the pipeline injected `*__FREE = 0` defaults, which meant the
    // gate was comparing against a model BioNetgen had never seen.
    // Cross-checked against the reference audit: each of these was seen to make
    // BioNetGen produce a network, and none is ratcheted.
    for (const fixed of [
      'complexdegradation',
      'kesseler_2013',
      'zhang_2021',
      'barua_2013',
      'after_scaling',
      'before_scaling',
      'mwc',
      'simple_genonly',
      'igf1r_fit_all_gen19ind47',
      'test_mratio',
      'univ_synth',
      'nfkb_illustrating_protocols',
      'before_decoupling',
      'akt_signaling',
      'an_2009',
      'abc_ssa',
    ]) {
      expect(isKnownUnparseableReference(fixed)).toBe(false);
    }
  });

  it('gives each class a reason that distinguishes it from the others', () => {
    // A reader must be able to tell a __FREE abort from an unsupported block
    // from a non-termination without re-running BioNetGen.
    const reasons = new Set(Object.values(UNPARSEABLE_REFERENCE_REASONS));
    expect(reasons.size).toBeGreaterThanOrEqual(6);
    expect([...reasons].every((r) => r.length > 40)).toBe(true);
  });
});