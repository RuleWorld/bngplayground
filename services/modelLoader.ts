/**
 * modelLoader.ts — Lazy model loading service
 *
 * Replaces the static ?raw imports in constants.ts. Models are fetched
 * from public/models/ when first requested, then cached in memory.
 *
 * Usage:
 *   import { loadModelCode, getManifest, getManifestSync } from './services/modelLoader';
 *
 *   // In ExampleGalleryModal when user clicks a model:
 *   const code = await loadModelCode('Faeder_2003');
 *
 *   // Get manifest for model listings (call early, e.g. in App mount):
 *   const manifest = await getManifest();
 */

// ── Types ──────────────────────────────────────────────────────────

export interface ManifestEntry {
  file: string;
  id: string;
  name: string;
  description: string;
  tags: string[];
  bng2_compatible: boolean;
  path: string;
  publicPath: string;
}

export interface ModelManifest {
  models: ManifestEntry[];
  totalModels: number;
  generated: string;
}

// ── State ──────────────────────────────────────────────────────────

const codeCache = new Map<string, string>();
const pendingFetches = new Map<string, Promise<string>>();
let manifestCache: ModelManifest | null = null;
let manifestPromise: Promise<ModelManifest> | null = null;

// ── Base URL detection ─────────────────────────────────────────────

function getBasePath(): string {
  try {
    // @ts-ignore — Vite injects this at build time
    const base: string = import.meta.env?.BASE_URL ?? '';
    return base.replace(/\/$/, '');
  } catch {
    return '';
  }
}

// ── Manifest ───────────────────────────────────────────────────────

/** Load the model manifest. Cached after first call. */
export async function getManifest(): Promise<ModelManifest> {
  if (manifestCache) return manifestCache;

  if (!manifestPromise) {
    manifestPromise = (async () => {
      const base = getBasePath();
      const resp = await fetch(`${base}/model-manifest.json`);
      if (!resp.ok) throw new Error(`Manifest fetch failed: ${resp.status}`);
      manifestCache = await resp.json();
      return manifestCache!;
    })();
  }
  return manifestPromise;
}

/**
 * Return the manifest synchronously if already loaded, otherwise null.
 * Useful for rendering that doesn't want to suspend.
 */
export function getManifestSync(): ModelManifest | null {
  return manifestCache;
}

/** Find a manifest entry by model ID. */
export async function findModel(id: string): Promise<ManifestEntry | null> {
  const manifest = await getManifest();
  return manifest.models.find(m => m.id === id) ?? null;
}

// ── Code loading ───────────────────────────────────────────────────

/**
 * Fetch model code by ID. Returns cached code if available.
 * @throws if the model cannot be found at any path
 */
export async function loadModelCode(id: string): Promise<string> {
  if (codeCache.has(id)) return codeCache.get(id)!;
  if (pendingFetches.has(id)) return pendingFetches.get(id)!;

  const fetchPromise = (async () => {
    const base = getBasePath();
    const entry = await findModel(id).catch(() => null);

    // Build a priority list of URLs to try
    const urls: string[] = [];
    if (entry?.publicPath) urls.push(`${base}/${entry.publicPath}`);
    urls.push(
      `${base}/models/${id}.bngl`,
    );

    for (const url of urls) {
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const code = await resp.text();
          codeCache.set(id, code);
          pendingFetches.delete(id);
          return code;
        }
      } catch { /* try next */ }
    }

    pendingFetches.delete(id);
    throw new Error(`Model "${id}" not found`);
  })();

  pendingFetches.set(id, fetchPromise);
  return fetchPromise;
}

/** Pre-warm the cache for a model (fire-and-forget). */
export function preloadModel(id: string): void {
  if (!codeCache.has(id) && !pendingFetches.has(id)) {
    loadModelCode(id).catch(() => {});
  }
}

/** Inject code into cache (for the startup model & share links). */
export function setCachedCode(id: string, code: string): void {
  codeCache.set(id, code);
}

/** Check if code is already cached. */
export function isModelCached(id: string): boolean {
  return codeCache.has(id);
}

/** Return cached code for a model, or undefined if not yet loaded. */
export function getCachedCode(id: string): string | undefined {
  return codeCache.get(id);
}
