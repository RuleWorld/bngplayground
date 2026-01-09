
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mocks setup
(global as any).self = {
  postMessage: (msg: any) => console.log('[Worker.postMessage]', msg.type)
};
(global as any).performance = {
  now: () => Date.now()
};
(global as any).DedicatedWorkerGlobalScope = class {};

import { parseBNGLStrict } from '../src/parser/BNGLParserWrapper';

describe('Lisman Debugging', () => {
    it('should run Lisman simulation and log output', async () => {
        // Dynamic import to ensure mocks are set before module load
        const { simulate } = await import('../services/bnglWorker');

        // Path relative to tests/lisman_repro.spec.ts -> ../public/models/Lisman.bngl
        const modelPath = path.resolve(__dirname, '../public/models/Lisman.bngl');
        console.log(`Reading model from: ${modelPath}`);
        const bnglContent = fs.readFileSync(modelPath, 'utf-8');

        console.log('Parsing Lisman.bngl...');
        const parsedModel = parseBNGLStrict(bnglContent);

        console.log('Model parsed.');
        if ((parsedModel as any).parameterChanges) {
             console.log(`- Pre-parsed Param Changes: ${(parsedModel as any).parameterChanges.length}`);
        }

        console.log('Running simulate(123, parsedModel)...');
        try {
            // Need to allow any for options and parsedModel due to loose types
            const result = await simulate(123, parsedModel as any, {} as any);
            console.log('Simulation finished successfully.');
            console.log(`Output rows: ${result.data.length}`);
            
            // Basic check
            expect(result.data.length).toBeGreaterThan(0);
        } catch (e) {
            console.error('Simulation failed with error:', e);
            throw e; // Fail test
        }
    });
});
