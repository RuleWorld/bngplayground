/**
 * atomizer_validation_harness.ts
 *
 * Automated validation of the TS atomizer against BioModels.
 */

import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

import { Atomizer } from './src/lib/atomizer/index';
import { parseBNGLStrict } from './src/parser/BNGLParserWrapper';
import { generateExpandedNetwork } from './services/simulation/NetworkExpansion';
import { loadEvaluator } from './services/simulation/ExpressionEvaluator';
import { requiresCompartmentResolution, resolveCompartmentVolumes } from './services/simulation/CompartmentResolver';
import { parseGdat } from './services/simulation/GdatParser';
import { exportToSBML } from './services/exportSBML';
import { DEFAULT_BNG2_PATH, DEFAULT_BNG_BIN, DEFAULT_PERL5LIB, DEFAULT_PERL_CMD } from './scripts/bngDefaults.js';
import type { BNGLModel } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const BIOMODELS_API = 'https://www.ebi.ac.uk/biomodels/model/download';

// From AtomizerLives general_notes.md — models known to have issues in the
// Python atomizer. We skip these since the reference output would be wrong.
const KNOWN_ISSUES = new Set([
  // Events (not supported in BNGL)
  1, 7, 56, 77, 81, 87, 88, 95, 96, 97, 101, 104, 109, 111, 117, 120, 121, 122, 124, 125, 126,
  127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 139, 140, 141, 142, 144, 148, 149,
  152, 153, 158, 186, 187, 188, 189, 193, 194, 195, 196, 227, 235, 241, 244, 256, 265, 281,
  285, 287, 297, 301, 316, 317, 318, 327, 337, 338, 339, 340, 342, 344, 404, 408, 422, 436,
  437, 439, 479, 480, 488, 493, 494, 496, 497, 534, 535, 536, 537, 540, 541, 563, 570, 571,
  597, 598, 601, 612, 613, 620, 621, 628, 632, 634, 650, 659, 681, 695, 699, 702, 706, 711,
  718, 727, 734, 735, 736, 786, 789, 791, 794, 806, 814, 816, 817, 818, 820, 822, 825, 829,
  834, 856, 860, 862, 864, 901,

  // Piecewise functions
  164, 165, 167, 234, 326, 577, 664, 693,

  // Rule names as parameters
  63, 245, 248, 305, 542, 556, 575, 578,

  // Compartments as parameters
  342, 429, 457, 547, 570, 627, 637, 638,

  // Broken SBML (even COPASI fails)
  527, 562, 592, 593, 596, 723, 250,

  // No reactions
  304, 324, 330, 331, 341, 343, 345, 349, 367, 371, 374, 377, 381, 533, 548, 549, 551, 618,
  642, 670, 671, 680, 682, 684, 118, 252, 673, 531, 532, 555, 561,

  // Assignment rules in reactions
  306, 307, 308, 309, 310, 311, 388, 390, 391, 393, 409, 428, 505, 512, 528, 557, 566, 567,
  719, 641, 71, 90, 173, 253,

  // Uses time functions
  558, 568, 674, 722, 412, 445, 302, 208, 268, 51, 55, 162, 180, 179, 579, 691, 465, 466,
  238, 312, 538, 603, 604, 605, 215, 635, 636,

  // Various unsupported features
  24, 25, 34, 154, 155, 196, 201, 589, 613, 668, 669, 696, 468,
  643, 644, 645, // complex i
  607, 610, // function linking

  // Non-integer stoichiometry
  319, 206, 39, 145, 353, 385, 392, 463, 608, 470, 472,

  // Multi-compartment
  161, 182, 239, 271,

  // Run failures (CVODE, etc.)
  9, 107, 123, 183, 192, 269, 279, 292, 328, 336, 378, 383, 384, 387, 438, 617, 678, 606,
  616, 255, 401, 402, 403, 559, 64, 232, 172, 176, 177,
]);

