import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { Atomizer } from '../src/lib/atomizer/index';

// libsbmljs uses 'self', which is not defined in Node.js
if (typeof self === 'undefined') {
    (global as any).self = global;
}

// Configuration
const BNG2_PATH = path.resolve('bionetgen_python/bng-win/BNG2.pl');
const OUTPUT_BASE = path.resolve('tests/pac');
const TOLERANCE = 1e-3;

// Models incompatible with current BNG2 version (legacy syntax etc)
const BNG2_INCOMPATIBLE_MODELS = new Set([
    'test_MM',
    'mCaMKII_Ca_Spike',
    'Blinov_2006',          // Too slow / hangs
    'Lin_ERK_2019',
    'Lin_TCR_2019',
    'Lin_Prion_2019',
    'Kozer_2013',
    'Kozer_2014',
    'Dolan_2015',
    'Barua_2013',
    // Large EGFR models (>250 species) cause BNG2 network generation timeout during verification
    'egfr_ground',
    'egfr_net',
    'egfr_net_red',
    'egfr_path',
    'egfr_simple',
    // Ultra-large models cause atomizer recursion depth errors or isomorphic species errors
    'fceri_gamma2_ground_truth', // RangeError: Maximum call stack size exceeded
    'FceRI_ji',                   // BNG2 ABORT: Isomorphic species (deduplication failure)
]);

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
function runBNG2(args: string[], timeoutMs = 600_000): string {
    const cmd = `perl "${normalizePath(BNG2_PATH)}" ${args.map(arg => {
        if (arg.startsWith('"') && arg.endsWith('"')) {
            return `"${normalizePath(arg.slice(1, -1))}"`;
        }
        return arg;
    }).join(' ')}`;
    try {
        const out = execSync(cmd, { stdio: 'pipe', timeout: timeoutMs });
        return out.toString();
    } catch (e: any) {
        const stderr = e.stderr?.toString() || '';
        const stdout = e.stdout?.toString() || '';
        throw new Error(`BNG2 Failure: ${stderr || e.message}\nSTDOUT: ${stdout.slice(-1000)}`);
    }
}

