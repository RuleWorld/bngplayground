import { describe, it, expect } from 'vitest';
import { formatBNGL } from '../../src/utils/formatBNGL';

describe('formatBNGL', () => {
  it('returns empty string for falsy input', () => {
    expect(formatBNGL('')).toBe('');
    expect(formatBNGL(null as unknown as string)).toBe('');
    expect(formatBNGL(undefined as unknown as string)).toBe('');
  });

  it('normalizes newlines and trims trailing whitespace', () => {
    const input = 'begin parameters  \r\n  k1 1.0 \t\r\nend parameters\n';
    const output = formatBNGL(input);
    expect(output).toContain('begin parameters');
    expect(output).toContain('  k1 1.0');
    expect(output).toContain('end parameters');
  });

  it('collapses multiple blank lines to a single one', () => {
    const input = 'begin parameters\n\n\n\n  k1 1.0\n\n\nend parameters';
    const output = formatBNGL(input);
    expect(output).not.toContain('\n\n\n');
  });

  it('indents block contents by two spaces', () => {
    const input = `begin parameters
k1 1.0
  k2 2.0
end parameters`;
    const expected = `begin parameters
  k1 1.0
  k2 2.0
end parameters
`;
    expect(formatBNGL(input)).toBe(expected);
  });

  it('does not indent begin/end block keywords', () => {
    const input = `  begin parameters
  k1 1.0
  end parameters`;
    const expected = `begin parameters
  k1 1.0
end parameters
`;
    expect(formatBNGL(input)).toBe(expected);
  });

  it('reorders blocks into canonical order', () => {
    const input = `begin reaction rules
  A -> B k1
end reaction rules

begin parameters
  k1 1.0
end parameters

begin molecule types
  A()
  B()
end molecule types`;

    const output = formatBNGL(input);

    // We expect the result string to have molecule types before parameters, and parameters before reaction rules
    const moleculeTypesIndex = output.indexOf('begin molecule types');
    const parametersIndex = output.indexOf('begin parameters');
    const reactionRulesIndex = output.indexOf('begin reaction rules');

    expect(moleculeTypesIndex).toBeLessThan(parametersIndex);
    expect(parametersIndex).toBeLessThan(reactionRulesIndex);
    expect(moleculeTypesIndex).not.toBe(-1);
    expect(parametersIndex).not.toBe(-1);
    expect(reactionRulesIndex).not.toBe(-1);
  });

  it('handles lines with reaction arrows correctly', () => {
    const input = `begin reaction rules
A -> B k1
A <- B k2
A <-> B k3
A => B k4
end reaction rules`;

    const expected = `begin reaction rules
  A -> B k1
  A <- B k2
  A <-> B k3
  A => B k4
end reaction rules
`;
    expect(formatBNGL(input)).toBe(expected);
  });

  it('preserves root level statements not in a block', () => {
    const input = `generate_network({overwrite=>1})
simulate({method=>"ode",t_end=>10,n_steps=>10})

begin parameters
  k1 1.0
end parameters`;

    const output = formatBNGL(input);
    expect(output).toContain('generate_network({overwrite=>1})');
    expect(output).toContain('simulate({method=>"ode",t_end=>10,n_steps=>10})');
    expect(output).toContain('begin parameters');
  });
});
