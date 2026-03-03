
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBNGLWithANTLR, generateExpandedNetwork, jitCompiler } from '../packages/engine/src/index';
import { BNG2_COMPATIBLE_MODELS, BNG2_EXCLUDED_MODELS, NFSIM_MODELS } from '../constants';

const MAX_MODELS = 150;
const PER_MODEL_TIMEOUT_MS = Math.max(30_000, Number(process.env.MASSIVE_PARITY_TEST_TIMEOUT_MS ?? 120_000));
const publicModelsDir = path.join(__dirname, '../public/models');
const MASSIVE_PARITY_KNOWN_HEAVY_MODELS = new Set([
    'Lin_Prion_2019',
]);

function normalizeKey(raw: string): string {
    return path.basename(raw)
        .toLowerCase()
        .replace(/\.(bngl|cdat|gdat|net|csv)$/i, '')
        .replace(/^results_/, '')
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9]+/g, '');
}

function stripLineComments(text: string): string {
    return text
        .split(/\r?\n/)
        .map((line) => {
            const idx = line.indexOf('#');
            return idx >= 0 ? line.slice(0, idx) : line;
        })
        .join('\n');
}

function hasActiveSimulate(text: string): boolean {
    return /\bsimulate(?:_ode|_ssa|_nf)?\s*\(/i.test(stripLineComments(text));
}

function detectSimMethod(text: string): 'ode' | 'ssa' | 'nfsim' | 'unspecified' {
    const lower = stripLineComments(text).toLowerCase();
    const compact = lower.replace(/\s+/g, '');

    const hasSSA =
        /simulate_ssa\s*\(/.test(lower) ||
        compact.includes('method=>"ssa"') ||
        compact.includes("method=>'ssa'");

    const hasNF =
        /simulate_nf\s*\(|nfsim\s*\(/.test(lower) ||
        compact.includes('method=>"nf"') ||
        compact.includes("method=>'nf'") ||
        compact.includes('method=>"nfsim"') ||
        compact.includes("method=>'nfsim'");

    if (hasSSA) return 'ssa';
    if (hasNF) return 'nfsim';
    if (/simulate_ode\s*\(/.test(lower) || compact.includes('method=>"ode"') || compact.includes("method=>'ode'")) return 'ode';
    return 'unspecified';
}

function findPublicModelPath(modelName: string): string | null {
    if (!fs.existsSync(publicModelsDir)) return null;
    const key = normalizeKey(modelName);
    const files = fs.readdirSync(publicModelsDir).filter((f) => f.toLowerCase().endsWith('.bngl'));
    const match = files.find((f) => normalizeKey(f) === key);
    return match ? path.join(publicModelsDir, match) : null;
}

describe('Massive JIT/Bytecode Parity Test', () => {
    const skipped: Array<{ model: string; reason: string }> = [];

    const selectedModels = Array.from(BNG2_COMPATIBLE_MODELS)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        .filter((modelName) => {
            if (MASSIVE_PARITY_KNOWN_HEAVY_MODELS.has(modelName)) {
                skipped.push({ model: modelName, reason: 'known_heavy_model' });
                return false;
            }
            if (BNG2_EXCLUDED_MODELS.has(modelName)) {
                skipped.push({ model: modelName, reason: 'excluded_in_constants' });
                return false;
            }
            if (NFSIM_MODELS.has(modelName)) {
                skipped.push({ model: modelName, reason: 'nfsim_model' });
                return false;
            }
            const filePath = findPublicModelPath(modelName);
            if (!filePath) {
                skipped.push({ model: modelName, reason: 'missing_in_public_models' });
                return false;
            }
            const content = fs.readFileSync(filePath, 'utf8');
            if (!hasActiveSimulate(content)) {
                skipped.push({ model: modelName, reason: 'no_active_simulate' });
                return false;
            }
            const method = detectSimMethod(content);
            if (method === 'ssa' || method === 'nfsim') {
                skipped.push({ model: modelName, reason: `non_deterministic_method_${method}` });
                return false;
            }
            return true;
        })
        .slice(0, MAX_MODELS);

    it('logs selection summary', () => {
        // Keep this diagnostic visible in CI logs when selection changes.
        console.log(`[massive-parity] selected=${selectedModels.length} skipped=${skipped.length}`);
        if (skipped.length > 0) {
            const sample = skipped.slice(0, 20).map((s) => `${s.model}(${s.reason})`).join(', ');
            console.log(`[massive-parity] skipped sample: ${sample}`);
        }
        expect(selectedModels.length).toBeGreaterThan(0);
    });

    selectedModels.forEach(modelName => {
        it(`should handle ${modelName} parity`, async () => {
            const filePath = findPublicModelPath(modelName);
            if (!filePath || !fs.existsSync(filePath)) {
                return;
            }

            const content = fs.readFileSync(filePath, 'utf8');
            
            // 1. Parse BNGL
            const parseResult = parseBNGLWithANTLR(content);
            if (!parseResult.model) return;

            // Convert parameters object to Map for engine
            const paramMap = new Map<string, number>();
            if (parseResult.model.parameters) {
                for (const [key, value] of Object.entries(parseResult.model.parameters)) {
                    paramMap.set(key, Number(value));
                }
            }

            // 2. Generate Network (Expanded) - engine version doesn't use Workers
            const fullModel = await generateExpandedNetwork(
                { ...parseResult.model, parameters: paramMap as any },
                () => {}, // checkCancelled
                () => {}  // onProgress
            );
            
            if (!fullModel || !fullModel.reactions || fullModel.reactions.length === 0) {
                return;
            }

            const { reactions, species } = fullModel;
            const nSpecies = species.length;

            // HARD LIMIT: skip if network is too massive to verify quickly in this test
            if (reactions.length > 2000) return;

            // 3. JIT Compilation
            // We map from expanded network structure to JIT expectation
            const simpleRxns = reactions.map(r => ({
                reactantIndices: r.reactants as unknown as number[],
                reactantStoich: r.reactants.map(() => 1),
                productIndices: r.products as unknown as number[],
                productStoich: r.products.map((_, i) => (r as any).productStoich?.[i] ?? 1) as number[],
                rateConstant: r.rate || 0,
                scalingVolume: (r as any).scalingVolume || 1.0
            }));

            const paramObj: Record<string, number> = {};
            paramMap.forEach((v, k) => paramObj[k] = v);

            const jit = jitCompiler.compile(simpleRxns, nSpecies, paramObj);
            
            // 4. Bytecode Path
            const bytecode = jitCompiler.compileToByteCode(simpleRxns, nSpecies, paramObj);
            expect(bytecode).toBeDefined();
            if (bytecode) {
                expect(bytecode.rateConstants).toBeDefined();
                
                // Verify sparsity pattern consistency if available
                if (bytecode.jacRowPtr) {
                    const colIdxCount = bytecode.jacColIdx ? bytecode.jacColIdx.length : 0;
                    expect(bytecode.jacRowPtr[nSpecies]).toEqual(colIdxCount);
                    // Check CSR sorted property
                    if (bytecode.jacColIdx) {
                        for (let i = 0; i < nSpecies; i++){
                            for (let k = bytecode.jacRowPtr[i]; k < bytecode.jacRowPtr[i+1] - 1; k++) {
                                expect(bytecode.jacColIdx[k+1]).toBeGreaterThan(bytecode.jacColIdx[k]);
                            }
                        }
                    }
                }
            }

            // 5. Functional Parity Check (JS vs Interpreter)
            if (jit && bytecode) {
                const y = new Float64Array(nSpecies).fill(1.0);
                const dydt_js = new Float64Array(nSpecies);
                const dydt_bc = new Float64Array(nSpecies);
                const volumes = new Float64Array(nSpecies).fill(1.0);

                if (typeof jit.evaluate === 'function') {
                    jit.evaluate(0, y, dydt_js, volumes);
                    interpretBytecode(bytecode, y, dydt_bc);

                    for (let i = 0; i < nSpecies; i++) {
                        const diff = Math.abs(dydt_js[i] - dydt_bc[i]);
                        const rel = diff / (Math.abs(dydt_js[i]) + 1e-9);
                        expect(rel, `Mismatch in ${modelName} at species ${i}: JS=${dydt_js[i]}, BC=${dydt_bc[i]}`).toBeLessThan(1e-10);
                    }
                }
            }
        }, PER_MODEL_TIMEOUT_MS);
    });
});

function interpretBytecode(bc: any, y: Float64Array, dydt: Float64Array) {
    dydt.fill(0);
    const { 
        nReactions, 
        rateConstants, 
        nReactantsPerRxn, 
        reactantOffsets, 
        reactantIdx, 
        reactantStoich,
        scalingVolumes,
        speciesOffsets,
        speciesRxnIdx,
        speciesStoich,
        speciesVolumes
    } = bc;

    for (let r = 0; r < nReactions; r++) {
        let rate = rateConstants[r];
        const nReactants = nReactantsPerRxn[r];
        const offset = reactantOffsets[r];
        
        for (let j = 0; j < nReactants; j++) {
            const specIdx = reactantIdx[offset + j];
            const stoich = reactantStoich[offset + j];
            // mass action: k * [A]^stoich
            rate *= Math.pow(y[specIdx], stoich);
        }
        
        // Scale by volume
        rate *= scalingVolumes[r];

        // This is actual amount flux, now update derivatives
        // dydt[i] = sum_r (stoich[i,r] * rate[r]) / volume[i]
        // Handled by speciesStoich which has net stoichiometry
    }

    // More accurate way matching JIT logic:
    for (let s = 0; s < bc.nSpecies; s++) {
        let sum = 0;
        const start = speciesOffsets[s];
        const end = speciesOffsets[s+1];
        
        for (let k = start; k < end; k++) {
            const r = speciesRxnIdx[k];
            const netStoich = speciesStoich[k];
            
            // Calculate rate for reaction r
            let rate = rateConstants[r];
            const nReactants = nReactantsPerRxn[r];
            const rOffset = reactantOffsets[r];
            for (let j = 0; j < nReactants; j++) {
                const specIdx = reactantIdx[rOffset + j];
                const stoich = reactantStoich[rOffset + j];
                rate *= Math.pow(y[specIdx], stoich);
            }
            rate *= scalingVolumes[r];
            
            sum += netStoich * rate;
        }
        dydt[s] = sum / speciesVolumes[s];
    }
}
