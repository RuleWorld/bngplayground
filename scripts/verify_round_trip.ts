import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { Atomizer } from '../src/lib/atomizer/index.ts';

// libsbmljs uses 'self', which is not defined in Node.js
if (typeof self === 'undefined') {
    (global as any).self = global;
}

// Configuration
const BNG2_PATH = path.resolve('bionetgen_python/bng-win/BNG2.pl');
const OUTPUT_BASE = path.resolve('tests/parity_check');
const TOLERANCE = 1e-3;

// Normalize path to use forward slashes (prevents quote escaping issues on Windows)
function normalizePath(p: string): string {
    return p.replace(/\\/g, '/');
}

// Result storage
interface ModelResult {
    model: string;
    status: 'PASS' | 'FAIL' | 'ERROR';
    mae: number;
    error?: string;
    sharedHeaders: string[];
    refHeaders: string[];
    testHeaders: string[];
    rowCount: number;
}

const allResults: ModelResult[] = [];

// Ensure output directories exist
function ensureDirs() {
    ['sbml', 'atomized', 'reference_sim', 'atomized_sim'].forEach(dir => {
        const p = path.join(OUTPUT_BASE, dir);
        if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    });
}

// Helper to run BNG2.pl
function runBNG2(args: string[]) {
    const cmd = `perl "${normalizePath(BNG2_PATH)}" ${args.map(arg => {
        // If an argument is a path that's already quoted, normalize the path inside the quotes
        if (arg.startsWith('"') && arg.endsWith('"')) {
            return `"${normalizePath(arg.slice(1, -1))}"`;
        }
        return arg;
    }).join(' ')}`;
    try {
        execSync(cmd, { stdio: 'pipe' });
    } catch (e: any) {
        throw new Error(`BNG2 Failure: ${e.stderr?.toString() || e.message}`);
    }
}

// Helper to parse GDAT
function parseGDAT(filePath: string): { headers: string[], data: number[][] } {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split(/\r?\n/);
    const headerLine = lines.find(l => l.startsWith('#'));
    if (!headerLine) throw new Error(`Invalid GDAT (no header): ${filePath}`);

    const headers = headerLine.substring(1).trim().split(/\s+/);
    const data: number[][] = [];
    for (const line of lines) {
        if (line.startsWith('#')) continue;
        const vals = line.trim().split(/\s+/).map(Number);
        if (vals.length === headers.length) data.push(vals);
    }
    return { headers, data };
}

// Compare two GDAT files
function compareGDAT(refPath: string, testPath: string): { passed: boolean, mae: number, error?: string, sharedHeaders: string[], refHeaders: string[], testHeaders: string[], rowCount: number } {
    const ref = parseGDAT(refPath);
    const test = parseGDAT(testPath);

    const commonHeaders = ref.headers.filter(h => test.headers.includes(h));

    if (commonHeaders.length <= 1) { // Only 'time' or nothing
        return {
            passed: false, mae: -1,
            error: `Poor header overlap: [${commonHeaders.join(',')}]`,
            sharedHeaders: commonHeaders, refHeaders: ref.headers, testHeaders: test.headers, rowCount: ref.data.length
        };
    }

    if (ref.data.length !== test.data.length) {
        return {
            passed: false, mae: -1,
            error: `Row count mismatch: ${ref.data.length} vs ${test.data.length}`,
            sharedHeaders: commonHeaders, refHeaders: ref.headers, testHeaders: test.headers, rowCount: ref.data.length
        };
    }

    let maxError = 0;
    for (let i = 0; i < ref.data.length; i++) {
        for (const header of commonHeaders) {
            const refIdx = ref.headers.indexOf(header);
            const testIdx = test.headers.indexOf(header);
            const diff = Math.abs(ref.data[i][refIdx] - test.data[i][testIdx]);
            if (!Number.isNaN(diff) && diff > maxError) maxError = diff;
        }
    }

    return {
        passed: maxError < TOLERANCE,
        mae: maxError,
        sharedHeaders: commonHeaders,
        refHeaders: ref.headers,
        testHeaders: test.headers,
        rowCount: ref.data.length
    };
}

