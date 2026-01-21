/**
 * NFsim Parity Test - Compares WASM vs BNG2.pl simulate_nf output
 * 
 * This test:
 * 1. Runs BNG2.pl with simulate_nf (which internally calls NFsim) to get reference output
 * 2. Runs WASM NFsim with the same seed
 * 3. Compares the .gdat outputs
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const SEED = 12345;
const BNG2_PATH = path.join(process.cwd(), 'bionetgen_python/bng-win/BNG2.pl');

// Helper to parse gdat file
function parseGdat(content: string): { headers: string[], data: number[][] } {
    const lines = content.trim().split('\n').filter((l: string) => l.trim());
    if (lines.length === 0) return { headers: [], data: [] };

    // First line is headers (starts with #)
    const headerLine = lines[0].replace(/^#\s*/, '');
    const headers = headerLine.split(/\s+/).filter((h: string) => h);

    // Parse data rows
    const data: number[][] = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(/\s+/).filter((v: string) => v).map((v: string) => parseFloat(v));
        if (values.length > 0) {
            data.push(values);
        }
    }

    return { headers, data };
}

// Compare two gdat files  
function compareGdat(native: string, wasm: string, modelName: string): { passed: boolean, maxRelError: number, errors: string[] } {
    const errors: string[] = [];
    let maxRelError = 0;

    const nativeData = parseGdat(native);
    const wasmData = parseGdat(wasm);

    console.log(`[${modelName}] Native headers: ${nativeData.headers.join(', ')}`);
    console.log(`[${modelName}] WASM headers: ${wasmData.headers.join(', ')}`);
    console.log(`[${modelName}] Native rows: ${nativeData.data.length}, WASM rows: ${wasmData.data.length}`);

    // Compare headers
    if (nativeData.headers.length !== wasmData.headers.length) {
        errors.push(`Header count mismatch: native=${nativeData.headers.length}, wasm=${wasmData.headers.length}`);
    }

    // Compare row count
    if (nativeData.data.length !== wasmData.data.length) {
        errors.push(`Row count mismatch: native=${nativeData.data.length}, wasm=${wasmData.data.length}`);
    }

    // Compare values
    const rowsToCompare = Math.min(nativeData.data.length, wasmData.data.length);

    for (let row = 0; row < rowsToCompare; row++) {
        const nativeRow = nativeData.data[row];
        const wasmRow = wasmData.data[row];

        const colsToCompare = Math.min(nativeRow.length, wasmRow.length);
        for (let col = 0; col < colsToCompare; col++) {
            const diff = Math.abs(nativeRow[col] - wasmRow[col]);
            const relError = diff / Math.max(Math.abs(nativeRow[col]), 1);
            maxRelError = Math.max(maxRelError, relError);

            // For stochastic simulations with same seed, values should be EXACT
            if (diff > 0) {
                errors.push(`Value mismatch at row ${row}, col ${col}: native=${nativeRow[col]}, wasm=${wasmRow[col]} (diff=${diff})`);
                if (errors.length > 30) {
                    errors.push('... more errors truncated');
                    return { passed: false, maxRelError, errors };
                }
            }
        }
    }

    return { passed: errors.length === 0, maxRelError, errors };
}

