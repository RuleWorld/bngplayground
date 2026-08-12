#!/usr/bin/env node
/**
 * Compare two checkouts with randomized, process-isolated profile runs.
 *
 * Both directories must contain the evaluator and installed dependencies. Run
 * this after creating a baseline worktree and making the candidate change:
 *
 *   node scripts/compare_profile_runs.mjs \
 *     --baseline-dir /path/to/baseline --candidate-dir /path/to/candidate
 *
 * Node 22 and 26 are used by default through npx. Pass --node-current for a
 * quick local smoke run, or repeat --node-version to choose another matrix.
 * PROFILE_* variables are forwarded, except PROFILE_REPEATS (forced to 1 so
 * each raw sample comes from a fresh process).
 */

import { randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node scripts/compare_profile_runs.mjs --baseline-dir PATH --candidate-dir PATH [--rounds N] [--out PATH] [--node-current | --node-version MAJOR]');
  process.exit(2);
}

const args = process.argv.slice(2);
const options = { rounds: 5, out: resolve('artifacts/perf/profile-comparison'), nodeVersions: [] };
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--baseline-dir') options.baselineDir = resolve(args[++i] ?? '');
  else if (arg === '--candidate-dir') options.candidateDir = resolve(args[++i] ?? '');
  else if (arg === '--rounds') options.rounds = Number(args[++i]);
  else if (arg === '--out') options.out = resolve(args[++i] ?? '');
  else if (arg === '--node-version') options.nodeVersions.push(args[++i]);
  else if (arg === '--node-current') options.nodeCurrent = true;
  else usage(`Unknown argument: ${arg}`);
}

if (!options.baselineDir || !options.candidateDir) usage('Both checkout directories are required.');
if (!Number.isInteger(options.rounds) || options.rounds < 1) usage('--rounds must be a positive integer.');
for (const dir of [options.baselineDir, options.candidateDir]) {
  if (!existsSync(join(dir, 'vitest.profile.config.ts'))) usage(`Not a benchmark checkout: ${dir}`);
  if (!existsSync(join(dir, 'node_modules'))) usage(`Missing node_modules in ${dir}`);
}

const requestedVersions = options.nodeVersions.length > 0 ? options.nodeVersions : ['22', '26'];
const runtimes = options.nodeCurrent
  ? [{ name: process.version, command: process.execPath, prefix: [] }]
  : requestedVersions.map(version => ({
      name: `node-${version}`,
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      prefix: ['--yes', `--package=node@${version}`, 'node'],
    }));

for (const runtime of runtimes) {
  const probe = spawnSync(runtime.command, [...runtime.prefix, '--version'], { encoding: 'utf8' });
  if (probe.status !== 0) throw new Error(`Could not start ${runtime.name}: ${probe.stderr || probe.error || 'unknown error'}`);
  runtime.version = probe.stdout.trim();
}

mkdirSync(options.out, { recursive: true });
const rawDir = join(options.out, 'raw');
mkdirSync(rawDir, { recursive: true });

