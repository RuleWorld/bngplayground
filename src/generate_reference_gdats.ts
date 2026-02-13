#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Generate reference GDAT files using BNG2.pl for all parseable models
 * This expands parity coverage from 60 to 88 models
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BNG2_PATH = 'C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl';
const OUTPUT_DIR = path.join(__dirname, '../gdat_comparison_output');
const PUBLISHED_DIR = path.join(__dirname, '../public/published-models');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Get all RUN_SUCCESS models from benchmark results
const benchmarkResults = JSON.parse(fs.readFileSync(path.join(__dirname, '../benchmark_results.json'), 'utf-8'));
const successModels = benchmarkResults.filter((r: any) => r.status === 'RUN_SUCCESS');

console.log(`Found ${successModels.length} RUN_SUCCESS models to generate reference GDATs for.`);

// Recursive file finder
function findBnglFile(dir: string, modelName: string): string | null {
    if (!fs.existsSync(dir)) return null;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const found = findBnglFile(fullPath, modelName);
            if (found) return found;
        } else if (entry.name === `${modelName}.bngl`) {
            return fullPath;
        }
    }
    return null;
}

// Search directories
const searchRoots = [
    path.join(__dirname, '../example-models'),
];

// Instead of successModels, just get all BNGLs
const allBngls = fs.readdirSync(searchRoots[0]).filter(f => f.endsWith('.bngl'));
const targetModels = allBngls.map(f => ({ name: f.replace('.bngl', '') }));

console.log(`Found ${targetModels.length} models in example-models to generate reference GDATs for.`);

interface GdatConfig {
    modelName: string;
    bng2GdatPath: string;
    bng2Headers: string[];
    bng2DataPoints: number;
    status: string;
}

const newConfigs: GdatConfig[] = [];
let generated = 0;
let skipped = 0;
let errors = 0;

for (const model of targetModels) {
    const modelName = model.name;

    // Find model BNGL file recursively in all search roots
    let bnglPath: string | null = null;
    for (const root of searchRoots) {
        bnglPath = findBnglFile(root, modelName);
        if (bnglPath) break;
    }

    if (!bnglPath) {
        console.log(`[SKIP] ${modelName}: BNGL file not found`);
        skipped++;
        continue;
    }

    // Check if GDAT already exists
    const gdatPath = path.join(OUTPUT_DIR, `${modelName}_bng2.gdat`);
    if (fs.existsSync(gdatPath)) {
        console.log(`[EXISTS] ${modelName}: GDAT already exists`);

        // Still add to config if not there
        const gdatContent = fs.readFileSync(gdatPath, 'utf-8');
        const lines = gdatContent.trim().split('\n');
        if (lines.length > 0) {
            const headers = lines[0].trim().replace(/^#\s*/, '').split(/\s+/);
            newConfigs.push({
                modelName,
                bng2GdatPath: gdatPath,
                bng2Headers: headers,
                bng2DataPoints: lines.length - 1,
                status: 'ready_for_comparison'
            });
        }
        skipped++;
        continue;
    }

    console.log(`[GENERATE] ${modelName}: Running BNG2.pl...`);

    try {
        // Create temp directory for BNG2 output
        const tempDir = path.join(OUTPUT_DIR, 'temp_' + modelName);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Read original BNGL to check for simulate block (exclude commented out lines)
        const originalBngl = fs.readFileSync(bnglPath, 'utf-8');
        // Remove comment lines before checking for simulate
        const uncommentedBngl = originalBngl.split('\n').filter(line => !line.trim().startsWith('#')).join('\n');
        const hasSimulate = /simulate\s*\(/.test(uncommentedBngl);

        let bnglToRun = bnglPath;

        // If no simulate block, create wrapper with default ODE simulate
        if (!hasSimulate) {
            console.log(`  -> No simulate block, adding default ODE simulate`);
            // Create wrapper BNGL that includes original and adds simulate
            const wrapperPath = path.join(tempDir, modelName + '_wrapper.bngl');
            const wrapperContent = `# Auto-generated wrapper with default simulate
${originalBngl}

# Default ODE simulation for parity testing
generate_network({overwrite=>1})
simulate({method=>"ode",t_end=>100,n_steps=>100})
`;
            fs.writeFileSync(wrapperPath, wrapperContent);
            bnglToRun = wrapperPath;
        } else {
            // Copy original to temp dir
            const tempBnglPath = path.join(tempDir, modelName + '.bngl');
            fs.copyFileSync(bnglPath, tempBnglPath);
            bnglToRun = tempBnglPath;
        }

        // Run BNG2.pl
        execSync(`perl "${BNG2_PATH}" "${path.basename(bnglToRun)}"`, {
            cwd: tempDir,
            timeout: 120000, // 2 min timeout
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Find generated GDAT file
        const tempFiles = fs.readdirSync(tempDir);
        console.log(`  -> Temp files: ${tempFiles.join(', ')}`);
        const gdatFile = tempFiles.find(f => f.endsWith('.gdat'));

        if (gdatFile) {
            const srcPath = path.join(tempDir, gdatFile);
            fs.copyFileSync(srcPath, gdatPath);
            console.log(`  -> Generated: ${path.basename(gdatPath)}`);

            // Parse headers
            const gdatContent = fs.readFileSync(gdatPath, 'utf-8');
            const lines = gdatContent.trim().split('\n');
            if (lines.length > 0) {
                const headers = lines[0].trim().replace(/^#\s*/, '').split(/\s+/);
                newConfigs.push({
                    modelName,
                    bng2GdatPath: gdatPath,
                    bng2Headers: headers,
                    bng2DataPoints: lines.length - 1,
                    status: 'ready_for_comparison'
                });
            }
            generated++;
        } else {
            console.log(`  -> No GDAT generated (no simulate block?)`);
            skipped++;
        }

        // Clean up temp dir
        fs.rmSync(tempDir, { recursive: true, force: true });

    } catch (error: any) {
        console.log(`  -> ERROR: ${error.message?.slice(0, 100) || 'Unknown error'}`);
        errors++;
        // Clean up temp dir on error
        const tempDir = path.join(OUTPUT_DIR, 'temp_' + modelName);
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }
}

// Update gdat_models.json with new configs
const existingConfigs: GdatConfig[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'gdat_models.json'), 'utf-8'));
const existingNames = new Set(existingConfigs.map(c => c.modelName));

let added = 0;
for (const config of newConfigs) {
    if (!existingNames.has(config.modelName)) {
        existingConfigs.push(config);
        added++;
    }
}

fs.writeFileSync(
    path.join(__dirname, 'gdat_models.json'),
    JSON.stringify(existingConfigs, null, 2)
);

console.log(`\n=== Summary ===`);
console.log(`Generated: ${generated}`);
console.log(`Skipped/Existing: ${skipped}`);
console.log(`Errors: ${errors}`);
console.log(`Added to gdat_models.json: ${added}`);
console.log(`Total configs: ${existingConfigs.length}`);
