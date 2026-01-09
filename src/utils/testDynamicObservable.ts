/**
 * Test suite for dynamic observable pattern parsing and matching
 */

import { BNGLParser } from '../services/graph/core/BNGLParser';
import { GraphMatcher } from '../services/graph/core/Matcher';
import { validateObservablePattern, parseObservablePattern } from './dynamicObservable';

// Test cases for pattern parsing
const testPatterns = [
    { pattern: 'A(b)', description: 'Simple molecule with unbound component' },
    { pattern: 'A(b!+)', description: 'Molecule with any-bound component (wildcard)' },
    { pattern: 'A(b!1)', description: 'Molecule with specific bond number' },
    { pattern: 'A(b~P)', description: 'Molecule with state' },
    { pattern: 'A(b!1).B(a!1)', description: 'Complex pattern with bond' },
    { pattern: 'A.B', description: 'Simple complex (implicit bonds)' },
];

// Test pattern parsing
console.log('=== Testing Pattern Parsing ===\n');

for (const { pattern, description } of testPatterns) {
    console.log(`Testing: ${pattern} (${description})`);

    const validationError = validateObservablePattern(pattern);
    if (validationError) {
        console.log(`  ❌ Validation failed: ${validationError}`);
    } else {
        console.log(`  ✅ Validation passed`);

        try {
            const parsed = parseObservablePattern(pattern);
            console.log(`  📊 Parsed: ${parsed.molecules.length} molecule(s)`);
            parsed.molecules.forEach((mol, i) => {
                console.log(`     Molecule ${i}: ${mol.name}(${mol.components.map(c => {
                    let s = c.name;
                    if (c.state) s += '~' + c.state;
                    if (c.wildcard) s += '!' + c.wildcard;
                    if (c.edges.size > 0) s += '!' + Array.from(c.edges.keys()).join('!');
                    return s;
                }).join(',')})`);
            });
        } catch (e: any) {
            console.log(`  ❌ Parse error: ${e.message}`);
        }
    }
    console.log('');
}

// Test matching against species
console.log('\n=== Testing Pattern Matching ===\n');

const testSpecies = [
    'A(b)',
    'A(b!1).B(a!1)',
    'A(b~P)',
    'A(b~U)',
    'A(b!1,c~P).B(a!1)',
];

const testMatchPatterns = [
    'A(b)',       // Should match A(b) only (unbound)
    'A(b!+)',     // Should match everything with A having bound b
    'A()',        // Should match any A
    'A.B',        // Should match A.B complexes
];

for (const pattern of testMatchPatterns) {
    console.log(`Pattern: ${pattern}`);

    const validationError = validateObservablePattern(pattern);
    if (validationError) {
        console.log(`  ⚠️ Skipping (validation failed)`);
        continue;
    }

    const patternGraph = parseObservablePattern(pattern);

    for (const species of testSpecies) {
        try {
            const speciesGraph = BNGLParser.parseSpeciesGraph(species);
            const matches = GraphMatcher.findAllMaps(patternGraph, speciesGraph);
            const matchCount = matches.length;
            console.log(`  ${species}: ${matchCount > 0 ? `✅ ${matchCount} match(es)` : '❌ no match'}`);
        } catch (e: any) {
            console.log(`  ${species}: ⚠️ Error - ${e.message}`);
        }
    }
    console.log('');
}

console.log('=== Tests Complete ===');
