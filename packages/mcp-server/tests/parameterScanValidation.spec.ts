import { describe, expect, it } from 'vitest';
import { handleParameterScan } from '../src/handlers/parameterScan.js';
import { parameterScanArgsSchema } from '../src/schemas/core.js';

const MODEL_WITHOUT_OBSERVABLES = `begin model
begin parameters
  k1 1
end parameters
begin molecule types
  A()
end molecule types
begin seed species
  A() 10
end seed species
begin reaction rules
  A() -> 0 k1
end reaction rules
end model`;

const validArgs = {
  code: 'begin model\nend model',
  parameter: 'k1',
  start: 0.1,
  end: 1,
  steps: 5,
};

function errorText(result: Awaited<ReturnType<typeof handleParameterScan>>): string {
  const error = result.structuredContent;
  if (typeof error === 'object' && error !== null && 'error' in error) {
    return String(error.error);
  }
  return '';
}

describe('parameterScanArgsSchema', () => {
  it('trims parameter names while preserving model code', () => {
    const parsed = parameterScanArgsSchema.parse({
      ...validArgs,
      code: '  begin model\nend model  ',
      parameter: '  k1  ',
      parameter2: '  k2  ',
      start2: 0.2,
      end2: 2,
      steps2: 4,
    });

    expect(parsed.code).toBe('  begin model\nend model  ');
    expect(parsed.parameter).toBe('k1');
    expect(parsed.parameter2).toBe('k2');
  });

  it.each([
    [{ ...validArgs, code: '   ' }, /Model code must be a non-empty string/],
    [{ ...validArgs, parameter: '   ' }, /Parameter name must be a non-empty string/],
    [{ ...validArgs, parameter2: '   ', start2: 1, end2: 2, steps2: 2 }, /parameter2 must be a non-empty string/],
  ])('rejects blank required strings', (args, expected) => {
    expect(() => parameterScanArgsSchema.parse(args)).toThrow(expected);
  });

  it('requires a complete secondary range and distinct parameters', () => {
    expect(() => parameterScanArgsSchema.parse({
      ...validArgs,
      parameter2: 'k2',
      start2: 0.1,
    })).toThrow(/requires start2, end2, and steps2/);

    expect(() => parameterScanArgsSchema.parse({
      ...validArgs,
      start2: 0.1,
      end2: 1,
      steps2: 3,
    })).toThrow(/parameter2 is required/);

    expect(() => parameterScanArgsSchema.parse({
      ...validArgs,
      parameter: ' k1 ',
      parameter2: 'k1',
      start2: 0.1,
      end2: 1,
      steps2: 3,
    })).toThrow(/two distinct parameters/);
  });

  it('requires positive bounds for logarithmic scans', () => {
    expect(() => parameterScanArgsSchema.parse({
      ...validArgs,
      start: 0,
      logarithmic: true,
    })).toThrow(/positive start and end bounds/);

    expect(() => parameterScanArgsSchema.parse({
      ...validArgs,
      parameter2: 'k2',
      start2: -1,
      end2: 1,
      steps2: 2,
      logarithmic: true,
    })).toThrow(/positive start2 and end2 bounds/);
  });

  it('rejects scans larger than 400 simulation combinations', () => {
    expect(() => parameterScanArgsSchema.parse({
      ...validArgs,
      steps: 25,
      parameter2: 'k2',
      start2: 0.1,
      end2: 1,
      steps2: 20,
    })).toThrow(/at most 400 simulation combinations/);
  });
});

describe('handleParameterScan model validation', () => {
  it('rejects models without observables before simulation', async () => {
    const result = await handleParameterScan({
      code: MODEL_WITHOUT_OBSERVABLES,
      parameter: 'k1',
      start: 0.1,
      end: 1,
      steps: 3,
    });

    expect(errorText(result)).toMatch(/at least one observable/);
  });
});
