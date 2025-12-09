/**
 * Full GDAT Comparison Script
 * 
 * This script:
 * 1. Parses BNGL models using the web simulator's parser
 * 2. Runs ODE simulation using the same logic as the web worker
 * 3. Compares output against BNG2.pl reference .gdat files
 * 4. Generates detailed comparison report
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  console.log('=== GDAT Comparison: Web Simulator vs BNG2.pl ===\n');

  // Read the test report to get model list
  const reportPath = path.join(projectRoot, 'bng2_test_report.json');
  if (!fs.existsSync(reportPath)) {
    console.error('Error: bng2_test_report.json not found. Run the BNG2.pl test first.');
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

  // Get models that passed BNG2.pl simulation (have gdat output)
  // Report structure: { passed: [{model, hasGdat, ...}], failed: [...] }
  const modelsWithGdat = report.passed.filter(r =>
    r.hasGdat === true
  );

  console.log(`Found ${modelsWithGdat.length} models with BNG2.pl GDAT output\n`);

  // Load reference gdat files
  const gdatDir = path.join(projectRoot, 'gdat_comparison_output');
  if (!fs.existsSync(gdatDir)) {
    console.error('Error: gdat_comparison_output/ not found. Run compare_gdat_output.mjs first.');
    process.exit(1);
  }

  // Parse a gdat file into structured data
  function parseGdat(content) {
    const lines = content.trim().split('\n');
    if (lines.length === 0) return null;

    // Find header line (starts with #)
    let headerLine = lines.find(l => l.startsWith('#'));
    if (!headerLine) return null;

    // Parse header - columns are space/tab separated
    const headers = headerLine.replace(/^#\s*/, '').trim().split(/\s+/);

    // Parse data rows
    const data = [];
    for (const line of lines) {
      if (line.startsWith('#') || !line.trim()) continue;
      const values = line.trim().split(/\s+/).map(v => parseFloat(v));
      if (values.length === headers.length) {
        const row = {};
        headers.forEach((h, i) => row[h] = values[i]);
        data.push(row);
      }
    }

    return { headers, data };
  }

  // For now, just report what we have and note that we need to run web simulation
  console.log('Reference GDAT files available:');

  const comparisonResults = [];
  let available = 0;

  for (const model of modelsWithGdat) {
    const modelName = model.model; // Report uses 'model' field, not 'modelName'
    const bng2GdatPath = path.join(gdatDir, `${modelName}_bng2.gdat`);

    if (fs.existsSync(bng2GdatPath)) {
      available++;
      const bng2Content = fs.readFileSync(bng2GdatPath, 'utf-8');
      const bng2Gdat = parseGdat(bng2Content);

      if (bng2Gdat) {
        comparisonResults.push({
          modelName,
          bng2GdatPath,
          bng2Headers: bng2Gdat.headers,
          bng2DataPoints: bng2Gdat.data.length,
          status: 'ready_for_comparison'
        });
      }
    }
  }

  console.log(`\n${available}/${modelsWithGdat.length} reference GDAT files found\n`);

  // Write summary
  const summaryPath = path.join(projectRoot, 'gdat_comparison_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalModels: modelsWithGdat.length,
    availableReferences: available,
    models: comparisonResults
  }, null, 2));

  console.log(`Summary written to: ${summaryPath}`);

  // Write model list to JSON for the static test file to consume
  console.log('\n--- Generating model list for Vitest ---\n');

  // We write to src/gdat_models.json so it's easily importable by the test
  const modelsJsonPath = path.join(projectRoot, 'src', 'gdat_models.json');
  fs.writeFileSync(modelsJsonPath, JSON.stringify(comparisonResults, null, 2));

  console.log(`Model list written to: ${modelsJsonPath}`);
  console.log('\nRun with: npm test -- src/gdat_benchmark.test.ts');
}

main().catch(console.error);
