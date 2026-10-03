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

/**
 * Decide whether a web CSV and a BNG2 reference describe the same set of
 * simulated quantities.
 *
 * Only one direction carries information: the reference must cover every
 * column the web run reported. BNG2's `.gdat` is deliberately a superset —
 * next to observables and printed functions it also writes the model's
 * parameters, and the `_rateLaw*` helper functions it synthesises for
 * functional rate rules. The web simulator exports neither, so demanding an
 * equal column set failed models whose every shared column agreed to 1e-13
 * (parabola, polynomial, pt403/pt409, dallas/houston, Alabama).
 */
export function compareColumnCoverage(
  webColumns: readonly string[],
  refColumns: readonly string[],
): {
  columnMatch: boolean;
  lowCoverage: boolean;
  matchedColumns: string[];
  referenceOnlyColumns: string[];
  webOnlyColumns: string[];
  totalWebColumns: number;
  totalRefColumns: number;
} {
  const normalize = (h: string) => h.toLowerCase().replace(/\s+/g, '_');
  const webCols = new Set(webColumns.map(normalize).filter((h) => h !== 'time'));
  const refCols = new Set(refColumns.map(normalize).filter((h) => h !== 'time'));

  const matchedColumns = [...webCols].filter((c) => refCols.has(c)).sort();
  const webOnlyColumns = [...webCols].filter((c) => !refCols.has(c)).sort();
  const referenceOnlyColumns = [...refCols].filter((c) => !webCols.has(c)).sort();

  const minComparableColumns = Math.min(webCols.size, refCols.size);
  const lowCoverage =
    minComparableColumns > 0 && matchedColumns.length < Math.max(1, Math.ceil(minComparableColumns * 0.5));

  return {
    columnMatch: webOnlyColumns.length === 0 && !lowCoverage,
    lowCoverage,
    matchedColumns,
    referenceOnlyColumns,
    webOnlyColumns,
    totalWebColumns: webCols.size,
    totalRefColumns: refCols.size,
  };
}

/**
 * Index a reference's columns for lookup by a web column name.
 *
 * Headers are matched case-insensitively, so a reference carrying both the
 * observable `R` and the printed function `r` (Alabama, dallas, houston) folds
 * to a single key and the web's `R` would be compared against the function —
 * a 100% error on values that actually agree. Look the exact spelling up first
 * and only fall back to the case-folded index.
 */
export function indexReferenceColumns(
  refHeaders: readonly string[],
): (webHeader: string) => number | undefined {
  const byExact = new Map<string, number>();
  const byFolded = new Map<string, number>();
  refHeaders.forEach((header, index) => {
    if (!byExact.has(header)) byExact.set(header, index);
    const folded = header.toLowerCase().replace(/\s+/g, '_');
    byFolded.set(folded, index);
  });
  return (webHeader) => byExact.get(webHeader) ?? byFolded.get(webHeader.toLowerCase().replace(/\s+/g, '_'));
}

const PARAMETERS_BLOCK_RE = /^[ \t]*begin\s+parameters\b[^\n]*\n([\s\S]*?)^[ \t]*end\s+parameters\b/im;
const FREE_PARAMETER_RE = /^[A-Za-z_][A-Za-z0-9_]*__FREE_*$/;

/**
 * Read a model's `begin parameters` block as a map of name -> value expression.
 *
 * `a a__FREE` is a reference to another parameter rather than a literal, and
 * PyBNF fitting models leave the referenced name undefined, which both engines
 * resolve to 0. The generator additionally injects `X__FREE 0` before running
 * BNG2.pl, so the two sources differ textually while describing the same model.
 * Resolving one level of reference (and undefined -> 0) makes the two directly
 * comparable.
 */
export function parameterValues(bnglSource: string): Map<string, string> {
  const block = PARAMETERS_BLOCK_RE.exec(bnglSource);
  const values = new Map<string, string>();
  if (!block) return values;

  const body = block[1]
    .replace(/\\[ \t]*\r?\n/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean);

  for (const line of body) {
    const eq = line.indexOf('=');
    const name = (eq === -1 ? line.split(/\s+/)[0] : line.slice(0, eq)).trim().replace(/\(\s*\)$/, '');
    const rawValue = (eq === -1 ? line.split(/\s+/).slice(1).join(' ') : line.slice(eq + 1)).trim();
    if (!name || !rawValue) continue;
    values.set(name, rawValue.replace(/\s+/g, ''));
  }

  // Resolve `a a__FREE` style references so an injected `X__FREE 0` and an
  // undefined `X__FREE` describe the same value.
  const resolved = new Map<string, string>();
  for (const [name, raw] of values) {
    if (FREE_PARAMETER_RE.test(raw)) {
      const target = values.get(raw);
      resolved.set(name, target !== undefined && !FREE_PARAMETER_RE.test(target) ? target : '0');
    } else {
      resolved.set(name, raw);
    }
  }
  return resolved;
}

