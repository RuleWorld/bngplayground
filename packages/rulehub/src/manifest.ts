import type {
  RuleHubCitation,
  RuleHubCompatibility,
  RuleHubManifest,
  RuleHubModelEntry,
} from './types.js';

export const DEFAULT_RULEHUB_MANIFEST_URL =
  'https://raw.githubusercontent.com/ruleworld/rulehub/master/manifest.json';
export const DEFAULT_RULEHUB_CDN_MANIFEST_URL =
  'https://cdn.jsdelivr.net/gh/ruleworld/rulehub@master/manifest.json';
export const DEFAULT_RULEHUB_RAW_BASE_URL =
  'https://raw.githubusercontent.com/ruleworld/rulehub/master';

export function joinUrl(base: string, relative: string): string {
  return `${base.replace(/\/$/, '')}/${relative.replace(/^\//, '')}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeCitation(value: unknown): RuleHubCitation | undefined {
  const record = asRecord(value);
  const citation: RuleHubCitation = {
    year: optionalString(record.year),
    doi: optionalString(record.doi),
    pmid: optionalString(record.pmid),
    url: optionalString(record.url),
    reference: optionalString(record.reference),
  };
  return Object.values(citation).some(Boolean) ? citation : undefined;
}

function normalizeCompatibility(raw: Record<string, unknown>): RuleHubCompatibility | undefined {
  const nested = asRecord(raw.compatibility);
  const bng2 = typeof nested.bng2 === 'boolean'
    ? nested.bng2
    : typeof raw.bng2_compatible === 'boolean'
      ? raw.bng2_compatible
      : undefined;
  const nfsim = typeof nested.nfsim === 'boolean' ? nested.nfsim : undefined;
  const excluded = typeof nested.excluded === 'boolean'
    ? nested.excluded
    : typeof raw.excluded === 'boolean'
      ? raw.excluded
      : undefined;
  const methods = stringArray(nested.methods);
  if (bng2 === undefined && nfsim === undefined && excluded === undefined && methods.length === 0) {
    return undefined;
  }
  return {
    ...(bng2 === undefined ? {} : { bng2 }),
    ...(nfsim === undefined ? {} : { nfsim }),
    ...(excluded === undefined ? {} : { excluded }),
    ...(methods.length === 0 ? {} : { methods }),
  };
}

function deriveId(path: string, file: string | undefined): string {
  const candidate = file ?? path.split('/').pop() ?? path;
  return candidate.replace(/\.bngl$/i, '');
}

export function normalizeManifestEntry(value: unknown): RuleHubModelEntry | null {
  const raw = asRecord(value);
  const rawUrl = optionalString(raw.rawUrl);
  const path = optionalString(raw.path) ?? optionalString(raw.file) ?? rawUrl;
  if (!path) return null;
  const file = optionalString(raw.file);
  const id = optionalString(raw.id) ?? deriveId(path, file);
  const compatibility = normalizeCompatibility(raw);
  const featuresRecord = asRecord(raw.features);
  const features = Object.fromEntries(
    Object.entries(featuresRecord).filter(([, item]) =>
      typeof item === 'boolean' || typeof item === 'string',
    ),
  ) as Record<string, boolean | string>;
  const name = optionalString(raw.name) ?? id;
  return {
    id,
    name,
    ...(optionalString(raw.description) ? { description: optionalString(raw.description) } : {}),
    path,
    ...(file ? { file } : {}),
    tags: stringArray(raw.tags),
    ...(optionalString(raw.category) ? { category: optionalString(raw.category) } : {}),
    ...(optionalString(raw.origin) ? { origin: optionalString(raw.origin) } : {}),
    ...(typeof raw.visible === 'boolean' ? { visible: raw.visible } : {}),
    ...(typeof raw.featured === 'boolean' ? { featured: raw.featured } : {}),
    ...(optionalString(raw.difficulty) ? { difficulty: optionalString(raw.difficulty) } : {}),
    ...(compatibility ? { compatibility } : {}),
    ...(normalizeCitation(raw.citation) ? { citation: normalizeCitation(raw.citation) } : {}),
    ...(Object.keys(features).length > 0 ? { features } : {}),
    ...(typeof raw.bng2_compatible === 'boolean' ? { bng2_compatible: raw.bng2_compatible } : {}),
    ...(rawUrl ? { rawUrl } : {}),
  };
}

export function normalizeManifest(
  raw: unknown,
  options: { ref: string; revision: string | null; sourceUrl?: string },
): RuleHubManifest {
  const payload = asRecord(raw);
  const rawModels = Array.isArray(raw) ? raw : payload.models;
  if (!Array.isArray(rawModels)) throw new Error('Invalid RuleHub manifest payload');
  const models = rawModels
    .map(normalizeManifestEntry)
    .filter((entry): entry is RuleHubModelEntry => entry !== null);
  const generated = optionalString(payload.generated) ?? new Date().toISOString();
  const totalModels = typeof payload.totalModels === 'number' ? payload.totalModels : models.length;
  return {
    models,
    totalModels,
    generated,
    repository: 'RuleWorld/RuleHub',
    ref: options.ref,
    revision: options.revision,
    ...(options.sourceUrl ? { sourceUrl: options.sourceUrl } : {}),
  };
}

export function isExcludedModel(entry: RuleHubModelEntry): boolean {
  return entry.compatibility?.excluded === true;
}

export function isBng2Compatible(entry: RuleHubModelEntry): boolean {
  return entry.compatibility?.bng2 === true || entry.bng2_compatible === true;
}

export function isNfsimCompatible(entry: RuleHubModelEntry): boolean {
  return entry.compatibility?.nfsim === true;
}
