/**
 * packages/engine/src/services/analysis/petabImport.ts
 *
 * PEtab import: parse PEtab YAML + TSV files into BNG Playground's
 * parameter estimation structures.
 *
 * PEtab (Schmiester et al. 2021, PLOS Comp Biol) is the community
 * standard for specifying parameter estimation problems in systems
 * biology. This parser handles the core subset needed for BNGL models:
 *
 *   - parameters.tsv  -> ParamBounds[]
 *   - measurements.tsv -> ExperimentalDataPoint[]
 *   - conditions.tsv   -> condition overrides (optional)
 *   - problem.yaml     -> links everything together
 *
 * The grant's CSP50 (Frohlich) planned PEtab support for BioNetGen.
 * This implements that promise client-side.
 *
 * Reference:
 *   Schmiester L, et al. (2021) PEtab-Interoperable specification of
 *   parameter estimation problems in systems biology. PLOS Comp Biol
 *   17(1): e1008646.
 */

import type { ParamBounds, ExperimentalDataPoint } from './paramFitter';

export interface PEtabProblem {
  parameters: PEtabParameter[];
  measurements: ExperimentalDataPoint[];
  conditions: Map<string, Record<string, number>>;
  observables: PEtabObservable[];
  paramBounds: ParamBounds[];
  warnings: string[];
}

export interface PEtabParameter {
  parameterId: string;
  parameterScale: 'lin' | 'log' | 'log10';
  lowerBound: number;
  upperBound: number;
  nominalValue: number;
  estimate: boolean;
  priorType?: string;
  priorParameters?: string;
}

export interface PEtabObservable {
  observableId: string;
  observableFormula: string;
  observableTransformation: 'lin' | 'log' | 'log10';
  noiseFormula: string;
  noiseDistribution: 'normal' | 'laplace';
}

interface PEtabMeasurementRow {
  observableId: string;
  simulationConditionId: string;
  time: number;
  measurement: number;
  noiseParameters?: string;
}

function parseSimpleYAML(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentKey = '';
  let currentList: string[] | null = null;

  const stripComment = (line: string): string => {
    const idx = line.indexOf('#');
    return idx >= 0 ? line.slice(0, idx) : line;
  };

  for (const rawLine of text.split('\n')) {
    const line = stripComment(rawLine).trimEnd();
    if (!line.trim()) continue;

    const leftTrimmed = line.trimStart();
    if (leftTrimmed.startsWith('- ')) {
      const value = leftTrimmed.slice(2).trim();
      if (currentList) {
        currentList.push(value);
      }
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      if (currentList && currentKey) {
        result[currentKey] = currentList;
      }
      currentKey = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (value) {
        result[currentKey] = value;
        currentList = null;
      } else {
        currentList = [];
      }
    }
  }

  if (currentList && currentKey) {
    result[currentKey] = currentList;
  }

  return result;
}

function parseTSV(text: string): Record<string, string>[] {
  // ⚡ Bolt: Use zero-allocation index scanning instead of .split('\n').map().filter()
  const lines: string[] = [];
  let startIdx = 0;
  const len = text.length;
  while (startIdx < len) {
    let endIdx = text.indexOf('\n', startIdx);
    if (endIdx === -1) endIdx = len;
    let s = startIdx;
    let e = endIdx;
    while (s < e && text.charCodeAt(s) <= 32) s++;
    while (e > s && text.charCodeAt(e - 1) <= 32) e--;
    if (s < e && text.charCodeAt(s) !== 35) { // 35 is '#'
      lines.push(text.substring(s, e));
    }
    startIdx = endIdx + 1;
  }

  if (lines.length < 2) return [];

  const splitColumns = (line: string): string[] => {
    // PEtab is tab-delimited, but users often paste whitespace-delimited blocks.
    const parts = line.includes('\t') ? line.split('\t') : line.split(/\s+/);
    return parts.map((part) => part.trim());
  };

  const headers = splitColumns(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitColumns(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cols[j] ?? '';
    }
    rows.push(row);
  }

  return rows;
}

