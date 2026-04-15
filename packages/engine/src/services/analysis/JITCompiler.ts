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
import { OpCode } from '../simulation/ExpressionCompiler';
import { SafeExpressionEvaluator } from '../../utils/safeExpressionEvaluator';
import jsep from 'jsep';

const OP_STOP = 0xFF;
const OP_PUSH_CONST = OpCode.PUSH_CONST;
const OP_PUSH_SPEC = OpCode.PUSH_SPEC;
const OP_PUSH_OBS = OpCode.PUSH_OBS;
const OP_ADD = OpCode.ADD;
const OP_SUB = OpCode.SUB;
const OP_MUL = OpCode.MUL;
const OP_DIV = OpCode.DIV;
const OP_POW = OpCode.POW;
const OP_NEG = OpCode.NEG;
const OP_EXP = OpCode.EXP;
const OP_LOG = OpCode.LOG;
const OP_LOG10 = OpCode.LOG10;
const OP_SQRT = OpCode.SQRT;
const OP_ABS = OpCode.ABS;
const OP_SIN = OpCode.SIN;
const OP_COS = OpCode.COS;
const OP_CEIL = OpCode.CEIL;
const OP_FLOOR = OpCode.FLOOR;
const OP_ROUND = OpCode.ROUND;
const OP_TAN = OpCode.TAN;
const OP_ASIN = OpCode.ASIN;
const OP_ACOS = OpCode.ACOS;
const OP_ATAN = OpCode.ATAN;
const OP_MAX = OpCode.MAX;
const OP_MIN = OpCode.MIN;
const OP_IF_ELSE = OpCode.IF_ELSE;
const OP_LT = OpCode.LT;
const OP_GT = OpCode.GT;
const OP_LE = OpCode.LE;
const OP_GE = OpCode.GE;
const OP_EQ = OpCode.EQ;
const OP_NE = OpCode.NE;
const OP_AND = OpCode.AND;
const OP_OR = OpCode.OR;
const OP_NOT = OpCode.NOT;

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

    // --- Functional Rate Extensions ---
    nObservables: number;
    obsOffsets: Int32Array;
    obsSpeciesIdx: Int32Array;
    obsCoeffs: Float64Array;

    exprBytecodeOffsets: Int32Array;
    exprBytecode: Uint8Array;
    exprConstants: Float64Array;
    requiresParameterRebuild?: boolean;
}

/**
 * Source map entry: maps compiled bytecode regions back to BNGL source
 */
export interface ODEMappingEntry {
    reactionIndex: number;
    ruleName: string;
    reactants: string[];
    products: string[];
    rateConstant: number;
    lineNumber?: number;
}

export interface ODESourceMap {
    modelName: string;
    entries: ODEMappingEntry[];
    generatedAt: string;
    version: string;
}

export interface JITObservableDefinition {
    name: string;
    indices: Int32Array | number[];
    coefficients: Float64Array | number[];
    volumes?: Float64Array | number[];
}

export type CompiledObservableEvaluator = (
    y: Float64Array,
    output: Float64Array,
    speciesVolumes?: Float64Array
) => void;

export interface JITCompiledObservableFunction {
    evaluate: CompiledObservableEvaluator;
    sourceCode: string;
    nObservables: number;
    compiledAt: number;
}

interface JITFunctionDefinition {
    name: string;
    args: string[];
    expression: string;
}

/**
 * Compiled RHS function type
 */
export type CompiledRHS = (t: number, y: Float64Array, dydt: Float64Array, speciesVolumes?: Float64Array) => void;

/**
 * JIT compilation result
 */
export interface JITCompiledFunction {
    evaluate: CompiledRHS;
    sourceCode: string;
    nSpecies: number;
    nReactions: number;
    compiledAt: number;
    updateParameters?: (parameters?: Record<string, number>) => void;
    parameterNames?: string[];
}

/**
 * JIT Compiler for ODE RHS functions
 */
export class JITCompiler {
    private cache: Map<string, JITCompiledFunction> = new Map();
    private observableCache: Map<string, JITCompiledObservableFunction> = new Map();
    private maxCacheSize: number = 50;

    private hashString(value: string): string {
        let hash = 2166136261;
        for (let i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16);
    }

