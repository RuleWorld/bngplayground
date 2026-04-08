import { describe, it, expect } from 'vitest';
import { getEquivalence } from '../../../../src/lib/atomizer/annotation/annotationParser';

describe('getEquivalence', () => {
  it('should return [] when the species is the canonical form (first in the list)', () => {
    const rdfDatabase = new Map<string, string[]>([
      ['uri1', ['speciesA', 'speciesB', 'speciesC']],
      ['uri2', ['speciesX', 'speciesY']],
    ]);

    // speciesA is the first one in the uri1 list
    const result = getEquivalence('speciesA', rdfDatabase);
    expect(result).toEqual([]);
  });

  it('should return [canonical_id] when the species is in the equivalence list but not the first one', () => {
    const rdfDatabase = new Map<string, string[]>([
      ['uri1', ['speciesA', 'speciesB', 'speciesC']],
      ['uri2', ['speciesX', 'speciesY']],
    ]);

    // speciesB is not the first one in the uri1 list
    const resultB = getEquivalence('speciesB', rdfDatabase);
    expect(resultB).toEqual(['speciesA']);

    // speciesC is not the first one in the uri1 list
    const resultC = getEquivalence('speciesC', rdfDatabase);
    expect(resultC).toEqual(['speciesA']);

    // speciesY is not the first one in the uri2 list
    const resultY = getEquivalence('speciesY', rdfDatabase);
    expect(resultY).toEqual(['speciesX']);
  });

  it('should return [] when the species is not found in the RDF database at all', () => {
    const rdfDatabase = new Map<string, string[]>([
      ['uri1', ['speciesA', 'speciesB', 'speciesC']],
      ['uri2', ['speciesX', 'speciesY']],
    ]);

    // speciesZ is not in any list
    const result = getEquivalence('speciesZ', rdfDatabase);
    expect(result).toEqual([]);
  });

  it('should return [] for an empty database', () => {
    const rdfDatabase = new Map<string, string[]>();
    const result = getEquivalence('speciesA', rdfDatabase);
    expect(result).toEqual([]);
  });
});
