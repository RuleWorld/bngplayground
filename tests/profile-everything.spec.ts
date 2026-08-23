/**
 * profile-everything.spec.ts
 * -----------------------------------------------------------------------------
 * A benchmark harness (not a pass/fail test) that times every phase of the
 * pipeline and breaks down where the time actually goes, so you can see the
 * real bottlenecks instead of guessing.
 *
 * WHERE TO PUT IT:   tests/profile-everything.spec.ts   (root `tests/` dir)
 *
 * HOW TO RUN:
 *   npx vitest run tests/profile-everything.spec.ts --reporter=verbose
 *   (if the process hangs on exit because of the Emscripten noExitRuntime
 *    behaviour, run it through your scripts/run_full_tests.mjs idle-detector
 *    wrapper instead.)
 *
 * WHAT IT MEASURES, per model:
 *   - parse time
 *   - network generation wall time, PLUS the engine's internal PROFILE_DATA
 *     breakdown: canonicalize / findAllMaps / applyTransformation /
 *     isDuplicateReaction / degeneracy / speciesDedup / matchComponents
 *     (each as ms, % of gen wall, call count, and µs per call)
 *   - ODE (CVODE) simulation wall time   (skipped if public/cvode.wasm missing)
 *   - SSA simulation wall time
 *   - species / reaction counts, plus µs-per-species and µs-per-reaction
 *   - heap-used delta across one generation
 *
 * It runs each phase several times (PROFILE_REPEATS, default 3) after a discarded
 * warm-up, and reports the MEDIAN to cut JIT/GC noise. The generation breakdown
 * is captured from the final timed run.
 *
 * CONFIG (env vars):
 *   PROFILE_REPEATS        repeats per phase (default 3)
 *   PROFILE_MODELS_DIR     dir of .bngl files to profile IN ADDITION to the
 *                          built-ins — POINT THIS AT YOUR REAL CASE-STUDY MODELS,
 *                          that is what actually tells you what's slow.
 *   PROFILE_ONLY_EXTERNAL  "1" to skip the built-in models entirely
 *   PROFILE_MULTISITE      comma list of site counts for the combinatorial
 *                          stressor (default "5,7" -> 2^5 and 2^7 species)
 *   PROFILE_SIM            comma list of sim methods (default "ode,ssa"; add "nf")
 *   PROFILE_TEND           non-SSA sim end time (default 10)
 *   PROFILE_SSA_TENDS      comma list of SSA end times (default "1,100"). The
 *                          first case captures startup; the last represents the
 *                          production default and remains available as simMs.ssa
 *                          for compatibility with existing report consumers.
 *   PROFILE_NSTEPS         sim output steps (default 100)
 *   PROFILE_OUT            report path (default "profile-report.md" in cwd;
 *                          a matching .json is written alongside)
 * -----------------------------------------------------------------------------
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';
import { beforeAll, describe, it } from 'vitest';

// Public API — resolves through the @bngplayground/engine alias (packages/engine/src).
import {
  parseBNGLStrict as parseBNGL,
  generateExpandedNetwork,
  simulate,
  NautyService,
  GraphMatcher,
  clearMatchCache,
} from '@bngplayground/engine';

// Profiling counters live in NetworkGenerator. Imported through the SAME alias
// prefix so it is the SAME module instance the generator mutates internally
// (importing via a different specifier can give you a second copy stuck at zero).
import {
  enableProfiling,
  disableProfiling,
  resetProfileData,
  PROFILE_DATA,
} from '@bngplayground/engine/services/graph/NetworkGenerator';

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------
const REPEATS = Math.max(1, parseInt(process.env.PROFILE_REPEATS || '3', 10));
const SIM_METHODS = (process.env.PROFILE_SIM || 'ode,ssa').split(',').map(s => s.trim()).filter(Boolean);
const T_END = Number(process.env.PROFILE_TEND || 10);
const SSA_T_ENDS = [...new Set(
  (process.env.PROFILE_SSA_TENDS || '1,100')
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isFinite(n) && n > 0),
)];
if (SSA_T_ENDS.length === 0) {
  throw new Error('PROFILE_SSA_TENDS must contain at least one positive finite number');
}
const N_STEPS = Number(process.env.PROFILE_NSTEPS || 100);
const OUT_PATH = process.env.PROFILE_OUT || join(process.cwd(), 'profile-report.md');
const MULTISITE_SITES = (process.env.PROFILE_MULTISITE || '5,7').split(',').map(s => parseInt(s.trim(), 10)).filter(n => n > 0);
const MODELS_DIR = process.env.PROFILE_MODELS_DIR;
const ONLY_EXTERNAL = process.env.PROFILE_ONLY_EXTERNAL === '1';

const HAS_CVODE = existsSync(join(process.cwd(), 'public', 'cvode.wasm'));
// Dense-vs-sparse ODE comparison: runs the engine's default ODE (dense cvode_jac
// for large mass-action models) against an explicit cvode_sparse on the SAME model,
// then reports speedup + max trajectory difference. This is the go/no-go on whether
// routing large models to sparse is a safe one-line selection fix. Set to '0' to skip.
const ODE_COMPARE = process.env.PROFILE_ODE_COMPARE !== '0' && HAS_CVODE && SIM_METHODS.includes('ode');
// Rows are only compared where the dense value exceeds this floor (relative diff on
// near-zero values is meaningless); below it, the absolute diff is used instead.
const REL_DIFF_FLOOR = 1e-6;

// The engine PROFILE_DATA sections, in a stable display order.
const SECTIONS = [
  'canonicalize',
  'findAllMaps',
  'matchComponents',
  'applyTransformation',
  'isDuplicateReaction',
  'degeneracy',
  'speciesDedup',
] as const;
type Section = typeof SECTIONS[number];

// ---------------------------------------------------------------------------
// built-in benchmark models (standard BNGL). Swap in your own via
// PROFILE_MODELS_DIR — combinatorial ones are where generation cost shows up.
// ---------------------------------------------------------------------------

// Baseline: a linear unimolecular chain. Generation is trivial; this measures
// fixed overhead so you can subtract it from the interesting models.
function chainModel(length: number): string {
  const names = Array.from({ length }, (_, i) => String.fromCharCode(65 + i)); // A,B,C...
  const params = 'k 1.0';
  const species = names.map((n, i) => `    ${n} ${i === 0 ? 100 : 0}`).join('\n');
  const rules = names.slice(0, -1).map((n, i) => `    ${n} -> ${names[i + 1]} k`).join('\n');
  return `
begin parameters
    ${params}
end parameters
begin species
${species}
end species
begin observables
    Molecules ${names[0]}_obs ${names[0]}()
end observables
begin reaction rules
${rules}
end reaction rules
`;
}

// Simple bimolecular binding: A + B <-> C.
const bindingModel = `
begin parameters
    kon 1.0
    koff 0.5
end parameters
begin species
    A 100
    B 100
    C 0
end species
begin observables
    Molecules Cbound C()
end observables
begin reaction rules
    A + B <-> C  kon, koff
end reaction rules
`;

// Combinatorial stressor: one molecule with N independently (de)phosphorylated
// sites -> 2^N species. This is what exercises canonicalize / findAllMaps /
// degeneracy on multi-component molecules. N is configurable.
function multisiteModel(nSites: number): string {
  const sites = Array.from({ length: nSites }, (_, i) => `s${i}~0~P`).join(',');
  const params = 'kp 1.0\n    kdp 0.5';
  let rules = '';
  for (let i = 0; i < nSites; i++) {
    rules += `    R(s${i}~0) -> R(s${i}~P) kp\n`;
    rules += `    R(s${i}~P) -> R(s${i}~0) kdp\n`;
  }
  const initSites = Array.from({ length: nSites }, (_, i) => `s${i}~0`).join(',');
  return `
begin molecule types
    R(${sites})
end molecule types
begin parameters
    ${params}
end parameters
begin species
    R(${initSites}) 1000
end species
begin observables
    Molecules R_s0_P R(s0~P)
end observables
begin reaction rules
${rules}end reaction rules
`;
}

interface ModelSpec { name: string; bngl: string; }

function builtInModels(): ModelSpec[] {
  const models: ModelSpec[] = [];
  if (ONLY_EXTERNAL) return models;
  models.push({ name: 'chain_5 (baseline, unimolecular)', bngl: chainModel(5) });
  models.push({ name: 'binding_AB (bimolecular)', bngl: bindingModel });
  for (const n of MULTISITE_SITES) {
    models.push({ name: `multisite_${n} (2^${n} species, combinatorial)`, bngl: multisiteModel(n) });
  }
  return models;
}

function externalModels(): ModelSpec[] {
  if (!MODELS_DIR) return [];
  if (!existsSync(MODELS_DIR)) {
    console.warn(`[profile] PROFILE_MODELS_DIR does not exist: ${MODELS_DIR}`);
    return [];
  }
  return readdirSync(MODELS_DIR)
    .filter(f => f.toLowerCase().endsWith('.bngl'))
    .sort()
    .map(f => ({ name: basename(f), bngl: readFileSync(join(MODELS_DIR, f), 'utf8') }));
}

// ---------------------------------------------------------------------------
// timing helpers
// ---------------------------------------------------------------------------
const NOOP_CB = { checkCancelled() { /* never cancel */ }, postMessage() { /* discard */ } };

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function ms(n: number): string { return `${n.toFixed(1)}`; }
function pad(s: string, w: number): string { return s.length >= w ? s : s + ' '.repeat(w - s.length); }
function padL(s: string, w: number): string { return s.length >= w ? s : ' '.repeat(w - s.length) + s; }

