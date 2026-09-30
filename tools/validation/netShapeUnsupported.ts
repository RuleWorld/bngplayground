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
 */
export const UNPARSEABLE_REFERENCE_REASONS: Record<string, string> = {
  // State modifier written as `R(Y~P!?)`.
  after_scaling: 'state modifier `!?` is not in the grammar; needs ANTLR regeneration',
  before_scaling: 'state modifier `!?` is not in the grammar; needs ANTLR regeneration',

  // Unicode en dash inside an identifier or parameter name.
  detroit_warren_dearborn_mi_detroit_warren_dearborn_mi: 'en dash inside an identifier is not in the lexer; needs ANTLR regeneration',
  nashville_davidson_murfreesboro_franklin_tn_nashville_davidson_murfreesboro_franklin_tn: 'en dash inside an identifier is not in the lexer; needs ANTLR regeneration',
  scranton_wilkes_barre_pa_scranton_wilkes_barre_pa: 'en dash inside an identifier is not in the lexer; needs ANTLR regeneration',

  // Actions outside the supported command set.
  fceri_ji_comp: '`writeMDL` action is not in the grammar; needs ANTLR regeneration',
  rec_dim: '`writeMDL` action is not in the grammar; needs ANTLR regeneration',
  rec_dim_comp: '`writeMDL` action is not in the grammar; needs ANTLR regeneration',
  nfkb_illustrating_protocols: '`protocol` action is not in the grammar; needs ANTLR regeneration',
  mwc: '`setOption` inside an actions block is not in the grammar; needs ANTLR regeneration',

  // parameter_scan argument combinations BNG2 accepts.
  igf1r_fit_all_gen19ind47: 'scan action argument combination is not in the grammar; needs ANTLR regeneration',
  igf1r_fit_all_gen20ind12: 'scan action argument combination is not in the grammar; needs ANTLR regeneration',
  igf1r_fit_all_iter16p0: 'scan action argument combination is not in the grammar; needs ANTLR regeneration',
  igf1r_fit_all_iter6p1h4: 'scan action argument combination is not in the grammar; needs ANTLR regeneration',

  // Other constructs seen in the corpus and confirmed to parse under BNG2.
  mcamkii_ca_spike: 'expression form accepted by BNG2 is not in the grammar; needs ANTLR regeneration',
  mek_isoform_optimization_de_mek1_ko: 'capitalised `Begin` block keyword is not in the lexer; needs ANTLR regeneration',
  simple_genonly: '`setOption` header form is not in the grammar; needs ANTLR regeneration',
  simple_nf_seed: '`generate_network` placement accepted by BNG2 is not in the grammar; needs ANTLR regeneration',
  test_mratio: 'observable pattern form accepted by BNG2 is not in the grammar; needs ANTLR regeneration',
  tricky: 'literal tab inside a construct is not handled by the lexer; needs ANTLR regeneration',
  univ_synth: 'compartment volume declaration variant is not in the grammar; needs ANTLR regeneration',
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