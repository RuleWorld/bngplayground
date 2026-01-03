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

// Model directories to scan
const MODEL_DIRS = [
  'example-models',
  'published-models/cell-regulation',
  'published-models/complex-models',
  'published-models/growth-factor-signaling',
  'published-models/immune-signaling',
  'published-models/tutorials',
  'published-models/native-tutorials',
  'published-models/literature',
];

// Initialize the embedding model (runs locally, no API needed)
// Using all-MiniLM-L6-v2: small (22MB), fast, good quality
let embedder = null;

async function getEmbedder() {
  if (!embedder) {
    console.log('Loading embedding model (all-MiniLM-L6-v2)...');
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
    
    const scanDir = (currentDir, category) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          scanDir(fullPath, category || entry.name);
        } else if (entry.name.endsWith('.bngl')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const relativePath = path.relative(ROOT, fullPath);
          
          models.push({
            id: relativePath.replace(/\\/g, '/').replace(/\.bngl$/, ''),
            filename: entry.name,
            path: relativePath.replace(/\\/g, '/'),
            category: category || path.basename(dir),
            searchText: extractSearchableText(entry.name, content),
          });
        }
      }
    };
    
    scanDir(fullDir, null);
  }
  
  return models;
}

/**
 * Generate embeddings for all models.
 */
async function generateEmbeddings() {
  console.log('Scanning for BNGL models...');
  const models = scanModels();
  console.log(`Found ${models.length} models.`);
  
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
        category: model.category,
        embedding: embedding,
        // Store truncated search text for display (first 200 chars)
        preview: model.searchText.slice(0, 200),
      });
    } catch (err) {
      console.error(`Failed to embed ${model.filename}:`, err.message);
    }
  }
  
  // Write output
  const outputPath = path.join(ROOT, 'public', 'model-embeddings.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    version: 1,
    model: 'all-MiniLM-L6-v2',
    dimensions: 384,
    count: results.length,
    generated: new Date().toISOString(),
    models: results,
  }, null, 2));
  
  console.log(`\nGenerated embeddings for ${results.length} models.`);
  console.log(`Output: ${outputPath}`);
  console.log(`File size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
}

// Run
generateEmbeddings().catch(console.error);