function runProfile(runtime, label, cwd, round, position) {
  const stem = `${runtime.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}-${String(round).padStart(2, '0')}-${position}-${label}`;
  const markdownPath = join(rawDir, `${stem}.md`);
  const runner = join(cwd, 'scripts', 'run_full_tests.mjs');
  console.log(`[compare-profile] ${runtime.name} round ${round}: ${position}=${label}`);
  const child = spawnSync(runtime.command, [...runtime.prefix, runner, '--config', 'vitest.profile.config.ts'], {
    cwd,
    env: {
      ...process.env,
      PROFILE_REPEATS: '1',
      PROFILE_OUT: markdownPath,
    },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (child.status !== 0) {
    process.stdout.write(child.stdout ?? '');
    process.stderr.write(child.stderr ?? '');
    throw new Error(`${label} profile failed under ${runtime.name} (exit ${child.status}, signal ${child.signal ?? 'none'})`);
  }
  const jsonPath = markdownPath.replace(/\.md$/, '.json');
  return JSON.parse(readFileSync(jsonPath, 'utf8'));
}

const runs = [];
for (const runtime of runtimes) {
  for (let round = 1; round <= options.rounds; round++) {
    const order = randomInt(2) === 0 ? ['baseline', 'candidate'] : ['candidate', 'baseline'];
    for (let position = 0; position < order.length; position++) {
      const label = order[position];
      const cwd = label === 'baseline' ? options.baselineDir : options.candidateDir;
      const rows = runProfile(runtime, label, cwd, round, position + 1);
      runs.push({ runtime: runtime.name, round, position: position + 1, label, rows });
    }
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function timingSummary(baseline, candidate) {
  const baselineMedian = median(baseline);
  const candidateMedian = median(candidate);
  return {
    baseline,
    candidate,
    baselineMedian,
    baselineMin: Math.min(...baseline),
    baselineMax: Math.max(...baseline),
    candidateMedian,
    candidateMin: Math.min(...candidate),
    candidateMax: Math.max(...candidate),
    ratio: candidateMedian / baselineMedian,
  };
}

const comparisons = [];
const guardFailures = [];
for (const runtime of runtimes) {
  const runtimeRuns = runs.filter(run => run.runtime === runtime.name);
  const modelNames = runtimeRuns[0]?.rows.map(row => row.model) ?? [];
  for (const model of modelNames) {
    const byLabel = Object.fromEntries(['baseline', 'candidate'].map(label => [
      label,
      runtimeRuns.filter(run => run.label === label).map(run => run.rows.find(row => row.model === model)),
    ]));
    const reference = byLabel.baseline[0];
    for (const row of [...byLabel.baseline, ...byLabel.candidate]) {
      if (!row || row.species !== reference.species || row.reactions !== reference.reactions) {
        guardFailures.push(`${runtime.name}/${model}: species or reaction count changed`);
      }
    }
    for (const metric of ['parseMs', 'genMs']) {
      const baseline = byLabel.baseline.map(row => row[metric]);
      const candidate = byLabel.candidate.map(row => row[metric]);
      comparisons.push({ runtime: runtime.name, model, metric, ...timingSummary(baseline, candidate) });
    }
    for (const caseName of Object.keys(reference.simStats ?? {})) {
      const baselineStats = byLabel.baseline.map(row => row.simStats[caseName]);
      const candidateStats = byLabel.candidate.map(row => row.simStats[caseName]);
      const baseline = baselineStats.flatMap(stat => stat.samplesMs);
      const candidate = candidateStats.flatMap(stat => stat.samplesMs);
      const hashes = new Set([...baselineStats, ...candidateStats].map(stat => stat.trajectoryHash));
      if (hashes.size !== 1) guardFailures.push(`${runtime.name}/${model}/${caseName}: trajectory hash changed`);
      comparisons.push({ runtime: runtime.name, model, metric: caseName, ...timingSummary(baseline, candidate), trajectoryHash: baselineStats[0].trajectoryHash });
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  baselineDir: options.baselineDir,
  candidateDir: options.candidateDir,
  rounds: options.rounds,
  runtimes: runtimes.map(({ name, version }) => ({ name, version })),
  runOrder: runs.map(({ runtime, round, position, label }) => ({ runtime, round, position, label })),
  guardFailures: [...new Set(guardFailures)],
  comparisons,
};
const reportPath = join(options.out, 'comparison.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log(`\n[compare-profile] wrote ${reportPath}`);
for (const row of comparisons) {
  console.log(`${row.runtime} | ${row.model} | ${row.metric} | baseline=${row.baselineMedian.toFixed(3)}ms candidate=${row.candidateMedian.toFixed(3)}ms ratio=${row.ratio.toFixed(3)}`);
}
if (report.guardFailures.length > 0) {
  console.error(`\n[compare-profile] correctness guards failed:\n- ${report.guardFailures.join('\n- ')}`);
  process.exit(1);
}

console.log(`[compare-profile] all species/reaction counts and trajectory hashes match (${basename(options.baselineDir)} vs ${basename(options.candidateDir)})`);
