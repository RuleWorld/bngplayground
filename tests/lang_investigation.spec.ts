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
(global as any).postMessage = (msg: any) => {
    // console.log('[Worker.postMessage]', msg.type);
};

// Lazy import to ensure mocks are in place
const runSimulation = async (modelName: string) => {
    const { simulate } = await import('../services/bnglWorker');
    const { parseBNGLStrict } = await import('../src/parser/BNGLParserWrapper');

    const modelPath = path.join(__dirname, `../public/models/${modelName}`);
    const modelContent = fs.readFileSync(modelPath, 'utf8');
    console.log(`Reading model from: ${modelPath}`);

    const parsedModel = parseBNGLStrict(modelContent);
    console.log('Model parsed.');

    const results = await simulate(123, parsedModel, { atol: 1e-12, rtol: 1e-12, solver: 'cvode', maxStep: 100 });
    return results;
};

describe('Lang_2024 Investigation', () => {
    it('should reproduce drift at t=73', async () => {
        const results: any = await runSimulation('Lang_2024.bngl');

        if (!results || !results.data || results.data.length === 0) {
            console.warn('No results found');
            return;
        }

        // Find index of 'tCCNE'
        const headerIdx = results.headers.indexOf('tCCNE');
        if (headerIdx === -1) {
            console.error('tCCNE not found in headers');
            return;
        }

        // Find row closest to t=73
        const row = results.data.find((r: any) => Math.abs(r.time - 73.0) < 0.1);
        if (!row) {
            console.error('Row at t=73 not found');
            return;
        }

        // Access value by header name or index depending on structure
        // results.data is likely Array<Record<string, number>>
        const value = row['tCCNE'];
        const refValue = 0.23454;

        console.log(`t=73 tCCNE: ${value} (Ref: ${refValue})`);

        const error = Math.abs(value - refValue);
        const relError = error / Math.abs(refValue);
        console.log(`Diff: ${error}, Rel: ${relError * 100}%`);

        // INSPECT REACTIONS
        if (results.expandedReactions) {
            console.log('Inspecting Homodimer Reactions (A+A):');
            results.expandedReactions.forEach((rxn: any, idx: number) => {
                if (rxn.reactants.length === 2 && rxn.reactants[0] === rxn.reactants[1]) {
                    console.log(`Rxn ${idx}: Reactants [${rxn.reactants}], RateConst=${rxn.rateConstant}, PropensityFactor=${rxn.propensityFactor}, IsFunctional=${rxn.isFunctionalRate}`);
                }
            });
        } else {
            console.log('No expanded reactions returned');
        }

        if (value === undefined) {
            console.error('Value is undefined! Headers:', results.headers);
        }
    }, 600000);
});