    private buildReactionSignature(
        reactions: Array<{
            reactantIndices: Array<number | string>;
            reactantStoich: number[];
            productIndices: Array<number | string>;
            productStoich: number[];
            rateConstant: number | string;
            scalingVolume?: number;
            totalRate?: boolean;
        }>,
        nSpecies: number,
        parameterNames: string[],
        constantSpeciesMask?: boolean[]
    ): string {
        const parts: string[] = [`n=${nSpecies}`, `p=${parameterNames.join(',')}`];
        if (constantSpeciesMask && constantSpeciesMask.length > 0) {
            parts.push(`c=${constantSpeciesMask.map((value) => (value ? '1' : '0')).join('')}`);
        }
        for (const reaction of reactions) {
            parts.push([
                reaction.reactantIndices.join(','),
                reaction.reactantStoich.join(','),
                reaction.productIndices.join(','),
                reaction.productStoich.join(','),
                String(reaction.rateConstant),
                String(reaction.scalingVolume ?? 1),
                reaction.totalRate ? '1' : '0'
            ].join('|'));
        }
        return this.hashString(parts.join(';'));
    }

    private buildParameterVector(parameterNames: string[], parameters?: Record<string, number>): Float64Array {
        const values = new Float64Array(parameterNames.length);
        for (let i = 0; i < parameterNames.length; i++) {
            const rawValue = parameters?.[parameterNames[i]];
            values[i] = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : 0;
        }
        return values;
    }

    private updateParameterVector(target: Float64Array, parameterNames: string[], parameters?: Record<string, number>): void {
        for (let i = 0; i < parameterNames.length; i++) {
            const rawValue = parameters?.[parameterNames[i]];
            target[i] = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : 0;
        }
    }

    private extractParameterNames(parameters?: Record<string, number>): string[] {
        return parameters ? Object.keys(parameters).sort() : [];
    }

    private normalizeExpressionForValidation(expr: string): string {
        return expr.replace(/\^/g, '**').replace(/\bMath\./g, '');
    }

    private assertSafeRateExpression(expr: string, parameterNames: string[]): void {
        const normalizedExpr = this.normalizeExpressionForValidation(expr);
        try {
            // compile() validates syntax, AST allowlist, and unknown variables.
            SafeExpressionEvaluator.compile(normalizedExpr, parameterNames);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(`[JITCompiler] Security Error: ${reason} (rate: ${expr})`);
        }
    }

    private normalizeSpeciesIndex(
        rawIndex: number | string,
        nSpecies: number,
        reactionIndex: number,
        role: 'reactant' | 'product',
        termIndex: number
    ): number {
        const normalized = typeof rawIndex === 'string' ? Number.parseInt(rawIndex, 10) : rawIndex;
        if (!Number.isInteger(normalized) || normalized < 0 || normalized >= nSpecies) {
            throw new Error(
                `[JITCompiler] Invalid ${role} species index at reaction ${reactionIndex}, term ${termIndex}: ${String(rawIndex)}`
            );
        }
        return normalized;
    }

    /**
     * Maximum number of observables per JIT-compiled chunk.
     * Each chunk stays within V8 TurboFan's optimization threshold
     * (~1000-2000 operations). With ~15-20 terms per observable,
     * 64 observables yields ~960-1280 operations per function.
     */
    static readonly OBSERVABLE_CHUNK_SIZE = 64;

