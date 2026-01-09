/**
 * Derivative Comparison Test for Lang_2024
 * 
 * Compares dydt(y0, t=0) between web simulator and BNG2 reference.
 * If initial derivatives match, divergence is pure numerical integration.
 * If they differ, there's a remaining logic bug.
 */
import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock browser environment - must be done before dynamic imports
if (typeof self === 'undefined') {
    (global as any).self = global;
}
if (typeof window === 'undefined') {
    (global as any).window = global;
}
(global as any).postMessage = () => { /* silent */ };

const runDerivativeTest = async () => {
    // Dynamic import to ensure mocks are in place
    const { simulate } = await import('../services/bnglWorker');
    const { parseBNGLStrict } = await import('../src/parser/BNGLParserWrapper');

    const modelPath = path.join(__dirname, '../public/models/Lang_2024.bngl');
    const modelContent = fs.readFileSync(modelPath, 'utf8');
    console.log('Parsing Lang_2024.bngl...');

    const parsedModel = parseBNGLStrict(modelContent);
    console.log('Model parsed.');

    // Run a very short simulation to get access to expanded network
    console.log('Running minimal simulation to get network...');
    
    const results: any = await simulate(123, parsedModel, { 
        method: 'ode', 
        t_end: 0.001, // Very short time
        n_steps: 1,
        atol: 1e-12, 
        rtol: 1e-12, 
        solver: 'cvode' 
    });

    return results;
};

describe('Lang_2024 Derivative Comparison', () => {
    it('should compute and display initial derivatives', async () => {
        const results = await runDerivativeTest();

        if (!results || !results.expandedSpecies || !results.expandedReactions) {
            console.error('No expanded network data returned');
            return;
        }

        console.log(`\n=== INITIAL STATE (t=0) ===`);
        console.log(`Species count: ${results.expandedSpecies.length}`);
        console.log(`Reaction count: ${results.expandedReactions.length}`);

        // Extract initial concentrations
        const y0: number[] = results.expandedSpecies.map((sp: any) => sp.initialConcentration);
        console.log('\n--- Initial Concentrations (y0) ---');
        results.expandedSpecies.slice(0, 10).forEach((sp: any, i: number) => {
            console.log(`  [${i}] ${sp.name}: ${sp.initialConcentration}`);
        });
        console.log('  ... (showing first 10 of', y0.length, ')');

        // Compute derivatives manually from reaction data
        console.log('\n--- Computing dydt at t=0 ---');
        const dydt = new Array(y0.length).fill(0);
        
        // Build species name to index map
        const speciesIndex: Map<string, number> = new Map();
        results.expandedSpecies.forEach((sp: any, i: number) => {
            speciesIndex.set(sp.name, i);
        });
        
        for (const rxn of results.expandedReactions) {
            // Compute reaction velocity: v = k * product(y[reactant])
            let velocity = rxn.rateConstant;
            
            // Apply propensity factor (for homodimers)
            if (rxn.propensityFactor !== undefined) {
                velocity *= rxn.propensityFactor;
            }
            
            // Reactants might be string names or indices
            const reactantIndices: number[] = [];
            for (const r of rxn.reactants) {
                const idx = typeof r === 'number' ? r : speciesIndex.get(r);
                if (idx !== undefined) {
                    reactantIndices.push(idx);
                    velocity *= y0[idx];
                }
            }
            
            // Update dydt for reactants (consumed)
            for (const idx of reactantIndices) {
                dydt[idx] -= velocity;
            }
            
            // Products might be string names or indices
            for (const p of rxn.products) {
                const idx = typeof p === 'number' ? p : speciesIndex.get(p);
                if (idx !== undefined) {
                    dydt[idx] += velocity;
                }
            }
        }

        console.log('\n--- dY/dt at t=0 (from web simulator logic) ---');
        // Show species with largest |dydt|
        const dydtWithIdx = dydt.map((d, i) => ({ idx: i, name: results.expandedSpecies[i].name, dydt: d }));
        dydtWithIdx.sort((a, b) => Math.abs(b.dydt) - Math.abs(a.dydt));
        
        console.log('Top 20 by magnitude:');
        dydtWithIdx.slice(0, 20).forEach(item => {
            console.log(`  [${item.idx}] ${item.name}: ${item.dydt.toExponential(6)}`);
        });

        // Print summary statistics
        const maxDydt = Math.max(...dydt.map(Math.abs));
        const sumDydt = dydt.reduce((a, b) => a + b, 0);
        console.log(`\n--- Summary ---`);
        console.log(`Max |dydt|: ${maxDydt.toExponential(6)}`);
        console.log(`Sum(dydt): ${sumDydt.toExponential(6)} (should be ~0 for closed system)`);

        // Check specific species mentioned in observables
        const tCCNE_species = results.expandedSpecies
            .map((sp: any, i: number) => ({ ...sp, idx: i }))
            .filter((sp: any) => sp.name.includes('CCNE'));
        
        console.log('\n--- CCNE species (contributing to tCCNE observable) ---');
        tCCNE_species.forEach((sp: any) => {
            console.log(`  [${sp.idx}] ${sp.name}`);
            console.log(`      y0 = ${y0[sp.idx]}, dydt = ${dydt[sp.idx].toExponential(6)}`);
        });

        console.log('\n=== Reference computation needed ===');
        console.log('To verify BNG2 derivatives, compute: simulate({method=>"ode",t_end=>1e-9,n_steps=>1})');
        console.log('Then examine the first step derivative from CVODE internal calculations.');

    }, 120000);
});
