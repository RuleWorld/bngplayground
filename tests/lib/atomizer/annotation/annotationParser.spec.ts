import { describe, it, expect } from 'vitest';
import { getEquivalence } from '../../../../src/lib/atomizer/annotation/annotationParser';
import { describe, it, expect, vi } from 'vitest';
import { getCanonicalSpecies } from '../../../../src/lib/atomizer/annotation/annotationParser';
import { SBMLModel, SBMLSpecies } from '../../../../src/lib/atomizer/config/types';

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

describe('annotationParser', () => {
  describe('getCanonicalSpecies', () => {
    it('should return the species with the shortest name as the canonical form', () => {
      const equivalenceMap = new Map<string, string[]>([
        ['uniprot:P12345', ['species1', 'species2', 'species3']],
      ]);

      const mockModel = {
        species: new Map<string, SBMLSpecies>([
          ['species1', { id: 'species1', name: 'LongSpeciesName', annotations: [] } as any],
          ['species2', { id: 'species2', name: 'Short', annotations: [] } as any],
          ['species3', { id: 'species3', name: 'MediumName', annotations: [] } as any],
        ]),
      } as SBMLModel;

      const result = getCanonicalSpecies(equivalenceMap, mockModel);

      // 'species2' is shortest ("Short")
      expect(result.get('species1')).toBe('species2');
      expect(result.get('species3')).toBe('species2');
      expect(result.has('species2')).toBe(false); // Canonical species shouldn't be mapped to itself
    });

    it('should fall back to alphabetical order if lengths are equal', () => {
      const equivalenceMap = new Map<string, string[]>([
        ['uniprot:P12345', ['species1', 'species2']],
      ]);

      const mockModel = {
        species: new Map<string, SBMLSpecies>([
          ['species1', { id: 'species1', name: 'NameB', annotations: [] } as any],
          ['species2', { id: 'species2', name: 'NameA', annotations: [] } as any],
        ]),
      } as SBMLModel;

      const result = getCanonicalSpecies(equivalenceMap, mockModel);

      // Both are length 5. 'NameA' comes before 'NameB'
      expect(result.get('species1')).toBe('species2');
      expect(result.has('species2')).toBe(false);
    });

    it('should fall back to species ID if name is not available', () => {
      const equivalenceMap = new Map<string, string[]>([
        ['uniprot:P12345', ['species1', 'species2']],
      ]);

      const mockModel = {
        species: new Map<string, SBMLSpecies>([
          ['species1', { id: 'species1', annotations: [] } as any], // no name, falls back to 'species1'
          ['species2', { id: 'species2', name: 'Short', annotations: [] } as any],
        ]),
      } as SBMLModel;

      const result = getCanonicalSpecies(equivalenceMap, mockModel);

      // 'Short' (5) is shorter than 'species1' (8)
      expect(result.get('species1')).toBe('species2');
    });

    it('should use species ID if name is missing and falls back to alphabetical', () => {
      const equivalenceMap = new Map<string, string[]>([
        ['uniprot:P12345', ['b_species', 'a_species']],
      ]);

      const mockModel = {
        species: new Map<string, SBMLSpecies>([
          ['b_species', { id: 'b_species', annotations: [] } as any], // no name, falls back to 'b_species'
          ['a_species', { id: 'a_species', annotations: [] } as any], // no name, falls back to 'a_species'
        ]),
      } as SBMLModel;

      const result = getCanonicalSpecies(equivalenceMap, mockModel);

      // Both length 9. 'a_species' comes first
      expect(result.get('b_species')).toBe('a_species');
      expect(result.has('a_species')).toBe(false);
    });

    it('should correctly handle an equivalence group with only one member', () => {
      const equivalenceMap = new Map<string, string[]>([
        ['uniprot:P12345', ['species1']],
      ]);

      const mockModel = {
        species: new Map<string, SBMLSpecies>([
          ['species1', { id: 'species1', name: 'SpeciesOne', annotations: [] } as any],
        ]),
      } as SBMLModel;

      const result = getCanonicalSpecies(equivalenceMap, mockModel);

      // Map should be empty since canonical is not mapped to itself
      expect(result.size).toBe(0);
    });

    it('should process multiple equivalence groups correctly', () => {
      const equivalenceMap = new Map<string, string[]>([
        ['group1', ['s1', 's2']],
        ['group2', ['s3', 's4']],
      ]);

      const mockModel = {
        species: new Map<string, SBMLSpecies>([
          ['s1', { id: 's1', name: 'LongA', annotations: [] } as any],
          ['s2', { id: 's2', name: 'A', annotations: [] } as any],
          ['s3', { id: 's3', name: 'B', annotations: [] } as any],
          ['s4', { id: 's4', name: 'LongB', annotations: [] } as any],
        ]),
      } as SBMLModel;

      const result = getCanonicalSpecies(equivalenceMap, mockModel);

      // group1: 's2' is canonical
      expect(result.get('s1')).toBe('s2');
      // group2: 's3' is canonical
      expect(result.get('s4')).toBe('s3');

      expect(result.size).toBe(2);
    });
  });
});
