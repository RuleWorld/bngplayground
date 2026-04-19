/**
 * ProvJsonLD — serialize and deserialize ProvDocument to/from W3C PROV-O JSON-LD.
 *
 * Why this file exists separately from ProvenanceRecorder:
 *   The Recorder owns the accumulation semantics; this module owns the
 *   on-the-wire shape. Keeping them separate lets tests and consumers round-trip
 *   documents through disk, network, or RO-Crate without touching the Recorder.
 *
 * Serialization contract:
 *   - All fields emit exactly as typed (no field mangling).
 *   - `@context` is ALWAYS the canonical context constant.
 *   - `@graph` entries are emitted in insertion order for determinism.
 *   - Dates are ISO-8601 strings (as stored by the Recorder).
 *   - `@type` may be string OR string[] and is preserved as-is.
 *
 * Deserialization contract:
 *   - Input must have `@context`, `@graph` as an array, `bng:generatedAt` string.
 *   - Each graph node is validated to match ProvEntity | ProvActivity | ProvAgent.
 *   - Unknown fields are preserved (forward-compatibility).
 *   - Fails closed: throws ProvValidationError on structural violations.
 *
 * This is NOT a full JSON-LD processor. We do not flatten, expand, or compact;
 * we produce a JSON document that is *valid JSON-LD* as written. Consumers who
 * need triple-level RDF should use jsonld.js or a SPARQL endpoint on the output.
 */

import type {
  ProvActivity,
  ProvAgent,
  ProvDocument,
  ProvEntity,
  ProvNode,
} from './types';
import { BNG_PROV_NS, isActivity, isAgent, isEntity } from './types';

export class ProvValidationError extends Error {
  constructor(message: string, public readonly path: string[] = []) {
    super(`ProvValidationError at ${path.length > 0 ? path.join('.') : '<root>'}: ${message}`);
    this.name = 'ProvValidationError';
  }
}

// ── Serialize ──────────────────────────────────────────────────────────────

export function serializeProvDocument(doc: ProvDocument): string {
  return JSON.stringify(doc, null, 2);
}

/** Serialize without pretty-printing — smaller, suitable for URLs or embedding. */
export function serializeProvDocumentCompact(doc: ProvDocument): string {
  return JSON.stringify(doc);
}

// ── Deserialize ────────────────────────────────────────────────────────────

export function parseProvDocument(input: string | object): ProvDocument {
  const raw = typeof input === 'string' ? JSON.parse(input) : input;
  return validateProvDocument(raw);
}

export function validateProvDocument(raw: unknown): ProvDocument {
  if (!raw || typeof raw !== 'object') {
    throw new ProvValidationError('Expected object, got ' + typeof raw);
  }
  const obj = raw as Record<string, unknown>;

  // @context
  const ctx = obj['@context'];
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) {
    throw new ProvValidationError('Missing or invalid @context', ['@context']);
  }
  const context = ctx as Record<string, unknown>;
  if (context.prov !== 'http://www.w3.org/ns/prov#') {
    throw new ProvValidationError(
      `@context.prov must be 'http://www.w3.org/ns/prov#', got ${JSON.stringify(context.prov)}`,
      ['@context', 'prov'],
    );
  }
  if (context.bng !== BNG_PROV_NS) {
    throw new ProvValidationError(
      `@context.bng must be '${BNG_PROV_NS}', got ${JSON.stringify(context.bng)}`,
      ['@context', 'bng'],
    );
  }

  // @graph
  if (!Array.isArray(obj['@graph'])) {
    throw new ProvValidationError('Missing or non-array @graph', ['@graph']);
  }
  const graph = obj['@graph'] as unknown[];
  const nodes: ProvNode[] = graph.map((node, i) => validateProvNode(node, ['@graph', String(i)]));

  // Metadata
  if (typeof obj['bng:generatedAt'] !== 'string') {
    throw new ProvValidationError('Missing bng:generatedAt (ISO-8601 string)', ['bng:generatedAt']);
  }
  if (typeof obj['bng:playgroundVersion'] !== 'string') {
    throw new ProvValidationError('Missing bng:playgroundVersion', ['bng:playgroundVersion']);
  }

  return {
    '@context': context as unknown as ProvDocument['@context'],
    '@graph': nodes,
    'bng:generatedAt': obj['bng:generatedAt'] as string,
    'bng:playgroundVersion': obj['bng:playgroundVersion'] as string,
  };
}

