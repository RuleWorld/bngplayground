/**
 * Source-derived event runtime audit for representative SBML Test Suite cases.
 *
 * This complements sbml_suite_audit.ts: the full suite establishes lossless event
 * metadata preservation, while this bounded set runs the preserved events through
 * the Playground ODE or SSA runtime. Set SBML_EVENT_RUNTIME_IDS to a comma-separated list
 * to extend or narrow the representative set.
 *
 * Required:
 *   SBML_TEST_SUITE_DIR=/path/to/sbml-test-suite
 * Optional:
 *   SBML_EVENT_RUNTIME_IDS=00071,01119,...
 *   SBML_EVENT_RUNTIME_T_END=10
 *   SBML_EVENT_RUNTIME_N_STEPS=100
 *   SBML_EVENT_RUNTIME_METHOD=ode|ssa (default: ode)
 *   SBML_EVENT_RUNTIME_SOLVER=cvode|rk45 (default: cvode)
 *   SBML_EVENT_RUNTIME_COMPARE_EXPECTED=1 (ODE only; compare suite results.csv)
 *   SBML_EVENT_RUNTIME_TIMEOUT_MS=15000
 *   SBML_EVENT_RUNTIME_OUT=artifacts/atomizer-roundtrip/sbml-event-runtime-audit.json
 */

import { readFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { Atomizer } from '../../src/lib/atomizer';
import { parseBNGL } from '../../services/parseBNGL';
import { parseBNGLStrict } from '../../packages/engine/src/parser/BNGLParserWrapper';
import { simulate } from '../../packages/engine/src/services/simulation/SimulationLoop';
import type { BNGLModel } from '../../packages/engine/src/types';

const DEFAULT_IDS = [
  '00071', // state trigger + delayed assignment
  '00886', // state trigger + time-valued delay
  '00980', // assignment-time values and mutable parameters
  '01119', // delayed same-trigger priority ordering
  '01213', // piecewise delay
  '01263', // rateOf delay
  '01287', // same-time event ordering
  '01325', // state trigger + assignment-time evaluation
  '01590', // repeated non-persistent events
];

type EventRuntimeResult = {
  id: string;
  source: string;
  eventCount: number;
  eventFeatures: string[];
  atomizerSuccess: boolean;
  strictParse: boolean;
  runtimeAttempted: boolean;
  runtimeCompleted: boolean;
  runtimeDiagnostics: string[];
  eventFirings: string[];
  outputRows: number;
  trajectoryCompared: boolean;
  trajectoryPass: boolean;
  trajectoryMaxAbs: number | null;
  trajectoryMaxRel: number | null;
  trajectoryMissing: string[];
  runtimeSkipped: boolean;
  skipReason?: string;
  error?: string;
};

type ExpectedTrajectory = {
  duration: number;
  steps: number;
  absolute: number;
  relative: number;
  variables: string[];
  amount: Set<string>;
  concentration: Set<string>;
  rows: Array<{ time: number; values: Record<string, number> }>;
};

function sourcePath(root: string, id: string): string {
  return join(root, 'cases', 'semantic', id, `${id}-sbml-l3v2.xml`);
}

function discoverEventCaseIds(root: string): string[] {
  const semanticRoot = join(root, 'cases', 'semantic');
  return readdirSync(semanticRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .filter((id) => {
      const file = sourcePath(root, id);
      return existsSync(file) && /<listOfEvents\b/i.test(readFileSync(file, 'utf8'));
    })
    .sort((a, b) => Number(a) - Number(b));
}

function eventFeatures(model: BNGLModel): string[] {
  const features = new Set<string>();
  for (const event of model.events || []) {
    if (/(?:^|[^A-Za-z])time(?:[^A-Za-z]|$)/i.test(event.trigger)) features.add('time-trigger');
    else features.add('state-trigger');
    if (event.delay) features.add('delay');
    if (event.priority) features.add('priority');
    if (event.useValuesFromTriggerTime === false) features.add('assignment-time-values');
    if (event.triggerPersistent === false) features.add('non-persistent');
    if (event.assignments.some((assignment) => /piecewise/i.test(assignment.math))) features.add('piecewise-assignment');
    if ((event.delay || '').includes('rateOf')) features.add('rateOf-delay');
    if ((event.delay || '').includes('piecewise')) features.add('piecewise-delay');
  }
  return [...features].sort();
}

function settingLine(settings: string, key: string): string {
  return settings.match(new RegExp(`^${key}:[ \\t]*([^\\r\\n]*)`, 'mi'))?.[1]?.trim() || '';
}

function parseList(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function readExpectedTrajectory(root: string, id: string): ExpectedTrajectory {
  const directory = join(root, 'cases', 'semantic', id);
  const settings = readFileSync(join(directory, `${id}-settings.txt`), 'utf8');
  const resultLines = readFileSync(join(directory, `${id}-results.csv`), 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const headers = resultLines[0].split(',').map(value => value.trim());
  const rows = resultLines.slice(1).map(line => {
    const values = line.split(',').map(value => Number.parseFloat(value.trim()));
    return {
      time: values[0],
      values: Object.fromEntries(headers.slice(1).map((header, index) => [header, values[index + 1]])),
    };
  });
  return {
    duration: Number(settingLine(settings, 'duration')),
    steps: Number(settingLine(settings, 'steps')),
    absolute: Number(settingLine(settings, 'absolute')) || 1e-6,
    relative: Number(settingLine(settings, 'relative')) || 1e-6,
    variables: parseList(settingLine(settings, 'variables')),
    amount: new Set(parseList(settingLine(settings, 'amount'))),
    concentration: new Set(parseList(settingLine(settings, 'concentration'))),
    rows,
  };
}

function compareExpectedTrajectory(
  expected: ExpectedTrajectory,
  simulation: { data: Array<Record<string, number>> },
  parameterAliases: Map<string, string>,
): { pass: boolean; maxAbs: number; maxRel: number; missing: string[] } {
  const missing = new Set<string>();
  let maxAbs = 0;
  let maxRel = 0;
  for (let rowIndex = 0; rowIndex < expected.rows.length; rowIndex++) {
    const expectedRow = expected.rows[rowIndex];
    const actualRow = simulation.data[rowIndex];
    if (!actualRow || Math.abs(Number(actualRow.time) - expectedRow.time) > 1e-8) {
      missing.add(`time:${expectedRow.time}`);
      continue;
    }
    for (const variable of expected.variables) {
      const outputName = expected.amount.has(variable)
        ? `${variable}_amt`
        : expected.concentration.has(variable)
          ? `${variable}_conc`
          : (parameterAliases.get(variable) || variable);
      const actual = actualRow[outputName];
      const reference = expectedRow.values[variable];
      if (!Number.isFinite(actual) || !Number.isFinite(reference)) {
        missing.add(`${variable}@${expectedRow.time}`);
        continue;
      }
      const abs = Math.abs(actual - reference);
      const rel = abs / Math.max(1, Math.abs(reference));
      maxAbs = Math.max(maxAbs, abs);
      maxRel = Math.max(maxRel, rel);
    }
  }
  const tolerance = expected.rows.reduce((max, row) => {
    const rowScale = Math.max(1, ...Object.values(row.values).map(value => Math.abs(value)));
    return Math.max(max, 10 * (expected.absolute + expected.relative * rowScale));
  }, 0);
  return { pass: missing.size === 0 && maxAbs <= tolerance, maxAbs, maxRel, missing: [...missing].slice(0, 20) };
}

async function main(): Promise<void> {
  const suiteRoot = process.env.SBML_TEST_SUITE_DIR;
  if (!suiteRoot) throw new Error('Set SBML_TEST_SUITE_DIR to a checked-out SBML Test Suite repository.');
  const root = resolve(suiteRoot);
  const idSelection = process.env.SBML_EVENT_RUNTIME_ALL === '1'
    ? discoverEventCaseIds(root)
    : (process.env.SBML_EVENT_RUNTIME_IDS || DEFAULT_IDS.join(',')).split(',');
  const ids = idSelection
    .map((id) => id.trim())
    .filter(Boolean);
  const tEnd = Number(process.env.SBML_EVENT_RUNTIME_T_END || '10');
  const nSteps = Number(process.env.SBML_EVENT_RUNTIME_N_STEPS || '100');
  const runtimeMethod = (process.env.SBML_EVENT_RUNTIME_METHOD || 'ode').toLowerCase();
  const runtimeSolver = process.env.SBML_EVENT_RUNTIME_SOLVER || 'cvode';
  if (runtimeMethod !== 'ode' && runtimeMethod !== 'ssa') throw new Error('SBML_EVENT_RUNTIME_METHOD must be ode or ssa.');
  const compareExpected = process.env.SBML_EVENT_RUNTIME_COMPARE_EXPECTED === '1';
  if (compareExpected && runtimeMethod !== 'ode') throw new Error('SBML_EVENT_RUNTIME_COMPARE_EXPECTED requires SBML_EVENT_RUNTIME_METHOD=ode.');
  const timeoutMs = Number(process.env.SBML_EVENT_RUNTIME_TIMEOUT_MS || '15000');
  const atomizer = new Atomizer({ quietMode: true, useId: true, atomize: false });
  await atomizer.initialize();
  const results: EventRuntimeResult[] = [];

  for (let idIndex = 0; idIndex < ids.length; idIndex++) {
    const id = ids[idIndex];
    console.log(`[SBML_EVENT_RUNTIME] ${idIndex + 1}/${ids.length} ${id}`);
    const file = sourcePath(root, id);
    const result: EventRuntimeResult = {
      id,
      source: file,
      eventCount: 0,
      eventFeatures: [],
      atomizerSuccess: false,
      strictParse: false,
      runtimeAttempted: false,
      runtimeCompleted: false,
      runtimeDiagnostics: [],
      eventFirings: [],
      outputRows: 0,
      trajectoryCompared: false,
      trajectoryPass: false,
      trajectoryMaxAbs: null,
      trajectoryMaxRel: null,
      trajectoryMissing: [],
      runtimeSkipped: false,
    };
    if (!existsSync(file)) {
      result.error = 'fixture not found';
      results.push(result);
      continue;
    }
    try {
      const atomized = await atomizer.atomize(readFileSync(file, 'utf8'));
      result.atomizerSuccess = atomized.success;
      const sourceModel = atomizer.getModel();
      result.eventCount = sourceModel?.events?.length || 0;
      result.eventFeatures = sourceModel ? eventFeatures(sourceModel as unknown as BNGLModel) : [];
      if (!atomized.success) throw new Error(atomized.error || 'Atomizer returned success=false');

      parseBNGLStrict(atomized.bngl);
      const model = parseBNGL(atomized.bngl);
      result.eventCount = model.events?.length || result.eventCount;
      result.eventFeatures = eventFeatures(model);
      result.strictParse = true;
      // The bundled libSBML build cannot flatten hierarchical comp models.
      // Keep these cases in the structural audit, but do not pretend that a
      // partial top-level projection is a runnable trajectory translation.
      if (/<(?:[A-Za-z_][\w.-]*:)?listOfModelDefinitions\b/i.test(readFileSync(file, 'utf8'))
        || /(?:^|\s)comp:required\s*=\s*["']true["']/i.test(readFileSync(file, 'utf8'))) {
        result.runtimeSkipped = true;
        result.skipReason = 'SBML comp hierarchy requires model flattening unavailable in bundled libSBML';
        result.runtimeCompleted = true;
        results.push(result);
        continue;
      }
      if (result.eventCount === 0) {
        // Some semantic XML fixtures contain event text in non-Core/package content
        // that Atomizer correctly does not import as executable SBML events.
        result.runtimeCompleted = true;
        results.push(result);
        continue;
      }
      result.runtimeAttempted = true;
      const expected = compareExpected ? readExpectedTrajectory(root, id) : undefined;
      const parameterAliases = new Map<string, string>();
      const rateRuleVariableName = (value: string): string | undefined => {
        const normalized = value.trim()
          .replace(/^@[A-Za-z0-9_]+::/, '')
          .replace(/\([^)]*\)$/, '');
        return /^M___rate_rule_state__(.+?)(?:@.*)?$/.exec(normalized)?.[1];
      };
      const rateRuleVariables = new Set(
        (model.species || [])
          .map(species => rateRuleVariableName(species.name))
          .filter((name): name is string => Boolean(name)),
      );
      const expectedFunctions = expected ? expected.variables.flatMap(variable => {
        if (rateRuleVariables.has(variable)) {
          parameterAliases.set(variable, `${variable}_amt`);
          return [];
        }
        if (Object.prototype.hasOwnProperty.call(model.parameters, variable)) {
          const alias = `__sbml_expected_${variable}`;
          parameterAliases.set(variable, alias);
          return [{ name: alias, args: [], expression: variable }];
        }
        const compartment = (model.compartments || []).find(compartment => compartment.name === variable);
        if (compartment) {
          parameterAliases.set(variable, variable);
          return [];
        }
        if ((model.functions || []).some(fn => fn.name === variable && fn.args.length === 0)) {
          parameterAliases.set(variable, variable);
        }
        return [];
      }) : [];
      // The writer may mark a narrow fixed-time event as native BNGL action-compatible.
      // Force the same lossless metadata through the Playground runtime here so this
      // source-derived audit measures the general executor rather than the legacy action path.
      const runtimeModel: BNGLModel = {
        ...model,
        // The writer keeps a native BNGL action projection for simple SBML
        // events. The runtime audit intentionally exercises the general event
        // executor, so do not execute that second projection as well.
        actions: [],
        concentrationChanges: [],
        parameterChanges: [],
        functions: [...(model.functions || []), ...expectedFunctions],
        events: (model.events || []).map((event) => ({ ...event, bnglExecution: 'playground' })),
        ...(expected ? {
          simulationPhases: [{
            ...(model.simulationPhases?.[0] || {}),
            method: 'ode' as const,
            t_end: expected.duration,
            n_steps: expected.steps,
            // Native phase actions are a second projection of the same SBML
            // events. Keep them out of this runtime-only audit or events would
            // be applied twice.
            parameterChanges: [],
            speciesChanges: [],
            concentrationChanges: [],
          }],
        } : {}),
      };
      const runtimeWarnings: string[] = [];
      const startedAt = Date.now();
      const simulation = await simulate(
        Number(id),
        runtimeModel,
        {
          method: runtimeMethod,
          t_end: expected?.duration ?? tEnd,
          n_steps: expected?.steps ?? nSteps,
          ...(expected ? { atol: expected.absolute, rtol: expected.relative, print_functions: true } : {}),
          solver: runtimeSolver,
          includeSpeciesData: false,
          includeExpandedNetwork: false,
          maxSteps: 100_000,
          maxEvents: 100_000,
        },
        {
          checkCancelled: () => {
            if (Date.now() - startedAt > timeoutMs) throw new Error(`event runtime audit timeout after ${timeoutMs} ms`);
          },
          postMessage: (message) => {
            if (typeof message.warning === 'string') runtimeWarnings.push(message.warning);
          },
        },
      );
      result.runtimeDiagnostics = simulation.eventDiagnostics || [];
      result.eventFirings = simulation.eventFirings || [];
      result.outputRows = simulation.data.length;
      result.runtimeCompleted = runtimeWarnings.length === 0 && simulation.data.length >= Math.min(2, nSteps + 1);
      if (expected) {
        const comparison = compareExpectedTrajectory(expected, simulation, parameterAliases);
        result.trajectoryCompared = true;
        result.trajectoryPass = comparison.pass;
        result.trajectoryMaxAbs = comparison.maxAbs;
        result.trajectoryMaxRel = comparison.maxRel;
        result.trajectoryMissing = comparison.missing;
        if (!comparison.pass) result.error = `trajectory mismatch: maxAbs=${comparison.maxAbs} maxRel=${comparison.maxRel} missing=${comparison.missing.join(',')}`;
      }
      if (runtimeWarnings.length > 0) result.error = runtimeWarnings.join(' | ');
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }
    results.push(result);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    suiteRoot: root,
    ids,
    tEnd,
    nSteps,
    method: runtimeMethod,
    compareExpected,
    timeoutMs,
    total: results.length,
    atomizerSuccess: results.filter((result) => result.atomizerSuccess).length,
    strictParse: results.filter((result) => result.strictParse).length,
    eventModels: results.filter((result) => result.eventCount > 0).length,
    runtimeAttempted: results.filter((result) => result.runtimeAttempted).length,
    runtimeSkipped: results.filter((result) => result.runtimeSkipped).length,
    runtimeCompleted: results.filter((result) => result.runtimeAttempted && result.runtimeCompleted).length,
    runtimeDiagnostics: results.reduce((count, result) => count + result.runtimeDiagnostics.length, 0),
    trajectoryCompared: results.filter((result) => result.trajectoryCompared).length,
    trajectoryPassed: results.filter((result) => result.trajectoryCompared && result.trajectoryPass).length,
    results,
  };
  const output = resolve(process.env.SBML_EVENT_RUNTIME_OUT || 'artifacts/atomizer-roundtrip/sbml-event-runtime-audit.json');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ ...summary, output, results: undefined }, null, 2));
  if (summary.atomizerSuccess !== summary.total
    || summary.strictParse !== summary.total
    || summary.runtimeCompleted !== summary.runtimeAttempted
    || (summary.compareExpected && summary.trajectoryPassed !== summary.trajectoryCompared)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
