/**
 * Debug and regenerate CSVs for the 9 failed example models
 * Run Playwright to generate CSVs for only the failed models with verbose logging
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');

// The 9 models that failed to generate CSVs
const FAILED_MODELS = [
    'beta-adrenergic-response',
    'bmp-signaling',
    'circadian-oscillator',
    'clock-bmal1-gene-circuit',
    'hematopoietic-growth-factor',
    'interferon-signaling',
    'lac-operon-regulation',
    'mapk-signaling-cascade',
    'mtorc2-signaling'
];

console.log('='.repeat(80));
console.log('Regenerating CSVs for Failed Example Models');
console.log('='.repeat(80));
console.log(`\nAttempting to generate CSVs for ${FAILED_MODELS.length} models`);
console.log('Models:', FAILED_MODELS.join(', '));
console.log('');

// Run generate:web-output with these specific models
const modelList = FAILED_MODELS.join(',');
const isWin = process.platform === 'win32';

const generateCmd = isWin
    ? spawn('cmd.exe', ['/d', '/s', '/c', 'npm run generate:web-output'], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        env: { 
            ...process.env, 
            WEB_OUTPUT_MODELS: modelList,
            WEB_OUTPUT_HEADED: '0'  // Keep headless for efficiency
        }
    })
    : spawn('npm', ['run', 'generate:web-output'], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        env: { 
            ...process.env, 
            WEB_OUTPUT_MODELS: modelList,
            WEB_OUTPUT_HEADED: '0'
        }
    });

generateCmd.on('close', (code) => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Generation completed with exit code: ${code}`);
    console.log('='.repeat(80));
    
    // Check which ones succeeded
    console.log('\nVerifying results:');
    const webOutputDir = path.join(PROJECT_ROOT, 'web_output');
    
    for (const model of FAILED_MODELS) {
        const csvName = `results_${model.replace(/-/g, '_')}.csv`;
        const csvPath = path.join(webOutputDir, csvName);
        
        if (fs.existsSync(csvPath)) {
            console.log(`  ✅ ${model} -> ${csvName}`);
        } else {
            console.log(`  ❌ ${model} -> STILL MISSING`);
        }
    }
    
    process.exit(code);
});

generateCmd.on('error', (err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
