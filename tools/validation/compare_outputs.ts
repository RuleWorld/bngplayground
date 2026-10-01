/**
 * Comparison script to compare web simulator CSV outputs with BNG2.pl GDAT reference files
 * Usage: npx ts-node compare_outputs.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getRuleHubManifestBnglPaths, loadRuleHubManifest, resolveRuleHubRoot, type RuleHubManifestEntry } from '../rulehubLocal';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Load the excluded models list from constants.ts by parsing the source
// This avoids importing constants.ts which pulls in many large raw imports
const NORMALIZED_BNG2_EXCLUDED = (() => {
  const constantsPath = path.join(PROJECT_ROOT, 'constants.ts');
  try {
    const txt = fs.readFileSync(constantsPath, 'utf8');
    const m = txt.match(/export\s+const\s+BNG2_EXCLUDED_MODELS\s*=\s*new\s+Set\(\[([\s\S]*?)\]\)/m);
    if (!m) return new Set<string>();
    const listBody = m[1];
    const items = listBody.split(',').map(s => s.replace(/["'`\s]/g, '').trim()).filter(Boolean);
    return new Set(items.map(k => k.toLowerCase().replace(/[^a-z0-9]+/g, '')));
  } catch (e) {
    return new Set<string>();
  }
})();

interface ComparisonResult {
  model: string;
  status: 'match' | 'mismatch' | 'missing_reference' | 'error' | 'skipped' | 'bng_failed' | 'source_missing';
  referenceFile?: string;
  referenceInferred?: boolean;
  details: {
    webRows: number;
    refRows: number;
    webColumns: string[];
    refColumns: string[];
    columnMatch: boolean;
    missingColumns?: string[];
    extraColumns?: string[];
    matchedColumns?: string[];
    matchedColumnCount?: number;
    totalDataColumnCount?: number;
    timeMatch: boolean;
    timeOffset?: number;
    maxRelativeError: number;
    maxAbsoluteError: number;
    // True when the comparison passed solely because abs tolerance dominated,
    // while the raw relative error may still be large (values near zero).
    absTolDominated?: boolean;
    overlapMatch?: boolean;
    maxAbsoluteErrorAtTime?: number;
    maxAbsoluteErrorColumn?: string;
    maxRelativeErrorAtTime?: number;
    maxRelativeErrorColumn?: string;
    errorAtTime?: number;
    errorColumn?: string;
    samples?: { time: number; column: string; web: number; ref: number; relError: number }[];
    // Reference cells in a *compared* column that are inf/-inf/NaN. BNG2
    // writes those when its own solve fails; scoring them as agreement is
    // impossible because NaN fails every tolerance comparison.
    nonFiniteReferenceCells?: { time: number; column: string; value: string }[];
    /** Cells where BOTH runs produced a non-finite value: agreement that the quantity is undefined. Not a divergence. */
    bothNonFiniteCells?: { time: number; column: string; web: string; ref: string }[];
  } | null;
  error?: string;
}

interface AlignedRowPair {
  webRow: number[];
  refRow: number[];
  time: number;
}

interface ReferenceModelInfo {
  requestedPhaseIndex: number;
  methods: Set<SimCall['method']>;
  isMultiPhaseOde: boolean;
}

// Project layout: compare exported browser CSVs in <repo>/web_output against
// precomputed BNG2 outputs in <repo>/bng_test_output.
// bng_test_output/ is the single source of truth for BNG2 reference outputs.
const WEB_OUTPUT_DIR = path.join(PROJECT_ROOT, 'web_output');
const BNG_OUTPUT_DIR = process.env.BNG_OUTPUT_DIR
  ? path.resolve(PROJECT_ROOT, process.env.BNG_OUTPUT_DIR)
  : path.join(PROJECT_ROOT, 'bng_test_output');

const SESSION_DIR = path.join(PROJECT_ROOT, 'artifacts', 'SESSION_2026_02_10_web_output_parity');

// Shared tolerances, expected mismatches, and reference-matching hints live in
// compareShared.ts (single source of truth shared with the legacy scripts/testing entry point).
import {
  ABS_TOL,
  REL_TOL,
  TIME_TOL,
  MODEL_TOLERANCE_OVERRIDES,
  EXPECTED_MISMATCHES,
  STEADY_STATE_MODELS,
  CSV_MODEL_ALIASES,
  PARTIAL_MATCH_TIME,
  detectUnsupportedFeature,
  compareColumnCoverage,
  referenceMatchesModel,
  indexReferenceColumns,
  parseCSV,
  parseGDAT,
  normalizeTimeSeriesRows,
} from './compareShared';
import { modelReferenceNameFor } from './referenceNaming';
// The browser exports CSV labels over `getModelCatalogSync().examples`, which
// is this generated gallery list resolved against the manifest — NOT the full
// RuleHub manifest. Label→model resolution has to use the same catalog the
// browser used, or a label the browser gave to one model resolves here to a
// sibling the browser catalog does not even contain.
import { EXAMPLES } from '../../src/generated/gallery-data';

function stripDownloadSuffix(name: string): string {
  // Firefox/Chrome may save duplicates as "file(1).csv".
  return name.replace(/\(\d+\)(?=\.[^.]+$)/, '');
}

function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^results_/, '')
    .replace(/\.(csv|gdat|bngl)$/i, '')
    .replace(/\(\d+\)$/, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function inferRequestedPhaseIndex(modelLabel: string, bnglPath?: string): number {
  if (!bnglPath) return 1;

  const baseName = path.basename(bnglPath).replace(/\.bngl$/i, '');
  const labelLower = modelLabel.toLowerCase();
  const baseLower = baseName.toLowerCase();
  if (!labelLower.startsWith(`${baseLower}_`)) return 1;

  const suffix = modelLabel.slice(baseName.length + 1);
  const phaseWithParam = suffix.match(/^p(\d+)_/i);
  if (phaseWithParam) return Number.parseInt(phaseWithParam[1], 10);

  const numericPhase = suffix.match(/^(\d+)$/);
  if (numericPhase) return Number.parseInt(numericPhase[1], 10);

  return 1;
}

function analyzeReferenceModel(modelLabel: string, bnglPath?: string): ReferenceModelInfo | null {
  if (!bnglPath || !fs.existsSync(bnglPath)) return null;

  const content = fs.readFileSync(bnglPath, 'utf8');
  const calls = parseSimulateCallsFromBngl(content);
  const methods = new Set(calls.map((call) => call.method));
  const odeCalls = calls.filter((call) => call.method === 'ode');

  return {
    requestedPhaseIndex: inferRequestedPhaseIndex(modelLabel, bnglPath),
    methods,
    isMultiPhaseOde: odeCalls.length > 1,
  };
}

function formatMethodSummary(methods: Set<SimCall['method']>): string {
  return [...methods].sort().join(', ');
}

function getTolerances(modelName: string): { absTol: number; relTol: number } {
  const key = normalizeKey(modelName);
  const override = MODEL_TOLERANCE_OVERRIDES[key];
  return {
    absTol: override?.absTol ?? ABS_TOL,
    relTol: override?.relTol ?? REL_TOL
  };
}

function csvModelLabel(csvFile: string): string {
  return stripDownloadSuffix(csvFile)
    .replace(/^results_/, '')
    .replace(/\.csv$/i, '');
}


function alignRowsByTime(
  webRows: number[][],
  refRows: number[][],
  webTimeIdx: number,
  refTimeIdx: number,
): AlignedRowPair[] {
  const pairs: AlignedRowPair[] = [];
  let webIndex = 0;
  let refIndex = 0;

  while (webIndex < webRows.length && refIndex < refRows.length) {
    const webRow = webRows[webIndex];
    const refRow = refRows[refIndex];
    const webTime = webRow[webTimeIdx];
    const refTime = refRow[refTimeIdx];
    const delta = webTime - refTime;

    if (Math.abs(delta) <= TIME_TOL) {
      pairs.push({ webRow, refRow, time: webTime });
      webIndex++;
      refIndex++;
      continue;
    }

    if (delta < 0) {
      webIndex++;
    } else {
      refIndex++;
    }
  }

  return pairs;
}


interface SimCall {
  method: 'ode' | 'ssa' | 'nf';
  suffix?: string;
  t_end?: number;
  n_steps?: number;
  continue?: boolean;
}

function parseSimulateCallsFromBngl(bnglContent: string): SimCall[] {
  // Drop full-line and inline comments to avoid picking up commented-out simulate calls.
  const stripped = bnglContent.replace(/#[^\n]*/g, '');
  const simulateRegex = /simulate[_a-z]*\s*\(\s*\{([^}]*)\}\s*\)/gi;
  const calls: SimCall[] = [];

  const matches = Array.from(stripped.matchAll(simulateRegex));
  for (const m of matches) {
    const full = (m[0] ?? '').toLowerCase();
    const params = m[1] ?? '';

    let method: 'ode' | 'ssa' | 'nf';
    if (full.includes('simulate_nf')) method = 'nf';
    else if (full.includes('simulate_ssa')) method = 'ssa';
    else {
      const methodMatch = params.match(/method\s*=>?\s*["']?([^,}\s"']+)["']?/i);
      const mm = (methodMatch?.[1] ?? '').toLowerCase();
      if (mm === 'ssa') method = 'ssa';
      else if (mm === 'nf' || mm === 'nfsim' || mm === 'network_free') method = 'nf';
      else method = 'ode';
    }

    const suffixMatch = params.match(/suffix\s*=>?\s*["']?([^,}\s"']+)["']?/i);
    const suffix = suffixMatch?.[1];

    // Parse t_end for multi-phase time offset calculation
    const tendMatch = params.match(/t_end\s*=>?\s*([^,}]+)/i);
    let t_end: number | undefined;
    if (tendMatch) {
      // Evaluate simple arithmetic expressions like "14*24*60*60"
      try {
        // Safe evaluation of arithmetic expressions only
        const expr = tendMatch[1].trim().replace(/[^0-9+\-*/.\s()]/g, '');
        t_end = Function(`"use strict"; return (${expr})`)();
      } catch {
        t_end = undefined;
      }
    }

    const continueMatch = params.match(/continue\s*=>?\s*([01])/i);
    const continueFlag = continueMatch ? continueMatch[1] === '1' : false;

    const nStepsMatch = params.match(/n_steps\s*=>?\s*(\d+)/i);
    const n_steps = nStepsMatch ? parseInt(nStepsMatch[1], 10) : undefined;

    calls.push({ method, suffix, t_end, n_steps, continue: continueFlag });
  }

  return calls;
}

