import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const RULEHUB_BASE = process.argv.includes('--local')
  ? `file://${process.argv[process.argv.indexOf('--local') + 1]}`
  : 'https://raw.githubusercontent.com/ruleworld/rulehub/master';

interface SlimEntry {
  id: string;
  name: string;
  description: string;
  tags: string[];
  category: string;
  gallery: string[];
  difficulty?: string;
  featured?: boolean;
  compatibility: {
    bng2?: boolean;
    nfsim?: boolean;
    methods?: string[];
  };
}

interface GalleryConfig {
  version: number;
  generated: string;
  categories: { id: string; name: string; description: string; sortOrder: number }[];
  assignments: Record<string, string[]>;
  sortOverrides: Record<string, number>;
}

async function fetchJson<T>(url: string): Promise<T> {
  if (url.startsWith('file://')) {
    const filePath = url.replace('file://', '');
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  }
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

async function main() {
  console.log('Fetching from RuleHub...');
  console.log('  Base:', RULEHUB_BASE);

  const [slim, gallery] = await Promise.all([
    fetchJson<SlimEntry[]>(`${RULEHUB_BASE}/manifest-slim.json`),
    fetchJson<GalleryConfig>(`${RULEHUB_BASE}/gallery.json`),
  ]);

  console.log(`  Loaded ${slim.length} models, ${gallery.categories.length} categories`);

  const modelEntries = slim.map(e => 
    `    { id: ${JSON.stringify(e.id)}, name: ${JSON.stringify(e.name)}, description: ${JSON.stringify(e.description)}, tags: ${JSON.stringify(e.tags || [])} }`
  ).join(',\n');

  const bng2Compatible = slim.filter(e => e.compatibility?.bng2).map(e => e.id);
  const nfsimCompatible = slim.filter(e => e.compatibility?.nfsim).map(e => e.id);
  const excluded = slim.filter(e => (e.compatibility as any)?.excluded).map(e => e.id);

  const output = `// AUTO-GENERATED — DO NOT EDIT
// Source: RuleHub manifest-slim.json + gallery.json
// Generated: ${new Date().toISOString()}

import type { Example } from '@bngplayground/engine';

export interface ModelCategory {
  id: string;
  name: string;
  description: string;
  models: Example[];
}

const ALL_MODELS: Example[] = [
${modelEntries}
];

const MODEL_INDEX = new Map(ALL_MODELS.map(m => [m.id, m]));

export const BNG2_COMPATIBLE = new Set(${JSON.stringify(bng2Compatible)});
export const NFSIM_COMPATIBLE = new Set(${JSON.stringify(nfsimCompatible)});
export const EXCLUDED = new Set(${JSON.stringify(excluded)});

const GALLERY_CATEGORIES: { id: string; name: string; description: string; sortOrder: number }[] = ${JSON.stringify(gallery.categories, null, 2)};
const ASSIGNMENTS: Record<string, string[]> = ${JSON.stringify(gallery.assignments, null, 2)};

function buildCategory(cat: typeof GALLERY_CATEGORIES[0]): ModelCategory {
  const modelIds = Object.entries(ASSIGNMENTS)
    .filter(([_, cats]) => cats.includes(cat.id))
    .map(([id]) => id);
  return {
    id: cat.id,
    name: cat.name,
    description: cat.description,
    models: modelIds.map(id => MODEL_INDEX.get(id)).filter(Boolean) as Example[],
  };
}

export const MODEL_CATEGORIES: ModelCategory[] = GALLERY_CATEGORIES
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map(buildCategory)
  .filter(cat => cat.models.length > 0);

export const EXAMPLES: Example[] = Array.from(
  new Map(MODEL_CATEGORIES.flatMap(cat => cat.models).map(m => [m.id, m])).values()
);

// Backward-compatible aliases
export const NFSIM_MODELS = NFSIM_COMPATIBLE;
export const BNG2_COMPATIBLE_MODELS = BNG2_COMPATIBLE;
`;

  const outDir = resolve('src/generated');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'gallery-data.ts'), output);

  console.log(`Generated: ${slim.length} models, ${gallery.categories.length} categories, ${Object.keys(gallery.assignments).length} assignments`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});