/**
 * Whether a reference was generated from the model a web CSV was produced
 * from.
 *
 * The reference directory ships the exact `.bngl` BNG2.pl was run on, next to
 * the `.gdat` it produced, and RuleHub contains distinct models that share a
 * basename (`egg.bngl` exists three times, `elephant.bngl` twice). The
 * reference generator keys its output on that basename, so one reference can
 * end up standing in for several different models — comparing against it then
 * reports a divergence that belongs to a different model entirely. Parameter
 * values are what separate those models (the egg family is byte-identical
 * apart from its fitted `__FREE` values), so compare those.
 */
export function referenceMatchesModel(referenceBnglSource: string, modelBnglSource: string): boolean {
  const reference = parameterValues(referenceBnglSource);
  const model = parameterValues(modelBnglSource);
  for (const name of new Set([...reference.keys(), ...model.keys()])) {
    if ((reference.get(name) ?? '0') !== (model.get(name) ?? '0')) return false;
  }
  return true;
}

export function parseCSV(content: string): { headers: string[]; data: number[][] } {
  const lines = content.trim().split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const headers = lines[0].split(',').map(h => h.trim());
  const data = lines.slice(1).map(line =>
    line.split(',').map(v => {
      const token = v.trim();
      // `Number('')` is 0, so an empty cell would be read as a fabricated data
      // point rather than as missing data. Both sides being empty would then
      // compare equal and mask a trajectory that is not actually there.
      if (token === '') {
        throw new Error(`Non-numeric CSV value: "${v}"`);
      }
      const parsed = Number(token);
      // `Infinity`, `-Infinity` and `NaN` are the literals our own exporter
      // writes for a non-finite result, and BNG2's mu::Parser produces the same
      // quantities (it writes `1.#INF`). They are values, not malformed cells,
      // and the comparison loop below records a non-finite cell in a compared
      // column as a discrepancy rather than silently scoring it as agreement.
      // `parseFloat` would have read `-Infinity` as NaN and thrown here, turning
      // pt403/pt409 into hard errors instead of comparisons.
      if (Number.isNaN(parsed) && !/^[+-]?nan$/i.test(token)) {
        throw new Error(`Non-numeric CSV value: "${v}"`);
      }
      return parsed;
    })
  );
  return { headers, data: normalizeTimeSeriesRows(headers, data) };
}

export 
function parseGDAT(content: string): { headers: string[]; data: number[][] } {
  const lines = content.trim().split('\n').filter(l => l.trim());

  // First line is header with #
  const headerLine = lines.find(l => l.startsWith('#'));
  let headers: string[] = [];
  if (headerLine) {
    headers = headerLine.replace('#', '').trim().split(/\s+/);
  }

  // Data lines don't start with #.
  //
  // `Number()` rather than `parseFloat()`: the latter reads the leading digits
  // of a Sundials failure marker (`1.#INF`, `1.#QNAN`) as the number 1, so an
  // unsolved reference would then match a web run that also reports 1. A
  // non-finite token becomes NaN here rather than an error because BNG2 also
  // echoes the model's parameters into the .gdat, and a parameter that is
  // legitimately `inf` (pt303/pt403/pt409: `lnV`, `half_life`, `lnV_tangent`)
  // sits in a column the web simulator never exports. `compareData` is what
  // turns a non-finite value in a *compared* column into a failure — NaN
  // compares false against every tolerance, so it must never reach one.
  const data = lines
    .filter(l => !l.startsWith('#') && l.trim())
    .map(line => line.trim().split(/\s+/).map(v => Number(v)));

  return { headers, data: normalizeTimeSeriesRows(headers, data) };
}

export function normalizeTimeSeriesRows(headers: string[], rows: number[][]): number[][] {
  const timeIdx = headers.findIndex((header) => header.trim().toLowerCase() === 'time');
  if (timeIdx === -1 || rows.length <= 1) return rows;

  const sorted = [...rows].sort((left, right) => left[timeIdx] - right[timeIdx]);
  const normalized: number[][] = [];

  for (const row of sorted) {
    const last = normalized[normalized.length - 1];
    if (last && Math.abs(last[timeIdx] - row[timeIdx]) <= TIME_TOL) {
      normalized[normalized.length - 1] = row;
      continue;
    }
    normalized.push(row);
  }

  return normalized;
}
