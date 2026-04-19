/**
 * Provenance types for BNG Playground.
 *
 * Encodes W3C PROV-O JSON-LD with a BNG-specific namespace extension.
 * Reference: https://www.w3.org/TR/prov-o/
 * Reference: https://www.w3.org/TR/json-ld11/
 *
 * The BNG namespace (bng:) is defined as:
 *   https://ruleworld.github.io/bngplayground/ns/prov#
 *
 * Entity IDs are URNs with a stable structure:
 *   urn:bng:model:sha256:<hash>           — BNGL source
 *   urn:bng:network:sha256:<hash>         — expanded reaction network
 *   urn:bng:params:sha256:<hash>          — parameter vector
 *   urn:bng:output:<uuid>                 — simulation output (run-specific)
 *   urn:bng:activity:<kind>:<uuid>        — activity
 *   urn:bng:agent:engine:<version>        — engine agent
 *   urn:bng:agent:wasm:<module>:<sha256>  — WASM module agent
 */

export const BNG_PROV_NS = 'https://ruleworld.github.io/bngplayground/ns/prov#';

export type IsoDateTime = string; // ISO-8601 with timezone

export interface ProvContext {
  prov: 'http://www.w3.org/ns/prov#';
  bng: typeof BNG_PROV_NS;
  xsd: 'http://www.w3.org/2001/XMLSchema#';
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#';
}

export type EntityType =
  | 'prov:Entity'
  | 'bng:BNGLSource'
  | 'bng:ExpandedNetwork'
  | 'bng:ParameterVector'
  | 'bng:SimulationOutput'
  | 'bng:ObservableTimeSeries';

export type ActivityType =
  | 'prov:Activity'
  | 'bng:Parse'
  | 'bng:NetworkGeneration'
  | 'bng:Simulate'
  | 'bng:ParameterEstimation'
  | 'bng:Inference';

export type AgentType =
  | 'prov:SoftwareAgent'
  | 'bng:BNGPlaygroundEngine'
  | 'bng:WASMModule';

export interface ProvEntity {
  '@id': string;
  '@type': EntityType | EntityType[];
  'prov:wasGeneratedBy'?: string;
  'prov:wasDerivedFrom'?: string[];
  'prov:wasAttributedTo'?: string;
  'bng:sha256'?: string;
  'bng:byteSize'?: number;
  'bng:properties'?: Record<string, string | number | boolean>;
  'rdfs:label'?: string;
}

export interface ProvActivity {
  '@id': string;
  '@type': ActivityType | ActivityType[];
  'prov:startedAtTime': IsoDateTime;
  'prov:endedAtTime': IsoDateTime;
  'prov:wasAssociatedWith'?: string;
  'prov:used'?: string[];
  'bng:config'?: Record<string, unknown>;
  'bng:stats'?: Record<string, number>;
  'rdfs:label'?: string;
}

export interface ProvAgent {
  '@id': string;
  '@type': AgentType | AgentType[];
  'bng:name': string;
  'bng:version': string;
  'bng:commit'?: string;
  'bng:wasmSha256'?: string;
  'bng:wasmModule'?: string;
  'rdfs:label'?: string;
}

export type ProvNode = ProvEntity | ProvActivity | ProvAgent;

export interface ProvDocument {
  '@context': ProvContext;
  '@graph': ProvNode[];
  'bng:generatedAt': IsoDateTime;
  'bng:playgroundVersion': string;
}

// ── Type guards ────────────────────────────────────────────────────────────

export function isActivity(node: ProvNode): node is ProvActivity {
  return 'prov:startedAtTime' in node;
}

export function isAgent(node: ProvNode): node is ProvAgent {
  return 'bng:name' in node && 'bng:version' in node;
}

export function isEntity(node: ProvNode): node is ProvEntity {
  return !isActivity(node) && !isAgent(node);
}
