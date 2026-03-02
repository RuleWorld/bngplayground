/**
 * JITCompiler.ts - Just-In-Time compilation of ODE RHS functions
 * 
 * Compiles reaction networks into optimized JavaScript functions for faster
 * RHS (right-hand side) evaluation during ODE integration.
 * 
 * Benefits:
 * - Cached species index lookups (avoids dictionary access)
 * - Inlined rate expressions for hot paths
 * - Loop unrolling for small networks
 * - ~2-5x speedup for RHS evaluation
 */

import type { Rxn } from '../graph/core/Rxn';
import { ExpressionTranslator } from '../graph/core/ExpressionTranslator';

export interface NetworkByteCode {
    nReactions: number;
    nSpecies: number;
    rateConstants: Float64Array;
    nReactantsPerRxn: Int32Array;
    reactantOffsets: Int32Array;
    reactantIdx: Int32Array;
    reactantStoich: Int32Array;
    scalingVolumes: Float64Array;
    speciesOffsets: Int32Array;
    speciesRxnIdx: Int32Array;
    speciesStoich: Float64Array;
    speciesVolumes: Float64Array;
    jacRowPtr: Int32Array;
    jacColIdx: Int32Array;
    jacContribOffsets: Int32Array;
    jacContribRxnIdx: Int32Array;
    jacContribCoeffs: Float64Array;
}

/**
 * Compiled RHS function type
 */
export type CompiledRHS = (t: number, y: Float64Array, dydt: Float64Array, speciesVolumes: Float64Array) => void;

/**
 * JIT compilation result
 */
export interface JITCompiledFunction {
    evaluate: CompiledRHS;
    sourceCode: string;
    nSpecies: number;
    nReactions: number;
    compiledAt: number;
}

/**
 * JIT Compiler for ODE RHS functions
 */
export class JITCompiler {
    private cache: Map<string, JITCompiledFunction> = new Map();
    private maxCacheSize: number = 50;



    /**
     * Compile a reaction network into an optimized RHS function
     */
    compile(
        reactions: Array<{
            reactantIndices: number[];
            reactantStoich: number[];
            productIndices: number[];
            productStoich: number[];

            rateConstant: number | string; // Can be number or expression
            rateConstantIndex?: number;
            scalingVolume?: number; // Reacting volume anchor (BNG2-style)
            totalRate?: boolean; // Parsed modifier; BNG2 ODE/network ignores TotalRate
        }>,
        nSpecies: number,
        parameters?: Record<string, number>,
        constantSpeciesMask?: boolean[]
    ): JITCompiledFunction {
        // Build a cache key based on reactions and parameters
        // Note: For large networks, hashing might be slow, so we use a simplified signature 
        // or just rely on callers to clear the cache if they know things changed.
        // However, we want to BE SAFE, so we include parameters because they are inlined.
        const configSignature = JSON.stringify({
            rxnSignatures: reactions.map(r => ({
                r: Array.from(r.reactantIndices),
                rs: Array.from(r.reactantStoich),
                p: Array.from(r.productIndices),
                ps: Array.from(r.productStoich),
                k: r.rateConstant,
                v: r.scalingVolume,
                t: r.totalRate
            })),
            nSpecies,
            constantSpeciesMask: constantSpeciesMask ?? [],
            parameters: parameters || {}
        });

        const cached = this.cache.get(configSignature);
        if (cached) {
            return cached;
        }

        // Build the function source code
        let source = '';

        const isConstantSpecies = (idx: number): boolean =>
            !!constantSpeciesMask && idx >= 0 && idx < constantSpeciesMask.length && !!constantSpeciesMask[idx];

        // Add parameter bindings if provided
        if (parameters) {
            for (const [name, value] of Object.entries(parameters)) {
                // Ensure name is a valid JS identifier
                if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
                    source += `const ${name} = ${value};\n`;
                }
            }
        }

        // Initialize dydt to zero
        source += `for (let i = 0; i < ${nSpecies}; i++) dydt[i] = 0.0;\n\n`;

        // If speciesVolumes are missing, we default all to 1.0 (non-compartmental legacy)
        // This handles cases where the simulator doesn't pass a second vector.
        source += `if (!speciesVolumes) { speciesVolumes = new Float64Array(${nSpecies}); speciesVolumes.fill(1.0); }\n\n`;

