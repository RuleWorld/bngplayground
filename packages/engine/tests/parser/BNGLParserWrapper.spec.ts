import { describe, it, expect } from 'vitest';
import { parseBNGLWithANTLR, parseBNGLStrict } from '../../src/parser/BNGLParserWrapper.ts';
import { getExpressionDependencies } from '../../src/parser/ExpressionDependencies.ts';

describe('BNGLParserWrapper SLL & Lexer Diagnostics', () => {
  it('preserves lexer errors on malformed tokens even when SLL parsing triggers fallback', () => {
    // Model contains malformed lexer characters ($@#) mixed with BNGL syntax
    const malformedBNGL = `
begin model
begin molecule types
  A(x)
  $@#
end molecule types
begin seed species
  A(x) 10
end seed species
end model
    `;

    const result = parseBNGLWithANTLR(malformedBNGL);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);

    // Verify lexer errors were preserved
    const hasLexerOrSyntaxError = result.errors.some(
      (err) => err.line > 0 && err.message && err.message.length > 0
    );
    expect(hasLexerOrSyntaxError).toBe(true);
  });

  it('parses valid models in SLL mode without syntax errors', () => {
    const validBNGL = `
begin model
begin molecule types
  A(x,y)
  B(a)
end molecule types
begin seed species
  A(x,y) 100
  B(a) 50
end seed species
begin reaction rules
  A(x) + B(a) -> A(x!1).B(a!1) k_bind
end reaction rules
end model
    `;

    const result = parseBNGLWithANTLR(validBNGL);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.model).toBeDefined();
    expect(result.model?.moleculeTypes).toHaveLength(2);
    expect(result.model?.reactionRules).toHaveLength(1);
  });

  it('handles BNG2 legacy "begin molecules" blocks', () => {
    const legacyBNGL = `
begin model
begin molecules
  A(s~0~1)
end molecules
begin seed species
  A(s~0) 10
end seed species
end model
    `;

    const result = parseBNGLWithANTLR(legacyBNGL);
    expect(result.success).toBe(true);
    expect(result.model?.moleculeTypes[0].name).toBe('A');
  });

  it('handles line continuations in reaction rules', () => {
    const continuedBNGL = `
begin model
begin molecule types
  A(x)
  B(y)
end molecule types
begin reaction rules
  A(x) + \\
  B(y) -> A(x!1).B(y!1) k1
end reaction rules
end model
    `;

    const result = parseBNGLStrict(continuedBNGL);
    expect(result.reactionRules).toHaveLength(1);
    expect(result.reactionRules[0].reactants).toHaveLength(2);
  });

  it('expands state-inheritance % labels into concrete rules (BNG2 parity)', () => {
    const percentBNGL = `
begin model
begin molecule types
  A(c~0~1)
end molecule types
begin reaction rules
  A(c%1) -> A(c%1) k_mod
end reaction rules
end model
    `;

    const result = parseBNGLStrict(percentBNGL);
    expect(result.reactionRules.length).toBeGreaterThan(0);
  });

  it('extracts expression dependencies safely in SLL mode', () => {
    const deps = getExpressionDependencies('k1 * A(x) + exp(-Ea / (R * T))');
    expect(deps.has('k1')).toBe(true);
    expect(deps.has('Ea')).toBe(true);
    expect(deps.has('R')).toBe(true);
    expect(deps.has('T')).toBe(true);
    expect(deps.has('exp')).toBe(false); // built-in math function
  });
});
