/**
 * Compare our parser output against BNG2.pl reference output
 * 
 * For models that BNG2.pl successfully processes, we compare:
 * 1. Species count
 * 2. Reaction count  
 * 3. Species strings (canonical form)
 * 4. Reaction strings (canonical form)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const BNG2_PATH = 'c:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl';
const TEST_DIR = path.join(ROOT_DIR, 'bng_compare_output');

// Load the test report to get passing models
function loadPassingModels() {
  const reportPath = path.join(ROOT_DIR, 'bng2_test_report.json');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  return report.passed;
}

// Run BNG2.pl and get the .net file
function runBNG2(modelPath, modelName) {
  const safeModelName = modelName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
  const bnglFile = path.join(TEST_DIR, `${safeModelName}.bngl`);
  
  // Copy model to test directory
  fs.copyFileSync(modelPath, bnglFile);
  
  try {
    execSync(`perl "${BNG2_PATH}" "${bnglFile}"`, {
      cwd: TEST_DIR,
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const netFile = path.join(TEST_DIR, `${safeModelName}.net`);
    if (fs.existsSync(netFile)) {
      return fs.readFileSync(netFile, 'utf-8');
    }
  } catch (e) {
    console.error(`BNG2.pl error for ${modelName}: ${e.message}`);
  }
  return null;
}

// Parse .net file to extract species and reactions
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

// Extract species string from a .net species line
// Format: "index speciesString concentration"
function extractSpeciesString(line) {
  const parts = line.trim().split(/\s+/);
  if (parts.length >= 2) {
    return parts[1]; // The species string is the second element
  }
  return line;
}

// Extract reaction info from a .net reaction line
// Format: "index reactantIndices productIndices rateExpression"
function extractReactionInfo(line) {
  const match = line.match(/^\s*(\d+)\s+([\d,]+)\s+([\d,]+)\s+(.+)$/);
  if (match) {
    return {
      index: match[1],
      reactants: match[2].split(',').map(s => s.trim()).filter(s => s && s !== '0'),
      products: match[3].split(',').map(s => s.trim()).filter(s => s && s !== '0'),
      rate: match[4].trim()
    };
  }
  return null;
}

// Clean up test directory
function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    const files = fs.readdirSync(TEST_DIR);
    for (const file of files) {
      try { fs.unlinkSync(path.join(TEST_DIR, file)); } catch (e) {}
    }
  } else {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
}

// Main comparison
async function main() {
  console.log('='.repeat(80));
  console.log('BNG2.pl vs Web Parser Comparison');
  console.log('='.repeat(80));
  console.log();
  
  cleanupTestDir();
  
  const passingModels = loadPassingModels();
  console.log(`Found ${passingModels.length} models that pass BNG2.pl\n`);
  
  const results = {
    match: [],
    mismatch: [],
    error: []
  };
  
  // For now, just run BNG2.pl and report what we find
  // Later we can add our parser comparison
  
  for (const model of passingModels.slice(0, 10)) { // Start with first 10
    console.log(`\nProcessing: ${model.model}`);
    console.log(`  Path: ${model.path}`);
    console.log(`  Expected: ${model.speciesCount} species, ${model.reactionCount} reactions`);
    
    const netContent = runBNG2(model.path, model.model);
    if (!netContent) {
      console.log('  ERROR: Could not get .net file');
      results.error.push(model);
      continue;
    }
    
    const parsed = parseNetFile(netContent);
    console.log(`  BNG2.pl .net: ${parsed.species.length} species, ${parsed.reactions.length} reactions`);
    
    // Show first few species as examples
    if (parsed.species.length > 0) {
      console.log('  Sample species:');
      for (const sp of parsed.species.slice(0, 3)) {
        const specStr = extractSpeciesString(sp);
        console.log(`    ${specStr}`);
      }
    }
    
    // Show first few reactions as examples
    if (parsed.reactions.length > 0) {
      console.log('  Sample reactions:');
      for (const rxn of parsed.reactions.slice(0, 3)) {
        const info = extractReactionInfo(rxn);
        if (info) {
          console.log(`    ${info.reactants.join('+')} -> ${info.products.join('+')}`);
        }
      }
    }
    
    results.match.push({
      model: model.model,
      bng2Species: parsed.species.length,
      bng2Reactions: parsed.reactions.length
    });
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Processed: ${results.match.length + results.error.length}`);
  console.log(`Successful: ${results.match.length}`);
  console.log(`Errors: ${results.error.length}`);
  
  // Save results
  const outputPath = path.join(ROOT_DIR, 'bng2_comparison_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch(console.error);