        // Generate reaction rate calculations
        for (let i = 0; i < reactions.length; i++) {
            const rxn = reactions[i];

            // Build rate expression: k * product(y[reactant]^stoich)
            let rateExpr = typeof rxn.rateConstant === 'number'
                ? rxn.rateConstant.toString()
                : `(${ExpressionTranslator.translate(rxn.rateConstant.toString())})`; // Expression in parentheses for safety

            // NOTE: BNG2 network simulations (ODE) do not implement TotalRate; treat as standard mass action.
            for (let j = 0; j < rxn.reactantIndices.length; j++) {
                const idx = rxn.reactantIndices[j];
                const stoich = rxn.reactantStoich[j];
                // PARITY FIX: BNG2 mass-action assumes rates are scaled by V_anchor.
                // Reactant concentrations must be converted from native (N/Vi) to anchor-relative (N/Vanchor).
                const vAnchor = rxn.scalingVolume || 1.0;
                // Use bracket notation for y and speciesVolumes to handle non-numeric/complex species names properly in source
                const scale = `(speciesVolumes[${idx}] / ${vAnchor})`;

                if (stoich === 1) {
                    rateExpr += ` * (y[${idx}] * ${scale})`;
                } else if (stoich === 2) {
                    rateExpr += ` * Math.pow(y[${idx}] * ${scale}, 2)`;
                } else {
                    rateExpr += ` * Math.pow(y[${idx}] * ${scale}, ${stoich})`;
                }
            }

            // Apply multiplicity/degeneracy if using symbolic expression
            // Numeric rateConstant already includes degeneracy aggregated in NetworkGenerator
            if (typeof rxn.rateConstant !== 'number' && (rxn as any).statisticalFactor && (rxn as any).statisticalFactor !== 1) {
                rateExpr = `(${rateExpr}) * ${(rxn as any).statisticalFactor}`;
            }

            // Apply reacting volume anchor (matches BNG2 compartmental mass-action scaling)
            // PARITY FIX: For concentration-based ODEs (y in M), the rate expression should 
            // represent TOTAL FLUX (Amount/Time) to be correctly distributed into 
            // compartment-specific dydt (d[C]/dt = Flux / Vol_C).
            // Flux = k * [A]^n * [B]^m * Vol_Anchor
            if (rxn.scalingVolume && rxn.scalingVolume !== 1) {
                const n = rxn.reactantIndices.length;
                if (n === 0) {
                    // Zero-order synthesis: Rate = k * V_anchor
                    rateExpr = `(${rateExpr}) * ${rxn.scalingVolume}`;
                } else if (n === 1) {
                    // Unimolecular: Flux = k * [A] * V_anchor
                    // (Previous implementation skipped this, leading to errors in transport/unimolecular)
                    rateExpr = `(${rateExpr}) * ${rxn.scalingVolume}`;
                } else if (n === 2) {
                    // Bimolecular: Flux = k * [A] * [B] * V_anchor
                    // (Previous implementation incorrectly divided by V_anchor here)
                    rateExpr = `(${rateExpr}) * ${rxn.scalingVolume}`;
                } else if (n === 3) {
                    // Ternary: Flux = k * [A] * [B] * [C] * V_anchor
                    rateExpr = `(${rateExpr}) * ${rxn.scalingVolume}`;
                } else {
                    // Higher-order: Flux = k * [Patterns] * V_anchor
                    rateExpr = `(${rateExpr}) * ${rxn.scalingVolume}`;
                }
            }

            source += `const r${i} = ${rateExpr};\n`;
        }

        source += '\n';

        // Generate species derivative updates
        const speciesContributions: Map<number, string[]> = new Map();

        for (let i = 0; i < reactions.length; i++) {
            const rxn = reactions[i];

            // Subtract for reactants
            for (let j = 0; j < rxn.reactantIndices.length; j++) {
                const idx = rxn.reactantIndices[j];
                if (isConstantSpecies(idx)) continue;
                const stoich = rxn.reactantStoich[j];
                if (!speciesContributions.has(idx)) {
                    speciesContributions.set(idx, []);
                }
                if (stoich === 1) {
                    speciesContributions.get(idx)!.push(`- r${i}`);
                } else {
                    speciesContributions.get(idx)!.push(`- ${stoich} * r${i}`);
                }
            }

            // Add for products
            for (let j = 0; j < rxn.productIndices.length; j++) {
                const idx = rxn.productIndices[j];
                if (isConstantSpecies(idx)) continue;
                const stoich = rxn.productStoich[j];
                if (!speciesContributions.has(idx)) {
                    speciesContributions.set(idx, []);
                }
                if (stoich === 1) {
                    speciesContributions.get(idx)!.push(`+ r${i}`);
                } else {
                    speciesContributions.get(idx)!.push(`+ ${stoich} * r${i}`);
                }
            }
        }

