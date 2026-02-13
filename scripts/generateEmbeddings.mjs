/**
 * Generate embeddings for all BNGL models at build time.
 * This creates a JSON file with pre-computed embeddings that can be
 * loaded at runtime for semantic search without API calls.
 * 
 * Run with: npm run generate:embeddings
 * 
 * NOTE: First run will download the embedding model (~22MB).
 * The model is cached in the transformers.js cache directory.
 */

import { pipeline } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONSTANTS_TS_PATH = path.join(ROOT, 'constants.ts');

// Model directories to scan
// NOTE: include the whole 'published-models' tree so newly added subfolders (e.g., Mallela_2022, Ordyan_2020, PyBNG) are automatically discovered.
const MODEL_DIRS = [
  'example-models',
  'published-models',
];

// Initialize the embedding model (runs locally, no API needed)
// Using all-MiniLM-L6-v2: small (22MB), fast, good quality
let embedder = null;

async function getEmbedder() {
  if (!embedder) {
    console.log('Loading embedding model (Xenova/all-MiniLM-L6-v2)...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('Model loaded.');
  }
  return embedder;
}

/**
 * Extract searchable text from BNGL file content.
 * Combines filename, comments, molecule types, observables, and rule names.
 */
function extractSearchableText(filename, content) {
  const parts = [
    // Filename without extension, with dashes/underscores as spaces
    filename.replace(/\.bngl$/i, '').replace(/[-_]/g, ' '),
  ];

  // Extract comments (lines starting with #)
  const comments = content.match(/^#.*$/gm) || [];
  comments.forEach(c => parts.push(c.replace(/^#+\s*/, '')));

  // Extract molecule type names
  const molTypeMatch = content.match(/begin\s+molecule\s+types([\s\S]*?)end\s+molecule\s+types/i);
  if (molTypeMatch) {
    const molTypes = molTypeMatch[1].match(/^\s*(\w+)\(/gm) || [];
    molTypes.forEach(m => parts.push(m.replace(/[(\s]/g, '')));
  }

  // Extract observable names and patterns
  const obsMatch = content.match(/begin\s+observables([\s\S]*?)end\s+observables/i);
  if (obsMatch) {
    const lines = obsMatch[1].split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
    lines.forEach(line => {
      const match = line.match(/^\s*\w+\s+(\w+)/);
      if (match) parts.push(match[1]);
    });
  }

  // Extract species names from seed species
  const speciesMatch = content.match(/begin\s+(?:seed\s+)?species([\s\S]*?)end\s+(?:seed\s+)?species/i);
  if (speciesMatch) {
    const speciesNames = speciesMatch[1].match(/^\s*(\w+)\(/gm) || [];
    speciesNames.forEach(s => parts.push(s.replace(/[(\s]/g, '')));
  }

  // Extract rule names (if named)
  const rulesMatch = content.match(/begin\s+reaction\s+rules([\s\S]*?)end\s+reaction\s+rules/i);
  if (rulesMatch) {
    const ruleNames = rulesMatch[1].match(/^\s*(\w+):/gm) || [];
    ruleNames.forEach(r => parts.push(r.replace(/[:\s]/g, '')));
  }

  // Join and clean up
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/**
 * Extract observable names from BNGL content.
 * Format: Molecules ObservableName Pattern() or Species ObservableName Pattern()
 */
function extractObservables(content) {
  const obsMatch = content.match(/begin\s+observables([\s\S]*?)end\s+observables/i);
  if (!obsMatch) return [];

  const observables = [];
  const lines = obsMatch[1].split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines, comments with #, and comments with //
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

    // Match: Type ObservableName ...
    // Type is usually Molecules or Species
    const match = trimmed.match(/^\s*(Molecules|Species)\s+(\w+)/i);
    if (match) {
      observables.push(match[2]); // Capture group 2 is the observable name
    }
  }
  return observables;
}

/**
 * Extract simulation mode (ODE, SSA, NFsim, Hybrid, Multiphase) from BNGL.
 * Ignores commented out lines.
 */
function extractSimulationMode(content) {
  const activeLines = content.split('\n')
    .filter(l => l.trim() && !l.trim().startsWith('#'))
    .join('\n');

  const methods = [];
  let m;

  // 1. Matches simulate({method=>"ode", ...})
  const methodRegex = /simulate\s*\(\s*\{[^}]*method\s*=>\s*["'](\w+)["']/g;
  while ((m = methodRegex.exec(activeLines)) !== null) {
    methods.push(m[1].toLowerCase());
  }

  // 2. Matches simulate_ode({ ... })
  const legacyRegex = /simulate_(\w+)/g;
  while ((m = legacyRegex.exec(activeLines)) !== null) {
    methods.push(m[1].toLowerCase());
  }

  // 3. Matches nfsim({ ... })
  if (activeLines.toLowerCase().includes('nfsim(')) {
    methods.push('nf');
  }

  const unique = [...new Set(methods)];
  if (unique.length > 0) {
    const primary = unique[0].toUpperCase().replace('SSA', 'SSA/Gillespie').replace('NF', 'NFsim');
    if (unique.length > 1) return `Hybrid (${unique.join('/')})`;
    if (methods.length > 1) return `Multiphase (${primary})`;
    return primary;
  }

  return 'None';
}

/**
 * Extract tags/categories from file path and content.
 * Returns array of tags based on folder structure and content analysis.
 */
function extractTags(relativePath, content) {
  const parts = relativePath.split('/');
  const tags = [];

  // First folder determines broad category
  if (parts[0] === 'example-models') {
    tags.push('Example Models');
  } else if (parts[0] === 'published-models') {
    // Second folder is the subcategory
    if (parts.length > 1) {
      const subcat = parts[1];
      // Map subcategory to display names
      if (subcat === 'cell-regulation') tags.push('Metabolism');
      else if (subcat === 'growth-factor-signaling') tags.push('Cancer Biology');
      else if (subcat === 'complex-models') tags.push('Metabolism');
      else if (subcat === 'immune-signaling') tags.push('Immunology');
      else if (subcat === 'tutorials') tags.push('Tutorials & Simple Examples');
      else if (subcat === 'literature') tags.push('Example Models');
      else if (subcat === 'native-tutorials') {
        tags.push('RuleWorld Tutorials');
      }
    }
  }

  return tags.length > 0 ? tags : ['Example Models'];
}

/**
 * Scan directories for BNGL files and extract metadata.
 */
function scanModels() {
  const models = [];

  for (const dir of MODEL_DIRS) {
    const fullDir = path.join(ROOT, dir);
    if (!fs.existsSync(fullDir)) {
      console.warn(`Directory not found: ${dir}`);
      continue;
    }

    const scanDir = (currentDir) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith('.bngl')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const relativePath = path.relative(ROOT, fullPath);

          models.push({
            id: relativePath.replace(/\\/g, '/').replace(/\.bngl$/, ''),
            filename: entry.name,
            path: relativePath.replace(/\\/g, '/'),
            tags: extractTags(relativePath.replace(/\\/g, '/'), content),
            searchText: extractSearchableText(entry.name, content),
            observables: extractObservables(content),
            simulationMode: extractSimulationMode(content),
          });
        }
      }
    };

    scanDir(fullDir);
  }

  return models;
}

/**
 * Read BNG2-compatible model IDs from constants.ts (source of truth for app filtering).
 */
function loadBng2CompatibleModelIds() {
  if (!fs.existsSync(CONSTANTS_TS_PATH)) {
    throw new Error(`constants.ts not found at ${CONSTANTS_TS_PATH}`);
  }

  const source = fs.readFileSync(CONSTANTS_TS_PATH, 'utf-8');
  const setBlockMatch = source.match(
    /export\s+const\s+BNG2_COMPATIBLE_MODELS\s*=\s*new\s+Set\s*\(\s*\[([\s\S]*?)\]\s*\)/m
  );

  if (!setBlockMatch) {
    throw new Error('Could not find BNG2_COMPATIBLE_MODELS in constants.ts');
  }

  const ids = new Set();
  const literalRegex = /'([^']+)'/g;
  let match;
  while ((match = literalRegex.exec(setBlockMatch[1])) !== null) {
    const id = match[1].trim();
    if (id) ids.add(id);
  }

  if (ids.size === 0) {
    throw new Error('Parsed zero IDs from BNG2_COMPATIBLE_MODELS in constants.ts');
  }

  return ids;
}

/**
 * Generate embeddings for all models.
 */
async function generateEmbeddings() {
  console.log('Scanning for BNGL models...');
  let models = scanModels();
  console.log(`Found ${models.length} models.`);

  // Filter by constants.ts source of truth
  const compatibleIds = loadBng2CompatibleModelIds();
  const compatibleIdsLower = new Set(Array.from(compatibleIds, id => id.toLowerCase()));

  const before = models.length;
  models = models.filter(model => {
    const modelIdNoExt = model.id.replace(/\.bngl$/i, '');
    const modelPathNoExt = model.path.replace(/\.bngl$/i, '');
    const baseName = path.basename(model.path, '.bngl');

    const candidates = [
      modelIdNoExt,
      modelPathNoExt,
      baseName,
      path.basename(modelIdNoExt),
      path.basename(modelPathNoExt),
    ];

    return candidates.some(candidate => compatibleIds.has(candidate) || compatibleIdsLower.has(candidate.toLowerCase()));
  });
  console.log(`Filtered models by BNG2_COMPATIBLE_MODELS: ${before} -> ${models.length}`);

  // Support DRY_RUN for testing the filter without running the heavy embedding step
  if (process.env.DRY_RUN) {
    console.log('DRY_RUN=1: would embed the following models:');
    models.forEach(m => console.log(' -', m.id, m.path));
    console.log('Exiting due to DRY_RUN flag.');
    process.exit(0);
  }

  const embed = await getEmbedder();
  const results = [];

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    console.log(`[${i + 1}/${models.length}] Embedding: ${model.filename}`);

    try {
      // Generate embedding for the searchable text
      const output = await embed(model.searchText, { pooling: 'mean', normalize: true });
      const embedding = Array.from(output.data);

      results.push({
        id: model.id,
        filename: model.filename,
        path: model.path,
        // Preserve tags (derived from folder structure) so the UMAP page can color by category
        tags: model.tags || [],
        // Backwards-compatible category field (first tag) kept for older consumers
        category: (model.tags && model.tags[0]) || model.category || null,
        embedding: embedding,
        observables: model.observables || [],
        // Store truncated search text for display (first 200 chars)
        preview: model.searchText.slice(0, 200),
        simulationMode: model.simulationMode || 'None',
      });
    } catch (err) {
      console.error(`Failed to embed ${model.filename}:`, err.message);
    }
  }

  // Compute UMAP coordinates with fixed seed for consistency
  console.log('\nComputing UMAP projections (2D and 3D)...');
  const embeddings = results.map(r => r.embedding);

  // Simple seeded random number generator for reproducibility
  function seededRandom(seed) {
    return function () {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
  }

  // Force-directed layout with seeded randomness
  function computeLayout(data, dims, seed = 42) {
    const n = data.length;
    const rand = seededRandom(seed);
    const result = data.map(() => {
      const p = [rand() * 20 - 10, rand() * 20 - 10];
      if (dims === 3) p.push(rand() * 20 - 10);
      return p;
    });

    const cosineSim = (a, b) => {
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
      return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
    };

    const epochs = 150;
    for (let e = 0; e < epochs; e++) {
      const lr = 0.6 * (1 - e / epochs);
      for (let i = 0; i < n; i++) {
        const f = dims === 3 ? [0, 0, 0] : [0, 0];
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const d = result[i].map((v, k) => result[j][k] - v);
          const dist = Math.sqrt(d.reduce((s, v) => s + v * v, 0)) + 0.1;
          const sim = cosineSim(data[i], data[j]);
          const force = sim * 0.12 - 0.025 / dist;
          d.forEach((v, k) => f[k] += (v / dist) * force);
        }
        result[i] = result[i].map((v, k) => v + f[k] * lr);
      }
      if (e % 30 === 0) console.log(`  ${dims}D layout: epoch ${e}/${epochs}`);
    }
    return result;
  }

  const umap2D = computeLayout(embeddings, 2, 42);
  const umap3D = computeLayout(embeddings, 3, 42);

  // Add UMAP coordinates to results
  results.forEach((r, i) => {
    r.umap2D = umap2D[i].map(v => Math.round(v * 1000) / 1000); // Round for smaller file
    r.umap3D = umap3D[i].map(v => Math.round(v * 1000) / 1000);
  });
  console.log('UMAP projections computed.');

  // Write output
  const outputPath = path.join(ROOT, 'public', 'model-embeddings.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    version: 2,
    model: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384,
    count: results.length,
    generated: new Date().toISOString(),
    hasUMAP: true,
    models: results,
  }, null, 2));

  console.log(`\nGenerated embeddings for ${results.length} models.`);
  console.log(`Output: ${outputPath}`);
  console.log(`File size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
}

// Run
generateEmbeddings().catch(console.error);

