/**
 * Semantic search service for BNGL models.
 * Uses pre-computed embeddings (generated at build time) and
 * computes query embeddings at runtime using Transformers.js.
 * 
 * No external API calls - runs entirely in the browser.
 */

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

/**
 * Load the embedding model (lazy, cached).
 * Uses all-MiniLM-L6-v2 (~22MB download, cached in IndexedDB).
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
    // Dynamic import to handle the case when package is not yet installed
    // @ts-expect-error - Module will be available after npm install
    const { pipeline } = await import('@xenova/transformers');
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
  // @ts-expect-error - Vite injects import.meta.env at build time
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
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
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
  const queryEmbedding = Array.from(output.data) as number[];
  
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