        // Generate dydt assignments
        for (let i = 0; i < nSpecies; i++) {
            const contributions = speciesContributions.get(i);
            if (!contributions || contributions.length === 0) continue;

            // Check if species is constant (volume = 0 or specific flag)
            // If speciesVolumes[idx] is provided, we use it for scaling
            let expr = contributions.join(' ');
            if (expr.startsWith('+ ')) {
                expr = expr.substring(2);
            } else if (expr.startsWith('+')) {
                expr = expr.substring(1);
            }

            // Apply species-specific volume scaling: d[C]/dt = Flux_Amount / Vol_Species
            // Parity: matches BNG2 compartmental ODE semantics
            source += `dydt[${i}] = (${expr})`;
            source += ` / speciesVolumes[${i}];\n`;
        }

        // Create the function
        const fullSource = `(function(t, y, dydt, speciesVolumes) {\n${source}})`;

        let evaluate: CompiledRHS;
        try {
            // eslint-disable-next-line no-eval
            evaluate = eval(fullSource) as CompiledRHS;
        } catch (error) {
            console.error('[JITCompiler] Failed to compile RHS function:', error);
            console.error('[JITCompiler] Source:', fullSource);
            // Fallback to a generic implementation
            evaluate = (_t, _y, dydt, _speciesVolumes) => {
                for (let i = 0; i < nSpecies; i++) dydt[i] = 0;
            };
        }

        const result: JITCompiledFunction = {
            evaluate,
            sourceCode: fullSource,
            nSpecies,
            nReactions: reactions.length,
            compiledAt: Date.now()
        };

