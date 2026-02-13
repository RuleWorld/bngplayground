/**
 * Validate all example models against BNG2.pl and apply automated syntax fixes
 * 
 * This script:
 * 1. Tests parsing of all BNGL files in example-models/ using BNG2.pl
 * 2. Attempts automated fixes referencing bionetgen_repo/ for canonical patterns
 * 3. Generates detailed reports for failures
 * 4. Cleans up generated .net/.cdat/.gdat files
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const EXAMPLE_MODELS_DIR = path.join(PROJECT_ROOT, 'example-models');
const BNG_TEST_OUTPUT_DIR = path.join(PROJECT_ROOT, 'bng_test_output');
const BNG2_PATH = 'C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl';
const REPORT_FILE = path.join(PROJECT_ROOT, 'example_models_validation_report.json');

if (!fs.existsSync(BNG_TEST_OUTPUT_DIR)) {
    fs.mkdirSync(BNG_TEST_OUTPUT_DIR, { recursive: true });
}

// Common BNG2.pl syntax error patterns and their fixes
const SYNTAX_FIX_PATTERNS = [
    {
        name: 'missing_end_model',
        pattern: /end\s+parameters/gi,
        check: (content) => !/end\s+model/gi.test(content) && /end\s+parameters/gi.test(content),
        fix: (content) => {
            if (!/end\s+model/gi.test(content)) {
                return content.trim() + '\n\nend model\n';
            }
            return content;
        },
        description: 'Add missing "end model" statement'
    },
    {
        name: 'missing_begin_model',
        pattern: /begin\s+parameters/gi,
        check: (content) => !/begin\s+model/gi.test(content) && /begin\s+parameters/gi.test(content),
        fix: (content) => {
            if (!/begin\s+model/gi.test(content)) {
                return 'begin model\n\n' + content;
            }
            return content;
        },
        description: 'Add missing "begin model" statement'
    },
    {
        name: 'double_quote_strings',
        pattern: /'\s*([^']+)'\s*/g,
        check: (content) => {
            // Check if single quotes are used in parameter values or species names
            const lines = content.split('\n');
            return lines.some(line => {
                const trimmed = line.trim();
                return !trimmed.startsWith('#') && /'[^']*'/.test(trimmed);
            });
        },
        fix: (content) => {
            // Replace single quotes with double quotes, but not in comments
            return content.split('\n').map(line => {
                if (line.trim().startsWith('#')) return line;
                return line.replace(/'([^']*)'/g, '"$1"');
            }).join('\n');
        },
        description: 'Replace single quotes with double quotes'
    }
];

/**
 * @typedef {Object} ValidationResult
 * @property {string} model
 * @property {'pass'|'fail'|'fixed'} status
 * @property {string[]} [fixesApplied]
 * @property {string} [error]
 * @property {string} [stderr]
 */

async function runBNG2(bnglPath) {
    return new Promise((resolve, reject) => {
        const args = [BNG2_PATH, bnglPath];

        const proc = spawn('perl', args, {
            cwd: path.dirname(bnglPath),
            timeout: 120000 // 120 second timeout
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            resolve({ code, stdout, stderr });
        });

        proc.on('error', (err) => {
            reject(err);
        });
    });
}

function cleanupGeneratedFiles(modelDir, modelName) {
    const extensions = ['.net', '.cdat', '.gdat', '.xml'];

    for (const ext of extensions) {
        const filePath = path.join(modelDir, modelName + ext);
        if (fs.existsSync(filePath)) {
            // Copy to test output dir before deleting
            const destPath = path.join(BNG_TEST_OUTPUT_DIR, modelName + ext);
            fs.copyFileSync(filePath, destPath);
            fs.rmSync(filePath);
            console.log(`  Saved reference: ${modelName}${ext}`);
        }
    }

    // Also check for suffixed versions (e.g., model_ode.gdat, model_1.net)
    const files = fs.readdirSync(modelDir);
    for (const file of files) {
        const base = path.basename(file, path.extname(file));
        if (base.startsWith(modelName + '_')) {
            const ext = path.extname(file);
            if (extensions.includes(ext)) {
                const fullPath = path.join(modelDir, file);
                const destPath = path.join(BNG_TEST_OUTPUT_DIR, file);
                fs.copyFileSync(fullPath, destPath);
                fs.rmSync(fullPath);
                console.log(`  Saved reference: ${file}`);
            }
        }
    }
}

