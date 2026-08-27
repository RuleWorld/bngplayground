import { isBng2Compatible, isExcludedModel, isNfsimCompatible } from './manifest.js';
import type {
  RuleHubEmbeddingRecord,
  RuleHubModelEntry,
  SearchModelsInput,
} from './types.js';

export interface RuleHubSearchCandidate {
  entry: RuleHubModelEntry;
  embedding?: number[];
  preview?: string;
  filename?: string;
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function tokens(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function includesToken(queryTokens: string[], values: string[]): boolean {
  return queryTokens.some((token) => values.some((value) => tokens(value).includes(token)));
}

export function lexicalRelevance(query: string, entry: RuleHubModelEntry): number {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return 0;
  const fields = [entry.id, entry.name, entry.description ?? '', ...entry.tags, entry.category ?? ''];
  const matched = queryTokens.filter((token) => fields.some((field) => tokens(field).includes(token)));
  return matched.length / queryTokens.length;
}

export function lexicalBonus(query: string, entry: RuleHubModelEntry): number {
  const queryTokens = tokens(query);
  const idTokens = tokens(entry.id);
  const nameTokens = tokens(entry.name);
  const tagTokens = entry.tags.flatMap(tokens);
  let bonus = 0;
  if (queryTokens.some((token) => idTokens.includes(token))) bonus += 0.15;
  if (queryTokens.some((token) => nameTokens.includes(token))) bonus += 0.10;
  if (queryTokens.some((token) => tagTokens.includes(token) || tokens(entry.category ?? '').includes(token))) bonus += 0.05;
  return Math.min(0.20, bonus);
}

export function matchesSearchFilters(entry: RuleHubModelEntry, input: SearchModelsInput): boolean {
  if (!input.include_excluded && isExcludedModel(entry)) return false;
  if (input.origin?.length && !input.origin.some((origin) => origin === entry.origin)) return false;
  if (input.tags?.length && !input.tags.every((tag) => entry.tags.includes(tag))) return false;
  if (input.simulation_methods?.length) {
    const methods = entry.compatibility?.methods ?? [];
    if (!input.simulation_methods.some((method) => methods.includes(method))) return false;
  }
  if (input.bng2_compatible !== undefined && isBng2Compatible(entry) !== input.bng2_compatible) return false;
  if (input.nfsim_compatible !== undefined && isNfsimCompatible(entry) !== input.nfsim_compatible) return false;
  if (input.features?.length && !input.features.every((feature) => entry.features?.[feature] === true)) return false;
  return true;
}

export function scoreCandidate(
  query: string,
  candidate: RuleHubSearchCandidate,
  queryEmbedding?: readonly number[],
): number {
  const semantic = queryEmbedding && candidate.embedding
    ? clamp((cosineSimilarity(queryEmbedding, candidate.embedding) + 1) / 2)
    : lexicalRelevance(query, candidate.entry);
  return Math.min(1, semantic + lexicalBonus(query, candidate.entry));
}

export function rankCandidates(
  query: string,
  candidates: RuleHubSearchCandidate[],
  queryEmbedding?: readonly number[],
): Array<RuleHubSearchCandidate & { score: number }> {
  return candidates
    .map((candidate) => ({ ...candidate, score: scoreCandidate(query, candidate, queryEmbedding) }))
    .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id));
}

export function embeddingRecordToCandidate(
  record: RuleHubEmbeddingRecord,
  entry: RuleHubModelEntry,
): RuleHubSearchCandidate {
  return {
    entry,
    embedding: record.embedding,
    preview: record.preview,
    filename: record.filename,
  };
}

export function getMatchedFeatures(query: string, entry: RuleHubModelEntry): string[] {
  const queryTokens = tokens(query);
  return Object.keys(entry.features ?? {}).filter((feature) =>
    entry.features?.[feature] === true && includesToken(queryTokens, [feature]),
  );
}