/**
 * For multi-phase models, constructs the reference data that matches the web simulator's output behavior.
 * Web simulator only outputs the final continuous chain of phases.
 * BNG2 output resets time to 0 at each phase.
 */
function getMultiPhaseReference(
  baseName: string,
  bnglPath: string,
  gdatFiles: string[]
): { headers: string[]; data: number[][] } | null {
  const normalizedBaseName = baseName.replace(/-/g, '_');
  const phaseBaseNames = Array.from(new Set([normalizedBaseName, baseName]));
  const phaseTimeTol = 1e-9;
  const content = fs.readFileSync(bnglPath, 'utf8');
  const calls = parseSimulateCallsFromBngl(content);

  // Consider all ODE calls for multi-phase logic
  const odeCalls = calls.filter(c => c.method === 'ode');
  console.log(`[MultiPhase DEBUG] ${baseName}: Found ${odeCalls.length} ODE calls.`);
  if (odeCalls.length <= 1) return null; // Not a multi-phase model

  // Match web simulator logic: record from the beginning
  // and skip 1-step equilibration phases later.
  const recordFromIdx = 0;

  const phasesToInclude = odeCalls;
  console.log(`[MultiPhase] Identified output chain for ${baseName}: phases ${recordFromIdx + 1} to ${odeCalls.length}`);

  const phasesData: { headers: string[]; data: number[][]; t_end: number }[] = [];
  const usedPhaseFiles = new Set<string>();
  const unnumberedGdatNames = phaseBaseNames.map(name => `${name}.gdat`);
  const availableUnnumberedGdats = gdatFiles.filter(gf =>
    unnumberedGdatNames.some(candidate => candidate.toLowerCase() === gf.toLowerCase())
  );
  const hasExplicitPhaseFiles = gdatFiles.some(gf =>
    phaseBaseNames.some(name => new RegExp(`^${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}_(?:\\d+|[A-Za-z][A-Za-z0-9_]*)\\.gdat$`, 'i').test(gf))
  );

  const findAvailableGdat = (candidates: string[]): string | null => {
    for (const candidate of candidates) {
      const lower = candidate.toLowerCase();
      if (gdatFiles.some(gf => gf.toLowerCase() === lower) && !usedPhaseFiles.has(lower)) {
        return candidate;
      }
    }
    return null;
  };

  const pickUnnumberedGdat = (): string | null => {
    return findAvailableGdat(phaseBaseNames.map(name => `${name}.gdat`));
  };

  const pickNumberedGdat = (): string | null => {
    const numbered = gdatFiles
      .map(gf => ({
        name: gf,
        m: phaseBaseNames
          .map(name => gf.match(new RegExp(`^${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}_(\\\\d+)\\\\.gdat$`, 'i')))
          .find(Boolean) ?? null
      }))
      .filter(x => x.m)
      .map(x => ({ name: x.name, index: Number((x.m as RegExpMatchArray)[1]) }))
      .filter(x => Number.isFinite(x.index))
      .sort((a, b) => a.index - b.index);

    for (const item of numbered) {
      const key = item.name.toLowerCase();
      if (!usedPhaseFiles.has(key)) return item.name;
    }
    return null;
  };

  if (availableUnnumberedGdats.length === 1 && !hasExplicitPhaseFiles) {
    const gdatFile = availableUnnumberedGdats[0];
    const gdatPath = path.join(BNG_OUTPUT_DIR, gdatFile);
    const parsed = parseGDAT(fs.readFileSync(gdatPath, 'utf8'));
    const timeIdx = parsed.headers.findIndex(h => h.toLowerCase() === 'time');
    const firstPhaseEnd = odeCalls[0]?.t_end;
    const finalPhaseEnd = odeCalls[odeCalls.length - 1]?.t_end;

    if (timeIdx !== -1 && parsed.data.length > 0 && firstPhaseEnd !== undefined && finalPhaseEnd !== undefined) {
      const lastTime = parsed.data[parsed.data.length - 1][timeIdx];
      if (
        Math.abs(lastTime - finalPhaseEnd) <= phaseTimeTol &&
        lastTime < firstPhaseEnd - phaseTimeTol
      ) {
        console.log(
          `[MultiPhase] ${baseName}: single unsuffixed GDAT matches final phase only ` +
          `(lastTime=${lastTime}, phase1End=${firstPhaseEnd}, finalPhaseEnd=${finalPhaseEnd}). Using surviving file directly.`
        );
        return parsed;
      }
    }
  }

  for (let i = 0; i < phasesToInclude.length; i++) {
    const call = phasesToInclude[i];
    let expectedName = '';

    if (call.suffix) {
      expectedName = findAvailableGdat(phaseBaseNames.map(name => `${name}_${call.suffix}.gdat`))
        ?? `${normalizedBaseName}_${call.suffix}.gdat`;
    } else {
      // Unsuffixed simulate output is typically model.gdat regardless of position.
      // If that has already been consumed, fall back to numbered phase files.
      expectedName = pickUnnumberedGdat() ?? pickNumberedGdat() ?? `${normalizedBaseName}_${i + 1}.gdat`;
    }

    const expectedNameLower = expectedName.toLowerCase();

    // Find matching gdat file
    const gdatFile = gdatFiles.find(gf => gf.toLowerCase() === expectedNameLower);
    if (!gdatFile) {
      // If this is a 1-step phase, it might be skipped by the web simulator too.
      // But BNG2.pl usually specifies suffix anyway.
      // If missing, and it's 100% skipped, maybe continue?
      if ((call.n_steps ?? 100) <= 1) {
        console.log(`[MultiPhase] Skipping 1-step phase file: ${expectedName}`);
        continue;
      }
      console.log(`[MultiPhase] Missing phase file: ${expectedName}`);
      if ((call.n_steps ?? 100) <= 1) {
        console.log(`[MultiPhase] Skipping 1-step phase file: ${expectedName}`);
        continue;
      }
      console.log(`[MultiPhase] Missing phase file: ${expectedName} (looked for ${expectedNameLower})`);
      console.log(`[MultiPhase DEBUG] Available files sample: ${gdatFiles.slice(0, 5).join(', ')}`);
      return null; // Can't construct reference if any significant phase is missing
    }

    const gdatPath = path.join(BNG_OUTPUT_DIR, gdatFile);
    const gdatContent = fs.readFileSync(gdatPath, 'utf8');
    const parsed = parseGDAT(gdatContent);
    usedPhaseFiles.add(gdatFile.toLowerCase());

    // t_end from BNGL, or infer from last time in data
    const timeIdx = parsed.headers.findIndex(h => h.toLowerCase() === 'time');
    const t_end = call.t_end ?? (parsed.data.length > 0 && timeIdx !== -1
      ? parsed.data[parsed.data.length - 1][timeIdx]
      : 0);

    // Some references already include all phases in the base GDAT. If the first
    // file extends beyond the first phase's t_end, avoid double-concatenation.
    if (i === 0 && timeIdx !== -1 && parsed.data.length > 0) {
      const lastTime = parsed.data[parsed.data.length - 1][timeIdx];
      if (call.t_end !== undefined && lastTime > call.t_end + 1e-9) {
        console.log(`[MultiPhase] ${baseName}: base GDAT spans multiple phases (lastTime=${lastTime}, phase1End=${call.t_end}). Using base file only.`);
        return { headers: parsed.headers, data: parsed.data };
      }
    }

    phasesData.push({ ...parsed, t_end });
  }

  if (phasesData.length === 0) return null;

  // Use headers from first included phase
  const headers = phasesData[0].headers;
  const timeIdx = headers.findIndex(h => h.toLowerCase() === 'time');
  if (timeIdx === -1) return null;

  const concatenatedData: number[][] = [];
  let cumulativeTimeOffset = 0;

  for (let i = 0; i < phasesData.length; i++) {
    const phase = phasesData[i];
    const call = odeCalls[i];

    // Determine time shift for this phase
    // If continue is true, BNG2 output preserves absolute time --> Shift = 0
    // If continue is false, BNG2 output resets to 0 --> Shift = cumulativeTimeOffset
    let shift = 0;
    if (i > 0 && !call.continue) {
      shift = cumulativeTimeOffset;
    }

    if (phase.data.length === 0) continue;

    for (let rowIdx = 0; rowIdx < phase.data.length; rowIdx++) {
      // Skip duplicate t=start rows at phase boundaries (except for the very first output point)
      // For continuous phases (shift=0), the first point usually repeats the last point of previous phase
      // For discontinuous phases (shift>0), the 0 point matches previous end.
      if (i > 0 && rowIdx === 0) {
        // Heuristic: check if this time point <= previous time point
        // Or strictly: if it duplicates the last recorded time.
        const adjustedTime = phase.data[rowIdx][timeIdx] + shift;
        if (concatenatedData.length > 0) {
          const lastTime = concatenatedData[concatenatedData.length - 1][timeIdx];
          if (Math.abs(adjustedTime - lastTime) < 1e-9) continue;
        }
      }

      const row = [...phase.data[rowIdx]];
      row[timeIdx] += shift;
      concatenatedData.push(row);
    }

    // Update cumulative offset to the end of this phase
    if (concatenatedData.length > 0) {
      cumulativeTimeOffset = concatenatedData[concatenatedData.length - 1][timeIdx];
    }
  }

  console.log(`[MultiPhase] Constructed reference for ${baseName}: ${concatenatedData.length} rows`);
  return { headers, data: concatenatedData };
  }

  function chooseReferenceFromBngl(baseName: string, bnglPath: string, gdatFiles: string[]): string | null {
    const content = fs.readFileSync(bnglPath, 'utf8');
    const calls = parseSimulateCallsFromBngl(content);
    if (calls.length === 0) return null;

    // Prefer the first ODE simulate call.
    // The web UI/batch behavior selects the first matching simulate() (not the last),
    // so choosing the last here can incorrectly compare against a different phase/suffix.
    const odeCalls = calls.filter(c => c.method === 'ode');
    const chosen = (odeCalls.length > 0 ? odeCalls[0] : calls[0]);
    const expectedName = chosen.suffix ? `${baseName}_${chosen.suffix}.gdat` : `${baseName}.gdat`;
    const expectedPath = path.join(BNG_OUTPUT_DIR, expectedName);
    if (fs.existsSync(expectedPath)) return expectedPath;

    // Fallback: try to find by normalized key.
    const expectedKey = normalizeKey(expectedName);
    for (const gf of gdatFiles) {
      if (normalizeKey(gf) === expectedKey) return path.join(BNG_OUTPUT_DIR, gf);
    }
    return null;
  }

  /**
   * `RuleHubManifestEntry` omits `name`, but `manifest.json` carries it and
   * the exporter falls back to it for an entry that has no id.
   */
  type CatalogEntry = RuleHubManifestEntry & { name?: string };

  /**
   * The catalog label the web batch runner exports a manifest entry under.
   *
   * A port of `exportLabelFor` in `src/utils/batchRunner.ts`: the bare
   * sanitised id, plus a discriminator derived from the id for every model
   * after the first that shares one. Reproduced rather than imported because
   * it decides which model a CSV label denotes, and a CSV label that resolves
   * to the wrong model is compared against the wrong reference.
   *
   * Note `safeModelName` there keeps leading/trailing underscores, unlike
   * `safeReferenceBaseName`, so the two deliberately differ.
   */
  function exportedLabelFor(entry: CatalogEntry, catalog: CatalogEntry[]): string {
    const base = String(entry.id || entry.name || '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    // The browser sorts the collision group by id before assigning labels, so
    // which member keeps the bare label is decided by locale order, not by
    // catalog order. Mirror that or the bare label resolves to the wrong member
    // whenever the two orders differ.
    const sameName = catalog
      .filter(other => String(other.id || other.name || '').replace(/[^a-z0-9]/gi, '_').toLowerCase() === base)
      .sort((a, b) => String(a.id || a.name).localeCompare(String(b.id || b.name)));
    const index = sameName.findIndex(other => (other.id || other.name) === (entry.id || entry.name));
    if (sameName.length < 2 || index <= 0) return base;
    const suffix = String(entry.id || entry.name || '').replace(/[^a-z0-9]/gi, '').slice(-6).toLowerCase();
    return `${base}_${suffix || index}`;
  }

  let browserCatalogCache: CatalogEntry[] | null = null;

  /**
   * The catalog the web batch runner exports labels over: `EXAMPLES` (the
   * generated gallery list) resolved against the RuleHub manifest, exactly as
   * `buildCatalog` in `services/modelCatalog.ts` does for the browser.
   *
   * The full manifest is a different catalog: it contains models the gallery
   * does not (Published `fceri_ji` next to the tutorial `FceRI_ji`), so
   * collision groups — and therefore the exported labels — differ between the
   * two. The browser exported `results_fceri_ji.csv` from the tutorial because
   * its catalog has only that member of the pair; resolving the same label over
   * the full manifest lands on the Published model instead.
   */
  function browserCatalogEntries(): CatalogEntry[] {
    if (browserCatalogCache) return browserCatalogCache;
    // Mirrors `buildManifestIndex`/`resolveManifestEntry` in
    // `services/modelCatalog.ts`, including its `_`↔`-` swap: gallery ids and
    // manifest ids differ in separator style for some models, and resolving
    // one side without the swap drops models the browser keeps.
    const manifestLookupKeys = (value: string): string[] => {
      const normalized = value.trim().toLowerCase().replace(/\.bngl$/i, '');
      const swap = normalized.includes('_') ? normalized.replace(/_/g, '-') : normalized.replace(/-/g, '_');
      return swap === normalized ? [normalized] : [normalized, swap];
    };
    const manifest = loadRuleHubManifest(PROJECT_ROOT) as CatalogEntry[];
    const byExactId = new Map<string, CatalogEntry>();
    const byExactName = new Map<string, CatalogEntry>();
    const index = new Map<string, CatalogEntry>();
    for (const entry of manifest) {
      if (entry.id && !byExactId.has(entry.id)) byExactId.set(entry.id, entry);
      if (entry.name && !byExactName.has(entry.name)) byExactName.set(entry.name, entry);
      for (const candidate of [entry.id, entry.name]) {
        if (!candidate) continue;
        for (const key of manifestLookupKeys(candidate)) {
          if (!index.has(key)) index.set(key, entry);
        }
      }
    }

    const resolved: CatalogEntry[] = [];
    for (const example of EXAMPLES) {
      // Exact id first: the runner loads code by the gallery id, so the model
      // that ran is the manifest entry whose id matches verbatim. The
      // normalized index alone is first-wins and both `fceri_ji` (Published)
      // and `FceRI_ji` (Tutorials) normalize to `fceriji` — falling straight
      // to it maps the tutorial run onto the Published path.
      let match = example.id ? byExactId.get(example.id) : undefined;
      if (!match && example.name) match = byExactName.get(example.name);
      if (!match) {
        for (const candidate of [example.id, example.name]) {
          if (!candidate) continue;
          for (const key of manifestLookupKeys(candidate)) {
            match = index.get(key);
            if (match) break;
          }
          if (match) break;
        }
      }
      if (!match || !match.path) continue;
      // Browser `mergeExample` keeps the gallery id/name and takes the path
      // from the manifest entry.
      resolved.push({ ...match, id: example.id || match.id, name: example.name ?? match.name });
    }
    browserCatalogCache = resolved;
    return resolved;
  }

  /**
   * The RuleHub model a web CSV was produced from.
   *
   * The browser names its export `results_<exported label>.csv`, and the
   * exported label names exactly one model. Matching on it directly is what
   * disambiguates models that share a basename (`alabama_Alabama` and
   * `mallela2021_states_Alabama` are `Alabama/Alabama.bngl` and
   * `Mallela2021/SI_files_Alabama_Alabama.bngl`), which basename scoring
   * cannot do.
   *
   * An exact label match is tried first because prefix matching cannot separate
   * ids that sanitise alike: `fceri_ji` and `FceRI_ji` both reduce to
   * `fceriji`, so the label `fceri_ji_ceriji` — which is the second model's,
   * the discriminator carrying that model's own id — matched the first model
   * instead and was handed the first model's reference.
   *
   * Prefix matching then remains the fallback for labels the exporter shaped
   * differently (the simulate-suffix forms the browser appends), so this only
   * takes over where it is exact.
   */
  function manifestEntryForCsvLabel(csvFile: string): { id: string; relativePath: string; file: string } | null {
    const csvLabel = csvModelLabel(csvFile);
    const labelKey = normalizeKey(csvLabel);
    const ruleHubRoot = resolveRuleHubRoot(PROJECT_ROOT);
    if (!ruleHubRoot) return null;

    // Exact match against the browser's own catalog first. The exported label
    // is written verbatim into the filename, so equality here is exact — and it
    // must be: `normalizeKey` strips the underscore that is the only thing
    // separating the labels `circadian_oscillator` (the Examples ODE model) and
    // `circadianoscillator` (the Tutorials SSA model). Two distinct models also
    // do not always collide the same way in both catalogs — the gallery list
    // that the browser labels from does not contain Published `fceri_ji` at
    // all, so the browser's bare `fceri_ji` label denotes the tutorial
    // `FceRI_ji`, while the full manifest hands that same bare label to the
    // Published entry. Normalized-over-full-manifest matching therefore pairs
    // the run with a sibling model's reference.
    const browserCatalog = browserCatalogEntries();
    // The browser appends the simulate suffix to the filename when a phase
    // carries one (`results_<label>_ode.csv`). Try the full label first, then
    // the label without a method suffix, so `sir_ode` still resolves to the
    // `SIR` entry the suffix was appended to and its reference provenance can
    // be checked. Only method suffixes are stripped: an arbitrary phase suffix
    // (e.g. `07_egg_egg` + `egg`) is not a model id and must not be guessed at.
    const methodSuffix = /_(?:ode|ssa|nf|nfsim)$/.exec(csvLabel);
    const strippedLabel = methodSuffix ? csvLabel.slice(0, -methodSuffix[0].length) : '';
    const candidateLabels = strippedLabel ? [csvLabel, strippedLabel] : [csvLabel];
    for (const candidateLabel of candidateLabels) {
      for (const entry of browserCatalog) {
        if (!entry.id || !entry.path) continue;
        if (exportedLabelFor(entry, browserCatalog).toLowerCase() !== candidateLabel.toLowerCase()) continue;
        const file = path.join(ruleHubRoot, entry.path);
        // The label names this entry unambiguously; a missing source file means
        // the model is unavailable here, not that a sibling should stand in.
        if (!fs.existsSync(file)) return null;
        return { id: entry.id, relativePath: entry.path, file };
      }
    }

    const catalog = loadRuleHubManifest(PROJECT_ROOT);
    let best: { id: string; relativePath: string; file: string } | null = null;
    for (const entry of catalog) {
      if (!entry.id || !entry.path) continue;
      if (normalizeKey(exportedLabelFor(entry, catalog)) !== labelKey) continue;
      const file = path.join(ruleHubRoot, entry.path);
      if (!fs.existsSync(file)) continue;
      // Two catalog entries can share an id (`parabola` appears four times), in
      // which case the browser wrote one CSV for all of them and the label
      // cannot say which. First match matches what the run had available.
      return { id: entry.id, relativePath: entry.path, file };
    }

    for (const entry of catalog) {
      if (!entry.id || !entry.path) continue;
      const idKey = normalizeKey(entry.id);
      // A 4-character floor keeps a short id from prefix-matching everything,
      // and the longest match wins so a specific id beats a shorter one.
      if (idKey.length < 4 || !labelKey.startsWith(idKey)) continue;
      const file = path.join(ruleHubRoot, entry.path);
      if (!fs.existsSync(file)) continue;
      if (!best || idKey.length > normalizeKey(best.id).length) best = { id: entry.id, relativePath: entry.path, file };
    }
    return best;
  }

  function modelSourceForCsvLabel(csvFile: string): string | null {
    return manifestEntryForCsvLabel(csvFile)?.file ?? null;
  }

  /**
   * The `.bngl` a reference was generated from: the reference generator writes
   * `<safeName>.bngl` next to the `<safeName>[_suffix].gdat` it produced.
   */
  function referenceSourceBngl(gdatPath: string, bnglNames: string[]): string | null {
    const base = path.basename(gdatPath).replace(/\.gdat$/i, '').toLowerCase();
    let best: { name: string; file: string } | null = null;
    for (const name of bnglNames) {
      const stem = name.replace(/\.bngl$/i, '').toLowerCase();
      if (!base.startsWith(stem)) continue;
      if (!best || stem.length > best.name.length) best = { name: stem, file: path.join(BNG_OUTPUT_DIR, name) };
    }
    return best?.file ?? null;
  }

  /**
   * Which model's reference a `.gdat` in `bng_test_output/` belongs to, or null
   * when nothing on record says.
   *
   * The generator writes `<referenceName>.bngl` next to the outputs it
   * produced for that model, so the longest `.bngl` stem that prefixes the
   * `.gdat` names the reference. Longest-prefix matters: `egg.gdat` and
   * `egg_bionetfit_files.gdat` are different models' references, and only the
   * latter is owned by the longer stem.
   */
  function owningReferenceName(gdatFileName: string, bnglNames: string[]): string | null {
    const source = referenceSourceBngl(path.join(BNG_OUTPUT_DIR, gdatFileName), bnglNames);
    return source ? path.basename(source).replace(/\.bngl$/i, '') : null;
  }

  /**
   * Drop references that provably come from a different model than the web run.
   * A wrong reference reports a divergence that belongs to a different model,
   * so a false failure is worse than an honest "no reference".
   */
  function keepReferencesForModel(
    candidates: string[],
    modelSourcePath: string | null,
    bnglNames: string[],
  ): string[] {
    if (!modelSourcePath) return candidates;
    const modelSource = fs.readFileSync(modelSourcePath, 'utf8');
    const trusted = candidates.filter((candidate) => {
      const referenceSource = referenceSourceBngl(candidate, bnglNames);
      // No provenance on record: keep the candidate as before.
      if (!referenceSource || !fs.existsSync(referenceSource)) return true;
      if (referenceMatchesModel(fs.readFileSync(referenceSource, 'utf8'), modelSource)) return true;
      console.warn(
        `[compare] Dropping ${path.basename(candidate)} for ${path.basename(modelSourcePath)}: it was generated from a different model.`
      );
      return false;
    });
    return trusted;
  }

  function uniqueStrings(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of values) {
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out;
  }

  function isClearlyNonOdeGdat(filePathOrName: string): boolean {
    const base = path.basename(filePathOrName).toLowerCase();
    // Conservative filters: only drop variants that explicitly advertise non-ODE method.
    // This prevents accidentally excluding normal ODE outputs whose basenames contain
    // these tokens as part of another word.
    return (
      /(^|_)ssa(\d+)?\./.test(base) ||
      /(^|_)ssa(\d+)?_/.test(base) ||
      /(^|_)nfsim\./.test(base) ||
      /(^|_)nfsim_/.test(base) ||
      /(^|_)nf\./.test(base) ||
      /(^|_)nf_/.test(base)
    );
  }

  function findBestBnglForCsv(csvFile: string, bnglFilePaths: string[]): string | null {
    const raw = csvModelLabel(csvFile);
    const tokens = raw.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const modelKey = normalizeKey(raw);

    // Avoid misleading fuzzy matches for very short/ambiguous labels like "toggle".
    if (modelKey.length <= 8 && tokens.length <= 1) {
      const exact = bnglFilePaths.find((fp) => normalizeKey(path.basename(fp)) === modelKey);
      return exact ? exact : null;
    }

    let best: { path: string; score: number } | null = null;
    for (const fp of bnglFilePaths) {
      const base = path.basename(fp).replace(/\.bngl$/i, '');
      const baseLower = base.toLowerCase();
      const bKey = normalizeKey(base);

      let score = 0;
      if (bKey === modelKey) score += 1000;
      if (bKey.includes(modelKey) || modelKey.includes(bKey)) score += 400;

      for (const t of tokens) {
        if (t.length < 3) continue;
        if (baseLower.includes(t)) score += 20;
      }

      // Small preference for shorter names when tied.
      score -= Math.abs(bKey.length - modelKey.length);

      if (!best || score > best.score) best = { path: fp, score };
    }

    if (!best || best.score < 30) return null;
    return best.path;
  }

  function findGdatCandidates(csvFile: string): { gdatPaths: string[]; bnglPath?: string; inferred?: boolean } {
    if (!fs.existsSync(BNG_OUTPUT_DIR)) return { gdatPaths: [] };

    const gdatFiles = fs.readdirSync(BNG_OUTPUT_DIR).filter(f => f.toLowerCase().endsWith('.gdat'));

    const bnglFiles = getRuleHubManifestBnglPaths(PROJECT_ROOT, (entry) => entry.bng2_compatible !== false && entry.compatibility?.bng2 !== false);

    const rawLabel = csvModelLabel(csvFile);
    const baseKey = normalizeKey(rawLabel);
    const requiresTofit = baseKey.includes('tofit');
    const alias = CSV_MODEL_ALIASES[baseKey];
    const normalizedAlias = alias ? normalizeKey(alias) : null;
    const candidateKeys = [baseKey, normalizedAlias].filter(Boolean) as string[];

    // 1) Direct match.
    //
    // `normalizeKey` strips punctuation, so `circadian_oscillator` and
    // `circadianoscillator` — two distinct RuleHub models whose .net files are
    // byte-identical and differ only in that underscore — both normalise to the
    // same key. Matching on the normalised key alone handed the ODE model the
    // SSA model's reference, and the gate then compared an 801-row ODE
    // trajectory against a 1001-row stochastic one and called it a divergence.
    //
    // So: prefer a filename that matches exactly, and when only a normalised
    // match exists it must be unambiguous. Guessing between two references
    // belonging to different models is worse than reporting no reference.
    const exactMatches: string[] = [];
    const normalisedOnly: string[] = [];
    for (const gf of gdatFiles) {
      const gKey = normalizeKey(gf);
      if (!candidateKeys.includes(gKey)) continue;
      const stemMatches = candidateKeys.some(k => path.basename(gf, '.gdat').toLowerCase() === k);
      (stemMatches ? exactMatches : normalisedOnly).push(path.join(BNG_OUTPUT_DIR, gf));
    }
    const directMatches = exactMatches.length > 0 ? exactMatches : normalisedOnly.length === 1 ? normalisedOnly : [];

    // Even for direct matches, try to find a BNGL file for multi-phase concatenation
    const bnglPathForDirect = findBestBnglForCsv(csvFile, bnglFiles);
    const referenceBnglNames = fs
      .readdirSync(BNG_OUTPUT_DIR)
      .filter((f) => f.toLowerCase().endsWith('.bngl'));
    const modelSource = modelSourceForCsvLabel(csvFile);

    // The reference this model owns, resolved through the manifest entry the
    // CSV label denotes. Computed before any by-name candidate is trusted: a
    // normalized filename match can belong to a sibling model that merely
    // sanitizes to the same key.
    const manifestEntry = manifestEntryForCsvLabel(csvFile);
    const modelReferenceName = manifestEntry
      ? modelReferenceNameFor(PROJECT_ROOT, manifestEntry.relativePath)
      : null;

    const dropForeignReferences = (candidates: string[]): string[] => {
      if (!modelReferenceName) return candidates;
      return candidates.filter((candidate) => {
        const owner = owningReferenceName(path.basename(candidate), referenceBnglNames);
        if (!owner || owner === modelReferenceName) return true;
        console.warn(
          `[compare] Dropping ${path.basename(candidate)} for ${rawLabel}: it belongs to reference ` +
          `"${owner}", but this model's own reference is "${modelReferenceName}".`
        );
        return false;
      });
    };

    if (directMatches.length > 0) {
      const trustedDirect = keepReferencesForModel(
        uniqueStrings(dropForeignReferences(directMatches)),
        modelSource,
        referenceBnglNames,
      );
      if (trustedDirect.length > 0) {
        return {
          gdatPaths: trustedDirect,
          bnglPath: bnglPathForDirect ?? undefined,
          inferred: false,
        };
      }
      // Every by-name candidate provably belongs to a different model. Fall
      // through to the provenance-based resolution below instead of returning
      // an empty list — the model's own reference may still exist under its
      // reference name.
    }

    // 1b) The model the CSV is actually for, via the manifest.
    //
    // A CSV label carries the catalog id, and the catalog id names one model.
    // Matching it against `.gdat` filenames does not: RuleHub holds 28
    // basenames shared by 79 distinct models in the CI-visible corpus, and the
    // reference generator can only give one of them the bare filename — the
    // rest are `<basename>_<path discriminator>`. So for those models the
    // by-name match above lands on a sibling that merely shares a basename,
    // and the gate compares a trajectory against another model's network.
    //
    // Resolve through the manifest to the model's own reference name instead.
    // This only redirects when the by-name match belongs to a different model,
    // so every case where the two already agree — which is the overwhelming
    // majority — keeps exactly the references it had.
    if (modelReferenceName) {
      const ownedByModel = gdatFiles.filter(
        gf => owningReferenceName(gf, referenceBnglNames) === modelReferenceName
      );
      const nameMatchAlreadyCorrect = directMatches.some(
        candidate => owningReferenceName(path.basename(candidate), referenceBnglNames) === modelReferenceName
      );
      if (ownedByModel.length > 0 && !nameMatchAlreadyCorrect) {
        return {
          gdatPaths: keepReferencesForModel(
            uniqueStrings(ownedByModel.map(gf => path.join(BNG_OUTPUT_DIR, gf))),
            modelSource,
            referenceBnglNames
          ),
          bnglPath: bnglPathForDirect ?? undefined,
          inferred: false,
        };
      }
    }

    // 2) Try infer from matching BNGL and its last simulate() call.
    // 2) Try infer from matching BNGL and its last simulate() call.
    // If a CSV alias exists, try that first.
    const bnglPath = alias
      ? ((): string | null => {
        const exact = bnglFiles.find((fp) => normalizeKey(path.basename(fp)) === normalizeKey(alias + '.bngl'));
        return exact ? exact : findBestBnglForCsv(csvFile, bnglFiles);
      })()
      : findBestBnglForCsv(csvFile, bnglFiles);
    if (!bnglPath) return { gdatPaths: [] };

    const baseName = path.basename(bnglPath).replace(/\.bngl$/i, '');

    // Primary inferred candidate based on simulate() suffix.
    const inferredGdat = chooseReferenceFromBngl(baseName, bnglPath, gdatFiles);

    // Also consider all available GDAT variants for this BNGL base name.
    // Many models have multiple simulate phases (and thus multiple GDAT files).
    // The web batch runner may correspond to a different phase than a simple
    // "first/last" heuristic, so we try all variants and pick the best match.
    const baseNameLower = baseName.toLowerCase();
    const byPrefix = gdatFiles
      .filter((gf) => {
        const lower = gf.toLowerCase();
        return lower === `${baseNameLower}.gdat` || lower.startsWith(`${baseNameLower}_`);
      })
      .map((gf) => path.join(BNG_OUTPUT_DIR, gf));

    const requestedPhaseIndex = inferRequestedPhaseIndex(rawLabel, bnglPath);
    // Provenance applies here too: `chooseReferenceFromBngl` falls back to a
    // normalized filename match, and `byPrefix` matches on the fuzzy basename
    // — both can land on a sibling's file for same-key families.
    const candidates = dropForeignReferences(uniqueStrings([...(inferredGdat ? [inferredGdat] : []), ...byPrefix]));
    // Prefer comparing against ODE references; drop explicit SSA/NF variants.
    const odeCandidates = candidates.filter((p) => !isClearlyNonOdeGdat(p));
    const filteredCandidates = odeCandidates.length > 0 ? odeCandidates : candidates;
    const trustedCandidates = keepReferencesForModel(filteredCandidates, modelSource, referenceBnglNames);
    const tofitFilteredCandidates = requiresTofit
      ? trustedCandidates.filter((candidate) => normalizeKey(path.basename(candidate)).includes('tofit'))
      : trustedCandidates;

    if (requestedPhaseIndex > 1) {
      const phaseSpecificCandidates = tofitFilteredCandidates.filter((candidate) => {
        const fileName = path.basename(candidate, '.gdat').toLowerCase();
        return fileName === rawLabel.toLowerCase() || fileName === `${baseNameLower}_${requestedPhaseIndex}`;
      });
      return { gdatPaths: phaseSpecificCandidates, bnglPath, inferred: true };
    }

    return { gdatPaths: tofitFilteredCandidates, bnglPath, inferred: true };
  }

  function betterCandidate(a: ComparisonResult, b: ComparisonResult): boolean {
    const ad = a.details;
    const bd = b.details;
    if (!ad) return false;
    if (!bd) return true;

    const aStrict = a.status === 'match';
    const bStrict = b.status === 'match';
    if (aStrict !== bStrict) return aStrict;

    if (ad.columnMatch !== bd.columnMatch) return ad.columnMatch;
    if (ad.timeMatch !== bd.timeMatch) return ad.timeMatch;

    const aRowDelta = Math.abs(ad.webRows - ad.refRows);
    const bRowDelta = Math.abs(bd.webRows - bd.refRows);
    if (aRowDelta !== bRowDelta) return aRowDelta < bRowDelta;

    const aSamples = ad.samples?.length ?? 0;
    const bSamples = bd.samples?.length ?? 0;
    if (aSamples !== bSamples) return aSamples < bSamples;

    if (ad.maxRelativeError !== bd.maxRelativeError) return ad.maxRelativeError < bd.maxRelativeError;
    return ad.maxAbsoluteError < bd.maxAbsoluteError;
  }

  function compareData(
    webData: { headers: string[]; data: number[][] },
    refData: { headers: string[]; data: number[][] },
    modelName: string
  ): ComparisonResult['details'] {
    const { absTol, relTol } = getTolerances(modelName);
    // Normalize headers (lowercase, remove spaces)
    const normalizeHeader = (h: string) => h.toLowerCase().replace(/\s+/g, '_');
    const webHeadersNorm = webData.headers.map(normalizeHeader);
    const refHeadersNorm = refData.headers.map(normalizeHeader);

    // Column coverage is one-directional: the reference may carry columns the
    // web run cannot produce (BNG2 writes model parameters and the
    // `_rateLaw*` helpers it synthesises for functional rate rules), but a web
    // column with no reference column is a genuine mismatch.
    const coverage = compareColumnCoverage(webHeadersNorm, refHeadersNorm);
    const { columnMatch, matchedColumns, referenceOnlyColumns, webOnlyColumns } = coverage;
    const totalDataColumnCount = coverage.totalWebColumns;
    const missingColumns = referenceOnlyColumns;
    const extraColumns = webOnlyColumns;

    if (webOnlyColumns.length > 0) {
      console.warn(
        `[compare] ${modelName}: web columns absent from the reference: ${webOnlyColumns.slice(0, 10).join(', ')}`
      );
    }
    if (coverage.lowCoverage) {
      console.warn(
        `[compare] Low column coverage for ${modelName}: matched ${matchedColumns.length}/${coverage.totalWebColumns} web columns against ${coverage.totalRefColumns} reference columns.`
      );
    }

    let maxRelativeError = 0;
    let maxAbsoluteError = 0;
    let absTolDominated = false;
    let maxAbsoluteErrorAtTime: number | undefined;
    let maxAbsoluteErrorColumn: string | undefined;
    let maxRelativeErrorAtTime: number | undefined;
    let maxRelativeErrorColumn: string | undefined;
    let errorAtTime: number | undefined;
    let errorColumn: string | undefined;
    const samples: { time: number; column: string; web: number; ref: number; relError: number }[] = [];
    const nonFiniteReferenceCells: { time: number; column: string; value: string }[] = [];
    const bothNonFiniteCells: { time: number; column: string; web: string; ref: string }[] = [];

    const webTimeIdx = webHeadersNorm.indexOf('time');
    const refTimeIdx = refHeadersNorm.indexOf('time');

    if (webTimeIdx === -1 || refTimeIdx === -1) {
      return {
        webRows: webData.data.length,
        refRows: refData.data.length,
        webColumns: webData.headers,
        refColumns: refData.headers,
        columnMatch: false,
        matchedColumns,
        matchedColumnCount: matchedColumns.length,
        totalDataColumnCount,
        timeMatch: false,
        maxRelativeError: -1,
        maxAbsoluteError: -1,
      };
    }

    // Check for steady-state models (e.g., barua_2007)
    const isSteadyStateModel = STEADY_STATE_MODELS.some(m =>
      modelName.toLowerCase().includes(m.toLowerCase())
    );

    // For steady-state models, we need special handling because row counts can differ
    // due to different steady-state detection timing while values match in overlap
    const isSteadyStateRowMismatch = isSteadyStateModel && webData.data.length !== refData.data.length;

    // Compare all rows/cols (by index once headers are mapped).
    const refColumnIndex = indexReferenceColumns(refData.headers);

    const minRows = Math.min(webData.data.length, refData.data.length);
    const alignedRows = alignRowsByTime(webData.data, refData.data, webTimeIdx, refTimeIdx);
    const allOverlapRowsAligned = alignedRows.length === minRows;
    // A pair with no aligned row pair compared nothing at all, and every error
    // accumulator below stays at its 0 initial value, so it would otherwise be
    // reported as a zero-error match. Two header-only files are not a match.
    const comparedAnyRow = alignedRows.length > 0;
    let timeMatch = comparedAnyRow && webData.data.length === refData.data.length && alignedRows.length === webData.data.length;
    let timeOffset: number | undefined;
    if (alignedRows.length > 0) {
      timeOffset = alignedRows[0].webRow[webTimeIdx] - alignedRows[0].refRow[refTimeIdx];
    }

    const timeGridMatches = allOverlapRowsAligned;
    // The overlap relaxation exists because the *reference* is a prefix: the web
    // run emits every phase while BNG2 only produced the first. It must never
    // apply in the other direction, where the web trajectory stops early and
    // the unverified tail of the reference is the divergent part. Requiring the
    // aligned rows to span the whole reference keeps the documented case and
    // rejects a truncated web run.
    const overlapCoversWholeReference = alignedRows.length === refData.data.length;

    let overlapMatch = false;

    // For steady-state models, if time grid matches and values match in overlap, accept as PASS
    if (isSteadyStateRowMismatch && timeGridMatches) {
      const overlapRows = alignedRows.length;
      let valuesMatchInOverlap = true;
      let maxOverlapRelError = 0;

      for (const { webRow, refRow } of alignedRows) {
        if (!valuesMatchInOverlap) break;

        for (let ci = 0; ci < webData.headers.length; ci++) {
          const colName = webData.headers[ci];
          const colNameNorm = normalizeHeader(colName);
          if (colNameNorm === 'time') continue;

          const refColIdx = refColumnIndex(colName);
          if (refColIdx === undefined) continue;

          const webVal = webRow[ci];
          const refVal = refRow[refColIdx];

          const absErr = Math.abs(webVal - refVal);
          const denom = Math.max(Math.abs(refVal), Math.abs(webVal), 1e-30);
          const relError = absErr / denom;

          maxOverlapRelError = Math.max(maxOverlapRelError, relError);

          if (absErr > ABS_TOL && relError > REL_TOL) {
            valuesMatchInOverlap = false;
            break;
          }
        }
      }

      if (valuesMatchInOverlap) {
        timeMatch = true;
        overlapMatch = true;
        console.log(`  [steady_state model] Row count differs (web=${webData.data.length}, ref=${refData.data.length}) but values match in ${overlapRows} overlapping rows.`);
        console.log(`    Max relative error in overlap: ${(maxOverlapRelError * 100).toFixed(6)}%`);
        console.log(`    Accepting as PASS (steady-state timing difference).`);
      }
    } else if (!isSteadyStateModel) {
      // For non-steady-state models, timeMatch requires exact row count match
      timeMatch = comparedAnyRow && timeGridMatches && webData.data.length === refData.data.length;

      // If time grids match for the overlapping rows and values are within tolerance,
      // accept overlap-only comparisons (e.g., web trims early phases).
      if (!timeMatch && comparedAnyRow && timeGridMatches && webData.data.length !== refData.data.length) {
        const overlapRows = alignedRows.length;
        let valuesMatchInOverlap = true;
        let maxOverlapRelError = 0;

        for (const { webRow, refRow } of alignedRows) {
          if (!valuesMatchInOverlap) break;

          for (let ci = 0; ci < webData.headers.length; ci++) {
            const colName = webData.headers[ci];
            const colNameNorm = normalizeHeader(colName);
            if (colNameNorm === 'time') continue;

            const refColIdx = refColumnIndex(colName);
            if (refColIdx === undefined) continue;

            const webVal = webRow[ci];
            const refVal = refRow[refColIdx];

            const absErr = Math.abs(webVal - refVal);
            const denom = Math.max(Math.abs(refVal), Math.abs(webVal), 1e-30);
            const relError = absErr / denom;

            maxOverlapRelError = Math.max(maxOverlapRelError, relError);

            if (absErr > absTol && relError > relTol) {
              valuesMatchInOverlap = false;
              break;
            }
          }
        }

        // PARTIAL_MATCH_TIME names the models whose reference is deliberately
        // only a prefix of the web run (BNG2 could not produce the later
        // phases). That is a reviewed, per-model exception to the rule above;
        // every other model must cover its whole reference.
        const partialMatchIsDeclared = PARTIAL_MATCH_TIME[normalizeKey(modelName)] !== undefined;
        if (valuesMatchInOverlap && (overlapCoversWholeReference || partialMatchIsDeclared)) {
          timeMatch = true;
          overlapMatch = true;
          console.log(`  [overlap match] Row count differs (web=${webData.data.length}, ref=${refData.data.length}) but values match in ${overlapRows} overlapping rows.`);
          console.log(`    Max relative error in overlap: ${(maxOverlapRelError * 100).toFixed(6)}%`);
        } else if (valuesMatchInOverlap) {
          console.log(`  [overlap] Rejecting: the aligned rows cover only ${alignedRows.length}/${refData.data.length} reference rows, so the tail of the reference is unverified.`);
        }
      }
    }

    for (const { webRow, refRow, time: webTime } of alignedRows) {

      for (let ci = 0; ci < webData.headers.length; ci++) {
        const colName = webData.headers[ci];
        const colNameNorm = normalizeHeader(colName);
        if (colNameNorm === 'time') continue;

        const refColIdx = refColumnIndex(colName);
        if (refColIdx === undefined) continue;

        const webVal = webRow[ci];
        const refVal = refRow[refColIdx];

        // A non-finite value in a column the two runs share is a failed solve,
        // never agreement: `NaN > tol` and `NaN <= tol` are both false, so such
        // a cell would leave every error accumulator at 0 and be reported as a
        // zero-error match.
        //
        // When only ONE side is non-finite that is a divergence and is recorded
        // as a discrepancy. When BOTH are non-finite it is not: the two runs
        // agree that the quantity is undefined at that point, just with
        // different notation — BNG2's mu::Parser writes `1.#INF` where our
        // exporter writes `Infinity`. pt403/pt409 hit exactly this at t=0 on
        // lnV/half_life/lnV_tangent and matched to 4.9e-13 absolute everywhere
        // else; failing them for agreeing that a log is -inf would be the gate
        // inventing a divergence that is not there.
        if (!Number.isFinite(webVal) || !Number.isFinite(refVal)) {
          const bothNonFinite = !Number.isFinite(webVal) && !Number.isFinite(refVal);
          if (!bothNonFinite) {
            if (nonFiniteReferenceCells.length < 10) {
              nonFiniteReferenceCells.push({ time: webTime, column: colName, value: String(refVal) });
            }
            if (samples.length < 10) {
              samples.push({ time: webTime, column: colName, web: webVal, ref: refVal, relError: Number.NaN });
            }
          } else if (bothNonFiniteCells.length < 10) {
            bothNonFiniteCells.push({ time: webTime, column: colName, web: String(webVal), ref: String(refVal) });
          }
          continue;
        }

        const absError = Math.abs(webVal - refVal);
        const denom = Math.max(Math.abs(refVal), Math.abs(webVal), 1e-30);
        const relError = absError / denom;

        if (absError > maxAbsoluteError) {
          maxAbsoluteError = absError;
          maxAbsoluteErrorAtTime = webTime;
          maxAbsoluteErrorColumn = colName;
        }
        if (relError > maxRelativeError) {
          maxRelativeError = relError;
          maxRelativeErrorAtTime = webTime;
          maxRelativeErrorColumn = colName;
          errorAtTime = webTime;
          errorColumn = colName;
        }

        // If absError is within absTol but relative error is huge, this is a near-zero-value case.
        // Mark it so the summary can report it clearly.
        if (absError <= absTol && relError > relTol) {
          absTolDominated = true;
        }

        // Sample some points above tolerance.
        const tolerance = absTol + relTol * Math.max(Math.abs(refVal), Math.abs(webVal));
        if (samples.length < 10 && absError > tolerance) {
          samples.push({ time: webTime, column: colName, web: webVal, ref: refVal, relError });
        }
      }
    }

    return {
      webRows: webData.data.length,
      refRows: refData.data.length,
      webColumns: webData.headers,
      refColumns: refData.headers,
      columnMatch,
      missingColumns,
      extraColumns,
      matchedColumns,
      matchedColumnCount: matchedColumns.length,
      totalDataColumnCount,
      timeMatch,
      timeOffset,
      maxRelativeError,
      maxAbsoluteError,
      absTolDominated,
      overlapMatch,
      maxAbsoluteErrorAtTime,
      maxAbsoluteErrorColumn,
      maxRelativeErrorAtTime,
      maxRelativeErrorColumn,
      errorAtTime,
      errorColumn,
      samples,
      nonFiniteReferenceCells,
      bothNonFiniteCells,
    };
  }

  function hasInsufficientColumnOverlap(details: ComparisonResult['details']): boolean {
    if (!details) return false;
    const matched = details.matchedColumnCount ?? 0;
    const total = details.totalDataColumnCount ?? 0;
    if (total <= 0) return matched === 0;
    const ratio = matched / total;
    return matched === 0 || ratio < 0.5;
  }

  function hasExtremeRowMismatch(
    details: ComparisonResult['details'],
    referenceModelInfo?: ReferenceModelInfo | null
  ): boolean {
    if (!details) return false;
    if (referenceModelInfo?.isMultiPhaseOde) return false;
    const webRows = details.webRows;
    const refRows = details.refRows;
    if (webRows <= 0 || refRows <= 0) return false;
    const ratio = Math.max(webRows, refRows) / Math.min(webRows, refRows);
    return ratio > 10;
  }

  async function main() {
    console.log('='.repeat(80));
    console.log('BioNetGen Web Simulator Output Comparison');
    console.log('='.repeat(80));
    console.log();

    if (!fs.existsSync(WEB_OUTPUT_DIR)) {
      console.error(`Web output directory not found: ${WEB_OUTPUT_DIR}`);
      process.exit(1);
    }

    if (!fs.existsSync(BNG_OUTPUT_DIR)) {
      console.error(`BNG output directory not found: ${BNG_OUTPUT_DIR}`);
      process.exit(1);
    }

    const allCsvFiles = fs.readdirSync(WEB_OUTPUT_DIR).filter(f => f.toLowerCase().endsWith('.csv'));
    // If the browser downloaded duplicates (e.g., file.csv + file(1).csv),
    // only compare one copy.
    const seen = new Set<string>();
    const csvFiles: string[] = [];
    console.log(`Found ${allCsvFiles.length} CSV files in ${WEB_OUTPUT_DIR}`);

    for (const f of allCsvFiles) {
      console.log(`Processing file: ${f}`);
      const key = stripDownloadSuffix(f).toLowerCase();

      if (seen.has(key)) continue;
      seen.add(key);
      csvFiles.push(f);
    }
    console.log(`Found ${csvFiles.length} web output CSV files (deduped from ${allCsvFiles.length})\n`);

    const requestedModels = process.env.MODELS ? process.env.MODELS.split(',').map(s => s.trim().toLowerCase()) : null;

    const results: ComparisonResult[] = [];
    const processedModels = new Set<string>();

    for (const csvFile of csvFiles) {
      const csvModelName = csvModelLabel(csvFile);
      if (requestedModels) {
        const isMatch = requestedModels.some(req =>
          req === csvModelName.toLowerCase() ||
          normalizeKey(req) === normalizeKey(csvModelName)
        );
        if (!isMatch) continue;
      }

      if (csvFile.toLowerCase().includes('hat')) {
        console.log(`[DEBUG] Processing potential Hat file: ${csvFile}`);
      }
      const ref = findGdatCandidates(csvFile);
      if (csvFile.toLowerCase().includes('hat')) {
        console.log(`[DEBUG] GDAT Candidates for ${csvFile}:`, ref.gdatPaths);
        console.log(`[DEBUG] BNGL Path:`, ref.bnglPath);
      }
      const modelName = csvModelLabel(csvFile);
      processedModels.add(modelName);
      const referenceModelInfo = analyzeReferenceModel(modelName, ref.bnglPath);

      // Models the web simulator structurally cannot reproduce (scan/bifurcate,
      // or a simulate method other than ODE) are detected from the model source
      // rather than from a list of model names.
      if (ref.bnglPath && fs.existsSync(ref.bnglPath)) {
        const unsupported = detectUnsupportedFeature(fs.readFileSync(ref.bnglPath, 'utf8'));
        if (unsupported) {
          console.log(`  SKIP ${modelName}: ${unsupported}`);
          results.push({
            model: modelName,
            status: 'skipped',
            referenceFile: undefined,
            referenceInferred: ref.inferred,
            details: null,
            error: unsupported,
          });
          continue;
        }
      }

      // Skip models known to fail in canonical BNG2.pl (explicit exclusion list in constants.ts)
      const normalizedModelKey = normalizeKey(modelName);
      if (NORMALIZED_BNG2_EXCLUDED.has(normalizedModelKey)) {
        console.log(`Skipping ${modelName} (excluded: fails BNG2.pl)`);
        results.push({
          model: modelName,
          status: 'skipped',
          referenceFile: undefined,
          referenceInferred: false,
          details: null,
          error: 'Excluded: fails BNG2.pl',
        });
        continue;
      }

      if (referenceModelInfo && [...referenceModelInfo.methods].some((method) => method !== 'ode')) {
        results.push({
          model: modelName,
          status: 'skipped',
          referenceFile: undefined,
          referenceInferred: ref.inferred,
          details: null,
          error: `Skipped non-deterministic or NFsim model (${formatMethodSummary(referenceModelInfo.methods)}).`,
        });
        continue;
      }

      if (!ref.gdatPaths || ref.gdatPaths.length === 0) {
        if ((referenceModelInfo?.requestedPhaseIndex ?? 1) > 1) {
          results.push({
            model: modelName,
            status: 'skipped',
            referenceFile: undefined,
            referenceInferred: ref.inferred,
            details: null,
            error: `Skipped phase ${referenceModelInfo?.requestedPhaseIndex} output because no phase-specific GDAT reference was found.`,
          });
          continue;
        }

        // Check for BNG failure marker
        const failMarker = path.join(BNG_OUTPUT_DIR, `${modelName}.bngfail`);
        const nosourceMarker = path.join(BNG_OUTPUT_DIR, `${modelName}.nosource`);

        if (fs.existsSync(nosourceMarker)) {
          const reason = fs.readFileSync(nosourceMarker, 'utf8').trim();
          results.push({
            model: modelName,
            status: 'source_missing',
            referenceFile: undefined,
            referenceInferred: ref.inferred,
            details: null,
            error: reason,
          });
        } else if (fs.existsSync(failMarker)) {
          const errorMsg = fs.readFileSync(failMarker, 'utf8').trim();
          results.push({
            model: modelName,
            status: 'bng_failed',
            referenceFile: undefined,
            referenceInferred: ref.inferred,
            details: null,
            error: errorMsg,
          });
        } else {
          results.push({
            model: modelName,
            status: 'missing_reference',
            referenceFile: undefined,
            referenceInferred: ref.inferred,
            details: null,
          });
        }
        continue;
      }

      try {
        const csvContent = fs.readFileSync(path.join(WEB_OUTPUT_DIR, csvFile), 'utf8');
        console.log(`Parsing files for ${modelName}...`);
        const webData = parseCSV(csvContent);
        console.log(`Parsed Web CSV. Rows: ${webData.data.length}`);

        // Try multi-phase concatenation first if we have a BNGL path
        const gdatFiles = fs.readdirSync(BNG_OUTPUT_DIR).filter(f => f.toLowerCase().endsWith('.gdat'));
        let multiPhaseRef: { headers: string[]; data: number[][] } | null = null;
        if (ref.bnglPath) {
          const baseName = path.basename(ref.bnglPath).replace(/\.bngl$/i, '');
          multiPhaseRef = getMultiPhaseReference(baseName, ref.bnglPath, gdatFiles);
        }

        if (referenceModelInfo?.isMultiPhaseOde && !multiPhaseRef && (referenceModelInfo.requestedPhaseIndex === 1)) {
          results.push({
            model: modelName,
            status: 'skipped',
            referenceFile: undefined,
            referenceInferred: ref.inferred,
            details: null,
            error: 'Skipped multi-phase model because the full per-phase GDAT reference set could not be resolved.',
          });
          continue;
        }

        // Compare against all viable candidates and pick the best.
        // Include concatenated multi-phase reference as one candidate when available.
        let best: ComparisonResult | null = null;
        let hadInsufficientOverlap = false;
        let hadExtremeRowMismatch = false;

        if (multiPhaseRef) {
          console.log(`[MultiPhase] Using concatenated reference (${multiPhaseRef.data.length} rows)`);
          const comparison = compareData(webData, multiPhaseRef, modelName);
          if (comparison) {
            if (hasInsufficientColumnOverlap(comparison)) {
              hadInsufficientOverlap = true;
              console.warn(`[compare] Skipping multi-phase reference for ${modelName}: insufficient column overlap.`);
            } else if (hasExtremeRowMismatch(comparison, referenceModelInfo)) {
              hadExtremeRowMismatch = true;
              console.warn(`[compare] Skipping multi-phase reference for ${modelName}: row count mismatch too large.`);
            } else {
              const isSteadyStateModel = STEADY_STATE_MODELS.some(m =>
                modelName.toLowerCase().includes(m.toLowerCase())
              );
              const strictOk =
                comparison.columnMatch &&
                comparison.timeMatch &&
                (isSteadyStateModel || comparison.webRows === comparison.refRows || comparison.overlapMatch) &&
                (comparison.samples?.length ?? 0) === 0;

              best = {
                model: modelName,
                status: strictOk ? 'match' : 'mismatch',
                referenceFile: '[multi-phase concatenation]',
                referenceInferred: true,
                details: comparison,
              };
            }
          }
        }

        // Evaluate single-file candidates as well.
        for (const candidatePath of ref.gdatPaths) {
          const gdatContent = fs.readFileSync(candidatePath, 'utf8');
          const refData = parseGDAT(gdatContent);
          console.log(`Parsed Ref GDAT (${path.basename(candidatePath)}). Rows: ${refData.data.length}`);
          // Special handling for multi-phase partial matching
          const normalizedKey = normalizeKey(modelName);
          if (PARTIAL_MATCH_TIME[normalizedKey] !== undefined) {
            const limit = PARTIAL_MATCH_TIME[normalizedKey];
            const timeIdx = webData.headers.findIndex(h => h.toLowerCase() === 'time');
            if (timeIdx !== -1) {
              // Create a *copy* of webData.data for this comparison to avoid modifying it for subsequent candidates
              webData.data = webData.data.filter(row => row[timeIdx] <= limit + 1e-9); // 1e-9 tolerance
              console.log(`[Partial Match] Truncated ${normalizedKey} to t=${limit} (rows=${webData.data.length})`);
              // Restore webData.data after comparison if needed, or ensure compareData uses the filtered data
              // For now, compareData will use the modified webData.data.
              // If multiple candidates need to compare against the *full* webData, this needs to be handled differently
              // (e.g., pass a copy to compareData, or reset webData.data after each candidate comparison).
              // Assuming for now that the truncation applies to all candidates for this model.
            }
          }

          const comparison = compareData(webData, refData, modelName);
          if (!comparison) {
            console.warn(`[compare] compareData returned null for ${candidatePath}`);
            continue;
          }

          if (hasInsufficientColumnOverlap(comparison)) {
            hadInsufficientOverlap = true;
            console.warn(`[compare] Skipping ${path.basename(candidatePath)} for ${modelName}: insufficient column overlap.`);
            continue;
          }

          if (hasExtremeRowMismatch(comparison, referenceModelInfo)) {
            hadExtremeRowMismatch = true;
            console.warn(`[compare] Skipping ${path.basename(candidatePath)} for ${modelName}: row count mismatch too large.`);
            continue;
          }

          const isSteadyStateModel = STEADY_STATE_MODELS.some(m =>
            modelName.toLowerCase().includes(m.toLowerCase())
          );
          const strictOk =
            comparison.columnMatch &&
            comparison.timeMatch &&
            (isSteadyStateModel || comparison.webRows === comparison.refRows || comparison.overlapMatch) &&
            (comparison.samples?.length ?? 0) === 0;
          const status: ComparisonResult['status'] = strictOk ? 'match' : 'mismatch';

          const candidate: ComparisonResult = {
            model: modelName,
            status,
            referenceFile: path.basename(candidatePath),
            referenceInferred: ref.inferred,
            details: comparison,
          };

          if (!best || betterCandidate(candidate, best)) {
            best = candidate;
            if (candidate.status === 'match') break;
          }
        }

        // Check for generic SKIPPED marker
        if (csvContent.includes('# SKIPPED')) {
          results.push({
            model: modelName,
            status: 'skipped',
            referenceFile: undefined,
            referenceInferred: ref.inferred,
            details: null
          });
          continue;
        }

        // Check for a ModelFailed marker. Under strict functional-rate mode a model that
        // hits an unresolved symbol / NaN now throws during generation; the generator
        // writes a distinct `# FAILED (ModelFailed)` marker instead of a generic skip so
        // that a genuine failure is NOT silently hidden behind a neutral `skipped`.
        // Models in EXPECTED_MISMATCHES (e.g. __FREE PyBNF fitting templates) stay
        // neutral; anything else is surfaced as a hard error so CI goes red.
        if (csvContent.includes('# FAILED (ModelFailed)')) {
          const expected = EXPECTED_MISMATCHES[normalizeKey(modelName)] || EXPECTED_MISMATCHES[modelName];
          if (expected) {
            results.push({
              model: modelName,
              status: 'skipped',
              referenceFile: undefined,
              referenceInferred: ref.inferred,
              details: null,
              error: expected,
            });
          } else {
            results.push({
              model: modelName,
              status: 'error',
              referenceFile: undefined,
              referenceInferred: ref.inferred,
              details: null,
              error: 'Model failed during generation (strict functional-rate failure) and is not in EXPECTED_MISMATCHES',
            });
          }
          continue;
        }

        if (best) {
          results.push(best);
        } else if (hadInsufficientOverlap || hadExtremeRowMismatch) {
          const reason = hadInsufficientOverlap
            ? 'Insufficient column overlap with GDAT references.'
            : 'Row count mismatch too large for non-multi-phase model.';
          // A reference WAS found and compared; it was rejected because the two
          // engines disagreed about the network (too few shared columns, or a row
          // count more than 10x apart). Reporting that as `missing_reference` made
          // a real divergence green — `missing_reference` does not fail CI — and
          // hid the only evidence of it. It is a mismatch.
          results.push({
            model: modelName,
            status: 'mismatch',
            referenceFile: undefined,
            referenceInferred: ref.inferred,
            details: null,
            error: reason,
          });
        } else {
          results.push({
            model: modelName,
            status: 'error',
            referenceFile: undefined,
            referenceInferred: ref.inferred,
            details: null,
            error: 'No viable GDAT candidates could be compared',
          });
        }
      } catch (error) {
        results.push({
          model: modelName,
          status: 'error',
          referenceFile: undefined,
          referenceInferred: ref.inferred,
          details: null,
          error: String(error),
        });
      }
    }

    // ADDITION: Scan for failure markers for models that produced NO web output CSV
    const bngFailFiles = fs.readdirSync(BNG_OUTPUT_DIR).filter(f => f.endsWith('.bngfail') || f.endsWith('.nosource'));
    for (const f of bngFailFiles) {
      const modelName = f.replace(/\.(bngfail|nosource)$/, '');
      if (processedModels.has(modelName)) continue;

      const fullPath = path.join(BNG_OUTPUT_DIR, f);
      const content = fs.readFileSync(fullPath, 'utf8').trim();
      const status = f.endsWith('.nosource') ? 'source_missing' : 'bng_failed';

      results.push({
        model: modelName,
        status: status as any,
        referenceFile: undefined,
        referenceInferred: false,
        details: null,
        error: content,
      });
    }

    // Persist a JSON snapshot for artifacts/debugging.
    try {
      if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
      const outPath = path.join(SESSION_DIR, 'compare_results.after_refs.json');
      fs.writeFileSync(
        outPath,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            absTol: ABS_TOL,
            relTol: REL_TOL,
            timeTol: TIME_TOL,
            webOutputDir: path.relative(PROJECT_ROOT, WEB_OUTPUT_DIR).replace(/\\/g, '/'),
            bngOutputDir: path.relative(PROJECT_ROOT, BNG_OUTPUT_DIR).replace(/\\/g, '/'),
            summary: {
              total: results.length,
              matching: results.filter(r => r.status === 'match').length,
              mismatches: results.filter(r => r.status === 'mismatch').length,
              missingReference: results.filter(r => r.status === 'missing_reference').length,
              skipped: results.filter(r => r.status === 'skipped').length,
              errors: results.filter(r => r.status === 'error').length,
            },
            results,
          },
          null,
          2
        ),
        'utf8'
      );
      console.log(`Wrote JSON results: ${path.relative(PROJECT_ROOT, outPath).replace(/\\/g, '/')}`);
      console.log();
      const reportPath = path.join(PROJECT_ROOT, 'validation_report.json');
      fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
      console.log(`Detailed JSON report written to: ${reportPath}`);
    } catch (e) {
      console.error('Error writing JSON report:', e);
    }

    // Print summary
    console.log('Summary of Comparisons:');
    console.log('-'.repeat(80));

    const matches = results.filter(r => r.status === 'match');
    const mismatches = results.filter(r => r.status === 'mismatch');
    const missing = results.filter(r => r.status === 'missing_reference');
    const errors = results.filter(r => r.status === 'error');
    const skipped = results.filter(r => r.status === 'skipped');

    console.log(`Matching:      ${matches.length}`);
    console.log(`Mismatches:    ${mismatches.length}`);
    console.log(`No reference:  ${missing.length}`);
    console.log(`Skipped:       ${skipped.length}`);
    console.log(`Errors:        ${errors.length}`);
    console.log();

    // Print match details
    if (matches.length > 0) {
      console.log(`Matching Models (ABS_TOL=${ABS_TOL}, REL_TOL=${REL_TOL}):`);
      for (const r of matches) {
        const err = r.details?.maxRelativeError ?? 0;
        const absErr = r.details?.maxAbsoluteError ?? 0;
        const refLabel = r.referenceFile ? ` (ref=${r.referenceFile})` : '';
        const absDominated = r.details?.absTolDominated === true;
        const note = absDominated ? ' (abs tol dominated near zero)' : '';
        console.log(
          `  OK ${r.model}${refLabel}${note}: max abs error = ${absErr.toExponential(6)}, max rel error = ${(err * 100).toFixed(6)}%`
        );
      }
      console.log();
    }

    // Print mismatch details
    if (mismatches.length > 0) {
      console.log('Mismatched Models:');
      for (const r of mismatches) {
        const refLabel = r.referenceFile ? ` (ref=${r.referenceFile})` : '';
        console.log(`  FAIL ${r.model}${refLabel}:`);
        if (r.details) {
          console.log(`     Rows: web=${r.details.webRows}, ref=${r.details.refRows}`);
          console.log(`     Columns match: ${r.details.columnMatch}`);
          if (typeof r.details.matchedColumnCount === 'number' && typeof r.details.totalDataColumnCount === 'number') {
            console.log(`     Matched columns: ${r.details.matchedColumnCount}/${r.details.totalDataColumnCount}`);
          }
          if (!r.details.columnMatch) {
            if ((r.details.missingColumns?.length ?? 0) > 0) {
              console.log(`     Missing columns (in web): ${r.details.missingColumns!.slice(0, 10).join(', ')}${r.details.missingColumns!.length > 10 ? ' ...' : ''}`);
            }
            if ((r.details.extraColumns?.length ?? 0) > 0) {
              console.log(`     Extra columns (in web): ${r.details.extraColumns!.slice(0, 10).join(', ')}${r.details.extraColumns!.length > 10 ? ' ...' : ''}`);
            }
          }
          console.log(`     Time grid match: ${r.details.timeMatch}`);
          if (r.details.timeMatch === false && typeof r.details.timeOffset === 'number') {
            console.log(`     Time offset (web[0]-ref[0]): ${r.details.timeOffset}`);
          }

          console.log(`     Max absolute error: ${r.details.maxAbsoluteError.toExponential(6)}`);
          if (typeof r.details.maxAbsoluteErrorAtTime === 'number' && r.details.maxAbsoluteErrorColumn) {
            console.log(`       at t=${r.details.maxAbsoluteErrorAtTime}, col=${r.details.maxAbsoluteErrorColumn}`);
          }
          console.log(`     Max relative error: ${(r.details.maxRelativeError * 100).toFixed(6)}%`);
          if (typeof r.details.maxRelativeErrorAtTime === 'number' && r.details.maxRelativeErrorColumn) {
            console.log(`       at t=${r.details.maxRelativeErrorAtTime}, col=${r.details.maxRelativeErrorColumn}`);
          }
          if (r.details.samples && r.details.samples.length > 0) {
            console.log(`     Sample discrepancies:`);
            for (const s of r.details.samples.slice(0, 3)) {
              console.log(`       t=${s.time}: ${s.column} web=${s.web.toExponential(4)} ref=${s.ref.toExponential(4)} (${(s.relError * 100).toFixed(2)}%)`);
            }
          }
          if (r.details.nonFiniteReferenceCells && r.details.nonFiniteReferenceCells.length > 0) {
            console.log(`     Non-finite reference values in compared columns:`);
            for (const c of r.details.nonFiniteReferenceCells.slice(0, 3)) {
              console.log(`       t=${c.time}: ${c.column} ref=${c.value} (BNG2 wrote a non-finite value)`);
            }
          }
        } else if (r.error) {
          // Mismatches recorded without details (a reference that was compared
          // and then rejected) still have to say why.
          console.log(`     ${r.error}`);
        }
      }
      console.log();
    }

    // Print missing references
    if (missing.length > 0) {
      console.log('Models without reference GDAT files:');
      for (const r of missing) {
        console.log(`  NOREF ${r.model}`);
      }
      console.log();
    }

    if (skipped.length > 0) {
      console.log('Skipped Models:');
      for (const r of skipped) {
        console.log(`  SKIP ${r.model}: ${r.error ?? 'Skipped by comparison policy'}`);
      }
      console.log();
    }

    // Print errors
    if (errors.length > 0) {
      console.log('Models with errors:');
      for (const r of errors) {
        console.log(`  ERROR ${r.model}: ${r.error}`);
      }
      console.log();
    }

    console.log('='.repeat(80));
    console.log(`Total: ${results.length} models compared`);

    // Export results to JSON for machine reading
    const reportPath = path.join(PROJECT_ROOT, 'scripts', 'comparison_report_full.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`Full report saved to: ${reportPath}`);

    const unexpectedMismatches = mismatches.filter(
      (r) => !EXPECTED_MISMATCHES[normalizeKey(r.model)] && !EXPECTED_MISMATCHES[r.model]
    );

    if (unexpectedMismatches.length > 0) {
      console.error(`${unexpectedMismatches.length} UNEXPECTED model mismatch(es):`);
      for (const mismatch of unexpectedMismatches) {
        console.error(`  - ${mismatch.model}`);
      }
      process.exit(1);
    } else if (mismatches.length > 0) {
      console.log(`All ${mismatches.length} mismatch(es) are in the expected-mismatches list. CI pass.`);
    }
    if (errors.length > 0) {
      console.error(`${errors.length} model(s) failed during comparison.`);
      process.exit(1);
    }
    // `results.length > 0` used to guard this, so a sweep that compared nothing
    // at all — an empty web_output, a corpus that produced no CSV — exited 0
    // with a green CI and an empty report. Anything other than at least one
    // successful comparison is a broken reference pipeline, not a pass.
    if (matches.length === 0) {
      console.error(
        `FAIL: No models produced a successful comparison (${results.length} results, ${missing.length} missing reference, ${skipped.length} skipped, ${errors.length} errors). The reference pipeline may be broken.`
      );
      process.exit(1);
    }
  }

// A throw that escapes main() used to be swallowed by `.catch(console.error)`,
// which printed a stack trace and still exited 0 — CI green on a run that
// compared nothing (a corrupt RuleHub manifest is enough to trigger it).
main().catch((error) => {
  console.error(error);
  process.exit(1);
});