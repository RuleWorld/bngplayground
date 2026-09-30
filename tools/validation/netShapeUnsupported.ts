/**
 * Baseline of reference models the network-shape gate cannot read.
 *
 * These are valid BioNetGen input that our grammar does not implement yet, so
 * there is no network to compare against. Supporting any of them requires
 * regenerating the ANTLR parser from the grammar, which needs a JRE.
 *
 * This is a ratchet, not an allowlist: a model that fails to parse and is NOT
 * listed here fails the gate. Removing support for an entry, or adding a new
 * unparseable model, therefore requires a deliberate edit with a stated reason
 * instead of silently widening the exclusion.
 *
 * Keys are lowercased basenames.
 *
 * Entries are measured against BioNetGen **master** (RuleWorld/bionetgen), not
 * the packaged 2.9.3 release. Several models were removed from this list once
 * the parser front end could read them: the en-dash regional models, the three
 * `writeMDL` models, `mek_isoform_optimization_de_mek1_ko` (capitalised `Begin`)
 * and `simple_genonly`. `mcamkii_ca_spike` was removed because master now
 * rejects that model as invalid syntax, so it is not a reference at all.
 * An entry that survives a fix hides the regression, so re-check the whole list
 * whenever the grammar or the front end changes.
 */
export const UNPARSEABLE_REFERENCE_REASONS: Record<string, string> = {
  // BNG2 does not terminate on these. They are Kozer et al. 2013-style EGFR
  // models whose rule set has unbounded oligomerization — a reversible
  // homodimerisation plus the cd~c/cd~o tail-crosslinking pair — and none of
  // them sets `max_species` or `max_iter`, so the species count grows without
  // bound. Measured: 1800 s with no `.net` written, with the model's own
  // actions stripped and a single `generate_network` appended. Not an engine
  // defect: there is no reference to be compared against.
  egfr_nf_iter5p12h10: 'BNG2 does not terminate: unbounded oligomerization, no max_species/max_iter',
  egfr_ode: 'BNG2 does not terminate: unbounded oligomerization, no max_species/max_iter',
  jobs_tofit_gen48ind13: 'BNG2 does not terminate: unbounded oligomerization, no max_species/max_iter',
  tlbr_iter7p5: 'BNG2 does not terminate: unbounded oligomerization, no max_species/max_iter',
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