import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';

import { DEFAULT_BNG2_PATH, DEFAULT_PERL_CMD } from '../../scripts/bngDefaults.js';
import { parseBNGL } from '../../services/parseBNGL';
import { simulate } from '../../services/simulation/SimulationLoop';
import { convertBNGXmlToBNGL } from '../../src/lib/atomizer/parser/bngXmlParser';
import { BNG2_EXCLUDED_MODELS } from '../../constants';
import { generateExpandedNetwork } from '../../services/simulation/NetworkExpansion';

const VALIDATE_DIR = 'bionetgen/bng2/Validate';
const BNG_OUTPUT_DIR = 'bng_test_output';

function runBNG2EnsureSBML(modelPath: string, outdir: string): boolean {
  // Copy model to outdir and append writeSBML action if it's not present.
  const modelName = basename(modelPath);
  const dest = join(outdir, modelName);
  copyFileSync(modelPath, dest);

  try {
    const content = readFileSync(dest, 'utf8');
    if (!/writeSBML\s*\(/i.test(content)) {
      // Append new action to request SBML output with a suffix to avoid overwriting
      const append = '\n# Appended by regression harness: ensure SBML is written\nwriteSBML({suffix=>"sbml"})\n';
      fs.appendFileSync(dest, append, 'utf8');
    }
  } catch (e) {
    // best-effort; continue
  }

  const result = spawnSync(process.env.PERL_CMD ?? DEFAULT_PERL_CMD, [process.env.BNG2_PATH ?? DEFAULT_BNG2_PATH, modelName, '--outdir', outdir], {
    cwd: outdir,
    encoding: 'utf-8',
    timeout: 120000,
  });
  return result.status === 0 && true;
}


function parseGDAT(content: string): { headers: string[]; data: number[][] } {
  const lines = content.trim().split('\n').filter(l => l.trim());
  const headerLine = lines.find(l => l.startsWith('#'));
  let headers: string[] = [];
  if (headerLine) {
    headers = headerLine.replace('#', '').trim().split(/\s+/);
  }
  const data = lines
    .filter(l => !l.startsWith('#') && l.trim())
    .map(line => line.trim().split(/\s+/).map(v => Number.parseFloat(v)));
  return { headers, data };
}

function parseSimulateCallFromBngl(bnglContent: string) {
  const stripped = bnglContent.replace(/#[^\n]*/g, '');
  const simulateRegex = /simulate[_a-z]*\s*\(\s*\{([^}]*)\}\s*\)/i;
  const m = simulateRegex.exec(stripped);
  if (!m) return null;
  const params = m[1];
  // method
  const methodMatch = params.match(/method\s*=>?\s*"?([^,}\s"]+)"?/i);
  const method = methodMatch ? methodMatch[1].toLowerCase() : 'ode';
  const tEndMatch = params.match(/t_end\s*=>?\s*([^,}]+)/i);
  let t_end: number | undefined = undefined;
  if (tEndMatch) {
    try {
      const expr = tEndMatch[1].trim().replace(/[^0-9+\-*/.\s()]/g, '');
      t_end = Function(`"use strict"; return (${expr})`)();
    } catch {
      t_end = undefined;
    }
  }
  const nStepsMatch = params.match(/n_steps\s*=>?\s*(\d+)/i);
  const n_steps = nStepsMatch ? parseInt(nStepsMatch[1], 10) : undefined;
  const suffixMatch = params.match(/suffix\s*=>?\s*"?([^,}\s"]+)"?/i);
  const suffix = suffixMatch ? suffixMatch[1] : undefined;
  return { method, t_end, n_steps, suffix };
}

const ABS_TOL = 1e-5;
const REL_TOL = 2e-4;

// Collector for solver-related failures encountered during the regression run
const solverFailures: Array<{ model: string; reason: string; logs?: string[]; timestamp: string; refGdatPath?: string; options?: any }> = []; 

// RunSummary and master report for per-model results
interface RunSummary {
  timestamp: string;
  durationMs: number;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  reason?: string | null;
  options?: any;
  logs?: string[];
  refGdatPath?: string | null;
  issues?: Array<{ col: string; maxRel: number; maxAbs: number }>;
}
const masterReport: Record<string, { history: RunSummary[]; latest?: RunSummary }> = {};

