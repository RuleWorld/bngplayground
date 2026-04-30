
import { describe, it, expect } from 'vitest';
import { BNGXMLWriter } from '@bngplayground/engine';
import { parseBNGLStrict } from '../packages/engine/src/parser/BNGLParserWrapper';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { hasNFsim, resolveBNG2Paths } from '../tools/bng2-paths';
import { findRuleHubModelPath } from './helpers/rulehub';

const paths = resolveBNG2Paths();

describe.skipIf(!hasNFsim())('Model_ZAP Parity', () => {
    it('should simulate Model_ZAP successfully with NFsim', () => {
        const bnglPath = findRuleHubModelPath('Model_ZAP')!;
        const bnglCode = fs.readFileSync(bnglPath, 'utf-8');
        
        console.log('Parsing BNGL...');
        const model = parseBNGLStrict(bnglCode);
        
        console.log('Generating BNGXML...');
        const xml = BNGXMLWriter.write(model);
        
        const xmlPath = 'debug_model_zap_full.xml';
        fs.writeFileSync(xmlPath, xml);
        
        const nfsimPath = paths.nfsim!;
        console.log(`Running NFsim...`);
        
        try {
            // Use -o to specify output file
            const gdatPath = 'Model_ZAP_nf.gdat';
            execFileSync(nfsimPath, ['-xml', xmlPath, '-sim', '241', '-oSteps', '10', '-o', gdatPath], { encoding: 'utf-8', stdio: 'inherit' });
            
            if (fs.existsSync(gdatPath)) {
                const gdat = fs.readFileSync(gdatPath, 'utf-8');
                const lines = gdat.trim().split('\n').filter(l => l.trim().length > 0);
                
                const headersLine = lines.find(l => l.startsWith('#'));
                if (!headersLine) throw new Error('No headers found');
                
                const headers = headersLine.substring(1).trim().split(/\s+/);
                const lastLineStr = lines[lines.length - 1];
                
                // Robust scientific notation parsing
                const values = lastLineStr.match(/[+-]?\d?\.?\d+(?:e[+-]?\d+)?/gi) || [];
                
                const getVal = (name: string) => {
                    const idx = headers.indexOf(name);
                    return idx === -1 ? null : parseFloat(values[idx]);
                };

                const shp = getVal('tot_bound_SHP');
                const time = getVal('time');
                const pzap = getVal('PZAP_total');
                const pzeta = getVal('total_phosph_zeta');

                console.log(`Final stats at t=${time}:`);
                console.log(`- tot_bound_SHP: ${shp}`);
                console.log(`- PZAP_total: ${pzap}`);
                console.log(`- total_phosph_zeta: ${pzeta}`);

                // Thresholds based on reference (allowing for stochasticity)
                expect(time).toBeGreaterThan(240);
                expect(pzap).toBeGreaterThan(50);
                expect(pzap).toBeLessThan(300);
                expect(pzeta).toBeGreaterThan(10);
                expect(shp).toBeLessThan(10); 
            }
        } catch (error: any) {
            console.error('Test failed');
            throw error;
        }
    });
});
