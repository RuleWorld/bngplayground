/**
 * generate_bng2_references.ts
 *
 * Runs BNG2.pl on all models that are in the parity report as pass/threshold
 * but don't yet have reference .gdat files. Copies resulting .gdat/.cdat/.net
 * into tests/fixtures/.
 *
 * Usage:
 *   npx tsx scripts/generate_bng2_references.ts [--limit N] [--timeout MS]
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const BNG2_PATH = 'C:/Users/Achyudhan/anaconda3/envs/Research/Lib/site-packages/bionetgen/bng-win';
const BNG2_PL = path.join(BNG2_PATH, 'BNG2.pl');
const GDAT_DIR = path.resolve(process.env.BNG_OUTPUT_DIR || 'bng_test_output');
const NET_DIR = path.resolve(process.env.BNG_OUTPUT_DIR || 'bng_test_output');
const WORK_DIR = path.resolve('artifacts/bng2_workdir');

// Certain models are currently excluded from reference generation by path substring.
// This allows us to skip known-problematic families (e.g., Mallela models).
const EXCLUDED_MODEL_PATH_SUBSTRING = 'Mallela';

const args = process.argv.slice(2);
let limit = Infinity;
let timeoutMs = 120_000;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) { limit = parseInt(args[i + 1]); i++; }
  if (args[i] === '--timeout' && args[i + 1]) { timeoutMs = parseInt(args[i + 1]); i++; }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[-]/g, '_');
}

function findBnglFiles(): Map<string, string> {
  const map = new Map<string, string>();
  function walk(dir: string) {
    try {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (f.name.endsWith('.bngl')) {
          const key = normalizeKey(f.name.replace('.bngl', ''));
          // Prefer shorter paths (more likely to be the canonical source)
          if (!map.has(key) || p.length < map.get(key)!.length) {
            map.set(key, p);
          }
        }
      }
    } catch {}
  }
  const rulehubDir = path.resolve('artifacts/rulehub-export');
  if (fs.existsSync(rulehubDir)) walk(rulehubDir);
  return map;
}

// ── Main ───────────────────────────────────────────────────────────────────

// Use the manifest to find ALL bng2_compatible models, not just those in the parity report
const MANIFEST = path.resolve('artifacts/rulehub-export/manifest.json');
const manifest: Array<{ id: string; path: string; bng2_compatible?: boolean; compatibility?: { bng2?: boolean } }> = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const bng2Models = manifest.filter(m => (m.bng2_compatible || m.compatibility?.bng2) && !m.path?.includes(EXCLUDED_MODEL_PATH_SUBSTRING));

const existingGdat = new Set(
  fs.readdirSync(GDAT_DIR).filter(f => f.endsWith('.gdat')).map(f => normalizeKey(f.replace('.gdat', '')))
);

const needGdat = bng2Models.filter(m => !existingGdat.has(normalizeKey(m.id))).map(m => ({ model: m.id, path: m.path }));
const bnglFiles = findBnglFiles();

console.log(`bng2_compatible non-Mallela: ${bng2Models.length}`);
console.log(`Already have gdat: ${existingGdat.size}`);
console.log(`Need generation: ${needGdat.length}`);
console.log(`BNGL sources available: ${bnglFiles.size}`);
console.log(`Timeout per model: ${timeoutMs}ms`);
if (limit < Infinity) console.log(`Limit: ${limit}`);
console.log('');

fs.mkdirSync(WORK_DIR, { recursive: true });
fs.mkdirSync(GDAT_DIR, { recursive: true });
fs.mkdirSync(NET_DIR, { recursive: true });

let success = 0;
let failed = 0;
let skipped = 0;
let count = 0;

for (const entry of needGdat) {
  if (count >= limit) break;
  const modelName: string = entry.model;
  const key = normalizeKey(modelName);

  type EntryWithPath = { path: string };
  const hasPath = (e: unknown): e is EntryWithPath =>
    !!e && typeof (e as any).path === 'string';

  // Try manifest path first, then file walker fallback
  const manifestPath = hasPath(entry)
    ? path.resolve('artifacts/rulehub-export', entry.path)
    : null;
  const bnglPath = (manifestPath && fs.existsSync(manifestPath)) ? manifestPath : bnglFiles.get(key);
  if (!bnglPath || !fs.existsSync(bnglPath)) { skipped++; continue; }

  // Skip models with __FREE parameters (need externally-fitted values)
  const bnglText = fs.readFileSync(bnglPath, 'utf8');
  if (/__FREE\b/.test(bnglText)) { skipped++; continue; }
  // Skip models without an ODE simulate action
  const simCalls = bnglText.match(/simulate\s*\([^)]*\)/g) || [];
  const hasOde = simCalls.some(s => !s.includes('method=>"ssa"') && !s.includes('method=>"nf"') && !s.includes("method=>'ssa'") && !s.includes("method=>'nf'"));
  if (!hasOde) { skipped++; continue; }

  count++;
  // Run BNG2 from the BNGL's own directory so it can find includes/parameter files
  const bnglDir = path.dirname(bnglPath);
  const bnglName = path.basename(bnglPath);
  const baseName = bnglName.replace('.bngl', '');

  try {
    const cmd = `perl -I "${PERL2_DIR}" "${BNG2_PL}" "${bnglName}"`;
    execSync(cmd, {
      cwd: bnglDir,
      timeout: timeoutMs,
      stdio: 'pipe',
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, BNGPATH: BNG2_PATH },
    });

    // Find output files — BNG2 may produce suffixed files (e.g. model_ode.gdat)
    const files = fs.readdirSync(bnglDir);
    const gdatFiles = files.filter(f => f.endsWith('.gdat') && f.startsWith(baseName));
    const netFile = files.find(f => f === `${baseName}.net`);

    // Pick the first gdat (prefer unsuffixed, then suffixed)
    const gdatFile = gdatFiles.find(f => f === `${baseName}.gdat`) || gdatFiles[0];

    if (gdatFile) {
      fs.copyFileSync(path.join(bnglDir, gdatFile), path.join(GDAT_DIR, `${modelName}.gdat`));
    }
    if (netFile && !fs.existsSync(path.join(NET_DIR, `${modelName}.net`))) {
      fs.copyFileSync(path.join(bnglDir, netFile), path.join(NET_DIR, `${modelName}.net`));
    }

    // Cleanup BNG2 output files from the source directory
    for (const f of fs.readdirSync(bnglDir)) {
      if (f.startsWith(baseName) && (f.endsWith('.gdat') || f.endsWith('.cdat') || f.endsWith('.net') || f.endsWith('.xml') || f.endsWith('.log'))) {
        try { fs.unlinkSync(path.join(bnglDir, f)); } catch {}
      }
    }

    if (gdatFile) {
      success++;
      if (count % 20 === 0 || count <= 5) console.log(`  [${count}/${Math.min(needGdat.length, limit)}] ${modelName}: OK`);
    } else {
      failed++;
      if (count <= 20) console.log(`  [${count}] ${modelName}: no .gdat produced`);
    }
  } catch (e: any) {
    failed++;
    const stderr = (e.stderr?.toString() || '').trim();
    const reason = stderr.split('\n').find((l: string) => l.includes('ABORT') || l.includes('ERROR') || l.includes('error')) || stderr.split('\n')[0] || 'unknown';
    if (count <= 30 || count % 50 === 0) {
      console.log(`  [${count}] ${modelName}: FAILED — ${reason.slice(0, 100)}`);
    }
    // Cleanup any partial outputs
    for (const f of fs.readdirSync(bnglDir)) {
      if (f.startsWith(baseName) && (f.endsWith('.gdat') || f.endsWith('.cdat') || f.endsWith('.net') || f.endsWith('.xml') || f.endsWith('.log'))) {
        try { fs.unlinkSync(path.join(bnglDir, f)); } catch {}
      }
    }
  }
}

console.log(`\nDone: ${success} succeeded, ${failed} failed, ${skipped} no BNGL source`);
console.log(`Total gdat files now: ${fs.readdirSync(GDAT_DIR).filter(f => f.endsWith('.gdat')).length}`);