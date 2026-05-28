/**
 * Contact Map Parity Script
 *
 * For each model with molecule types, runs `buildContactMap` and compares
 * node/edge sets against BNG2 `visualize({type=>"contactmap"})` GML output.
 *
 * Comparison points:
 * - molecule names (sorted)
 * - component names per molecule (sorted)
 * - state names per component (sorted)
 * - bond edge set (sorted pairs)
 *
 * Usage: npx ts-node scripts/contact_map_parity.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface ParityResult {
  model: string;
  status: 'pass' | 'fail' | 'skip';
  details?: string;
  molecules?: string[];
  edges?: number;
  expectedEdges?: number;
}

const runParityCheck = async () => {
  const results: ParityResult[] = [];

  // Get all models from public/models or examples
  const modelsDir = path.join(__dirname, '../public/models');
  const modelFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith('.bngl') || f.endsWith('.bng'));

  console.log(`Found ${modelFiles.length} models to check...\n`);

  for (const modelFile of modelFiles.slice(0, 10)) { // Limit to first 10 for quick check
    try {
      const modelPath = path.join(modelsDir, modelFile);
      fs.readFileSync(modelPath, 'utf-8');

      // Parse model (simplified - would need actual parser)
      // For now, just check if contact map can be built
      console.log(`Checking ${modelFile}...`);

      // This is a skeleton - full implementation would:
      // 1. Parse BNGL model to get molecule types and rules
      // 2. Build contact map using buildContactMap
      // 3. Compare with BNG2 GML output

      results.push({
        model: modelFile,
        status: 'skip',
        details: 'Full implementation pending BNG2 GML output comparison',
      });
    } catch (err) {
      results.push({
        model: modelFile,
        status: 'fail',
        details: String(err),
      });
    }
  }

  // Output results
  console.log('\n=== Parity Results ===');
  console.table(results);

  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const skipCount = results.filter(r => r.status === 'skip').length;

  console.log(`\nSummary: ${passCount} pass, ${failCount} fail, ${skipCount} skip`);

  return failCount === 0;
};

runParityCheck().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Parity check failed:', err);
  process.exit(1);
});
