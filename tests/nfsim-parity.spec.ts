/**
 * NFsim Parity Test - Compares WASM vs Native NFsim output
 * 
 * This test:
 * 1. Uses BNG2.pl to generate XML from a BNGL model
 * 2. Runs native NFsim with a fixed seed
 * 3. Runs WASM NFsim with the same seed  
 * 4. Compares the .gdat outputs
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const TEST_DIR = path.join(process.cwd(), 'temp_nfsim_parity');
const SEED = 12345;

// Test models - these have simulate_nf or can be run with NFsim
const TEST_MODELS = [
    {
        name: 'v05',
        bnglPath: 'src/wasm/nfsim/nfsim-src/validate/basicModels/v05.bngl',
        hasSpeciesObservable: true,
        t_end: 1,
        n_steps: 100
    },
    {
        name: 'simple_system',
        bnglPath: 'src/wasm/nfsim/nfsim-src/test/simple_system/simple_system.bngl',
        hasSpeciesObservable: false,
        t_end: 100,
        n_steps: 50
    },
    {
        name: 'dimer',
        bnglPath: 'src/wasm/nfsim/nfsim-src/test/dimer/dimer.bngl',
        hasSpeciesObservable: false,
        t_end: 200,
        n_steps: 100
    }
];

// Helper to parse gdat file
function parseGdat(content: string): { headers: string[], data: number[][] } {
    const lines = content.trim().split('\n').filter(l => l.trim());
    if (lines.length === 0) return { headers: [], data: [] };

    // First line is headers (starts with #)
    const headerLine = lines[0].replace(/^#\s*/, '');
    const headers = headerLine.split(/\s+/).filter(h => h);

    // Parse data rows
    const data: number[][] = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(/\s+/).filter(v => v).map(v => parseFloat(v));
        if (values.length > 0) {
            data.push(values);
        }
    }

    return { headers, data };
}

// Compare two gdat files
function compareGdat(native: string, wasm: string): { passed: boolean, errors: string[] } {
    const errors: string[] = [];

    const nativeData = parseGdat(native);
    const wasmData = parseGdat(wasm);

    // Compare headers
    if (nativeData.headers.length !== wasmData.headers.length) {
        errors.push(`Header count mismatch: native=${nativeData.headers.length}, wasm=${wasmData.headers.length}`);
    } else {
        for (let i = 0; i < nativeData.headers.length; i++) {
            if (nativeData.headers[i] !== wasmData.headers[i]) {
                errors.push(`Header mismatch at ${i}: native="${nativeData.headers[i]}", wasm="${wasmData.headers[i]}"`);
            }
        }
    }

    // Compare row count
    if (nativeData.data.length !== wasmData.data.length) {
        errors.push(`Row count mismatch: native=${nativeData.data.length}, wasm=${wasmData.data.length}`);
    }

    // Compare values (allow small floating point tolerance)
    const tolerance = 1e-6;
    const rowsToCompare = Math.min(nativeData.data.length, wasmData.data.length);

    for (let row = 0; row < rowsToCompare; row++) {
        const nativeRow = nativeData.data[row];
        const wasmRow = wasmData.data[row];

        const colsToCompare = Math.min(nativeRow.length, wasmRow.length);
        for (let col = 0; col < colsToCompare; col++) {
            const diff = Math.abs(nativeRow[col] - wasmRow[col]);
            if (diff > tolerance && diff / Math.max(Math.abs(nativeRow[col]), 1) > tolerance) {
                errors.push(`Value mismatch at row ${row}, col ${col}: native=${nativeRow[col]}, wasm=${wasmRow[col]}`);
                if (errors.length > 20) {
                    errors.push('... more errors truncated');
                    return { passed: false, errors };
                }
            }
        }
    }

    return { passed: errors.length === 0, errors };
}

