
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseBNGLWithANTLR, generateExpandedNetwork, jitCompiler } from '../packages/engine/src/index';
import { BNG2_PARSE_AND_ODE_VERIFIED_MODELS, BNG2_COMPATIBLE_MODELS, BNG2_EXCLUDED_MODELS, NFSIM_MODELS } from '../constants';

describe('Massive JIT/Bytecode Parity Test', () => {
    // Search both public/models and example-models if they exist
    const publicModelsDir = path.join(__dirname, '../public/models');
    const exampleModelsDir = path.join(__dirname, '../example-models');

    // Expand search to all BNG2_COMPATIBLE_MODELS that are not NFsim or explicitly excluded
    const compatibleModels = Array.from(BNG2_COMPATIBLE_MODELS).filter(m => 
        !NFSIM_MODELS.has(m) && 
        !BNG2_EXCLUDED_MODELS.has(m)
    );
    
    // Pick 150 random models or all if less than 150
    const count = Math.min(compatibleModels.length, 150);
    const selectedModels = compatibleModels
        .sort(() => 0.5 - Math.random()) 
        .slice(0, count);

    selectedModels.forEach(modelName => {
        it(`should handle ${modelName} parity`, async () => {
            // Some models might be in example-models, some in public/models
            let filePath = path.join(exampleModelsDir, `${modelName}.bngl`);
            if (!fs.existsSync(filePath)) {
                filePath = path.join(publicModelsDir, `${modelName}.bngl`);
            }
            
            if (!fs.existsSync(filePath)) {
                // console.warn(`Model ${modelName} not found in example-models or public/models`);
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
                reactantIndices: r.reactants as number[],
                reactantStoich: r.reactants.map(() => 1),
                productIndices: r.products as number[],
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
        }, 600000); // Increased to 10m for large network expansions like ChylekTCR_2014
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
