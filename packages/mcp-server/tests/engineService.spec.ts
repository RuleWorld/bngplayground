import { describe, expect, it } from 'vitest';
import { createToolResult, sanitizeForMcp } from '../src/services/engine.js';
import { structureError } from '../src/services/errors.js';

describe('MCP analysis result boundaries', () => {
  it('preserves non-finite metric meaning instead of serializing it as null', () => {
    const result = createToolResult({ conditionNumber: Infinity, residual: NaN });

    expect(result.structuredContent).toEqual({
      conditionNumber: 'Infinity',
      residual: 'NaN',
    });
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
    expect(sanitizeForMcp({ negative: -Infinity })).toEqual({ negative: '-Infinity' });
  });

  it('maps analysis data contract failures to an actionable MCP error', () => {
    const result = structureError(Object.assign(
      new Error('FIM baseline simulation returned no trajectory data.'),
      { name: 'AnalysisDataError' },
    ));

    expect(result.code).toBe('INVALID_ANALYSIS_RESULT');
    expect(result.diagnosis).toMatch(/empty|malformed|trajectory/i);
  });
});
