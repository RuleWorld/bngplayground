import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { Atomizer } from '../src/lib/atomizer/index.ts';

// Configuration
const BNG2_PATH = path.resolve('bionetgen_python/bng-win/BNG2.pl');
const OUTPUT_BASE = path.resolve('tests/parity_check');
const TOLERANCE = 1e-6;

// Ensure output directories exist
function ensureDirs() {
    ['sbml', 'atomized', 'reference_sim', 'atomized_sim'].forEach(dir => {
        const p = path.join(OUTPUT_BASE, dir);
        if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    });
}

// Helper to run BNG2.pl
function runBNG2(args: string[]) {
    const cmd = `perl "${BNG2_PATH}" ${args.join(' ')}`;
    try {
        // Suppress heavy output unless error
        execSync(cmd, { stdio: 'pipe' });
    } catch (e: any) {
        console.error(`Error running BNG2: ${cmd}`);
        console.error(e.stdout?.toString());
        console.error(e.stderr?.toString());
        throw e;
    }
}

// Helper to parse GDAT
function parseGDAT(filePath: string): { headers: string[], data: number[][] } {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split(/\r?\n/);

        // Header line starts with #
        const headerLine = lines.find(l => l.startsWith('#'));
        if (!headerLine) throw new Error(`Invalid GDAT file (no header): ${filePath}`);

        const headers = headerLine.substring(1).trim().split(/\s+/);
        const data: number[][] = [];

        for (const line of lines) {
            if (line.startsWith('#')) continue;
            const vals = line.trim().split(/\s+/).map(Number);
            if (vals.length === headers.length) {
                data.push(vals);
            }
        }

        return { headers, data };
    } catch (e: any) {
        throw new Error(`Failed to parse GDAT ${filePath}: ${e.message}`);
    }
}

// Compare two GDAT files
function compareGDAT(refPath: string, testPath: string): { passed: boolean, mae: number, error?: string } {
    if (!fs.existsSync(refPath)) return { passed: false, mae: -1, error: 'Reference file missing' };
    if (!fs.existsSync(testPath)) return { passed: false, mae: -1, error: 'Test file missing' };

    try {
        const ref = parseGDAT(refPath);
        const test = parseGDAT(testPath);

        if (JSON.stringify(ref.headers) !== JSON.stringify(test.headers)) {
            return { passed: false, mae: -1, error: `Headers mismatch: ${ref.headers.join(',')} vs ${test.headers.join(',')}` };
        }

        if (ref.data.length !== test.data.length) {
            return { passed: false, mae: -1, error: `Row count mismatch: ${ref.data.length} vs ${test.data.length}` };
        }

        let maxError = 0;
        for (let i = 0; i < ref.data.length; i++) {
            for (let j = 0; j < ref.headers.length; j++) {
                const diff = Math.abs(ref.data[i][j] - test.data[i][j]);
                if (Number.isNaN(diff)) continue;
                if (diff > maxError) maxError = diff;
            }
        }

        return { passed: maxError < TOLERANCE, mae: maxError };
    } catch (e: any) {
        return { passed: false, mae: -1, error: e.message };
    }
}

