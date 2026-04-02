
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const RULEHUB_ROOT = process.env.RULEHUB_ROOT
    ? path.resolve(process.env.RULEHUB_ROOT)
    : path.resolve(PROJECT_ROOT, '..', 'RuleHub');
const MODELS_DIR = path.join(RULEHUB_ROOT, 'Published');
const EXAMPLES_DIR = path.join(RULEHUB_ROOT, 'Contributed', 'BNGPlayground_Examples');
const GDAT_DIR = path.join(PROJECT_ROOT, 'gdat_comparison_output');
const REPORT_FILE = path.join(PROJECT_ROOT, 'bng2_reference_report.json');

function getSafeModelName(modelName) {
    return modelName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
}

function findAllModels() {
    const models = [];

    function scanDir(dir) {
        if (!fs.existsSync(dir)) return;
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
            const fullPath = path.join(dir, item.name);
            if (item.isDirectory()) {
                scanDir(fullPath);
            } else if (item.name.endsWith('.bngl')) {
                models.push({
                    originalName: path.basename(item.name, '.bngl'),
                    path: fullPath
                });
            }
        }
    }

    scanDir(MODELS_DIR);
    scanDir(EXAMPLES_DIR);
    return models;
}

function main() {
    console.log('Reconstructing bng2_reference_report.json...');

    // 1. Map SafeName -> OriginalName
    const modelMap = new Map();
    const allModels = findAllModels();

    for (const m of allModels) {
        const safeName = getSafeModelName(m.originalName);
        modelMap.set(safeName, m);
    }

    console.log(`Found ${allModels.length} source models.`);

    // 2. Scan GDAT output
    if (!fs.existsSync(GDAT_DIR)) {
        console.error('GDAT directory not found!');
        process.exit(1);
    }

    const gdatFiles = fs.readdirSync(GDAT_DIR).filter(f => f.endsWith('_bng2.gdat'));
    console.log(`Found ${gdatFiles.length} reference GDAT files.`);

    const passedModels = [];

    for (const file of gdatFiles) {
        // filename is SafeName_bng2.gdat
        const safeName = file.replace(/_bng2\.gdat$/, '');

        // Look up original model
        const original = modelMap.get(safeName);

        if (original) {
            // Read headers for "observables" field if possible (optional but helpful)
            const content = fs.readFileSync(path.join(GDAT_DIR, file), 'utf-8');
            const headers = content.split('\n')[0].replace(/^#\s*/, '').trim().split(/\s+/).filter(h => h !== 'time');

            passedModels.push({
                model: original.originalName,
                status: 'bng2_ok',
                hasGdat: true,
                gdatFile: path.join(GDAT_DIR, file),
                observables: headers,
                path: original.path
            });
        } else {
            if (passedModels.length < 10 && file.includes('akt')) {
                console.log(`Debug mismatch: GDAT=${file}, Safe=${safeName}`);
                console.log(`Map has 'akt-signaling'? ${modelMap.has('akt-signaling')}`);
                // Dump some keys
                console.log('Sample map keys:', Array.from(modelMap.keys()).slice(0, 5));
            }
            console.warn(`Warning: No source model found for GDAT file: ${file} (SafeName: ${safeName})`);
            // We can still add it using safeName if we want, but test might fail to find BNGL.
            // Let's rely on map.
        }
    }

    // 3. Write report
    const report = { passed: passedModels };
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`Report written to ${REPORT_FILE} with ${passedModels.length} models.`);
}

main();
