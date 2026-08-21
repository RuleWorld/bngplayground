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
import { getFeatureFlags } from '../../featureFlags';
import jsep from 'jsep';

import { SAFE_BODY_CHARS, createCompiledFunction } from '../../utils/safeFunctionCompiler';
import { isJITSafe } from '../simulation/ExpressionEvaluator.ts';
import {
    OP_STOP,
    OP_PUSH_CONST,
    OP_PUSH_SPEC,
    OP_PUSH_OBS,
    OP_ADD,
    OP_SUB,
    OP_MUL,
    OP_DIV,
    OP_POW,
    OP_NEG,
    OP_EXP,
    OP_LOG,
    OP_SQRT,
    OP_ABS,
    OP_SIN,
    OP_COS,
    OP_CEIL,
    OP_FLOOR,
    OP_ROUND,
    OP_TAN,
    OP_ASIN,
    OP_ACOS,
    OP_ATAN,
    OP_MAX,
    OP_MIN,
    OP_IF_ELSE,
    OP_LT,
    OP_GT,
    OP_LE,
    OP_GE,
    OP_EQ,
    OP_NE,
    OP_AND,
    OP_OR,
    OP_NOT,
} from '../simulation/opcodeAliases';

const OP_LOG10 = OpCode.LOG10;

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

export interface JITCompileDebugContext {
    modelName?: string;
    analysis?: string;
    parameterName?: string;
    callsite?: string;
}

/**
 * JIT Compiler for ODE RHS functions
 */
export class JITCompiler {
    private cache: Map<string, JITCompiledFunction> = new Map();
    private observableCache: Map<string, JITCompiledObservableFunction> = new Map();
    private bytecodeCache: Map<string, NetworkByteCode> = new Map();
    // Full generated source is the cache key, so reuse cannot cross networks or
    // folded rate constants. This avoids paying `new Function` compilation on
    // every SSA replicate while retaining exact arithmetic and evaluation order.
    private ssaPropensityCache: Map<string, (state: Float64Array, propensities: Float64Array) => number> = new Map();
    // Cache for compiled SSA event updaters, keyed on a full structural signature
    // string (not a hash) so there is zero risk of a collision returning a
    // function compiled for a different network. Persists across replicate runs
    // because jitCompiler is a module-level singleton (opts 8/9).
    private ssaEventUpdaterCache: Map<string, ((firedRxnIdx: number, state: Float64Array, propensities: Float64Array, fenwickAdd: (idx: number, delta: number) => void) => number) | null> = new Map();
    private maxCacheSize: number = 50;