// Models that take too long to atomize
const TOO_LONG = new Set([
  64, 172, 176, 177, 212, 217, 235, 247, 293, 385, 426, 451, 457, 463, 469, 470, 471, 472,
  473, 474, 496, 497, 503, 505, 506, 574, 595, 835, 863, 232, 608, 63, 70, 269,
]);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ModelResult {
  biomodelId: number;
  status: 'success' | 'skip_known' | 'skip_long' | 'fetch_fail' | 'atomize_fail' |
          'simulate_fail' | 'compare_fail' | 'parity_pass' | 'parity_fail';
  tsAtomizeTime?: number;
  refAtomizeTime?: number;
  simulateTime?: number;
  validationRatio?: number;
  rmse?: number;
  observablesCompared?: number;
  observablesMatched?: number;
  error?: string;
}

interface ValidationReport {
  timestamp: string;
  totalModels: number;
  tested: number;
  skipped: number;
  atomizeFails: number;
  simulateFails: number;
  parityPass: number;
  parityFail: number;
  exactMatch: number;
  highVR: number;
  results: ModelResult[];
}

// ─────────────────────────────────────────────────────────────────────────────
// BioModels API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch SBML XML from BioModels REST API.
 * Returns the XML string, or null on failure.
 * The XML is ephemeral — not written to disk.
 */
async function fetchSBML(biomodelNumber: number): Promise<string | null> {
  const biomodelId = `BIOMD${String(biomodelNumber).padStart(10, '0')}`;
  // BioModels API: GET /model/download/{id}?filename={id}_url.xml
  const url = `${BIOMODELS_API}/${biomodelId}?filename=${biomodelId}_url.xml`;

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/xml' },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      // Try alternate filename patterns
      const altUrl = `https://www.ebi.ac.uk/biomodels/${biomodelId}?format=sbml`;
      const altResponse = await fetch(altUrl, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!altResponse.ok) return null;
      return await altResponse.text();
    }

    return await response.text();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Validation Pipeline
// ─────────────────────────────────────────────────────────────────────────────

function mapTimeCourse(results: { headers: string[]; data: Record<string, number>[] }): Map<string, number[]> {
  const headers = results.headers.filter(h => h !== 'time');
  const out = new Map<string, number[]>();
  for (const h of headers) {
    out.set(h, []);
  }
  for (const row of results.data) {
    for (const h of headers) {
      const val = row[h] ?? 0;
      out.get(h)!.push(typeof val === 'number' ? val : Number(val));
    }
  }
  return out;
}

const ensureLibsbmlShim = () => {
  if (typeof (globalThis as any).self === 'undefined') {
    (globalThis as any).self = globalThis;
  }
};

const isDelimiterLine = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed.length >= 8 && /^=+$/.test(trimmed);
};

