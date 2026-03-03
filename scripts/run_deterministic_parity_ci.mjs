import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const constantsPath = path.join(root, 'constants.ts');
const webOutputDir = path.join(root, 'web_output');
const publicModelsDir = path.join(root, 'public', 'models');

function die(message, code = 2) {
  console.error(`[det-parity] ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    shard: 1,
    shards: 1,
    outPath: 'artifacts/parity_layer_report.deterministic.json',
    timeoutMs: 180000,
    limit: undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--shard') out.shard = Number.parseInt(argv[++i] ?? '1', 10);
    else if (a === '--shards') out.shards = Number.parseInt(argv[++i] ?? '1', 10);
    else if (a === '--out') out.outPath = argv[++i] ?? out.outPath;
    else if (a === '--timeoutMs') out.timeoutMs = Number.parseInt(argv[++i] ?? '180000', 10);
    else if (a === '--limit') out.limit = Number.parseInt(argv[++i] ?? '0', 10);
  }

  if (!Number.isFinite(out.shard) || !Number.isFinite(out.shards) || out.shard < 1 || out.shards < 1 || out.shard > out.shards) {
    die(`Invalid shard settings: shard=${out.shard}, shards=${out.shards}`);
  }
  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs < 1000) {
    die(`Invalid timeoutMs: ${out.timeoutMs}`);
  }
  if (out.limit !== undefined && (!Number.isFinite(out.limit) || out.limit < 1)) {
    die(`Invalid limit: ${out.limit}`);
  }

  return out;
}

function toSafeFileStem(modelName) {
  return modelName.replace(/[^a-zA-Z0-9]/g, '_');
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function extractDeterministicModelList() {
  if (!fs.existsSync(constantsPath)) {
    die(`constants.ts not found at ${constantsPath}`);
  }
  const txt = fs.readFileSync(constantsPath, 'utf8');
  const match = txt.match(/BNG2_COMPATIBLE_MODELS\s*=\s*new\s+Set(?:<[^>]+>)?\s*\(\s*\[([\s\S]*?)\]\s*\)/m);
  if (!match) {
    die('Could not parse BNG2_COMPATIBLE_MODELS from constants.ts');
  }
  const body = match[1];
  const models = [...body.matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]).filter(Boolean);
  return [...new Set(models)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function normalizeKey(raw) {
  return path.basename(raw)
    .toLowerCase()
    .replace(/\.(bngl|cdat|gdat|net|csv)$/i, '')
    .replace(/^results_/, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function findBnglPath(modelName) {
  const key = normalizeKey(modelName);
  if (!fs.existsSync(publicModelsDir)) return null;
  const files = fs.readdirSync(publicModelsDir).filter((f) => f.toLowerCase().endsWith('.bngl'));
  const exact = files.find((f) => normalizeKey(f) === key);
  if (exact) return path.join(publicModelsDir, exact);
  return null;
}

function stripLineComments(text) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const idx = line.indexOf('#');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');
}

function hasActiveSimulate(text) {
  return /\bsimulate(?:_ode|_ssa|_nf)?\s*\(/i.test(stripLineComments(text));
}

function detectSimMethodFromBnglText(text) {
  const lower = stripLineComments(text).toLowerCase();
  const compact = lower.replace(/\s+/g, '');
  const hasSSA =
    /simulate_ssa\s*\(/.test(lower) ||
    compact.includes('method=>"ssa"') ||
    compact.includes("method=>'ssa'");
  const hasNF =
    /simulate_nf\s*\(|nfsim\s*\(/.test(lower) ||
    compact.includes('method=>"nf"') ||
    compact.includes("method=>'nf'") ||
    compact.includes('method=>"nfsim"') ||
    compact.includes("method=>'nfsim'");
  const hasODE =
    /simulate_ode\s*\(/.test(lower) ||
    compact.includes('method=>"ode"') ||
    compact.includes("method=>'ode'");

  if (hasSSA) return 'ssa';
  if (hasNF) return 'nfsim';
  if (hasODE) return 'ode';
  return 'unspecified';
}

function filterOdeLikeModels(models) {
  const kept = [];
  const skipped = [];

  for (const model of models) {
    const bnglPath = findBnglPath(model);
    if (!bnglPath || !fs.existsSync(bnglPath)) {
      skipped.push({ model, method: 'missing_in_public_models' });
      continue;
    }
    const text = fs.readFileSync(bnglPath, 'utf8');
    if (!hasActiveSimulate(text)) {
      skipped.push({ model, method: 'no_simulate' });
      continue;
    }
    const method = detectSimMethodFromBnglText(text);
    if (method === 'ssa' || method === 'nfsim') {
      skipped.push({ model, method });
      continue;
    }
    kept.push(model);
  }

  return { kept, skipped };
}

function pickShard(models, shard, shards) {
  return models.filter((_, idx) => (idx % shards) === (shard - 1));
}

function cleanOutputs(models) {
  for (const model of models) {
    const stem = toSafeFileStem(model);
    removeIfExists(path.join(webOutputDir, `${stem}.net`));
    removeIfExists(path.join(webOutputDir, `${stem}.cdat`));
    removeIfExists(path.join(webOutputDir, `results_${stem.toLowerCase()}.csv`));
  }
}

function runLayeredParity(models, outPath, timeoutMs) {
  const args = ['-y', 'tsx', 'scripts/layered_parity_check.ts', ...models, '--out', outPath, '--timeoutMs', String(timeoutMs)];
  console.log(`[det-parity] Running: npx ${args.join(' ')}`);
  const result = spawnSync('npx', args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  return typeof result.status === 'number' ? result.status : 1;
}

const opts = parseArgs(process.argv.slice(2));
const baseModels = extractDeterministicModelList();
const { kept: allModels, skipped } = filterOdeLikeModels(baseModels);
if (skipped.length > 0) {
  const sample = skipped.slice(0, 8).map((s) => `${s.model}(${s.method})`).join(', ');
  console.log(`[det-parity] Skipped models: ${skipped.length}${sample ? ` [${sample}${skipped.length > 8 ? ', ...' : ''}]` : ''}`);
}
let models = pickShard(allModels, opts.shard, opts.shards);
if (opts.limit !== undefined) {
  models = models.slice(0, opts.limit);
}

if (models.length === 0) {
  die(`No models selected for shard ${opts.shard}/${opts.shards}`, 1);
}

console.log(`[det-parity] Deterministic models total=${allModels.length}, shard ${opts.shard}/${opts.shards} selected=${models.length}`);
cleanOutputs(models);
process.exit(runLayeredParity(models, opts.outPath, opts.timeoutMs));
