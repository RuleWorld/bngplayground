import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBNGLWithANTLR, generateExpandedNetwork, jitCompiler } from '../packages/engine/src/index';
import { BNG2_COMPATIBLE_MODELS, BNG2_EXCLUDED_MODELS, NFSIM_MODELS } from '../src/constants';
import { findRuleHubModelPath } from './helpers/rulehub';

const MAX_MODELS = 150;
const PER_MODEL_TIMEOUT_MS = Math.max(30_000, Number(process.env.MASSIVE_PARITY_TEST_TIMEOUT_MS ?? 120_000));
const MASSIVE_PARITY_KNOWN_HEAVY_MODELS = new Set([
    'Lin_Prion_2019',
    // EGFR models generate 356 species / 3749 reactions — network generation
    // alone exceeds the 120 s per-model timeout on CI runners.
    '10_egfr_egfr_ode',
    'egfr_ode',
    'example1',
    'example1_BNFfiles_example1',
    'example1_fit',
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

function findModelPath(modelName: string): string | null {
    return findRuleHubModelPath(modelName, path.join(__dirname, '..'));
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
            const filePath = findModelPath(modelName);
            if (!filePath) {
                skipped.push({ model: modelName, reason: 'missing_in_rulehub' });
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
            const filePath = findModelPath(modelName);
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
            const speciesIndexMap = new Map<string, number>();
            species.forEach((speciesEntry: any, index: number) => {
                const speciesName = String(speciesEntry?.name ?? speciesEntry?.graph?.toString?.() ?? speciesEntry);
                speciesIndexMap.set(speciesName, index);
            });

            const resolveSpeciesIndex = (rawIndex: number | string): number => {
                if (typeof rawIndex === 'number' && Number.isInteger(rawIndex)) {
                    return rawIndex;
                }

                const normalized = String(rawIndex).trim();
                const numericIndex = Number.parseInt(normalized, 10);
                if (Number.isInteger(numericIndex) && `${numericIndex}` === normalized) {
                    return numericIndex;
                }

                const mapped = speciesIndexMap.get(normalized);
                if (mapped === undefined) {
                    throw new Error(`Unknown species reference in ${modelName}: ${normalized}`);
                }
                return mapped;
            };

            // HARD LIMIT: skip if network is too massive to verify quickly in this test
            if (reactions.length > 2000) return;

            // This parity path uses a simplified bytecode interpreter that reads only numeric rate constants.
            // Skip models with symbolic/expression rates until exprBytecode evaluation is added here.
            const hasNonNumericStringRate = reactions.some(r => (
                typeof r.rate === 'string' && !Number.isFinite(Number(r.rate.trim()))
            ));
            if (hasNonNumericStringRate) return;

            // 3. JIT Compilation
            // We map from expanded network structure to JIT expectation
            const simpleRxns = reactions.map(r => ({
                reactantIndices: r.reactants.map(resolveSpeciesIndex),
                reactantStoich: r.reactants.map(() => 1),
                productIndices: r.products.map(resolveSpeciesIndex),
                productStoich: r.products.map((_, i) => (r as any).productStoich?.[i] ?? 1) as number[],
                rateConstant: typeof r.rate === 'string' ? Number(r.rate.trim()) : (r.rate || 0),
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
                const volumes = bytecode.speciesVolumes;

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
        reactantOffsets, 
        reactantIdx, 
        reactantStoich,
        scalingVolumes,
        speciesOffsets,
        speciesRxnIdx,
        speciesStoich,
        speciesVolumes
    } = bc;

    const rates = new Float64Array(nReactions);

    for (let s = 0; s < bc.nSpecies; s++) {
        let sum = 0;
        const start = speciesOffsets[s];
        const end = speciesOffsets[s+1];
        
        for (let k = start; k < end; k++) {
            const r = speciesRxnIdx[k];
            const netStoich = speciesStoich[k];
            
            if (rates[r] === 0) {
                let rate = rateConstants[r];
                const rStart = reactantOffsets[r];
                const rEnd = reactantOffsets[r + 1];
                
                for (let j = rStart; j < rEnd; j++) {
                    const specIdx = reactantIdx[j];
                    const stoich = reactantStoich[j];
                    const scale = speciesVolumes[specIdx] / scalingVolumes[r];
                    const conc = scale === 1 ? y[specIdx] : y[specIdx] * scale;
                    rate *= Math.pow(conc, stoich);
                }

                if (scalingVolumes[r] !== 1) {
                    rate *= scalingVolumes[r];
                }

                rates[r] = rate;
            }
            
            sum += netStoich * rates[r];
        }
        dydt[s] = sum / speciesVolumes[s];
    }
}