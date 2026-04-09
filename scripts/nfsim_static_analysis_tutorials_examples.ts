/**
 * Static NFsim Compatibility Analysis for RuleHub Tutorials and Examples
 *
 * Analyzes all BNGL models from Tutorials/ and Contributed/ directories
 * for NFsim compatibility without running simulations.
 *
 * Outputs results to: artifacts/nfsim_static_analysis_tutorials_examples.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseBNGLWithANTLR } from '../packages/engine/src/parser/BNGLParserWrapper';
import { NFsimValidator, ValidationErrorType } from '../packages/engine/src/services/simulation/nfsim/NFsimValidator';
import type { BNGLModel } from '../packages/engine/src/types';

// Configuration
const RULEHUB_ROOT = path.join(process.cwd(), 'artifacts/rulehub-export');
const TUTORIALS_DIR = path.join(RULEHUB_ROOT, 'Tutorials');
const CONTRIBUTED_DIR = path.join(RULEHUB_ROOT, 'Contributed');
const OUTPUT_PATH = path.join(process.cwd(), 'artifacts/nfsim_static_analysis_tutorials_examples.json');
const MANIFEST_PATH = path.join(RULEHUB_ROOT, 'manifest.json');

interface ManifestEntry {
  id: string;
  name: string;
  path: string;
  category: string;
  bng2_compatible: boolean;
  origin: string;
  tags: string[];
}

interface AnalysisResult {
  id: string;
  name: string;
  filePath: string;
  origin: 'tutorial' | 'example';
  category: string;
  parseSuccess: boolean;
  parseErrors: string[];
  nfsimCompatible: boolean;
  nfsimErrors: string[];
  nfsimWarnings: string[];
  recommendations: string[];
  modelStats?: {
    moleculeTypes: number;
    species: number;
    rules: number;
    observables: number;
    parameters: number;
    functions: number;
  };
  incompatibilityReasons?: string[];
}

interface SummaryStats {
  total: number;
  parseSuccess: number;
  parseFailed: number;
  nfsimCompatible: number;
  nfsimIncompatible: number;
  byOrigin: {
    tutorials: {
      total: number;
      compatible: number;
      incompatible: number;
    };
    examples: {
      total: number;
      compatible: number;
      incompatible: number;
    };
  };
  incompatibilityReasons: Record<string, number>;
}

/**
 * Recursively find all .bngl files in a directory
 */
function findBNGLFiles(dir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    console.warn(`Directory not found: ${dir}`);
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...findBNGLFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.bngl')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Load manifest to get metadata
 */
function loadManifest(): Map<string, ManifestEntry> {
  const map = new Map<string, ManifestEntry>();

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.warn('Manifest not found, proceeding without metadata');
    return map;
  }

  try {
    const content = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    const entries: ManifestEntry[] = JSON.parse(content);

    for (const entry of entries) {
      map.set(entry.id, entry);
    }

    console.log(`Loaded manifest with ${map.size} entries`);
  } catch (err) {
    console.warn('Failed to load manifest:', err);
  }

  return map;
}

/**
 * Extract model ID from file path
 */