    compileObservables(
        observables: JITObservableDefinition[],
        nSpecies: number,
        useAmounts: boolean
    ): JITCompiledObservableFunction {
        const signature = JSON.stringify({
            nSpecies,
            useAmounts,
            observables: observables.map((obs) => ({
                i: Array.from(obs.indices),
                c: Array.from(obs.coefficients),
                v: obs.volumes ? Array.from(obs.volumes) : null
            }))
        });

        const cached = this.observableCache.get(signature);
        if (cached) {
            return cached;
        }

        const chunkSize = JITCompiler.OBSERVABLE_CHUNK_SIZE;
        const needsChunking = observables.length > chunkSize;

        let evaluate: CompiledObservableEvaluator;
        let fullSource: string;

        if (needsChunking) {
            // Chunked compilation: split observables into multiple functions
            // to stay within V8 TurboFan's optimization threshold
            const compiledResult = this.compileObservablesChunked(observables, nSpecies, useAmounts, chunkSize);
            evaluate = compiledResult.evaluate;
            fullSource = compiledResult.sourceCode;
        } else {
            // Single function for small observable counts
            const compiledResult = this.compileObservablesSingle(observables, nSpecies, useAmounts, 0);
            evaluate = compiledResult.evaluate;
            fullSource = compiledResult.sourceCode;
        }

        const result: JITCompiledObservableFunction = {
            evaluate,
            sourceCode: fullSource,
            nObservables: observables.length,
            compiledAt: Date.now()
        };

        if (this.observableCache.size >= this.maxCacheSize) {
            const firstKey = this.observableCache.keys().next().value;
            if (firstKey !== undefined) this.observableCache.delete(firstKey);
        }
        this.observableCache.set(signature, result);

        return result;
    }

    /**
     * Compile a single chunk of observables into one function.
     * The outputOffset parameter controls which output[] indices this chunk writes to.
     */
    private compileObservablesSingle(
        observables: JITObservableDefinition[],
        nSpecies: number,
        useAmounts: boolean,
        outputOffset: number
    ): { evaluate: CompiledObservableEvaluator; sourceCode: string } {
        let source = '';
        source += `if (!speciesVolumes) { speciesVolumes = new Float64Array(${nSpecies}); speciesVolumes.fill(1.0); }\n`;

        for (let i = 0; i < observables.length; i++) {
            const obs = observables[i];
            const terms: string[] = [];
            for (let j = 0; j < obs.indices.length; j++) {
                const idx = this.normalizeSpeciesIndex(obs.indices[j], nSpecies, outputOffset + i, 'reactant', j);
                const coeff = Number(obs.coefficients[j]);
                const explicitVolume = obs.volumes && j < obs.volumes.length ? Number(obs.volumes[j]) : null;
                const volumeExpr = explicitVolume === null || Number.isNaN(explicitVolume)
                    ? `speciesVolumes[${idx}]`
                    : `${explicitVolume}`;
                const speciesExpr = useAmounts
                    ? `(y[${idx}] * ${volumeExpr})`
                    : `y[${idx}]`;
                terms.push(`(${speciesExpr}) * ${coeff}`);
            }

            source += `output[${outputOffset + i}] = ${terms.length > 0 ? terms.join(' + ') : '0.0'};\n`;
        }

        const fullSource = `(function(y, output, speciesVolumes) {\n${source}})`;

        let evaluate: CompiledObservableEvaluator;
        try {
            evaluate = eval(fullSource) as CompiledObservableEvaluator;
        } catch (error) {
            console.error('[JITCompiler] Failed to compile observable evaluator chunk:', error);
            evaluate = this.buildFallbackEvaluator(observables, nSpecies, useAmounts, outputOffset);
        }

        return { evaluate, sourceCode: fullSource };
    }

    /**
     * Compile observables in chunks, each staying within V8 TurboFan limits.
     * Returns a composite evaluator that calls each chunk sequentially.
     */
    private compileObservablesChunked(
        observables: JITObservableDefinition[],
        nSpecies: number,
        useAmounts: boolean,
        chunkSize: number
    ): { evaluate: CompiledObservableEvaluator; sourceCode: string } {
        const chunks: CompiledObservableEvaluator[] = [];
        const sourceParts: string[] = [];

        for (let offset = 0; offset < observables.length; offset += chunkSize) {
            const end = Math.min(offset + chunkSize, observables.length);
            const chunkObs = observables.slice(offset, end);
            const compiled = this.compileObservablesSingle(chunkObs, nSpecies, useAmounts, offset);
            chunks.push(compiled.evaluate);
            sourceParts.push(`// Chunk ${Math.floor(offset / chunkSize)} (observables ${offset}-${end - 1})\n${compiled.sourceCode}`);
        }

        // Composite evaluator: call each chunk sequentially
        const evaluate: CompiledObservableEvaluator = (y, output, speciesVolumes) => {
            for (let c = 0; c < chunks.length; c++) {
                chunks[c](y, output, speciesVolumes);
            }
        };

        return { evaluate, sourceCode: sourceParts.join('\n\n') };
    }