describe('NFsim WASM Parity', () => {
    beforeAll(() => {
        // Create test directory
        if (!fs.existsSync(TEST_DIR)) {
            fs.mkdirSync(TEST_DIR, { recursive: true });
        }
    });

    for (const model of TEST_MODELS) {
        it(`should match native NFsim output for ${model.name}`, async () => {
            const modelDir = path.join(TEST_DIR, model.name);
            if (!fs.existsSync(modelDir)) {
                fs.mkdirSync(modelDir, { recursive: true });
            }

            const bnglPath = path.join(process.cwd(), model.bnglPath);
            if (!fs.existsSync(bnglPath)) {
                console.log(`Skipping ${model.name}: BNGL file not found at ${bnglPath}`);
                return;
            }

            // Copy BNGL to test dir
            const localBngl = path.join(modelDir, `${model.name}.bngl`);
            fs.copyFileSync(bnglPath, localBngl);

            // Step 1: Generate XML using BNG2.pl
            console.log(`[${model.name}] Generating XML...`);
            try {
                execSync(`perl bionetgen_repo/bionetgen/BNG2.pl --xml ${localBngl}`, {
                    cwd: process.cwd(),
                    encoding: 'utf8',
                    timeout: 60000
                });
            } catch (e: any) {
                console.log(`[${model.name}] BNG2.pl output:`, e.stdout || e.message);
                throw new Error(`Failed to generate XML for ${model.name}`);
            }

            const xmlPath = path.join(modelDir, `${model.name}.xml`);
            if (!fs.existsSync(xmlPath)) {
                throw new Error(`XML not generated for ${model.name}`);
            }

            // Step 2: Run native NFsim
            console.log(`[${model.name}] Running native NFsim...`);
            const nativeGdat = path.join(modelDir, `${model.name}_native.gdat`);
            const cbFlag = model.hasSpeciesObservable ? '-cb' : '';

            try {
                // Check if native NFsim exists
                const nfsimBin = 'bionetgen_repo/bionetgen/bin/NFsim';
                if (!fs.existsSync(nfsimBin) && !fs.existsSync(nfsimBin + '.exe')) {
                    console.log(`[${model.name}] Native NFsim not found, skipping native comparison`);
                    return;
                }

                execSync(`${nfsimBin} -xml ${xmlPath} -o ${nativeGdat} -sim ${model.t_end} -oSteps ${model.n_steps} -seed ${SEED} ${cbFlag}`, {
                    cwd: process.cwd(),
                    encoding: 'utf8',
                    timeout: 120000
                });
            } catch (e: any) {
                console.log(`[${model.name}] Native NFsim failed:`, e.stderr || e.message);
                throw new Error(`Native NFsim failed for ${model.name}`);
            }

            if (!fs.existsSync(nativeGdat)) {
                throw new Error(`Native gdat not generated for ${model.name}`);
            }

            // Step 3: Run WASM NFsim
            console.log(`[${model.name}] Running WASM NFsim...`);
            const wasmGdat = path.join(modelDir, `${model.name}_wasm.gdat`);

            // Load the WASM module
            const nfsimJs = path.join(process.cwd(), 'public/nfsim.js');
            const createNFsimModule = require(nfsimJs);

            const xmlContent = fs.readFileSync(xmlPath, 'utf8');

            const module = await createNFsimModule({
                locateFile: (p: string) => p.endsWith('.wasm')
                    ? path.join(process.cwd(), 'public/nfsim.wasm')
                    : p
            });

            // Write XML to virtual FS
            const modelName = model.name;
            const xmlVPath = `/${modelName}.xml`;
            const outVPath = `/${modelName}.gdat`;

            try { module.FS.unlink(xmlVPath); } catch { }
            try { module.FS.unlink(outVPath); } catch { }

            module.FS.writeFile(xmlVPath, xmlContent);

            const args = ['-xml', xmlVPath, '-o', outVPath, '-sim', String(model.t_end), '-oSteps', String(model.n_steps), '-seed', String(SEED)];
            if (model.hasSpeciesObservable) {
                args.push('-cb');
            }

            module.callMain(args);

            const wasmOutput = module.FS.readFile(outVPath, { encoding: 'utf8' });
            fs.writeFileSync(wasmGdat, wasmOutput);

            // Step 4: Compare outputs
            console.log(`[${model.name}] Comparing outputs...`);
            const nativeContent = fs.readFileSync(nativeGdat, 'utf8');
            const comparison = compareGdat(nativeContent, wasmOutput);

            if (!comparison.passed) {
                console.log(`[${model.name}] Parity errors:`);
                comparison.errors.forEach(e => console.log(`  - ${e}`));
            }

            expect(comparison.passed).toBe(true);
        }, 180000); // 3 minute timeout
    }
});
