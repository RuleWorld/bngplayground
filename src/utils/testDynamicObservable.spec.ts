/**
 * Test suite for dynamic observable pattern parsing and matching
 */

import { describe, it, expect } from 'vitest';
import { BNGLParser, GraphMatcher, validateObservablePattern, parseObservablePattern } from '@bngplayground/engine';

describe('Dynamic Observable Pattern Parsing', () => {
    const testPatterns = [
        { pattern: 'A(b)', description: 'Simple molecule with unbound component', molecules: 1 },
        { pattern: 'A(b!+)', description: 'Molecule with any-bound component (wildcard)', molecules: 1 },
        { pattern: 'A(b!1)', description: 'Molecule with specific bond number', molecules: 1 },
        { pattern: 'A(b~P)', description: 'Molecule with state', molecules: 1 },
        { pattern: 'A(b!1).B(a!1)', description: 'Complex pattern with bond', molecules: 2 },
        { pattern: 'A.B', description: 'Simple complex (implicit bonds)', molecules: 2 },
    ];

    it.each(testPatterns)('should parse $description: $pattern', ({ pattern, molecules }) => {
        const validationError = validateObservablePattern(pattern);
        expect(validationError).toBeNull();

        const parsed = parseObservablePattern(pattern);
        expect(parsed.molecules.length).toBe(molecules);
    });
});

describe('Dynamic Observable Pattern Matching', () => {
    const testSpecies = [
        'A(b)',
        'A(b!1).B(a!1)',
        'A(b~P)',
        'A(b~U)',
        'A(b!1,c~P).B(a!1)',
    ];

    const expectedMatches: Record<string, Record<string, number>> = {
        'A(b)': {
            'A(b)': 1,
            'A(b!1).B(a!1)': 0,
            'A(b~P)': 1,
            'A(b~U)': 1,
            'A(b!1,c~P).B(a!1)': 0,
        },
        'A(b!+)': {
            'A(b)': 0,
            'A(b!1).B(a!1)': 1,
            'A(b~P)': 0,
            'A(b~U)': 0,
            'A(b!1,c~P).B(a!1)': 1,
        },
        'A()': {
            'A(b)': 1,
            'A(b!1).B(a!1)': 1,
            'A(b~P)': 1,
            'A(b~U)': 1,
            'A(b!1,c~P).B(a!1)': 1,
        },
        'A.B': {
            'A(b)': 0,
            'A(b!1).B(a!1)': 1,
            'A(b~P)': 0,
            'A(b~U)': 0,
            'A(b!1,c~P).B(a!1)': 1,
        }
    };

    const testMatchPatterns = Object.keys(expectedMatches);

    for (const pattern of testMatchPatterns) {
        describe(`Pattern: ${pattern}`, () => {
            let patternGraph: any;

            it('should validate and parse pattern', () => {
                const validationError = validateObservablePattern(pattern);
                expect(validationError).toBeNull();
                patternGraph = parseObservablePattern(pattern);
                expect(patternGraph).toBeDefined();
            });

            it.each(testSpecies)('should correctly match against %s', (species) => {
                const speciesGraph = BNGLParser.parseSpeciesGraph(species);
                const matches = GraphMatcher.findAllMaps(patternGraph, speciesGraph);
                expect(matches.length).toBe(expectedMatches[pattern][species]);
            });
        });
    }
});