async function validateModel(modelPath) {
    const modelName = path.basename(modelPath, '.bngl');
    const modelDir = path.dirname(modelPath);
    const result = {
        model: modelName,
        status: 'fail'
    };

    console.log(`\nValidating: ${modelName}`);

    try {
        // First attempt: parse as-is
        const firstAttempt = await runBNG2(modelPath);

        if (firstAttempt.code === 0) {
            console.log(`  ✓ PASS (no fixes needed)`);
            result.status = 'pass';
            cleanupGeneratedFiles(modelDir, modelName);
            return result;
        }

        console.log(`  Initial parse failed (exit code ${firstAttempt.code})`);
        console.log(`  Attempting automated fixes...`);

        // Read model content
        let content = fs.readFileSync(modelPath, 'utf-8');
        const originalContent = content;
        const fixesApplied = [];

        // Try each fix pattern
        for (const pattern of SYNTAX_FIX_PATTERNS) {
            if (pattern.check(content)) {
                console.log(`  Applying fix: ${pattern.description}`);
                content = pattern.fix(content);
                fixesApplied.push(pattern.name);
            }
        }

        if (fixesApplied.length === 0) {
            console.log(`  ✗ FAIL (no applicable fixes found)`);
            result.status = 'fail';
            result.error = `Parse failed, exit code ${firstAttempt.code}`;
            result.stderr = firstAttempt.stderr.slice(0, 500);
            cleanupGeneratedFiles(modelDir, modelName);
            return result;
        }

        // Write fixed content to temporary file
        const tempPath = modelPath + '.fixed';
        fs.writeFileSync(tempPath, content, 'utf-8');

        // Test the fixed version
        const secondAttempt = await runBNG2(tempPath);

        if (secondAttempt.code === 0) {
            console.log(`  ✓ FIXED (${fixesApplied.length} fix(es) applied)`);
            // Backup original and replace with fixed version
            fs.writeFileSync(modelPath + '.bak', originalContent, 'utf-8');
            fs.writeFileSync(modelPath, content, 'utf-8');
            fs.rmSync(tempPath);

            result.status = 'fixed';
            result.fixesApplied = fixesApplied;
            cleanupGeneratedFiles(modelDir, modelName);
            return result;
        } else {
            console.log(`  ✗ FAIL (fixes did not resolve issue)`);
            fs.rmSync(tempPath);
            result.status = 'fail';
            result.error = `Parse failed after fixes, exit code ${secondAttempt.code}`;
            result.stderr = secondAttempt.stderr.slice(0, 500);
            result.fixesApplied = fixesApplied;
            cleanupGeneratedFiles(modelDir, modelName);
            return result;
        }

    } catch (err) {
        console.log(`  ✗ ERROR: ${err.message}`);
        result.status = 'fail';
        result.error = err.message;
        cleanupGeneratedFiles(modelDir, modelName);
        return result;
    }
}

async function main() {
    console.log('='.repeat(80));
    console.log('Example Models BNG2.pl Validation');
    console.log('='.repeat(80));
    console.log(`BNG2 Path: ${BNG2_PATH}`);
    console.log(`Models Directory: ${EXAMPLE_MODELS_DIR}`);
    console.log('');

    if (!fs.existsSync(BNG2_PATH)) {
        console.error(`ERROR: BNG2.pl not found at ${BNG2_PATH}`);
        process.exit(1);
    }

    if (!fs.existsSync(EXAMPLE_MODELS_DIR)) {
        console.error(`ERROR: Example models directory not found at ${EXAMPLE_MODELS_DIR}`);
        process.exit(1);
    }

    const bnglFiles = fs.readdirSync(EXAMPLE_MODELS_DIR)
        .filter(f => f.endsWith('.bngl'))
        .map(f => path.join(EXAMPLE_MODELS_DIR, f))
        .sort();

    console.log(`Found ${bnglFiles.length} BNGL files\n`);

    /** @type {ValidationResult[]} */
    const results = [];

    // Load previous report if available
    let previousResults = {};
    if (fs.existsSync(REPORT_FILE)) {
        try {
            const raw = fs.readFileSync(REPORT_FILE, 'utf-8');
            const parsed = JSON.parse(raw);
            parsed.forEach(r => {
                previousResults[r.model] = r;
            });
            console.log(`Loaded ${parsed.length} entries from previous report.`);
        } catch (e) {
            console.warn('Could not read/parse previous report, starting fresh.');
        }
    }

    const FORCE_RERUN = process.env.FORCE_RERUN === 'true';

    for (const modelPath of bnglFiles) {
        const modelName = path.basename(modelPath, '.bngl');

        // Skip if previously passed
        if (!FORCE_RERUN && previousResults[modelName] && (previousResults[modelName].status === 'pass' || previousResults[modelName].status === 'fixed')) {
            console.log(`Skipping ${modelName} (previously passed)`);
            results.push(previousResults[modelName]);
            continue;
        }

        const result = await validateModel(modelPath);
        results.push(result);
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('Validation Summary');
    console.log('='.repeat(80));

    const passed = results.filter(r => r.status === 'pass');
    const fixed = results.filter(r => r.status === 'fixed');
    const failed = results.filter(r => r.status === 'fail');

    console.log(`Total Models: ${results.length}`);
    console.log(`  ✓ Passed (no fixes): ${passed.length}`);
    console.log(`  ✓ Fixed: ${fixed.length}`);
    console.log(`  ✗ Failed: ${failed.length}`);
    console.log('');

    if (fixed.length > 0) {
        console.log(`Fixed Models (${fixed.length}):`);
        for (const r of fixed) {
            console.log(`  - ${r.model}: ${r.fixesApplied?.join(', ')}`);
        }
        console.log('');
    }

    if (failed.length > 0) {
        console.log(`Failed Models (${failed.length}):`);
        for (const r of failed) {
            console.log(`  - ${r.model}: ${r.error}`);
            if (r.stderr) {
                console.log(`    stderr: ${r.stderr.split('\n')[0]}`);
            }
        }
        console.log('');
    }

    // Write detailed report
    fs.writeFileSync(REPORT_FILE, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`Detailed report written to: ${REPORT_FILE}`);

    const successRate = ((passed.length + fixed.length) / results.length * 100).toFixed(1);
    console.log(`\nSuccess Rate: ${successRate}%`);

    process.exit(failed.length > 0 ? 1 : 0);
}

main();
