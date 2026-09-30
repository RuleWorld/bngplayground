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
    // One of the models BNG2 itself cannot terminate on, so no reference exists.
    expect(isKnownUnparseableReference('egfr_ode')).toBe(true);
    expect(isKnownUnparseableReference('EGFR_ODE')).toBe(true);
  });

  it('does not recognise models that are not listed', () => {
    expect(isKnownUnparseableReference('mystery_model')).toBe(false);
    expect(isKnownUnparseableReference('elephant')).toBe(false);
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
    // These parse today; keeping them listed would let a regression hide.
    // `after_scaling`/`before_scaling` are the `!?` state modifier,
    // `mwc`/`simple_genonly` the `setOption` forms,
    // `igf1r_fit_all_*` the parameter_scan argument forms,
    // `test_mratio` the observable pattern form, `univ_synth` the compartment
    // volume variant, and the three `*_mi_*` models the en dash.
    for (const fixed of [
      'elephant',
      'elephant_simplex_init0',
      'actions_syntax',
      'after_scaling',
      'before_scaling',
      'mwc',
      'simple_genonly',
      'igf1r_fit_all_gen19ind47',
      'test_mratio',
      'univ_synth',
      'tricky',
      'mek_isoform_optimization_de_mek1_ko',
      'detroit_warren_dearborn_mi_detroit_warren_dearborn_mi',
    ]) {
      expect(isKnownUnparseableReference(fixed)).toBe(false);
    }
  });
});