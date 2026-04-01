
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { resolveBNG2Paths } from '../../tools/bng2-paths';
import { findRuleHubModelPath } from '../../tools/rulehubLocal';

const BNG2_PATH = process.env.BNG2_PATH || resolveBNG2Paths().bng2pl;
const MODELS_LIST = 'published_models_list.txt';
const OUTPUT_DIR = 'bng_test_output';

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const models = fs.readFileSync(MODELS_LIST, 'utf-8').split(',').map(m => m.trim()).filter(m => m);
console.log(`Starting reference generation for ${models.length} published models...`);

let successCount = 0;
let failCount = 0;

for (const model of models) {
    const bnglPath = findRuleHubModelPath(process.cwd(), model);
    if (!bnglPath || !fs.existsSync(bnglPath)) {
        console.warn(`[WARN] Model file not found: ${bnglPath}`);
        continue;
    }

    console.log(`[${successCount + failCount + 1}/${models.length}] Processing: ${model}`);
    
    try {
        // Run BNG2.pl
        // We use --outdir to specify where output goes
        const cmd = `perl "${BNG2_PATH}" --outdir "${OUTPUT_DIR}" "${bnglPath}"`;
        execSync(cmd, { stdio: 'pipe', timeout: 900000 }); // 15 minute timeout per model
        
        // BNG2.pl generates .net, .cdat, .gdat in the output dir
        // We'll leave them there for the parity comparison script to find
        successCount++;
        console.log(`  ✅ Success: ${model}`);
    } catch (error) {
        failCount++;
        console.error(`  ❌ Failed: ${model}`);
        console.error(`     Error: ${error.message.split('\n')[0]}`);
    }
}

console.log('--- COMPLETED ---');
console.log(`Total: ${models.length}`);
console.log(`Success: ${successCount}`);
console.log(`Failed: ${failCount}`);
