import type { Example } from '@bngplayground/engine';
import { EXAMPLES, MODEL_CATEGORIES } from '../src/constants';
import { getManifest, getManifestSync, type ManifestEntry, type ModelManifest } from './modelLoader';
import { getEnvString } from './envUtils';

export interface CatalogExample extends Example {
  path?: string;
  origin?: string;
  category: string;
  visible: boolean;
  bng2Compatible: boolean;
}

export interface CatalogCategory {
  id: string;
  name: string;
  description: string;
  models: CatalogExample[];
}

export interface ModelCatalog {
  examples: CatalogExample[];
  visibleExamples: CatalogExample[];
  categories: CatalogCategory[];
  defaultModelId: string | null;
}

let catalogCache: ModelCatalog | null = null;
let catalogPromise: Promise<ModelCatalog> | null = null;

function normalizeLookupValue(value: string): string {
  return value.trim().toLowerCase().replace(/\.bngl$/i, '');
}

function _mapEntry(entry: ManifestEntry): CatalogExample {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    tags: entry.tags ?? [],
    path: entry.path,
    origin: entry.origin,
    category: entry.category ?? 'uncategorized',
    visible: entry.visible !== false,
    bng2Compatible: entry.bng2_compatible,
  };
}

function toManifestLookupKeys(value: string): string[] {
  const normalized = normalizeLookupValue(value);
  const swapped = normalized.includes('_') ? normalized.replace(/_/g, '-') : normalized.replace(/-/g, '_');
  return Array.from(new Set([normalized, swapped]));
}

function buildManifestIndex(manifest: ModelManifest): Map<string, ManifestEntry> {
  const index = new Map<string, ManifestEntry>();

  for (const entry of manifest.models) {
    const candidates = [entry.id, entry.name, entry.path, entry.file].filter((value): value is string => Boolean(value));
    for (const candidate of candidates) {
      for (const key of toManifestLookupKeys(candidate)) {
        if (!index.has(key)) {
          index.set(key, entry);
        }
      }
    }
  }

  return index;
}

function mergeExample(base: Example, entry: ManifestEntry, categoryId?: string): CatalogExample {
  return {
    ...base,
    path: entry.path,
    origin: entry.origin,
    category: categoryId ?? entry.category ?? 'uncategorized',
    visible: entry.visible !== false,
    bng2Compatible: entry.bng2_compatible,
  };
}

function resolveManifestEntry(index: Map<string, ManifestEntry>, example: Example): ManifestEntry | null {
  const candidates = [example.id, example.name].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    for (const key of toManifestLookupKeys(candidate)) {
      const match = index.get(key);
      if (match) return match;
    }
  }
  return null;
}

function buildCategories(manifest: ModelManifest): CatalogCategory[] {
  const manifestIndex = buildManifestIndex(manifest);

  return MODEL_CATEGORIES
    .map((category) => {
      const models = category.models
        .map((example) => {
          const entry = resolveManifestEntry(manifestIndex, example);
          return entry ? mergeExample(example, entry, category.id) : null;
        })
        .filter((example): example is CatalogExample => example !== null);

      return {
        id: category.id,
        name: category.name,
        description: category.description,
        models,
      };
    })
    .filter((category) => category.models.length > 0);
}

function findInExamples(examples: CatalogExample[], query: string): CatalogExample | null {
  const normalized = normalizeLookupValue(query);

  for (const example of examples) {
    const candidates = [
      example.id,
      example.name,
      example.path,
      example.path?.split('/').pop(),
    ].filter((value): value is string => Boolean(value));

    if (candidates.some((value) => normalizeLookupValue(value) === normalized)) {
      return example;
    }
  }

  return null;
}

function buildCatalog(manifest: ModelManifest): ModelCatalog {
  const manifestIndex = buildManifestIndex(manifest);
  const examples = EXAMPLES
    .map((example) => {
      const entry = resolveManifestEntry(manifestIndex, example);
      return entry ? mergeExample(example, entry) : null;
    })
    .filter((example): example is CatalogExample => example !== null);

  const visibleExamples = examples;
  const categories = buildCategories(manifest);

  const preferredDefault = getEnvString('VITE_RULEHUB_DEFAULT_MODEL_ID') ?? getEnvString('VITE_DEFAULT_MODEL_ID');
  const defaultExample =
    (preferredDefault ? findInExamples(examples, preferredDefault) : null) ??
    findInExamples(examples, 'AB') ??
    visibleExamples[0] ??
    examples[0] ??
    null;

  return {
    examples,
    visibleExamples,
    categories,
    defaultModelId: defaultExample?.id ?? null,
  };
}

export async function loadModelCatalog(): Promise<ModelCatalog> {
  if (catalogCache) return catalogCache;

  if (!catalogPromise) {
    catalogPromise = (async () => {
      const manifest = await getManifest();
      catalogCache = buildCatalog(manifest);
      return catalogCache;
    })();
  }

  return catalogPromise;
}

export function getModelCatalogSync(): ModelCatalog | null {
  if (catalogCache) return catalogCache;

  const manifest = getManifestSync();
  if (!manifest) return null;

  catalogCache = buildCatalog(manifest);
  return catalogCache;
}

export async function findCatalogExampleByQuery(
  query: string,
  options: { includeHidden?: boolean } = {}
): Promise<CatalogExample | null> {
  const catalog = await loadModelCatalog();
  const pool = options.includeHidden === false ? catalog.visibleExamples : catalog.examples;
  return findInExamples(pool, query);
}