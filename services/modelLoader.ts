/**
 * modelLoader.ts — Lazy model loading service
 *
 * Replaces the static ?raw imports in constants.ts. Models are fetched
 * from either the local public assets or an external manifest-backed source
 * such as RuleHub when first requested, then cached in memory.
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
  path?: string;
  publicPath?: string;
  rawUrl?: string;
  category?: string;
  origin?: string;
  visible?: boolean;
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
let manifestSourceUrl: string | null = null;
const DEFAULT_RULEHUB_MANIFEST_URL = 'https://raw.githubusercontent.com/ruleworld/rulehub/master/manifest.json';
const DEFAULT_RULEHUB_CDN_MANIFEST_URL = 'https://cdn.jsdelivr.net/gh/ruleworld/rulehub@master/manifest.json';

// ── Base URL detection ─────────────────────────────────────────────

function getEnvString(name: string): string | null {
  try {
    const value = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.[name];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  } catch {
    return null;
  }
}

function joinUrl(base: string, relative: string): string {
  return `${base.replace(/\/$/, '')}/${relative.replace(/^\//, '')}`;
}

function getManifestUrl(): string {
  const explicitUrl = getEnvString('VITE_RULEHUB_MANIFEST_URL') ?? getEnvString('VITE_MODEL_MANIFEST_URL');
  if (explicitUrl) return explicitUrl;
  return DEFAULT_RULEHUB_MANIFEST_URL;
}

function getManifestUrls(): string[] {
  const explicitUrl = getEnvString('VITE_RULEHUB_MANIFEST_URL') ?? getEnvString('VITE_MODEL_MANIFEST_URL');
  if (explicitUrl) return [explicitUrl];

  return [DEFAULT_RULEHUB_MANIFEST_URL, DEFAULT_RULEHUB_CDN_MANIFEST_URL];
}

function getRemoteModelBaseUrl(): string | null {
  const explicitBase = getEnvString('VITE_RULEHUB_RAW_BASE_URL') ?? getEnvString('VITE_MODEL_BASE_URL');
  if (explicitBase) return explicitBase;

  const manifestUrl = getManifestUrl();
  if (/\/manifest\.json(?:[?#].*)?$/i.test(manifestUrl)) {
    return manifestUrl.replace(/\/manifest\.json(?:[?#].*)?$/i, '');
  }
  return null;
}

function getRemoteModelBaseUrls(): string[] {
  const explicitBase = getEnvString('VITE_RULEHUB_RAW_BASE_URL') ?? getEnvString('VITE_MODEL_BASE_URL');
  if (explicitBase) return [explicitBase];

  const bases = getManifestUrls()
    .filter((manifestUrl) => /\/manifest\.json(?:[?#].*)?$/i.test(manifestUrl))
    .map((manifestUrl) => manifestUrl.replace(/\/manifest\.json(?:[?#].*)?$/i, ''));

  return Array.from(new Set(bases));
}

function normalizeManifest(raw: unknown): ModelManifest {
  if (Array.isArray(raw)) {
    const models = raw as ManifestEntry[];
    return {
      models,
      totalModels: models.length,
      generated: new Date().toISOString(),
    };
  }

  if (raw && typeof raw === 'object' && Array.isArray((raw as { models?: unknown }).models)) {
    const manifest = raw as Partial<ModelManifest>;
    const models = manifest.models as ManifestEntry[];
    return {
      models,
      totalModels: manifest.totalModels ?? models.length,
      generated: manifest.generated ?? new Date().toISOString(),
    };
  }

  throw new Error('Invalid model manifest payload');
}

// ── Manifest ───────────────────────────────────────────────────────

/** Load the model manifest. Cached after first call. */
export async function getManifest(): Promise<ModelManifest> {
  if (manifestCache) return manifestCache;

  if (!manifestPromise) {
    manifestPromise = (async () => {
      const errors: string[] = [];

      for (const candidateUrl of getManifestUrls()) {
        try {
          const resp = await fetch(candidateUrl);
          if (!resp.ok) {
            errors.push(`${candidateUrl} (${resp.status})`);
            continue;
          }

          manifestCache = normalizeManifest(await resp.json());
          manifestSourceUrl = candidateUrl;
          return manifestCache!;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${candidateUrl} (${message})`);
        }
      }

      manifestPromise = null;
      throw new Error(`Manifest fetch failed for all candidates: ${errors.join('; ')}`);
    })();
  }
  return manifestPromise;
}

export function getManifestDebugInfo(): { candidates: string[]; resolved: string | null } {
  return {
    candidates: getManifestUrls(),
    resolved: manifestSourceUrl,
  };
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
 * Fetch model code by ID from RuleHub. Returns cached code if available.
 * @throws if the model cannot be found through the RuleHub manifest/base URL
 */
export async function loadModelCode(id: string): Promise<string> {
  if (codeCache.has(id)) return codeCache.get(id)!;
  if (pendingFetches.has(id)) return pendingFetches.get(id)!;

  const fetchPromise = (async () => {
    const remoteBase = getRemoteModelBaseUrl();
    const remoteBases = getRemoteModelBaseUrls();
    const entry = await findModel(id).catch(() => null);

    if (!entry) {
      pendingFetches.delete(id);
      throw new Error(`Model "${id}" is not present in the RuleHub manifest`);
    }

    const urls: string[] = [];
    if (entry?.rawUrl) urls.push(entry.rawUrl);
    if (entry?.path && remoteBase) urls.push(joinUrl(remoteBase, entry.path));
    if (entry?.path) {
      for (const base of remoteBases) {
        urls.push(joinUrl(base, entry.path));
      }
    }

    const dedupedUrls = Array.from(new Set(urls));

    for (const url of dedupedUrls) {
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
    throw new Error(`Model "${id}" could not be fetched from RuleHub`);
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