// Verify a single model
async function verifyModel(modelPath: string) {
    const modelName = path.basename(modelPath, '.bngl');
    console.log(`\n> Verifying ${modelName}...`);

    try {
        const originalContent = fs.readFileSync(modelPath, 'utf-8');
        const actionsMatch = originalContent.match(/begin actions([\s\S]*?)end actions/i);
        let originalActions = actionsMatch ? actionsMatch[0] : '';

        if (!originalActions) {
            // Try to find loose simulate/saveState commands at the end
            const looseActions = originalContent.match(/(generate_network|simulate|saveState|setParameter|readFile|quit|writeSBML)\s*\(\{[\s\S]*?\}\)/g);
            if (looseActions) {
                originalActions = 'begin actions\n    ' + looseActions.join('\n    ') + '\nend actions';
            }
        }

        const sbmlOutDir = path.join(OUTPUT_BASE, 'sbml', modelName);
        if (!fs.existsSync(sbmlOutDir)) fs.mkdirSync(sbmlOutDir, { recursive: true });

        const tempBnglPath = path.join(sbmlOutDir, 'model.bngl');
        // Strip both begin/end blocks and loose commands
        let strippedContent = originalContent.replace(/begin actions[\s\S]*?end actions/gi, '');
        // Match commands like simulate({}), simulate(), writeSBML(), etc.
        const cmdPattern = /(generate_network|simulate|saveState|setParameter|readFile|quit|writeSBML)\s*\([\s\S]*?\)/g;
        strippedContent = strippedContent.replace(cmdPattern, '');
        
        // Wrap in begin model/end model if missing
        if (!strippedContent.includes('begin model')) {
            strippedContent = 'begin model\n' + strippedContent + '\nend model\n';
        }

        const modifiedContent = strippedContent + '\nbegin actions\ngenerate_network({overwrite=>1})\nwriteSBML({})\nend actions\n';
        fs.writeFileSync(tempBnglPath, modifiedContent);

        runBNG2(['--outdir', `"${sbmlOutDir}"`, `"${tempBnglPath}"`]);

        let sbmlFile = path.join(sbmlOutDir, 'model_sbml.xml');
        if (!fs.existsSync(sbmlFile)) throw new Error(`SBML generation failed: ${sbmlFile} missing`);

        const atomizer = new Atomizer({ atomize: false, quietMode: true, useId: true, actions: originalActions });
        await atomizer.initialize();
        const result = await atomizer.atomize(fs.readFileSync(sbmlFile, 'utf-8'));
        if (!result.success) throw new Error(`Atomization failed: ${result.error}`);

        const atomizedBnglPath = path.join(OUTPUT_BASE, 'atomized', `${modelName}.bngl`);
        fs.writeFileSync(atomizedBnglPath, result.bngl);

        const refSimDir = path.join(OUTPUT_BASE, 'reference_sim', modelName);
        if (!fs.existsSync(refSimDir)) fs.mkdirSync(refSimDir, { recursive: true });
        runBNG2(['--outdir', `"${refSimDir}"`, `"${modelPath}"`]);

        const atomSimDir = path.join(OUTPUT_BASE, 'atomized_sim', modelName);
        if (!fs.existsSync(atomSimDir)) fs.mkdirSync(atomSimDir, { recursive: true });
        runBNG2(['--outdir', `"${atomSimDir}"`, `"${atomizedBnglPath}"`]);

        const findsGdat = (dir: string, prefix: string) => {
            const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.gdat'));
            return files.length > 0 ? path.join(dir, files[0]) : null;
        };

        const refGdat = findsGdat(refSimDir, modelName);
        const atomGdat = findsGdat(atomSimDir, modelName);

        if (!refGdat || !atomGdat) throw new Error(`Missing GDAT output`);

        const comp = compareGDAT(refGdat, atomGdat);
        const modelResult: ModelResult = {
            model: modelName,
            status: comp.passed ? 'PASS' : 'FAIL',
            mae: comp.mae,
            error: comp.error,
            sharedHeaders: comp.sharedHeaders,
            refHeaders: comp.refHeaders,
            testHeaders: comp.testHeaders,
            rowCount: comp.rowCount
        };
        allResults.push(modelResult);
        console.log(`[${modelResult.status}] MAE: ${comp.mae.toExponential(2)} (Shared: ${comp.sharedHeaders.length})`);

    } catch (e: any) {
        console.error(`[ERROR] ${modelName}: ${e.message}`);
        allResults.push({ model: modelName, status: 'ERROR', mae: -1, error: e.message, sharedHeaders: [], refHeaders: [], testHeaders: [], rowCount: 0 });
    }
}

async function main() {
    ensureDirs();
    const tutorialsDir = path.resolve('example-models');
    const allFiles = fs.readdirSync(tutorialsDir).filter(f => f.endsWith('.bngl'));
    const modelsToRun = process.env.MODELS ? process.env.MODELS.split(',') : null;
    const files = modelsToRun ? allFiles.filter(f => modelsToRun.some(m => f.includes(m))) : allFiles;

    console.log(`Verifying ${files.length} models...`);
    for (const file of files) {
        await verifyModel(path.join(tutorialsDir, file));
    }

    fs.writeFileSync('validation_report.json', JSON.stringify(allResults, null, 2));
    console.log(`\nFinal report saved to validation_report.json`);
}

main().catch(e => console.error(e));
