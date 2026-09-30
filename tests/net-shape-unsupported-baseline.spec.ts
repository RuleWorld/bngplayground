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
    expect(isKnownUnparseableReference('after_scaling')).toBe(true);
    expect(isKnownUnparseableReference('AFTER_SCALING')).toBe(true);
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
    for (const fixed of ['elephant', 'elephant_simplex_init0', 'actions_syntax']) {
      expect(isKnownUnparseableReference(fixed)).toBe(false);
    }
  });
});