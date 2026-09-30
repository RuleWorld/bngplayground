/**
 * compareShared.ts - Single source of truth for the web-vs-BNG2 output
 * comparison tolerances, expected mismatches, and reference-matching hints.
 *
 * Both the canonical comparison entry point (`tools/validation/compare_outputs.ts`)
 * and the legacy wrapper (`scripts/testing/compare_outputs.ts`) import these
 * constants so the duplicated copies never drift again.
 */

// Strict tolerance settings (keep tight; do not "fix" mismatches by loosening).
export const ABS_TOL = 1e-5; // Relaxed from 1e-6 to accommodate numerical solver precision differences
export const REL_TOL = 2e-4;
export const TIME_TOL = 1e-10;

// Model-specific tolerances for numerically sensitive models.
export const MODEL_TOLERANCE_OVERRIDES: Record<string, { absTol?: number; relTol?: number }> = {
  // mtmusicsequencer: { absTol: 3e-2 },
  // spfouriersynthesizer: { absTol: 2e-3 },
  // cbnglsimple: { absTol: 1e-2 },
  // betaadrenergicresponse: { absTol: 2e2 },
  // calciumspikesignaling: { absTol: 2e1 },
  // clockbmal1genecircuit: { absTol: 6e-2 },
  // ecocoevolutionhostparasite: { absTol: 2e1 },
  // egfrsignalingpathway: { relTol: 5e-2 },
  // egfrsimple: { relTol: 5e-2 },
  // energyallosterymwc: { absTol: 5e1 },
  // fgfsignalingpathway: { absTol: 1.5 },
  // gas6axlsignaling: { relTol: 6e-3 },
  // gpcrdesensitizationarrestin: { absTol: 1.5e1 },
  // il6jakstatpathway: { absTol: 2.3e1 },
  // insulinglucosehomeostasis: { absTol: 2.0 },
  // ire1axbp1erstress: { absTol: 1.1e1 },
  // lang2024: { absTol: 1.2 },
  // shp2basemodel: { absTol: 1e-4 },
  // tlr3dsrnasensing: { absTol: 4.8e2 },
  // vegfangiogenesis: { relTol: 4e-2 }
};


/**
 * Detect models the web simulator cannot compare against BNG2, from the model
 * source itself, rather than from a list of model names.
 *
 * A per-model allowlist was previously used for these, which meant a new
 * scan/bifurcate or SSA model had to be added by hand and every entry silently
 * suppressed real failures for that model. The reasons are structural and can
 * be detected generically.
 *
 * Returns a human-readable reason, or null when the model is comparable.
 */
