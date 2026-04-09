import { describe, it, expect } from 'vitest';
import { jitCompiler } from '../../packages/engine/src/services/analysis/JITCompiler';

describe('JITCompiler Security', () => {
    it('should reject code injection in rate constants', () => {
        const reactions = [
            {
                reactantIndices: [0],
                reactantStoich: [1],
                productIndices: [1],
                productStoich: [1],
                rateConstant: "1; process.exit(1); 1",
                scalingVolume: 1
            }
        ];

        expect(() => {
            jitCompiler.compile(reactions, 2, {});
        }).toThrow();
    });
});