function extractModelId(filePath: string): string {
  // Example: artifacts/rulehub-export/Tutorials/model_name/model.bngl
  // -> model_name
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(/\/(Tutorials|Contributed)\/([^\/]+)\//);
  return match ? match[2] : path.basename(path.dirname(filePath));
}

/**
 * Analyze a single BNGL file
 */
function analyzeModel(
  filePath: string,
  manifest: Map<string, ManifestEntry>,
  validator: NFsimValidator
): AnalysisResult {
  const modelId = extractModelId(filePath);
  const manifestEntry = manifest.get(modelId);

  // Determine origin (normalize to forward slashes for cross-platform compatibility)
  const normalizedPath = filePath.replace(/\\/g, '/');
  const origin: 'tutorial' | 'example' = normalizedPath.includes('/Tutorials/') ? 'tutorial' : 'example';

  const result: AnalysisResult = {
    id: modelId,
    name: manifestEntry?.name || modelId,
    filePath: path.relative(process.cwd(), filePath),
    origin,
    category: manifestEntry?.category || 'unknown',
    parseSuccess: false,
    parseErrors: [],
    nfsimCompatible: false,
    nfsimErrors: [],
    nfsimWarnings: [],
    recommendations: []
  };

  try {
    // Read file
    const content = fs.readFileSync(filePath, 'utf-8');

    // Parse BNGL
    const parseResult = parseBNGLWithANTLR(content);

    if (!parseResult.success || !parseResult.model) {
      result.parseSuccess = false;
      result.parseErrors = parseResult.errors.map(e =>
        `Line ${e.line}:${e.column} - ${e.message}`
      );
      return result;
    }

    result.parseSuccess = true;
    const model = parseResult.model;

    // Collect model statistics
    result.modelStats = {
      moleculeTypes: model.moleculeTypes?.length || 0,
      species: model.species?.length || 0,
      rules: model.reactionRules?.length || 0,
      observables: model.observables?.length || 0,
      parameters: Object.keys(model.parameters || {}).length,
      functions: model.functions?.length || 0
    };

    // Validate for NFsim
    const validation = validator.validateForNFsim(model);

    result.nfsimCompatible = validation.valid;
    result.nfsimErrors = validation.errors.map(e => e.message);
    result.nfsimWarnings = validation.warnings.map(w => w.message);
    result.recommendations = validation.recommendations.map(r => r.message);

    // Extract incompatibility reasons
    if (!validation.valid) {
      result.incompatibilityReasons = validation.errors.map(e => {
        switch (e.type) {
          case ValidationErrorType.TOTAL_RATE_MODIFIER:
            return 'TotalRate modifier';
          case ValidationErrorType.OBSERVABLE_DEPENDENT_RATE:
            return 'Observable-dependent rate';
          case ValidationErrorType.UNSUPPORTED_FUNCTION:
            return 'Unsupported function';
          case ValidationErrorType.MISSING_REQUIREMENTS:
            return 'Missing requirements';
          default:
            return 'Unknown error';
        }
      });
    }

  } catch (err) {
    result.parseSuccess = false;
    result.parseErrors = [String(err)];
  }

  return result;
}

/**
 * Main analysis function
 */
async function main() {
  console.log('NFsim Static Analysis for Tutorials and Examples');
  console.log('='.repeat(60));

  // Load manifest
  const manifest = loadManifest();

  // Find all BNGL files
  console.log('\nSearching for BNGL files...');
  const tutorialFiles = findBNGLFiles(TUTORIALS_DIR);
  const exampleFiles = findBNGLFiles(CONTRIBUTED_DIR);

  console.log(`Found ${tutorialFiles.length} tutorial models`);
  console.log(`Found ${exampleFiles.length} example models`);
  console.log(`Total: ${tutorialFiles.length + exampleFiles.length} models\n`);

  if (tutorialFiles.length === 0 && exampleFiles.length === 0) {
    console.error('No BNGL files found!');
    console.error(`Checked directories:`);
    console.error(`  - ${TUTORIALS_DIR}`);
    console.error(`  - ${CONTRIBUTED_DIR}`);
    process.exit(1);
  }

  // Combine all files
  const allFiles = [...tutorialFiles, ...exampleFiles];

  // Initialize validator
  const validator = new NFsimValidator();

  // Analyze all models
  console.log('Analyzing models...\n');
  const results: AnalysisResult[] = [];
  let processed = 0;

  for (const filePath of allFiles) {
    processed++;
    const result = analyzeModel(filePath, manifest, validator);
    results.push(result);

    // Progress indicator
    if (processed % 10 === 0) {
      console.log(`Progress: ${processed}/${allFiles.length}`);
    }

    // Show immediate issues
    if (!result.parseSuccess) {
      console.log(`  ✗ ${result.id}: Parse failed`);
    } else if (!result.nfsimCompatible) {
      console.log(`  ✗ ${result.id}: NFsim incompatible (${result.incompatibilityReasons?.join(', ')})`);
    }
  }

  console.log(`\nCompleted: ${processed}/${allFiles.length}\n`);

  // Compute summary statistics
  const stats: SummaryStats = {
    total: results.length,
    parseSuccess: results.filter(r => r.parseSuccess).length,
    parseFailed: results.filter(r => !r.parseSuccess).length,
    nfsimCompatible: results.filter(r => r.nfsimCompatible).length,
    nfsimIncompatible: results.filter(r => r.parseSuccess && !r.nfsimCompatible).length,
    byOrigin: {
      tutorials: {
        total: results.filter(r => r.origin === 'tutorial').length,
        compatible: results.filter(r => r.origin === 'tutorial' && r.nfsimCompatible).length,
        incompatible: results.filter(r => r.origin === 'tutorial' && r.parseSuccess && !r.nfsimCompatible).length
      },
      examples: {
        total: results.filter(r => r.origin === 'example').length,
        compatible: results.filter(r => r.origin === 'example' && r.nfsimCompatible).length,
        incompatible: results.filter(r => r.origin === 'example' && r.parseSuccess && !r.nfsimCompatible).length
      }
    },
    incompatibilityReasons: {}
  };

  // Count incompatibility reasons
  for (const result of results) {
    if (result.incompatibilityReasons) {
      for (const reason of result.incompatibilityReasons) {
        stats.incompatibilityReasons[reason] = (stats.incompatibilityReasons[reason] || 0) + 1;
      }
    }
  }

  // Sort results by origin, then compatibility, then name
  results.sort((a, b) => {
    if (a.origin !== b.origin) {
      return a.origin === 'tutorial' ? -1 : 1;
    }
    if (a.nfsimCompatible !== b.nfsimCompatible) {
      return a.nfsimCompatible ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  // Write output
  const output = {
    timestamp: new Date().toISOString(),
    summary: stats,
    results
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  // Print summary
  console.log('='.repeat(60));
  console.log('Static Analysis Summary');
  console.log('='.repeat(60));
  console.log(`Total models analyzed: ${stats.total}`);
  console.log(`\nParsing:`);
  console.log(`  Success: ${stats.parseSuccess} (${(stats.parseSuccess / stats.total * 100).toFixed(1)}%)`);
  console.log(`  Failed:  ${stats.parseFailed} (${(stats.parseFailed / stats.total * 100).toFixed(1)}%)`);
  console.log(`\nNFsim Compatibility (of successfully parsed):`);
  console.log(`  Compatible:   ${stats.nfsimCompatible} (${(stats.nfsimCompatible / stats.parseSuccess * 100).toFixed(1)}%)`);
  console.log(`  Incompatible: ${stats.nfsimIncompatible} (${(stats.nfsimIncompatible / stats.parseSuccess * 100).toFixed(1)}%)`);

  console.log(`\nBy Origin:`);
  console.log(`  Tutorials:`);
  console.log(`    Total:        ${stats.byOrigin.tutorials.total}`);
  console.log(`    Compatible:   ${stats.byOrigin.tutorials.compatible}`);
  console.log(`    Incompatible: ${stats.byOrigin.tutorials.incompatible}`);
  console.log(`  Examples:`);
  console.log(`    Total:        ${stats.byOrigin.examples.total}`);
  console.log(`    Compatible:   ${stats.byOrigin.examples.compatible}`);
  console.log(`    Incompatible: ${stats.byOrigin.examples.incompatible}`);

  if (Object.keys(stats.incompatibilityReasons).length > 0) {
    console.log(`\nIncompatibility Reasons:`);
    const sortedReasons = Object.entries(stats.incompatibilityReasons)
      .sort((a, b) => b[1] - a[1]);
    for (const [reason, count] of sortedReasons) {
      console.log(`  ${reason}: ${count}`);
    }
  }

  console.log(`\nResults written to: ${OUTPUT_PATH}`);
  console.log('='.repeat(60));

  // Print sample incompatible models
  const incompatible = results.filter(r => r.parseSuccess && !r.nfsimCompatible);
  if (incompatible.length > 0) {
    console.log(`\nSample Incompatible Models (showing up to 10):`);
    for (const result of incompatible.slice(0, 10)) {
      console.log(`  - ${result.id} (${result.origin}): ${result.incompatibilityReasons?.join(', ')}`);
    }
    if (incompatible.length > 10) {
      console.log(`  ... and ${incompatible.length - 10} more`);
    }
  }

  console.log('\nAnalysis complete!');
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
