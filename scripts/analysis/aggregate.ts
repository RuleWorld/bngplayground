#!/usr/bin/env tsx
/**
 * benchmarks/harness/aggregate.ts
 *
 * Aggregate raw CSVs from run_bngplayground.ts and run_bng2.sh into paper artifacts.
 *
 * Inputs:
 *   benchmarks/results/bngplayground_raw.csv   (from run_bngplayground.ts)
 *   benchmarks/results/bng2_raw.csv             (from run_bng2.sh)
 *   benchmarks/results/hardware.json            (from hardware_fingerprint.sh)
 *
 * Outputs:
 *   benchmarks/results/aggregated.json
 *   artifacts/paper/table3.tex
 *   artifacts/paper/fig8_data.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── Parse CSV ──────────────────────────────────────────────────────────────

interface BngpRow {
  model: string;
  stage: 'parse' | 'netgen' | 'simulate_ode' | 'simulate_ssa';
  rep: number;
  wallMs: number;
  success: boolean;
  species: number | null;
  reactions: number | null;
  notes: string;
}

interface Bng2Row {
  model: string;
  stage: 'parse_netgen' | 'simulate_ode';
  rep: number;
  wallMs: number;
  success: boolean;
  notes: string;
}

function parseCsv<T>(path: string, mapRow: (r: Record<string, string>) => T): T[] {
  if (!existsSync(path)) {
    console.warn(`warning: ${path} does not exist; treating as empty`);
    return [];
  }
  const text = readFileSync(path, 'utf8').trim();
  if (!text) return [];

  const lines = text.split('\n');
  const header = parseCsvLine(lines[0]);
  const out: T[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const rec: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) rec[header[j]] = cells[j] ?? '';
    out.push(mapRow(rec));
  }
  return out;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') {
        out.push(cur);
        cur = '';
      } else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// ── Aggregate ─────────────────────────────────────────────────────────────

interface SummaryRow {
  model: string;
  species: number;
  reactions: number;
  bngPlayground: {
    parseMs: number;
    netgenMs: number;
    simulateOdeMs: number;
    simulateSsaMs: number | null;
    totalOdeMs: number;
  };
  bng2: {
    parseNetgenMs: number | null;
    simulateOdeMs: number | null;
    totalMs: number | null;
  };
  ratioTotal: number | null;        // bngp total / bng2 total — <1 means bngp wins
}

function aggregate(bngp: BngpRow[], bng2: Bng2Row[]): SummaryRow[] {
  const models = new Set<string>(bngp.map((r) => r.model));
  const out: SummaryRow[] = [];

  for (const model of models) {
    const bp = bngp.filter((r) => r.model === model && r.success);
    const b2 = bng2.filter((r) => r.model === model && r.success);

    const bpParse = median(bp.filter((r) => r.stage === 'parse').map((r) => r.wallMs));
    const bpNet = median(bp.filter((r) => r.stage === 'netgen').map((r) => r.wallMs));
    const bpOde = median(bp.filter((r) => r.stage === 'simulate_ode').map((r) => r.wallMs));
    const bpSsaAll = bp.filter((r) => r.stage === 'simulate_ssa').map((r) => r.wallMs);
    const bpSsa = bpSsaAll.length > 0 ? median(bpSsaAll) : null;

    const netgenRow = bp.find((r) => r.stage === 'netgen');
    const species = netgenRow?.species ?? 0;
    const reactions = netgenRow?.reactions ?? 0;

    const b2Pn = median(b2.filter((r) => r.stage === 'parse_netgen').map((r) => r.wallMs));
    const b2Ode = median(b2.filter((r) => r.stage === 'simulate_ode').map((r) => r.wallMs));
    const b2Total = b2Pn > 0 && b2Ode > 0 ? b2Pn + b2Ode : null;

    const bpTotalOde = bpParse + bpNet + bpOde;
    const ratioTotal = b2Total !== null && b2Total > 0 ? bpTotalOde / b2Total : null;

    out.push({
      model,
      species,
      reactions,
      bngPlayground: {
        parseMs: bpParse,
        netgenMs: bpNet,
        simulateOdeMs: bpOde,
        simulateSsaMs: bpSsa,
        totalOdeMs: bpTotalOde,
      },
      bng2: {
        parseNetgenMs: b2Pn || null,
        simulateOdeMs: b2Ode || null,
        totalMs: b2Total,
      },
      ratioTotal,
    });
  }

  // Sort by network size so the paper table reads small-to-large.
  out.sort((a, b) => a.reactions - b.reactions);
  return out;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── LaTeX output ──────────────────────────────────────────────────────────

interface Hardware {
  cpu_model?: string;
  cpu_cores?: number;
  ram_gb?: number;
  os?: string;
  node_version?: string;
  bng2_version?: string;
  timestamp?: string;
}

function toLatex(rows: SummaryRow[], hardware: Hardware): string {
  const hardwareDesc =
    hardware.cpu_model && hardware.ram_gb
      ? `${escapeTex(hardware.cpu_model)} (${hardware.cpu_cores} cores), ${hardware.ram_gb} GiB RAM, ${escapeTex(hardware.os ?? 'unknown OS')}`
      : 'Hardware fingerprint unavailable';

  const header = `% Auto-generated by benchmarks/harness/aggregate.ts
% Do not edit by hand — regenerate by running:
%   benchmarks/harness/hardware_fingerprint.sh
%   npx tsx benchmarks/harness/run_bngplayground.ts
%   benchmarks/harness/run_bng2.sh
%   npx tsx benchmarks/harness/aggregate.ts
\\begin{table}[h]
\\centering
\\caption{End-to-end timing comparison of BNG Playground against BNG2.pl\\,+\\,\\texttt{run\\_network} on a fixed ${rows.length}-model benchmark suite. Each value is the median of 5 runs on the same hardware. BNG Playground runs the in-process TypeScript/WebAssembly engine (same code path as the MCP server in production); BNG2.pl calls the native Perl implementation and \\texttt{run\\_network} the C reference CVODE binary. Ratio column is BNG Playground total / BNG2 total; values below 1.0 favor BNG Playground, above 1.0 favor native. Hardware: ${hardwareDesc}.}
\\label{tab:benchmark-suite}
\\resizebox{\\textwidth}{!}{%
\\begin{tabular}{lrrrrrrrr}
\\toprule
\\multirow{2}{*}{Model} & \\multirow{2}{*}{Species} & \\multirow{2}{*}{Rxns} & \\multicolumn{4}{c}{BNG Playground (ms)} & \\multicolumn{1}{c}{BNG2 (ms)} & \\multirow{2}{*}{Ratio} \\\\
\\cmidrule(lr){4-7}\\cmidrule(lr){8-8}
 & & & Parse & Netgen & Sim ODE & Total & Parse+Net+Sim & \\\\
\\midrule
`;

  const body = rows
    .map((r) => {
      const cells = [
        escapeTex(r.model),
        r.species.toString(),
        r.reactions.toString(),
        r.bngPlayground.parseMs.toFixed(1),
        r.bngPlayground.netgenMs.toFixed(1),
        r.bngPlayground.simulateOdeMs.toFixed(1),
        r.bngPlayground.totalOdeMs.toFixed(1),
        r.bng2.totalMs !== null ? r.bng2.totalMs.toFixed(1) : '---',
        r.ratioTotal !== null ? `${r.ratioTotal.toFixed(2)}$\\times$` : '---',
      ];
      return cells.join(' & ') + ' \\\\';
    })
    .join('\n');

  const validRatios = rows.filter((r) => r.ratioTotal !== null).map((r) => r.ratioTotal as number);
  const medianRatio = validRatios.length > 0 ? median(validRatios) : null;
  const footer = `
\\midrule
\\multicolumn{8}{r}{\\textit{Median ratio across models with native data}} & ${medianRatio !== null ? `${medianRatio.toFixed(2)}$\\times$` : '---'} \\\\
\\bottomrule
\\end{tabular}%
}
\\end{table}
`;

  return header + body + footer;
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
  const bngp = parseCsv<BngpRow>('benchmarks/results/bngplayground_raw.csv', (r) => ({
    model: r.model,
    stage: r.stage as BngpRow['stage'],
    rep: Number(r.rep),
    wallMs: Number(r.wallMs),
    success: r.success === 'true',
    species: r.species ? Number(r.species) : null,
    reactions: r.reactions ? Number(r.reactions) : null,
    notes: r.notes,
  }));

  const bng2 = parseCsv<Bng2Row>('benchmarks/results/bng2_raw.csv', (r) => ({
    model: r.model,
    stage: r.stage as Bng2Row['stage'],
    rep: Number(r.rep),
    wallMs: Number(r.wallMs),
    success: r.success === 'true',
    notes: r.notes,
  }));

  const summary = aggregate(bngp, bng2);

  let hardware: Hardware = {};
  const hwPath = 'benchmarks/results/hardware.json';
  if (existsSync(hwPath)) {
    try { hardware = JSON.parse(readFileSync(hwPath, 'utf8')); } catch { /* non-fatal */ }
  }

  mkdirSync('benchmarks/results', { recursive: true });
  mkdirSync('artifacts/paper', { recursive: true });
  writeFileSync('benchmarks/results/aggregated.json', JSON.stringify(summary, null, 2));
  writeFileSync('artifacts/paper/fig8_data.json', JSON.stringify({ summary, hardware }, null, 2));
  writeFileSync('artifacts/paper/table3.tex', toLatex(summary, hardware));

  const validRatios = summary.filter((r) => r.ratioTotal !== null).map((r) => r.ratioTotal as number);
  const medianRatio = validRatios.length > 0 ? median(validRatios) : null;
  console.log(`wrote ${summary.length} summary rows to benchmarks/results/aggregated.json`);
  console.log(`wrote artifacts/paper/table3.tex`);
  console.log(`wrote artifacts/paper/fig8_data.json`);
  if (medianRatio !== null) {
    console.log(`median ratio (BNG Playground total / BNG2 total): ${medianRatio.toFixed(2)}×`);
  }
}

main();
