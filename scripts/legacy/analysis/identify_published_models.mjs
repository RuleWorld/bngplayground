#!/usr/bin/env node
/**
 * Generate GDAT and CSV for published models (non-example models)
 * Focuses on RuleHub Published entries excluding BNG2_EXCLUDED_MODELS
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Excluded models (from constants.ts)
const EXCLUDED_MODELS = new Set([
  'Erdem_2021',
  'Faeder_2003',
  'fceri_2003',
]);

function resolveRuleHubRoot(projectRoot) {
  const fromEnv = process.env.RULEHUB_ROOT?.trim();
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    if (fs.existsSync(resolved)) return resolved;
  }

  const sibling = path.resolve(projectRoot, '..', 'RuleHub');
  return fs.existsSync(sibling) ? sibling : null;
}

function collectBnglFilesRecursive(rootDir, results = []) {
  if (!fs.existsSync(rootDir)) return results;

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      collectBnglFilesRecursive(fullPath, results);
    } else if (entry.isFile() && entry.name.endsWith('.bngl')) {
      results.push(fullPath);
    }
  }

  return results;
}

const RULEHUB_ROOT = resolveRuleHubRoot(PROJECT_ROOT);
if (!RULEHUB_ROOT) {
  throw new Error('RuleHub checkout not found. Set RULEHUB_ROOT or place RuleHub beside this repo.');
}

const publishedModelsDir = path.join(RULEHUB_ROOT, 'Published');
const exampleModelsDir = path.join(RULEHUB_ROOT, 'Contributed', 'BNGPlayground_Examples');
const allModels = collectBnglFilesRecursive(publishedModelsDir)
  .map((filePath) => path.basename(filePath, '.bngl'));

// Filter out excluded and example models
const exampleModels = collectBnglFilesRecursive(exampleModelsDir)
  .map((filePath) => path.basename(filePath, '.bngl'));

const publishedModels = allModels.filter(m => 
  !EXCLUDED_MODELS.has(m) && !exampleModels.includes(m)
);

console.log(`Total models in RuleHub Published: ${allModels.length}`);
console.log(`Example models (skipping): ${exampleModels.length}`);
console.log(`Excluded models: ${Array.from(EXCLUDED_MODELS).join(', ')}`);
console.log(`Published models to process: ${publishedModels.length}`);
console.log('');

// Create models list for web output generation
const modelsListPath = path.join(PROJECT_ROOT, 'published_models_list.txt');
fs.writeFileSync(modelsListPath, publishedModels.join(','), 'utf-8');

console.log(`Saved published models list to: ${modelsListPath}`);
console.log('');
console.log('Published models:', publishedModels.slice(0, 10).join(', '), '...');
console.log('');
console.log('Next step: Run web output generation with:');
console.log(`  $env:WEB_OUTPUT_MODELS='${publishedModels.join(',')}'; npm run generate:web-output`);
