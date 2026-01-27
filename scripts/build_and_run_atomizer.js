#!/usr/bin/env node
// Bundles the TS Atomizer with esbuild to a Node CJS module and runs a small runner
const { spawnSync } = require('child_process');
const path = require('path');

const sbmlPath = process.argv[2];
if (!sbmlPath) {
  console.error('Usage: node build_and_run_atomizer.js <sbml-file>');
  process.exit(2);
}

const outFile = path.resolve(__dirname, '../dist/atomizer.cjs');
const entryPoint = path.resolve(__dirname, '../src/lib/atomizer/index.ts');

console.log('Bundling Atomizer with esbuild...');
const esbuildArgs = [entryPoint, '--bundle', '--platform=node', '--target=node14', '--outfile=' + outFile, '--format=cjs', '--external:libsbml.js', '--external:libsbml.wasm'];
const esbuild = spawnSync('npx', ['-y', 'esbuild', ...esbuildArgs], { stdio: 'inherit' });
if (esbuild.status !== 0) process.exit(esbuild.status);

console.log('Running Atomizer on', sbmlPath);
const runner = spawnSync(process.execPath, [path.resolve(__dirname, 'atomize_with_dist_runner.js'), sbmlPath], { stdio: 'inherit' });
if (runner.status !== 0) process.exit(runner.status);

console.log('Done.');
