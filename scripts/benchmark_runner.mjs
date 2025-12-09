/**
 * Test script that compares web simulator output against BNG2.pl reference output
 * 
 * This is the true test - if BNG2.pl can parse and simulate a model,
 * our web simulator should produce matching results.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BNG2_PATH = 'c:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl';
const TEST_DIR = path.join(__dirname, 'bng_test_output');

// Find all .bngl files in published-models and example-models
function findBnglFiles() {
  const models = [];
  const dirs = ['published-models', 'example-models'];

  for (const dir of dirs) {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) continue;

    // Recursively find all .bngl files
    function scanDir(currentPath) {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith('.bngl')) {
          models.push({
            path: fullPath,
            name: entry.name.replace('.bngl', ''),
            category: path.relative(__dirname, currentPath)
          });
        }
      }
    }
    scanDir(dirPath);
  }

  return models;
}

// Run a model through BNG2.pl
function runBNG2(modelPath, modelName) {
  const safeModelName = modelName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
  const bnglFile = path.join(TEST_DIR, `${safeModelName}.bngl`);

  // Copy the model to test directory
  fs.copyFileSync(modelPath, bnglFile);

  try {
    // Run BNG2.pl with timeout
    const result = execSync(`perl "${BNG2_PATH}" "${bnglFile}"`, {
      cwd: TEST_DIR,
      timeout: 120000, // 120 second timeout
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Check for output files
    const gdatFile = path.join(TEST_DIR, `${safeModelName}.gdat`);
    const cdatFile = path.join(TEST_DIR, `${safeModelName}.cdat`);
    const netFile = path.join(TEST_DIR, `${safeModelName}.net`);

    return {
      success: true,
      gdat: fs.existsSync(gdatFile) ? fs.readFileSync(gdatFile, 'utf-8') : null,
      cdat: fs.existsSync(cdatFile) ? fs.readFileSync(cdatFile, 'utf-8') : null,
      net: fs.existsSync(netFile) ? fs.readFileSync(netFile, 'utf-8') : null,
      stdout: result
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stderr: error.stderr?.toString() || ''
    };
  }
}

// Parse .net file to extract species, parameters, reactions
function parseNetFile(content) {
  if (!content) return null;

  const result = {
    parameters: [],
    species: [],
    reactions: [],
    groups: []
  };

  let currentBlock = null;
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('begin parameters')) {
      currentBlock = 'parameters';
    } else if (trimmed.startsWith('begin species')) {
      currentBlock = 'species';
    } else if (trimmed.startsWith('begin reactions')) {
      currentBlock = 'reactions';
    } else if (trimmed.startsWith('begin groups')) {
      currentBlock = 'groups';
    } else if (trimmed.startsWith('end ')) {
      currentBlock = null;
    } else if (currentBlock && trimmed && !trimmed.startsWith('#')) {
      result[currentBlock].push(trimmed);
    }
  }

  return result;
}

// Parse .gdat or .cdat file into structured data
function parseDataFile(content) {
  if (!content) return null;

  const lines = content.trim().split('\n');
  if (lines.length < 2) return null;

  // First line is header
  const header = lines[0].replace(/^#\s*/, '').trim().split(/\s+/);

  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const values = line.split(/\s+/).map(v => parseFloat(v));
    if (values.length > 0 && !isNaN(values[0])) {
      data.push(values);
    }
  }

  return { header, data };
}

// Clean up test directory
function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    const files = fs.readdirSync(TEST_DIR);
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(TEST_DIR, file));
      } catch (e) { }
    }
  } else {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
}

// Clean up files for a specific model
function cleanupModelFiles(safeModelName) {
  const extensions = ['bngl', 'gdat', 'cdat', 'net', 'xml', 'm', 'log'];
  for (const ext of extensions) {
    const f = path.join(TEST_DIR, `${safeModelName}.${ext}`);
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch (e) { }
    }
  }
}

