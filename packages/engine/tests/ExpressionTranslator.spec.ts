import { describe, it, expect } from 'vitest';
import { ExpressionTranslator } from '../src/services/graph/core/ExpressionTranslator';

describe('ExpressionTranslator', () => {
  it('translates expressions with overlapping function names', () => {
    // Before the fix, sin(x) + asin(x) might translate incorrectly due to multiple regex passes.
    expect(ExpressionTranslator.translate('sin(x) + asin(x)')).toBe('Math.sin(x) + Math.asin(x)');
  });

  it('translates isolated functions correctly', () => {
    expect(ExpressionTranslator.translate('sin(x)')).toBe('Math.sin(x)');
    expect(ExpressionTranslator.translate('asin(x)')).toBe('Math.asin(x)');
    expect(ExpressionTranslator.translate('cos(x)')).toBe('Math.cos(x)');
    expect(ExpressionTranslator.translate('acos(x)')).toBe('Math.acos(x)');
  });

  it('does not re-translate already translated functions', () => {
    expect(ExpressionTranslator.translate('Math.sin(x) + asin(x)')).toBe('Math.sin(x) + Math.asin(x)');
    expect(ExpressionTranslator.translate('sin(x) + Math.asin(x)')).toBe('Math.sin(x) + Math.asin(x)');
  });

  it('translates multiple functions in a complex expression', () => {
    expect(ExpressionTranslator.translate('sin(x) + cos(x) * asin(y) - log10(z)')).toBe('Math.sin(x) + Math.cos(x) * Math.asin(y) - Math.log10(z)');
  });
});