// Max absolute and (floored) relative difference between two simulation results,
// compared cell-by-cell over shared numeric columns and aligned row indices.
// Used to check that cvode_sparse produces the same trajectory as dense cvode_jac.
function trajMaxDiff(a: any, b: any): { maxAbs: number; maxRel: number; cells: number } {
  let maxAbs = 0, maxRel = 0, cells = 0;
  const dataA = a?.data ?? [], dataB = b?.data ?? [];
  const rows = Math.min(dataA.length, dataB.length);
  const cols: string[] = (a?.headers ?? Object.keys(dataA[0] ?? {})).filter((h: string) => h.toLowerCase() !== 'time');
  for (let i = 0; i < rows; i++) {
    const ra = dataA[i], rb = dataB[i];
    for (const c of cols) {
      const va = ra?.[c], vb = rb?.[c];
      if (typeof va !== 'number' || typeof vb !== 'number') continue;
      const abs = Math.abs(va - vb);
      if (abs > maxAbs) maxAbs = abs;
      if (Math.abs(va) > REL_DIFF_FLOOR) {
        const rel = abs / Math.abs(va);
        if (rel > maxRel) maxRel = rel;
      }
      cells++;
    }
  }
  return { maxAbs, maxRel, cells };
}

interface PhaseResult {
  parseMs: number;
  genMs: number;
  simMs: Record<string, number | null>;   // method -> median ms (null = skipped/failed)
  simStats: Record<string, SimulationTiming>;
  species: number;
  reactions: number;
  heapDeltaMB: number;
  // generation breakdown (from the final timed run)
  breakdown: Record<Section, { ms: number; calls: number }>;
  // dense-vs-sparse ODE comparison (only when ODE_COMPARE)
  odeVsSparse?: {
    denseMs: number;          // engine default (dense cvode_jac for large N)
    sparseMs: number | null;  // explicit cvode_sparse; null if it errored
    speedup: number | null;   // denseMs / sparseMs
    maxAbs: number;           // max |dense - sparse| across all cells
    maxRel: number;           // max relative diff where dense value > floor
    comparedCells: number;
    status: 'ok' | 'sparse-failed' | 'dense-failed';
    error?: string;
  };
  error?: string;
}