        // Manage cache size
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) this.cache.delete(firstKey);
        }
        this.cache.set(configSignature, result);

        console.log(`[JITCompiler] Compiled RHS for ${nSpecies} species, ${reactions.length} reactions`);

        return result;
    }

    /**
     * Compile from Rxn array (convenience method for integration with existing code)
     */
    compileFromRxns(
        reactions: Rxn[],
        nSpecies: number,
        _speciesIndexMap: Map<string, number>,
        parameters?: Record<string, number>
    ): JITCompiledFunction {
        // Convert Rxn to simpler format
        const simpleReactions = reactions.map(rxn => {
            const reactantIndices: number[] = [];
            const reactantStoich: number[] = [];
            const productIndices: number[] = [];
            const productStoich: number[] = [];

            // Process reactants
            const reactantCounts = new Map<number, number>();
            for (const idx of rxn.reactants) {
                reactantCounts.set(idx, (reactantCounts.get(idx) || 0) + 1);
            }
            for (const [idx, count] of reactantCounts) {
                reactantIndices.push(idx);
                reactantStoich.push(count);
            }

            // Process products
            const productCounts = new Map<number, number>();
            for (const idx of rxn.products) {
                productCounts.set(idx, (productCounts.get(idx) || 0) + 1);
            }
            for (const [idx, count] of productCounts) {
                productIndices.push(idx);
                productStoich.push(count);
            }

            return {
                reactantIndices,
                reactantStoich,
                productIndices,
                productStoich,
                rateConstant: rxn.rateExpression || rxn.rate,
                scalingVolume: rxn.scalingVolume, // Extract scaling volume
                totalRate: rxn.totalRate, // Handle total rate
                statisticalFactor: rxn.degeneracy // Pass degeneracy for symbolic expressions
            };
        });

        return this.compile(simpleReactions, nSpecies, parameters);
    }

    /**
     * Compile a reaction network into a compact bytecode representation for WASM interpretation.
     * Returns null if any reaction uses a complex rate expression that cannot be pre-evaluated.
     */
    compileToByteCode(
        reactions: Array<{
            reactantIndices: number[];
            reactantStoich: number[];
            productIndices: number[];
            productStoich: number[];
            rateConstant: number | string;
            scalingVolume?: number;
            statisticalFactor?: number;
        }>,
        nSpecies: number,
        parameters?: Record<string, number>,
        speciesVolumes?: Float64Array
    ): NetworkByteCode | null {
        try {
            const nReactions = reactions.length;
            const rateConstants = new Float64Array(nReactions);
            const nReactantsPerRxn = new Int32Array(nReactions);
            const scalingVolumes = new Float64Array(nReactions);

            let totalReactantEntries = 0;
            for (const rxn of reactions) {
                totalReactantEntries += rxn.reactantIndices.length;
            }

            const reactantOffsets = new Int32Array(nReactions + 1);
            const reactantIdx = new Int32Array(totalReactantEntries);
            const reactantStoich = new Int32Array(totalReactantEntries);

            let currentReactantOffset = 0;
            for (let i = 0; i < nReactions; i++) {
                const rxn = reactions[i];
                
                // Pre-evaluate rate constant
                let k: number;
                if (typeof rxn.rateConstant === 'number') {
                    k = rxn.rateConstant;
                } else {
                    // Try to evaluate expression
                    const translated = ExpressionTranslator.translate(rxn.rateConstant.toString());
                    // Simple evaluation for parameters
                    try {
                        // eslint-disable-next-line no-new-func
                        const evaluator = new Function('params', `const {${Object.keys(parameters || {}).join(',')}} = params; return ${translated};`);
                        k = evaluator(parameters || {});
                        if (isNaN(k) || !isFinite(k)) return null;
                    } catch {
                        return null; // Contains y[i] or other non-constant terms
                    }
                }

                if (rxn.statisticalFactor && rxn.statisticalFactor !== 1) {
                    k *= rxn.statisticalFactor;
                }

                rateConstants[i] = k;
                nReactantsPerRxn[i] = rxn.reactantIndices.length;
                scalingVolumes[i] = rxn.scalingVolume || 1.0;
                reactantOffsets[i] = currentReactantOffset;

                for (let j = 0; j < rxn.reactantIndices.length; j++) {
                    reactantIdx[currentReactantOffset] = rxn.reactantIndices[j];
                    reactantStoich[currentReactantOffset] = rxn.reactantStoich[j];
                    currentReactantOffset++;
                }
            }
            reactantOffsets[nReactions] = currentReactantOffset;

            // Stoichiometry matrix conversion (CSC-like)
            const speciesRxnEntries: Array<{ rxnIdx: number; stoich: number }>[] = Array.from({ length: nSpecies }, () => []);
            for (let r = 0; r < nReactions; r++) {
                const rxn = reactions[r];
                // Reactants
                for (let j = 0; j < rxn.reactantIndices.length; j++) {
                    const s = rxn.reactantIndices[j];
                    const st = rxn.reactantStoich[j];
                    const existing = speciesRxnEntries[s].find(e => e.rxnIdx === r);
                    if (existing) {
                        existing.stoich -= st;
                    } else {
                        speciesRxnEntries[s].push({ rxnIdx: r, stoich: -st });
                    }
                }
                // Products
                for (let j = 0; j < rxn.productIndices.length; j++) {
                    const s = rxn.productIndices[j];
                    const st = rxn.productStoich[j];
                    const existing = speciesRxnEntries[s].find(e => e.rxnIdx === r);
                    if (existing) {
                        existing.stoich += st;
                    } else {
                        speciesRxnEntries[s].push({ rxnIdx: r, stoich: st });
                    }
                }
            }

            const speciesOffsets = new Int32Array(nSpecies + 1);
            let totalStoichEntries = 0;
            for (let s = 0; s < nSpecies; s++) {
                speciesOffsets[s] = totalStoichEntries;
                totalStoichEntries += speciesRxnEntries[s].length;
            }
            speciesOffsets[nSpecies] = totalStoichEntries;

            const speciesRxnIdx = new Int32Array(totalStoichEntries);
            const speciesStoich = new Float64Array(totalStoichEntries);

            let currentStoichOffset = 0;
            for (let s = 0; s < nSpecies; s++) {
                for (const entry of speciesRxnEntries[s]) {
                    speciesRxnIdx[currentStoichOffset] = entry.rxnIdx;
                    speciesStoich[currentStoichOffset] = entry.stoich;
                    currentStoichOffset++;
                }
            }

            // Analytical Jacobian Bytecode Generation
            // d(dydt[i])/dy[j] = sum_r (speciesStoich[i,r] * d(rate[r])/dy[j]) / speciesVolumes[i]
            // d(rate[r])/dy[j] = (rate[r] * reactantStoich[r,j]) / y[j] -- for mass action
            const jacRows = Array.from({ length: nSpecies }, () => new Map<number, { rxnIdx: number; coeff: number }[]>());
            
            // Map: reaction index -> species affected (non-zero net stoichiometry)
            const rxnToAffectedSpecies: number[][] = reactions.map((_, r) => {
                const affected: number[] = [];
                for (let s = 0; s < nSpecies; s++) {
                    const entries = speciesRxnEntries[s];
                    if (!entries) continue;
                    const entry = entries.find(e => e.rxnIdx === r);
                    if (entry && entry.stoich !== 0) affected.push(s);
                }
                return affected;
            });

            for (let r = 0; r < nReactions; r++) {
                const rxn = reactions[r];
                const affectedSpecies = rxnToAffectedSpecies[r];
                
                for (let i_r = 0; i_r < rxn.reactantIndices.length; i_r++) {
                    const j = rxn.reactantIndices[i_r]; // Species the rate depends on
                    const reactantStoichJ = rxn.reactantStoich[i_r];
                    
                    for (const s of affectedSpecies) {
                        if (!jacRows[s].has(j)) {
                            jacRows[s].set(j, []);
                        }
                        // We store the contribution from reaction r to J[s][j]
                        const netStoichI = speciesRxnEntries[s].find(e => e.rxnIdx === r)!.stoich;
                        jacRows[s].get(j)!.push({ rxnIdx: r, coeff: netStoichI * reactantStoichJ });
                    }
                }
            }

            const jacRowPtr = new Int32Array(nSpecies + 1);
            let totalJacEntries = 0;
            for (let i = 0; i < nSpecies; i++) {
                jacRowPtr[i] = totalJacEntries;
                totalJacEntries += jacRows[i].size;
            }
            jacRowPtr[nSpecies] = totalJacEntries;

            const jacColIdx = new Int32Array(totalJacEntries);
            const jacContribOffsets = new Int32Array(totalJacEntries + 1);
            
            let totalContribEntries = 0;
            for (let i = 0; i < nSpecies; i++) {
                const rowMap = jacRows[i];
                totalContribEntries += Array.from(rowMap.values()).reduce((sum, list) => sum + list.length, 0);
            }

            const jacContribRxnIdx = new Int32Array(totalContribEntries);
            const jacContribCoeffs = new Float64Array(totalContribEntries);

            let currentJacEntry = 0;
            let currentContribOffset = 0;

            for (let i = 0; i < nSpecies; i++) {
                const rowMap = jacRows[i];
                const sortedCols = Array.from(rowMap.keys()).sort((a, b) => a - b);
                
                for (const j of sortedCols) {
                    jacColIdx[currentJacEntry] = j;
                    jacContribOffsets[currentJacEntry] = currentContribOffset;
                    
                    const contribs = rowMap.get(j)!;
                    for (const contrib of contribs) {
                        jacContribRxnIdx[currentContribOffset] = contrib.rxnIdx;
                        jacContribCoeffs[currentContribOffset] = contrib.coeff;
                        currentContribOffset++;
                    }
                    currentJacEntry++;
                }
            }
            jacContribOffsets[totalJacEntries] = currentContribOffset;

            return {
                nReactions,
                nSpecies,
                rateConstants,
                nReactantsPerRxn,
                reactantOffsets,
                reactantIdx,
                reactantStoich,
                scalingVolumes,
                speciesOffsets,
                speciesRxnIdx,
                speciesStoich,
                speciesVolumes: speciesVolumes || new Float64Array(nSpecies).fill(1.0),
                jacRowPtr,
                jacColIdx,
                jacContribOffsets,
                jacContribRxnIdx,
                jacContribCoeffs
            };
        } catch (error) {
            console.error('[JITCompiler] Failed to compile bytecode:', error);
            return null;
        }
    }

    /**
     * Clear the compilation cache
     */
    clearCache(): void {
        this.cache.clear();
        console.log('[JITCompiler] Cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { size: number; maxSize: number } {
        return {
            size: this.cache.size,
            maxSize: this.maxCacheSize
        };
    }
}

// Singleton instance
export const jitCompiler = new JITCompiler();

/**
 * Helper: Convert species name array to index map
 */
export function createSpeciesIndexMap(speciesNames: string[]): Map<string, number> {
    const map = new Map<string, number>();
    speciesNames.forEach((name, idx) => map.set(name, idx));
    return map;
}
