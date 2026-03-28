import { describe, expect, it } from 'vitest';
import { parseBNGLWithANTLR } from '../../src/parser/BNGLParserWrapper';

function wrapRule(ruleLine: string): string {
  return `begin model
begin parameters
  k1 1
  k2 2
end parameters
begin molecule types
  A()
  B()
end molecule types
begin seed species
  A() 10
  B() 10
end seed species
begin reaction rules
  ${ruleLine}
end reaction rules
end model`;
}

describe('RateLaw compatibility checks', () => {
  it('rejects unidirectional rules that provide two rates', () => {
    const parsed = parseBNGLWithANTLR(wrapRule('A() + B() -> B() k1, k2'));
    expect(parsed.success).toBe(false);
    expect(parsed.errors.some((error) => /Unidirectional reaction rules must define exactly one rate constant/.test(error.message))).toBe(true);
  });

  it('accepts bidirectional rules that provide one rate', () => {
    const parsed = parseBNGLWithANTLR(wrapRule('A() + B() <-> B() k1'));
    expect(parsed.success).toBe(true);
  });

  it('accepts bidirectional rules that provide two rates', () => {
    const parsed = parseBNGLWithANTLR(wrapRule('A() + B() <-> B() k1, k2'));
    expect(parsed.success).toBe(true);
  });

  it('rejects TotalRate with MM rate law (BNG2 parity)', () => {
    const parsed = parseBNGLWithANTLR(wrapRule('A() + B() -> B() MM(k1,k2) TotalRate'));
    expect(parsed.success).toBe(false);
    expect(parsed.errors.some((error) => /TotalRate keyword is not compatible with MM type RateLaw\./.test(error.message))).toBe(true);
  });

  it('rejects TotalRate with Arrhenius rate law (BNG2 parity)', () => {
    const parsed = parseBNGLWithANTLR(wrapRule('A() -> B() Arrhenius(0.5,k1) TotalRate'));
    expect(parsed.success).toBe(false);
    expect(parsed.errors.some((error) => /TotalRate keyword is not compatible with Arrhenius type RateLaw\./.test(error.message))).toBe(true);
  });
});