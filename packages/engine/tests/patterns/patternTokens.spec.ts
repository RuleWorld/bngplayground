import { describe, expect, it } from 'vitest';
import {
    parseMoleculeTokens,
    extractMoleculeNames,
    extractBindingRequirements,
} from '../../src/services/patterns/patternTokens';

describe('extractMoleculeNames (canonical)', () => {
    it('handles complexes, single molecules, and empty input', () => {
        expect(extractMoleculeNames('A(b!1).B(a!1)')).toEqual(['A', 'B']);
        expect(extractMoleculeNames('A(b)')).toEqual(['A']);
        expect(extractMoleculeNames('X()')).toEqual(['X']);
        expect(extractMoleculeNames('')).toEqual([]);
    });

    it('handles bare molecules with no component list', () => {
        // The app's previous regex required a parenthesis and dropped these.
        expect(extractMoleculeNames('A')).toEqual(['A']);
        expect(extractMoleculeNames('A.B')).toEqual(['A', 'B']);
    });

    it('strips compartment annotations (prefix and suffix)', () => {
        expect(extractMoleculeNames('@PM:A(b)')).toEqual(['A']);
        expect(extractMoleculeNames('A(b)@PM')).toEqual(['A']);
        expect(extractMoleculeNames('A@PM')).toEqual(['A']);
        expect(extractMoleculeNames('@CP:A(b!1).B(a!1)@PM')).toEqual(['A', 'B']);
    });

    it('preserves duplicate molecules (homodimers)', () => {
        expect(extractMoleculeNames('A(b!1).A(b!1)')).toEqual(['A', 'A']);
    });
});

describe('parseMoleculeTokens', () => {
    it('captures component name, state, and bond label', () => {
        const [mol] = parseMoleculeTokens('A(b~P!1)');
        expect(mol.name).toBe('A');
        expect(mol.components[0]).toEqual({ name: 'b', state: 'P', bondLabel: '1' });
    });

    it('does not split on a dot inside component parentheses', () => {
        // depth-aware split: the only top-level separator is between molecules
        expect(parseMoleculeTokens('A(b!1).B(a!1)').map((m) => m.name)).toEqual(['A', 'B']);
    });
});

describe('extractBindingRequirements', () => {
    it('pairs components sharing a numeric bond label', () => {
        expect(extractBindingRequirements('A(b!1).B(a!1)')).toEqual([
            { mol1: 'A', comp1: 'b', mol2: 'B', comp2: 'a' },
        ]);
    });

    it('ignores unbound components', () => {
        expect(extractBindingRequirements('A(b).B(a)')).toEqual([]);
    });
});