function findFile(files: Map<string, string>, suffix: string): string | undefined {
  for (const [name, content] of files) {
    if (name.toLowerCase().endsWith(suffix.toLowerCase())) return content;
  }
  return undefined;
}

function parseParameters(files: Map<string, string>): PEtabParameter[] {
  const paramText = findFile(files, 'parameters.tsv') ?? findFile(files, '_parameters.tsv');
  if (!paramText) {
    throw new Error(
      'PEtab import failed: no parameters.tsv file was found in the provided archive. ' +
      'A valid PEtab problem requires a parameters.tsv file defining the parameter bounds, scales, and nominal values. ' +
      'Ensure the file is named "parameters.tsv" or "_parameters.tsv".'
    );
  }

  const paramRows = parseTSV(paramText);
  const parameters: PEtabParameter[] = [];

  for (const row of paramRows) {
    const parameterId = row.parameterId ?? row.parameterID ?? row.id ?? '';
    if (!parameterId) continue;

    const estimate = row.estimate === '1' || row.estimate === 'true' || row.estimate === 'True';
    const scale = (row.parameterScale ?? 'lin') as 'lin' | 'log' | 'log10';

    parameters.push({
      parameterId,
      parameterScale: scale,
      lowerBound: parseFloat(row.lowerBound) || 1e-10,
      upperBound: parseFloat(row.upperBound) || 1e6,
      nominalValue: parseFloat(row.nominalValue) || 1,
      estimate,
      priorType: row.objectivePriorType || row.initializationPriorType,
      priorParameters: row.objectivePriorParameters || row.initializationPriorParameters,
    });
  }
  return parameters;
}

