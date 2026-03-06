
import { describe, it, expect } from 'vitest';
import { runNFsimSimulation } from '@bngplayground/engine';
import { parseBNGL } from '../services/parseBNGL';
import * as fs from 'fs';

describe('Polymer Model Simulation', () => {
    it('should simulate polymer model (NFsim or fallback)', async () => {
        const bnglCode = fs.readFileSync('public/models/polymer.bngl', 'utf-8');
        const model = parseBNGL(bnglCode);
        
        console.log('Running simulation...');
        const results = await runNFsimSimulation(model, {
            t_end: 0.01,
            n_steps: 10,
            timeoutMs: 30000 // 30s
        });
        
        expect(results).toBeDefined();
        expect(results.data.length).toBeGreaterThan(0);
        console.log('Simulation successful! Rows:', results.data.length);
        console.log('First row:', results.data[0]);
    });
});
