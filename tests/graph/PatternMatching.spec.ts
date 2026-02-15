
import { describe, it, expect } from 'vitest';
import { isSpeciesMatch, countPatternMatches } from '../../services/parity/PatternMatcher';

describe('PatternMatching', () => {

    // 41. Match species in compartment
    it('41. should match species in correct compartment', () => {
        // Target: A located in C1. Pattern: A@C1
        const target = '@C1:A(s~u)';
        const pattern = '@C1:A()';
        expect(isSpeciesMatch(target, pattern)).toBe(true);
    });

    // 42. Match species across compartments (wildcard compartment?)
    it('42. should match species regardless of compartment if pattern is generic', () => {
        const target = '@C1:A(s~u)';
        const pattern = 'A()'; // Logic: Generic pattern usually matches any molecule, but BNG strict syntax?
        // if pattern has no compartment, it matches molecule anywhere or only specific default?
        // Standard BNG: A() matches A in any compartment unless specified? 
        // PatternMatcher implementation check:
        // Currently regex-based mostly.
        expect(isSpeciesMatch(target, pattern)).toBe(true);
    });

    // 43. Fail if compartment mismatch
    it('43. should fail if compartments match', () => {
        const target = '@C1:A()';
        const pattern = '@C2:A()';
        expect(isSpeciesMatch(target, pattern)).toBe(false);
    });

    // 44. Match wildcard component A(s!?)
    it('44. should match wildcard bond', () => {
        const target = 'A(s!1).B(s!1)';
        const pattern = 'A(s!?)';
        expect(isSpeciesMatch(target, pattern)).toBe(true);
    });

    // 45. Match bound component A(s!1).B(s!1)
    it('45. should match specific bound state', () => {
        const target = 'A(s!1).B(s!1)';
        const pattern = 'A().B()'; // Disjoint check or connected?
        // Pattern "A().B()" matches complex with A and B connected?
        // Actually "A().B()" in BNGL usually means "Match A connected to B" if valid species pattern?
        // Or is it "Match species containing A and B"?
        // PatternMatcher assumes species string.
        expect(isSpeciesMatch(target, pattern)).toBe(true);
    });

    // 46. Match unbound component A(s) (explicit)
    it('46. should match explicit unbound', () => {
        const target = 'A(s)';
        const pattern = 'A(s)';
        expect(isSpeciesMatch(target, pattern)).toBe(true);
        const boundTarget = 'A(s!1).B(s!1)';
        expect(isSpeciesMatch(boundTarget, 'A(s)')).toBe(false); // Should fail if s is bound but pattern says unbound
    });

    // 47. Match state A(s~P)
    it('47. should match correct state', () => {
        const target = 'A(s~P)';
        const pattern = 'A(s~P)';
        expect(isSpeciesMatch(target, pattern)).toBe(true);
    });

    // 48. Fail if state mismatch
    it('48. should fail on state mismatch', () => {
        const target = 'A(s~U)';
        const pattern = 'A(s~P)';
        expect(isSpeciesMatch(target, pattern)).toBe(false);
    });

    // 49. Match any state A(s~?)
    it('49. should match any state wildcard', () => {
        const target = 'A(s~U)';
        const pattern = 'A(s~?)';
        // Check if implementation supports ~? (BNGL standard)
        // If not supported, this test documents gap.
        // Assuming regex logic handles it or returns false.
        // If it fails, we know to implement it.
        // For now expect true to test parity goal.
        expect(isSpeciesMatch(target, pattern)).toBe(true);
    });

    // 50. Match identical species disjointly A()+A()
    it('50. should count multiple occurrences', () => {
        const target = 'A(x!1).A(x!1)'; // Homodimer
        const pattern = 'A()';
        const count = countPatternMatches(target, pattern);
        expect(count).toBeGreaterThanOrEqual(2);
    });

    // 51. Count symmetric component embeddings (BAB parity guard)
    it('51. should count symmetric free-site embeddings on one molecule', () => {
        const target = 'A(b,b)';
        const pattern = 'A(b)';
        expect(countPatternMatches(target, pattern)).toBe(2);
    });
});
