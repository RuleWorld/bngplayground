/**
 * ProvenanceRecorder — accumulates PROV-O entities/activities/agents during
 * a simulation run and finalizes to a ProvDocument.
 *
 * Usage from SimulationLoop:
 *   const recorder = new ProvenanceRecorder();
 *   const modelEntity = recorder.recordParse(bnglSource, modelId);
 *   const { entity: netEntity } = recorder.recordNetworkGen(modelEntity['@id'], { nSpecies, nReactions });
 *   const { outputEntity } = recorder.recordSimulation({ ... });
 *   recorder.markComplete({ elapsedMs, nSteps });
 *   return recorder.finalize();
 */

import { sha256Normalized, sha256OfParams, sha256OfNetwork } from './HashComputer';
import type {
  ProvAgent,
  ProvActivity,
  ProvContext,
  ProvDocument,
  ProvEntity,
  ProvNode,
} from './types';
import { BNG_PROV_NS } from './types';

// Engine commit SHA is injected at build time via Vite define().
// Falls back to 'dev' in test/dev environments.
declare const __BNG_ENGINE_COMMIT__: string;
declare const __BNG_ENGINE_VERSION__: string;
const ENGINE_COMMIT =
  typeof __BNG_ENGINE_COMMIT__ !== 'undefined' ? __BNG_ENGINE_COMMIT__ : 'dev';
const ENGINE_VERSION =
  typeof __BNG_ENGINE_VERSION__ !== 'undefined' ? __BNG_ENGINE_VERSION__ : '0.0.0';

const DEFAULT_CONTEXT: ProvContext = {
  prov: 'http://www.w3.org/ns/prov#',
  bng: BNG_PROV_NS,
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
};

export interface ProvenanceRecorderConfig {
  /** Optional override for the engine agent ID. */
  agentId?: string;
  /** Session UUID; generated if not supplied. */
  sessionId?: string;
  /** Include per-WASM-module agents in the document. */
  includeWasmAgents?: boolean;
  /** Map of WASM module name → sha256 hex. */
  wasmShas?: Record<string, string>;
  /** Clock injection for deterministic tests. */
  now?: () => Date;
}

export class ProvenanceRecorder {
  private nodes: ProvNode[] = [];
  private agentId: string;
  private now: () => Date;

  constructor(config: ProvenanceRecorderConfig = {}) {
    this.now = config.now ?? (() => new Date());
    this.agentId = config.agentId ?? `urn:bng:agent:engine:${ENGINE_VERSION}+${ENGINE_COMMIT}`;

    // Always emit the engine agent.
    const engineAgent: ProvAgent = {
      '@id': this.agentId,
      '@type': ['prov:SoftwareAgent', 'bng:BNGPlaygroundEngine'],
      'bng:name': 'BNG Playground Engine',
      'bng:version': ENGINE_VERSION,
      'bng:commit': ENGINE_COMMIT,
      'rdfs:label': `BNG Playground Engine ${ENGINE_VERSION} (${ENGINE_COMMIT})`,
    };
    this.nodes.push(engineAgent);

    if (config.includeWasmAgents ?? true) {
      const wasmShas = config.wasmShas ?? {};
      for (const [name, sha] of Object.entries(wasmShas)) {
        const wasmAgent: ProvAgent = {
          '@id': `urn:bng:agent:wasm:${name}:${sha}`,
          '@type': ['prov:SoftwareAgent', 'bng:WASMModule'],
          'bng:name': name,
          'bng:version': sha.slice(0, 12),
          'bng:wasmModule': name,
          'bng:wasmSha256': sha,
          'rdfs:label': `WASM module ${name} (sha256:${sha.slice(0, 12)}...)`,
        };
        this.nodes.push(wasmAgent);
      }
    }
  }

  recordParse(bnglSource: string, modelId: string): ProvEntity {
    const t0 = this.now().toISOString();
    const sha = sha256Normalized(bnglSource);
    const entityId = `urn:bng:model:sha256:${sha}`;
    const activityId = `urn:bng:activity:parse:${generateUuid()}`;

    const activity: ProvActivity = {
      '@id': activityId,
      '@type': ['prov:Activity', 'bng:Parse'],
      'prov:startedAtTime': t0,
      'prov:endedAtTime': this.now().toISOString(),
      'prov:wasAssociatedWith': this.agentId,
      'rdfs:label': `Parse BNGL source (${bnglSource.length} bytes)`,
    };

    const entity: ProvEntity = {
      '@id': entityId,
      '@type': ['prov:Entity', 'bng:BNGLSource'],
      'prov:wasGeneratedBy': activityId,
      'prov:wasAttributedTo': this.agentId,
      'bng:sha256': sha,
      'bng:byteSize': bnglSource.length,
      'bng:properties': { modelId },
      'rdfs:label': `BNGL source (${modelId})`,
    };

    this.nodes.push(activity, entity);
    return entity;
  }