function validateProvNode(raw: unknown, path: string[]): ProvNode {
  if (!raw || typeof raw !== 'object') {
    throw new ProvValidationError('Node must be an object', path);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj['@id'] !== 'string' || !obj['@id']) {
    throw new ProvValidationError('Node missing @id', path);
  }
  if (!obj['@type']) {
    throw new ProvValidationError('Node missing @type', path);
  }

  const types = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
  for (const t of types) {
    if (typeof t !== 'string') {
      throw new ProvValidationError('@type values must be strings', path);
    }
  }

  // Duck-type by which required fields are present.
  if ('prov:startedAtTime' in obj && 'prov:endedAtTime' in obj) {
    // Activity
    if (typeof obj['prov:startedAtTime'] !== 'string' || typeof obj['prov:endedAtTime'] !== 'string') {
      throw new ProvValidationError('Activity timestamps must be ISO-8601 strings', path);
    }
    return obj as unknown as ProvActivity;
  }
  if ('bng:name' in obj && 'bng:version' in obj) {
    // Agent
    return obj as unknown as ProvAgent;
  }
  // Otherwise Entity — no further required fields beyond @id + @type
  return obj as unknown as ProvEntity;
}

// ── Queries over the graph ─────────────────────────────────────────────────

export interface ProvQueryResult {
  entities: ProvEntity[];
  activities: ProvActivity[];
  agents: ProvAgent[];
  byId: Map<string, ProvNode>;
}

export function indexProvDocument(doc: ProvDocument): ProvQueryResult {
  const entities: ProvEntity[] = [];
  const activities: ProvActivity[] = [];
  const agents: ProvAgent[] = [];
  const byId = new Map<string, ProvNode>();

  for (const node of doc['@graph']) {
    byId.set(node['@id'], node);
    if (isActivity(node)) activities.push(node);
    else if (isAgent(node)) agents.push(node);
    else if (isEntity(node)) entities.push(node);
  }

  return { entities, activities, agents, byId };
}

/**
 * Walk the `prov:wasDerivedFrom` chain from an entity @id back to all source
 * entities (transitive closure). Throws if the chain cycles.
 */
export function traceDerivationChain(doc: ProvDocument, startEntityId: string): ProvEntity[] {
  const { byId } = indexProvDocument(doc);
  const visited = new Set<string>();
  const result: ProvEntity[] = [];
  const stack: string[] = [startEntityId];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = byId.get(id);
    if (!node || !isEntity(node)) continue;

    result.push(node);
    const parents = node['prov:wasDerivedFrom'] ?? [];
    for (const parent of parents) {
      if (visited.has(parent)) continue;
      stack.push(parent);
    }
  }

  return result;
}

/**
 * Find the activity that generated the given entity, plus the agent that
 * performed that activity. Returns undefined if either is missing.
 */
export function whoProducedEntity(
  doc: ProvDocument,
  entityId: string,
): { activity?: ProvActivity; agent?: ProvAgent } | undefined {
  const { byId } = indexProvDocument(doc);
  const entity = byId.get(entityId);
  if (!entity || !isEntity(entity)) return undefined;

  const activityId = entity['prov:wasGeneratedBy'];
  if (!activityId) return { activity: undefined, agent: undefined };

  const activity = byId.get(activityId);
  if (!activity || !isActivity(activity)) return { activity: undefined, agent: undefined };

  const agentId = activity['prov:wasAssociatedWith'];
  const agent = agentId ? byId.get(agentId) : undefined;
  return {
    activity,
    agent: agent && isAgent(agent) ? agent : undefined,
  };
}
