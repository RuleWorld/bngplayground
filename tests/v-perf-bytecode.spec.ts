import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { generateExpandedNetwork, simulate, parseBNGLStrict as parseBNGL } from '@bngplayground/engine';

const hasCvode = existsSync(join(process.cwd(), 'public', 'cvode.wasm'));
const maybeIt = hasCvode ? it : it.skip;

describe('Functional Rate Bytecode Performance', () => {
    maybeIt('benchmarks Hill functions (Native vs JS)', async () => {
        // Create a model with many functional rates to amplify overhead
        let rules = '';
        const N = 500;
        for (let i = 0; i < N; i++) {
            rules += `    S${i} -> P${i}  V * (S${i}^n) / (K^n + S${i}^n)\n`;
        }

        const bngl = `
        begin parameters
            V 1.0
            K 0.5
            n 2
        end parameters
        begin species
            ${Array.from({length: N}, (_, i) => `S${i} 1.0`).join('\n            ')}
            ${Array.from({length: N}, (_, i) => `P${i} 0.0`).join('\n            ')}
        end species
        begin observables
            Molecules S0 S0()
        end observables
        begin reaction rules
        ${rules}
        end reaction rules
        `;
        
        const parsed = parseBNGL(bngl);
        const expanded = await generateExpandedNetwork(parsed as any, () => {}, () => {});
        const model = {
            ...parsed,
            reactions: expanded.reactions,
            species: expanded.species,
            concreteObservables: (expanded as any).concreteObservables,
        };

        const callbacks = { checkCancelled() {}, postMessage() {} };
        const baseOptions = {
            method: 'ode',
            solver: 'cvode',
            t_end: 10.0,
            n_steps: 1000,
        } as const;

        console.log(`[Benchmark] Starting performance test (${N} Hill reactions, 1000 steps)...`);

        // Warm up runs to ensure WASM module initialization and JIT compiling are excluded from hot timings
        await simulate(1, model as any, { ...baseOptions, disableNativeBytecode: true } as any, callbacks as any);
        await simulate(2, model as any, { ...baseOptions, enableNativeBytecode: true } as any, callbacks as any);

        const trials = 3;
        let jsTime = Infinity;
        let nativeTime = Infinity;

        // Run multiple trials and take the minimum (best) to filter out garbage collection / VM scheduler noise
        for (let t = 0; t < trials; t++) {
            const startJS = performance.now();
            await simulate(1, model as any, { ...baseOptions, disableNativeBytecode: true } as any, callbacks as any);
            const endJS = performance.now();
            jsTime = Math.min(jsTime, endJS - startJS);
        }

        for (let t = 0; t < trials; t++) {
            const startNative = performance.now();
            await simulate(2, model as any, { ...baseOptions, enableNativeBytecode: true } as any, callbacks as any);
            const endNative = performance.now();
            nativeTime = Math.min(nativeTime, endNative - startNative);
        }

        console.log(`[Benchmark] JS Evaluation Time: ${jsTime.toFixed(2)}ms (best of ${trials})`);
        console.log(`[Benchmark] Native Bytecode Time: ${nativeTime.toFixed(2)}ms (best of ${trials})`);
        console.log(`[Benchmark] Speedup: ${(jsTime / nativeTime).toFixed(2)}x`);
        
        // Allow margin for CI runner variance — native should generally be
        // faster but noisy environments can flip the result by a few percent.
        expect(nativeTime).toBeLessThan(jsTime * 1.25);
    });
});
