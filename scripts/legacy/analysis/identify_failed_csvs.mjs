/**
 * Identify which example models failed to generate CSV outputs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function resolveRuleHubRoot(projectRoot) {
    const fromEnv = process.env.RULEHUB_ROOT?.trim();
    if (fromEnv) {
        const resolved = path.resolve(fromEnv);
        if (fs.existsSync(resolved)) return resolved;
    }

    const sibling = path.resolve(projectRoot, '..', 'RuleHub');
    return fs.existsSync(sibling) ? sibling : null;
}

const RULEHUB_ROOT = resolveRuleHubRoot(PROJECT_ROOT);
const EXAMPLE_MODELS_DIR = RULEHUB_ROOT
    ? path.join(RULEHUB_ROOT, 'Contributed', 'BNGPlayground_Examples')
    : null;
const WEB_OUTPUT_DIR = path.join(PROJECT_ROOT, 'web_output');

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

if (!EXAMPLE_MODELS_DIR) {
    throw new Error('RuleHub checkout not found. Set RULEHUB_ROOT or place RuleHub beside this repo.');
}

// Get all example model names
const allModels = collectBnglFilesRecursive(EXAMPLE_MODELS_DIR)
    .map(f => path.basename(f, '.bngl'))
    .sort();

// Get models that generated CSVs
const generatedModels = fs.readdirSync(WEB_OUTPUT_DIR)
    .filter(f => f.startsWith('results_') && f.endsWith('.csv'))
    .map(f => f.replace(/^results_/, '').replace(/\.csv$/, ''))
    .map(name => {
        // Normalize model names (handle hyphens vs underscores)
        return name.replace(/_/g, '-');
    })
    .sort();

// Find models that didn't generate CSVs
const failedModels = allModels.filter(model => {
    const normalized = model.replace(/_/g, '-');
    return !generatedModels.includes(normalized);
});

console.log('='.repeat(80));
console.log('Failed CSV Generation Analysis');
console.log('='.repeat(80));
console.log(`Total Example Models: ${allModels.length}`);
console.log(`Generated CSVs: ${generatedModels.length}`);
console.log(`Failed: ${failedModels.length}`);
console.log('');

if (failedModels.length > 0) {
    console.log('Models that failed to generate CSVs:');
    failedModels.forEach((model, idx) => {
        console.log(`  ${idx + 1}. ${model}`);
    });
} else {
    console.log('✅ All models successfully generated CSVs!');
}

console.log('');

// Save to file
const reportPath = path.join(PROJECT_ROOT, 'failed_csv_generation.json');
fs.writeFileSync(reportPath, JSON.stringify({
    total: allModels.length,
    generated: generatedModels.length,
    failed: failedModels.length,
    failedModels: failedModels
}, null, 2), 'utf-8');

console.log(`Report saved to: ${reportPath}`);
