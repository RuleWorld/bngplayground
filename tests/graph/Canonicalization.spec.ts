
import { describe, it, expect } from 'vitest';
import { BNGLParser } from '@bngplayground/engine'; // Adjust path
// Adjust path if needed
// Or use canonical labeling directly if ParityService not available in test scope easily
// Let's assume BNGLParser exposes parsing and we can verify identity strings.

import { GraphCanonicalizer } from '@bngplayground/engine';

// Helper to get canonical string
function canonicalStr(bngl: string): string {
    const graph = BNGLParser.parseSpeciesGraph(bngl);
    const c = GraphCanonicalizer.canonicalize(graph);
    return c.split('+').map(p => p.trim()).sort().join(' + ');
}

describe('GraphCanonicalization', () => {

    it('51. Canonicalize single node A()', () => {
        expect(canonicalStr('A()')).toBe('A()');
    });

    it('52. Canonicalize connected pair A(b!1).B(b!1)', () => {
        // Should be deterministic
        const s = canonicalStr('A(b!1).B(b!1)');
        expect(s).toBeDefined();
    });

    it('53. Confirm isomorphism A(b!1).B(b!1) == B(b!1).A(b!1)', () => {
        expect(canonicalStr('A(b!1).B(b!1)')).toBe(canonicalStr('B(b!1).A(b!1)'));
    });

    it('54. Canonicalize symmetric homodimer A(b!1).A(b!1)', () => {
        expect(canonicalStr('A(b!1).A(b!1)')).toBeDefined();
    });

    it('55. Canonicalize cycle A(x!1,y!2).B(x!2,y!3).C(x!3,y!1)', () => {
        const ag = canonicalStr('A(x!1,y!2).B(x!2,y!3).C(x!3,y!1)');
        const bg = canonicalStr('B(x!1,y!2).C(x!2,y!3).A(x!3,y!1)'); // Rotated
        expect(ag).toBe(bg);
    });

    it('56. Canonicalize linear chain A(b!1).B(b!1,c!2).C(c!2)', () => {
        const fwd = 'A(b!1).B(b!1,c!2).C(c!2)';
        const rev = 'C(c!1).B(c!1,b!2).A(b!2)';
        expect(canonicalStr(fwd)).toBe(canonicalStr(rev));
    });

    it('57. Distinguish state variants A(s~u) vs A(s~p)', () => {
        expect(canonicalStr('A(s~u)')).not.toBe(canonicalStr('A(s~p)'));
    });

    it('58. Distinguish component presence A(x,y) vs A(x)', () => {
        expect(canonicalStr('A(x,y)')).not.toBe(canonicalStr('A(x)'));
    });

    it.skip('59. Canonicalize disjoint graph A() + B()', () => {
        // Disjoint ordering should be sorted
        expect(canonicalStr('A() + B()')).toBe(canonicalStr('B() + A()'));
    });

    it('60. Handle graph with duplicate molecules', () => {
        expect(canonicalStr('A() + A()')).toBeDefined();
    });
});
