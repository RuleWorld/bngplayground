import { describe, it, expect, vi } from 'vitest';
import { jitCompiler } from '../../packages/engine/src/services/analysis/JITCompiler';
import { compileToByteCode } from '../../packages/engine/src/services/analysis/JITByteCodeGenerator';

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

    it('should report descriptive error for unknown functions', () => {
        const reactions = [
            {
                reactantIndices: [0],
                reactantStoich: [1],
                productIndices: [1],
                productStoich: [1],
                rateConstant: 'evilFn(A)',
                scalingVolume: 1
            }
        ];

        expect(() => {
            jitCompiler.compile(reactions, 2, { A: 2.0 });
        }).toThrow(/Security Error: Unknown function: evilFn/);
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

    it('should preserve descriptive JITByteCodeGenerator security reason in logs', () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            const reactions = [
                {
                    reactantIndices: [0],
                    reactantStoich: [1],
                    productIndices: [1],
                    productStoich: [1],
                    rateConstant: 'evilFn(A)',
                    scalingVolume: 1
                }
            ];

            const result = compileToByteCode(reactions, 2, { A: 2.0 });
            expect(result).toBeNull();

            const flattenedLog = consoleErrorSpy.mock.calls
                .map((call) => call.map((arg) => String(arg)).join(' '))
                .join('\n');

            expect(flattenedLog).toMatch(/\[JITByteCodeGenerator\] Failed to compile bytecode:/);
            expect(flattenedLog).toMatch(/Security Error: Unknown function: evilFn/);
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });
});
