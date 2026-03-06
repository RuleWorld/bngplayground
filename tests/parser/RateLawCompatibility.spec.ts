import { describe, expect, it } from 'vitest';
import { parseBNGLWithANTLR } from '@bngplayground/engine';

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
  it('rejects TotalRate with MM rate law (BNG2 parity)', () => {
    const bngl = wrapRule('A() + B() -> B() MM(k1,k2) TotalRate');
    const parsed = parseBNGLWithANTLR(bngl);
    expect(parsed.success).toBe(false);
    expect(parsed.errors.some((e) => /TotalRate keyword is not compatible with MM type RateLaw\./.test(e.message))).toBe(true);
  });

  it('rejects TotalRate with Arrhenius rate law (BNG2 parity)', () => {
    const bngl = wrapRule('A() -> B() Arrhenius(0.5,k1) TotalRate');
    const parsed = parseBNGLWithANTLR(bngl);
    expect(parsed.success).toBe(false);
    expect(parsed.errors.some((e) => /TotalRate keyword is not compatible with Arrhenius type RateLaw\./.test(e.message))).toBe(true);
  });
});
