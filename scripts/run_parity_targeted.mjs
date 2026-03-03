import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const webOutputDir = path.join(root, 'web_output');

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : 'artifacts/parity_layer_report.targeted.json';
const modelArgs = outIdx >= 0 ? args.slice(0, outIdx) : args;

if (modelArgs.length === 0) {
  console.error('[parity-targeted] Provide one or more model names.');
  process.exit(2);
}

function toSafeFileStem(modelName) {
  return modelName.replace(/[^a-zA-Z0-9]/g, '_');
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function runStep(label, cmd, stepArgs) {
  console.log(`[parity-targeted] ${label}`);
  const result = spawnSync(cmd, stepArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  return typeof result.status === 'number' ? result.status : 1;
}

console.log('[parity-targeted] Cleaning stale NET files for targeted models...');
for (const model of modelArgs) {
  const stem = toSafeFileStem(model);
  removeIfExists(path.join(webOutputDir, `${stem}.net`));
  removeIfExists(path.join(webOutputDir, `${stem}.cdat`));
  removeIfExists(path.join(webOutputDir, `results_${stem.toLowerCase()}.csv`));
}

const parityExit = runStep(
  `Running layered parity for: ${modelArgs.join(', ')}`,
  'npx',
  ['-y', 'tsx', 'scripts/layered_parity_check.ts', ...modelArgs, '--out', outPath, '--no-generate-web-cdat']
);

process.exit(parityExit);
