import { describe, expect, it } from 'vitest';
import { normalizeStructureExperimentalData } from '../src/handlers/searchStructure.js';
import { searchStructureArgsSchema } from '../src/schemas/index.js';

describe('search_structure input validation', () => {
  it('accepts and normalizes grouped observable data', () => {
    const parsed = searchStructureArgsSchema.parse({
      code: 'begin model\nend model',
      experimental_data: [
        { time: 0, observables: { A: 1, B: 2 } },
        { time: 1, observables: { A: 3 } },
      ],
      inclusion_prior: 0,
    });

    expect(normalizeStructureExperimentalData(parsed.experimental_data)).toEqual([
      { time: 0, observable: 'A', value: 1 },
      { time: 0, observable: 'B', value: 2 },
      { time: 1, observable: 'A', value: 3 },
    ]);
    expect(parsed.inclusion_prior).toBe(0);
  });

  it('preserves the engine-native flat data shape', () => {
    const parsed = searchStructureArgsSchema.parse({
      code: 'begin model\nend model',
      experimental_data: [
        { time: 0, observable: 'A', value: 1, error: 0.1 },
      ],
    });

    expect(normalizeStructureExperimentalData(parsed.experimental_data)).toEqual(parsed.experimental_data);
  });

  it.each([
    { code: '', experimental_data: [{ time: 0, observable: 'A', value: 1 }] },
    { code: 'model', experimental_data: [] },
    { code: 'model', experimental_data: [{ time: 0, observables: {} }] },
    { code: 'model', experimental_data: [{ time: 0, observable: 'A' }] },
    { code: 'model', experimental_data: [{ time: 0, observable: 'A', value: Number.NaN }] },
    { code: 'model', experimental_data: [{ time: 0, observable: 'A', value: 1 }], inclusion_prior: -0.1 },
    { code: 'model', experimental_data: [{ time: 0, observable: 'A', value: 1 }], inclusion_prior: 1.1 },
  ])('rejects malformed input: %o', (input) => {
    expect(searchStructureArgsSchema.safeParse(input).success).toBe(false);
  });
});