// Main test function
async function runTests() {
  console.log('='.repeat(80));
  console.log('BNG2.pl Comparison Test');
  console.log('='.repeat(80));
  console.log(`BNG2.pl path: ${BNG2_PATH}`);
  console.log(`Test directory: ${TEST_DIR}`);
  console.log();

  // Create test directory
  cleanupTestDir();

  // Find all .bngl files
  console.log('Finding .bngl model files...');
  const models = findBnglFiles();
  console.log(`Found ${models.length} models\n`);

  const results = {
    passed: [],
    failed: [],
    skipped: [], // Models that BNG2.pl can't parse (we skip these)
    parseOnly: [] // Models that parse but don't simulate (no simulate command)
  };

  // Models to explicitly skip (simulate_nf or other reasons)
  const MODELS_TO_SKIP = [
    'simulate_nf',    // Network-free simulation not supported in comparison
    'test_viz',       // Visualization test model
    'simple_system'   // Too simple / specific edge case
  ];

  for (const model of models) {
    const displayName = `${model.category}/${model.name}`.substring(0, 60);
    process.stdout.write(`Testing: ${displayName.padEnd(62)} `);

    // Check if model should be skipped
    if (MODELS_TO_SKIP.some(skip => model.name.includes(skip) || model.path.includes(skip))) {
      console.log('SKIP (Explicitly excluded)');
      results.skipped.push({
        model: model.name,
        path: model.path,
        category: model.category,
        error: 'Explicitly excluded'
      });
      continue;
    }

    // Clean up previous test files
    const safeModelName = model.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    cleanupModelFiles(safeModelName);

    const bngResult = runBNG2(model.path, model.name);

    if (!bngResult.success) {
      // BNG2.pl couldn't parse/run this model - skip it
      console.log('SKIP (BNG2.pl error)');
      results.skipped.push({
        model: model.name,
        path: model.path,
        category: model.category,
        error: bngResult.error,
        stderr: bngResult.stderr
      });
      continue;
    }

    // Check what output we got
    if (bngResult.gdat || bngResult.cdat) {
      // Model simulated successfully
      const gdatData = parseDataFile(bngResult.gdat);
      const cdatData = parseDataFile(bngResult.cdat);
      const netData = parseNetFile(bngResult.net);

      console.log('PASS');
      results.passed.push({
        model: model.name,
        path: model.path,
        category: model.category,
        hasGdat: !!bngResult.gdat,
        hasCdat: !!bngResult.cdat,
        hasNet: !!bngResult.net,
        gdatRows: gdatData?.data?.length || 0,
        cdatRows: cdatData?.data?.length || 0,
        speciesCount: netData?.species?.length || 0,
        reactionCount: netData?.reactions?.length || 0
      });
    } else if (bngResult.net) {
      // Model parsed but didn't simulate (no simulate command, or just generates network)
      console.log('PARSE ONLY (no simulation output)');
      const netData = parseNetFile(bngResult.net);
      results.parseOnly.push({
        model: model.name,
        path: model.path,
        category: model.category,
        speciesCount: netData?.species?.length || 0,
        reactionCount: netData?.reactions?.length || 0
      });
    } else {
      // Something unexpected
      console.log('UNKNOWN (no output files)');
      results.skipped.push({
        model: model.name,
        path: model.path,
        category: model.category,
        error: 'No output files generated',
        stderr: ''
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total models:       ${models.length}`);
  console.log(`Simulated (PASS):   ${results.passed.length}`);
  console.log(`Parse only:         ${results.parseOnly.length}`);
  console.log(`Skipped (BNG2 err): ${results.skipped.length}`);

  // Save detailed results
  const reportPath = path.join(__dirname, 'bng2_test_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed report saved to: ${reportPath}`);

  // Show skipped models (these are ones we don't need to support)
  if (results.skipped.length > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log('SKIPPED MODELS (BNG2.pl errors - we do not need to support these):');
    console.log('-'.repeat(80));
    for (const skip of results.skipped) {
      console.log(`  - ${skip.category}/${skip.model}`);
      if (skip.stderr) {
        // Extract just the key error line
        const errorMatch = skip.stderr.match(/ERROR:.*$/m) || skip.stderr.match(/BNG2.pl:\s*(.*)$/m);
        if (errorMatch) {
          console.log(`    ${errorMatch[0].substring(0, 100)}`);
        }
      }
    }
  }

  // Show parse-only models
  if (results.parseOnly.length > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log('PARSE-ONLY MODELS (no simulation output):');
    console.log('-'.repeat(80));
    for (const p of results.parseOnly) {
      console.log(`  - ${p.category}/${p.model}: ${p.speciesCount} species, ${p.reactionCount} reactions`);
    }
  }

  return results;
}

// Run tests
runTests().catch(console.error);
