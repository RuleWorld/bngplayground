import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  RuleHubClient,
  embeddingRecordToCandidate,
  getMatchedFeatures,
  matchesSearchFilters,
  rankCandidates,
  type RuleHubEmbeddingRecord,
  type RuleHubModelEntry,
  type SearchModelsInput,
} from '@bngplayground/rulehub';

interface EmbeddingsIndex {
  version?: number;
  model?: string;
  dimensions?: number;
  count?: number;
  generated?: string;
  models: RuleHubEmbeddingRecord[];
}

export interface SearchModelsResult {
  query: string;
  search_mode: 'semantic' | 'lexical_fallback';
  rulehub: {
    repository: 'RuleWorld/RuleHub';
    ref: string;
    revision: string | null;
  };
  results: Array<{
    id: string;
    name: string;
    description?: string;
    path: string;
    origin?: string;
    tags: string[];
    citation?: RuleHubModelEntry['citation'];
    compatibility?: RuleHubModelEntry['compatibility'];
    matched_features: string[];
    score: number;
    resource_uri: string;
  }>;
}

let client: RuleHubClient | null = null;
let indexPromise: Promise<EmbeddingsIndex | null> | null = null;
let embedderPromise: Promise<(query: string) => Promise<number[]>> | null = null;

function getClient(): RuleHubClient {
  if (!client) client = new RuleHubClient();
  return client;
}

function embeddingCandidates(): string[] {
  const configured = process.env.RULEHUB_EMBEDDINGS_PATH?.trim();
  return [
    configured,
    resolve(process.cwd(), 'public', 'model-embeddings.json'),
    resolve(process.cwd(), 'model-embeddings.json'),
  ].filter((value): value is string => Boolean(value));
}

async function loadEmbeddingsIndex(): Promise<EmbeddingsIndex | null> {
  if (!indexPromise) {
    indexPromise = (async () => {
      for (const filename of embeddingCandidates()) {
        try {
          const parsed = JSON.parse(await readFile(filename, 'utf8')) as Partial<EmbeddingsIndex>;
          if (!Array.isArray(parsed.models)) continue;
          const models = parsed.models.filter((record): record is RuleHubEmbeddingRecord =>
            typeof record?.id === 'string'
            && Array.isArray(record.embedding)
            && record.embedding.every((value) => typeof value === 'number'),
          );
          return { ...parsed, models };
        } catch {
          // The package can run without a generated semantic index.
        }
      }
      return null;
    })();
  }
  return indexPromise;
}

async function getQueryEmbedder(): Promise<(query: string) => Promise<number[]>> {
  if (!embedderPromise) {
    embedderPromise = (async () => {
      const transformers = await import('@xenova/transformers');
      const pipeline = await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      return async (query: string) => {
        const output = await pipeline(query, { pooling: 'mean', normalize: true });
        if (!output || !('data' in output) || !output.data) {
          throw new Error('Embedding pipeline returned unexpected output');
        }
        return Array.from(output.data as Iterable<number>);
      };
    })();
  }
  return embedderPromise;
}

export async function searchRuleHubModels(
  input: SearchModelsInput,
  options: { client?: RuleHubClient } = {},
): Promise<SearchModelsResult> {
  const ruleHubClient = options.client ?? getClient();
  const manifest = await ruleHubClient.getManifest();
  const candidates = manifest.models
    .filter((entry) => matchesSearchFilters(entry, input));
  const index = await loadEmbeddingsIndex();
  const records = new Map(index?.models.map((record) => [record.id, record]) ?? []);
  let queryEmbedding: number[] | undefined;
  let searchMode: SearchModelsResult['search_mode'] = 'lexical_fallback';
  if (index) {
    try {
      queryEmbedding = await (await getQueryEmbedder())(input.query);
      searchMode = 'semantic';
    } catch {
      // Lexical ranking remains deterministic and useful when the model cannot load.
    }
  }
  const ranked = rankCandidates(
    input.query,
    candidates.map((entry) => {
      const record = records.get(entry.id);
      return record ? embeddingRecordToCandidate(record, entry) : { entry };
    }),
    queryEmbedding,
  );
  const limit = Math.min(20, Math.max(1, input.limit ?? 5));
  return {
    query: input.query,
    search_mode: searchMode,
    rulehub: {
      repository: manifest.repository,
      ref: manifest.ref,
      revision: manifest.revision,
    },
    results: ranked.slice(0, limit).map(({ entry, score }) => ({
      id: entry.id,
      name: entry.name,
      ...(entry.description ? { description: entry.description } : {}),
      path: entry.path,
      ...(entry.origin ? { origin: entry.origin } : {}),
      tags: entry.tags,
      ...(entry.citation ? { citation: entry.citation } : {}),
      ...(entry.compatibility ? { compatibility: entry.compatibility } : {}),
      matched_features: getMatchedFeatures(input.query, entry),
      score,
      resource_uri: `rulehub://model/${encodeURIComponent(entry.id)}`,
    })),
  };
}

export function resetRuleHubSearchState(): void {
  client = null;
  indexPromise = null;
  embedderPromise = null;
}
