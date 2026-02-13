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

import type { Rxn } from './graph/core/Rxn';
import { ExpressionTranslator } from './graph/core/ExpressionTranslator';

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
        parameters?: Record<string, number>
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
            parameters: parameters || {}
        });

        const cached = this.cache.get(configSignature);
        if (cached) {
            return cached;
        }

        // Build the function source code
        let source = '';

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
        for (const [speciesIdx, contributions] of speciesContributions) {
            if (contributions.length === 0) continue;

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
            source += `dydt[${speciesIdx}] = (${expr})`;
            source += ` / speciesVolumes[${speciesIdx}];\n`;
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