async function runTest() {
    console.log('=== NFsim WASM Parity Test ===\n');

    // Use a simple temp dir without spaces
    const TEST_DIR = 'C:/temp/nfsim_test';
    if (!fs.existsSync(TEST_DIR)) {
        fs.mkdirSync(TEST_DIR, { recursive: true });
    }

    // Create a simple test model with Species observable
    const testBngl = `begin model
begin parameters
  k_on 0.001
  k_off 0.1
end parameters

begin molecule types
  A(b)
end molecule types

begin species
  A(b) 1000
end species

begin observables
  Molecules Free_A A(b)
  Molecules Bound_A A(b!+)
  Species Dimer A(b!+)
end observables

begin reaction rules
  A(b) + A(b) <-> A(b!1).A(b!1) k_on, k_off
end reaction rules
end model
`;

    const modelName = 'dimer_species_test';
    const modelDir = path.join(TEST_DIR, modelName);
    if (fs.existsSync(modelDir)) {
        fs.rmSync(modelDir, { recursive: true });
    }
    fs.mkdirSync(modelDir, { recursive: true });

    // Write BNGL with simulate_nf for BNG2.pl reference
    const bnglForBng2 = testBngl + `\nsimulate_nf({t_end=>10, n_steps=>100, seed=>${SEED}})`;
    const bnglPath = path.join(modelDir, `${modelName}.bngl`);
    fs.writeFileSync(bnglPath, bnglForBng2);

    // Step 1: Run BNG2.pl with simulate_nf
    console.log('Step 1: Running BNG2.pl with simulate_nf...');
    console.log(`  BNGL: ${bnglPath}`);
    console.log(`  BNG2.pl: ${BNG2_PATH}`);

    try {
        const result = execSync(`perl "${BNG2_PATH}" "${bnglPath}"`, {
            cwd: modelDir,
            encoding: 'utf8',
            timeout: 120000
        });
        console.log('BNG2.pl output (last 500 chars):', result.slice(-500));
    } catch (e: any) {
        console.log('BNG2.pl stdout:', e.stdout?.slice(-500) || 'none');
        console.log('BNG2.pl stderr:', e.stderr?.slice(-500) || e.message);
        process.exit(1);
    }

    // Find the reference gdat file
    const files = fs.readdirSync(modelDir);
    console.log('Files in model dir:', files);

    const gdatFiles = files.filter((f: string) => f.endsWith('.gdat'));
    if (gdatFiles.length === 0) {
        console.log('ERROR: No gdat file generated by BNG2.pl');
        process.exit(1);
    }

    const refGdatPath = path.join(modelDir, gdatFiles[0]);
    const refGdat = fs.readFileSync(refGdatPath, 'utf8');
    console.log(`\nReference gdat (${gdatFiles[0]}):\n${refGdat.slice(0, 800)}\n`);

    // Step 2: Generate XML and run WASM NFsim
    console.log('Step 2: Generating XML for WASM...');

    // Write BNGL with writeXML for XML generation
    const bnglForXml = testBngl + '\nwriteXML()';
    const xmlBnglPath = path.join(modelDir, `${modelName}_xml.bngl`);
    fs.writeFileSync(xmlBnglPath, bnglForXml);

    try {
        execSync(`perl "${BNG2_PATH}" "${xmlBnglPath}"`, {
            cwd: modelDir,
            encoding: 'utf8',
            timeout: 60000
        });
    } catch (e: any) {
        console.log('XML generation error:', e.stderr || e.message);
        process.exit(1);
    }

    const xmlPath = path.join(modelDir, `${modelName}_xml.xml`);
    if (!fs.existsSync(xmlPath)) {
        console.log('ERROR: XML not generated');
        console.log('Files:', fs.readdirSync(modelDir));
        process.exit(1);
    }

    console.log('\nStep 3: Running WASM NFsim...');
    const xmlContent = fs.readFileSync(xmlPath, 'utf8');

    // Load WASM module
    const nfsimPath = path.join(process.cwd(), 'public/nfsim.js');
    console.log('Loading WASM from:', nfsimPath);

    // Use dynamic require for CJS - the module exports { default: createNFsimModule }
    const nfsimModule = require(nfsimPath);
    const createNFsimModule = nfsimModule.default || nfsimModule;
    console.log('Module type:', typeof createNFsimModule);

    if (typeof createNFsimModule !== 'function') {
        console.log('ERROR: createNFsimModule is not a function');
        console.log('Keys:', Object.keys(createNFsimModule || {}));
        process.exit(1);
    }

    const wasmPath = path.join(process.cwd(), 'public/nfsim.wasm');
    
    // Read WASM binary directly for Node.js (fetch doesn't work in Node)
    const wasmBinary = fs.readFileSync(wasmPath);
    
    const module = await createNFsimModule({
        wasmBinary: wasmBinary,
        locateFile: (p: string) => p.endsWith('.wasm') ? wasmPath : p
    });

    console.log('WASM module loaded. FS available:', !!module.FS);
    console.log('callMain available:', typeof module.callMain === 'function');

    // Run simulation
    const xmlVPath = '/model.xml';
    const outVPath = '/model.gdat';

    try { module.FS.unlink(xmlVPath); } catch { }
    try { module.FS.unlink(outVPath); } catch { }

    module.FS.writeFile(xmlVPath, xmlContent);

    // Note: -cb enables complex bookkeeping for Species observables
    const args = ['-xml', xmlVPath, '-o', outVPath, '-sim', '10', '-oSteps', '100', '-seed', String(SEED), '-cb'];
    console.log('Running NFsim with args:', args.join(' '));

    module.callMain(args);

    const wasmGdat = module.FS.readFile(outVPath, { encoding: 'utf8' });
    console.log(`\nWASM gdat:\n${wasmGdat.slice(0, 800)}\n`);

    // Save WASM output
    const wasmGdatPath = path.join(modelDir, `${modelName}_wasm.gdat`);
    fs.writeFileSync(wasmGdatPath, wasmGdat);

    // Step 4: Compare
    console.log('Step 4: Comparing outputs...');
    const comparison = compareGdat(refGdat, wasmGdat, modelName);

    console.log(`\n=== Results ===`);
    console.log(`Passed: ${comparison.passed}`);
    console.log(`Max Relative Error: ${comparison.maxRelError}`);

    if (!comparison.passed) {
        console.log(`\nErrors (${comparison.errors.length}):`);
        comparison.errors.slice(0, 10).forEach((e: string) => console.log(`  - ${e}`));
    } else {
        console.log('\n✅ PARITY TEST PASSED - WASM output matches native NFsim output exactly!');
    }

    process.exit(comparison.passed ? 0 : 1);
}

runTest().catch(e => {
    console.error('Test failed:', e);
    process.exit(1);
});
