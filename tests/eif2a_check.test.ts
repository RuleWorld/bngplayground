import { describe, it, expect } from 'vitest';
import { BNGLParser } from '../src/services/graph/core/BNGLParser';
import { NetworkGenerator } from '../src/services/graph/NetworkGenerator';
import { countPatternMatches } from '../services/parity/PatternMatcher';

describe('eif2a-stress-response Parity Debug', () => {
    it('should correctly match free GEF but NOT sequestered GEF', () => {
        // eIF2B(b)
        const patStr = 'eIF2B(b)';
        // eIF2a(b!1).eIF2B(b!1)
        const specStr = 'eIF2a(b!1).eIF2B(b!1)';

        const count = countPatternMatches(specStr, patStr);
        expect(count).toBe(0); // Before fix, this was 1
    });

    it('should match free GEF in eIF2B(b)', () => {
        const patStr = 'eIF2B(b)';
        const specStr = 'eIF2B(b)';
        const count = countPatternMatches(specStr, patStr);
        expect(count).toBe(1);
    });
});
