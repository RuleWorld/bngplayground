/// <reference types="node" />

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseBNGLWithANTLR } from '../packages/engine/src/parser/BNGLParserWrapper';
import { generateExpandedNetwork } from '../packages/engine/src/services/simulation/NetworkExpansion';
import { simulate } from '../packages/engine/src/services/simulation/SimulationLoop';
import { getSimulationOptionsFromParsedModel } from '../packages/engine/src/utils/simulationOptions';
import { setFeatureFlags } from '../packages/engine/src/featureFlags';

type Mode = 'safe' | 'dynamic';

interface ModeResult {
  mode: Mode;
  timesMs: number[];
  medianMs: number;
  meanMs: number;
}

interface ModelResult {
  model: string;
  filePath: string;
  cappedTEnd: number;
  cappedNSteps: number;
  species: number;
  reactions: number;
  functionalRates: number;
  modes: ModeResult[];
  speedupDynamicVsSafe: number | null;
}

interface BenchmarkReport {
  generatedAt: string;
  runsPerMode: number;
  models: ModelResult[];
}

const RUNS_PER_MODE = Number(process.env.BENCH_RUNS_PER_MODE ?? 2);
const OUTPUT_PATH = path.join(process.cwd(), 'artifacts', 'functional_rate_jit_benchmark.json');

const FALLBACK_MODEL_PATHS = [
  'C:/Users/Achyudhan/OneDrive - University of Pittsburgh/Desktop/Achyudhan/School/PhD/Research/BioNetGen/RuleHub/Published/Mitra2019/10-egfr/egfr_ode.bngl',
  'C:/Users/Achyudhan/OneDrive - University of Pittsburgh/Desktop/Achyudhan/School/PhD/Research/BioNetGen/RuleHub/Published/CheemalavaguJAKSTAT/Cheemalavagu_JAK_STAT.bngl',
  'C:/Users/Achyudhan/OneDrive - University of Pittsburgh/Desktop/Achyudhan/School/PhD/Research/BioNetGen/RuleHub/Published/Mallela2022_MSAs/College_Station-Bryan_TX_College_Station-Bryan_TX.bngl',
];

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function modelNameFromPath(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

function parseRequestedModels(): string[] {
  const raw = process.env.BENCHMARK_MODELS ?? process.env.MODELS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((value: string) => value.trim())
    .filter((value: string) => value.length > 0);
}

function resolveRequestedModels(allCandidates: string[], requested: string[]): string[] {
  const resolved = new Set<string>();

  for (const request of requested) {
    const directPath = path.resolve(request);
    if (fs.existsSync(directPath)) {
      resolved.add(directPath);
      continue;
    }

    const lowered = request.toLowerCase();
    for (const candidate of allCandidates) {
      const name = modelNameFromPath(candidate).toLowerCase();
      if (name.includes(lowered)) {
        resolved.add(candidate);
      }
    }
  }

  return Array.from(resolved);
}

function loadCandidateModelPaths(): string[] {
  const found = new Set<string>();

  for (const p of FALLBACK_MODEL_PATHS) {
    if (fs.existsSync(p)) {
      found.add(path.resolve(p));
    }
  }

  const manifestPath = path.join(process.cwd(), 'ode_published_models.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const payload = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Array<{ name?: string; path?: string }>;
      for (const entry of payload) {
        if (!entry?.path || !entry?.name) continue;
        if (!/(\begfr\b|jak[_-]?stat|\bil6\b)/i.test(entry.name)) continue;
        const resolved = path.resolve(entry.path);
        if (fs.existsSync(resolved)) {
          found.add(resolved);
        }
      }
    } catch (error) {
      console.warn('[benchmark] Failed reading ode_published_models.json:', error);
    }
  }

  const allCandidates = Array.from(found);
  const requestedModels = parseRequestedModels();
  if (requestedModels.length > 0) {
    const resolvedRequested = resolveRequestedModels(allCandidates, requestedModels);
    if (resolvedRequested.length > 0) {
      return resolvedRequested;
    }
    console.warn(`[benchmark] Requested BENCHMARK_MODELS/MODELS=${requestedModels.join(',')} but no matches were found; falling back to defaults.`);
  }

  const maxModels = Number(process.env.BENCH_MAX_MODELS ?? 3);
  return allCandidates.slice(0, Number.isFinite(maxModels) && maxModels > 0 ? maxModels : 3);
}

