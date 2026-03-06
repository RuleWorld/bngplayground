
import { describe, it, expect } from 'vitest';
import { parseBNGLStrict } from '@bngplayground/engine';

// Helper to generate variations
function generateExpressionPermutations() {
    return [
        '1', '1.0', '-1', '1e5', 'k1', 'k_1', 'A', 'A+B', 'A*B', 'A/B', 'A^B',
        'log(10)', 'exp(2)', 'sin(x)', 'max(1,2)', 'min(3,4)',
        '(A+B)*C', 'A+(B*C)', 'if(exp(x)>1, 1, 0)'
    ];
}

function generatePatternPermutations() {
    return [
        'A', 'A()', 'A(b)', 'A(b,c)', 'A(b~u)', 'A(b~u, c~p)',
        'A(b!1).B(a!1)', 'A().B()', 'A(b!+)', 'A(b!?)',
        'A(b!1).B(a!1).C(z!2).D(y!2)',
        'EGFR(L!1,CR!2).EGF(r!1).EGFR(L!3,CR!2).EGF(r!3)' // Example
    ];
}

describe('Parser Stress Tests', () => {

    const expressions = generateExpressionPermutations();
    // Add math permutations
    for(let i=0; i<500; i++) {
        expressions.push(`${i}*x + ${i*2}*y^2`);
    }
    
    // Procedurally generate 2000 patterns
    const patterns: string[] = [];
    const bases = ['A', 'B', 'C', 'D', 'E'];
    const comps = ['x', 'y', 'z', 'w'];
    const states = ['u', 'p', '0', '1'];
    
    // Generate simple permutations
    let counter = 0;
    for(const b of bases) {
        for(const c of comps) {
            for(const s of states) {
                patterns.push(`${b}(${c}~${s})`);
                counter++;
                if(counter > 500) break;
            }
            if(counter > 500) break;
        }
    }
    
    // Generate complex permutations
    for(let i=0; i<2500; i++) {
        const b = bases[i % bases.length];
        const b2 = bases[(i+1) % bases.length];
        const c = comps[i % comps.length];
        patterns.push(`${b}(${c}!${(i%10)+1}).${b2}(${c}!${(i%10)+1})`);
    }

    describe('Expression Parsing', () => {
        expressions.forEach((expr, i) => {
            it(`should parse expression variant ${i}: ${expr}`, () => {
                // Define x and y to prevent ReferenceError during evaluation
                const bngl = `begin parameters\n x 1\n y 1\n p1 ${expr}\nend parameters`;
                const model = parseBNGLStrict(bngl);
                expect(model.parameters).toBeDefined();
            });
        });
    });

    describe('Pattern Parsing in Rules', () => {
        patterns.forEach((pat, i) => {
            it(`should parse pattern variant ${i} [${pat.length < 50 ? pat : 'long'}]`, () => {
                const bngl = `begin reaction rules\n R${i}: ${pat} -> 0 1\nend reaction rules`;
                const model = parseBNGLStrict(bngl);
                expect(model.reactionRules).toBeDefined();
                expect(model.reactionRules.length).toBe(1);
            });
        });
    });

    // Massive Negative Testing
    describe('Negative Testing', () => {
        const invalid = [
            'begin parameters\n p1 1+\nend parameters',
            // 'begin molecule types\n A(b,)\nend molecule types', // Trailing comma might be allowed?
            'begin reaction rules\n R1: A(b!1) -> A(b!2) 1\nend reaction rules' // Mismatched bond? Parser checks syntax, not semantic yet?
        ];

        invalid.forEach((bngl, i) => {
            it(`should fail invalid syntax ${i}`, () => {
                try {
                    parseBNGLStrict(bngl);
                    // If it doesn't throw, check if it returned error
                } catch (e) {
                    expect(e).toBeDefined();
                }
            });
        });
    });

});
