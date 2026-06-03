import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseBNGL, parseBNGLRegexDeprecated } from '../../services/parseBNGL';
import * as engine from '@bngplayground/engine';

describe('parseBNGL Error Handling in Parameter Evaluation', () => {
  it('should fallback mathematically invalid constants like Infinity to 0', () => {
    const bngl = `
begin parameters
  k1 10
  invalid 1 / 0
end parameters
`;
    const model = parseBNGLRegexDeprecated(bngl);
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
    const model = parseBNGLRegexDeprecated(bngl);
    expect(model.parameters).toBeDefined();
    expect(model.parameters.k1).toBe(10);
    // syntax/variable missing errors return 0 by SafeExpressionEvaluator
    expect(model.parameters.bad_func).toBe(0);
    expect(model.parameters.bad_syntax).toBe(0);
  });
});

describe('parseBNGL wrapper options and error handling', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call options.checkCancelled if provided', () => {
    const checkCancelled = vi.fn();
    parseBNGL('begin parameters\nend parameters', { checkCancelled });
    expect(checkCancelled).toHaveBeenCalledOnce();
  });

  it('should throw an error if result.model is falsy', () => {
    // Mock parseBNGLWithANTLR to return no model
    const mockParse = vi.spyOn(engine, 'parseBNGLWithANTLR').mockReturnValue({
      model: undefined as any,
      success: false,
      errors: [
        { line: 1, column: 5, message: 'Bad token' },
        { line: 2, column: 10, message: 'Unexpected end' }
      ]
    });

    expect(() => parseBNGL('invalid'))
      .toThrowError('BNGL parse error:\nLine 1:5: Bad token\nLine 2:10: Unexpected end');

    mockParse.mockRestore();
  });

  it('should warn if debug is true and there are parse errors', () => {
    // Mock parseBNGLWithANTLR to return a model but success=false
    const mockParse = vi.spyOn(engine, 'parseBNGLWithANTLR').mockReturnValue({
      model: { name: '', parameters: {}, moleculeTypes: [], species: [], observables: [], reactions: [], reactionRules: [] } as any,
      success: false,
      errors: [
        { line: 5, column: 0, message: 'Recoverable error' }
      ]
    });

    parseBNGL('invalid', { debug: true });

    expect(console.warn).toHaveBeenCalledWith(
      '[parseBNGL] ANTLR parse reported errors (best-effort model returned):\nLine 5:0: Recoverable error'
    );

    mockParse.mockRestore();
  });

  it('should set modelName if options.modelName is provided and model.name is not set', () => {
    const model = parseBNGL('begin parameters\n a 1\nend parameters', { modelName: 'MyCustomModel' });
    expect(model.name).toBe('MyCustomModel');
  });

  it('should not overwrite existing model.name with options.modelName', () => {
    // Mock parseBNGLWithANTLR to return a model with an existing name
    const mockParse = vi.spyOn(engine, 'parseBNGLWithANTLR').mockReturnValue({
      model: { name: 'ExistingName', parameters: {}, moleculeTypes: [], species: [], observables: [], reactions: [], reactionRules: [] } as any,
      success: true,
      errors: []
    });

    const model = parseBNGL('test', { modelName: 'NewName' });
    expect(model.name).toBe('ExistingName');

    mockParse.mockRestore();
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