async function runOne(filePath: string, mode: Mode): Promise<{
  elapsedMs: number;
  cappedTEnd: number;
  cappedNSteps: number;
  species: number;
  reactions: number;
  functionalRates: number;
}> {
  setFeatureFlags({
    functionalRatesEnabled: true,
    enableJitFastPath: mode === 'dynamic',
  });

  const code = fs.readFileSync(filePath, 'utf8');
  const parsed = parseBNGLWithANTLR(code);
  if (!parsed.model) {
    throw new Error(`Parse failed for ${filePath}`);
  }

  const expanded = await generateExpandedNetwork(parsed.model, () => {}, () => {});

  const options = getSimulationOptionsFromParsedModel(expanded, 'ode', { solver: 'cvode' });
  const cappedOptions = {
    ...options,
    t_end: Math.min(options.t_end ?? 100, 50),
    n_steps: Math.min(options.n_steps ?? 100, 250),
  };

  const functionalRates = expanded.reactions.filter((rxn: any) => rxn?.isFunctionalRate && !!rxn?.rateExpression).length;

  const t0 = performance.now();
  await simulate(0, expanded, cappedOptions as any, {
    checkCancelled: () => {},
    postMessage: (() => {}) as any,
  });
  const elapsedMs = performance.now() - t0;

  return {
    elapsedMs,
    cappedTEnd: cappedOptions.t_end,
    cappedNSteps: cappedOptions.n_steps,
    species: expanded.species.length,
    reactions: expanded.reactions.length,
    functionalRates,
  };
}

async function benchmarkModel(filePath: string): Promise<ModelResult> {
  const model = modelNameFromPath(filePath);

  const modeResults: ModeResult[] = [];
  let metadata: {
    cappedTEnd: number;
    cappedNSteps: number;
    species: number;
    reactions: number;
    functionalRates: number;
  } | null = null;

  for (const mode of ['safe', 'dynamic'] as const) {
    // Warm-up run
    await runOne(filePath, mode);

    const timesMs: number[] = [];
    for (let i = 0; i < RUNS_PER_MODE; i++) {
      const run = await runOne(filePath, mode);
      timesMs.push(run.elapsedMs);
      if (!metadata) {
        metadata = {
          cappedTEnd: run.cappedTEnd,
          cappedNSteps: run.cappedNSteps,
          species: run.species,
          reactions: run.reactions,
          functionalRates: run.functionalRates,
        };
      }
    }

    modeResults.push({
      mode,
      timesMs,
      medianMs: median(timesMs),
      meanMs: mean(timesMs),
    });
  }

  const safeMedian = modeResults.find((m) => m.mode === 'safe')?.medianMs ?? 0;
  const dynamicMedian = modeResults.find((m) => m.mode === 'dynamic')?.medianMs ?? 0;
  const speedupDynamicVsSafe = safeMedian > 0 && dynamicMedian > 0
    ? safeMedian / dynamicMedian
    : null;

  const m = metadata ?? {
    cappedTEnd: 0,
    cappedNSteps: 0,
    species: 0,
    reactions: 0,
    functionalRates: 0,
  };

  return {
    model,
    filePath,
    cappedTEnd: m.cappedTEnd,
    cappedNSteps: m.cappedNSteps,
    species: m.species,
    reactions: m.reactions,
    functionalRates: m.functionalRates,
    modes: modeResults,
    speedupDynamicVsSafe,
  };
}

async function main() {
  const candidates = loadCandidateModelPaths();
  if (candidates.length === 0) {
    throw new Error('No EGFR/JAK/STAT benchmark models found.');
  }

  console.log(`[benchmark] Running functional-rate benchmark on ${candidates.length} model(s)`);

  const results: ModelResult[] = [];
  for (const filePath of candidates) {
    console.log(`\n[benchmark] Model: ${modelNameFromPath(filePath)}`);
    const result = await benchmarkModel(filePath);
    results.push(result);

    const safe = result.modes.find((m) => m.mode === 'safe');
    const dynamic = result.modes.find((m) => m.mode === 'dynamic');

    console.log(`  functionalRates=${result.functionalRates}, species=${result.species}, reactions=${result.reactions}`);
    if (safe) {
      console.log(`  safe median:    ${safe.medianMs.toFixed(1)} ms`);
    }
    if (dynamic) {
      console.log(`  dynamic median: ${dynamic.medianMs.toFixed(1)} ms`);
    }
    if (result.speedupDynamicVsSafe) {
      console.log(`  speedup (dynamic vs safe): ${result.speedupDynamicVsSafe.toFixed(2)}x`);
    }
  }

  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    runsPerMode: RUNS_PER_MODE,
    models: results,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));

  console.log(`\n[benchmark] Wrote ${OUTPUT_PATH}`);

  // Restore secure defaults for local dev session after benchmark run.
  setFeatureFlags({ functionalRatesEnabled: true, enableJitFastPath: false });
}

main().catch((error) => {
  console.error('[benchmark] Failed:', error);
  process.exit(1);
});