interface SimulationTiming {
  method: string;
  tEnd: number;
  medianMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  samplesMs: number[];
  trajectoryHash: string | null;
  error?: string;
}

function simulationCaseKey(method: string, tEnd: number): string {
  return `${method}:t_end=${tEnd}`;
}

// This is deliberately computed after the timer stops; it is a reproducibility
// guard, not part of the benchmark metric.
function trajectoryHash(value: unknown): string {
  const result = value as Partial<{
    headers: unknown;
    data: unknown;
    dataBySuffix: unknown;
    speciesHeaders: unknown;
    speciesData: unknown;
    speciesDataBySuffix: unknown;
  }> | null;
  const text = JSON.stringify({
    headers: result?.headers,
    data: result?.data,
    dataBySuffix: result?.dataBySuffix,
    speciesHeaders: result?.speciesHeaders,
    speciesData: result?.speciesData,
    speciesDataBySuffix: result?.speciesDataBySuffix,
  });
  return createHash('sha256').update(text).digest('hex');
}

async function profileModel(spec: ModelSpec): Promise<PhaseResult> {
  const result: PhaseResult = {
    parseMs: NaN, genMs: NaN, simMs: {}, simStats: {}, species: 0, reactions: 0, heapDeltaMB: 0,
    breakdown: Object.fromEntries(SECTIONS.map(s => [s, { ms: 0, calls: 0 }])) as PhaseResult['breakdown'],
  };

  try {
    // --- warm-up (discarded): compiles hot paths, warms WASM ---
    {
      const parsed = parseBNGL(spec.bngl);
      clearMatchCache();
      resetProfileData();
      await generateExpandedNetwork(parsed as any, NOOP_CB.checkCancelled, () => {});
    }

    const parseTimes: number[] = [];
    const genTimes: number[] = [];
    let lastExpanded: any = null;

    for (let r = 0; r < REPEATS; r++) {
      // parse (fresh each repeat -> fresh graph objects -> cold canonical cache,
      // which is the realistic per-generation cost)
      const p0 = performance.now();
      const parsed = parseBNGL(spec.bngl);
      parseTimes.push(performance.now() - p0);

      // generation
      clearMatchCache();
      resetProfileData();
      const heapBefore = process.memoryUsage().heapUsed;
      const g0 = performance.now();
      const expanded = await generateExpandedNetwork(parsed as any, NOOP_CB.checkCancelled, () => {});
      genTimes.push(performance.now() - g0);
      const heapAfter = process.memoryUsage().heapUsed;

      lastExpanded = { parsed, expanded };

      if (r === REPEATS - 1) {
        // Capture the breakdown from the final run. matchComponents is tracked
        // as GraphMatcher statics and only folded into PROFILE_DATA on demand.
        (PROFILE_DATA as any).matchComponents = (GraphMatcher as any).matchComponentsTime ?? 0;
        (PROFILE_DATA as any).matchComponentsCount = (GraphMatcher as any).matchComponentsCount ?? 0;

        for (const sec of SECTIONS) {
          result.breakdown[sec] = {
            ms: (PROFILE_DATA as any)[sec] ?? 0,
            calls: (PROFILE_DATA as any)[`${sec}Count`] ?? 0,
          };
        }
        result.species = expanded.species?.length ?? 0;
        result.reactions = expanded.reactions?.length ?? 0;
        result.heapDeltaMB = (heapAfter - heapBefore) / (1024 * 1024);

        if (result.breakdown.canonicalize.calls === 0 && result.species > 1) {
          console.warn('[profile] WARNING: PROFILE_DATA shows 0 canonicalize calls despite a real network — the profiling import is likely a different module instance than the generator. Check the import path.');
        }
      }
    }

    result.parseMs = median(parseTimes);
    result.genMs = median(genTimes);

    // --- simulation, per requested method ---
    const { parsed, expanded } = lastExpanded;
    const simModel = {
      ...parsed,
      reactions: expanded.reactions,
      species: expanded.species,
      concreteObservables: (expanded as any).concreteObservables,
      observables: expanded.observables ?? parsed.observables,
    };

    // Helper: time a simulation config (warm-up + median), returning the last result.
    const runSimTimed = async (options: any): Promise<{ timing: SimulationTiming; result: any | null }> => {
      try {
        await simulate(0, simModel as any, options, NOOP_CB as any); // warm-up
        const times: number[] = [];
        let simResult: any = null;
        for (let r = 0; r < REPEATS; r++) {
          const s0 = performance.now();
          simResult = await simulate(r + 1, simModel as any, options, NOOP_CB as any);
          times.push(performance.now() - s0);
        }
        return {
          timing: {
            method: options.method,
            tEnd: options.t_end,
            medianMs: median(times),
            minMs: Math.min(...times),
            maxMs: Math.max(...times),
            samplesMs: times,
            trajectoryHash: trajectoryHash(simResult),
          },
          result: simResult,
        };
      } catch (e) {
        return {
          timing: {
            method: options.method,
            tEnd: options.t_end,
            medianMs: null,
            minMs: null,
            maxMs: null,
            samplesMs: [],
            trajectoryHash: null,
            error: (e as Error).message,
          },
          result: null,
        };
      }
    };

    let denseOdeResult: any = null;
    for (const method of SIM_METHODS) {
      if (method === 'ode' && !HAS_CVODE) { result.simMs[method] = null; continue; }
      const tEnds = method === 'ssa' ? SSA_T_ENDS : [T_END];
      for (const tEnd of tEnds) {
        const options: any = { method, t_end: tEnd, n_steps: N_STEPS, seed: 12345 };
        if (method === 'ode') options.solver = 'cvode'; // -> dense cvode_jac for large mass-action N

        const { timing, result: simResult } = await runSimTimed(options);
        result.simStats[simulationCaseKey(method, tEnd)] = timing;
        result.simMs[method] = timing.medianMs;
        if (timing.error) console.warn(`[profile] ${spec.name}: ${method} t_end=${tEnd} sim failed: ${timing.error}`);
        if (method === 'ode') denseOdeResult = simResult;
      }
    }

    // --- dense-vs-sparse ODE comparison on the SAME model: the go/no-go on routing
    //     large models to sparse. Runs explicit cvode_sparse and diffs the trajectory
    //     against the dense default. If sparse crashes, that is the signal the WASM
    //     genuinely needs the sparse rebuild. ---
    if (ODE_COMPARE) {
      const denseMs = result.simMs['ode'] ?? NaN;
      if (!denseOdeResult) {
        result.odeVsSparse = { denseMs, sparseMs: null, speedup: null, maxAbs: NaN, maxRel: NaN, comparedCells: 0, status: 'dense-failed' };
      } else {
        const sparse = await runSimTimed({ method: 'ode', solver: 'cvode_sparse', t_end: T_END, n_steps: N_STEPS });
        if (sparse.timing.error || !sparse.result) {
          result.odeVsSparse = {
            denseMs, sparseMs: null, speedup: null, maxAbs: NaN, maxRel: NaN,
            comparedCells: 0, status: 'sparse-failed', error: sparse.timing.error,
          };
          console.warn(`[profile] ${spec.name}: cvode_sparse failed (may need the WASM sparse rebuild): ${sparse.timing.error}`);
        } else {
          const diff = trajMaxDiff(denseOdeResult, sparse.result);
          result.odeVsSparse = {
            denseMs,
            sparseMs: sparse.timing.medianMs,
            speedup: (sparse.timing.medianMs && sparse.timing.medianMs > 0) ? denseMs / sparse.timing.medianMs : null,
            maxAbs: diff.maxAbs, maxRel: diff.maxRel, comparedCells: diff.cells,
            status: 'ok',
          };
        }
      }
    }
  } catch (e) {
    result.error = (e as Error).message;
  }

  return result;
}

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------
function buildReport(rows: Array<{ spec: ModelSpec; res: PhaseResult }>): string {
  const lines: string[] = [];
  const push = (s = '') => { lines.push(s); console.log(s); };

  push('');
  push('==============================================================================');
  push(` PIPELINE PROFILE   (median of ${REPEATS} run${REPEATS > 1 ? 's' : ''}, warm-up discarded)`);
  push(` runtime: ${process.version}   platform: ${process.platform}/${process.arch}`);
  push(` cvode.wasm present: ${HAS_CVODE ? 'yes' : 'NO (ODE skipped)'}   sim methods: ${SIM_METHODS.join(', ')}`);
  if (SIM_METHODS.includes('ssa')) push(` SSA cases: ${SSA_T_ENDS.map(t => `t_end=${t}`).join(', ')}`);
  if (ODE_COMPARE) push(' dense-vs-sparse ODE comparison: ON (see the DENSE vs SPARSE section below)');
  push('==============================================================================');
  push('');

  // ---- per-model phase table ----
  const header =
    pad('model', 40) + padL('species', 9) + padL('rxns', 8) +
    padL('parse', 9) + padL('gen', 10) + padL('ode', 9) +
    padL(`ssa@${SSA_T_ENDS[SSA_T_ENDS.length - 1]}`, 11) + padL('heapMB', 9);
  push(header);
  push('-'.repeat(header.length));
  for (const { spec, res } of rows) {
    if (res.error) {
      push(pad(spec.name, 40) + '  FAILED: ' + res.error.slice(0, 60));
      continue;
    }
    push(
      pad(spec.name, 40) +
      padL(String(res.species), 9) +
      padL(String(res.reactions), 8) +
      padL(ms(res.parseMs), 9) +
      padL(ms(res.genMs), 10) +
      padL(res.simMs['ode'] == null ? '-' : ms(res.simMs['ode']!), 9) +
      padL(res.simMs['ssa'] == null ? '-' : ms(res.simMs['ssa']!), 11) +
      padL(res.heapDeltaMB.toFixed(1), 9)
    );
  }
  push('');
  push('(all times in ms)');
  push('');

  // ---- raw simulation timing samples and spread ----
  const hasSimulationStats = rows.some(({ res }) => Object.keys(res.simStats).length > 0);
  if (hasSimulationStats) {
    push('==============================================================================');
    push(' SIMULATION SAMPLE SPREAD');
    push('==============================================================================');
    push(' Raw samples are retained in execution order; hashing occurs outside the timer.');
    push('');
    for (const { spec, res } of rows) {
      for (const [caseName, timing] of Object.entries(res.simStats)) {
        const samples = timing.samplesMs.map(value => value.toFixed(3)).join(', ');
        const spread = timing.medianMs == null
          ? `FAILED: ${timing.error ?? 'unknown error'}`
          : `median=${timing.medianMs.toFixed(3)} min=${timing.minMs!.toFixed(3)} max=${timing.maxMs!.toFixed(3)}`;
        push(` ${spec.name} | ${caseName} | ${spread}`);
        push(`   samples_ms=[${samples}] trajectory_hash=${timing.trajectoryHash ?? '-'}`);
      }
    }
    push('==============================================================================');
    push('');
  }

  // ---- generation breakdown per model ----
  for (const { spec, res } of rows) {
    if (res.error || res.genMs === 0 || Number.isNaN(res.genMs)) continue;
    const sectionMs = SECTIONS.reduce((a, s) => a + res.breakdown[s].ms, 0);
    if (sectionMs < 0.05) continue; // nothing meaningful to break down (trivial gen)

    push(`--- generation breakdown: ${spec.name}  (gen wall ${ms(res.genMs)} ms) ---`);
    const bh = pad('  section', 24) + padL('ms', 10) + padL('% gen', 8) + padL('calls', 10) + padL('µs/call', 10);
    push(bh);
    const ranked = [...SECTIONS].sort((a, b) => res.breakdown[b].ms - res.breakdown[a].ms);
    for (const sec of ranked) {
      const { ms: t, calls } = res.breakdown[sec];
      if (t === 0 && calls === 0) continue;
      const pctGen = res.genMs > 0 ? (t / res.genMs) * 100 : 0;
      const perCall = calls > 0 ? (t * 1000) / calls : 0;
      push(
        pad('  ' + sec, 24) +
        padL(t.toFixed(1), 10) +
        padL(pctGen.toFixed(0) + '%', 8) +
        padL(String(calls), 10) +
        padL(perCall.toFixed(2), 10)
      );
    }
    const perSp = res.species > 0 ? (res.genMs * 1000) / res.species : 0;
    const perRx = res.reactions > 0 ? (res.genMs * 1000) / res.reactions : 0;
    const accounted = res.genMs > 0 ? (sectionMs / res.genMs) * 100 : 0;
    push(`  (instrumented sections account for ${accounted.toFixed(0)}% of gen wall; ` +
      `${perSp.toFixed(1)} µs/species, ${perRx.toFixed(1)} µs/reaction; ` +
      `remainder = queue/bookkeeping/uninstrumented)`);
    push('');
  }

  // ---- dense vs sparse ODE comparison ----
  const cmpRows = rows.filter(r => r.res.odeVsSparse);
  if (cmpRows.length > 0) {
    push('==============================================================================');
    push(' DENSE vs SPARSE ODE   (go/no-go on routing large models to cvode_sparse)');
    push('==============================================================================');
    push(' dense = engine default (cvode_jac, dense LU) ; sparse = explicit cvode_sparse');
    push('');
    const ch =
      pad('model', 40) + padL('species', 9) + padL('dense', 10) + padL('sparse', 10) +
      padL('speedup', 10) + padL('maxAbs', 12) + padL('maxRel', 12) + '  status';
    push(ch);
    push('-'.repeat(ch.length));
    for (const { spec, res } of cmpRows) {
      const c = res.odeVsSparse!;
      const speedup = c.speedup == null ? '-' : c.speedup.toFixed(1) + 'x';
      const maxAbs = Number.isNaN(c.maxAbs) ? '-' : c.maxAbs.toExponential(1);
      const maxRel = Number.isNaN(c.maxRel) ? '-' : c.maxRel.toExponential(1);
      const status =
        c.status === 'ok' ? 'OK' :
        c.status === 'sparse-failed' ? 'SPARSE FAILED' : 'DENSE FAILED';
      push(
        pad(spec.name, 40) +
        padL(String(res.species), 9) +
        padL(ms(c.denseMs), 10) +
        padL(c.sparseMs == null ? '-' : ms(c.sparseMs), 10) +
        padL(speedup, 10) +
        padL(maxAbs, 12) +
        padL(maxRel, 12) + '  ' + status
      );
      if (c.status === 'sparse-failed' && c.error) {
        push('    -> ' + c.error.slice(0, 90));
      }
    }
    push('');
    // verdict
    const oks = cmpRows.filter(r => r.res.odeVsSparse!.status === 'ok');
    const failed = cmpRows.filter(r => r.res.odeVsSparse!.status === 'sparse-failed');
    const worstRel = Math.max(0, ...oks.map(r => r.res.odeVsSparse!.maxRel).filter(x => !Number.isNaN(x)));
    const bestSpeedup = Math.max(0, ...oks.map(r => r.res.odeVsSparse!.speedup ?? 0));
    if (failed.length > 0) {
      push(` >>> cvode_sparse errored on ${failed.length}/${cmpRows.length} model(s). The WASM sparse`);
      push('     path likely needs the rebuild — the one-line selection change would NOT be safe yet.');
    } else if (oks.length > 0) {
      const agree = worstRel < 1e-4;
      push(` >>> cvode_sparse ran on all models. Worst relative trajectory diff: ${worstRel.toExponential(1)}` +
        ` (${agree ? 'agrees with dense' : 'DIVERGES — investigate before trusting sparse'}).`);
      push(`     Best dense/sparse speedup observed: ${bestSpeedup.toFixed(1)}x.`);
      if (agree && bestSpeedup > 1.5) {
        push('     => Sparse is correct and faster: routing large mass-action models to cvode_sparse');
        push('        is a safe selection change (SimulationLoop.ts ~2636 / ~2618).');
      } else if (agree) {
        push('     => Sparse matches dense but is not clearly faster at these sizes; scale up');
        push('        (larger PROFILE_MULTISITE) before deciding.');
      }
    }
    push('==============================================================================');
    push('');
  }

  // ---- global summary: where does the time go overall ----
  push('==============================================================================');
  push(' WHERE THE TIME GOES (totals across all models)');
  push('==============================================================================');
  const totals = { parse: 0, gen: 0, ode: 0, ssa: 0 };
  const sectionTotals: Record<string, number> = Object.fromEntries(SECTIONS.map(s => [s, 0]));
  for (const { res } of rows) {
    if (res.error) continue;
    totals.parse += res.parseMs || 0;
    totals.gen += res.genMs || 0;
    totals.ode += res.simMs['ode'] || 0;
    totals.ssa += res.simMs['ssa'] || 0;
    for (const s of SECTIONS) sectionTotals[s] += res.breakdown[s].ms;
  }
  const grand = totals.parse + totals.gen + totals.ode + totals.ssa;
  const phaseRank = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  push('');
  push(' phase totals (ms), biggest first:');
  for (const [k, v] of phaseRank) {
    const pct = grand > 0 ? (v / grand) * 100 : 0;
    push(`   ${pad(k, 8)} ${padL(ms(v), 10)}  ${pct.toFixed(0)}%`);
  }
  push('');
  push(' within generation, biggest sinks (ms), biggest first:');
  for (const [k, v] of Object.entries(sectionTotals).sort((a, b) => b[1] - a[1])) {
    if (v < 0.05) continue;
    const pct = totals.gen > 0 ? (v / totals.gen) * 100 : 0;
    push(`   ${pad(k, 20)} ${padL(ms(v), 10)}  ${pct.toFixed(0)}% of gen`);
  }
  push('');
  const topPhase = phaseRank[0];
  const topSection = Object.entries(sectionTotals).sort((a, b) => b[1] - a[1])[0];
  push(` >>> Biggest phase overall: ${topPhase[0]} (${ms(topPhase[1])} ms).`);
  if (totals.gen > 0 && topSection) {
    push(` >>> Biggest generation sink: ${topSection[0]} (${(totals.gen > 0 ? (topSection[1] / totals.gen) * 100 : 0).toFixed(0)}% of generation).`);
  }
  push('==============================================================================');
  push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------
describe('pipeline profile', () => {
  beforeAll(async () => {
    // Bring up Nauty so canonicalization uses the WASM path (not the JS fallback);
    // otherwise the numbers reflect the fallback, not production.
    try {
      await NautyService.getInstance().init();
      if (!NautyService.getInstance().isInitialized) {
        console.warn('[profile] Nauty WASM did not initialize — canonicalize numbers reflect the JS fallback path.');
      }
    } catch (e) {
      console.warn('[profile] Nauty init threw — JS fallback in use:', (e as Error).message);
    }
    enableProfiling();
  });

  it('profiles every phase across the model set', async () => {
    const specs = [...builtInModels(), ...externalModels()];
    if (specs.length === 0) {
      console.warn('[profile] no models to profile (set PROFILE_MODELS_DIR or unset PROFILE_ONLY_EXTERNAL).');
      return;
    }

    const rows: Array<{ spec: ModelSpec; res: PhaseResult }> = [];
    for (const spec of specs) {
      console.log(`[profile] running ${spec.name} ...`);
      const res = await profileModel(spec);
      rows.push({ spec, res });
    }

    disableProfiling();

    const report = buildReport(rows);

    // Persist a copy so you can keep / diff it.
    try {
      writeFileSync(OUT_PATH, report, 'utf8');
      const jsonPath = OUT_PATH.replace(/\.md$/, '') + '.json';
      writeFileSync(jsonPath, JSON.stringify(
        rows.map(({ spec, res }) => ({ model: spec.name, ...res })), null, 2), 'utf8');
      console.log(`[profile] wrote ${OUT_PATH} and ${jsonPath}`);
    } catch (e) {
      console.warn('[profile] could not write report file:', (e as Error).message);
    }
  }, 600_000); // 10 min ceiling; a model that blows past this is itself the finding
});
