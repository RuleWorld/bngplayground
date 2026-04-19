#!/usr/bin/env tsx
/// <reference types="node" />
/**
 * scripts/analysis/generate_table2.ts
 *
 * Consumes artifacts/paper/rulehub_sweep.json (output of
 * scripts/rulehub-diagnostic-sweep.ts) and emits:
 *
 *   artifacts/paper/table2.tex             — LaTeX table 2 for the paper
 *   artifacts/paper/table2_data.json       — machine-readable snapshot
 *   artifacts/paper/rulehub_failures.tex   — optional supplementary table
 *                                            listing every failed model
 *                                            with its first error, for S2
 *
 * Usage:
 *   npx tsx scripts/analysis/generate_table2.ts
 *   npx tsx scripts/analysis/generate_table2.ts --input path/to/sweep.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';

interface DiagnosticResult {
  model: string;
  parseSuccess: boolean;
  moleculeTypes: number;
  reactionRules: number;
  species: number;
  parameters: number;
  observables: number;
  stiffness: { category: string; ratio: number };
  warnings: string[];
  errors: string[];
}

// ── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { input: string; outDir: string } {
  let input = 'artifacts/paper/rulehub_sweep.json';
  let outDir = 'artifacts/paper';
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--input' || argv[i] === '-i') input = argv[++i];
    else if (argv[i] === '--output-dir' || argv[i] === '-o') outDir = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log(`usage: ${basename(argv[1])} [--input FILE] [--output-dir DIR]`);
      process.exit(0);
    }
  }
  return { input, outDir };
}

// ── Analysis ───────────────────────────────────────────────────────────────

interface Summary {
  total: number;
  parsed: number;
  validated: number;
  warned: number;
  byRuleCount: Record<string, number>;
  stiffnessBuckets: Record<string, number>;
  failureModes: Record<string, number>;
  percentiles: { rules: Percentiles; species: Percentiles; observables: Percentiles };
}

interface Percentiles {
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  max: number;
}

function analyze(results: DiagnosticResult[]): Summary {
  const total = results.length;
  const parsed = results.filter((r) => r.parseSuccess).length;
  const validated = results.filter((r) => r.parseSuccess && r.errors.length === 0).length;
  const warned = results.filter((r) => r.parseSuccess && r.warnings.length > 0).length;

  const byRuleCount = {
    small: results.filter((r) => r.parseSuccess && r.reactionRules <= 10).length,
    medium: results.filter((r) => r.parseSuccess && r.reactionRules > 10 && r.reactionRules <= 50).length,
    large: results.filter((r) => r.parseSuccess && r.reactionRules > 50 && r.reactionRules <= 500).length,
    xlarge: results.filter((r) => r.parseSuccess && r.reactionRules > 500).length,
  };

  const stiffnessBuckets: Record<string, number> = {};
  for (const r of results) {
    if (!r.parseSuccess) continue;
    const cat = r.stiffness.category || 'unknown';
    stiffnessBuckets[cat] = (stiffnessBuckets[cat] ?? 0) + 1;
  }

  const failureModes: Record<string, number> = {};
  for (const r of results) {
    if (r.parseSuccess && r.errors.length === 0) continue;
    const firstErr = r.errors[0] ?? 'unknown';
    const bucket = categorizeError(firstErr);
    failureModes[bucket] = (failureModes[bucket] ?? 0) + 1;
  }

  const parsedResults = results.filter((r) => r.parseSuccess);
  const percentiles = {
    rules: percentiles1(parsedResults.map((r) => r.reactionRules)),
    species: percentiles1(parsedResults.map((r) => r.species)),
    observables: percentiles1(parsedResults.map((r) => r.observables)),
  };

  return {
    total, parsed, validated, warned,
    byRuleCount, stiffnessBuckets, failureModes,
    percentiles,
  };
}

function categorizeError(msg: string): string {
  const m = msg.toLowerCase();
  // Order matters — check most specific first.
  if (/functional rate|local function|rate function|inline function/.test(m)) return 'functional_rate';
  if (/compartment|volume|cBNGL|cbngl/.test(m)) return 'compartment';
  if (/molecule type|molecule_type|moleculetype/.test(m)) return 'molecule_type';
  if (/observable|observables/.test(m)) return 'observable';
  if (/seed species|initial|species/.test(m)) return 'species';
  if (/reaction rule|rule|<->|->/.test(m)) return 'reaction_rule';
  if (/undefined|unknown|not declared|not found|missing/.test(m)) return 'undefined_reference';
  if (/syntax|parse|unexpected|expected|invalid|malformed/.test(m)) return 'syntax';
  if (/action|generate_network|simulate|writeNetwork/.test(m)) return 'action_block';
  if (/unsupported|not supported|not implemented/.test(m)) return 'unsupported_feature';
  return 'other';
}

function percentiles1(xs: number[]): Percentiles {
  if (xs.length === 0) return { p50: 0, p75: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...xs].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { p50: at(0.50), p75: at(0.75), p95: at(0.95), p99: at(0.99), max: sorted[sorted.length - 1] };
}

// ── LaTeX output ──────────────────────────────────────────────────────────

function toTable2Tex(s: Summary): string {
  const pct = (a: number, b: number) => b === 0 ? '—' : ((a / b) * 100).toFixed(1);

  const stiffnessRows = Object.entries(s.stiffnessBuckets)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `\\quad ${escapeTex(k)} & ${v} (${pct(v, s.parsed)}\\%) \\\\`)
    .join('\n');

  return `% Auto-generated by scripts/analysis/generate_table2.ts
% Do not edit by hand.
\\begin{table}[h]
\\centering
\\caption{Coverage of BNG Playground over the RuleHub model collection (n = ${s.total} models). Parse rate is the fraction of \\texttt{.bngl} files that parse cleanly through the ANTLR4 grammar; validation rate is the fraction that additionally produce no structural errors (e.g.\\,unresolved references, undeclared molecule types). Stiffness category is the engine's built-in classification based on rate-constant span. Full per-model breakdown is in Supplementary Table~S2.}
\\label{tab:rulehub-coverage}
\\begin{tabular}{lr}
\\toprule
Metric & Count \\\\
\\midrule
Total models                         & ${s.total} \\\\
Parsed successfully                  & ${s.parsed} (${pct(s.parsed, s.total)}\\%) \\\\
Validated without errors             & ${s.validated} (${pct(s.validated, s.total)}\\%) \\\\
Parsed with warnings                 & ${s.warned} \\\\
\\midrule
\\multicolumn{2}{l}{\\textit{Model size (reaction rules, parsed models only)}} \\\\
\\quad Small ($\\leq 10$ rules)        & ${s.byRuleCount.small} \\\\
\\quad Medium (11--50 rules)          & ${s.byRuleCount.medium} \\\\
\\quad Large (51--500 rules)          & ${s.byRuleCount.large} \\\\
\\quad Extra-large ($>500$ rules)     & ${s.byRuleCount.xlarge} \\\\
\\quad Rules, median / p95 / max      & ${s.percentiles.rules.p50} / ${s.percentiles.rules.p95} / ${s.percentiles.rules.max} \\\\
\\midrule
\\multicolumn{2}{l}{\\textit{Stiffness category distribution}} \\\\
${stiffnessRows}
\\bottomrule
\\end{tabular}
\\end{table}
`;
}

function toFailureTex(failureModes: Record<string, number>, failedResults: DiagnosticResult[]): string {
  const sortedModes = Object.entries(failureModes).sort((a, b) => b[1] - a[1]);
  const total = sortedModes.reduce((s, [, v]) => s + v, 0);
  const modeRows = sortedModes.map(([k, v]) =>
    `  ${escapeTex(k)} & ${v} (${((v / total) * 100).toFixed(1)}\\%) \\\\`,
  ).join('\n');

  const failureList = failedResults
    .slice(0, 50)  // cap for supplementary — full list in JSON
    .map((r) => {
      const errMsg = r.errors[0] ?? 'unknown';
      return `  ${escapeTex(r.model)} & ${escapeTex(errMsg.slice(0, 100))} \\\\`;
    })
    .join('\n');

  return `% Auto-generated by scripts/analysis/generate_table2.ts
\\begin{table}[h]
\\centering
\\caption{Supplementary Table S2: Failure-mode distribution across RuleHub models that did not parse or validate cleanly. The 'other' bucket contains messages that did not match any of the more specific patterns in \\texttt{categorizeError()}; these are the highest-priority candidates for future parser improvement.}
\\label{tab:rulehub-failure-modes}
\\begin{tabular}{lr}
\\toprule
Failure mode & Count \\\\
\\midrule
${modeRows}
\\bottomrule
\\end{tabular}
\\end{table}

\\begin{table}[h]
\\centering
\\caption{Supplementary Table S3: Per-model first-error summary (first ${Math.min(50, failedResults.length)} of ${failedResults.length} failed models shown; full list in \\texttt{artifacts/paper/table2\\_data.json}).}
\\label{tab:rulehub-failure-models}
\\begin{tabular}{p{5cm}p{8cm}}
\\toprule
Model & First error (truncated to 100 chars) \\\\
\\midrule
${failureList}
\\bottomrule
\\end{tabular}
\\end{table}
`;
}

function escapeTex(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/#/g, '\\#')
    .replace(/\$/g, '\\$')
    .replace(/\^/g, '\\^{}')
    .replace(/~/g, '\\~{}');
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  const { input, outDir } = parseArgs(process.argv);
  const inputPath = resolve(input);

  const parsed = (() => {
    try {
      return JSON.parse(readFileSync(inputPath, 'utf8'));
    } catch (e) {
      console.error(`Cannot read ${inputPath}: ${String(e)}`);
      console.error(`Run scripts/rulehub-diagnostic-sweep.ts first to generate it.`);
      process.exit(1);
    }
  })();

  if (!Array.isArray(parsed)) {
    console.error(`${inputPath} is not a JSON array of DiagnosticResult`);
    process.exit(1);
  }

  const raw = parsed as DiagnosticResult[];

  const summary = analyze(raw);
  const failedResults = raw.filter((r) => !r.parseSuccess || r.errors.length > 0);

  mkdirSync(outDir, { recursive: true });
  const table2Path = join(outDir, 'table2.tex');
  const dataPath = join(outDir, 'table2_data.json');
  const failuresPath = join(outDir, 'rulehub_failures.tex');

  writeFileSync(table2Path, toTable2Tex(summary));
  writeFileSync(dataPath, JSON.stringify({
    ...summary,
    generatedAt: new Date().toISOString(),
    inputFile: inputPath,
    failedModels: failedResults.map((r) => ({ model: r.model, firstError: r.errors[0] ?? 'warning-only' })),
  }, null, 2));
  writeFileSync(failuresPath, toFailureTex(summary.failureModes, failedResults));

  const pct = (a: number, b: number) => ((a / b) * 100).toFixed(1);
  console.log(`wrote ${table2Path}`);
  console.log(`wrote ${dataPath}`);
  console.log(`wrote ${failuresPath}`);
  console.log();
  console.log(`parse rate:     ${pct(summary.parsed, summary.total)}% (${summary.parsed}/${summary.total})`);
  console.log(`validation:     ${pct(summary.validated, summary.total)}% (${summary.validated}/${summary.total})`);
  console.log(`warnings:       ${summary.warned} models`);
  console.log();
  console.log('top failure modes:');
  for (const [mode, count] of Object.entries(summary.failureModes).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    console.log(`  ${mode.padEnd(24)} ${count}`);
  }
}

main();
