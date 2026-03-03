import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const constantsPath = path.join(root, 'constants.ts');
const webOutputDir = path.join(root, 'web_output');

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
  const match = txt.match(/BNG2_PARSE_AND_ODE_VERIFIED_MODELS\s*=\s*new\s+Set(?:<[^>]+>)?\s*\(\s*\[([\s\S]*?)\]\s*\)/m);
  if (!match) {
    die('Could not parse BNG2_PARSE_AND_ODE_VERIFIED_MODELS from constants.ts');
  }
  const body = match[1];
  const models = [...body.matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]).filter(Boolean);
  return [...new Set(models)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
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
const allModels = extractDeterministicModelList();
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