async function extractReferenceBnglFromGitingest(
  gitingestPath: string,
  biomodelNumber: number
): Promise<string | null> {
  const target = `AtomizerLives/data/atomizer/atomized_translations/bmd${String(biomodelNumber).padStart(10, '0')}_atomized.bngl`;
  const stream = createReadStream(gitingestPath, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let found = false;
  let contentStarted = false;
  const lines: string[] = [];

  try {
    for await (const line of rl) {
      if (!found) {
        if (line.startsWith('FILE:') && line.includes(target)) {
          found = true;
        }
        continue;
      }

      if (!contentStarted) {
        if (isDelimiterLine(line)) {
          contentStarted = true;
        }
        continue;
      }

      if (isDelimiterLine(line)) {
        break;
      }

      lines.push(line);
    }
  } finally {
    rl.close();
    stream.close();
  }

  if (lines.length === 0) return null;
  return lines.join('\n').trimEnd();
}

async function bnglToSbml(bngl: string): Promise<string> {
  let model = parseBNGLStrict(bngl);
  if (requiresCompartmentResolution(model)) {
    model = await resolveCompartmentVolumes(model);
  }

  const hasRules = model.reactionRules && model.reactionRules.length > 0;
  const hasReactions = model.reactions && model.reactions.length > 0;

  if (hasRules && !hasReactions) {
    await loadEvaluator();
    const originalLog = console.log;
    const originalWarn = console.warn;
    const quiet = process.env.ATOMIZER_VERBOSE_NETWORK !== '1';
    if (quiet) {
      console.log = () => undefined;
      console.warn = () => undefined;
    }
    try {
      model = await generateExpandedNetwork(model, () => undefined, () => undefined);
    } finally {
      if (quiet) {
        console.log = originalLog;
        console.warn = originalWarn;
      }
    }
  }

  return exportToSBML(model);
}

type SbmlSimOptions = {
  modelName: string;
  keepTemp?: boolean;
  tempRoot?: string;
  bng2Path?: string;
  perlCmd?: string;
};

async function simulateSbmlWithBng2(sbml: string, options: SbmlSimOptions): Promise<Map<string, number[]>> {
  const tempRoot = options.tempRoot ?? os.tmpdir();
  const workDir = await fs.mkdtemp(path.join(tempRoot, 'bng-sbml-'));
  const baseName = options.modelName.replace(/[^A-Za-z0-9_.-]/g, '_');
  const sbmlPath = path.join(workDir, `${baseName}.xml`);
  await fs.writeFile(sbmlPath, sbml, 'utf8');

  const perlCmd = options.perlCmd ?? process.env.PERL_CMD ?? DEFAULT_PERL_CMD;
  const bng2Path = options.bng2Path ?? process.env.BNG2_PATH ?? DEFAULT_BNG2_PATH;

  const env = { ...process.env } as Record<string, string>;
  env.PERL5LIB = env.PERL5LIB ?? DEFAULT_PERL5LIB;
  const pathParts = (env.PATH || '').split(path.delimiter).filter(Boolean);
  if (!pathParts.includes(DEFAULT_BNG_BIN)) {
    pathParts.unshift(DEFAULT_BNG_BIN);
  }
  env.PATH = pathParts.join(path.delimiter);

  const result = spawnSync(perlCmd, [bng2Path, path.basename(sbmlPath), '--outdir', workDir], {
    cwd: workDir,
    encoding: 'utf8',
    env,
    timeout: 10 * 60 * 1000,
  });

  const entries = await fs.readdir(workDir);
  const gdatFile = entries.find(name => name.toLowerCase().endsWith('.gdat'));

  if (result.error || result.status !== 0 || !gdatFile) {
    const stdout = result.stdout ? String(result.stdout).trim() : '';
    const stderr = result.stderr ? String(result.stderr).trim() : '';
    if (!options.keepTemp) {
      await fs.rm(workDir, { recursive: true, force: true });
    }
    throw new Error(`BNG2 SBML simulation failed. status=${result.status ?? 'null'} gdat=${gdatFile ?? 'missing'} stdout=${stdout} stderr=${stderr}`);
  }

  const gdatPath = path.join(workDir, gdatFile);
  const gdatText = await fs.readFile(gdatPath, 'utf8');
  const gdatData = parseGdat(gdatText);

  if (!options.keepTemp) {
    await fs.rm(workDir, { recursive: true, force: true });
  }

  return mapTimeCourse(gdatData);
}

async function loadReferenceBngl(
  biomodelNumber: number,
  referenceBnglDir?: string,
  referenceGitingestPath?: string
): Promise<string | null> {
  if (referenceBnglDir) {
    const refName = `bmd${String(biomodelNumber).padStart(10, '0')}_atomized.bngl`;
    const refBnglPath = path.join(referenceBnglDir, refName);
    return fs.readFile(refBnglPath, 'utf8').catch(() => null);
  }

  if (referenceGitingestPath) {
    return extractReferenceBnglFromGitingest(referenceGitingestPath, biomodelNumber);
  }

  return null;
}

/**
 * Validate a single BioModel.
 */
async function validateModel(
  biomodelNumber: number,
  options: {
    referenceBnglDir?: string;  // Path to AtomizerLives atomized_translations/
    referenceGitingestPath?: string; // Path to gitingested AtomizerLives snapshot
    atomizeFn: (sbmlXml: string) => Promise<string>;  // TS atomizer
    bnglToSbmlFn: (bngl: string) => Promise<string>;  // BNGL -> SBML
    simulateSbmlFn: (sbml: string, label: string) => Promise<Map<string, number[]>>;  // SBML simulate
    tolerance: number;
  }
): Promise<ModelResult> {
  const result: ModelResult = { biomodelId: biomodelNumber, status: 'success' };

  // ── Skip known issues ──
  if (KNOWN_ISSUES.has(biomodelNumber)) {
    return { ...result, status: 'skip_known' };
  }
  if (TOO_LONG.has(biomodelNumber)) {
    return { ...result, status: 'skip_long' };
  }

  // ── Step 1: Fetch SBML ──
  const sbmlXml = await fetchSBML(biomodelNumber);
  if (!sbmlXml) {
    return { ...result, status: 'fetch_fail', error: 'Could not fetch SBML from BioModels API' };
  }

  // ── Step 2: Atomize with TS atomizer ──
  let tsBngl: string;
  const atomizeStart = performance.now();
  try {
    tsBngl = await options.atomizeFn(sbmlXml);
  } catch (e: any) {
    return {
      ...result,
      status: 'atomize_fail',
      error: `TS atomizer failed: ${e?.message || e}`,
      tsAtomizeTime: performance.now() - atomizeStart,
    };
  }
  result.tsAtomizeTime = performance.now() - atomizeStart;

  // ── Step 3: Simulate TS output (BNGL -> SBML -> simulate) ──
  let tsTimeCourse: Map<string, number[]>;
  const simStart = performance.now();
  try {
    const tsSbml = await options.bnglToSbmlFn(tsBngl);
    tsTimeCourse = await options.simulateSbmlFn(tsSbml, `bmd${String(biomodelNumber).padStart(10, '0')}_ts`);
  } catch (e: any) {
    return {
      ...result,
      status: 'simulate_fail',
      error: `Simulation of TS BNGL failed: ${e?.message || e}`,
      simulateTime: performance.now() - simStart,
    };
  }
  result.simulateTime = performance.now() - simStart;

  // ── Step 4: Get reference time-course ──
  let refTimeCourse: Map<string, number[]>;
  try {
    const refBngl = await loadReferenceBngl(biomodelNumber, options.referenceBnglDir, options.referenceGitingestPath);
    if (!refBngl) {
      return { ...result, status: 'compare_fail', error: 'No reference BNGL available' };
    }
    const refSbml = await options.bnglToSbmlFn(refBngl);
    refTimeCourse = await options.simulateSbmlFn(refSbml, `bmd${String(biomodelNumber).padStart(10, '0')}_ref`);
  } catch (e: any) {
    return { ...result, status: 'compare_fail', error: `Reference simulation failed: ${e?.message || e}` };
  }

  // ── Step 5: Compare ──
  const comparison = compareTimeCourses(tsTimeCourse, refTimeCourse, options.tolerance);
  result.validationRatio = comparison.validationRatio;
  result.rmse = comparison.medianRmse;
  result.observablesCompared = comparison.totalCompared;
  result.observablesMatched = comparison.totalMatched;

  if (comparison.validationRatio >= 0.9) {
    result.status = 'parity_pass';
  } else {
    result.status = 'parity_fail';
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Time-Course Comparison (from copasi.py logic)
// ─────────────────────────────────────────────────────────────────────────────

interface ComparisonResult {
  validationRatio: number;
  medianRmse: number;
  totalCompared: number;
  totalMatched: number;
  perObservable: Map<string, { rmse: number; matched: boolean }>;
}

function compareTimeCourses(
  ts: Map<string, number[]>,
  ref: Map<string, number[]>,
  tolerance: number
): ComparisonResult {
  const perObs = new Map<string, { rmse: number; matched: boolean }>();
  const rmseValues: number[] = [];
  let matched = 0;
  let compared = 0;

  // Find common observables (normalize names for comparison)
  const tsNorm = new Map<string, number[]>();
  for (const [k, v] of ts) {
    tsNorm.set(normalizeName(k), v);
  }
  const refNorm = new Map<string, number[]>();
  for (const [k, v] of ref) {
    refNorm.set(normalizeName(k), v);
  }

  for (const [name, refValues] of refNorm) {
    const tsValues = tsNorm.get(name);
    if (!tsValues) continue;

    // Ensure same length (truncate to shorter)
    const len = Math.min(tsValues.length, refValues.length);
    if (len === 0) continue;

    // Skip if both are zero throughout
    const refMax = Math.max(...refValues.slice(0, len).map(Math.abs));
    const tsMax = Math.max(...tsValues.slice(0, len).map(Math.abs));
    if (refMax < 1e-15 && tsMax < 1e-15) {
      perObs.set(name, { rmse: 0, matched: true });
      matched++;
      compared++;
      continue;
    }

    // RMSE
    let sumSq = 0;
    for (let i = 0; i < len; i++) {
      const diff = tsValues[i] - refValues[i];
      sumSq += diff * diff;
    }
    const rmse = Math.sqrt(sumSq / len);
    rmseValues.push(rmse);

    const isMatch = rmse < tolerance || (refMax > 0 && rmse / refMax < 0.01);
    perObs.set(name, { rmse, matched: isMatch });

    if (isMatch) matched++;
    compared++;
  }

  // Median RMSE
  rmseValues.sort((a, b) => a - b);
  const medianRmse = rmseValues.length > 0
    ? rmseValues[Math.floor(rmseValues.length / 2)]
    : 0;

  return {
    validationRatio: compared > 0 ? matched / compared : 0,
    medianRmse,
    totalCompared: compared,
    totalMatched: matched,
    perObservable: perObs,
  };
}

function normalizeName(name: string): string {
  return name
    .replace(/^#\s*/, '')
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
    .toLowerCase()
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Report Generation
// ─────────────────────────────────────────────────────────────────────────────

function generateReport(results: ModelResult[]): ValidationReport {
  const tested = results.filter(r => !r.status.startsWith('skip'));
  const skipped = results.filter(r => r.status.startsWith('skip'));

  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    totalModels: results.length,
    tested: tested.length,
    skipped: skipped.length,
    atomizeFails: tested.filter(r => r.status === 'atomize_fail').length,
    simulateFails: tested.filter(r => r.status === 'simulate_fail').length,
    parityPass: tested.filter(r => r.status === 'parity_pass').length,
    parityFail: tested.filter(r => r.status === 'parity_fail').length,
    exactMatch: tested.filter(r => r.validationRatio === 1.0).length,
    highVR: tested.filter(r => (r.validationRatio || 0) >= 0.9).length,
    results,
  };

  return report;
}

function printReport(report: ValidationReport): void {
  console.log('\n' + '='.repeat(60));
  console.log('ATOMIZER VALIDATION REPORT');
  console.log('='.repeat(60));
  console.log(`Timestamp:        ${report.timestamp}`);
  console.log(`Total models:     ${report.totalModels}`);
  console.log(`Skipped:          ${report.skipped} (known issues / too long)`);
  console.log(`Tested:           ${report.tested}`);
  console.log('--------------------------------');
  console.log(`Atomize fails:    ${report.atomizeFails}`);
  console.log(`Simulate fails:   ${report.simulateFails}`);
  console.log(`Parity pass:      ${report.parityPass}`);
  console.log(`Parity fail:      ${report.parityFail}`);
  console.log('--------------------------------');
  console.log(`Exact match:      ${report.exactMatch} (${(report.exactMatch / Math.max(report.tested, 1) * 100).toFixed(1)}%)`);
  console.log(`High VR (>=90%):  ${report.highVR} (${(report.highVR / Math.max(report.tested, 1) * 100).toFixed(1)}%)`);
  console.log('='.repeat(60));

  // Print failures
  const failures = report.results.filter(r =>
    r.status === 'atomize_fail' || r.status === 'simulate_fail' || r.status === 'parity_fail'
  );
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    for (const f of failures) {
      console.log(`  BMD ${String(f.biomodelId).padStart(4, '0')}  ${f.status}  ${f.error || ''}`);
      if (f.validationRatio !== undefined) {
        console.log(`    VR=${(f.validationRatio * 100).toFixed(1)}%  RMSE=${f.rmse?.toExponential(2)}  obs=${f.observablesMatched}/${f.observablesCompared}`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Runner
// ─────────────────────────────────────────────────────────────────────────────

interface RunOptions {
  models?: number[];         // Specific model numbers, or all if undefined
  maxModels?: number;        // Cap on how many to run
  referenceBnglDir?: string; // Path to atomized_translations/
  referenceGitingestPath?: string; // Path to gitingested AtomizerLives snapshot
  tolerance?: number;        // RMSE tolerance for "match"
  concurrency?: number;      // How many models to test in parallel
  keepTemp?: boolean;        // Keep temp dirs from BNG2 runs
  tempRoot?: string;         // Temp dir root
  bng2Path?: string;         // Optional override for BNG2.pl path
  perlCmd?: string;          // Optional override for perl executable
}

async function runValidation(opts: RunOptions): Promise<ValidationReport> {
  const {
    maxModels = 1017,
    referenceBnglDir,
    referenceGitingestPath,
    tolerance = 1e-3,
    concurrency = 1,
    keepTemp = false,
    tempRoot,
    bng2Path,
    perlCmd,
  } = opts;

  // Build model list
  const modelNumbers = opts.models
    || Array.from({ length: maxModels }, (_, i) => i + 1);

  console.log(`\nStarting validation of ${modelNumbers.length} models...\n`);

  ensureLibsbmlShim();

  let resolvedGitingest = referenceGitingestPath;
  if (!resolvedGitingest) {
    const defaultPath = path.resolve('full_atomizer_testing_framework.txt');
    try {
      await fs.access(defaultPath);
      resolvedGitingest = defaultPath;
    } catch {
      resolvedGitingest = undefined;
    }
  }

  const atomizer = new Atomizer();
  await atomizer.initialize();
  let atomizeChain = Promise.resolve();

  const atomizeFn = async (sbmlXml: string): Promise<string> => {
    const run = atomizeChain.then(async () => {
      const result = await atomizer.atomize(sbmlXml);
      if (!result.success) {
        throw new Error(result.error || 'Atomizer failed');
      }
      return result.bngl;
    });
    atomizeChain = run.then(() => undefined, () => undefined);
    return run;
  };

  const bnglToSbmlFn = async (bngl: string): Promise<string> => bnglToSbml(bngl);
  const simulateSbmlFn = async (sbml: string, label: string): Promise<Map<string, number[]>> =>
    simulateSbmlWithBng2(sbml, {
      modelName: label,
      keepTemp,
      tempRoot,
      bng2Path,
      perlCmd,
    });

  // Run models
  const results: ModelResult[] = [];
  for (let i = 0; i < modelNumbers.length; i += concurrency) {
    const batch = modelNumbers.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(n => validateModel(n, {
        referenceBnglDir,
        referenceGitingestPath: resolvedGitingest,
        atomizeFn,
        bnglToSbmlFn,
        simulateSbmlFn,
        tolerance,
      }))
    );

    for (const r of batchResults) {
      results.push(r);
      const label = r.status === 'parity_pass'
        ? 'PASS'
        : r.status.startsWith('skip')
          ? 'SKIP'
          : 'FAIL';
      const vrStr = r.validationRatio !== undefined
        ? ` VR=${(r.validationRatio * 100).toFixed(0)}%`
        : '';
      console.log(`  ${label} BMD ${String(r.biomodelId).padStart(4, '0')}  ${r.status}${vrStr}`);
    }
  }

  const report = generateReport(results);
  printReport(report);

  // Save JSON report
  const reportPath = `atomizer_validation_${new Date().toISOString().slice(0, 10)}.json`;
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nReport saved to ${reportPath}`);

  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);

  const opts: RunOptions = {
    tolerance: 1e-3,
    concurrency: 1,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--models' && args[i + 1]) {
      opts.models = args[i + 1].split(',').map(Number);
      i++;
    } else if (args[i] === '--quick') {
      opts.maxModels = 50;
    } else if (args[i] === '--ref-dir' && args[i + 1]) {
      opts.referenceBnglDir = args[i + 1];
      i++;
    } else if (args[i] === '--ref-gitingest' && args[i + 1]) {
      opts.referenceGitingestPath = args[i + 1];
      i++;
    } else if (args[i] === '--tolerance' && args[i + 1]) {
      opts.tolerance = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--concurrency' && args[i + 1]) {
      opts.concurrency = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--keep-temp') {
      opts.keepTemp = true;
    } else if (args[i] === '--temp-root' && args[i + 1]) {
      opts.tempRoot = args[i + 1];
      i++;
    } else if (args[i] === '--bng2' && args[i + 1]) {
      opts.bng2Path = args[i + 1];
      i++;
    } else if (args[i] === '--perl' && args[i + 1]) {
      opts.perlCmd = args[i + 1];
      i++;
    }
  }

  runValidation(opts).catch(console.error);
}

export {
  validateModel,
  runValidation,
  fetchSBML,
  compareTimeCourses,
  generateReport,
  printReport,
  KNOWN_ISSUES,
  TOO_LONG,
  type ModelResult,
  type ValidationReport,
  type RunOptions,
};
