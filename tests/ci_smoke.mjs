#!/usr/bin/env node
/**
 * ci_smoke.mjs — Tier-2 atomizer round-trip smoke test.
 *
 * Runs each vendored SBML fixture in tests/fixtures/sbml/ through the existing
 * tests/roundtrip_runner.mjs and compares the per-stage result against
 * tests/fixtures/baseline.json. Fails (exit 1) on any REGRESSION — a stage that was
 * `true` in the baseline and is now `false`. Improvements (false -> true) are reported,
 * not failed. Gating on regressions (not an absolute pass count) is deliberate: the
 * known-boundary models (genuine stiffness) stay `false` in the baseline and never turn
 * the check into noise.
 *
 * The runner writes result.stages.{parse,reparse,ratelaw_equiv,bng2_sim} and
 * result.bng2_sim_details.relaxedTolerance. Parity (BNG2 vs RoadRunner) is NOT produced
 * here — it is aggregated downstream and belongs to the nightly full-corpus job.
 *
 * Usage:
 *   node tests/ci_smoke.mjs            # compare vs baseline, exit 1 on regression
 *   node tests/ci_smoke.mjs --update   # regenerate baseline.json from current results
 *
 * Env:
 *   REPO_ROOT      repo root (default: parent of this file's dir)
 *   BNG2_CMD       path to BNG2.pl (else runner uses REPO_ROOT/BNG2.pl or `bionetgen`)
 *   BNGPATH        BioNetGen install dir (passed through to the runner)
 *   BNG2_RELAX     tolerance ladder, forwarded to the runner (default 1e-6:1e-6,1e-4:1e-4)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.REPO_ROOT || path.resolve(__dir, '..');
const FIXTURES = path.join(__dir, 'fixtures', 'sbml');
const BASELINE = path.join(__dir, 'fixtures', 'baseline.json');
const UPDATE = process.argv.includes('--update');
const TRACKED = ['parse', 'reparse', 'ratelaw_equiv', 'bng2_sim'];
const PER_MODEL_TIMEOUT_MS = 180_000;

function runModel(xmlPath) {
  const tmp = path.join(process.env.RUNNER_TEMP || '/tmp', `ci_${path.basename(xmlPath)}.json`);
  const res = spawnSync(
    'node',
    ['--import', 'tsx', path.join(__dir, 'roundtrip_runner.mjs'), xmlPath, tmp],
    {
      cwd: REPO,
      env: { ...process.env, REPO_ROOT: REPO, USE_BNG2_SIM: '1' },
      timeout: PER_MODEL_TIMEOUT_MS,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  let parsed = null;
  try { parsed = JSON.parse(fs.readFileSync(tmp, 'utf8')); } catch { /* runner wrote nothing usable */ }
  try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  if (!parsed) {
    return {
      parse: false, reparse: false, ratelaw_equiv: false, bng2_sim: false,
      relaxedTolerance: null,
      error: (res.error?.message || res.stderr || 'runner produced no result').slice(0, 240),
    };
  }
  const s = parsed.stages || {};
  return {
    parse: !!s.parse,
    reparse: !!s.reparse,
    ratelaw_equiv: !!s.ratelaw_equiv,
    bng2_sim: !!s.bng2_sim,
    relaxedTolerance: (parsed.bng2_sim_details && parsed.bng2_sim_details.relaxedTolerance) || null,
    error: parsed.error || null,
  };
}

function listFixtures() {
  if (!fs.existsSync(FIXTURES)) {
    console.error(`no fixtures dir: ${FIXTURES}`);
    process.exit(2);
  }
  const xmls = fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.xml')).sort();
  if (xmls.length === 0) {
    console.error(`no .xml fixtures in ${FIXTURES} — run tests/fixtures/fetch_fixtures.sh first`);
    process.exit(2);
  }
  return xmls;
}

const xmls = listFixtures();
console.log(`Running ${xmls.length} fixtures through roundtrip_runner.mjs ...\n`);
const observed = {};
for (const x of xmls) {
  const id = x.replace(/\.xml$/, '');
  process.stdout.write(`  ${id} ... `);
  const r = runModel(path.join(FIXTURES, x));
  observed[id] = r;
  console.log(
    TRACKED.map((k) => `${k}=${r[k] ? 'Y' : 'n'}`).join(' ') +
    (r.relaxedTolerance ? `  [relaxed ${r.relaxedTolerance}]` : '') +
    (!r.bng2_sim && r.error ? `  (${r.error})` : ''),
  );
}

if (UPDATE) {
  const out = {
    _meta: {
      generated: new Date().toISOString(),
      note: 'Regenerate with `node tests/ci_smoke.mjs --update` against a known-good build. '
          + 'CI gates on regressions of the tracked booleans only.',
      tracked: TRACKED,
    },
  };
  for (const id of Object.keys(observed).sort()) {
    const r = observed[id];
    out[id] = { parse: r.parse, reparse: r.reparse, ratelaw_equiv: r.ratelaw_equiv, bng2_sim: r.bng2_sim };
    if (r.relaxedTolerance) out[id].relaxedTolerance = true;
  }
  fs.writeFileSync(BASELINE, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nWrote baseline for ${Object.keys(observed).length} models -> ${path.relative(REPO, BASELINE)}`);
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  console.error(`\nno baseline: ${BASELINE} — generate once with:  node tests/ci_smoke.mjs --update`);
  process.exit(2);
}
const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const regressions = [];
const improvements = [];
const missing = [];
for (const id of Object.keys(observed)) {
  const base = baseline[id];
  if (!base) { missing.push(id); continue; }
  for (const k of TRACKED) {
    if (base[k] === true && observed[id][k] === false) regressions.push({ id, k });
    if (base[k] === false && observed[id][k] === true) improvements.push(`${id}.${k}`);
  }
}

console.log('');
if (improvements.length) console.log(`improvements (re-run --update to record): ${improvements.join(', ')}`);
if (missing.length) console.log(`no baseline entry (add via --update): ${missing.join(', ')}`);

if (regressions.length) {
  console.error(`\nREGRESSIONS (${regressions.length}):`);
  for (const { id, k } of regressions) {
    console.error(`  - ${id}.${k}  ${observed[id].error ? `(${observed[id].error})` : ''}`);
  }
  console.error('\nA stage that passed in the baseline now fails. Investigate the emitted BNGL for the listed models.');
  process.exit(1);
}
console.log(`\nOK — ${xmls.length} fixtures, no regressions.`);
process.exit(0);
