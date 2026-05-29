/**
 * JITByteCodeGenerator.ts - Compile a reaction network into compact bytecode
 *
 * Extracted from JITCompiler.ts.  The main entry point is
 * `compileToByteCode()`, a standalone function that produces a
 * `NetworkByteCode` struct consumable by the bytecode interpreter or WASM
 * runtime.
 */

import { SafeExpressionEvaluator } from '../../utils/safeExpressionEvaluator';
import type { NetworkByteCode } from './JITCompiler';
import {
    compileExpressionToBytecode,
    type JITFunctionDefinition,
} from './ExpressionBytecodeCompiler';

/**
 * Validate and normalise a species index that may arrive as a string.
 *
 * This is the same logic as `JITCompiler.normalizeSpeciesIndex` but exposed
 * as a free function so the bytecode generator can use it without requiring a
 * class instance.
 */
function normalizeSpeciesIndex(
    rawIndex: number | string,
    nSpecies: number,
    reactionIndex: number,
    role: 'reactant' | 'product',
    termIndex: number
): number {
    const normalized = typeof rawIndex === 'string' ? Number.parseInt(rawIndex, 10) : rawIndex;
    if (!Number.isInteger(normalized) || normalized < 0 || normalized >= nSpecies) {
        throw new Error(
            `[JITByteCodeGenerator] Invalid ${role} species index at reaction ${reactionIndex}, term ${termIndex}: ${String(rawIndex)}`
        );
    }
    return normalized;
}

function normalizeExpressionForValidation(expr: string): string {
    return expr.replace(/\^/g, '**').replace(/\bMath\./g, '');
}

function assertSafeRateExpression(expr: string, paramNames: string[]): void {
    const normalizedExpr = normalizeExpressionForValidation(expr);
    try {
        // compile() validates syntax, AST allowlist, and unknown variables.
        SafeExpressionEvaluator.compile(normalizedExpr, paramNames);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`[JITByteCodeGenerator] Security Error: ${reason} (rate: ${expr})`);
    }
}

/**
 * Compile a reaction network into a compact bytecode representation for
 * WASM interpretation.
 *
 * Returns `null` if any reaction uses a complex rate expression that cannot
 * be pre-evaluated.
 */
export function compileToByteCode(
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
        // Validate parameter keys to prevent object destructuring injection
        const paramKeys = Object.keys(parameters || {});
        for (const key of paramKeys) {
            if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
                throw new Error(`[JITByteCodeGenerator] Security Error: Invalid parameter key ${key}`);
            }
        }

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
                const bc = compileExpressionToBytecode(
                    rxn.rateConstant,
                    parameters || {},
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
                    assertSafeRateExpression(rxnStr, paramKeys);
                    const normalizedExpr = rxnStr.replace(/\bMath\./g, '');
                    try {
                        const evaluator = SafeExpressionEvaluator.compile(normalizedExpr, paramKeys);
                        k = evaluator(parameters || {});
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
                reactantIdx[currentReactantOffset] = normalizeSpeciesIndex(rxn.reactantIndices[j], nSpecies, i, 'reactant', j);
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
                const s = normalizeSpeciesIndex(rxn.reactantIndices[j], nSpecies, r, 'reactant', j);
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
                const s = normalizeSpeciesIndex(rxn.productIndices[j], nSpecies, r, 'product', j);
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
            speciesOffsets[s] = totalStoichEntries;
            totalStoichEntries += speciesRxnEntries[s].size;
        }
        speciesOffsets[nSpecies] = totalStoichEntries;

        const speciesRxnIdx = new Int32Array(totalStoichEntries);
        const speciesStoich = new Float64Array(totalStoichEntries);

        let currentStoichOffset = 0;
        for (let s = 0; s < nSpecies; s++) {
            for (const [rxnIdx, stoich] of speciesRxnEntries[s].entries()) {
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
        const rxnToAffectedSpecies: Array<{species: number, stoich: number}[]> = Array.from({ length: nReactions }, () => []);
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
                const j = normalizeSpeciesIndex(rxn.reactantIndices[i_r], nSpecies, r, 'reactant', i_r); // Species the rate depends on
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
        console.error('[JITByteCodeGenerator] Failed to compile bytecode:', error);
        return null;
    }
}
