#!/usr/bin/env tsx
/**
 * scripts/benchmarks/webgpu_benchmark.ts
 *
 * Time a fixed model suite on three backends — WebGPU, WASM CVODE, and the
 * TypeScript RK45 fallback — at varying trajectory counts. Emits CSV + JSON
 * + a paper-ready LaTeX table.
 *
 * Invoked from a Playwright-driven headful Chrome/Edge session (Node has no
 * WebGPU). The orchestration script is scripts/benchmarks/webgpu_browser_matrix.mjs.
 *
 * Timing methodology: N_REPS=5 per (model × nTraj × backend), reporting the
 * median. Warmup run per backend is excluded. Trajectories are independent
 * seeded Monte-Carlo runs for SSA; for ODE, nTraj=N means N parameter-perturbed
 * replicates that exercise WebGPU's batch-ODE code path.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  parseBNGLWithANTLR,
  generateExpandedNetwork,
  loadEvaluator,
  CVODESolver,
  RK45Solver,
} from '../../packages/engine/src/index.ts';
import {
  WebGPUODESolver,
  isWebGPUODESolverAvailable,
} from '../../src/services/WebGPUODESolver.ts';

const WASMCVODESolver = CVODESolver as unknown as new (...args: any[]) => any;
const TSRK45Solver = RK45Solver as unknown as new (...args: any[]) => any;
const WebGPUODESolverCtor = WebGPUODESolver as unknown as new (...args: any[]) => any;

async function detectWebGPU(): Promise<{ supported: boolean; reason?: string; adapter?: string }> {
  const supported = await isWebGPUODESolverAvailable();
  return { supported, reason: supported ? undefined : 'WebGPU solver unavailable', adapter: supported ? 'available' : undefined };
}

// ── Config ────────────────────────────────────────────────────────────────

interface SuiteEntry {
  file: string;
  nTraj: number[];
}

const SUITE: SuiteEntry[] = [
  { file: 'benchmarks/suite/01_simple_enzyme.bngl', nTraj: [1, 16, 64] },
  { file: 'benchmarks/suite/03_toy_jakstat_skeleton.bngl', nTraj: [1, 16, 64, 256] },
  { file: 'benchmarks/suite/04_mapk_cascade_3tier.bngl', nTraj: [1, 16, 64] },
  { file: 'benchmarks/suite/05_fceri_gamma2.bngl', nTraj: [1, 4, 16] },
  { file: 'benchmarks/suite/07_egfr_pathway.bngl', nTraj: [1, 16] },
];

const N_REPS = 5;
const T_END = 100;
const N_STEPS = 1000;
const RTOL = 1e-8;
const ATOL = 1e-10;

// ── Types ─────────────────────────────────────────────────────────────────

interface BenchmarkRow {
  model: string;
  nSpecies: number;
  nReactions: number;
  nTrajectories: number;
  tEnd: number;
  nSteps: number;
  webgpuMs: number | null;
  wasmMs: number | null;
  tsMs: number | null;
  ratioWebgpuWasm: number | null;
  ratioWasmTs: number | null;
  maxRelErr: number | null;
  note: string;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  await loadEvaluator();
  const verdict = await detectWebGPU();
  if (!verdict.supported) {
    console.warn(`[warn] WebGPU unavailable: ${verdict.reason ?? 'unknown reason'}`);
    console.warn(`[warn] WebGPU columns will be null; WASM + TS still benchmarked.`);
  }

  const results: BenchmarkRow[] = [];
  for (const { file, nTraj } of SUITE) {
    if (!existsSync(file)) {
      console.warn(`[skip] ${file} does not exist`);
      continue;
    }
    const bngl = readFileSync(file, 'utf8');
    for (const n of nTraj) {
      try {
        const row = await benchmarkOne(bngl, file, n, verdict.supported);
        results.push(row);
        console.log(summarizeRow(row));
      } catch (e) {
        console.error(`[error] ${file} nTraj=${n}: ${String(e).split('\n')[0]}`);
      }
    }
  }

  mkdirSync('artifacts/paper', { recursive: true });
  writeFileSync('artifacts/paper/webgpu_benchmark.csv', toCSV(results));
  writeFileSync('artifacts/paper/webgpu_benchmark.json', JSON.stringify(results, null, 2));
  writeFileSync('artifacts/paper/webgpu_benchmark.tex', toLatex(results, verdict));
  console.log(`\nwrote ${results.length} rows to artifacts/paper/webgpu_benchmark.{csv,json,tex}`);
}

// ── Core: benchmark one (model × nTraj) triple ────────────────────────────

async function benchmarkOne(
  bngl: string,
  name: string,
  nTraj: number,
  webgpuAvailable: boolean,
): Promise<BenchmarkRow> {
  const modelName = basename(name, '.bngl');

  const parsed = parseBNGLWithANTLR(bngl);
  if (!parsed.success || !parsed.model) {
    throw new Error(`parse failed: ${parsed.errors?.[0]?.message ?? 'unknown'}`);
  }
  const expanded = await generateExpandedNetwork(parsed.model, () => {}, () => {});
  const nSpecies = expanded.species.length;
  const nReactions = expanded.reactions?.length ?? 0;

  const simOptions = {
    method: 'ode' as const,
    t_end: T_END,
    n_steps: N_STEPS,
    rtol: RTOL,
    atol: ATOL,
  };

  // ── WASM reference (always run; used for correctness ground truth) ─────
  const wasmSolver = new WASMCVODESolver();
  const wasmWarmup = await wasmSolver.simulateBatch(expanded, simOptions, nTraj);
  void wasmWarmup;
  const wasmSamples: number[] = [];
  let wasmReference: BatchSimResult | null = null;
  for (let i = 0; i < N_REPS; i++) {
    const t = performance.now();
    wasmReference = await wasmSolver.simulateBatch(expanded, simOptions, nTraj);
    wasmSamples.push(performance.now() - t);
  }
  const wasmMs = median(wasmSamples);

  // ── WebGPU ─────────────────────────────────────────────────────────────
  let webgpuMs: number | null = null;
  let maxRelErr: number | null = null;
  let webgpuNote = '';

  if (webgpuAvailable) {
    try {
      const webgpuSolver = new WebGPUODESolverCtor();
      await webgpuSolver.simulateBatch(expanded, simOptions, nTraj);  // warmup
      const samples: number[] = [];
      let webgpuResult: BatchSimResult | null = null;
      for (let i = 0; i < N_REPS; i++) {
        const t = performance.now();
        webgpuResult = await webgpuSolver.simulateBatch(expanded, simOptions, nTraj);
        samples.push(performance.now() - t);
      }
      webgpuMs = median(samples);
      if (webgpuResult && wasmReference) {
        maxRelErr = maxRelativeError(wasmReference, webgpuResult);
      }
    } catch (e) {
      webgpuNote = `webgpu_error:${String(e).split('\n')[0].slice(0, 80)}`;
    }
  } else {
    webgpuNote = 'webgpu_unavailable';
  }

  // ── TS fallback ────────────────────────────────────────────────────────
  // Skip TS for large models — it's the educational fallback, not the target.
  let tsMs: number | null = null;
  let tsNote = '';
  if (nSpecies <= 100 && nTraj <= 16) {
    try {
      const tsSolver = new TSRK45Solver();
      await tsSolver.simulateBatch(expanded, simOptions, nTraj);  // warmup
      const samples: number[] = [];
      for (let i = 0; i < N_REPS; i++) {
        const t = performance.now();
        await tsSolver.simulateBatch(expanded, simOptions, nTraj);
        samples.push(performance.now() - t);
      }
      tsMs = median(samples);
    } catch (e) {
      tsNote = `ts_error:${String(e).split('\n')[0].slice(0, 80)}`;
    }
  } else {
    tsNote = 'ts_skipped_too_large';
  }

  return {
    model: modelName,
    nSpecies,
    nReactions,
    nTrajectories: nTraj,
    tEnd: T_END,
    nSteps: N_STEPS,
    webgpuMs,
    wasmMs,
    tsMs,
    ratioWebgpuWasm: webgpuMs !== null && wasmMs > 0 ? webgpuMs / wasmMs : null,
    ratioWasmTs: tsMs !== null && wasmMs > 0 ? tsMs / wasmMs : null,
    maxRelErr,
    note: [webgpuNote, tsNote].filter(Boolean).join('; '),
  };
}

// ── Correctness metric ─────────────────────────────────────────────────────

interface BatchSimResult {
  observables: Record<string, number[][]>;   // obs → [trajectory][timepoint]
  time: number[];
}

function maxRelativeError(ref: BatchSimResult, candidate: BatchSimResult): number {
  let maxErr = 0;
  const EPS = 1e-12;
  for (const [obsName, refTraj] of Object.entries(ref.observables)) {
    const candTraj = candidate.observables[obsName];
    if (!candTraj) continue;
    const nT = Math.min(refTraj.length, candTraj.length);
    for (let i = 0; i < nT; i++) {
      const refVec = refTraj[i];
      const candVec = candTraj[i];
      if (!refVec || !candVec) continue;
      const nP = Math.min(refVec.length, candVec.length);
      for (let j = 0; j < nP; j++) {
        const denom = Math.max(Math.abs(refVec[j]), EPS);
        const err = Math.abs(refVec[j] - candVec[j]) / denom;
        if (err > maxErr) maxErr = err;
      }
    }
  }
  return maxErr;
}

// ── Output ────────────────────────────────────────────────────────────────

function toCSV(rows: BenchmarkRow[]): string {
  const header = [
    'model', 'nSpecies', 'nReactions', 'nTrajectories',
    'tEnd', 'nSteps', 'webgpuMs', 'wasmMs', 'tsMs',
    'ratioWebgpuWasm', 'ratioWasmTs', 'maxRelErr', 'note',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      csvEscape(r.model), r.nSpecies, r.nReactions, r.nTrajectories,
      r.tEnd, r.nSteps,
      r.webgpuMs !== null ? r.webgpuMs.toFixed(2) : '',
      r.wasmMs !== null ? r.wasmMs.toFixed(2) : '',
      r.tsMs !== null ? r.tsMs.toFixed(2) : '',
      r.ratioWebgpuWasm !== null ? r.ratioWebgpuWasm.toFixed(3) : '',
      r.ratioWasmTs !== null ? r.ratioWasmTs.toFixed(3) : '',
      r.maxRelErr !== null ? r.maxRelErr.toExponential(3) : '',
      csvEscape(r.note),
    ].join(','));
  }
  return lines.join('\n') + '\n';
}

function csvEscape(s: string): string {
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toLatex(rows: BenchmarkRow[], verdict: { supported: boolean; adapter?: string }): string {
  const adapterNote = verdict.supported
    ? `WebGPU adapter: ${(verdict.adapter ?? 'default').replace(/_/g, '\\_')}.`
    : 'WebGPU was unavailable in this run.';

  // Aggregate: group by model, display one row per (model × nTraj).
  const body = rows.map((r) => {
    const cells = [
      escapeTex(r.model),
      String(r.nSpecies),
      String(r.nReactions),
      String(r.nTrajectories),
      r.webgpuMs !== null ? r.webgpuMs.toFixed(1) : '---',
      r.wasmMs !== null ? r.wasmMs.toFixed(1) : '---',
      r.tsMs !== null ? r.tsMs.toFixed(1) : '---',
      r.ratioWebgpuWasm !== null ? `${r.ratioWebgpuWasm.toFixed(2)}$\\times$` : '---',
      r.maxRelErr !== null ? r.maxRelErr.toExponential(1) : '---',
    ];
    return cells.join(' & ') + ' \\\\';
  }).join('\n');

  return `% Auto-generated by scripts/benchmarks/webgpu_benchmark.ts
\\begin{table}[h]
\\centering
\\caption{WebGPU vs WebAssembly (CVODE) vs TypeScript (RK45) ODE simulation timings across a trajectory-count sweep. Each row is the median of ${N_REPS} runs at $t\\_end=${T_END}$, $n\\_steps=${N_STEPS}$, $r_{tol}=10^{-8}$, $a_{tol}=10^{-10}$. Max rel. err.\\ compares WebGPU output to WebAssembly CVODE as the reference; values below $10^{-4}$ indicate the WebGPU path is correctness-equivalent. TS fallback is only run for $n\\_species \\leq 100$ and $n\\_trajectories \\leq 16$; larger cases marked '---'. ${adapterNote}}
\\label{tab:webgpu-benchmark}
\\resizebox{\\textwidth}{!}{%
\\begin{tabular}{lrrrrrrrr}
\\toprule
Model & Species & Rxns & $n_{traj}$ & WebGPU (ms) & WASM (ms) & TS (ms) & WebGPU/WASM & Max rel.\\ err. \\\\
\\midrule
${body}
\\bottomrule
\\end{tabular}%
}
\\end{table}
`;
}

function escapeTex(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/#/g, '\\#');
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function summarizeRow(r: BenchmarkRow): string {
  const webgpu = r.webgpuMs !== null ? `${r.webgpuMs.toFixed(1)}ms` : 'n/a';
  const wasm = r.wasmMs !== null ? `${r.wasmMs.toFixed(1)}ms` : 'n/a';
  const err = r.maxRelErr !== null ? `err=${r.maxRelErr.toExponential(1)}` : '';
  return `  ${r.model.padEnd(30)} nTraj=${String(r.nTrajectories).padEnd(4)} webgpu=${webgpu.padEnd(10)} wasm=${wasm.padEnd(10)} ${err}`;
}

main().catch((e) => { console.error(e); process.exit(1); });