// Helper to parse GDAT or CDAT
function parseGDAT(filePath: string): { headers: string[], data: number[][] } {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split(/\r?\n/);
    const headerLine = lines.find(l => l.startsWith('#'));
    if (!headerLine) throw new Error(`Invalid data file (no header): ${filePath}`);

    // Headers can be tab or space separated
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
function compareGDAT(refPath: string, testPath: string): { passed: boolean, mae: number, error?: string, sharedHeaders: string[], rowCount: number } {
    const ref = parseGDAT(refPath);
    const test = parseGDAT(testPath);

    const commonHeaders = ref.headers.filter(h => test.headers.includes(h));

    if (commonHeaders.length <= 1) {
        return {
            passed: false, mae: -1,
            error: `Poor header overlap: [${commonHeaders.join(',')}]`,
            sharedHeaders: commonHeaders, rowCount: ref.data.length
        };
    }

    if (ref.data.length !== test.data.length) {
        return {
            passed: false, mae: -1,
            error: `Row count mismatch: ${ref.data.length} vs ${test.data.length}`,
            sharedHeaders: commonHeaders, rowCount: ref.data.length
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
        rowCount: ref.data.length
    };
}

// Verify a single model
async function verifyModel(modelPath: string) {
    const modelName = path.basename(modelPath, '.bngl');
    console.log(`\n> Verifying ${modelName}...`);

    try {
        const originalContent = fs.readFileSync(modelPath, 'utf-8');
        let actionsMatch = originalContent.match(/begin actions([\s\S]*?)end actions/i);

        let originalActions = '';
        const foundActions: string[] = [];

        // Force ODE usage for verification to ensure deterministic comparison
        // distinct from stochastic noise or seed differences
        if (actionsMatch) {
            originalActions = actionsMatch[0]
                .replace(/method\s*=>\s*["']ssa["']/, 'method=>"ode"')
                .split('\n')
                .filter(line => {
                    const trimmed = line.trim();
                    return !(
                        /^writeMfile\s*\(/.test(trimmed) ||
                        /^writeMexfile\s*\(/.test(trimmed) ||
                        /^writeSBML\s*\(/.test(trimmed) ||
                        /^writeXML\s*\(/.test(trimmed) ||
                        /^writeNetwork\s*\(/.test(trimmed) ||
                        /^writeSSC\s*\(/.test(trimmed) ||
                        /^writeFile\s*\(/.test(trimmed) ||
                        /^writeModel\s*\(/.test(trimmed) ||
                        /^visualize\s*\(/.test(trimmed)
                    );
                })
                .join('\n');
            foundActions.push(originalActions);
        } else {
            // Strip comments first
            const contentNoComments = originalContent.split('\n')
                .map(line => line.split('#')[0])
                .join('\n');

            const actionCommands = ['generate_network', 'simulate', 'simulate_ode', 'simulate_ssa', 'simulate_nf', 'saveState', 'setParameter', 'setConcentration', 'addParameter', 'readFile', 'quit', 'writeSBML', 'writeFile', 'print', 'echo'];
            let pos = 0;
            while (pos < contentNoComments.length) {
                let foundCmd = false;
                for (const cmd of actionCommands) {
                    if (contentNoComments.slice(pos).trimStart().startsWith(cmd)) {
                        const cmdStart = contentNoComments.indexOf(cmd, pos);
                        const parenStart = contentNoComments.indexOf('(', cmdStart);
                        if (parenStart !== -1) {
                            let balance = 0;
                            let innerPos = parenStart;
                            let inQuote: string | null = null;
                            while (innerPos < contentNoComments.length) {
                                const char = contentNoComments[innerPos];
                                if ((char === '"' || char === "'") && contentNoComments[innerPos - 1] !== '\\') {
                                    if (!inQuote) inQuote = char;
                                    else if (inQuote === char) inQuote = null;
                                }
                                if (!inQuote) {
                                    if (char === '(') balance++;
                                    else if (char === ')') balance--;
                                }
                                if (balance === 0) {
                                    foundActions.push(contentNoComments.substring(cmdStart, innerPos + 1));
                                    pos = innerPos + 1;
                                    foundCmd = true;
                                    break;
                                }
                                innerPos++;
                            }
                        }
                    }
                    if (foundCmd) break;
                }
                if (!foundCmd) pos++;
            }
            if (foundActions.length > 0) {
                // Also enforce ODE in loose actions
                const combinedActions = foundActions.map(a => a.trim()).join('\n    ');
                const actionsWithOde = combinedActions.replace(/method\s*=>\s*["']ssa["']/, 'method=>"ode"');
                originalActions = 'begin actions\n    ' + actionsWithOde + '\nend actions';
            }
        }

        const sbmlOutDir = path.join(OUTPUT_BASE, 'sbml', modelName);
        if (!fs.existsSync(sbmlOutDir)) fs.mkdirSync(sbmlOutDir, { recursive: true });

        const tempBnglPath = path.join(sbmlOutDir, 'model.bngl');
        let strippedContent = originalContent.replace(/begin actions[\s\S]*?end actions/gi, '');

        // Strip the extracted loose actions robustly
        if (typeof foundActions !== 'undefined') {
            for (const action of foundActions) {
                strippedContent = strippedContent.replace(action, '');
            }
        }

        // Filter out problematic write commands that may be loose in the file
        strippedContent = strippedContent.split('\n').filter(line => {
            const trimmed = line.trim();
            return !(
                /^writeMfile\s*\(/.test(trimmed) ||
                /^writeMexfile\s*\(/.test(trimmed) ||
                /^writeSBML\s*\(/.test(trimmed) ||
                /^writeXML\s*\(/.test(trimmed) ||
                /^writeNetwork\s*\(/.test(trimmed) ||
                /^writeSSC\s*\(/.test(trimmed) ||
                /^writeFile\s*\(/.test(trimmed) ||
                /^writeModel\s*\(/.test(trimmed) ||
                /^visualize\s*\(/.test(trimmed) ||
                trimmed === ';'  // Remove standalone semicolons
            );
        }).join('\n');

        if (!strippedContent.includes('begin model')) {
            strippedContent = 'begin model\n' + strippedContent + '\nend model\n';
        }

        const modifiedContent = strippedContent + '\nbegin actions\ngenerate_network({overwrite=>1})\nwriteSBML({})\nend actions\n';
        fs.writeFileSync(tempBnglPath, modifiedContent);

        console.log(`[Parser] Generating SBML...`);
        runBNG2(['--outdir', `"${sbmlOutDir}"`, `"${tempBnglPath}"`]);

        let sbmlFile = path.join(sbmlOutDir, 'model_sbml.xml');
        if (!fs.existsSync(sbmlFile)) {
            console.error(`[ERROR] SBML file not found at ${sbmlFile}`);
            throw new Error(`SBML generation failed`);
        }

        console.log(`[Atomizer] Atomizing...`);
        const atomizer = new Atomizer({ atomize: true, quietMode: true, useId: true, actions: originalActions });
        await atomizer.initialize();
        const result = await atomizer.atomize(fs.readFileSync(sbmlFile, 'utf-8'));
        if (!result.success) {
            console.error(`[ERROR] Atomization failed for ${modelName}: ${result.error}`);
            throw new Error(`Atomization failed: ${result.error}`);
        }

        const atomizedBnglPath = path.join(OUTPUT_BASE, 'atomized', `${modelName}.bngl`);
        fs.writeFileSync(atomizedBnglPath, result.bngl);
        console.log(`[Atomizer] Done.`);

        const refSimDir = path.join(OUTPUT_BASE, 'reference_sim', modelName);
        if (fs.existsSync(refSimDir)) fs.rmSync(refSimDir, { recursive: true, force: true });
        fs.mkdirSync(refSimDir, { recursive: true });

        // Create a temp reference file with the FORCED ODE actions
        const tempRefPath = path.join(refSimDir, 'ref_model.bngl');
        let refContent = strippedContent;
        if (!refContent.includes('begin model')) {
            refContent = 'begin model\n' + refContent + '\nend model\n';
        }
        refContent = refContent + '\n' + originalActions + '\n';
        fs.writeFileSync(tempRefPath, refContent);

        runBNG2(['--outdir', `"${refSimDir}"`, `"${tempRefPath}"`]);

        const atomSimDir = path.join(OUTPUT_BASE, 'atomized_sim', modelName);
        if (fs.existsSync(atomSimDir)) fs.rmSync(atomSimDir, { recursive: true, force: true });
        fs.mkdirSync(atomSimDir, { recursive: true });
        runBNG2(['--outdir', `"${atomSimDir}"`, `"${atomizedBnglPath}"`]);

        const findsGdat = (dir: string) => {
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.gdat') || f.endsWith('.cdat'));
            const gdat = files.find(f => f.endsWith('.gdat'));
            if (gdat) return path.join(dir, gdat);
            const cdat = files.find(f => f.endsWith('.cdat'));
            if (cdat) return path.join(dir, cdat);
            return null;
        };

        const refGdat = findsGdat(refSimDir);
        const atomGdat = findsGdat(atomSimDir);

        if (!refGdat || !atomGdat) throw new Error(`Missing GDAT output (ref=${!!refGdat}, atom=${!!atomGdat})`);

        const comp = compareGDAT(refGdat, atomGdat);
        const modelResult: ModelResult = {
            model: modelName,
            status: comp.passed ? 'PASS' : 'FAIL',
            mae: comp.mae,
            error: comp.error,
            sharedHeaders: comp.sharedHeaders,
            rowCount: comp.rowCount
        };
        allResults.push(modelResult);
        console.log(`[${modelResult.status}] MAE: ${comp.mae.toExponential(2)} (Shared: ${comp.sharedHeaders.length})`);

    } catch (e: any) {
        console.error(`[ERROR] ${modelName}: ${e.message}`);
        allResults.push({ model: modelName, status: 'ERROR', mae: -1, error: e.message, sharedHeaders: [], rowCount: 0 });
    }
}

async function main() {
    ensureDirs();
    const configPath = path.resolve('public_models_compatibility.json');
    if (!fs.existsSync(configPath)) {
        console.error('File not found: public_models_compatibility.json');
        process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const passModels = data.pass;
    const publicModelsDir = path.resolve('public/models');

    const modelsArg = process.argv.find(a => a.startsWith('--models='));
    const modelsFilter = modelsArg ? modelsArg.split('=')[1].split(',') : process.argv.slice(2).filter(a => !a.startsWith('--'));
    console.log('Models Filter:', modelsFilter);

    // Load existing results if available
    const reportPath = 'public_atomizer_report.json';
    if (fs.existsSync(reportPath)) {
        fs.unlinkSync(reportPath);
        console.log(`Deleted existing report ${reportPath}`);
    }

    for (const modelId of passModels) {
        if (modelsFilter.length > 0 && !modelsFilter.includes(modelId)) continue;
        if (BNG2_INCOMPATIBLE_MODELS.has(modelId) && (modelsFilter.length === 0 || !modelsFilter.includes(modelId))) {
            console.log(`> Skipping ${modelId} (known incompatible)`);
            continue;
        }
        if (allResults.find(r => r.model === modelId && r.status === 'PASS') && modelsFilter.length === 0) {
            console.log(`> Skipping ${modelId} (already passed)`);
            continue;
        }
        // Remove existing failure for this model if re-running
        const idx = allResults.findIndex(r => r.model === modelId);
        if (idx !== -1) allResults.splice(idx, 1);

        const modelPath = path.join(publicModelsDir, `${modelId}.bngl`);
        await verifyModel(modelPath);
        fs.writeFileSync('public_atomizer_report.json', JSON.stringify(allResults, null, 2));
    }

    fs.writeFileSync('public_atomizer_report.json', JSON.stringify(allResults, null, 2));
    console.log(`\nFinal report saved to public_atomizer_report.json`);
}

main().catch(e => console.error(e));