    private hashString(value: string): string {
        let hash = 2166136261;
        for (let i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    private createFn(args: string[], body: string): Function {
        return createCompiledFunction(args, body);
    }

    /**
     * Validate a JIT source string and return it.
     * CodeQL tracks the return value (a new string) through data flow,
     * which closes the taint path from model input to `new Function`.
     */
    private sanitizeSource(s: string): string {
        if (!SAFE_BODY_CHARS.test(s)) {
            throw new Error(`Unsafe JIT source`);
        }
        return s;
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
        constantSpeciesMask?: boolean[],
        functions?: JITFunctionDefinition[]
    ): string {
        const parts: string[] = [`n=${nSpecies}`, `p=${parameterNames.join(',')}`];
        const fnSig = this.functionSignature(functions);
        if (fnSig) parts.push(`f=${fnSig}`);
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

    /**
     * Serialize zero-arg function definitions into a stable signature fragment.
     * Used to invalidate the JIT/bytecode caches when function bodies change.
     */
    private functionSignature(functions?: JITFunctionDefinition[]): string {
        if (!functions || functions.length === 0) return '';
        return functions
            .map((f) => `${f.name}(${f.args.join(',')})=${f.expression}`)
            .sort()
            .join('||');
    }

    private getBytecodeSignature(
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
        constantSpeciesMask?: boolean[],
        observables?: Array<{
            name: string;
            indices: Int32Array | number[];
            coefficients: Float64Array | number[];
        }>,
        functions?: JITFunctionDefinition[]
    ): string {
        const parts = [`n=${nSpecies}`];
        const fnSig = this.functionSignature(functions);
        if (fnSig) parts.push(`f=${fnSig}`);
        if (constantSpeciesMask && constantSpeciesMask.length > 0) {
            parts.push(`c=${constantSpeciesMask.map((value) => (value ? '1' : '0')).join('')}`);
        }
        if (observables) {
            for (const o of observables) {
                parts.push(`o=${o.name}|${o.indices.join(',')}|${o.coefficients.join(',')}`);
            }
        }
        for (const reaction of reactions) {
            const rateSig = typeof reaction.rateConstant === 'string' ? reaction.rateConstant : 'num';
            parts.push([
                reaction.reactantIndices.join(','),
                reaction.reactantStoich.join(','),
                reaction.productIndices.join(','),
                reaction.productStoich.join(','),
                rateSig,
                String(reaction.scalingVolume ?? 1),
                String(reaction.statisticalFactor ?? 1),
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
        return expr
            .replace(/\^/g, '**')
            .replace(/\bMath\./g, '')
            .replace(/\bt\b/g, '__t__');
    }

    private assertSafeRateExpression(expr: string, parameterNames: string[]): void {
        const normalizedExpr = this.normalizeExpressionForValidation(expr);
        const expressionVariableNames = [...parameterNames, '__t__'];
        try {
            // compile() validates syntax, AST allowlist, and unknown variables.
            SafeExpressionEvaluator.compile(normalizedExpr, expressionVariableNames);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(`[JITCompiler] Security Error: ${reason} (rate: ${expr})`, { cause: error });
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

        const evaluate = this.buildFallbackEvaluator(observables, nSpecies, useAmounts, outputOffset);

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
        constantSpeciesMask?: boolean[],
        debugContext?: JITCompileDebugContext,
        functions?: JITFunctionDefinition[]
    ): JITCompiledFunction {
        const parameterNames = this.extractParameterNames(parameters);
        const configSignature = this.buildReactionSignature(reactions, nSpecies, parameterNames, constantSpeciesMask, functions);

        const cached = this.cache.get(configSignature);
        if (cached) {
            cached.updateParameters?.(parameters);
            return cached;
        }

        // Build the function source code
        let source = '';

        const parameterVector = this.buildParameterVector(parameterNames, parameters);
        const parameterContext: Record<string, number> = {};
        for (let i = 0; i < parameterNames.length; i++) {
            parameterContext[parameterNames[i]] = parameterVector[i];
        }

        const rateEvaluators: Array<(ctx: Record<string, number>) => number> = new Array(reactions.length);
        const expressionVariableNames = [...parameterNames, '__t__'];

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
                rateEvaluators[i] = () => rxn.rateConstant as number;
            } else {
                const rxnStr = rxn.rateConstant.toString();
                // Inline zero-arg global functions (e.g. `phiM()`, `Stimulus()`) BEFORE
                // the security validation so legitimately-defined functions are not
                // rejected as unknown.
                const inlinedExpr = this.expandZeroArgFunctions(rxnStr, functions);
                // Security check before translating and interpolating
                this.assertSafeRateExpression(inlinedExpr, expressionVariableNames);
                const normalizedExpr = this.normalizeExpressionForValidation(inlinedExpr);
                rateEvaluators[i] = SafeExpressionEvaluator.compile(normalizedExpr, expressionVariableNames);
                rateExpr = `(${ExpressionTranslator.translate(inlinedExpr).replace(/\bt\b/g, '__t__')})`; // Expression in parentheses for safety
            }

            // NOTE: TotalRate is handled upstream during network expansion (NetworkGenerator
            // skips the statFactor/multiplicity baking for TotalRate rules, sf=1), so the rate
            // constant already reflects it and this mass-action term needs no adjustment.
            for (let j = 0; j < rxn.reactantIndices.length; j++) {
                const idx = this.normalizeSpeciesIndex(rxn.reactantIndices[j], nSpecies, i, 'reactant', j);
                const stoich = rxn.reactantStoich[j];
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
            // For concentration-based ODEs (y in M), the rate expression should
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

        const fallbackVolumes = new Float64Array(nSpecies);
        fallbackVolumes.fill(1.0);

        const evaluate: CompiledRHS = (_t, y, dydt, speciesVolumes) => {
            for (let i = 0; i < nSpecies; i++) dydt[i] = 0.0;

            const resolvedVolumes = speciesVolumes ?? fallbackVolumes;
            parameterContext.__t__ = _t;

            for (let i = 0; i < reactions.length; i++) {
                const rxn = reactions[i];
                let rate = rateEvaluators[i](parameterContext);
                if (!Number.isFinite(rate)) continue;

                if (typeof rxn.rateConstant !== 'number' && (rxn as any).statisticalFactor && (rxn as any).statisticalFactor !== 1) {
                    rate *= (rxn as any).statisticalFactor;
                }

                const vAnchor = rxn.scalingVolume || 1.0;
                let velocity = rate * vAnchor;

                for (let j = 0; j < rxn.reactantIndices.length; j++) {
                    const idx = this.normalizeSpeciesIndex(rxn.reactantIndices[j], nSpecies, i, 'reactant', j);
                    const stoich = rxn.reactantStoich[j];
                    const scale = resolvedVolumes[idx] / vAnchor;
                    const scaledY = y[idx] * scale;
                    if (stoich === 1) {
                        velocity *= scaledY;
                    } else if (stoich === 2) {
                        velocity *= scaledY * scaledY;
                    } else {
                        velocity *= Math.pow(scaledY, stoich);
                    }
                }

                for (let j = 0; j < rxn.reactantIndices.length; j++) {
                    const idx = this.normalizeSpeciesIndex(rxn.reactantIndices[j], nSpecies, i, 'reactant', j);
                    if (!isConstantSpecies(idx)) {
                        const stoich = rxn.reactantStoich[j];
                        dydt[idx] -= (velocity * stoich) / resolvedVolumes[idx];
                    }
                }

                for (let j = 0; j < rxn.productIndices.length; j++) {
                    const idx = this.normalizeSpeciesIndex(rxn.productIndices[j], nSpecies, i, 'product', j);
                    if (!isConstantSpecies(idx)) {
                        const stoich = rxn.productStoich[j];
                        dydt[idx] += (velocity * stoich) / resolvedVolumes[idx];
                    }
                }
            }
        };

        const result: JITCompiledFunction = {
            evaluate,
            sourceCode: fullSource,
            nSpecies,
            nReactions: reactions.length,
            compiledAt: Date.now(),
            parameterNames,
            updateParameters: (nextParameters?: Record<string, number>) => {
                this.updateParameterVector(parameterVector, parameterNames, nextParameters);
                for (let i = 0; i < parameterNames.length; i++) {
                    parameterContext[parameterNames[i]] = parameterVector[i];
                }
            }
        };

        // Manage cache size
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) this.cache.delete(firstKey);
        }
        this.cache.set(configSignature, result);

        console.log('[JITCompiler] Compiled RHS successfully', {
            modelName: debugContext?.modelName ?? 'unknown',
            analysis: debugContext?.analysis ?? 'unknown',
            parameterName: debugContext?.parameterName ?? 'n/a',
            callsite: debugContext?.callsite ?? 'unknown',
            nSpecies,
            nReactions: reactions.length,
            nParameters: parameterNames.length,
            configSignature,
        });

        return result;
    }

    /**
     * Compile from Rxn array (convenience method for integration with existing code)
     */
    compileFromRxns(
        reactions: Rxn[],
        nSpecies: number,
        speciesIndexMap: Map<string, number>,
        parameters?: Record<string, number>,
        debugContext?: JITCompileDebugContext,
        functions?: JITFunctionDefinition[]
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

        return this.compile(simpleReactions, nSpecies, parameters, undefined, debugContext, functions);
    }

    /**
     * Generates an optimized function for evaluating SSA propensities for mass-action models.
     * Generates a single function taking (state: Float64Array, propensities: Float64Array) => number.
     */
    public compileSSAPropensities(
        reactions: Array<{
            reactants: number[] | Int32Array;
            rateConstant: number;
            propensityFactor: number;
        }>,
        reactionReactingVolumes: Float64Array
    ): ((state: Float64Array, propensities: Float64Array) => number) | null {
        if (!getFeatureFlags().enableJitFastPath) {
            return null;
        }

        try {
            let source = "let aTotal = 0;\n";

            for (let i = 0; i < reactions.length; i++) {
                const rxn = reactions[i];
                const n = rxn.reactants.length;
                if (typeof rxn.rateConstant !== 'number' || !Number.isFinite(rxn.rateConstant)) {
                    throw new Error(`Invalid rateConstant: expected finite number, got ${typeof rxn.rateConstant}`);
                }
                if (typeof rxn.propensityFactor !== 'number' || !Number.isFinite(rxn.propensityFactor)) {
                    throw new Error(`Invalid propensityFactor: expected finite number, got ${typeof rxn.propensityFactor}`);
                }
                let a = rxn.rateConstant * rxn.propensityFactor;
                if (!Number.isFinite(a)) {
                    throw new Error(`Invalid computed rate: expected finite number, got ${a}`);
                }

                const volume = reactionReactingVolumes[i];
                if (!Number.isFinite(volume)) return null;
                if (n === 0) {
                    a *= volume;
                } else if (n === 2) {
                    a /= volume;
                } else if (n === 3) {
                    a /= (volume * volume);
                } else if (n > 3) {
                    a /= Math.pow(volume, n - 1);
                }

                let expr = String(a);
                for (let j = 0; j < n; j++) {
                    const idx = rxn.reactants[j];
                    if (typeof idx !== 'number' || !Number.isFinite(idx) || idx < 0 || Math.floor(idx) !== idx) {
                        throw new Error(`Invalid reactant index: ${idx}`);
                    }
                    expr += ` * state[${idx}]`;
                }

                source += `propensities[${i}] = ${expr};\n`;
                source += `aTotal += propensities[${i}];\n`;
            }

            const safeSource0 = this.sanitizeSource(source);
            const source0 = safeSource0 + "return aTotal;\n";
            const cached = this.ssaPropensityCache.get(source0);
            if (cached) return cached;

            const compiled = this.createFn(["state", "propensities"], source0) as
                (state: Float64Array, propensities: Float64Array) => number;
            if (this.ssaPropensityCache.size >= this.maxCacheSize) {
                const oldest = this.ssaPropensityCache.keys().next().value;
                if (oldest !== undefined) this.ssaPropensityCache.delete(oldest);
            }
            this.ssaPropensityCache.set(source0, compiled);
            return compiled;
        } catch (e) {
            console.warn('[JITCompiler] Failed to compile SSA propensities:', e);
            return null;
        }
    }

    public compileSSAPropensitiesWithFunctionalRates(
        reactions: Array<{
            reactants: number[] | Int32Array;
            rateConstant: number;
            propensityFactor: number;
            isFunctionalRate?: boolean;
            rateExpression?: string | null;
        }>,
        reactionReactingVolumes: Float64Array,
        parameters: Record<string, number>,
        observables: Array<{
            name: string;
            indices: Int32Array | number[];
            coefficients: Float64Array | number[];
        }>
    ): ((state: Float64Array, propensities: Float64Array) => number) | null {
        if (!getFeatureFlags().enableJitFastPath) {
            return null;
        }

        try {
            const knownVars = new Set([
                ...Object.keys(parameters),
                ...observables.map(o => o.name)
            ]);

            for (const rxn of reactions) {
                if (rxn.isFunctionalRate && rxn.rateExpression) {
                    if (!isJITSafe(rxn.rateExpression, knownVars)) {
                        return null;
                    }
                }
            }

            let source = "";
            const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
            for (const [pName, pVal] of Object.entries(parameters)) {
                if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(pName) && !forbiddenKeys.has(pName)) {
                    if (typeof pVal !== 'number' || !Number.isFinite(pVal)) return null;
                    source += `const ${pName} = ${pVal};\n`;
                }
            }

            for (const obs of observables) {
                if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(obs.name) || forbiddenKeys.has(obs.name)) {
                    continue;
                }
                let obsExpr = '0.0';
                if (obs.indices.length > 0) {
                    const terms: string[] = [];
                    for (let j = 0; j < obs.indices.length; j++) {
                        const idx = obs.indices[j];
                        const coef = obs.coefficients[j];
                        if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0) return null;
                        if (typeof coef !== 'number' || !Number.isFinite(coef)) return null;
                        terms.push(`(state[${idx}] * ${coef})`);
                    }
                    obsExpr = terms.join(' + ');
                }
                source += `const ${obs.name} = ${obsExpr};\n`;
            }

            source += "let aTotal = 0;\n";

            for (let i = 0; i < reactions.length; i++) {
                const rxn = reactions[i];
                const n = rxn.reactants.length;
                const volume = reactionReactingVolumes[i];
                if (typeof volume !== 'number' || !Number.isFinite(volume)) return null;

                if (!rxn.isFunctionalRate && (typeof rxn.rateConstant !== 'number' || !Number.isFinite(rxn.rateConstant))) return null;
                if (typeof rxn.propensityFactor !== 'number' || !Number.isFinite(rxn.propensityFactor)) return null;

                let rateExpr = '';
                if (rxn.isFunctionalRate && rxn.rateExpression) {
                    const translated = ExpressionTranslator.translate(rxn.rateExpression);
                    rateExpr = `(${translated})`;
                } else {
                    rateExpr = `${rxn.rateConstant}`;
                }

                rateExpr = `(${rateExpr}) * ${rxn.propensityFactor}`;

                if (n === 0) {
                    rateExpr = `(${rateExpr}) * ${volume}`;
                } else if (n === 2) {
                    rateExpr = `(${rateExpr}) / ${volume}`;
                } else if (n === 3) {
                    rateExpr = `(${rateExpr}) / ${volume * volume}`;
                } else if (n > 3) {
                    rateExpr = `(${rateExpr}) / Math.pow(${volume}, ${n - 1})`;
                }

                for (let j = 0; j < n; j++) {
                    const idx = rxn.reactants[j];
                    if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0) return null;
                    rateExpr += ` * state[${idx}]`;
                }

                source += `propensities[${i}] = ${rateExpr};\n`;
                source += `aTotal += propensities[${i}];\n`;
            }

            const safeSource1 = this.sanitizeSource(source);
            const source1 = safeSource1 + "return aTotal;\n";
            return this.createFn(["state", "propensities"], source1) as (state: Float64Array, propensities: Float64Array) => number;
        } catch (e) {
            console.warn('[JITCompiler] Failed to compile SSA propensities with functional rates:', e);
            return null;
        }
    }

    /**
     * OPT 4: JIT-compiled incremental propensity updater for SSA.
     * 
     * Generates a function that, given the index of the fired reaction, recomputes
     * only the dependent propensities using hardcoded species indices and pre-folded
     * rate constants. This eliminates the interpreted calcPropensity loop and avoids
     * indirect array lookups in the hot path.
     *
     * Returns null if any reaction uses functional rates (those still need interpreted eval).
     *
     * The compiled function signature:
     *   (firedRxnIdx: number, state: Float64Array, propensities: Float64Array,
     *    fenwickAdd: (idx: number, delta: number) => void) => number
     * 
     * Returns the total aTotal delta from all updated propensities.
     */
    public compileSSAIncrementalUpdater(
        reactions: Array<{
            reactants: number[] | Int32Array;
            products: number[] | Int32Array;
            rateConstant: number;
            propensityFactor: number;
            isFunctionalRate?: boolean;
            rateExpression?: string | null;
        }>,
        reactionReactingVolumes: Float64Array,
        rxnUpdateRxn: Int32Array[]
    ): ((firedRxnIdx: number, state: Float64Array, propensities: Float64Array,
        fenwickAdd: (idx: number, delta: number) => void) => number) | null {
        if (!getFeatureFlags().enableJitFastPath) {
            return null;
        }

        try {
            const numReactions = reactions.length;

            // Bail out if any reaction uses functional rates
            for (let i = 0; i < numReactions; i++) {
                if (reactions[i].isFunctionalRate && reactions[i].rateExpression) {
                    return null;
                }
            }

            // Pre-compute effective rate constants kEff[i] = k * factor / V^(n-1)
            const kEff = new Float64Array(numReactions);
            for (let i = 0; i < numReactions; i++) {
                const rxn = reactions[i];
                const n = rxn.reactants.length;
                let eff = rxn.rateConstant * rxn.propensityFactor;
                const volume = reactionReactingVolumes[i];
                if (!Number.isFinite(eff) || !Number.isFinite(volume)) return null;
                if (n === 0) {
                    eff *= volume;
                } else if (n === 2) {
                    eff /= volume;
                } else if (n === 3) {
                    eff /= (volume * volume);
                } else if (n > 3) {
                    eff /= Math.pow(volume, n - 1);
                }
                kEff[i] = eff;
            }

            // Generate a switch-case function body
            let source = 'var totalDelta = 0;\nswitch (firedRxnIdx) {\n';

            for (let r = 0; r < numReactions; r++) {
                const deps = rxnUpdateRxn[r];
                if (deps.length === 0) {
                    source += `case ${r}: break;\n`;
                    continue;
                }

                source += `case ${r}: {\n`;
                for (let d = 0; d < deps.length; d++) {
                    const jrxn = deps[d];
                    const rxn = reactions[jrxn];
                    const reactants = rxn.reactants;
                    const k = kEff[jrxn];

                    // Build propensity expression: kEff * state[r0] * state[r1] * ...
                    let expr = String(k);
                    for (let j = 0; j < reactants.length; j++) {
                        const idx = reactants[j];
                        if (typeof idx !== 'number' || !Number.isFinite(idx) || idx < 0 || Math.floor(idx) !== idx) {
                            throw new Error(`Invalid reactant index: ${idx}`);
                        }
                        expr += ` * state[${idx}]`;
                    }

                    source += `  var a${jrxn} = ${expr};\n`;
                    source += `  var d${jrxn} = a${jrxn} - propensities[${jrxn}];\n`;
                    source += `  propensities[${jrxn}] = a${jrxn};\n`;
                    source += `  totalDelta += d${jrxn};\n`;
                    source += `  fenwickAdd(${jrxn}, d${jrxn});\n`;
                }
                source += '  break;\n}\n';
            }

            const safeSource2 = this.sanitizeSource(source);
            const source2 = safeSource2 + '}\nreturn totalDelta;\n';

            return this.createFn(['firedRxnIdx', 'state', 'propensities', 'fenwickAdd'], source2) as
                (firedRxnIdx: number, state: Float64Array, propensities: Float64Array,
                    fenwickAdd: (idx: number, delta: number) => void) => number;
        } catch (e) {
            console.warn('[JITCompiler] Failed to compile SSA incremental updater:', e);
            return null;
        }
    }

    /**
     * OPT 3: JIT-compiled combined SSA event applier for mass-action networks.
     *
     * Generates one function that, for the fired reaction, does everything the hot
     * loop needs in a single call with hardcoded indices:
     *   1. applies the net integer state change per species (reactants/products
     *      coalesced, so catalysts cancel to nothing),
     *   2. recomputes only the dependent propensities from the fresh state using
     *      pre-folded effective rate constants,
     *   3. writes them back, accumulates the total propensity delta, and
     *   4. (only when useFenwick is true) applies the Fenwick tree delta.
     *
     * This removes the per-event reactant/product loops, the reaction-object
     * dereference, and (when selection is linear) all Fenwick work from the hot
     * loop. It returns null if any reaction uses a functional rate.
     *
     * Signature: (firedRxnIdx, state, propensities, fenwickAdd) => totalDelta
     *
     * Results are bit-identical to the interpreted state loops + calcPropensity
     * path: net state deltas equal the per-entry decrements/increments exactly
     * (integer counts), and the propensity expression is the same product form
     * with the same pre-folded kEff used everywhere else.
     */
    public compileSSAEventUpdater(
        reactions: Array<{
            reactants: number[] | Int32Array;
            products: number[] | Int32Array;
            rateConstant: number;
            propensityFactor: number;
            isFunctionalRate?: boolean;
            rateExpression?: string | null;
        }>,
        reactionReactingVolumes: Float64Array,
        rxnUpdateRxn: Int32Array[],
        useFenwick: boolean
    ): ((firedRxnIdx: number, state: Float64Array, propensities: Float64Array,
        fenwickAdd: (idx: number, delta: number) => void) => number) | null {
        if (!getFeatureFlags().enableJitFastPath) {
            return null;
        }

        try {
            const numReactions = reactions.length;

            // Bail out if any reaction uses functional rates.
            for (let i = 0; i < numReactions; i++) {
                if (reactions[i].isFunctionalRate && reactions[i].rateExpression) {
                    return null;
                }
            }

            // Pre-compute effective rate constants kEff[i] = k * factor / V^(n-1),
            // identical folding to compileSSAPropensities / SimulationLoop.kEff.
            const kEff = new Float64Array(numReactions);
            for (let i = 0; i < numReactions; i++) {
                const rxn = reactions[i];
                const n = rxn.reactants.length;
                let eff = rxn.rateConstant * rxn.propensityFactor;
                const volume = reactionReactingVolumes[i];
                if (!Number.isFinite(eff) || !Number.isFinite(volume)) return null;
                if (n === 0) {
                    eff *= volume;
                } else if (n === 2) {
                    eff /= volume;
                } else if (n === 3) {
                    eff /= (volume * volume);
                } else if (n > 3) {
                    eff /= Math.pow(volume, n - 1);
                }
                kEff[i] = eff;
            }

            // Build a full structural signature string used directly as the cache
            // key (no hashing -> no collision risk). It captures everything the
            // generated code depends on: the selection mode, each reaction's
            // reactants/products/kEff, and the dependency lists.
            const sigParts: string[] = [`f=${useFenwick ? 1 : 0}`, `n=${numReactions}`];
            for (let i = 0; i < numReactions; i++) {
                sigParts.push(
                    Array.from(reactions[i].reactants).join(',') + '>' +
                    Array.from(reactions[i].products).join(',') + '#' +
                    kEff[i].toString() + '@' +
                    Array.from(rxnUpdateRxn[i]).join(',')
                );
            }
            const cacheKey = sigParts.join(';');
            if (this.ssaEventUpdaterCache.has(cacheKey)) {
                return this.ssaEventUpdaterCache.get(cacheKey)!;
            }

            const validIdx = (idx: unknown): idx is number =>
                typeof idx === 'number' && Number.isFinite(idx) && idx >= 0 && Math.floor(idx) === idx;

            let source = 'var totalDelta = 0;\nswitch (firedRxnIdx) {\n';

            for (let r = 0; r < numReactions; r++) {
                source += `case ${r}: {\n`;

                // (1) Net integer state change per species (coalesced).
                const netDelta = new Map<number, number>();
                const reactants = reactions[r].reactants;
                const products = reactions[r].products;
                for (let j = 0; j < reactants.length; j++) {
                    const idx = reactants[j];
                    if (!validIdx(idx)) throw new Error(`Invalid reactant index: ${idx}`);
                    netDelta.set(idx, (netDelta.get(idx) ?? 0) - 1);
                }
                for (let j = 0; j < products.length; j++) {
                    const idx = products[j];
                    if (!validIdx(idx)) throw new Error(`Invalid product index: ${idx}`);
                    netDelta.set(idx, (netDelta.get(idx) ?? 0) + 1);
                }
                for (const [idx, d] of netDelta) {
                    if (d === 0) continue; // catalyst: no net change
                    if (d === 1) source += `  state[${idx}]++;\n`;
                    else if (d === -1) source += `  state[${idx}]--;\n`;
                    else source += `  state[${idx}] += ${d};\n`;
                }

                // (2)-(4) Recompute dependent propensities from fresh state.
                const deps = rxnUpdateRxn[r];
                for (let d = 0; d < deps.length; d++) {
                    const jrxn = deps[d];
                    const jReactants = reactions[jrxn].reactants;
                    let expr = kEff[jrxn].toString();
                    for (let j = 0; j < jReactants.length; j++) {
                        const idx = jReactants[j];
                        if (!validIdx(idx)) throw new Error(`Invalid reactant index: ${idx}`);
                        expr += ` * state[${idx}]`;
                    }
                    source += `  var a${jrxn} = ${expr};\n`;
                    source += `  var d${jrxn} = a${jrxn} - propensities[${jrxn}];\n`;
                    source += `  propensities[${jrxn}] = a${jrxn};\n`;
                    source += `  totalDelta += d${jrxn};\n`;
                    if (useFenwick) source += `  fenwickAdd(${jrxn}, d${jrxn});\n`;
                }
                source += '  break;\n}\n';
            }

            const safeSource3 = this.sanitizeSource(source);
            const source3 = safeSource3 + '}\nreturn totalDelta;\n';

            const fn = this.createFn(['firedRxnIdx', 'state', 'propensities', 'fenwickAdd'], source3) as
                (firedRxnIdx: number, state: Float64Array, propensities: Float64Array,
                    fenwickAdd: (idx: number, delta: number) => void) => number;

            if (this.ssaEventUpdaterCache.size >= this.maxCacheSize) {
                const oldest = this.ssaEventUpdaterCache.keys().next().value;
                if (oldest !== undefined) this.ssaEventUpdaterCache.delete(oldest);
            }
            this.ssaEventUpdaterCache.set(cacheKey, fn);
            return fn;
        } catch (e) {
            console.warn('[JITCompiler] Failed to compile SSA event updater:', e);
            return null;
        }
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
            if (!Number.isInteger(nSpecies) || nSpecies <= 0 || nSpecies > 1_000_000) {
                return null;
            }

            // 1. Prepare observables
            const nObservables = observables?.length || 0;
            if (!Number.isInteger(nObservables) || nObservables < 0 || nObservables > 1_000_000) {
                return null;
            }
            const obsOffsets = new Int32Array(nObservables + 1);
            let totalObsEntries = 0;
            (observables || []).forEach(obs => totalObsEntries += obs.indices.length);

            const obsSpeciesIdx = new Int32Array(totalObsEntries);
            const obsCoeffs = new Float64Array(totalObsEntries);

            let currentObsOffset = 0;
            (observables || []).forEach((obs, i) => {
                if (i < 0 || i >= obsOffsets.length) {
                    throw new Error(`[JITCompiler] obsOffsets index out of range: ${i}`);
                }
                obsOffsets[i] = currentObsOffset;
                for (let j = 0; j < obs.indices.length; j++) {
                    if (currentObsOffset < 0 || currentObsOffset >= obsSpeciesIdx.length || currentObsOffset >= obsCoeffs.length) {
                        throw new Error(`[JITCompiler] observable entry index out of range: ${currentObsOffset}`);
                    }
                    obsSpeciesIdx[currentObsOffset] = obs.indices[j];
                    obsCoeffs[currentObsOffset] = obs.coefficients[j];
                    currentObsOffset++;
                }
            });
            if (nObservables < 0 || nObservables >= obsOffsets.length) {
                throw new Error(`[JITCompiler] obsOffsets index out of range: ${nObservables}`);
            }
            obsOffsets.set([currentObsOffset], nObservables);

            // Validate parameter keys to prevent object destructuring injection.
            // For parity robustness, ignore invalid keys instead of failing the whole JIT pass.
            const allParamKeys = Object.keys(parameters || {});
            const forbiddenParamKeys = new Set(['__proto__', 'prototype', 'constructor']);
            const paramKeys = allParamKeys.filter(
                (key) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) && !forbiddenParamKeys.has(key)
            );
            const safeParameters: Record<string, number> = Object.create(null) as Record<string, number>;
            for (const key of paramKeys) {
                Object.defineProperty(safeParameters, key, {
                    value: (parameters as Record<string, number>)[key],
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });
            }
            if (allParamKeys.length !== paramKeys.length) {
                console.warn(
                    `[JITCompiler] Ignoring ${allParamKeys.length - paramKeys.length} invalid parameter key(s) during bytecode compilation`
                );
            }

            const signature = this.getBytecodeSignature(reactions, nSpecies, constantSpeciesMask, observables, functions);
            const cached = this.bytecodeCache.get(signature);

            if (cached) {
                // Re-evaluate rate constants only
                const rateConstants = new Float64Array(cached.nReactions);
                for (let i = 0; i < cached.nReactions; i++) {
                    const rxn = reactions[i];
                    const hasExpressionBytecode = typeof rxn.rateConstant === 'string' && cached.exprBytecodeOffsets[i + 1] > cached.exprBytecodeOffsets[i];
                    let k: number;
                    if (typeof rxn.rateConstant === 'number') {
                        k = rxn.rateConstant;
                    } else {
                        if (hasExpressionBytecode) {
                            k = 0;
                        } else {
                            const rxnStr = rxn.rateConstant.toString();
                            const inlinedExpr = this.expandZeroArgFunctions(rxnStr, functions);
                            const allowedNames = [
                                ...paramKeys,
                                ...(observables || []).map(o => o.name),
                                '__t__'
                            ];
                            this.assertSafeRateExpression(inlinedExpr, allowedNames);
                            const normalizedExpr = inlinedExpr.replace(/\bMath\./g, '');
                            try {
                                const evaluator = SafeExpressionEvaluator.compile(normalizedExpr, allowedNames);
                                k = evaluator(safeParameters);
                                if (Number.isNaN(k) || !Number.isFinite(k)) return null;
                            } catch {
                                return null;
                            }
                        }
                    }
                    if (rxn.statisticalFactor && rxn.statisticalFactor !== 1) {
                        k *= rxn.statisticalFactor;
                    }
                    rateConstants[i] = k;
                }

                return {
                    ...cached,
                    rateConstants
                };
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
                        const inlinedExpr = this.expandZeroArgFunctions(rxnStr, functions);
                        const allowedNames = [
                            ...paramKeys,
                            ...(observables || []).map(o => o.name),
                            '__t__'
                        ];
                        this.assertSafeRateExpression(inlinedExpr, allowedNames);
                        const normalizedExpr = inlinedExpr.replace(/\bMath\./g, '');

                        try {
                            const evaluator = SafeExpressionEvaluator.compile(normalizedExpr, allowedNames);
                            k = evaluator(safeParameters);
                            if (Number.isNaN(k) || !Number.isFinite(k)) return null;
                        } catch {
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
                    if (currentReactantOffset < 0 || currentReactantOffset >= reactantIdx.length || currentReactantOffset >= reactantStoich.length) {
                        throw new Error(`[JITCompiler] reactant entry index out of range: ${currentReactantOffset}`);
                    }
                    reactantIdx[currentReactantOffset] = this.normalizeSpeciesIndex(rxn.reactantIndices[j], nSpecies, i, 'reactant', j);
                    reactantStoich[currentReactantOffset] = rxn.reactantStoich[j];
                    currentReactantOffset++;
                }
            }
            exprBytecodeOffsets[nReactions] = totalBytecodeLen;
            reactantOffsets[nReactions] = currentReactantOffset;

            // Stoichiometry matrix conversion (CSC-like)
            const speciesRxnEntries: Array<Map<number, number>> = Array.from({ length: nSpecies }, () => new Map<number, number>());
            for (let r = 0; r < nReactions; r++) {
                const rxn = reactions[r];
                // Reactants
                for (let j = 0; j < rxn.reactantIndices.length; j++) {
                    const s = this.normalizeSpeciesIndex(rxn.reactantIndices[j], nSpecies, r, 'reactant', j);
                    if (isConstant(s)) continue;
                    const st = rxn.reactantStoich[j];
                    const existing = speciesRxnEntries[s].get(r);
                    if (existing !== undefined) {
                        speciesRxnEntries[s].set(r, existing - st);
                    } else {
                        speciesRxnEntries[s].set(r, -st);
                    }
                }
                // Products
                for (let j = 0; j < rxn.productIndices.length; j++) {
                    const s = this.normalizeSpeciesIndex(rxn.productIndices[j], nSpecies, r, 'product', j);
                    if (isConstant(s)) continue;
                    const st = rxn.productStoich[j];
                    const existing = speciesRxnEntries[s].get(r);
                    if (existing !== undefined) {
                        speciesRxnEntries[s].set(r, existing + st);
                    } else {
                        speciesRxnEntries[s].set(r, st);
                    }
                }
            }

            const speciesOffsets = new Int32Array(nSpecies + 1);
            let totalStoichEntries = 0;
            for (let s = 0; s < nSpecies; s++) {
                if (s < 0 || s >= speciesOffsets.length) {
                    throw new Error(`[JITCompiler] speciesOffsets index out of range: ${s}`);
                }
                speciesOffsets[s] = totalStoichEntries;
                totalStoichEntries += speciesRxnEntries[s].size;
            }
            if (nSpecies < 0 || nSpecies >= speciesOffsets.length) {
                throw new Error(`[JITCompiler] speciesOffsets terminal index out of range: ${nSpecies}`);
            }
            speciesOffsets.set([totalStoichEntries], nSpecies);

            const speciesRxnIdx = new Int32Array(totalStoichEntries);
            const speciesStoich = new Float64Array(totalStoichEntries);

            let currentStoichOffset = 0;
            for (let s = 0; s < nSpecies; s++) {
                for (const [rxnIdx, stoich] of speciesRxnEntries[s].entries()) {
                    if (currentStoichOffset < 0 || currentStoichOffset >= speciesRxnIdx.length || currentStoichOffset >= speciesStoich.length) {
                        throw new Error(`[JITCompiler] stoichiometry entry index out of range: ${currentStoichOffset}`);
                    }
                    speciesRxnIdx[currentStoichOffset] = rxnIdx;
                    speciesStoich[currentStoichOffset] = stoich;
                    currentStoichOffset++;
                }
            }

            // Analytical Jacobian Bytecode Generation
            // d(dydt[i])/dy[j] = sum_r (speciesStoich[i,r] * d(rate[r])/dy[j]) / speciesVolumes[i]
            // d(rate[r])/dy[j] = (rate[r] * reactantStoich[r,j]) / y[j] -- for mass action
            const jacRows = Array.from({ length: nSpecies }, () => new Map<number, { rxnIdx: number; coeff: number }[]>());

            // Map: reaction index -> species affected (non-zero net stoichiometry)
            const rxnToAffectedSpecies: Array<{ species: number, stoich: number }[]> = Array.from({ length: nReactions }, () => []);
            for (let s = 0; s < nSpecies; s++) {
                for (const [rxnIdx, stoich] of speciesRxnEntries[s].entries()) {
                    if (stoich !== 0) {
                        rxnToAffectedSpecies[rxnIdx].push({ species: s, stoich });
                    }
                }
            }

            for (let r = 0; r < nReactions; r++) {
                const rxn = reactions[r];
                const affectedSpecies = rxnToAffectedSpecies[r];

                for (let i_r = 0; i_r < rxn.reactantIndices.length; i_r++) {
                    const j = this.normalizeSpeciesIndex(rxn.reactantIndices[i_r], nSpecies, r, 'reactant', i_r); // Species the rate depends on
                    const reactantStoichJ = rxn.reactantStoich[i_r];

                    for (const affected of affectedSpecies) {
                        const s = affected.species;
                        if (!jacRows[s].has(j)) {
                            jacRows[s].set(j, []);
                        }
                        // We store the contribution from reaction r to J[s][j]
                        const netStoichI = affected.stoich;
                        jacRows[s].get(j)!.push({ rxnIdx: r, coeff: netStoichI * reactantStoichJ });
                    }
                }
            }

            const jacRowPtr = new Int32Array(nSpecies + 1);
            let totalJacEntries = 0;
            for (let i = 0; i < nSpecies; i++) {
                if (i < 0 || i >= jacRowPtr.length) {
                    throw new Error(`[JITCompiler] jacRowPtr index out of range: ${i}`);
                }
                jacRowPtr[i] = totalJacEntries;
                totalJacEntries += jacRows[i].size;
            }
            if (nSpecies < 0 || nSpecies >= jacRowPtr.length) {
                throw new Error(`[JITCompiler] jacRowPtr terminal index out of range: ${nSpecies}`);
            }
            jacRowPtr.set([totalJacEntries], nSpecies);

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
                    if (currentJacEntry < 0 || currentJacEntry >= jacColIdx.length || currentJacEntry >= jacContribOffsets.length) {
                        throw new Error(`[JITCompiler] Jacobian entry index out of range: ${currentJacEntry}`);
                    }
                    jacColIdx[currentJacEntry] = j;
                    jacContribOffsets[currentJacEntry] = currentContribOffset;

                    const contribs = rowMap.get(j)!;
                    for (const contrib of contribs) {
                        if (currentContribOffset < 0 || currentContribOffset >= jacContribRxnIdx.length || currentContribOffset >= jacContribCoeffs.length) {
                            throw new Error(`[JITCompiler] Jacobian contribution index out of range: ${currentContribOffset}`);
                        }
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

            const newByteCode: NetworkByteCode = {
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

            if (this.bytecodeCache.size >= this.maxCacheSize) {
                const firstKey = this.bytecodeCache.keys().next().value;
                if (firstKey !== undefined) this.bytecodeCache.delete(firstKey);
            }
            this.bytecodeCache.set(signature, newByteCode);

            return {
                ...newByteCode,
                rateConstants: new Float64Array(rateConstants)
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
        this.bytecodeCache.clear();
        this.ssaPropensityCache.clear();
        this.ssaEventUpdaterCache.clear();
        console.log('[JITCompiler] Cache cleared');
    }

    clearBytecodeCache(): void {
        this.bytecodeCache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { size: number; maxSize: number } {
        return {
            size: this.cache.size + this.observableCache.size +
                this.ssaPropensityCache.size + this.ssaEventUpdaterCache.size,
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
        _compiledFn: JITCompiledFunction,
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
                .map((idx) => typeof idx === 'string' ? idx : speciesNames[idx] ?? `s${idx}`)
                .filter((_, j) => j < (rxn.reactantIndices as unknown[]).length);
            const products = rxn.productIndices
                .map((idx) => typeof idx === 'string' ? idx : speciesNames[idx] ?? `s${idx}`)
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
