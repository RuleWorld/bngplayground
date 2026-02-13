import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { VALIDATION_MODEL_NAMES } from '../validation_models';

import { DEFAULT_BNG2_PATH, DEFAULT_PERL_CMD } from './bngDefaults.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Configuration
const BNG2_PATH = process.env.BNG2_PATH ?? DEFAULT_BNG2_PATH;
const PERL_CMD = process.env.PERL_CMD ?? DEFAULT_PERL_CMD;
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'bng_test_output');
const MODELS_DIR = path.join(PROJECT_ROOT, 'public/models');

// Skip list (same as tests)
const SKIP_MODELS = ['blbr', 'cBNGL_simple'];

// Parse arguments
const args = process.argv.slice(2);
const modelFilterIndex = args.indexOf('--models');
let modelFilter: string[] = [];
if (modelFilterIndex !== -1 && args[modelFilterIndex + 1]) {
    modelFilter = args[modelFilterIndex + 1].split(',').map(s => s.trim());
}

function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function shouldSkip(modelName: string): boolean {
    return SKIP_MODELS.some(s => modelName.toLowerCase().includes(s.toLowerCase()));
}

function runBNG2(modelName: string, outputDir: string) {
    const modelPath = path.join(MODELS_DIR, `${modelName}.bngl`);
    console.log(`[BNG2] Processing ${modelName}...`);

    if (!fs.existsSync(modelPath)) {
        console.error(`[BNG2] Model file not found: ${modelPath}`);
        return false;
    }

    // Create temp dir for execution to avoid polluting source folders
    const tempDir = fs.mkdtempSync(path.join(PROJECT_ROOT, 'bng_exec_'));
    const tempModelPath = path.join(tempDir, `${modelName}.bngl`);
    fs.copyFileSync(modelPath, tempModelPath);

    try {
        const result = spawnSync(PERL_CMD, [BNG2_PATH, path.basename(tempModelPath)], {
            cwd: tempDir,
            stdio: 'pipe',
            encoding: 'utf-8'
        });

        if (result.status !== 0) {
            console.error(`[BNG2] Failed for ${modelName}`);
            // if (result.stdout) console.log(result.stdout);
            if (result.stderr) console.error(result.stderr);
            return false;
        }

        // Find .gdat files
        const files = fs.readdirSync(tempDir);
        const gdatFiles = files.filter(f => f.endsWith('.gdat'));

        if (gdatFiles.length === 0) {
            console.warn(`[BNG2] No GDAT output for ${modelName}`);
            return false;
        }

        // Copy to output dir
        for (const file of gdatFiles) {
            const src = path.join(tempDir, file);
            const dest = path.join(outputDir, file);
            fs.copyFileSync(src, dest);
            console.log(`[BNG2] Saved ${file}`);
        }
        return true;

    } catch (e) {
        console.error(`[BNG2] Error executing:`, e);
        return false;
    } finally {
        // Cleanup
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {
            // ignore
        }
    }
}

function main() {
    if (!fs.existsSync(BNG2_PATH)) {
        console.error(`BNG2.pl not found at ${BNG2_PATH}`);
        process.exit(1);
    }

    ensureDir(OUTPUT_DIR);

    const models = VALIDATION_MODEL_NAMES;
    console.log(`Loaded ${models.length} models from VALID_MODEL_NAMES in validation_models.ts`);

    let success = 0;
    let skipped = 0;
    let failed = 0;

    for (const modelName of models) {
        if (modelFilter.length > 0 && !modelFilter.some(m => modelName.includes(m))) {
            continue;
        }
        if (shouldSkip(modelName)) {
            console.log(`[BNG2] Skipping ${modelName}`);
            skipped++;
            continue;
        }

        if (runBNG2(modelName, OUTPUT_DIR)) {
            success++;
        } else {
            failed++;
        }
    }

    console.log(`\nSummary:`);
    console.log(`  Success: ${success}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Failed:  ${failed}`);
}

main();
