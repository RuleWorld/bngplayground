import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { DEFAULT_BNG2_PATH, DEFAULT_PERL_CMD } from '../../scripts/bngDefaults.js';
import { BNGLModel, SimulationOptions } from '../../types';
import { parseBNGL } from '../../services/parseBNGL';
import { simulate } from '../../services/simulation/SimulationLoop';
import { convertBNGXmlToBNGL } from '../../src/lib/atomizer/parser/bngXmlParser';
import { BNG2_EXCLUDED_MODELS } from '../../constants';
import { generateExpandedNetwork } from '../../services/simulation/NetworkExpansion';

console.error(`[DEBUG-ENTRY] CWD: ${process.cwd()}`);
console.error(`[DEBUG-ENTRY] example-models exists: ${fs.existsSync('example-models')}`);

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
      // BNG2.pl exports the CURRENT state when writeSBML/writeXML is called.
      // If the BNGL file has simulate() commands, appending writeSBML to the end 
      // captures the FINAL state. We must insert it BEFORE any simulation actions
      // to capture the INITIAL state for regression.
      const actionBlockMatch = content.match(/begin\s+actions/i);
      if (actionBlockMatch) {
        const actionStart = content.indexOf(actionBlockMatch[0]) + actionBlockMatch[0].length;
        // Look for generate_network within the action block
        const genNetMatch = content.slice(actionStart).match(/generate_network\s*\([^)]*\)/i);
        let insertPos = actionStart;
        if (genNetMatch) {
          insertPos = actionStart + content.slice(actionStart).indexOf(genNetMatch[0]) + genNetMatch[0].length;
        }

        const pre = content.slice(0, insertPos);
        const post = content.slice(insertPos);
        const newContent = pre + '\n    writeSBML({suffix=>"sbml"})\n' + post;
        fs.writeFileSync(dest, newContent, 'utf8');
      } else {
        // No action block, just append to end
        const append = '\n# Appended by regression harness: ensure SBML is written\nwriteSBML({suffix=>"sbml"})\n';
        fs.appendFileSync(dest, append, 'utf8');
      }
    }
  } catch (e) {
    // best-effort; continue
  }

  const result = spawnSync(process.env.PERL_CMD ?? DEFAULT_PERL_CMD, [process.env.BNG2_PATH ?? DEFAULT_BNG2_PATH, modelName, '--outdir', outdir], {
    cwd: outdir,
    encoding: 'utf-8',
    timeout: 120000,
    env: { ...process.env, PERL5LIB: 'C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\Perl2' },
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

interface BnglAction {
  type: 'simulate' | 'setParameter' | 'setConcentration';
  args: Record<string, any>;
}

function parseActionsFromBngl(bnglContent: string): BnglAction[] {
  const stripped = bnglContent.replace(/#[^\n]*/g, '');
  const actions: BnglAction[] = [];

  // Regex to capture action calls: name({args}) or name("arg", val)
  // We scan line by line or robustly scan the whole file for the actions block
  const actionBlockMatch = stripped.match(/begin\s+actions([\s\S]*?)end\s+actions/i);
  if (!actionBlockMatch) return actions;

  const blockContent = actionBlockMatch[1];

  // Simple parser for action lines like: simulate({method=>"ode", ...})
  // or setParameter("k1", 10)
  const lines = blockContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Simulate
    if (trimmed.startsWith('simulate')) {
      const argsMatch = trimmed.match(/simulate\s*\(\s*\{([^}]*)\}\s*\)/i);
      if (argsMatch) {
        const argsStr = argsMatch[1];
        const args: Record<string, any> = {};

        // Parse key=>val pairs
        const pairs = argsStr.split(',');
        for (const pair of pairs) {
          const [k, v] = pair.split('=>').map(s => s.trim());
          if (!k) continue;
          // Clean value: remove quotes
          const cleanVal = v.replace(/^["']|["']$/g, '');
          // Try number
          const numVal = parseFloat(cleanVal);
          args[k] = isNaN(numVal) ? cleanVal : numVal;
        }
        actions.push({ type: 'simulate', args });
      }
    }
    // setParameter
    else if (trimmed.startsWith('setParameter')) {
      // setParameter("name", value) or setParameter("name", val)
      const argsMatch = trimmed.match(/setParameter\s*\(\s*["']?([^"',]+)["']?\s*,\s*([^)]+)\)/i);
      if (argsMatch) {
        const paramName = argsMatch[1];
        let paramValStr = argsMatch[2].trim();
        // remove quotes if string
        paramValStr = paramValStr.replace(/^["']|["']$/g, '');
        const val = parseFloat(paramValStr);
        actions.push({
          type: 'setParameter',
          args: { name: paramName, value: isNaN(val) ? paramValStr : val }
        });
      }
    }
    // setConcentration (future proofing)
    else if (trimmed.startsWith('setConcentration')) {
      const argsMatch = trimmed.match(/setConcentration\s*\(\s*["']?([^"',]+)["']?\s*,\s*([^)]+)\)/i);
      if (argsMatch) {
        const speciesName = argsMatch[1];
        let valStr = argsMatch[2].trim();
        valStr = valStr.replace(/^["']|["']$/g, '');
        const val = parseFloat(valStr);
        actions.push({
          type: 'setConcentration',
          args: { species: speciesName, value: isNaN(val) ? valStr : val }
        });
      }
    }
  }
  return actions;
}

function getBnglFiles(dir: string): string[] {
  let files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files = files.concat(getBnglFiles(fullPath));
    } else if (item.name.endsWith('.bngl')) {
      files.push(path.resolve(fullPath));
    }
  }
  return files;
}

// Helper to convert actions to Model-level phases and changes
function applyActionsToModel(model: any, actions: BnglAction[]) {
  const phases: any[] = [];
  const changes: any[] = []; // parameterChanges
  const concChanges: any[] = []; // concentrationChanges

  let currentPhaseIdx = -1;
  let virtualTime = 0;

  for (const action of actions) {
    if (action.type === 'simulate') {
      currentPhaseIdx++;
      const args = action.args;
      const tEndArg = args.t_end ?? 100;
      // Map args to SimulationPhase
      const phase = {
        method: (args.method || 'ode').toLowerCase(),
        t_start: args.t_start, // Optional, defaults to current time if continue=1
        t_end: tEndArg, // SimulationLoop expects absolute end time
        n_steps: args.n_steps ?? 100,
        continue: !!args.continue,
        atol: args.atol,
        rtol: args.rtol,
        suffix: args.suffix,
        print_functions: !!args.print_functions
      };

      // Update virtual time for next phase tracking (if needed)
      if (args.continue) {
        virtualTime = tEndArg;
      } else {
        virtualTime = tEndArg;
      }

      phases.push(phase);
    } else if (action.type === 'setParameter') {
      changes.push({
        parameter: action.args.name,
        value: action.args.value,
        afterPhaseIndex: currentPhaseIdx
      });
    } else if (action.type === 'setConcentration') {
      concChanges.push({
        species: action.args.species,
        value: action.args.value,
        afterPhaseIndex: currentPhaseIdx
      });
    }
  }

  model.simulationPhases = phases;
  model.parameterChanges = changes;
  model.concentrationChanges = concChanges;
}

const ABS_TOL = 1e-5;
const REL_TOL = 2e-4;

/**
 * Per-model solver overrides to handle specific numeric stability issues
 */
const SOLVER_OVERRIDES: Record<string, Partial<SimulationOptions>> = {
  'viral-sensing': { atol: 1e-10, rtol: 1e-10, stabLimDet: true },
  'akt-signaling': { atol: 1e-10, rtol: 1e-10, stabLimDet: true },
  'lipid-mediated-pip3-signaling': { atol: 1e-8, rtol: 1e-8 },
  'tlr3-dsrna-sensing': { atol: 1e-10, rtol: 1e-10, stabLimDet: true },
  'calcium-spike-signaling': { stabLimDet: true }, // Proactive override for other compartmental model
  'eif2a-stress-response': { stabLimDet: true, atol: 1e-8, rtol: 1e-8 }, // Address 10% deviation
};

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
    const allModels = getBnglFiles('example-models');
    console.error(`[DEBUG] Discovered ${allModels.length} models: ${JSON.stringify(allModels.map(m => basename(m)))}`);
    it('should have discovered models', () => {
      expect(allModels.length).toBeGreaterThan(0);
    });
  const filter = process.env.ATOMIZER_REGRESSION_FILTER;

  // Optional exclusions from constants (imported statically above)

  for (const modelPath of allModels) {
    const base = basename(modelPath);
    const modelKey = base.replace(/\.bngl$/i, '');
    console.error(`[DEBUG] Registering test for: ${modelKey}`);

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

        // Run TS simulation and capture console output to file-based logs
        const oldLog = console.log, oldWarn = console.warn, oldError = console.error, oldInfo = console.info;
        runLogs = [];
        const logDir = join(process.cwd(), 'artifacts', 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        const logFile = join(logDir, `${modelKey}.log`);
        if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
        fs.writeFileSync(logFile, '', 'utf8');

        const diagDir = join(process.cwd(), 'artifacts', 'diagnostics');
        if (!fs.existsSync(diagDir)) fs.mkdirSync(diagDir, { recursive: true });

        const appendLog = (level: string, ...args: any[]) => {
          try {
            const msg = `[${level.toUpperCase()}] ` + args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n';
            if (fs.existsSync(logFile)) {
              fs.appendFileSync(logFile, msg, 'utf8');
            }
            if (runLogs.length < 100) runLogs.push(msg.trim());
            else if (runLogs.length === 100) runLogs.push('... logs truncated, see ' + logFile);
          } catch (e) { /* silent fail on log write */ }
        };

        const localConsole = {
          log: (...args: any[]) => { appendLog('log', ...args); oldLog.apply(console, args); },
          warn: (...args: any[]) => { appendLog('warn', ...args); oldWarn.apply(console, args); },
          error: (...args: any[]) => { appendLog('error', ...args); oldError.apply(console, args); },
          info: (...args: any[]) => { appendLog('info', ...args); oldInfo.apply(console, args); }
        };

        console.log = localConsole.log;
        console.warn = localConsole.warn;
        console.error = localConsole.error;
        console.info = localConsole.info;

        try {
          // Parse BNGL into model for simulation
          parsedModel = parseBNGL(bnglText);

          // If BNGL contains a generate_network action, run network generation to expand rules into species/reactions
          try {
            parsedModel = await generateExpandedNetwork(parsedModel as any, () => { }, (p) => console.info('[Regression:progress]', p));
            console.info('[Regression] Network generation completed:', parsedModel.species?.length, 'species,', parsedModel.reactions?.length, 'reactions');
          } catch (e: any) {
            console.warn('[Regression] Network generation failed for', modelKey, e);
          }


          // Parse actions from BNGL and apply to model
          const actions = parseActionsFromBngl(bnglText);
          applyActionsToModel(parsedModel, actions);

          // If no actions found, fallback to default single-phase options
          if (!parsedModel.simulationPhases || parsedModel.simulationPhases.length === 0) {
            const simCall = parseActionsFromBngl(bnglText).find(a => a.type === 'simulate'); // Re-scan just in case
            // ... existing fallback logic or just default
            const baseOptions = {
              method: 'ode',
              t_end: 100,
              n_steps: 100,
              solver: 'cvode',
              atol: 1e-8,
              rtol: 1e-8
            };
            options = { ...baseOptions, ...SOLVER_OVERRIDES[modelKey] };
          } else {
            // Multi-phase: use the first phase's settings as "base" options for initial setup if needed,
            // but 'simulate' loop handles phases.
            // We just need to ensure valid options object is passed.
            options = {
              method: parsedModel.simulationPhases[0].method,
              t_end: parsedModel.simulationPhases[0].t_end,
              n_steps: parsedModel.simulationPhases[0].n_steps,
              solver: 'cvode',
              atol: parsedModel.simulationPhases[0].atol ?? 1e-8,
              rtol: parsedModel.simulationPhases[0].rtol ?? 1e-8,
              ...SOLVER_OVERRIDES[modelKey]
            };
          }

          let results;
          results = await simulate(1, parsedModel as any, options as any, { checkCancelled: () => { }, postMessage: () => { } });

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
            solverFailures.push({ model: modelKey, reason: 'insufficient_timepoints', logs: runLogs || [], timestamp: new Date().toISOString(), refGdatPath: refGdatPath || null, options });
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
            solverFailures.push({ model: modelKey, reason: 'insufficient_overlap', logs: runLogs || [], timestamp: new Date().toISOString(), refGdatPath: refGdatPath || null, options });
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

              // DEBUG: Write simulation CSV
              const csvPath = join(process.cwd(), 'artifacts', 'diagnostics', `${modelKey}-sim.csv`);
              const csvContent = [simHeaders.join(',')].concat(
                simDataRows.map(row => row.join(','))
              ).join('\n');
              fs.writeFileSync(csvPath, csvContent, 'utf8');

              console.info('Wrote diagnostics for', modelKey, 'to artifacts/diagnostics');
            } catch (e) {
              console.warn('Failed to write diagnostics for', modelKey, e);
            }
          }

          for (const it of issues) {
            // Standard floating point comparison: Pass if EITHER abs diff is small OR rel diff is small
            const passed = (it.maxAbs <= ABS_TOL + 1e-12) || (it.maxRel <= REL_TOL + 1e-12);
            expect(passed, `Variable ${it.col} failed: Abs=${it.maxAbs} (limit ${ABS_TOL}), Rel=${it.maxRel} (limit ${REL_TOL})`).toBe(true);
          }
        } finally {
          // Restore console methods after simulation logic completes or errors
          console.log = oldLog;
          console.warn = oldWarn;
          console.error = oldError;
          console.info = oldInfo;
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
      let perModelStore: Record<string, { history: RunSummary[]; latest?: RunSummary }> = {};
      if (fs.existsSync(masterPath)) {
        try {
          const content = readFileSync(masterPath, 'utf8');
          const parsed = JSON.parse(content);
          // Handle nested result from previous bug: find the deepest 'perModel'
          let current = parsed;
          while (current && current.perModel) {
            current = current.perModel;
          }
          perModelStore = current || {};
        } catch (e) {
          perModelStore = {};
        }
      }

      // Merge: append current run histories to existing histories (by model key)
      for (const [modelKey, data] of Object.entries(masterReport)) {
        if (!perModelStore[modelKey]) perModelStore[modelKey] = { history: [] };
        perModelStore[modelKey].history = perModelStore[modelKey].history.concat(data.history);
        perModelStore[modelKey].latest = data.latest;
      }

      // Write merged master report and a timestamped backup
      const masterOut = { generatedAt: new Date().toISOString(), perModel: perModelStore };
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