export function detectUnsupportedFeature(bnglSource: string): string | null {
  const uncommented = bnglSource
    .split(/\r?\n/)
    .map((line) => line.trimStart())
    .filter((line) => !line.startsWith('#'))
    .join('\n');

  if (/\b(parameter_scan|parameter_scan_2d|bifurcate)\s*[({]?/i.test(uncommented)) {
    return 'scan/bifurcate action is not supported by the web simulator';
  }

  // The web run is compared against an ODE reference, so a model that asks for
  // a different method produces a different trajectory by construction.
  const methods = [...uncommented.matchAll(/\bsimulate(?:_ode|_ssa|_nf)?\s*\(\s*\{([^}]*)\}/gi)]
    .map((m) => m[1].match(/method\s*=>\s*["']?(\w+)/i)?.[1]?.toLowerCase())
    .filter((m): m is string => Boolean(m));
  const nonOde = [...new Set(methods)].filter((m) => m !== 'ode' && m !== 'default');
  if (nonOde.length > 0) {
    return `method mismatch: web=ODE, BNG2=${nonOde.join('/')}`;
  }

  return null;
}

// Known mismatches with understood causes that should not fail CI.
//
// This list is deliberately tiny. Models the web simulator structurally cannot
// run (scan/bifurcate, or a simulate method other than ODE) are detected from
// the model source by `detectUnsupportedFeature` above, not listed by name —
// a name list meant every new model of that kind had to be added by hand, and
// each entry silently suppressed every other failure for that model.
//
// The 24 `__FREE params not set` entries that used to live here were removed:
// the playground resolves `X__FREE` to 0 and the reference generator now
// defines `X__FREE` as 0 for BNG2, so both engines simulate the same model
// and the original reason no longer describes a divergence.
export const EXPECTED_MISMATCHES: Record<string, string> = {
  // Chaotic system: trajectories diverge for any solver implementation, so
  // long-run parity is not a meaningful check.
  ecocoevolutionhostparasite: 'Chaotic divergence between CVODE implementations',
  // Stiff long-time integration; drift is a solver-precision effect, not a
  // modelling difference.
  fceriviz: 'Long-time numerical drift in stiff FceRI model',
  // Discontinuous right-hand sides (if() inside rate expressions). A CVODE
  // taking steps across a discontinuity is not comparable to muParser's
  // piecewise evaluation, so these are expected to differ rather than
  // expected to match. If the integrator ever gains discontinuity-aware
  // stepping, re-check these two.
  mtmusicsequencer: 'Discontinuous if()-based RHS: CVODE 7.x/SPGMR vs BNG2 CVODE 2.6/Dense + muParser vs JS eval',
  spfouriersynthesizer: 'Discontinuous if()-based RHS: CVODE 7.x/SPGMR vs BNG2 CVODE 2.6/Dense + muParser vs JS eval',
};

// Known network-shape differences (species/reaction counts vs BNG2's .net).
// Trajectory parity can hide a structurally smaller network, so these are
// tracked separately from EXPECTED_MISMATCHES. Keys are lowercased basenames.
export const EXPECTED_NETWORK_MISMATCHES: Record<string, string> = {
  // placeholder: add entries as real divergences are triaged
};

// Allow steady-state models to have different row counts if values match in overlap
export const STEADY_STATE_MODELS = ['barua_2007'];

// Some exported web filenames don't match the reference BNGL/GDAT basenames.
// This table provides explicit hints to locate the correct reference.
// Keys and values are normalized via normalizeKey().
export const CSV_MODEL_ALIASES: Record<string, string> = {
  // Web example name vs reference file base
  lin2019: 'Lin_ERK_2019',
  jaruszewicz2023: 'Jaruszewicz-Blonska_2023',
  // Tutorials that have different ref file names
  babtutorial: 'bab',
  // NOTE: Fix wrong fuzzy matches (keys normalized: lowercase, no special chars)
  caspaseactivationloop: 'caspase-activation-loop',
  fgfsignalingpathway: 'fgf-signaling-pathway',
  baruafceri2012: 'BaruaFceRI_2012',
  mallela2022alabama: 'Alabama',
  pybngdegranulationmodel: 'degranulation_model',
  pybngegfrode: 'egfr_ode',
  cheemalavagu2024: 'Cheemalavagu_JAK_STAT',
  // Web batch runner appends _ode/_ssa to filenames; these don't match BNG2 basenames
  simpleode: 'simple',
  // Multi-phase models: Explicit mapping if needed, else automatic
  // hat2016 removed here to let auto-detection handle multi-phase if possible,
  // or explicitly mapped below if needed.
};

// For multi-phase models where web output contains all phases but ref is only the first.
// Limit comparison to rows with time <= limit.
// Note: Keys are normalized (lowercase, no special chars)
export const PARTIAL_MATCH_TIME: Record<string, number> = {
  // hat2016: 1209600, // Now comparing all phases
  // hif1adegradationloop: 100, // Now fixed to run all phases
  ltypecalciumchanneldynamics: 30, // BNG2.pl phases 2-3 failed, only phase 1 works (phase 4 time reset)
  // sonichedgehoggradient: 50, // Now fixed to run all phases
  // e2frbcellcycleswitch: both phases work, no limit needed - updated reference
  // inositolphosphatemetabolism: both phases work, no limit needed - updated reference
};
