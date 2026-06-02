import { describe, it, expect, vi } from 'vitest';
import { parseBNGL, parseBNGLRegexDeprecated } from '../../services/parseBNGL';

describe('parseBNGL Error Handling in Parameter Evaluation', () => {
  it('should fallback mathematically invalid constants like Infinity to 0', () => {
    const bngl = `
begin parameters
  k1 10
  invalid 1 / 0
end parameters
`;
    const model = parseBNGL(bngl);
    expect(model.parameters).toBeDefined();
    expect(model.parameters.k1).toBe(10);
    // mathematically invalid operations return 0 by SafeExpressionEvaluator
    expect(model.parameters.invalid).toBe(0);
  });

  it('should handle syntactically invalid expressions or variables appropriately', () => {
    const bngl = `
begin parameters
  k1 10
  bad_func missing_function(k1)
  bad_syntax (k1 *
end parameters
`;
    const model = parseBNGL(bngl);
    expect(model.parameters).toBeDefined();
    expect(model.parameters.k1).toBe(10);
    // syntax/variable missing errors return 0 by SafeExpressionEvaluator
    expect(model.parameters.bad_func).toBe(0);
    expect(model.parameters.bad_syntax).toBe(0);
  });
});

describe('parseBNGLRegexDeprecated', () => {
  it('should parse basic parameters and reactions', () => {
    const code = `
begin parameters
  k1 1.0
  k2 2.0
end parameters
begin molecule types
  A()
  B()
end molecule types
begin species
  A() 100
end species
begin reaction rules
  A() -> B() k1
end reaction rules
    `;
    const model = parseBNGLRegexDeprecated(code);
    expect(model.parameters).toEqual({ k1: 1.0, k2: 2.0 });
    expect(model.species).toEqual([ { name: 'A()', initialConcentration: 100 } ]);
    expect(model.reactionRules.length).toBe(1);
    expect(model.reactionRules[0].reactants).toEqual(['A()']);
    expect(model.reactionRules[0].products).toEqual(['B()']);
    expect(model.reactionRules[0].rate).toBe('k1');
  });

  it('should call checkCancelled if provided', () => {
    const checkCancelled = vi.fn();
    parseBNGLRegexDeprecated('begin parameters\nend parameters\n', { checkCancelled });
    // checkCancelled is called per statement processing, so it should be called
    expect(checkCancelled).toHaveBeenCalled();
  });

  it('should handle debug flag', () => {
    const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    parseBNGLRegexDeprecated('generate_network({max_iter=>10,overwrite=>1})', { debug: true });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
