/**
 * rateRuleConstants.ts — prefixes for synthetic rate-rule encoding.
 *
 * The BNGL writer emits synthetic parameters/species for SBML rate rules using
 * these prefixes, and the SBML writer recognises them on the way back out. The
 * two MUST match for the round-trip to work, so they live here once.
 */
export const RATE_RULE_META_PREFIX = '__rate_rule__';
export const SYNTH_RATE_RULE_SPECIES_PREFIX = '__rate_rule_state__';