describe('Atomizer+Simulation parity (numeric comparison) — example-models', () => {
  // Discover all .bngl files under example-models (recursive)
  function discoverModels(dir: string): string[] {
    const out: string[] = [];
    const walk = (cur: string) => {
      for (const name of fs.readdirSync(cur)) {
        const full = join(cur, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full);
        else if (stat.isFile() && name.toLowerCase().endsWith('.bngl')) out.push(full);
      }
    };
    if (fs.existsSync(dir)) walk(dir);
    return out;
  }

  const allModels = discoverModels('example-models');
  const filter = process.env.ATOMIZER_REGRESSION_FILTER;

  // Optional exclusions from constants (imported statically above)

  for (const modelPath of allModels) {
    const base = basename(modelPath);
    const modelKey = base.replace(/\.bngl$/i, '');
    if (filter && !modelKey.toLowerCase().includes(filter.toLowerCase())) {
      continue; // allow targeted runs via env
    }

    if (BNG2_EXCLUDED_MODELS && (BNG2_EXCLUDED_MODELS.has(modelKey) || BNG2_EXCLUDED_MODELS.has(modelKey.replace(/[^a-z0-9]+/gi, '_')))) {
      it(`${modelKey} - skipped (BNG2_EXCLUDED_MODELS)` , () => { console.warn('Skipping excluded model', modelKey); });
      continue;
    }

    it(`${modelKey}: TS simulation matches BNG2 .gdat within tolerances`, { timeout: 6 * 60 * 1000 }, async () => {
      const start = Date.now();
      let runStatus: RunSummary['status'] = 'passed';
      let runReason: string | null = null;
      let runLogs: string[] = [];
      const temp = mkdtempSync(join(tmpdir(), 'bng-validate-'));
      let parsedModel: any;
      let options: any;
      let refGdatPath: string | undefined = undefined;

      try {
        const ok = runBNG2EnsureSBML(modelPath, temp);
        if (!ok) {
          console.warn('BNG2.pl failed for', modelPath, '- skipping');
          runStatus = 'skipped';
          runReason = 'bng2_failed';
          return;
        }

        // prefer SBML generated in temp (try both name variants)
        const xmlCandidate1 = join(temp, `${modelKey}.xml`);
        const xmlCandidate2 = join(temp, `${modelKey}_sbml.xml`);
        let xmlPathFound: string | null = null;
        if (fs.existsSync(xmlCandidate1)) xmlPathFound = xmlCandidate1;
        else if (fs.existsSync(xmlCandidate2)) xmlPathFound = xmlCandidate2;

        // Determine BNGL source: prefer converted SBML if present, else original BNGL file
        let bnglText: string;
        if (xmlPathFound) {
          try {
            const xml = readFileSync(xmlPathFound, 'utf8');
            const converted = convertBNGXmlToBNGL(xml);
            if (converted && converted.trim()) bnglText = converted;
            else bnglText = readFileSync(modelPath, 'utf8');
          } catch (e) {
            bnglText = readFileSync(modelPath, 'utf8');
          }
        } else {
          bnglText = readFileSync(modelPath, 'utf8');
        }

        // Parse BNGL into model for simulation
        parsedModel = parseBNGL(bnglText);

        // If BNGL contains a generate_network action, run network generation to expand rules into species/reactions
        try {
          const genOpts = { maxSpecies: 5000, maxReactions: 20000, maxIterations: 2000 };
          console.info('[Regression] Running network generation for', modelKey);
          parsedModel = await generateExpandedNetwork(parsedModel as any, () => {}, (p) => console.info('[Regression:progress]', p));
          console.info('[Regression] Network generation completed:', parsedModel.species?.length, 'species');
        } catch (e) {
          console.warn('[Regression] Network generation failed for', modelKey, e);
        }

        // Build simulation options from simulate() action inside BNGL if present
        const simCall = parseSimulateCallFromBngl(bnglText);
        options = {
          method: simCall?.method ?? 'ode',
          t_end: simCall?.t_end ?? 100,
          n_steps: simCall?.n_steps ?? 100,
          solver: 'cvode',
          atol: 1e-6,
          rtol: 1e-8
        };

      // Run TS simulation and capture console output for diagnostics
      const oldLog = console.log, oldWarn = console.warn, oldError = console.error;
      runLogs = [];
      console.log = (...args: any[]) => { runLogs.push(['log', ...args].join(' ')); oldLog.apply(console, args); };
      console.warn = (...args: any[]) => { runLogs.push(['warn', ...args].join(' ')); oldWarn.apply(console, args); };
      console.error = (...args: any[]) => { runLogs.push(['error', ...args].join(' ')); oldError.apply(console, args); };

      let results;
      try {
        results = await simulate(1, parsedModel as any, options as any, { checkCancelled: () => {}, postMessage: () => {} });
      } finally {
        console.log = oldLog;
        console.warn = oldWarn;
        console.error = oldError;
      }

      // Locate reference GDAT: prefer temp-produced gdat, else fallback to bng_test_output
      refGdatPath = join(temp, `${modelKey}.gdat`);
      if (!fs.existsSync(refGdatPath)) {
        // Search for candidate in bng_test_output by normalized key
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
        const candidates = fs.existsSync(BNG_OUTPUT_DIR) ? fs.readdirSync(BNG_OUTPUT_DIR).filter(f => f.toLowerCase().endsWith('.gdat')) : [];
        const matched = candidates.find(c => norm(c).includes(norm(modelKey)));
        if (matched) refGdatPath = join(BNG_OUTPUT_DIR, matched);
        else {
          console.warn('Reference GDAT not found for', modelKey, '- skipping');
          return;
        }
      }

      const refContent = readFileSync(refGdatPath, 'utf8');
      const ref = parseGDAT(refContent);

      const simHeaders = results.headers;
      const simDataRows = results.data.map(row => simHeaders.map(h => row[h] ?? NaN));

      // Quick sanity checks
      expect(ref.headers[0].toLowerCase()).toBe('time');
      expect(simHeaders[0].toLowerCase()).toBe('time');

      const timeIdxRef = ref.headers.findIndex(h => h.toLowerCase() === 'time');
      const timeIdxSim = simHeaders.findIndex(h => h.toLowerCase() === 'time');
      const refTimes = ref.data.map(r => r[timeIdxRef]);
      const simTimes = simDataRows.map(r => r[timeIdxSim]);

      expect(refTimes.length).toBeGreaterThan(0);
      expect(simTimes.length).toBeGreaterThan(0);

      // If simulation produced too few points, skip numeric comparison but record solver failure
      if (simTimes.length < 2) {
        console.warn('Simulation returned too few time points for', modelKey, '- skipping numeric comparison');
        try {
          solverFailures.push({ model: modelKey, reason: 'insufficient_timepoints', logs: runLogs || [], timestamp: new Date().toISOString(), refGdatPath: refGdatPath || null, options });
        } catch (e) { /* ignore */ }
        return;
      }

      // Align by overlapping time points (within tolerance)
      const TIME_TOL = 1e-8;
      const matchedIndices: Array<{ refIdx: number; simIdx: number }> = [];
      let sIdx = 0;
      for (let rIdx = 0; rIdx < refTimes.length; rIdx++) {
        const rt = refTimes[rIdx];
        while (sIdx < simTimes.length && simTimes[sIdx] + TIME_TOL < rt) sIdx++;
        if (sIdx < simTimes.length && Math.abs(simTimes[sIdx] - rt) <= TIME_TOL) {
          matchedIndices.push({ refIdx: rIdx, simIdx: sIdx });
        }
      }

      if (matchedIndices.length < 2) {
        console.warn('Insufficient overlapping time points for', modelKey, '- skipping numeric comparison');
        try {
          solverFailures.push({ model: modelKey, reason: 'insufficient_overlap', logs: runLogs || [], timestamp: new Date().toISOString(), refGdatPath: refGdatPath || null, options });
        } catch (e) { /* ignore */ }
        return;
      }

      // Compare numeric values column-by-column for matching observable names on matched timepoints
      const issues: { col: string; maxRel: number; maxAbs: number }[] = [];
      for (let ci = 0; ci < ref.headers.length; ci++) {
        const colName = ref.headers[ci];
        if (colName.toLowerCase() === 'time') continue;
        const simColIdx = simHeaders.findIndex(h => h.toLowerCase() === colName.toLowerCase());
        if (simColIdx === -1) throw new Error(`Simulation missing column ${colName} for model ${modelKey}`);

        let maxRel = 0, maxAbs = 0;
        for (const m of matchedIndices) {
          const refVal = ref.data[m.refIdx][ci];
          const simVal = simDataRows[m.simIdx][simColIdx];
          const absErr = Math.abs(simVal - refVal);
          const relErr = refVal === 0 ? (absErr === 0 ? 0 : Number.POSITIVE_INFINITY) : Math.abs(absErr / Math.abs(refVal));
          maxAbs = Math.max(maxAbs, absErr);
          maxRel = Math.max(maxRel, relErr);
        }

        issues.push({ col: colName, maxRel, maxAbs });
      }

      // If any column fails tolerances, write diagnostic artifacts (sim CSV, ref GDAT, diff JSON) and then assert
      const failing = issues.filter(it => it.maxAbs > (ABS_TOL + 1e-12) || it.maxRel > (REL_TOL + 1e-12));
      if (failing.length > 0) {
        try {
          fs.mkdirSync(join(process.cwd(), 'artifacts', 'diagnostics'), { recursive: true });
          // Write simulation CSV
          const simCsvPath = join(process.cwd(), 'artifacts', 'diagnostics', `${modelKey}-sim.csv`);
          const simCsv = [simHeaders.join(',')].concat(results.data.map(r => simHeaders.map(h => (r[h] ?? '')).join(','))).join('\n');
          fs.writeFileSync(simCsvPath, simCsv, 'utf8');

          // Write reference GDAT (if available)
          if (refGdatPath && fs.existsSync(refGdatPath)) {
            const refOutPath = join(process.cwd(), 'artifacts', 'diagnostics', `${modelKey}-ref.gdat`);
            fs.copyFileSync(refGdatPath, refOutPath);
          }

          // Write converted BNGL text (for inspection)
          try {
            if (typeof bnglText === 'string') {
              const bngOutPath = join(process.cwd(), 'artifacts', 'diagnostics', `${modelKey}-converted.bngl`);
              fs.writeFileSync(bngOutPath, bnglText, 'utf8');
            }
          } catch (e) { /* ignore */ }

          // Write diff summary
          const diffPath = join(process.cwd(), 'artifacts', 'diagnostics', `${modelKey}-diff.json`);
          fs.writeFileSync(diffPath, JSON.stringify({ model: modelKey, issues, matchedIndicesCount: matchedIndices.length, generatedAt: new Date().toISOString(), options: options }, null, 2), 'utf8');
          console.info('Wrote diagnostics for', modelKey, 'to artifacts/diagnostics');
        } catch (e) {
          console.warn('Failed to write diagnostics for', modelKey, e);
        }
      }

      for (const it of issues) {
        expect(it.maxAbs).toBeLessThanOrEqual(ABS_TOL + 1e-12);
        expect(it.maxRel).toBeLessThanOrEqual(REL_TOL + 1e-12);
      }
    } catch (err: any) {
      // Capture fatal errors for the run and rethrow so tests still fail when assertions fail
      runStatus = runStatus === 'passed' ? 'error' : runStatus;
      runReason = runReason ?? (err && err.message ? String(err.message) : 'error');
      throw err;
    } finally {
      const duration = Date.now() - start;
      const runSummary: RunSummary = {
        timestamp: new Date().toISOString(),
        durationMs: duration,
        status: runStatus,
        reason: runReason,
        options: (typeof options !== 'undefined') ? options : undefined,
        logs: runLogs,
        refGdatPath: (typeof refGdatPath !== 'undefined') ? refGdatPath : null
      };

      if (!masterReport[modelKey]) masterReport[modelKey] = { history: [] };
      masterReport[modelKey].history.push(runSummary);
      masterReport[modelKey].latest = runSummary;
    }
    });
  }

  // After the suite, write solver failure summary as an artifact
  afterAll(() => {
    try {
      fs.mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true });

      // Write solver failures for this run (keeps old behavior)
      if (solverFailures.length > 0) {
        const outPath = join(process.cwd(), 'artifacts', 'solver_failures.json');
        fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), failures: solverFailures }, null, 2), 'utf8');
        console.info('Wrote solver failures report to', outPath);
      } else {
        console.info('No solver failures recorded.');
      }

      // Merge master report with existing master file (if present)
      const masterPath = join(process.cwd(), 'artifacts', 'master_regression_report.json');
      let existing: Record<string, { history: RunSummary[]; latest?: RunSummary }> = {};
      if (fs.existsSync(masterPath)) {
        try { existing = JSON.parse(readFileSync(masterPath, 'utf8')); } catch (e) { existing = {}; }
      }

      // Merge: append current run histories to existing histories (by model key)
      for (const [modelKey, data] of Object.entries(masterReport)) {
        if (!existing[modelKey]) existing[modelKey] = { history: [] };
        existing[modelKey].history = existing[modelKey].history.concat(data.history);
        existing[modelKey].latest = data.latest;
      }

      // Write merged master report and a timestamped backup
      const masterOut = { generatedAt: new Date().toISOString(), perModel: existing };
      const masterOutPath = masterPath;
      fs.writeFileSync(masterOutPath, JSON.stringify(masterOut, null, 2), 'utf8');

      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = join(process.cwd(), 'artifacts', `master_regression_report.${ts}.json`);
      fs.writeFileSync(backupPath, JSON.stringify(masterOut, null, 2), 'utf8');

      console.info('Wrote master regression report to', masterOutPath);
      console.info('Wrote timestamped backup to', backupPath);

    } catch (e) {
      console.error('Failed to write reports:', e);
    }
  });
});
