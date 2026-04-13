import { describe, it, expect } from 'vitest';
import { jitCompiler } from '../../packages/engine/src/services/analysis/JITCompiler';

describe('JITCompiler Security Correctness', () => {
    it('should allow valid mathematical expressions', () => {
        const reactions = [
            {
                reactantIndices: [0],
                reactantStoich: [1],
                productIndices: [1],
                productStoich: [1],
                rateConstant: "k_f * Math.pow(A, 2)",
                scalingVolume: 1
            }
        ];

        expect(() => {
            jitCompiler.compile(reactions, 2, { k_f: 1.5, A: 2.0 });
        }).not.toThrow();
    });

    it('should allow Math-prefixed expressions in bytecode compilation', () => {
        const reactions = [
            {
                reactantIndices: [0],
                reactantStoich: [1],
                productIndices: [1],
                productStoich: [1],
                rateConstant: 'k_f * Math.pow(A, 2)',
                scalingVolume: 1
            }
        ];

        const bytecode = jitCompiler.compileToByteCode(reactions, 2, { k_f: 1.5, A: 2.0 });
        expect(bytecode).not.toBeNull();
        expect(bytecode?.exprBytecode.length).toBeGreaterThan(0);
    });

    it('should reject invalid parameter keys', () => {
        const reactions = [
            {
                reactantIndices: [0],
                reactantStoich: [1],
                productIndices: [1],
                productStoich: [1],
                rateConstant: 1.0,
                scalingVolume: 1
            }
        ];

        // compileToByteCode catches its own internal errors and returns null on failure!
        expect(jitCompiler.compileToByteCode(reactions, 2, { "a} = params; process.exit(1); const {b": 1.5 })).toBeNull();
    });
});
