import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const PROJECT_ROOT = process.cwd();
const WEB_OUTPUT_DIR = path.join(PROJECT_ROOT, 'web_output');

// Get full analysis
const analysisJson = execSync('node scripts/analyze_models.mjs').toString();
const analysis = JSON.parse(analysisJson);

// Collect all target models (passed + untestedOde)
const allCandidates = [
    ...analysis.passed,
    ...analysis.untestedOde
];

// Check existing CSVs
const existingFiles = fs.existsSync(WEB_OUTPUT_DIR) ? fs.readdirSync(WEB_OUTPUT_DIR) : [];
const existingModels = new Set(
    existingFiles
        .filter(f => f.startsWith('results_') && f.endsWith('.csv'))
        .map(f => f.replace(/^results_/, '').replace(/\.csv$/, '').toLowerCase())
);

const missing = [];
for (const model of allCandidates) {
    // Determine expected CSV name (lowercase)
    const normalizedName = model.name.toLowerCase();

    // Check if it exists
    // Note: CSV filenames are robustly slugified in batchRunner, usually just lowercase name.
    // Check strict match or fuzzy match? The batch runner uses `sanitizeFilename(model.name)`.
    // Usually it's just name.toLowerCase().

    if (!existingModels.has(normalizedName)) {
        missing.push(model.name);
    }
}

console.log(missing.join(','));
