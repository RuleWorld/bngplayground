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

// BNG2 Observable.pm defines a `!+` component in a Molecules observable as
// "this component is bound". Observable::match() then returns one match per
// copy present, which is what makes Observable::toGroupString() emit a
// multiplicity term such as `2*8` in the .net `begin groups` block. Matching
// must therefore count copies, and must not silently score zero because the
// bond labels were dropped while normalizing the species string.
describe('Pattern Matching - BNG2 !+ multiplicity', () => {
    it('counts one match per copy carrying the required bond', () => {
        expect(countPatternMatches('VEGFR2(d!1,l,s~P).VEGFR2(d!2,l,s~U)', 'VEGFR2(d!+)')).toBe(2);
        expect(countPatternMatches('VEGFR1(l!1)@PM.VEGFR1(l!2)@PM', 'VEGFR1(l!+)')).toBe(2);
    });

    it('does not match a copy whose component is unbound', () => {
        expect(countPatternMatches('VEGFR2(d,l,s~U)', 'VEGFR2(d!+)')).toBe(0);
        expect(countPatternMatches('VEGFR1(l)@PM', 'VEGFR1(l!+)')).toBe(0);
    });

    it('matches a paired bond label the same way', () => {
        // Same multiplicity, written with the shared bond label BNG2 emits for
        // an explicitly bonded dimer.
        expect(countPatternMatches('VEGFR2(d!1,l,s~U).VEGFR2(d!1,l,s~U)', 'VEGFR2(d!+)')).toBe(2);
        expect(countPatternMatches('TLR3(b!1,s~P).TLR3(b!1,s~P)', 'TLR3(b!+)')).toBe(2);
    });

    it('counts only the bound members of a mixed complex', () => {
        expect(countPatternMatches('A(b!1).A(b)', 'A(b!+)')).toBe(1);
        expect(countPatternMatches('A(b!1).A(b!2)', 'A(b!+)')).toBe(2);
    });
});
