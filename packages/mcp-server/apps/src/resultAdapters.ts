export type NumericRow = Record<string, number>;

export interface SimulationPayload {
  headers: string[];
  data: NumericRow[];
  dataBySuffix?: Record<string, NumericRow[]>;
}

export interface ContactMapNode {
  id: string;
  label: string;
  type: 'molecule' | 'component' | 'state' | 'compartment';
  parent?: string;
  isGroup?: boolean;
}

export interface ContactMapEdge {
  from: string;
  to: string;
  interactionType: 'binding' | 'unbinding' | 'state_change';
  componentPair?: [string, string];
  ruleIds: string[];
  ruleLabels: string[];
}

export interface ContactMapPayload {
  nodes: ContactMapNode[];
  edges: ContactMapEdge[];
}

export interface ReactionRulePayload {
  name?: string;
  reactants: string[];
  products: string[];
  rate?: string;
  reverseRate?: string;
  isBidirectional?: boolean;
  reactionString?: string;
}

export interface ParsedModelPayload {
  parameters: Record<string, number>;
  moleculeTypes: Array<{ name: string }>;
  species: Array<{ name: string }>;
  observables: Array<{ name: string; pattern: string }>;
  reactionRules: ReactionRulePayload[];
}

export interface ModelParsePayload {
  success: boolean;
  model?: ParsedModelPayload;
  errors: Array<{ line?: number; column?: number; message?: string }>;
}

export interface ParameterScanPayload {
  mode: '1d' | '2d';
  parameter: string;
  parameter2?: string;
  xValues: number[];
  yValues?: number[];
  observables: Record<string, number[] | number[][]>;
}

export interface ValidationMessagePayload {
  source: string;
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  relatedElement?: string;
}

export interface ValidationPayload {
  valid: boolean;
  parseSuccess: boolean;
  parseErrors: Array<{ line: number; column: number; message: string }>;
  errors: ValidationMessagePayload[];
  warnings: ValidationMessagePayload[];
  info: ValidationMessagePayload[];
  summary: { errors: number; warnings: number; info: number };
  nfsim: Record<string, unknown> | null;
}

export interface HeatmapDatum {
  x: number;
  y: number;
  value: number;
}

export interface ToolResultLike {
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export type ResultPayload = Record<string, unknown>;
export type ResultKind = 'simulation' | 'contact-map' | 'model' | 'parameter-scan' | 'validation' | 'error' | 'unknown';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTextPayload(result: ToolResultLike): Record<string, unknown> | undefined {
  const text = result.content?.find((item) => item.type === 'text' && typeof item.text === 'string')?.text;
  if (!text) return undefined;

  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function extractResultPayload(result: ToolResultLike): ResultPayload | undefined {
  if (isRecord(result.structuredContent)) return result.structuredContent;
  return parseTextPayload(result);
}

export function classifyResultPayload(payload: ResultPayload | undefined): ResultKind {
  if (!payload) return 'unknown';
  if (typeof payload.error === 'string') return 'error';

  if (isValidationPayload(payload)) return 'validation';
  if (isParameterScanPayload(payload)) return 'parameter-scan';
  if (isModelParsePayload(payload)) return 'model';
  if (isContactMapPayload(payload)) return 'contact-map';
  if (isSimulationPayload(payload)) return 'simulation';

  return 'unknown';
}

export function isModelParsePayload(
  payload: ResultPayload,
): payload is ResultPayload & ModelParsePayload {
  return typeof payload.success === 'boolean' && Array.isArray(payload.errors)
    && (payload.model === undefined || isRecord(payload.model));
}

export function isParameterScanPayload(
  payload: ResultPayload,
): payload is ResultPayload & ParameterScanPayload {
  return (payload.mode === '1d' || payload.mode === '2d')
    && typeof payload.parameter === 'string'
    && Array.isArray(payload.xValues)
    && isRecord(payload.observables);
}

export function isValidationPayload(
  payload: ResultPayload,
): payload is ResultPayload & ValidationPayload {
  return typeof payload.valid === 'boolean'
    && typeof payload.parseSuccess === 'boolean'
    && isRecord(payload.summary)
    && Array.isArray(payload.errors)
    && Array.isArray(payload.warnings)
    && Array.isArray(payload.info);
}

export function isSimulationPayload(
  payload: ResultPayload,
): payload is ResultPayload & SimulationPayload {
  return Array.isArray(payload.headers) && Array.isArray(payload.data);
}

export function isContactMapPayload(
  payload: ResultPayload,
): payload is ResultPayload & ContactMapPayload {
  return Array.isArray(payload.nodes) && Array.isArray(payload.edges);
}

export function getSimulationSeries(payload: SimulationPayload): string[] {
  const declared = payload.headers.filter((header) => header !== 'time');
  if (declared.length > 0) return declared;

  const firstRow = payload.data[0];
  return firstRow ? Object.keys(firstRow).filter((key) => key !== 'time') : [];
}

export function getSimulationData(
  payload: SimulationPayload,
  suffix: string | undefined,
): NumericRow[] {
  if (suffix && payload.dataBySuffix?.[suffix]) return payload.dataBySuffix[suffix];
  return payload.data;
}

export function getParameterScanSeries(payload: ParameterScanPayload): string[] {
  return Object.entries(payload.observables)
    .filter(([, values]) => Array.isArray(values))
    .map(([name]) => name);
}

export function getParameterScanRows(payload: ParameterScanPayload): NumericRow[] {
  if (payload.mode !== '1d') return [];
  const names = getParameterScanSeries(payload);
  return payload.xValues.map((x, index) => {
    const row: NumericRow = { [payload.parameter]: x };
    for (const name of names) {
      const values = payload.observables[name];
      const value = Array.isArray(values) ? values[index] : undefined;
      if (typeof value === 'number') row[name] = value;
    }
    return row;
  });
}

export function getParameterScanHeatmap(
  payload: ParameterScanPayload,
  observable: string,
): HeatmapDatum[] {
  if (payload.mode !== '2d' || !payload.yValues) return [];
  const matrix = payload.observables[observable];
  if (!Array.isArray(matrix)) return [];

  const data: HeatmapDatum[] = [];
  for (let yIndex = 0; yIndex < payload.yValues.length; yIndex += 1) {
    const row = matrix[yIndex];
    if (!Array.isArray(row)) continue;
    for (let xIndex = 0; xIndex < payload.xValues.length; xIndex += 1) {
      const value = row[xIndex];
      if (typeof value === 'number') {
        data.push({
          x: payload.xValues[xIndex],
          y: payload.yValues[yIndex],
          value,
        });
      }
    }
  }
  return data;
}
