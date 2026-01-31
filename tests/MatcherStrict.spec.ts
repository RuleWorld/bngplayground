
import { BNGLParser } from '../src/services/graph/core/BNGLParser';
import { GraphMatcher as Matcher } from '../src/services/graph/core/Matcher';
import { describe, it } from 'vitest';

describe('Matcher Strict Unbound Checks', () => {
    it('should NOT match A(b) to A(b!1) when using strict unbound semantics', () => {
        // Pattern: A(b) - implicitly A(b!0) aka unbound
        const pattern = BNGLParser.parseSpeciesGraph('A(b)');
        
        // Target: A(b!1).B(a!1) - b is bound
        const target = BNGLParser.parseSpeciesGraph('A(b!1).B(a!1)');
        
        // Should NOT match
        const maps = Matcher.findAllMaps(pattern, target);
        if (maps.length > 0) {
             throw new Error(`Strict matching failed: Found ${maps.length} matches for A(b) in A(b!1). Expected 0.`);
        }
    });

    it('should match A(b!?) to A(b!1)', () => {
        const pattern = BNGLParser.parseSpeciesGraph('A(b!?)');
        const target = BNGLParser.parseSpeciesGraph('A(b!1).B(a!1)');
        
        const maps = Matcher.findAllMaps(pattern, target);
        if (maps.length === 0) {
            throw new Error('Wildcard matching failed: Expected A(b!?) to match A(b!1)');
        }
    });

    it('should match A(b!+) to A(b!1)', () => {
        const pattern = BNGLParser.parseSpeciesGraph('A(b!+)');
        const target = BNGLParser.parseSpeciesGraph('A(b!1).B(a!1)');
        
        const maps = Matcher.findAllMaps(pattern, target);
        if (maps.length === 0) {
            throw new Error('Wildcard + matching failed: Expected A(b!+) to match A(b!1)');
        }
    });

    it('should match A(b) to A(b)', () => {
        const pattern = BNGLParser.parseSpeciesGraph('A(b)');
        const target = BNGLParser.parseSpeciesGraph('A(b)');
        
        const maps = Matcher.findAllMaps(pattern, target);
        if (maps.length === 0) {
            throw new Error('Identity matching failed: Expected A(b) to match A(b)');
        }
    });
});
