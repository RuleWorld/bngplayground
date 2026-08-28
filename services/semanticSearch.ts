/**
 * Semantic search service for BNGL models.
 * Uses pre-computed embeddings (generated at build time) and
 * computes query embeddings at runtime using Transformers.js.
 * 
 * No external API calls - runs entirely in the browser.
 */

import { cosineSimilarity as sharedCosineSimilarity } from '@bngplayground/rulehub';

// Dynamic import to avoid type issues until package is installed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pipeline = any;

interface ModelEmbedding {
  id: string;
  filename: string;
  path: string;
  category: string;
  embedding: number[];
  preview: string;
}

interface EmbeddingsIndex {
  version: number;
  model: string;
  dimensions: number;
  count: number;
  generated: string;
  models: ModelEmbedding[];
}

export interface SearchResult {
  id: string;
  filename: string;
  path: string;
  category: string;
  preview: string;
  score: number;
}

// Singleton instances
let embedder: Pipeline | null = null;
let embeddingsIndex: EmbeddingsIndex | null = null;
let isLoading = false;
let loadError: Error | null = null;

export function resetSemanticSearchState() {
  embedder = null;
  embeddingsIndex = null;
  isLoading = false;
  loadError = null;
}

/**
 * Load the embedding model (lazy, cached).
 */
async function getEmbedder(): Promise<Pipeline> {
  if (embedder) return embedder;

  if (isLoading) {
    // Wait for ongoing load
    while (isLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (loadError) throw loadError;
    return embedder!;
  }

  isLoading = true;
  try {
    console.log('[SemanticSearch] Loading embedding model...');

    // Use a small runtime loader that picks the correct transformers backend
    // for the current environment (browser: UMD on window or CDN; Node: direct import).
    // This centralizes the browser-safe logic and keeps the Vite build from
    // accidentally pulling Node-only code into client chunks.
    const { loadTransformersPipeline } = await import('@/src/utils/transformersLoader');
    const pipeline = await loadTransformersPipeline();
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    console.log('[SemanticSearch] Model loaded.');
    return embedder;
  } catch (err) {
    loadError = err instanceof Error ? err : new Error(String(err));
    throw loadError;
  } finally {
    isLoading = false;
  }
}

/**
 * Load the pre-computed embeddings index.
 */
async function getEmbeddingsIndex(): Promise<EmbeddingsIndex> {
  if (embeddingsIndex) return embeddingsIndex;

  // Use Vite's BASE_URL or default to root
  const baseUrl = import.meta.env?.BASE_URL || '/';
  const response = await fetch(`${baseUrl}model-embeddings.json`);
  if (!response.ok) {
    throw new Error(`Failed to load embeddings index: ${response.status}`);
  }

  embeddingsIndex = await response.json();
  console.log(`[SemanticSearch] Loaded ${embeddingsIndex!.count} model embeddings.`);
  return embeddingsIndex!;
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  return sharedCosineSimilarity(a, b);
}

/**
 * Perform semantic search over the model library.
 * 
 * @param query - Natural language search query
 * @param topK - Number of results to return (default 10)
 * @returns Array of search results sorted by relevance
 */
export async function semanticSearch(query: string, topK: number = 10): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  // Load resources in parallel
  const [embed, index] = await Promise.all([
    getEmbedder(),
    getEmbeddingsIndex(),
  ]);

  // Compute query embedding
  const output = await embed(query, { pooling: 'mean', normalize: true });
  // Debugging: ensure output has expected shape
  if (!output || !output.data) {
    console.warn('[SemanticSearch][DEBUG] embed output is missing data:', output);
    throw new Error('Embedding pipeline returned unexpected output');
  }


  const queryEmbedding = Array.from(output.data) as number[];
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    console.warn('[SemanticSearch][DEBUG] queryEmbedding length:', queryEmbedding && queryEmbedding.length);
  }

  // Score all models
  const scores: Array<{ model: ModelEmbedding; score: number }> = index.models.map(model => ({
    model,
    score: cosineSimilarity(queryEmbedding, model.embedding),
  }));

  // Sort by score descending and take top K
  scores.sort((a, b) => b.score - a.score);

  return scores.slice(0, topK).map(({ model, score }) => ({
    id: model.id,
    filename: model.filename,
    path: model.path,
    category: model.category,
    preview: model.preview,
    score,
  }));
}

/**
 * Check if the semantic search service is ready.
 * Useful for showing loading states in UI.
 */
export async function isSemanticSearchReady(): Promise<boolean> {
  try {
    await getEmbeddingsIndex();
    return true;
  } catch {
    return false;
  }
}

/**
 * Preload the embedding model in the background.
 * Call this early (e.g., on app mount) for faster first search.
 */
export function preloadEmbeddingModel(): void {
  getEmbedder().catch(err => {
    console.warn('[SemanticSearch] Failed to preload model:', err);
  });
}

/**
 * Get all available models (for fallback non-semantic search).
 */
export async function getAllModels(): Promise<SearchResult[]> {
  const index = await getEmbeddingsIndex();
  return index.models.map(model => ({
    id: model.id,
    filename: model.filename,
    path: model.path,
    category: model.category,
    preview: model.preview,
    score: 1,
  }));
}

// EXPORT FOR TESTING ONLY
export const _internalState = {
    get embedder() { return embedder; },
    set embedder(v) { embedder = v; },
    get embeddingsIndex() { return embeddingsIndex; },
    set embeddingsIndex(v) { embeddingsIndex = v; },
    get isLoading() { return isLoading; },
    set isLoading(v) { isLoading = v; },
    get loadError() { return loadError; },
    set loadError(v) { loadError = v; }
};
