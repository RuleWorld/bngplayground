import { describe, it, expect } from 'vitest';
import { parseBNGL } from '../../services/parseBNGL';

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
