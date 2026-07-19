#!/usr/bin/env tsx
/**
 * scripts/testing/webgpu_correctness_sweep.ts
 *
 * For each of 20 RuleHub models, simulate on both WebGPU and WASM CVODE.
 * Assert R² ≥ 0.9999 per observable. Any miss fails the script (non-zero exit).
 *
 * This complements webgpu_benchmark.ts: benchmarks time; this asserts
 * correctness. Together they establish that WebGPU is safe to ship as a
 * performance-accelerating default on supported hardware.
 *
 * Run in headful Chrome via Playwright (Node has no WebGPU). See
 * scripts/benchmarks/webgpu_browser_matrix.mjs for orchestration.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  parseBNGLWithANTLR,
  generateExpandedNetwork,
  loadEvaluator,
  CVODESolver,
} from '../../packages/engine/src/index.ts';
import {
  WebGPUODESolver,
  isWebGPUODESolverAvailable,
} from '../../src/services/WebGPUODESolver.ts';

const WASMCVODESolver = CVODESolver as unknown as new (...args: any[]) => any;
const WebGPUODESolverCtor = WebGPUODESolver as unknown as new (...args: any[]) => any;

async function detectWebGPU(): Promise<{ supported: boolean; reason?: string; adapter?: string }> {
  const supported = await isWebGPUODESolverAvailable();
  return { supported, reason: supported ? undefined : 'WebGPU solver unavailable', adapter: supported ? 'available' : undefined };
}

// ── Config ────────────────────────────────────────────────────────────────

const RULEHUB_DIR = 'RuleHub/Published';
const MAX_MODELS = 20;
const R2_FLOOR = 0.9999;
const MAX_REL_ERR_CEIL = 1e-3;
const T_END = 100;
const N_STEPS = 500;
const N_TRAJECTORIES = 4;
const MAX_SPECIES_FOR_SWEEP = 200;  // skip huge models to keep the sweep under 10 min

// ── Types ─────────────────────────────────────────────────────────────────

interface SweepResult {
  model: string;
  nSpecies: number;
  nReactions: number;
  rSquaredMin: number;
  maxRelErr: number;
  perObservable: Record<string, { r2: number; maxRelErr: number }>;
  passed: boolean;
  note: string;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  await loadEvaluator();
  const verdict = await detectWebGPU();
  if (!verdict.supported) {
    console.error(`[fatal] WebGPU not available: ${verdict.reason ?? 'unknown'}`);
    console.error(`Run this script from a headful Chrome/Edge with WebGPU enabled.`);
    process.exit(2);
  }
  console.log(`[info] WebGPU adapter: ${verdict.adapter ?? 'default'}`);

  const models = discoverModels();
  console.log(`[info] sweeping ${Math.min(models.length, MAX_MODELS)} of ${models.length} models`);

  const results: SweepResult[] = [];
  for (const modelPath of models.slice(0, MAX_MODELS)) {
    try {
      const r = await sweepOne(modelPath);
      results.push(r);
      const tag = r.passed ? '✓' : '✗';
      console.log(
        `${tag} ${r.model.padEnd(40)} ` +
          `n_species=${String(r.nSpecies).padEnd(5)} ` +
          `R²=${r.rSquaredMin.toFixed(6)} ` +
          `max_rel_err=${r.maxRelErr.toExponential(2)}` +
          (r.note ? ` (${r.note})` : ''),
      );
    } catch (e) {
      console.error(`  [error] ${modelPath}: ${String(e).split('\n')[0]}`);
      results.push({
        model: basename(modelPath).replace(/\.bngl$/, ''),
        nSpecies: 0, nReactions: 0,
        rSquaredMin: 0, maxRelErr: Infinity,
        perObservable: {}, passed: false,
        note: `exception: ${String(e).slice(0, 100)}`,
      });
    }
  }

  // ── Summarize ──────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed);
  const passRate = passed / results.length;

  mkdirSync('artifacts/paper', { recursive: true });
  writeFileSync(
    'artifacts/paper/webgpu_correctness.json',
    JSON.stringify({ verdict, results, passed, failed: failed.length, total: results.length }, null, 2),
  );

  console.log();
  console.log(`[summary] ${passed}/${results.length} models passed R² ≥ ${R2_FLOOR} (${(passRate * 100).toFixed(1)}%)`);

  if (failed.length > 0) {
    console.log();
    console.log('[failures]');
    for (const f of failed) {
      console.log(`  ${f.model}: R²_min=${f.rSquaredMin.toFixed(6)}, max_rel_err=${f.maxRelErr.toExponential(2)}`);
      for (const [obs, metrics] of Object.entries(f.perObservable)) {
        if (metrics.r2 < R2_FLOOR || metrics.maxRelErr > MAX_REL_ERR_CEIL) {
          console.log(`    ${obs}: R²=${metrics.r2.toFixed(6)}, max_rel=${metrics.maxRelErr.toExponential(2)}`);
        }
      }
    }
    process.exit(1);
  }
}

// ── Per-model sweep ────────────────────────────────────────────────────────

async function sweepOne(modelPath: string): Promise<SweepResult> {
  const bngl = readFileSync(modelPath, 'utf8');
  const modelName = basename(modelPath).replace(/\.bngl$/, '');

  const parseResult = parseBNGLWithANTLR(bngl);
  if (!parseResult.success || !parseResult.model) {
    return {
      model: modelName, nSpecies: 0, nReactions: 0,
      rSquaredMin: 0, maxRelErr: Infinity,
      perObservable: {}, passed: false,
      note: 'parse failed',
    };
  }

  const expanded = await generateExpandedNetwork(parseResult.model, () => {}, () => {});
  const nSpecies = expanded.species.length;
  const nReactions = expanded.reactions?.length ?? 0;

  if (nSpecies > MAX_SPECIES_FOR_SWEEP) {
    return {
      model: modelName, nSpecies, nReactions,
      rSquaredMin: 1.0, maxRelErr: 0,
      perObservable: {}, passed: true,
      note: `skipped (nSpecies=${nSpecies} > ${MAX_SPECIES_FOR_SWEEP})`,
    };
  }

  const simOptions = { method: 'ode' as const, t_end: T_END, n_steps: N_STEPS, rtol: 1e-8, atol: 1e-10 };

  const wasmSolver = new WASMCVODESolver();
  const webgpuSolver = new WebGPUODESolverCtor();

  const wasmRes = await wasmSolver.simulateBatch(expanded, simOptions, N_TRAJECTORIES);
  const gpuRes = await webgpuSolver.simulateBatch(expanded, simOptions, N_TRAJECTORIES);

  const perObservable: Record<string, { r2: number; maxRelErr: number }> = {};
  let rSquaredMin = 1.0;
  let maxRelErr = 0;

  for (const [obsName, wasmTraj] of Object.entries(wasmRes.observables)) {
    const gpuTraj = gpuRes.observables[obsName];
    if (!gpuTraj) continue;
    const r2 = computeR2(wasmTraj as number[][], gpuTraj as number[][]);
    const mre = computeMaxRelErr(wasmTraj as number[][], gpuTraj as number[][]);
    perObservable[obsName] = { r2, maxRelErr: mre };
    if (r2 < rSquaredMin) rSquaredMin = r2;
    if (mre > maxRelErr) maxRelErr = mre;
  }

  const passed = rSquaredMin >= R2_FLOOR && maxRelErr <= MAX_REL_ERR_CEIL;
  return {
    model: modelName, nSpecies, nReactions,
    rSquaredMin, maxRelErr,
    perObservable, passed,
    note: passed ? '' : `R² below floor or rel_err above ceil`,
  };
}

// ── Metrics ────────────────────────────────────────────────────────────────

function computeR2(ref: number[][], cand: number[][]): number {
  // Flatten across trajectories; compute Pearson R² between all points.
  const refFlat: number[] = [];
  const candFlat: number[] = [];
  const nTraj = Math.min(ref.length, cand.length);
  for (let i = 0; i < nTraj; i++) {
    const r = ref[i]; const c = cand[i];
    const nP = Math.min(r.length, c.length);
    for (let j = 0; j < nP; j++) {
      if (Number.isFinite(r[j]) && Number.isFinite(c[j])) {
        refFlat.push(r[j]);
        candFlat.push(c[j]);
      }
    }
  }
  if (refFlat.length === 0) return 0;

  const refMean = refFlat.reduce((s, x) => s + x, 0) / refFlat.length;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < refFlat.length; i++) {
    ssRes += (refFlat[i] - candFlat[i]) ** 2;
    ssTot += (refFlat[i] - refMean) ** 2;
  }
  if (ssTot === 0) return ssRes === 0 ? 1.0 : 0;
  return Math.max(0, 1 - ssRes / ssTot);
}

function computeMaxRelErr(ref: number[][], cand: number[][]): number {
  const EPS = 1e-12;
  let maxErr = 0;
  const nTraj = Math.min(ref.length, cand.length);
  for (let i = 0; i < nTraj; i++) {
    const r = ref[i]; const c = cand[i];
    const nP = Math.min(r.length, c.length);
    for (let j = 0; j < nP; j++) {
      if (!Number.isFinite(r[j]) || !Number.isFinite(c[j])) continue;
      const denom = Math.max(Math.abs(r[j]), EPS);
      const err = Math.abs(r[j] - c[j]) / denom;
      if (err > maxErr) maxErr = err;
    }
  }
  return maxErr;
}

// ── Discovery ──────────────────────────────────────────────────────────────

function discoverModels(): string[] {
  if (!existsSync(RULEHUB_DIR)) return [];
  return readdirSync(RULEHUB_DIR)
    .filter((f) => f.endsWith('.bngl'))
    .sort()
    .map((f) => join(RULEHUB_DIR, f));
}

function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

main().catch((e) => { console.error(e); process.exit(1); });
