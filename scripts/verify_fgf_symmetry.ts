
import { GraphCanonicalizer } from '../src/services/graph/core/Canonical.ts';
import { BNGLParser } from '../src/services/parser/BNGLParser.ts';
import { NetworkGenerator } from '../src/services/graph/NetworkGenerator.ts';

// Mock rule patterns from FGF model
// Pattern 1: FGF(b!1).FGFR(l!1,d,s~U)
// Pattern 2: FGF(b!2).FGFR(l!2,d,s~U)

const pattern1Str = "FGF(b!1).FGFR(l!1,d,s~U)";
const pattern2Str = "FGF(b!2).FGFR(l!2,d,s~U)";

// Parse patterns
// We need a minimal parser or manually construct graphs.
// Using BNGLParser if available and easy to import.
// BNGLParser usually requires a full model context.

// Let's try to access the parser via imports.
// Assuming we can use a simplified parser or regex based construction if needed.
// But better to use the real parser to ensure we match `NetworkGenerator` behavior.

// Check if we can instantiate BNGLParser
const parser = new BNGLParser();
const p1 = parser.parseSpecies(pattern1Str);
const p2 = parser.parseSpecies(pattern2Str);

if (!p1 || !p2) {
    console.error("Failed to parse patterns");
    process.exit(1);
}

// Canonicalize
const c1 = GraphCanonicalizer.canonicalize(p1);
const c2 = GraphCanonicalizer.canonicalize(p2);

console.log(`Pattern 1: ${pattern1Str}`);
console.log(`Canonical 1: ${c1}`);
console.log(`Pattern 2: ${pattern2Str}`);
console.log(`Canonical 2: ${c2}`);

if (c1 === c2) {
    console.log("SUCCESS: Canonical strings MATCH.");
} else {
    console.log("FAILURE: Canonical strings DO NOT MATCH.");
}
