import { describe, it, expect } from 'vitest';
import { countPatternMatches } from '../src/services/parity/PatternMatcher';

describe('Pattern Matching - Bare Molecules', () => {
    it('should match bare molecule to bare molecule', () => {
        expect(countPatternMatches('mRNA', 'mRNA')).toBe(1);
    });

    it('should match bare molecule to bare molecule with parentheses', () => {
        expect(countPatternMatches('mRNA()', 'mRNA')).toBe(1);
        expect(countPatternMatches('mRNA', 'mRNA()')).toBe(1);
    });

    it('should match bare molecule in complex', () => {
        expect(countPatternMatches('A.B', 'A')).toBe(1);
        expect(countPatternMatches('A.B', 'B')).toBe(1);
        expect(countPatternMatches('A().B', 'B')).toBe(1);
        expect(countPatternMatches('A.B()', 'A')).toBe(1);
    });

    it('should match bare molecule with compartments', () => {
        expect(countPatternMatches('@EC:A.B', 'A')).toBe(1);
        expect(countPatternMatches('A@EC.B', 'A')).toBe(1);
        expect(countPatternMatches('@EC:A().B', 'B')).toBe(1);
        expect(countPatternMatches('@EC:mRNA', 'mRNA')).toBe(1);
    });

    it('should handle complex mixed cases', () => {
        expect(countPatternMatches('A(b!1).B(a!1)', 'A')).toBe(1);
        expect(countPatternMatches('A(b!1).B(a!1).C', 'C')).toBe(1);
    });
});
