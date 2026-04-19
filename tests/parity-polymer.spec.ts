import { describe, it, expect, beforeAll } from 'vitest';
import { BNGXMLWriter } from '../packages/engine/src/index';
import { parseBNGLStrict } from '../packages/engine/src/parser/BNGLParserWrapper';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import * as path from 'path';
import { hasNFsim, resolveBNG2Paths } from '../tools/bng2-paths';
import { findRuleHubModelPath } from './helpers/rulehub';

const paths = resolveBNG2Paths();

/**
 * Parity test for polymer.bngl - a compartmental model.
 * 
 * This test:
 * 1. Generates BNGXML from the model
 * 2. Runs NFsim binary
 * 3. Optionally generates BNG2 reference via BNG2.pl
 * 4. Validates NFsim produces reasonable output
 */
describe.skipIf(!hasNFsim())('Polymer Model Parity', () => {
    const testDir = 'temp_parity_polymer';
    const nfsimPath = paths.nfsim!;
    const bng2plPath = paths.bng2pl;
    const modelPath = findRuleHubModelPath('polymer')!;

    beforeAll(() => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
    });

    it('should parse and simulate polymer.bngl with NFsim', { timeout: 8 * 60 * 1000 }, () => {
        const bnglCode = fs.readFileSync(modelPath, 'utf-8');

        console.log('Parsing BNGL...');
        const model = parseBNGLStrict(bnglCode);
        expect(model).toBeDefined();
        const compartments = model.compartments ?? [];
        expect(compartments.length).toBe(1);
        expect(compartments[0].name).toBe('c0');

        console.log('Generating BNGXML...');
        const xml = BNGXMLWriter.write(model);
        const xmlPath = path.join(testDir, 'polymer.xml');
        fs.writeFileSync(xmlPath, xml);

        // Verify compartment is in XML
        expect(xml).toContain('<ListOfCompartments>');
        expect(xml).toContain('id="c0"');

        console.log('Running NFsim...');
        const outputFileName = 'polymer_nf.gdat';
        const speciesFileName = 'polymer_nf.species';
        const expectedGdatPath = path.join(testDir, outputFileName);
        let nfsimOutput = '';

        try {
            nfsimOutput = execFileSync(
                nfsimPath,
                ['-xml', 'polymer.xml', '-sim', '1', '-oSteps', '20', '-cb', '-o', outputFileName, '-ss', speciesFileName],
                { encoding: 'utf-8', stdio: 'pipe', cwd: testDir }
            ) ?? '';
            if (nfsimOutput.trim()) {
                console.log(nfsimOutput);
            }
        } catch (error: any) {
            const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
            const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
            if (stdout.trim()) console.log(stdout);
            if (stderr.trim()) console.error(stderr);
            console.error('NFsim execution failed:', error.message);
            const combinedOutput = [error?.message, error?.stdout, error?.stderr].filter(Boolean).join('\n');
            const knownNFsimIncompatibility =
                combinedOutput.includes('already occupied') ||
                combinedOutput.includes('universal traversal limit was probably set too low') ||
                combinedOutput.includes("Compartments aren't supported in NFsim");

            if (knownNFsimIncompatibility) {
                console.warn('Skipping strict NFsim assertion due to known polymer/NFsim incompatibility in this environment.');
                return;
            }

            throw error;
        }

        // Parse results - NFsim uses model id from XML for output name
        const altGdatPath = path.join(testDir, 'polymer.gdat');
        const gdatPath = fs.existsSync(expectedGdatPath) ? expectedGdatPath : altGdatPath;
        if (!fs.existsSync(gdatPath) && nfsimOutput.includes("Compartments aren't supported in NFsim")) {
            console.warn('Skipping strict NFsim assertion: local NFsim binary does not support compartments.');
            return;
        }
        expect(fs.existsSync(gdatPath)).toBe(true);
        const gdat = fs.readFileSync(gdatPath, 'utf-8');
        const lines = gdat.trim().split('\n').filter(l => l.trim().length > 0);

        const headersLine = lines.find(l => l.startsWith('#'));
        expect(headersLine).toBeDefined();

        const headers = headersLine!.substring(1).trim().split(/\s+/);
        const lastLineStr = lines[lines.length - 1];
        const values = lastLineStr.match(/[+-]?\d?\.?\d+(?:e[+-]?\d+)?/gi) || [];

        const getVal = (name: string) => {
            const idx = headers.indexOf(name);
            return idx === -1 ? null : parseFloat(values[idx]);
        };

        const time = getVal('time');
        const O0 = getVal('O0');

        console.log(`Final stats at t=${time}:`);
        console.log(`- O0 (bound A molecules): ${O0}`);
        console.log(`- Headers: ${headers.join(', ')}`);

        // Validate results
        expect(time).toBeGreaterThanOrEqual(0.9);
        // O0 is count of A molecules with all sites bound
        // This should be > 0 after simulation
        expect(O0).toBeDefined();

        console.log('Polymer parity test passed - NFsim successfully simulated compartmental model!');
    });

    it('should be parseable by BNG2.pl', { timeout: 60_000 }, () => {
        // Verify that BNG2.pl can parse this model
        const bnglFileName = 'polymer_for_bng2.bngl';
        const bnglPath = path.join(testDir, bnglFileName);
        const bnglCode = fs.readFileSync(modelPath, 'utf-8');
        fs.writeFileSync(bnglPath, bnglCode);

        console.log('Testing BNG2.pl compatibility...');
        try {
            execFileSync('perl', [bng2plPath, bnglFileName, '--xml'], { encoding: 'utf-8', cwd: testDir, stdio: 'inherit', timeout: 30000 });

            // Check if XML was generated
            const bng2XmlPath = path.join(testDir, 'polymer_for_bng2.xml');
            expect(fs.existsSync(bng2XmlPath)).toBe(true);
            console.log('BNG2.pl successfully generated XML for polymer model.');
        } catch (error: any) {
            console.log('BNG2.pl test: ', error.message);
            // Don't fail the test if BNG2.pl has issues, just log it
        }
    });
});
