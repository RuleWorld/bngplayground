import {
  DEFAULT_RULEHUB_CDN_MANIFEST_URL,
  DEFAULT_RULEHUB_MANIFEST_URL,
  DEFAULT_RULEHUB_RAW_BASE_URL,
  isBng2Compatible,
  joinUrl,
  normalizeManifest,
} from './manifest.js';
import type {
  RuleHubClientOptions,
  RuleHubManifest,
  RuleHubModelEntry,
  RuleHubResolvedModel,
} from './types.js';

const dynamicFetch: typeof fetch = (...args) => globalThis.fetch(...args);

function baseFromManifestUrl(url: string): string | null {
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');
  const suffixIndex = queryIndex === -1
    ? hashIndex
    : hashIndex === -1
      ? queryIndex
      : Math.min(queryIndex, hashIndex);
  const path = suffixIndex === -1 ? url : url.slice(0, suffixIndex);
  const manifestSuffix = '/manifest.json';
  return path.toLowerCase().endsWith(manifestSuffix)
    ? path.slice(0, -manifestSuffix.length)
    : null;
}

export class RuleHubClient {
  private readonly manifestUrl: string;
  private readonly rawBaseUrl?: string;
  private readonly ref: string;
  private readonly revision: string | null;
  private readonly fetchImpl: typeof fetch;
  private manifestCache: RuleHubManifest | null = null;
  private manifestPromise: Promise<RuleHubManifest> | null = null;
  private readonly modelCodeCache = new Map<string, string>();
  private readonly modelPromises = new Map<string, Promise<string>>();

  constructor(options: RuleHubClientOptions = {}) {
    this.manifestUrl = options.manifestUrl ?? DEFAULT_RULEHUB_MANIFEST_URL;
    this.rawBaseUrl = options.rawBaseUrl;
    this.ref = options.ref ?? 'master';
    this.revision = options.revision ?? null;
    this.fetchImpl = options.fetchImpl ?? dynamicFetch;
  }

  async getManifest(): Promise<RuleHubManifest> {
    if (this.manifestCache) return this.manifestCache;
    if (!this.manifestPromise) {
      const candidates = this.manifestUrl === DEFAULT_RULEHUB_MANIFEST_URL
        ? [this.manifestUrl, DEFAULT_RULEHUB_CDN_MANIFEST_URL]
        : [this.manifestUrl];
      this.manifestPromise = (async () => {
        const errors: string[] = [];
        for (const candidate of candidates) {
          try {
            const response = await this.fetchImpl(candidate);
            if (!response.ok) {
              errors.push(`${candidate} (${response.status})`);
              continue;
            }
            const manifest = normalizeManifest(await response.json(), {
              ref: this.ref,
              revision: this.revision,
              sourceUrl: candidate,
            });
            this.manifestCache = manifest;
            return manifest;
          } catch (error) {
            errors.push(`${candidate} (${error instanceof Error ? error.message : String(error)})`);
          }
        }
        throw new Error(`RuleHub manifest fetch failed for all candidates: ${errors.join('; ')}`);
      })();
    }
    try {
      return await this.manifestPromise;
    } catch (error) {
      this.manifestPromise = null;
      throw error;
    }
  }

  async findModel(id: string): Promise<RuleHubModelEntry | null> {
    const manifest = await this.getManifest();
    return manifest.models.find((entry) => entry.id === id) ?? null;
  }

  private modelUrls(entry: RuleHubModelEntry, manifest: RuleHubManifest): string[] {
    const manifestBase = baseFromManifestUrl(manifest.sourceUrl ?? this.manifestUrl);
    const bases = [
      this.rawBaseUrl,
      manifestBase,
      this.rawBaseUrl === undefined && manifestBase === null ? DEFAULT_RULEHUB_RAW_BASE_URL : undefined,
    ].filter((base): base is string => Boolean(base));
    const urls = [entry.rawUrl, ...bases.map((base) => joinUrl(base, entry.path))]
      .filter((url): url is string => Boolean(url));
    return Array.from(new Set(urls));
  }

  async getModelCode(id: string): Promise<string> {
    const cached = this.modelCodeCache.get(id);
    if (cached !== undefined) return cached;
    const pending = this.modelPromises.get(id);
    if (pending) return pending;
    const promise = (async () => {
      const [manifest, entry] = await Promise.all([this.getManifest(), this.findModel(id)]);
      if (!entry) throw new Error(`RuleHub model "${id}" is not present in the manifest`);
      const errors: string[] = [];
      for (const url of this.modelUrls(entry, manifest)) {
        try {
          const response = await this.fetchImpl(url);
          if (response.ok) {
            const code = await response.text();
            this.modelCodeCache.set(id, code);
            return code;
          }
          errors.push(`${url} (${response.status})`);
        } catch (error) {
          errors.push(`${url} (${error instanceof Error ? error.message : String(error)})`);
        }
      }
      throw new Error(`RuleHub model "${id}" could not be fetched: ${errors.join('; ')}`);
    })();
    this.modelPromises.set(id, promise);
    try {
      return await promise;
    } finally {
      this.modelPromises.delete(id);
    }
  }

  async getModel(id: string): Promise<RuleHubResolvedModel> {
    const [manifest, entry] = await Promise.all([this.getManifest(), this.findModel(id)]);
    if (!entry) throw new Error(`RuleHub model "${id}" is not present in the manifest`);
    const code = await this.getModelCode(id);
    return {
      id,
      code,
      metadata: entry,
      provenance: {
        repository: 'RuleWorld/RuleHub',
        ref: manifest.ref,
        path: entry.path,
        model_id: entry.id,
        ...(entry.citation ? { citation: entry.citation } : {}),
        retrieved_at: new Date().toISOString(),
        revision: manifest.revision,
      },
    };
  }

  clearCache(): void {
    this.manifestCache = null;
    this.manifestPromise = null;
    this.modelCodeCache.clear();
    this.modelPromises.clear();
  }

  static isBng2Compatible = isBng2Compatible;
}
