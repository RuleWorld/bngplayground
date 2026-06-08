import { describe, it, expect } from 'vitest';
import { parseBNGLWithANTLR } from '../src/parser/BNGLParserWrapper';

describe('Seed species and reaction rule products component completeness validation (BNG2 parity)', () => {
  it('should parse control.bngl successfully since seeds are fully specified', () => {
    const controlBngl = `
begin model
begin parameters
  kf 0.05
  kr 0.1
end parameters
begin molecule types
  JAK(cat)
  STAT3(b)
end molecule types
begin seed species
  JAK(cat) 100
  STAT3(b) 100
end seed species
begin observables
  Species   Complex  JAK(cat!1).STAT3(b!1)
  Molecules JAKfree  JAK(cat)
end observables
begin reaction rules
  bind: JAK(cat) + STAT3(b) <-> JAK(cat!1).STAT3(b!1) kf, kr
end reaction rules
end model
generate_network({overwrite=>1})
simulate({method=>"ode", t_end=>20, n_steps=>40})
`;
    const result = parseBNGLWithANTLR(controlBngl);
    expect(result.success).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should fail to parse bug.bngl because seed species are underspecified', () => {
    const bugBngl = `
begin model
begin parameters
  kf 0.05
  kr 0.1
end parameters
begin molecule types
  JAK(cat)
  STAT3(b)
end molecule types
begin seed species
  JAK()   100        # <-- missing 'cat'
  STAT3() 100        # <-- missing 'b'
end seed species
begin observables
  Species   Complex  JAK(cat!1).STAT3(b!1)
  Molecules JAKfree  JAK(cat)
end observables
begin reaction rules
  bind: JAK(cat) + STAT3(b) <-> JAK(cat!1).STAT3(b!1) kf, kr
end reaction rules
end model
generate_network({overwrite=>1})
simulate({method=>"ode", t_end=>20, n_steps=>40})
`;
    const result = parseBNGLWithANTLR(bugBngl);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBe(2);

    expect(result.errors[0].message).toContain('Component(s) cat missing from molecule JAK()');
    expect(result.errors[0].line).toBe(12);

    expect(result.errors[1].message).toContain('Component(s) b missing from molecule STAT3()');
    expect(result.errors[1].line).toBe(13);
  });

  it('should fail when a synthesis rule creates an incomplete molecule', () => {
    const synthesisBngl = `
begin model
begin parameters
  kf 0.05
end parameters
begin molecule types
  JAK(cat)
  STAT3(b)
end molecule types
begin seed species
  JAK(cat) 100
  STAT3(b) 100
end seed species
begin reaction rules
  synthesis: 0 -> JAK() kf
end reaction rules
end model
`;
    const result = parseBNGLWithANTLR(synthesisBngl);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toBe('Molecule created in reaction rule: Component(s) cat missing from molecule JAK()');
    expect(result.errors[0].line).toBe(15);
  });

  it('should fail when a rule creates a molecule with a missing component', () => {
    const ruleCreatedBngl = `
begin model
begin parameters
  kf 0.05
end parameters
begin molecule types
  A(b)
  B(a,foo)
end molecule types
begin seed species
  A(b) 100
end seed species
begin reaction rules
  A(b) -> A(b!1).B(a!1) kf
end reaction rules
end model
`;
    const result = parseBNGLWithANTLR(ruleCreatedBngl);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toBe('Molecule created in reaction rule: Component(s) foo missing from molecule B(a!1)');
    expect(result.errors[0].line).toBe(14);
  });

  it('should pass when reactant mapping allows underspecification in product molecules', () => {
    const rhsAllowedBngl = `
begin model
begin parameters
  kf 0.05
  kr 0.1
end parameters
begin molecule types
  JAK(cat,foo)
  STAT3(b)
end molecule types
begin seed species
  JAK(cat,foo) 100
  STAT3(b) 100
end seed species
begin reaction rules
  bind: JAK(cat) + STAT3(b) <-> JAK(cat!1).STAT3(b!1) kf, kr
end reaction rules
end model
`;
    const result = parseBNGLWithANTLR(rhsAllowedBngl);
    expect(result.success).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should fail when homodimerization rule has both products incomplete and thus exceeds reactant count', () => {
    const homodimerBngl = `
begin model
begin parameters
  kf 0.05
end parameters
begin molecule types
  A(b,foo)
end molecule types
begin seed species
  A(b,foo) 100
end seed species
begin reaction rules
  A(b) -> A(b!1).A(b!1) kf
end reaction rules
end model
`;
    const result = parseBNGLWithANTLR(homodimerBngl);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toBe('Molecule created in reaction rule: Component(s) foo missing from molecule A(b!1)');
    expect(result.errors[0].line).toBe(13);
  });

  it('should pass when homodimerization rule has at least one complete product mapping to the created molecule', () => {
    const homodimerMixedBngl = `
begin model
begin parameters
  kf 0.05
end parameters
begin molecule types
  A(b,foo)
end molecule types
begin seed species
  A(b,foo) 100
end seed species
begin reaction rules
  A(b) -> A(b!1,foo).A(b!1) kf
end reaction rules
end model
`;
    const result = parseBNGLWithANTLR(homodimerMixedBngl);
    expect(result.success).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});
