/**
 * generate_paper_parity_data.ts
 *
 * Reads the parity layer report from the deterministic CI run,
 * computes summary statistics, and writes paper-ready artifacts:
 *   - parity_summary.json
 *   - parity_table.tex
 *   - fig7_validation_scatter.json
 *   - fig8_benchmark_timings.json
 *   - parity_results_text.md
 *
 * Usage:
 *   npx tsx scripts/analysis/generate_paper_parity_data.ts [--report path/to/report.json]
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Types matching layered_parity_check.ts output ──────────────────────────

interface TrajectoryDiff {
  observable: string;
  maxRelErr: number;
  maxAbsErr: number;
  firstBadTime: number;
  tier: 'pass' | 'fp_drift' | 'derivative_bug' | 'major';
}

interface LayeredReport {
  model: string;
  simulationMethod: string;
  parameterDiffs: Array<{ name: string; bng2: number; web: number; relErr: number }>;
  speciesDiffs: Array<{ kind: string; name: string }>;
  reactionDiffs: Array<{ kind: string; signature: string; relErr?: number }>;
  groupDiffs: Array<{ kind: string; name: string }>;
  cdatDiffs: TrajectoryDiff[];
  gdatDiffs: TrajectoryDiff[];
  netFilesCompared: boolean;
  cdatFilesCompared: boolean;
  gdatFilesCompared: boolean;
  cdatComparable: boolean;
  gdatComparable: boolean;
  rootCause: string;
  firstDivergingLayer: string;
  summary: string;
  timing?: {
    parseMs?: number;
    networkGenMs?: number;
    simulateMs?: number;
    totalMs?: number;
  };
  speciesCount?: number;
  reactionCount?: number;
}

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let reportPath = path.resolve('artifacts/parity_layer_report.deterministic.json');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--report' && args[i + 1]) {
    reportPath = path.resolve(args[i + 1]);
    i++;
  }
}

// ── Load and merge reports ─────────────────────────────────────────────────

function loadReports(): LayeredReport[] {
  if (fs.existsSync(reportPath)) {
    return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  }
  // Try shard files
  const dir = path.dirname(reportPath);
  const shardFiles = fs.readdirSync(dir).filter(f => f.match(/parity.*shard.*\.json$/));
  if (shardFiles.length === 0) {
    console.error(`No parity report found at ${reportPath} and no shard files found.`);
    process.exit(1);
  }
  const merged: LayeredReport[] = [];
  for (const f of shardFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    merged.push(...data);
  }
  // Deduplicate by model name
  const seen = new Set<string>();
  return merged.filter(r => {
    if (seen.has(r.model)) return false;
    seen.add(r.model);
    return true;
  });
}

const reports = loadReports();
console.log(`Loaded ${reports.length} model reports from ${reportPath}`);

// ── Classify models ────────────────────────────────────────────────────────

const odeModels = reports.filter(r => r.simulationMethod === 'ode' || r.simulationMethod === 'unspecified');
const nfModels = reports.filter(r => r.simulationMethod === 'nfsim' || r.simulationMethod === 'nf');
const ssaModels = reports.filter(r => r.simulationMethod === 'ssa');

const passingModels = reports.filter(r => r.rootCause === 'pass');
const thresholdOnly = reports.filter(r => r.rootCause === 'threshold_only');
const failedModels = reports.filter(r => r.rootCause !== 'pass' && r.rootCause !== 'threshold_only' && r.rootCause !== 'unknown');
const unknownModels = reports.filter(r => r.rootCause === 'unknown');

// Models with GDAT comparison data (for scatter plot)
const gdatComparableModels = reports.filter(r => r.gdatComparable && r.gdatDiffs.length > 0);

// ── Compute summary statistics ─────────────────────────────────────────────

function maxRelErrForModel(r: LayeredReport): number {
  const allDiffs = [...r.gdatDiffs, ...r.cdatDiffs];
  if (allDiffs.length === 0) return 0;
  return Math.max(...allDiffs.map(d => d.maxRelErr));
}

const passingRelErrors = [...passingModels, ...thresholdOnly].map(maxRelErrForModel).filter(e => e > 0);
const meanRelErr = passingRelErrors.length > 0
  ? passingRelErrors.reduce((a, b) => a + b, 0) / passingRelErrors.length
  : 0;
const maxRelErr = passingRelErrors.length > 0 ? Math.max(...passingRelErrors) : 0;
const medianRelErr = passingRelErrors.length > 0
  ? passingRelErrors.sort((a, b) => a - b)[Math.floor(passingRelErrors.length / 2)]
  : 0;

// Root cause breakdown
const rootCauseCounts: Record<string, number> = {};
for (const r of reports) {
  rootCauseCounts[r.rootCause] = (rootCauseCounts[r.rootCause] || 0) + 1;
}

// ── Build summary JSON ─────────────────────────────────────────────────────

const outDir = path.resolve('artifacts/paper');
fs.mkdirSync(outDir, { recursive: true });

const summary = {
  totalModels: reports.length,
  odeModels: odeModels.length,
  nfModels: nfModels.length,
  ssaModels: ssaModels.length,
  passing: passingModels.length,
  thresholdOnly: thresholdOnly.length,
  failed: failedModels.length,
  unknown: unknownModels.length,
  passRate: ((passingModels.length + thresholdOnly.length) / reports.length * 100).toFixed(1) + '%',
  gdatComparable: gdatComparableModels.length,
  meanRelativeError: meanRelErr,
  medianRelativeError: medianRelErr,
  maxRelativeError: maxRelErr,
  rootCauseCounts,
  failedModelDetails: failedModels.map(r => ({
    model: r.model,
    rootCause: r.rootCause,
    firstDivergingLayer: r.firstDivergingLayer,
    maxRelErr: maxRelErrForModel(r),
  })),
  unknownModelDetails: unknownModels.map(r => ({
    model: r.model,
    rootCause: r.rootCause,
    gdatComparable: r.gdatComparable,
    cdatComparable: r.cdatComparable,
  })),
};

fs.writeFileSync(
  path.join(outDir, 'parity_summary.json'),
  JSON.stringify(summary, null, 2)
);
console.log(`Wrote parity_summary.json (${reports.length} models)`);

// ── Build LaTeX table ──────────────────────────────────────────────────────

function formatSci(n: number): string {
  if (n === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(n)));
  const mantissa = n / Math.pow(10, exp);
  return `$${mantissa.toFixed(1)} \\times 10^{${exp}}$`;
}

const passCount = passingModels.length + thresholdOnly.length;
const passRateStr = (passCount / reports.length * 100).toFixed(1);
const latex = `\\begin{table}[h]
\\centering
\\caption{Parity validation of the BioNetGen Playground against BNG2.pl across RuleHub models.}
\\label{tab:parity}
\\begin{tabular}{lrrr}
\\hline
Category & Models & Pass Rate & Max Rel.\\ Error \\\\
\\hline
Total tested & ${reports.length} & ${passRateStr}\\% & --- \\\\
Passing (exact) & ${passingModels.length} & --- & ${passingModels.length > 0 ? formatSci(Math.max(...passingModels.map(maxRelErrForModel).filter(e => e > 0), 0)) : '0'} \\\\
Passing (threshold) & ${thresholdOnly.length} & --- & ${thresholdOnly.length > 0 ? formatSci(Math.max(...thresholdOnly.map(maxRelErrForModel))) : '---'} \\\\
Diagnosed failures & ${failedModels.length} & --- & --- \\\\
Unclassified & ${unknownModels.length} & --- & --- \\\\
\\hline
\\end{tabular}
\\end{table}
`;

fs.writeFileSync(path.join(outDir, 'parity_table.tex'), latex);
console.log('Wrote parity_table.tex');

// ── Build Figure 7: Validation Scatter Data ────────────────────────────────

interface ScatterPoint {
  x: number;  // BNG2.pl value (reference)
  y: number;  // Playground value
  model: string;
  observable: string;
}

const scatterPoints: ScatterPoint[] = [];

// For models with GDAT comparison, extract the observable values.
// The gdatDiffs tell us the error but not the actual values.
// We reconstruct: if maxAbsErr is tiny, both values are approximately equal.
// For the scatter plot, we use: y ≈ x + absErr (worst case).
// Better approach: read the actual gdat files if available.
// For now, use a synthetic approach based on the error data.

// Actually, to get real scatter data we need the actual simulation outputs.
// Let's create a script that can be run separately to generate real data.
// For now, create the data structure from available info.

for (const r of gdatComparableModels) {
  if (r.rootCause !== 'pass' && r.rootCause !== 'threshold_only') continue;
  for (const diff of r.gdatDiffs) {
    // We don't have the actual values in the report, only errors.
    // Store the error info - the figure generation script should read
    // actual gdat files. For now, record what we have.
    scatterPoints.push({
      x: 0,  // Placeholder - requires actual gdat file reading
      y: 0,
      model: r.model,
      observable: diff.observable,
    });
  }
}

// Write scatter data skeleton with metadata
const scatterData = {
  xlabel: 'BNG2.pl observable value',
  ylabel: 'Playground observable value',
  note: 'Run generate_scatter_data.ts to populate actual x/y values from gdat files',
  nModels: gdatComparableModels.filter(r => r.rootCause === 'pass' || r.rootCause === 'threshold_only').length,
  nObservables: scatterPoints.length,
  errorSummary: {
    meanAbsErr: gdatComparableModels
      .flatMap(r => r.gdatDiffs)
      .reduce((s, d) => s + d.maxAbsErr, 0) / Math.max(1, gdatComparableModels.flatMap(r => r.gdatDiffs).length),
    maxAbsErr: Math.max(...gdatComparableModels.flatMap(r => r.gdatDiffs).map(d => d.maxAbsErr), 0),
    maxRelErr: Math.max(...gdatComparableModels.flatMap(r => r.gdatDiffs).map(d => d.maxRelErr), 0),
  },
  points: scatterPoints,
};

fs.writeFileSync(
  path.join(outDir, 'fig7_validation_scatter.json'),
  JSON.stringify(scatterData, null, 2)
);
console.log(`Wrote fig7_validation_scatter.json (${scatterPoints.length} points from ${scatterData.nModels} models)`);

// ── Build Figure 8: Benchmark Timings Data ─────────────────────────────────

// Select representative models across size ranges
const sizeCategories = {
  small: [] as LayeredReport[],
  medium: [] as LayeredReport[],
  large: [] as LayeredReport[],
};

for (const r of reports) {
  if (r.rootCause !== 'pass' && r.rootCause !== 'threshold_only') continue;
  const nSpecies = r.speciesCount ?? r.speciesDiffs?.length ?? 0;
  const nRxns = r.reactionCount ?? r.reactionDiffs?.length ?? 0;
  const size = Math.max(nSpecies, nRxns);
  if (size > 0 && size < 20) sizeCategories.small.push(r);
  else if (size >= 20 && size < 200) sizeCategories.medium.push(r);
  else if (size >= 200) sizeCategories.large.push(r);
}

// Pick up to 5 from each category
function pickRepresentative(models: LayeredReport[], n: number): LayeredReport[] {
  if (models.length <= n) return models;
  const step = Math.floor(models.length / n);
  return Array.from({ length: n }, (_, i) => models[i * step]);
}

const benchmarkModels = [
  ...pickRepresentative(sizeCategories.small, 5),
  ...pickRepresentative(sizeCategories.medium, 5),
  ...pickRepresentative(sizeCategories.large, 5),
];

const benchmarkData = {
  note: 'Timing data requires instrumented parity run. Add --timing flag to run_deterministic_parity_ci.mjs',
  models: benchmarkModels.map(r => ({
    name: r.model,
    speciesCount: r.speciesCount ?? null,
    reactionCount: r.reactionCount ?? null,
    playgroundMs: r.timing ?? { total: null },
    bng2Ms: { total: null },
  })),
};

fs.writeFileSync(
  path.join(outDir, 'fig8_benchmark_timings.json'),
  JSON.stringify(benchmarkData, null, 2)
);
console.log(`Wrote fig8_benchmark_timings.json (${benchmarkModels.length} models)`);

// ── Build Results Text ─────────────────────────────────────────────────────

const resultsText = `## Parity Validation Results

We tested the BioNetGen Playground engine against BNG2.pl reference outputs across ${reports.length} models from the RuleHub repository.

**Overall pass rate: ${passRateStr}%** (${passCount}/${reports.length} models).

- **${passingModels.length} models** passed with exact agreement (relative error < 1e-10)
- **${thresholdOnly.length} models** passed within solver tolerance (relative error < 1e-2, classified as floating-point drift)
- **${unknownModels.length} models** could not be compared (missing reference data or incompatible simulation method)
${failedModels.length > 0 ? `- **${failedModels.length} models** showed diagnosed failures:
${failedModels.map(r => `  - \`${r.model}\`: ${r.rootCause} (max relative error: ${maxRelErrForModel(r).toExponential(2)})`).join('\n')}` : '- **0 models** showed diagnosed failures'}

Among passing models:
- Mean relative error: ${meanRelErr.toExponential(2)}
- Median relative error: ${medianRelErr.toExponential(2)}
- Maximum relative error: ${maxRelErr.toExponential(2)}

Root cause classification:
${Object.entries(rootCauseCounts).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
`;

fs.writeFileSync(path.join(outDir, 'parity_results_text.md'), resultsText);
console.log('Wrote parity_results_text.md');

console.log('\nDone. Paper artifacts written to artifacts/paper/');
