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

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;

    if (line.match(/^\s+-\s+/)) {
      const value = line.replace(/^\s+-\s+/, '').trim();
      if (currentList) {
        currentList.push(value);
      }
      continue;
    }

    const kvMatch = line.match(/^(\w[\w\s]*?):\s*(.*)$/);
    if (kvMatch) {
      if (currentList && currentKey) {
        result[currentKey] = currentList;
      }
      currentKey = kvMatch[1].trim();
      const value = kvMatch[2].trim();
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
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

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

export function parsePEtab(files: Map<string, string>): PEtabProblem {
  const warnings: string[] = [];

  const findFile = (suffix: string): string | undefined => {
    for (const [name, content] of files) {
      if (name.toLowerCase().endsWith(suffix.toLowerCase())) return content;
    }
    return undefined;
  };

  const yamlContent = findFile('.yaml') ?? findFile('.yml');
  if (yamlContent) {
    try {
      parseSimpleYAML(yamlContent);
    } catch {
      warnings.push('Failed to parse YAML problem file; using filename heuristics.');
    }
  }

  const paramText = findFile('parameters.tsv') ?? findFile('_parameters.tsv');
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

  const measText = findFile('measurements.tsv') ?? findFile('_measurements.tsv');
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

  const conditions = new Map<string, Record<string, number>>();
  const condText = findFile('conditions.tsv') ?? findFile('_conditions.tsv');
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

  const observables: PEtabObservable[] = [];
  const obsText = findFile('observables.tsv') ?? findFile('_observables.tsv');
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

  for (const line of text.split('\n')) {
    const sectionMatch = line.trim().match(/^\[(\w+)\]$/);
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
