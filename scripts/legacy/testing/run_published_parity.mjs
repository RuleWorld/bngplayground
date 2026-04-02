
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const WEB_OUTPUT_DIR = 'web_output';
const REFERENCE_OUTPUT_DIR = 'bng_test_output';

// Viable models that should be checked
// This list should ideally be dynamic or match the one in get_viable_published_models.mjs
// For now, we rely on generate_web_output processing "all" viable models if WEB_OUTPUT_MODELS is unset, 
// OR we can explicitly list them if needed. 
// A better approach: Run generate first, then compare all found results.

try {
  console.log('Starting Published Models Parity Check...');

  // 1. Generate Web Outputs (Phase 1)
  // We assume WEB_OUTPUT_MODELS is handled by the generate script logic (if set externally or defaults to all)
  // For published models, we might want to ensure we target the right set.
  // But usually, we run this script AFTER generating, or this script calls generate.
  
  // Checking if outputs exist, if not, maybe triggering generation?
  // For this specific task, we'll assume generation is run separately or we run it here.
  // Let's run generation for a specific subset or all if not filtered.
  
  // console.log('Running web output generation...');
  // execSync('npm run generate:web-output', { stdio: 'inherit' });

  // 2. Run Comparison
  console.log('Running Comparison...');
  execSync('npx tsx scripts/compare_outputs.ts', { stdio: 'inherit' });

  console.log('Parity check complete.');
  
} catch (error) {
  console.error('Error running parity check:', error);
  process.exit(1);
}