// Verify a single model
async function verifyModel(modelPath: string) {
    const modelName = path.basename(modelPath, '.bngl');
    console.log(`\nVerifying ${modelName}...`);

    try {
        // 1. Convert Source -> SBML
        const sbmlOutDir = path.join(OUTPUT_BASE, 'sbml');
        runBNG2(['--sbml', '--outdir', `"${sbmlOutDir}"`, `"${modelPath}"`]);

        // Check for output file (BNG2 usually outputs [modelName]_sbml.xml or [modelName].xml)
        let sbmlFile = path.join(sbmlOutDir, `${modelName}_sbml.xml`);
        if (!fs.existsSync(sbmlFile)) {
            sbmlFile = path.join(sbmlOutDir, `${modelName}.xml`);
        }
        if (!fs.existsSync(sbmlFile)) {
            // Some models might have uppercase/hyphen differences or other naming quirks
            const files = fs.readdirSync(sbmlOutDir);
            const found = files.find(f => f.toLowerCase().startsWith(modelName.toLowerCase()) && f.endsWith('.xml'));
            if (found) sbmlFile = path.join(sbmlOutDir, found);
        }
        if (!fs.existsSync(sbmlFile)) throw new Error(`SBML generation failed: ${sbmlFile} missing`);

        const sbmlContent = fs.readFileSync(sbmlFile, 'utf-8');

        // 2. Atomize SBML -> BNGL using our tool
        const atomizer = new Atomizer({
            atomize: false, // Flat translation by default for parity check
            quietMode: true,
            logLevel: 'ERROR' // minimize noise
        });

        await atomizer.initialize(); // Ensure libsbml loaded

        const result = await atomizer.atomize(sbmlContent);

        if (!result.success) {
            throw new Error(`Atomization failed: ${result.error}`);
        }

        const atomizedBnglPath = path.join(OUTPUT_BASE, 'atomized', `${modelName}.bngl`);
        fs.writeFileSync(atomizedBnglPath, result.bngl);

        // 3. Simulate Reference BNGL
        const refSimDir = path.join(OUTPUT_BASE, 'reference_sim', modelName);
        if (!fs.existsSync(refSimDir)) fs.mkdirSync(refSimDir, { recursive: true });

        // Using simple ODE simulation for speed and deterministic comparison
        // We assume the model has 'generate_network' and 'simulate' or we add them?
        // BNG2.pl runs the actions in the file.
        // If the file lacks actions, nothing happens.
        // Most tutorial models have actions.

        runBNG2(['--outdir', `"${refSimDir}"`, `"${modelPath}"`]);

        // 4. Simulate Atomized BNGL
        const atomSimDir = path.join(OUTPUT_BASE, 'atomized_sim', modelName);
        if (!fs.existsSync(atomSimDir)) fs.mkdirSync(atomSimDir, { recursive: true });

        // Need to ensure actions exist. Atomizer appends default actions if none found?
        // Our generateBNGL appends default simulate commands at the end always:
        // navigate to bnglWriter.ts to confirm: yes, it pushes 'simulate({method=>"ode"...})'

        runBNG2(['--outdir', `"${atomSimDir}"`, `"${atomizedBnglPath}"`]);

        // 5. Compare Results
        // Find .gdat files
        const findsGdat = (dir: string) => {
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.gdat'));
            return files.length > 0 ? path.join(dir, files[0]) : null;
        };

        const refGdat = findsGdat(refSimDir);
        const atomGdat = findsGdat(atomSimDir);

        if (!refGdat || !atomGdat) {
            throw new Error(`Missing simulation output. Ref: ${refGdat}, Atom: ${atomGdat}`);
        }

        const comparison = compareGDAT(refGdat, atomGdat);

        if (comparison.passed) {
            console.log(`[PASS] ${modelName} (MAE: ${comparison.mae.toExponential(2)})`);
        } else {
            console.error(`[FAIL] ${modelName}: ${comparison.error} (MAE: ${comparison.mae.toExponential(2)})`);
        }

    } catch (e: any) {
        console.error(`[ERROR] ${modelName}: ${e.message}`);
    }
}

async function main() {
    ensureDirs();
    console.log('Starting Parity Verification...');

    // Get all BNGL files from native-tutorials/CBNGL (good starting point)
    // Or just pick a few specific ones
    const tutorialsDir = path.resolve('example-models');

    if (!fs.existsSync(tutorialsDir)) {
        console.error(`Example models directory not found: ${tutorialsDir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(tutorialsDir).filter(f => f.endsWith('.bngl'));
    console.log(`Verifying all models in ${tutorialsDir} (${files.length} models)...`);

    for (const file of files) {
        await verifyModel(path.join(tutorialsDir, file));
    }
}

main().catch(e => console.error(e));
