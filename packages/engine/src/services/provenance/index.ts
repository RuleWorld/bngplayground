/**
 * Provenance barrel — single import point.
 *
 * Usage:
 *   import {
 *     ProvenanceRecorder,
 *     buildROCrate,
 *     serializeProvDocument,
 *     parseProvDocument,
 *     traceDerivationChain,
 *   } from '@ruleworld/engine/provenance';
 */

export type {
  ProvContext,
  ProvDocument,
  ProvEntity,
  ProvActivity,
  ProvAgent,
  ProvNode,
  EntityType,
  ActivityType,
  AgentType,
  IsoDateTime,
} from './types';

export { BNG_PROV_NS, isActivity, isAgent, isEntity } from './types';

export { ProvenanceRecorder } from './ProvenanceRecorder';
export type { ProvenanceRecorderConfig } from './ProvenanceRecorder';

export {
  serializeProvDocument,
  serializeProvDocumentCompact,
  parseProvDocument,
  validateProvDocument,
  indexProvDocument,
  traceDerivationChain,
  whoProducedEntity,
  ProvValidationError,
} from './ProvJsonLD';
export type { ProvQueryResult } from './ProvJsonLD';

export { buildROCrate } from './ROCrate';
export type { ROCrateConfig } from './ROCrate';

export {
  sha256Async,
  sha256Normalized,
  sha256OfParams,
  sha256OfNetwork,
} from './HashComputer';