function parseMeasurements(files: Map<string, string>): ExperimentalDataPoint[] {
  const measText = findFile(files, 'measurements.tsv') ?? findFile(files, '_measurements.tsv');
  if (!measText) {
    throw new Error(
      'PEtab import failed: no measurements.tsv file was found in the provided archive. ' +
      'A valid PEtab problem requires a measurements.tsv file containing experimental data. ' +
      'Ensure the file is named "measurements.tsv" or "_measurements.tsv".'
    );
  }

  const measRows = parseTSV(measText);
  const rawMeasurements: PEtabMeasurementRow[] = [];

  for (const row of measRows) {
    const observableId = row.observableId ?? row.observableID ?? '';
    const time = parseFloat(row.time);
    const measurement = parseFloat(row.measurement);
    if (!observableId || Number.isNaN(time) || Number.isNaN(measurement)) continue;

    rawMeasurements.push({
      observableId,
      simulationConditionId: row.simulationConditionId ?? row.conditionId ?? 'default',
      time,
      measurement,
      noiseParameters: row.noiseParameters,
    });
  }

  const timeMap = new Map<number, Record<string, number[]>>();
  for (const m of rawMeasurements) {
    if (!timeMap.has(m.time)) timeMap.set(m.time, {});
    const entry = timeMap.get(m.time)!;
    if (!entry[m.observableId]) entry[m.observableId] = [];
    entry[m.observableId].push(m.measurement);
  }

  const measurements: ExperimentalDataPoint[] = [];
  const sortedTimes = [...timeMap.keys()].sort((a, b) => a - b);
  for (const t of sortedTimes) {
    const obsValues = timeMap.get(t)!;
    const values: Record<string, number> = {};
    for (const [obs, vals] of Object.entries(obsValues)) {
      values[obs] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    measurements.push({ time: t, values });
  }
  return measurements;
}

function parseConditions(files: Map<string, string>): Map<string, Record<string, number>> {
  const conditions = new Map<string, Record<string, number>>();
  const condText = findFile(files, 'conditions.tsv') ?? findFile(files, '_conditions.tsv');
  if (condText) {
    const condRows = parseTSV(condText);
    for (const row of condRows) {
      const condId = row.conditionId ?? row.conditionID ?? '';
      if (!condId) continue;

      const overrides: Record<string, number> = {};
      for (const [key, val] of Object.entries(row)) {
        if (key === 'conditionId' || key === 'conditionID' || key === 'conditionName') continue;
        const numVal = parseFloat(val);
        if (!Number.isNaN(numVal)) overrides[key] = numVal;
      }
      conditions.set(condId, overrides);
    }
  }
  return conditions;
}

function parseObservables(files: Map<string, string>): PEtabObservable[] {
  const observables: PEtabObservable[] = [];
  const obsText = findFile(files, 'observables.tsv') ?? findFile(files, '_observables.tsv');
  if (obsText) {
    const obsRows = parseTSV(obsText);
    for (const row of obsRows) {
      const observableId = row.observableId ?? row.observableID ?? '';
      if (!observableId) continue;
      observables.push({
        observableId,
        observableFormula: row.observableFormula ?? observableId,
        observableTransformation: (row.observableTransformation ?? 'lin') as 'lin' | 'log' | 'log10',
        noiseFormula: row.noiseFormula ?? '1',
        noiseDistribution: (row.noiseDistribution ?? 'normal') as 'normal' | 'laplace',
      });
    }
  }
  return observables;
}

export function parsePEtab(files: Map<string, string>): PEtabProblem {
  const warnings: string[] = [];

  const yamlContent = findFile(files, '.yaml') ?? findFile(files, '.yml');
  if (yamlContent) {
    try {
      parseSimpleYAML(yamlContent);
    } catch {
      warnings.push('Failed to parse YAML problem file; using filename heuristics.');
    }
  }

  const parameters = parseParameters(files);
  const measurements = parseMeasurements(files);
  const conditions = parseConditions(files);
  const observables = parseObservables(files);

  const paramBounds: ParamBounds[] = parameters
    .filter((p) => p.estimate)
    .map((p) => ({
      name: p.parameterId,
      initial: p.nominalValue,
      min: p.lowerBound,
      max: p.upperBound,
    }));

  if (paramBounds.length === 0) {
    warnings.push('No parameters marked for estimation (estimate=1). All parameters are fixed.');
  }

  return {
    parameters,
    measurements,
    conditions,
    observables,
    paramBounds,
    warnings,
  };
}

export function parsePEtabCombined(text: string): PEtabProblem {
  const files = new Map<string, string>();
  let currentSection = '';
  let currentLines: string[] = [];

  const flush = () => {
    if (currentSection && currentLines.length > 0) {
      files.set(`${currentSection}.tsv`, currentLines.join('\n'));
    }
    currentLines = [];
  };

  // ⚡ Bolt: Use fast index scanning instead of .split('\n')
  let startIdx = 0;
  const len = text.length;
  while (startIdx < len) {
    let endIdx = text.indexOf('\n', startIdx);
    if (endIdx === -1) endIdx = len;
    const line = text.substring(startIdx, endIdx);
    startIdx = endIdx + 1;

    let s = 0;
    let e = line.length;
    while (s < e && line.charCodeAt(s) <= 32) s++;
    while (e > s && line.charCodeAt(e - 1) <= 32) e--;
    const trimmed = (s > 0 || e < line.length) ? line.substring(s, e) : line;

    let sectionMatch: [string, string] | null = null;
    if (trimmed.length > 2 && trimmed.charCodeAt(0) === 91 && trimmed.charCodeAt(trimmed.length - 1) === 93) { // '[' and ']'
      const inner = trimmed.substring(1, trimmed.length - 1);
      let valid = true;
      for (let j = 0; j < inner.length; j++) {
        const code = inner.charCodeAt(j);
        if (!(code >= 48 && code <= 57) && // 0-9
            !(code >= 65 && code <= 90) && // A-Z
            !(code >= 97 && code <= 122) && // a-z
            !(code === 95)) { // _
          valid = false;
          break;
        }
      }
      if (valid) {
        sectionMatch = [trimmed, inner];
      }
    }

    if (sectionMatch) {
      flush();
      currentSection = sectionMatch[1];
      continue;
    }
    if (currentSection) {
      currentLines.push(line);
    }
  }
  flush();

  return parsePEtab(files);
}
