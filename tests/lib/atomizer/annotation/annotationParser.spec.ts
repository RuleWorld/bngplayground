import { describe, it, expect } from 'vitest';
import { getEquivalence } from '../../../../src/lib/atomizer/annotation/annotationParser';
import { describe, it, expect, vi } from 'vitest';
import { getCanonicalSpecies } from '../../../../src/lib/atomizer/annotation/annotationParser';
import { SBMLModel, SBMLSpecies } from '../../../../src/lib/atomizer/config/types';
import { getAnnotationsByDatabase } from '@/src/lib/atomizer/annotation/annotationParser';
import type { SBMLModel, SBMLSpecies, AnnotationInfo } from '@/src/lib/atomizer/config/types';

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

function createMockSpecies(id: string, name: string, annotations: AnnotationInfo[]): SBMLSpecies {
  return {
    id,
    name,
    compartment: 'c',
    initialConcentration: 0,
    initialAmount: 0,
    substanceUnits: 'mole',
    hasOnlySubstanceUnits: false,
    boundaryCondition: false,
    constant: false,
    annotations,
  };
}

function createMockModel(speciesArray: SBMLSpecies[]): SBMLModel {
  const speciesMap = new Map<string, SBMLSpecies>();
  for (const s of speciesArray) {
    speciesMap.set(s.id, s);
  }

  return {
    id: 'test_model',
    name: 'Test Model',
    compartments: new Map(),
    species: speciesMap,
    parameters: new Map(),
    reactions: new Map(),
    rules: [],
    functionDefinitions: new Map(),
    events: [],
    initialAssignments: [],
    speciesByCompartment: new Map(),
    unitDefinitions: new Map(),
  };
}

describe('annotationParser', () => {
  describe('getAnnotationsByDatabase', () => {
    it('should handle an empty model', () => {
      const model = createMockModel([]);
      const result = getAnnotationsByDatabase(model, 'uniprot');
      expect(result.size).toBe(0);
    });

    it('should handle species with no annotations', () => {
      const model = createMockModel([
        createMockSpecies('s1', 'Species 1', [])
      ]);
      const result = getAnnotationsByDatabase(model, 'uniprot');
      expect(result.size).toBe(0);
    });

    it('should find species with matching database annotations', () => {
      const model = createMockModel([
        createMockSpecies('s1', 'Species 1', [
          {
            qualifierType: 0,
            resources: ['https://identifiers.org/uniprot/P12345']
          }
        ]),
        createMockSpecies('s2', 'Species 2', [
          {
            qualifierType: 0,
            resources: ['https://identifiers.org/kegg.compound/C00001']
          }
        ])
      ]);

      const uniprotResult = getAnnotationsByDatabase(model, 'uniprot');
      expect(uniprotResult.size).toBe(1);
      expect(uniprotResult.has('s1')).toBe(true);
      expect(uniprotResult.get('s1')![0].database).toBe('uniprot');
      expect(uniprotResult.get('s1')![0].identifier).toBe('P12345');

      // parseResourceURI maps 'https://identifiers.org/kegg.compound/C00001' to database 'kegg'
      const keggResult = getAnnotationsByDatabase(model, 'kegg');
      expect(keggResult.size).toBe(1);
      expect(keggResult.has('s2')).toBe(true);
      expect(keggResult.get('s2')![0].database).toBe('kegg');
      expect(keggResult.get('s2')![0].identifier).toBe('compound'); // The regex in DATABASE_PATTERNS currently captures this
    });

    it('should match database case-insensitively', () => {
      const model = createMockModel([
        createMockSpecies('s1', 'Species 1', [
          {
            qualifierType: 0,
            resources: ['https://identifiers.org/uniprot/P12345']
          }
        ])
      ]);

      const result1 = getAnnotationsByDatabase(model, 'UniProt');
      expect(result1.size).toBe(1);

      const result2 = getAnnotationsByDatabase(model, 'UNIPROT');
      expect(result2.size).toBe(1);
    });

    it('should map multiple annotations for the same species', () => {
      const model = createMockModel([
        createMockSpecies('s1', 'Species 1', [
          {
            qualifierType: 0,
            resources: ['https://identifiers.org/uniprot/P12345']
          },
          {
            qualifierType: 0,
            resources: ['https://identifiers.org/uniprot/Q67890']
          }
        ])
      ]);

      const result = getAnnotationsByDatabase(model, 'uniprot');
      expect(result.size).toBe(1);
      const annotations = result.get('s1')!;
      expect(annotations.length).toBe(2);
      expect(annotations[0].identifier).toBe('P12345');
      expect(annotations[1].identifier).toBe('Q67890');
    });

    it('should return empty map when no database matches', () => {
      const model = createMockModel([
        createMockSpecies('s1', 'Species 1', [
          {
            qualifierType: 0,
            resources: ['https://identifiers.org/uniprot/P12345']
          }
        ])
      ]);

      const result = getAnnotationsByDatabase(model, 'chebi');
      expect(result.size).toBe(0);
    });
  });
});
