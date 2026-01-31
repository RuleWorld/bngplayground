import { describe, it, expect } from 'vitest';
import { parseParametersFromCode, isNumericLiteral, stripParametersBlock } from '../../services/paramUtils';

describe('paramUtils', () => {
  it('parses parameters block', () => {
    const code = `
      begin parameters
        kf 1.0
        kr 2.5e-3
        complex (1+2)
      end parameters

      begin molecule types
        A(b)
      end molecule types
    `;
    const map = parseParametersFromCode(code);
    expect(map.get('kf')).toBe('1.0');
    expect(map.get('kr')).toBe('2.5e-3');
    expect(map.get('complex')).toBe('(1+2)');
  });

  it('detects numeric literals', () => {
    expect(isNumericLiteral('1.0')).toBe(true);
    expect(isNumericLiteral('+3.2')).toBe(true);
    expect(isNumericLiteral('-0.5e2')).toBe(true);
    expect(isNumericLiteral('(1.0)')).toBe(true);
    expect(isNumericLiteral('k_total')).toBe(false);
    expect(isNumericLiteral('1+2')).toBe(false);
  });

  it('strips parameters block', () => {
    const code = `begin parameters\n  kf 1.0\nend parameters\nbegin molecule types\n A(b)\nend molecule types`;
    const stripped = stripParametersBlock(code);
    expect(stripped.includes('molecule types')).toBe(true);
    expect(stripped.includes('parameters')).toBe(false);
  });
});