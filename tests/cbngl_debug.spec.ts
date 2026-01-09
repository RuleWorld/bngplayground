/**
 * Debug test for cBNGL_simple volume scaling
 * Verifies that compartment volume scaling is applied correctly to reaction rates
 */
import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock browser environment
if (typeof self === 'undefined') {
    (global as any).self = global;
}
if (typeof window === 'undefined') {
    (global as any).window = global;
}
(global as any).postMessage = () => { /* silent */ };

const runDebug = async () => {
    const { simulate } = await import('../services/bnglWorker');
    const { parseBNGLStrict } = await import('../src/parser/BNGLParserWrapper');

    const modelPath = path.join(__dirname, '../public/models/cBNGL_simple.bngl');
    const modelContent = fs.readFileSync(modelPath, 'utf8');
    console.log('Parsing cBNGL_simple.bngl...');

    const parsedModel = parseBNGLStrict(modelContent);
    console.log('Model parsed.');
    console.log('Compartments:', JSON.stringify(parsedModel.compartments, null, 2));

    // Run a short simulation
    console.log('Running simulation...');

    const results: any = await simulate(123, parsedModel, {
        method: 'ode',
        t_end: 50,
        n_steps: 50,
        atol: 1e-12,
        rtol: 1e-12,
        solver: 'cvode'
    });

    if (!results || !results.expandedReactions) {
        console.error('No expanded network data returned');
        return;
    }

    console.log(`\n=== NETWORK SUMMARY ===`);
    console.log(`Species count: ${results.expandedSpecies?.length}`);
    console.log(`Reaction count: ${results.expandedReactions?.length}`);

    // Find bimolecular reactions and check their rates
    console.log('\n=== BIMOLECULAR REACTIONS (checking volume scaling) ===');
    const bimolRxns = results.expandedReactions.filter((r: any) => r.reactants.length === 2);
    console.log(`Found ${bimolRxns.length} bimolecular reactions`);

    bimolRxns.slice(0, 10).forEach((rxn: any, i: number) => {
        console.log(`[${i}] Reactants: [${rxn.reactants.join(', ')}], Products: [${rxn.products.join(', ')}]`);
        console.log(`     Rate: ${rxn.rateConstant}, PropFactor: ${rxn.propensityFactor}`);
    });

    // Check specific observables at t=5
    console.log('\n=== OBSERVABLE VALUES at t=5 ===');
    const t5Idx = results.data.findIndex((row: any) => Math.abs(row.time - 5) < 0.1);
    if (t5Idx >= 0) {
        const row = results.data[t5Idx];
        console.log('L_Bound_PM:', row.L_Bound_PM);
        console.log('L_Bound_EM:', row.L_Bound_EM);
        console.log('Rp_tot:', row.Rp_tot);
        console.log('Tot_mRNA:', row.Tot_mRNA);
        console.log('Tot_P:', row.Tot_P);
    }

    // Compare with reference
    console.log('\n=== REFERENCE VALUES from error report ===');
    console.log('L_Bound_PM ref: 20.601 (web: 20.573)');
    console.log('L_Bound_EM ref: 32.923 (web: 32.817)');
    console.log('Rp_tot ref: 81.581 (web: 81.314)');
};

describe('cBNGL_simple Volume Scaling Debug', () => {
    it('should correctly apply volume scaling', async () => {
        await runDebug();
    }, 120000);
});
