/**
 * generate_scatter_data.ts
 *
 * Builds the Fig 7 validation scatter from the layered parity report.
 *
 * For each model that the parity checker classified as pass or threshold_only
 * AND that has comparable GDAT data, reads the BNG2 .gdat reference and
 * playground web_output .csv, extracts the FINAL time-point value for each
 * observable, and emits one (bng2, playground) point per (model, observable).
 *
 * This avoids biasing toward models with many time steps.
 *
 * Multi-phase web outputs are handled by extracting the last phase
 * (after the final time-reset).
 *
 * Usage:
 *   npx tsx scripts/analysis/generate_scatter_data.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const FIXTURES_DIR = path.resolve('tests/fixtures/gdat');
const WEB_OUTPUT_DIR = path.resolve('web_output');
const PARITY_REPORT = path.resolve('artifacts/parity_layer_report.deterministic.json');
const OUT_FILE = path.resolve('artifacts/paper/fig7_validation_scatter.json');

// ── Types ──────────────────────────────────────────────────────────────────

interface ParityEntry {
  model: string;
  rootCause: string;
  gdatFilesCompared: boolean;
  gdatComparable: boolean;
  gdatDiffs: Array<{ observable: string; maxRelErr: number; maxAbsErr: number; tier: string }>;
}

interface ScatterPoint {
  x: number;  // BNG2.pl value (reference)
  y: number;  // Playground value
  model: string;
  observable: string;
}

// ── Parsers ────────────────────────────────────────────────────────────────

interface Row { time: number; values: Map<string, number> }

function parseGdat(filePath: string): Row[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].replace(/^#\s*/, '').trim().split(/\s+/);
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith('#')) continue;
    const vals = lines[i].trim().split(/\s+/).map(Number);
    if (vals.length < 2 || vals.some(isNaN)) continue;
    const values = new Map<string, number>();
    for (let j = 0; j < headers.length && j < vals.length; j++) values.set(headers[j], vals[j]);
    rows.push({ time: vals[0], values });
  }
  return rows;
}

function parseCsv(filePath: string): Row[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(s => Number(s.trim()));
    if (vals.length < 2 || vals.some(isNaN)) continue;
    const values = new Map<string, number>();
    for (let j = 0; j < headers.length && j < vals.length; j++) values.set(headers[j], vals[j]);
    rows.push({ time: vals[0], values });
  }
  return rows;
}

/** Extract the last simulation phase (after the final time-reset). */
function extractLastPhase(rows: Row[]): Row[] {
  if (rows.length < 2) return rows;
  let lastResetIdx = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].time < rows[i - 1].time - 1e-10) lastResetIdx = i;
  }
  return lastResetIdx > 0 ? rows.slice(lastResetIdx) : rows;
}

/** Normalize model name for matching: lowercase, hyphens → underscores. */
function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[-]/g, '_');
}

/** Build a lookup from normalized name → actual file path. */
function buildFileLookup(dir: string, ext: string, prefix = ''): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(dir)) return map;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(ext)) continue;
    const base = f.slice(prefix.length, f.length - ext.length);
    map.set(normalizeKey(base), path.join(dir, f));
  }
  return map;
}

// ── Main ───────────────────────────────────────────────────────────────────

if (!fs.existsSync(PARITY_REPORT)) {
  console.error(`Parity report not found at ${PARITY_REPORT}. Run the layered parity check first.`);
  process.exit(1);
}

const report: ParityEntry[] = JSON.parse(fs.readFileSync(PARITY_REPORT, 'utf8'));

// Filter to models the parity checker says pass/threshold AND have comparable GDAT
const eligible = report.filter(
  m => (m.rootCause === 'pass' || m.rootCause === 'threshold_only') &&
       m.gdatFilesCompared && m.gdatComparable
);

// Also include models that pass but didn't have GDAT compared (we can still
// compare if both files exist on disk — the parity checker may not have run
// GDAT comparison because it generated artifacts as CDAT only).
const passNoGdat = report.filter(
  m => (m.rootCause === 'pass' || m.rootCause === 'threshold_only') &&
       !m.gdatFilesCompared
);

// Build normalized file lookups
const gdatLookup = buildFileLookup(FIXTURES_DIR, '.gdat');
const csvLookup = buildFileLookup(WEB_OUTPUT_DIR, '.csv', 'results_');
console.log(`Reference gdats: ${gdatLookup.size}, Web csvs: ${csvLookup.size}`);

const allCandidates = [...eligible, ...passNoGdat];
console.log(`Parity report: ${report.length} models, ${eligible.length} with GDAT, ${passNoGdat.length} pass without GDAT, ${allCandidates.length} total candidates`);

const points: ScatterPoint[] = [];
let matched = 0;
let skipped = 0;
let noGdat = 0;
let noCsv = 0;

for (const entry of allCandidates) {
  const modelName = entry.model;
  const key = normalizeKey(modelName);

  // Find reference gdat via normalized lookup
  const gdatPath = gdatLookup.get(key);
  if (!gdatPath) { noGdat++; continue; }

  // Find web csv via normalized lookup
  const csvPath = csvLookup.get(key);
  if (!csvPath) { noCsv++; continue; }

  const refRows = parseGdat(gdatPath);
  const webRowsRaw = parseCsv(csvPath);
  if (refRows.length === 0 || webRowsRaw.length === 0) { skipped++; continue; }

  // Extract last phase for multi-phase models
  const webRows = extractLastPhase(webRowsRaw);

  // Get the FINAL row from each
  const refFinal = refRows[refRows.length - 1];
  const webFinal = webRows[webRows.length - 1];

  // Find common observable names (excluding 'time')
  const refKeys = [...refFinal.values.keys()].filter(k => k.toLowerCase() !== 'time');
  const webKeys = new Set([...webFinal.values.keys()].filter(k => k.toLowerCase() !== 'time'));
  const common = refKeys.filter(k => webKeys.has(k));

  if (common.length === 0) { skipped++; continue; }

  for (const obs of common) {
    const refVal = refFinal.values.get(obs);
    const webVal = webFinal.values.get(obs);
    if (refVal === undefined || webVal === undefined) continue;
    if (!isFinite(refVal) || !isFinite(webVal)) continue;

    points.push({ x: refVal, y: webVal, model: modelName, observable: obs });
  }

  matched++;
}

// ── Write output ───────────────────────────────────────────────────────────

const nUniqueObs = new Set(points.map(p => `${p.model}:${p.observable}`)).size;

const output = {
  xlabel: 'BNG2.pl observable value (final time point)',
  ylabel: 'Playground observable value (final time point)',
  description: 'One point per (model, observable) at the final time point. Models selected from layered parity check (pass + threshold_only with comparable GDAT).',
  nModels: matched,
  nObservables: nUniqueObs,
  nPoints: points.length,
  points,
};

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));

console.log(`Matched ${matched} models (skipped: ${noGdat} no gdat, ${noCsv} no csv, ${skipped} other)`);
console.log(`${points.length} points (1 per model×observable, final time point)`);
console.log(`Wrote ${OUT_FILE}`);
