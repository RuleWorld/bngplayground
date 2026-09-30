/**
 * Baseline of reference models the network-shape gate cannot read.
 *
 * These are valid BioNetGen input that our grammar does not implement yet, so
 * there is no network to compare against. Supporting any of them requires
 * regenerating the ANTLR parser from the grammar (which needs a JRE), so they
 * are recorded here with the reason rather than modelled as expected failures.
 *
 * This is a ratchet, not an allowlist: a model that fails to parse and is NOT
 * listed here fails the gate. Removing support for an entry, or adding a new
 * unparseable model, therefore requires a deliberate edit with a stated reason
 * instead of silently widening the exclusion.
 *
 * Keys are lowercased basenames.
 */
export const UNPARSEABLE_REFERENCE_REASONS: Record<string, string> = {
  after_scaling: 'state modifier `!?` (R(Y~P!?)) is not in the grammar; needs ANTLR regeneration',
  before_scaling: 'state modifier `!?` (R(Y~P!?)) is not in the grammar; needs ANTLR regeneration',
  detroit_warren_dearborn_mi_detroit_warren_dearborn_mi: 'en dash inside an identifier is not in the lexer; needs ANTLR regeneration',
  fceri_ji_comp: '`writeMDL` action is not in the grammar; needs ANTLR regeneration',
  igf1r_fit_all_gen19ind47: 'scan action argument combination is not in the grammar; needs ANTLR regeneration',
  igf1r_fit_all_gen20ind12: 'scan action argument combination is not in the grammar; needs ANTLR regeneration',
};

/** True when the given model is a known-unparseable reference. */
export function isKnownUnparseableReference(model: string): boolean {
  return model.toLowerCase() in UNPARSEABLE_REFERENCE_REASONS;
}

/** The recorded reason, or a generic one for an unlisted model. */
export function unparseableReferenceReason(model: string): string {
  return (
    UNPARSEABLE_REFERENCE_REASONS[model.toLowerCase()] ??
    'reference model could not be parsed and is not in the baseline'
  );
}