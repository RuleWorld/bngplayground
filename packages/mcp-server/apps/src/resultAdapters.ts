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

export interface ToolResultLike {
  structuredContent?: Record<string, unknown>;
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export type ResultPayload = Record<string, unknown>;
export type ResultKind = 'simulation' | 'contact-map' | 'error' | 'unknown';

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

  if (isContactMapPayload(payload)) return 'contact-map';
  if (isSimulationPayload(payload)) return 'simulation';

  return 'unknown';
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
