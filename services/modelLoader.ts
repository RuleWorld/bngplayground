/**
 * Lazy RuleHub-backed model loading for the browser.
 *
 * The environment-neutral manifest and fetch logic lives in
 * `@bngplayground/rulehub`; this module keeps the legacy app-facing API and
 * cache/debug behavior used by the gallery and share-link flows.
 */
import {
  DEFAULT_RULEHUB_CDN_MANIFEST_URL,
  DEFAULT_RULEHUB_MANIFEST_URL,
  RuleHubClient,
  isBng2Compatible,
  type RuleHubModelEntry,
} from '@bngplayground/rulehub';
import { getEnvString } from './envUtils';

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

const codeCache = new Map<string, string>();
const pendingFetches = new Map<string, Promise<string>>();
let manifestCache: ModelManifest | null = null;
let manifestPromise: Promise<ModelManifest> | null = null;
let manifestSourceUrl: string | null = null;
let ruleHubClient: RuleHubClient | null = null;

function getExplicitManifestUrl(): string | undefined {
  return getEnvString('VITE_RULEHUB_MANIFEST_URL') ?? getEnvString('VITE_MODEL_MANIFEST_URL') ?? undefined;
}

function getManifestUrls(): string[] {
  const explicitUrl = getExplicitManifestUrl();
  return explicitUrl
    ? [explicitUrl]
    : [DEFAULT_RULEHUB_MANIFEST_URL, DEFAULT_RULEHUB_CDN_MANIFEST_URL];
}

function getRemoteModelBaseUrl(): string | undefined {
  const explicitBase = getEnvString('VITE_RULEHUB_RAW_BASE_URL') ?? getEnvString('VITE_MODEL_BASE_URL');
  if (explicitBase) return explicitBase;
  const manifestUrl = getExplicitManifestUrl() ?? DEFAULT_RULEHUB_MANIFEST_URL;
  return /\/manifest\.json(?:[?#].*)?$/i.test(manifestUrl)
    ? manifestUrl.replace(/\/manifest\.json(?:[?#].*)?$/i, '')
    : undefined;
}

function getClient(): RuleHubClient {
  if (!ruleHubClient) {
    // Resolve globalThis.fetch at request time so tests and host applications
    // can provide a fetch implementation after module initialization.
    const fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args);
    ruleHubClient = new RuleHubClient({
      manifestUrl: getManifestUrls()[0],
      rawBaseUrl: getRemoteModelBaseUrl(),
      fetchImpl,
    });
  }
  return ruleHubClient;
}

function toLegacyEntry(entry: RuleHubModelEntry): ManifestEntry {
  return {
    file: entry.file ?? entry.path.split('/').pop() ?? `${entry.id}.bngl`,
    id: entry.id,
    name: entry.name,
    description: entry.description ?? '',
    tags: entry.tags,
    bng2_compatible: isBng2Compatible(entry),
    path: entry.path,
    ...(entry.rawUrl ? { rawUrl: entry.rawUrl } : {}),
    ...(entry.category ? { category: entry.category } : {}),
    ...(entry.origin ? { origin: entry.origin } : {}),
    ...(entry.visible === undefined ? {} : { visible: entry.visible }),
  };
}

/** Load the RuleHub manifest. It is cached after the first successful call. */
export async function getManifest(): Promise<ModelManifest> {
  if (manifestCache) return manifestCache;
  if (!manifestPromise) {
    manifestPromise = getClient().getManifest()
      .then((manifest) => {
        manifestSourceUrl = manifest.sourceUrl ?? null;
        manifestCache = {
          models: manifest.models.map(toLegacyEntry),
          totalModels: manifest.totalModels,
          generated: manifest.generated,
        };
        return manifestCache;
      })
      .catch((error) => {
        manifestPromise = null;
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('Invalid RuleHub manifest payload')) {
          throw new Error('Invalid model manifest payload');
        }
        throw new Error(
          message.replace(/^RuleHub manifest/, 'Manifest').replace(/^RuleHub model/, 'Model'),
        );
      });
  }
  return manifestPromise;
}

export function getManifestDebugInfo(): { candidates: string[]; resolved: string | null } {
  return { candidates: getManifestUrls(), resolved: manifestSourceUrl };
}

/** Return the manifest synchronously if it has already been loaded. */
export function getManifestSync(): ModelManifest | null {
  return manifestCache;
}

/** Find a manifest entry by model ID. */
export async function findModel(id: string): Promise<ManifestEntry | null> {
  const manifest = await getManifest();
  return manifest.models.find((model) => model.id === id) ?? null;
}

/** Fetch model code by ID from RuleHub, with in-memory request de-duplication. */
export async function loadModelCode(id: string): Promise<string> {
  const cached = codeCache.get(id);
  if (cached !== undefined) return cached;
  const pending = pendingFetches.get(id);
  if (pending) return pending;

  const promise = getClient().getModelCode(id).then((code) => {
    codeCache.set(id, code);
    return code;
  });
  pendingFetches.set(id, promise);
  try {
    return await promise;
  } finally {
    pendingFetches.delete(id);
  }
}

/** Pre-warm a model cache without surfacing errors to the gallery UI. */
export function preloadModel(id: string): void {
  if (!codeCache.has(id) && !pendingFetches.has(id)) loadModelCode(id).catch(() => {});
}

/** Inject code into cache for startup models and share links. */
export function setCachedCode(id: string, code: string): void {
  codeCache.set(id, code);
}

export function isModelCached(id: string): boolean {
  return codeCache.has(id);
}

export function getCachedCode(id: string): string | undefined {
  return codeCache.get(id);
}
