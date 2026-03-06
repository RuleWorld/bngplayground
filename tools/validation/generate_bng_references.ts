/**
 * Generate BNG2.pl reference outputs for models missing GDAT files
 * Usage: npx tsx scripts/generate_bng_references.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import * as os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MODELS_DIR = path.join(PROJECT_ROOT, 'public', 'models');
const BNG_OUTPUT_DIR = path.join(PROJECT_ROOT, 'bng_test_output');
const BNG2_PL = 'C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl';

// Use temp directory without spaces to avoid BNG2.pl path issues
const TEMP_DIR = path.join(os.tmpdir(), 'bng_temp_' + Date.now());

// Models that are known to fail or should be skipped
const SKIP_MODELS = new Set([
  'BaruaFceRI_2012', // .bngfail
  'BaruaBCR_2012', // missing simulate/ode
  'Dushek_2011', // .bngfail
  'Kesseler_2013', // .bngfail
  'Kiefhaber_emodel', // .bngfail
  'LRR', // .bngfail
  'mapk-dimers', // .bngfail
  'mapk-monomers', // .bngfail
  'McMillan_2021', // .bngfail
  'michment_cont', // .bngfail
  'nfkb_illustrating_protocols', // .bngfail
  'rec_dim', // .bngfail
  'rec_dim_comp', // .bngfail
  'test_fixed', // .bngfail
  'tlmr', // .bngfail
  'toy1', // .bngfail
  'toy2', // .bngfail
  'vilar_2002', // .bngfail
  'vilar_2002b', // .bngfail
  'vilar_2002c', // .bngfail
  // Models without simulate actions or incomplete
  'simple_nfsim',
  'test_sbml_flat',
  'test_sbml_structured',
  'test_write_sbml_multi',
  'empty_compartments_block',
  'deleteMolecules',
  'ComplexDegradation',
  'wofsy-goldstein',
  'visualize',
  'polymer_draft',
]);

interface BNGResult {
  model: string;
  status: 'success' | 'failed' | 'skipped' | 'exists';
  gdatFile?: string;
  error?: string;
}

function normalizeBaseName(name: string): string {
  return name.toLowerCase().replace(/[_\s-]+/g, '');
}

function hasGdatFile(baseName: string): boolean {
  const normalized = normalizeBaseName(baseName);
  const files = fs.readdirSync(BNG_OUTPUT_DIR);

  for (const file of files) {
    if (file.endsWith('.gdat')) {
      const fileBase = path.basename(file, '.gdat');
      if (normalizeBaseName(fileBase) === normalized) {
        return true;
      }
    }
  }
  return false;
}

async function runBNG2(bnglPath: string, baseName: string): Promise<BNGResult> {
  return new Promise((resolve) => {
    console.log(`\n[${baseName}] Running BNG2.pl...`);

    // Copy BNGL to temp directory to avoid path-with-spaces issues
    const tempBngl = path.join(TEMP_DIR, `${baseName}.bngl`);
    fs.copyFileSync(bnglPath, tempBngl);

    const proc = spawn('perl', [BNG2_PL, tempBngl], {
      cwd: TEMP_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill();
      resolve({
        model: baseName,
        status: 'failed',
        error: 'Timeout (30s)',
      });
    }, 30000); // 30 second timeout

    proc.on('close', (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        // Check for GDAT files (including multi-phase _2.gdat etc)
        const files = fs.readdirSync(TEMP_DIR);
        // Match base.gdat and base_N.gdat
        const gdatFiles = files.filter(f =>
          (f === `${baseName}.gdat` || (f.startsWith(`${baseName}_`) && f.endsWith('.gdat')))
        ).sort((a, b) => {
          // Sort: base.gdat first, then _2, _3...
          if (a === `${baseName}.gdat`) return -1;
          if (b === `${baseName}.gdat`) return 1;

          // Extract number from base_N.gdat
          const numA = parseInt(a.match(/_(\d+)\.gdat$/)?.[1] || '0');
          const numB = parseInt(b.match(/_(\d+)\.gdat$/)?.[1] || '0');
          return numA - numB;
        });

        const targetGdatFile = path.join(BNG_OUTPUT_DIR, `${baseName}.gdat`);

        if (gdatFiles.length > 0) {
          if (gdatFiles.length === 1) {
            // Single file - just copy
            console.log(`[${baseName}] Found 1 GDAT file. Checking Temp Dir content:`, files);
            fs.copyFileSync(path.join(TEMP_DIR, gdatFiles[0]), targetGdatFile);
            console.log(`[${baseName}] ✓ Success - GDAT created`);
          } else {
            // Multiple files - concatenate
            console.log(`[${baseName}] Concatenating ${gdatFiles.length} phase files...`);

            // Read first file (keep header)
            let combinedContent = fs.readFileSync(path.join(TEMP_DIR, gdatFiles[0]), 'utf8');

            // Append others (skip header)
            for (let i = 1; i < gdatFiles.length; i++) {
              const content = fs.readFileSync(path.join(TEMP_DIR, gdatFiles[i]), 'utf8');
              const lines = content.split('\n');
              const dataLines = lines.filter(l => l.trim().length > 0 && !l.trim().startsWith('#'));

              if (dataLines.length > 0) {
                if (!combinedContent.endsWith('\n')) combinedContent += '\n';
                combinedContent += dataLines.join('\n');
              }
            }

            fs.writeFileSync(targetGdatFile, combinedContent);
            console.log(`[${baseName}] ✓ Success - Multi-phase GDAT files concatenated`);
          }

          resolve({
            model: baseName,
            status: 'success',
            gdatFile: `${baseName}.gdat`,
          });
        } else {
          console.log(`[${baseName}] ✗ No GDAT file found after execution`);
          resolve({
            model: baseName,
            status: 'failed',
            error: 'No GDAT output',
          });
        }
      } else {
        console.log(`[${baseName}] ✗ Failed (exit code ${code})`);
        resolve({
          model: baseName,
          status: 'failed',
          error: `Exit code ${code}\n${stderr}`,
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      console.log(`[${baseName}] ✗ Error: ${err.message}`);
      resolve({
        model: baseName,
        status: 'failed',
        error: err.message,
      });
    });
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('BNG2.pl Reference Generator');
  console.log('='.repeat(60));
  console.log(`BNG2.pl: ${BNG2_PL}`);
  console.log(`Models: ${MODELS_DIR}`);
  console.log(`Output: ${BNG_OUTPUT_DIR}`);
  console.log(`Temp: ${TEMP_DIR}`);
  console.log('');

  if (!fs.existsSync(BNG2_PL)) {
    console.error(`ERROR: BNG2.pl not found at ${BNG2_PL}`);
    process.exit(1);
  }

  if (!fs.existsSync(BNG_OUTPUT_DIR)) {
    fs.mkdirSync(BNG_OUTPUT_DIR, { recursive: true });
  }

  // Create temp directory
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  // Get all BNGL files
  const bnglFiles = fs.readdirSync(MODELS_DIR)
    .filter(f => f.endsWith('.bngl'))
    .sort();

  console.log(`Found ${bnglFiles.length} BNGL files`);

  const results: BNGResult[] = [];
  let processed = 0;
  let skipped = 0;
  const existed = 0;
  let generated = 0;
  let failed = 0;

  for (const file of bnglFiles) {
    const baseName = path.basename(file, '.bngl');
    const bnglPath = path.join(MODELS_DIR, file);

    // Skip known problematic models
    if (SKIP_MODELS.has(baseName)) {
      console.log(`[${baseName}] Skipped (known issue)`);
      results.push({
        model: baseName,
        status: 'skipped',
      });
      skipped++;
      continue;
    }

    // Filter by env var
    if (process.env.MODELS) {
      const allowed = process.env.MODELS.split(',').map(s => s.trim());
      if (!allowed.includes(baseName)) {
        continue;
      }
    }

    // Run BNG2.pl (overwrite existing GDAT files)
    const result = await runBNG2(bnglPath, baseName);
    results.push(result);
    processed++;

    if (result.status === 'success') {
      generated++;
    } else if (result.status === 'failed') {
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total BNGL files: ${bnglFiles.length}`);
  console.log(`Already existed: ${existed}`);
  console.log(`Skipped (known issues): ${skipped}`);
  console.log(`Processed: ${processed}`);
  console.log(`  ✓ Successfully generated: ${generated}`);
  console.log(`  ✗ Failed: ${failed}`);
  console.log('');

  if (failed > 0) {
    console.log('Failed models:');
    results
      .filter(r => r.status === 'failed')
      .forEach(r => {
        console.log(`  - ${r.model}: ${r.error}`);
      });
  }

  // Write results to JSON
  const reportPath = path.join(PROJECT_ROOT, 'bng_generation_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nReport written to: ${reportPath}`);

  // Cleanup temp directory
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    console.log(`Cleaned up temp directory: ${TEMP_DIR}`);
  } catch (err) {
    console.warn(`Warning: Could not clean up temp directory: ${err}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  // Cleanup on error
  try {
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  } catch { }
  process.exit(1);
});