  recordNetworkGen(
    sourceEntityId: string,
    stats: { nSpecies: number; nReactions: number; networkSerialized?: string },
  ): { entity: ProvEntity; activity: ProvActivity } {
    const t0 = this.now().toISOString();
    const activityId = `urn:bng:activity:netgen:${generateUuid()}`;

    const netSha = stats.networkSerialized
      ? sha256OfNetwork(stats.networkSerialized)
      : `computed:${stats.nSpecies}x${stats.nReactions}`;
    const entityId = `urn:bng:network:sha256:${netSha}`;

    const activity: ProvActivity = {
      '@id': activityId,
      '@type': ['prov:Activity', 'bng:NetworkGeneration'],
      'prov:startedAtTime': t0,
      'prov:endedAtTime': this.now().toISOString(),
      'prov:wasAssociatedWith': this.agentId,
      'prov:used': [sourceEntityId],
      'bng:stats': { nSpecies: stats.nSpecies, nReactions: stats.nReactions },
      'rdfs:label': `Generate network (${stats.nSpecies} species, ${stats.nReactions} reactions)`,
    };

    const entity: ProvEntity = {
      '@id': entityId,
      '@type': ['prov:Entity', 'bng:ExpandedNetwork'],
      'prov:wasGeneratedBy': activityId,
      'prov:wasDerivedFrom': [sourceEntityId],
      'prov:wasAttributedTo': this.agentId,
      'bng:sha256': netSha,
      'bng:properties': { nSpecies: stats.nSpecies, nReactions: stats.nReactions },
      'rdfs:label': `Expanded reaction network`,
    };

    this.nodes.push(activity, entity);
    return { entity, activity };
  }

  recordSimulation(config: {
    modelEntityId: string;
    networkEntityId?: string;
    solver: string;
    solverConfig: Record<string, unknown>;
    parameterVector: Record<string, number>;
    tSpan: [number, number];
    nSteps: number;
    wasmAgentIds?: string[];
  }): { outputEntity: ProvEntity; activity: ProvActivity } {
    const t0 = this.now().toISOString();
    const activityId = `urn:bng:activity:simulate:${generateUuid()}`;
    const outputId = `urn:bng:output:${generateUuid()}`;

    // Record the parameter vector as its own entity (content-addressed).
    const paramSha = sha256OfParams(config.parameterVector);
    const paramEntityId = `urn:bng:params:sha256:${paramSha}`;

    const paramEntity: ProvEntity = {
      '@id': paramEntityId,
      '@type': ['prov:Entity', 'bng:ParameterVector'],
      'prov:wasAttributedTo': this.agentId,
      'bng:sha256': paramSha,
      'bng:byteSize': JSON.stringify(config.parameterVector).length,
      'bng:properties': {
        nParams: Object.keys(config.parameterVector).length,
      },
      'rdfs:label': `Parameter vector (${Object.keys(config.parameterVector).length} params)`,
    };

    const used: string[] = [config.modelEntityId, paramEntityId];
    if (config.networkEntityId) used.push(config.networkEntityId);

    const activity: ProvActivity = {
      '@id': activityId,
      '@type': ['prov:Activity', 'bng:Simulate'],
      'prov:startedAtTime': t0,
      'prov:endedAtTime': this.now().toISOString(), // overwritten at markComplete
      'prov:wasAssociatedWith': this.agentId,
      'prov:used': [...used, ...(config.wasmAgentIds ?? [])],
      'bng:config': {
        solver: config.solver,
        ...config.solverConfig,
        tSpan: config.tSpan,
        nSteps: config.nSteps,
      },
      'rdfs:label': `Simulate ${config.solver} from t=${config.tSpan[0]} to t=${config.tSpan[1]}`,
    };

    const outputEntity: ProvEntity = {
      '@id': outputId,
      '@type': ['prov:Entity', 'bng:SimulationOutput'],
      'prov:wasGeneratedBy': activityId,
      'prov:wasDerivedFrom': used,
      'prov:wasAttributedTo': this.agentId,
      'bng:properties': {
        solver: config.solver,
        nSteps: config.nSteps,
        tEnd: config.tSpan[1],
      },
      'rdfs:label': `Simulation output (${config.solver})`,
    };

    this.nodes.push(paramEntity, activity, outputEntity);
    return { outputEntity, activity };
  }

  markComplete(stats: { elapsedMs: number; nSteps: number }): void {
    const lastActivity = [...this.nodes].reverse().find((n): n is ProvActivity =>
      'prov:startedAtTime' in n && Array.isArray(n['@type']) && n['@type'].includes('bng:Simulate'),
    );
    if (lastActivity) {
      lastActivity['prov:endedAtTime'] = this.now().toISOString();
      lastActivity['bng:stats'] = { ...(lastActivity['bng:stats'] ?? {}), ...stats };
    }
  }

  finalize(): ProvDocument {
    return {
      '@context': DEFAULT_CONTEXT,
      '@graph': this.nodes,
      'bng:generatedAt': this.now().toISOString(),
      'bng:playgroundVersion': ENGINE_VERSION,
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

let fallbackUuidCounter = 0;

function generateUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Last-resort fallback for non-crypto runtimes.
  fallbackUuidCounter += 1;
  return `fallback-${Date.now().toString(16)}-${fallbackUuidCounter.toString(16)}`;
}
