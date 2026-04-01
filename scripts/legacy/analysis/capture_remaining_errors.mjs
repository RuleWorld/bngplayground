/**
 * Capture detailed runtime errors for the 7 remaining failed models
 * Run each model individually via Playwright and log all errors
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');

const REMAINING_FAILED = [
    'beta-adrenergic-response',
    'bmp-signaling',
    'clock-bmal1-gene-circuit',
    'hematopoietic-growth-factor',
    'interferon-signaling',
    'lac-operon-regulation',
    'mapk-signaling-cascade'
];

console.log('='.repeat(80));
console.log('Detailed Error Capture for 7 Remaining Failed Models');
console.log('='.repeat(80));

// Run web output generation with verbose logging for these specific models
const modelList = REMAINING_FAILED.join(',');
const isWin = process.platform === 'win32';

console.log(`\nRunning: ${REMAINING_FAILED.length} models`);
console.log('Models:', modelList);
console.log('');

const generateCmd = isWin
    ? spawn('cmd.exe', ['/d', '/s', '/c', 'npm run generate:web-output'], {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        env: { 
            ...process.env, 
            WEB_OUTPUT_MODELS: modelList,
            WEB_OUTPUT_HEADED: '0',
            NODE_ENV: 'development'
        }
    })
    : spawn('npm', ['run', 'generate:web-output'], {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        env: { 
            ...process.env, 
            WEB_OUTPUT_MODELS: modelList,
            WEB_OUTPUT_HEADED: '0',
            NODE_ENV: 'development'
        }
    });

const errors = [];
let currentModel = null;
const modelErrors = {};

generateCmd.stdout.on('data', (data) => {
    const text = data.toString();
    process.stdout.write(text);
    
    // Track which model is being processed
    const processingMatch = text.match(/Processing: ([a-z-]+)/);
    if (processingMatch) {
        currentModel = processingMatch[1];
        if (!modelErrors[currentModel]) {
            modelErrors[currentModel] = [];
        }
    }
    
    // Capture errors
    if (text.includes('Error') || text.includes('FAIL') || text.includes('parse error')) {
        if (currentModel) {
            modelErrors[currentModel].push(text.trim());
        }
        errors.push({ model: currentModel, error: text.trim() });
    }
});

generateCmd.stderr.on('data', (data) => {
    const text = data.toString();
    process.stderr.write(text);
    
    if (currentModel) {
        modelErrors[currentModel].push(`STDERR: ${text.trim()}`);
    }
});

generateCmd.on('close', (code) => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Generation completed with exit code: ${code}`);
    console.log('='.repeat(80));
    
    // Save detailed error report
    const reportPath = path.join(PROJECT_ROOT, 'remaining_7_errors.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        models: REMAINING_FAILED,
        modelErrors,
        allErrors: errors
    }, null, 2), 'utf-8');
    
    console.log(`\nDetailed error report saved to: ${reportPath}`);
    
    // Print summary
    console.log('\nError Summary:');
    for (const model of REMAINING_FAILED) {
        const errCount = (modelErrors[model] || []).length;
        console.log(`  ${model}: ${errCount} errors`);
    }
});
