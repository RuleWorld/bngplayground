export interface RuleHubCompatibility {
  bng2?: boolean;
  nfsim?: boolean;
  excluded?: boolean;
  methods?: string[];
}

export interface RuleHubCitation {
  year?: string;
  doi?: string;
  pmid?: string;
  url?: string;
  reference?: string;
}

export interface RuleHubModelEntry {
  id: string;
  name: string;
  description?: string;
  path: string;
  file?: string;
  tags: string[];
  category?: string;
  origin?: string;
  visible?: boolean;
  featured?: boolean;
  difficulty?: string;
  compatibility?: RuleHubCompatibility;
  citation?: RuleHubCitation;
  features?: Record<string, boolean | string | undefined>;
  /** Legacy manifest alias retained for browser/build consumers during migration. */
  bng2_compatible?: boolean;
  rawUrl?: string;
}

export interface RuleHubManifest {
  models: RuleHubModelEntry[];
  totalModels: number;
  generated: string;
  repository: 'RuleWorld/RuleHub';
  ref: string;
  revision: string | null;
  sourceUrl?: string;
}

export interface RuleHubProvenance {
  repository: 'RuleWorld/RuleHub';
  ref: string;
  path: string;
  model_id: string;
  citation?: RuleHubCitation;
  retrieved_at: string;
  revision: string | null;
}

export interface RuleHubResolvedModel {
  id: string;
  code: string;
  metadata: RuleHubModelEntry;
  provenance: RuleHubProvenance;
}

export interface RuleHubClientOptions {
  manifestUrl?: string;
  rawBaseUrl?: string;
  ref?: string;
  revision?: string | null;
  fetchImpl?: typeof fetch;
}

export interface RuleHubEmbeddingRecord {
  id: string;
  filename: string;
  path: string;
  name?: string;
  description?: string;
  tags: string[];
  category?: string;
  origin?: string;
  compatibility?: RuleHubCompatibility;
  features?: Record<string, boolean>;
  preview?: string;
  embedding: number[];
}

export interface SearchModelsInput {
  query: string;
  limit?: number;
  origin?: string[];
  tags?: string[];
  simulation_methods?: string[];
  bng2_compatible?: boolean;
  nfsim_compatible?: boolean;
  features?: string[];
  include_excluded?: boolean;
}