    /**
     * Build an interpreted fallback evaluator for a chunk of observables.
     */
    private buildFallbackEvaluator(
        observables: JITObservableDefinition[],
        nSpecies: number,
        useAmounts: boolean,
        outputOffset: number
    ): CompiledObservableEvaluator {
        return (y, output, speciesVolumes) => {
            const fallbackVolumes = speciesVolumes ?? new Float64Array(nSpecies).fill(1.0);
            for (let i = 0; i < observables.length; i++) {
                let sum = 0;
                const obs = observables[i];
                for (let j = 0; j < obs.indices.length; j++) {
                    const idx = Number(obs.indices[j]);
                    const coeff = Number(obs.coefficients[j]);
                    const explicitVolume = obs.volumes && j < obs.volumes.length ? Number(obs.volumes[j]) : fallbackVolumes[idx];
                    const value = useAmounts ? (y[idx] * explicitVolume) : y[idx];
                    sum += value * coeff;
                }
                output[outputOffset + i] = sum;
            }
        };
    }



    /**
     * Compile a reaction network into an optimized RHS function
     */
    compile(
        reactions: Array<{
            reactantIndices: Array<number | string>;
            reactantStoich: number[];
            productIndices: Array<number | string>;
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
        const parameterNames = this.extractParameterNames(parameters);
        const configSignature = this.buildReactionSignature(reactions, nSpecies, parameterNames, constantSpeciesMask);

        const cached = this.cache.get(configSignature);
        if (cached) {
            cached.updateParameters?.(parameters);
            return cached;
        }

        // Build the function source code
        let source = '';

        const isConstantSpecies = (idx: number): boolean =>
            !!constantSpeciesMask && idx >= 0 && idx < constantSpeciesMask.length && !!constantSpeciesMask[idx];

        for (let i = 0; i < parameterNames.length; i++) {
            const name = parameterNames[i];
            if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
                source += `const ${name} = params[${i}];\n`;
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
            let rateExpr: string;
            if (typeof rxn.rateConstant === 'number') {
                rateExpr = rxn.rateConstant.toString();
            } else {
                const rxnStr = rxn.rateConstant.toString();
                // Security check before translating and interpolating
                this.assertSafeRateExpression(rxnStr, parameterNames);
                rateExpr = `(${ExpressionTranslator.translate(rxnStr).replace(/\bt\b/g, '__t__')})`; // Expression in parentheses for safety
            }

            // NOTE: BNG2 network simulations (ODE) do not implement TotalRate; treat as standard mass action.
            for (let j = 0; j < rxn.reactantIndices.length; j++) {
                const idx = this.normalizeSpeciesIndex(rxn.reactantIndices[j], nSpecies, i, 'reactant', j);
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
                const idx = this.normalizeSpeciesIndex(rxn.reactantIndices[j], nSpecies, i, 'reactant', j);
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
                const idx = this.normalizeSpeciesIndex(rxn.productIndices[j], nSpecies, i, 'product', j);
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
        const fullSource = `(function(params) {\nreturn function(__t__, y, dydt, speciesVolumes) {\n${source}}\n})`;

        let evaluate: CompiledRHS;
        const parameterVector = this.buildParameterVector(parameterNames, parameters);
        try {
            const factory = eval(fullSource) as (params: Float64Array) => CompiledRHS;
            evaluate = factory(parameterVector);
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
            compiledAt: Date.now(),
            parameterNames,
            updateParameters: (nextParameters?: Record<string, number>) => {
                this.updateParameterVector(parameterVector, parameterNames, nextParameters);
            }
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
        speciesIndexMap: Map<string, number>,
        parameters?: Record<string, number>
    ): JITCompiledFunction {
        const resolveSpeciesIndex = (rawIndex: number | string): number => {
            if (typeof rawIndex === 'number' && Number.isInteger(rawIndex)) {
                return rawIndex;
            }

            const normalized = String(rawIndex).trim();
            const mappedIndex = speciesIndexMap.get(normalized);
            if (mappedIndex === undefined) {
                throw new Error(`[JITCompiler] Unknown species reference: ${normalized}`);
            }
            return mappedIndex;
        };

        // Convert Rxn to simpler format
        const simpleReactions = reactions.map(rxn => {
            const reactantIndices: number[] = [];
            const reactantStoich: number[] = [];
            const productIndices: number[] = [];
            const productStoich: number[] = [];

            // Process reactants
            const reactantCounts = new Map<number, number>();
            for (const rawIdx of rxn.reactants as Array<number | string>) {
                const idx = resolveSpeciesIndex(rawIdx);
                reactantCounts.set(idx, (reactantCounts.get(idx) || 0) + 1);
            }
            for (const [idx, count] of reactantCounts) {
                reactantIndices.push(idx);
                reactantStoich.push(count);
            }

            // Process products
            const productCounts = new Map<number, number>();
            for (const rawIdx of rxn.products as Array<number | string>) {
                const idx = resolveSpeciesIndex(rawIdx);
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
                statisticalFactor: rxn.statFactor // BNG2 parity: symbolic rates scale by statFactor
            };
        });

        return this.compile(simpleReactions, nSpecies, parameters);
    }

    /**
     * Compile a reaction network into a compact bytecode representation for WASM interpretation.
     * Returns null if any reaction uses a complex rate expression that cannot be pre-evaluated.
     */
    public compileToByteCode(
        reactions: Array<{
            reactantIndices: Array<number | string>;
            reactantStoich: number[];
            productIndices: Array<number | string>;
            productStoich: number[];
            rateConstant: number | string;
            scalingVolume?: number;
            statisticalFactor?: number;
            totalRate?: boolean;
        }>,
        nSpecies: number,
        parameters?: Record<string, number>,
        speciesVolumes?: Float64Array,
        constantSpeciesMask?: boolean[],
        observables?: Array<{
            name: string;
            indices: Int32Array | number[];
            coefficients: Float64Array | number[];
        }>,
        speciesNames?: string[],
        functions?: JITFunctionDefinition[]
    ): NetworkByteCode | null {
        const isConstant = (idx: number): boolean =>
            !!constantSpeciesMask && idx >= 0 && idx < constantSpeciesMask.length && !!constantSpeciesMask[idx];

        try {
            // 1. Prepare observables
            const nObservables = observables?.length || 0;
            const obsOffsets = new Int32Array(nObservables + 1);
            let totalObsEntries = 0;
            (observables || []).forEach(obs => totalObsEntries += obs.indices.length);

            const obsSpeciesIdx = new Int32Array(totalObsEntries);
            const obsCoeffs = new Float64Array(totalObsEntries);

            let currentObsOffset = 0;
            (observables || []).forEach((obs, i) => {
                obsOffsets[i] = currentObsOffset;
                for (let j = 0; j < obs.indices.length; j++) {
                    obsSpeciesIdx[currentObsOffset] = obs.indices[j];
                    obsCoeffs[currentObsOffset] = obs.coefficients[j];
                    currentObsOffset++;
                }
            });
            obsOffsets[nObservables] = currentObsOffset;

            // Validate parameter keys to prevent object destructuring injection.
            // For parity robustness, ignore invalid keys instead of failing the whole JIT pass.
            const allParamKeys = Object.keys(parameters || {});
            const paramKeys = allParamKeys.filter((key) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key));
            const safeParameters: Record<string, number> = {};
            for (const key of paramKeys) {
                safeParameters[key] = (parameters as Record<string, number>)[key];
            }
            if (allParamKeys.length !== paramKeys.length) {
                console.warn(
                    `[JITCompiler] Ignoring ${allParamKeys.length - paramKeys.length} invalid parameter key(s) during bytecode compilation`
                );
            }

            const nReactions = reactions.length;
            const rateConstants = new Float64Array(nReactions);
            const nReactantsPerRxn = new Int32Array(nReactions);
            const scalingVolumes = new Float64Array(nReactions);

            // Bytecode storage
            const exprBytecodeOffsets = new Int32Array(nReactions + 1);
            const bytecodeChunks: Uint8Array[] = [];
            let totalBytecodeLen = 0;
            let requiresParameterRebuild = false;

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
                exprBytecodeOffsets[i] = totalBytecodeLen;
                let hasExpressionBytecode = false;

                // Check for functional or parameterized rate bytecode
                if (typeof rxn.rateConstant === 'string') {
                    const bc = this.compileExpressionToBytecode(
                        rxn.rateConstant,
                        safeParameters,
                        speciesNames || [],
                        (observables || []).map(o => o.name),
                        functions
                    );
                    if (bc) {
                        bytecodeChunks.push(bc.bytecode);
                        totalBytecodeLen += bc.bytecode.length;
                        requiresParameterRebuild ||= bc.usesParameters;
                        hasExpressionBytecode = true;
                    }
                }

                // Pre-evaluate rate constant (for mass-action part or simple constants)
                let k: number;
                if (typeof rxn.rateConstant === 'number') {
                    k = rxn.rateConstant;
                } else {
                    if (hasExpressionBytecode) {
                        k = 0;
                    } else {
                        // Try to evaluate expression
                        const rxnStr = rxn.rateConstant.toString();
                        this.assertSafeRateExpression(rxnStr, paramKeys);
                        const translated = ExpressionTranslator.translate(rxnStr);
                        // Avoid collisions with the time variable parameter by using a unique placeholder
                        const translatedSafe = translated.replace(/\bt\b/g, '__t__');

                        // Simple evaluation for parameters
                        try {
                            const evaluator = new Function('params', `const {${paramKeys.join(',')}} = params; return ${translatedSafe};`);
                            k = evaluator(safeParameters);
                            if (isNaN(k) || !isFinite(k)) return null;
                        } catch (e) {
                            return null; // Contains y[i] or other non-constant terms
                        }
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
                    reactantIdx[currentReactantOffset] = this.normalizeSpeciesIndex(rxn.reactantIndices[j], nSpecies, i, 'reactant', j);
                    reactantStoich[currentReactantOffset] = rxn.reactantStoich[j];
                    currentReactantOffset++;
                }
            }
            exprBytecodeOffsets[nReactions] = totalBytecodeLen;
            reactantOffsets[nReactions] = currentReactantOffset;

            // Stoichiometry matrix conversion (CSC-like)
            const speciesRxnEntries: Array<{ rxnIdx: number; stoich: number }>[] = Array.from({ length: nSpecies }, () => []);
            for (let r = 0; r < nReactions; r++) {
                const rxn = reactions[r];
                // Reactants
                for (let j = 0; j < rxn.reactantIndices.length; j++) {
                    const s = this.normalizeSpeciesIndex(rxn.reactantIndices[j], nSpecies, r, 'reactant', j);
                    if (isConstant(s)) continue;
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
                    const s = this.normalizeSpeciesIndex(rxn.productIndices[j], nSpecies, r, 'product', j);
                    if (isConstant(s)) continue;
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
                    const j = this.normalizeSpeciesIndex(rxn.reactantIndices[i_r], nSpecies, r, 'reactant', i_r); // Species the rate depends on
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

            const exprBytecode = new Uint8Array(totalBytecodeLen);
            let currentByteOffset = 0;
            for (const chunk of bytecodeChunks) {
                exprBytecode.set(chunk, currentByteOffset);
                currentByteOffset += chunk.length;
            }


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
                jacContribCoeffs,
                nObservables,
                obsOffsets,
                obsSpeciesIdx,
                obsCoeffs,
                exprBytecodeOffsets,
                exprBytecode,
                exprConstants: new Float64Array(0),
                requiresParameterRebuild
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
        this.observableCache.clear();
        console.log('[JITCompiler] Cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { size: number; maxSize: number } {
        return {
            size: this.cache.size + this.observableCache.size,
            maxSize: this.maxCacheSize
        };
    }

    private compileExpressionToBytecode(
        expr: string,
        parameters: Record<string, number>,
        speciesNames: string[],
        observableNames: string[],
        functions?: JITFunctionDefinition[]
    ): { bytecode: Uint8Array; usesParameters: boolean } | null {
        try {
            const expandedExpr = this.normalizeExpressionForValidation(
                this.expandZeroArgFunctions(expr, functions)
            );
            const ast = jsep(expandedExpr);
            const bytes: number[] = [];
            let usesParameters = false;
            const speciesIndexByName = new Map<string, number>();
            speciesNames.forEach((name, index) => speciesIndexByName.set(name, index));

            const walk = (node: any) => {
                if (node.type === 'Literal') {
                    bytes.push(OP_PUSH_CONST);
                    const buf = new ArrayBuffer(8);
                    new Float64Array(buf)[0] = node.value;
                    bytes.push(...new Uint8Array(buf));
                } else if (node.type === 'Identifier') {
                    // Support common global constants used in BNGL expressions
                    if (node.name === 'NaN') {
                        bytes.push(OP_PUSH_CONST);
                        const buf = new ArrayBuffer(8);
                        new Float64Array(buf)[0] = NaN;
                        bytes.push(...new Uint8Array(buf));
                        return;
                    }
                    if (node.name === 'Infinity') {
                        bytes.push(OP_PUSH_CONST);
                        const buf = new ArrayBuffer(8);
                        new Float64Array(buf)[0] = Infinity;
                        bytes.push(...new Uint8Array(buf));
                        return;
                    }

                    const speciesIdx = speciesIndexByName.get(node.name);
                    if (speciesIdx !== undefined) {
                        bytes.push(OP_PUSH_SPEC);
                        const buf = new ArrayBuffer(4);
                        new Int32Array(buf)[0] = speciesIdx;
                        bytes.push(...new Uint8Array(buf));
                        return;
                    }
                    const obsIdx = observableNames.indexOf(node.name);
                    if (obsIdx >= 0) {
                        bytes.push(OP_PUSH_OBS);
                        const buf = new ArrayBuffer(4);
                        new Int32Array(buf)[0] = obsIdx;
                        bytes.push(...new Uint8Array(buf));
                        return;
                    }
                    if (Object.prototype.hasOwnProperty.call(parameters, node.name)) {
                        bytes.push(OP_PUSH_CONST);
                        const buf = new ArrayBuffer(8);
                        new Float64Array(buf)[0] = parameters[node.name];
                        bytes.push(...new Uint8Array(buf));
                        usesParameters = true;
                        return;
                    }
                    throw new Error(`Unknown identifier: ${node.name}`);
                } else if (node.type === 'MemberExpression') {
                    if (node.object?.type === 'Identifier' && node.object.name === 'y' && node.property?.type === 'Literal') {
                        bytes.push(OP_PUSH_SPEC);
                        const buf = new ArrayBuffer(4);
                        new Int32Array(buf)[0] = Number(node.property.value);
                        bytes.push(...new Uint8Array(buf));
                        return;
                    }
                    throw new Error(`Unsupported member expression in ${expandedExpr}`);
                } else if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
                    walk(node.left);
                    walk(node.right);
                    if (node.operator === '+') bytes.push(OP_ADD);
                    else if (node.operator === '-') bytes.push(OP_SUB);
                    else if (node.operator === '*') bytes.push(OP_MUL);
                    else if (node.operator === '/') bytes.push(OP_DIV);
                    else if (node.operator === '^' || node.operator === '**') bytes.push(OP_POW);
                    else if (node.operator === '<') bytes.push(OP_LT);
                    else if (node.operator === '>') bytes.push(OP_GT);
                    else if (node.operator === '<=') bytes.push(OP_LE);
                    else if (node.operator === '>=') bytes.push(OP_GE);
                    else if (node.operator === '==') bytes.push(OP_EQ);
                    else if (node.operator === '!=') bytes.push(OP_NE);
                    else if (node.operator === '&&') bytes.push(OP_AND);
                    else if (node.operator === '||') bytes.push(OP_OR);
                    else throw new Error(`Unsupported binary operator: ${node.operator}`);
                } else if (node.type === 'UnaryExpression') {
                    walk(node.argument);
                    if (node.operator === '-') bytes.push(OP_NEG);
                    else if (node.operator === '!') bytes.push(OP_NOT);
                    else throw new Error(`Unsupported unary operator: ${node.operator}`);
                } else if (node.type === 'CallExpression') {
                    const name = node.callee.name.toLowerCase();
                    if (name === 'sat') {
                        if ((node.arguments?.length ?? 0) !== 2) {
                            throw new Error('sat() expects 2 arguments');
                        }
                        // sat(a,b) = a / (a + b)
                        walk(node.arguments[0]);
                        walk(node.arguments[0]);
                        walk(node.arguments[1]);
                        bytes.push(OP_ADD);
                        bytes.push(OP_DIV);
                        return;
                    }
                    node.arguments.forEach((arg: any) => walk(arg));
                    if (name === 'log' || name === 'ln') bytes.push(OP_LOG);
                    else if (name === 'exp') bytes.push(OP_EXP);
                    else if (name === 'log10') bytes.push(OP_LOG10);
                    else if (name === 'sqrt') bytes.push(OP_SQRT);
                    else if (name === 'abs') bytes.push(OP_ABS);
                    else if (name === 'sin') bytes.push(OP_SIN);
                    else if (name === 'cos') bytes.push(OP_COS);
                    else if (name === 'ceil') bytes.push(OP_CEIL);
                    else if (name === 'floor') bytes.push(OP_FLOOR);
                    else if (name === 'rint' || name === 'round') bytes.push(OP_ROUND);
                    else if (name === 'tan') bytes.push(OP_TAN);
                    else if (name === 'asin') bytes.push(OP_ASIN);
                    else if (name === 'acos') bytes.push(OP_ACOS);
                    else if (name === 'atan') bytes.push(OP_ATAN);
                    else if (name === 'max') bytes.push(OP_MAX);
                    else if (name === 'min') bytes.push(OP_MIN);
                    else if (name === 'if') bytes.push(OP_IF_ELSE);
                    else if (name === 'not') bytes.push(OP_NOT);
                    else if (name === 'pow') bytes.push(OP_POW);
                    else throw new Error(`Unknown function: ${name}`);
                } else {
                    throw new Error(`Unsupported AST node: ${node.type}`);
                }
            };

            walk(ast);
            bytes.push(OP_STOP);
            return { bytecode: new Uint8Array(bytes), usesParameters };
        } catch (e) {
            console.warn('[JITCompiler] Bytecode compilation failed:', e);
            return null;
        }
    }

    private expandZeroArgFunctions(expr: string, functions?: JITFunctionDefinition[]): string {
        if (!functions || functions.length === 0) return expr;

        let expanded = expr;
        for (let pass = 0; pass < 10; pass++) {
            let changed = false;
            for (const func of functions) {
                if ((func.args?.length ?? 0) !== 0) continue;

                const withParens = new RegExp(`\\b${func.name}\\s*\\(\\s*\\)`, 'g');
                if (withParens.test(expanded)) {
                    expanded = expanded.replace(withParens, `(${func.expression})`);
                    changed = true;
                }

                const bareName = new RegExp(`\\b${func.name}\\b(?!\\s*\\()`, 'g');
                if (bareName.test(expanded)) {
                    expanded = expanded.replace(bareName, `(${func.expression})`);
                    changed = true;
                }
            }
            if (!changed) break;
        }

        return expanded;
    }

    /**
     * Generate a source map from compiled function back to BNGL rules
     */
    generateSourceMap(
        compiledFn: JITCompiledFunction,
        reactions: Array<{
            reactantIndices: Array<number | string>;
            productIndices: Array<number | string>;
            rateConstant: number | string;
            ruleName?: string;
            lineNumber?: number;
        }>,
        speciesNames: string[],
        modelName?: string
    ): ODESourceMap {
        const entries: ODEMappingEntry[] = [];

        for (let i = 0; i < reactions.length; i++) {
            const rxn = reactions[i];
            const reactants = rxn.reactantIndices
                .map((idx, j) => typeof idx === 'string' ? idx : speciesNames[idx] ?? `s${idx}`)
                .filter((_, j) => j < (rxn.reactantIndices as unknown[]).length);
            const products = rxn.productIndices
                .map((idx, j) => typeof idx === 'string' ? idx : speciesNames[idx] ?? `s${idx}`)
                .filter((_, j) => j < (rxn.productIndices as unknown[]).length);

            entries.push({
                reactionIndex: i,
                ruleName: rxn.ruleName ?? `reaction_${i}`,
                reactants,
                products,
                rateConstant: typeof rxn.rateConstant === 'number' ? rxn.rateConstant : 0,
                lineNumber: rxn.lineNumber,
            });
        }

        return {
            modelName: modelName ?? 'unknown',
            entries,
            generatedAt: new Date().toISOString(),
            version: '1.0.0',
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
