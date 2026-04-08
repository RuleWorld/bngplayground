import { describe, it, expect } from 'vitest';
import { getAllAnnotations } from '../../src/lib/atomizer/annotation/annotationParser';
import { SBMLModel, SBMLSpecies, AnnotationInfo } from '../../src/lib/atomizer/config/types';
import { annotationsToJSON, ParsedAnnotation } from '../../src/lib/atomizer/annotation/annotationParser';
import { SBMLModel } from '../../src/lib/atomizer/config/types';

describe('annotationParser', () => {
  describe('getAllAnnotations', () => {
    it('returns empty map for model with no species', () => {
      const model = {
        species: new Map<string, SBMLSpecies>(),
      } as unknown as SBMLModel;

      const result = getAllAnnotations(model);
      expect(result.size).toBe(0);
    });

    it('skips species with zero annotations', () => {
      const speciesWithoutAnnotations = {
        id: 'species_1',
        name: 'Species 1',
        annotations: [],
      } as unknown as SBMLSpecies;

      const model = {
        species: new Map<string, SBMLSpecies>([
          ['species_1', speciesWithoutAnnotations],
        ]),
      } as unknown as SBMLModel;

      const result = getAllAnnotations(model);
      expect(result.size).toBe(0);
    });

    it('returns map with annotations for species that have them', () => {
      const speciesWithAnnotations = {
        id: 'species_1',
        name: 'Species 1',
        annotations: [
          {
            qualifierType: 1,
            biologicalQualifier: 13,
            resources: ['uniprot/P12345'],
          } as AnnotationInfo,
        ],
      } as unknown as SBMLSpecies;

      const speciesWithoutAnnotations = {
        id: 'species_2',
        name: 'Species 2',
        annotations: [],
      } as unknown as SBMLSpecies;

      const speciesWithMultipleAnnotations = {
        id: 'species_3',
        name: 'Species 3',
        annotations: [
          {
            qualifierType: 1,
            biologicalQualifier: 13,
            resources: ['uniprot/Q98765', 'GO/1234567'],
          } as AnnotationInfo,
          {
            qualifierType: 2,
            modelQualifier: 5,
            resources: ['pubmed/12345'],
          } as AnnotationInfo,
        ],
      } as unknown as SBMLSpecies;

      const model = {
        species: new Map<string, SBMLSpecies>([
          ['species_1', speciesWithAnnotations],
          ['species_2', speciesWithoutAnnotations],
          ['species_3', speciesWithMultipleAnnotations],
        ]),
      } as unknown as SBMLModel;

      const result = getAllAnnotations(model);

      expect(result.size).toBe(2);

      expect(result.has('species_1')).toBe(true);
      const s1Annotations = result.get('species_1')!;
      expect(s1Annotations).toHaveLength(1);
      expect(s1Annotations[0]).toMatchObject({
        speciesId: 'species_1',
        database: 'uniprot',
        identifier: 'P12345',
      });

      expect(result.has('species_2')).toBe(false);

      expect(result.has('species_3')).toBe(true);
      const s3Annotations = result.get('species_3')!;
      expect(s3Annotations).toHaveLength(3);
      expect(s3Annotations[0]).toMatchObject({
        speciesId: 'species_3',
        database: 'uniprot',
        identifier: 'Q98765',
      });
      expect(s3Annotations[1]).toMatchObject({
        speciesId: 'species_3',
        database: 'go',
        identifier: '1234567',
      });
      expect(s3Annotations[2]).toMatchObject({
        speciesId: 'species_3',
        database: 'pubmed',
        identifier: '12345',
      });
    });
  });
});

describe('annotationParser', () => {
  describe('annotationsToJSON', () => {
    it('converts annotations to JSON string correctly', () => {
      // Mock SBMLModel
      const mockModel: Partial<SBMLModel> = {
        species: new Map([
          ['species1', { id: 'species1', name: 'Species One', compartment: 'c', initialConcentration: 1, initialAmount: 0, substanceUnits: 'mole', hasOnlySubstanceUnits: false, boundaryCondition: false, constant: false, annotations: [] }],
          ['species2', { id: 'species2', name: 'Species Two', compartment: 'c', initialConcentration: 1, initialAmount: 0, substanceUnits: 'mole', hasOnlySubstanceUnits: false, boundaryCondition: false, constant: false, annotations: [] }],
        ])
      };

      // Mock Annotation Map
      const annotationMap = new Map<string, ParsedAnnotation[]>([
        ['species1', [
          {
            speciesId: 'species1',
            speciesName: 'Species One',
            qualifierType: 'biological',
            qualifier: 'BQB_IS',
            resources: ['http://identifiers.org/uniprot/P12345'],
            database: 'uniprot',
            identifier: 'P12345'
          }
        ]],
        ['species2', [
          {
            speciesId: 'species2',
            speciesName: 'Species Two',
            qualifierType: 'biological',
            qualifier: 'BQB_IS_VERSION_OF',
            resources: ['http://identifiers.org/kegg.compound/C00001'],
            database: 'kegg.compound',
            identifier: 'C00001'
          }
        ]]
      ]);

      const result = annotationsToJSON(mockModel as SBMLModel, annotationMap);
      const parsedResult = JSON.parse(result);

      expect(parsedResult).toEqual({
        species1: {
          name: 'Species One',
          annotations: [
            {
              qualifier: 'BQB_IS',
              database: 'uniprot',
              identifier: 'P12345',
              uri: 'http://identifiers.org/uniprot/P12345'
            }
          ]
        },
        species2: {
          name: 'Species Two',
          annotations: [
            {
              qualifier: 'BQB_IS_VERSION_OF',
              database: 'kegg.compound',
              identifier: 'C00001',
              uri: 'http://identifiers.org/kegg.compound/C00001'
            }
          ]
        }
      });
    });

    it('falls back to speciesId if name is missing from model species', () => {
      // Mock SBMLModel with a species that has no name
      const mockModel: Partial<SBMLModel> = {
        species: new Map([
          ['species1', { id: 'species1', name: '', compartment: 'c', initialConcentration: 1, initialAmount: 0, substanceUnits: 'mole', hasOnlySubstanceUnits: false, boundaryCondition: false, constant: false, annotations: [] }],
        ])
      };

      // Mock Annotation Map
      const annotationMap = new Map<string, ParsedAnnotation[]>([
        ['species1', [
          {
            speciesId: 'species1',
            speciesName: '',
            qualifierType: 'biological',
            qualifier: 'BQB_IS',
            resources: ['http://identifiers.org/uniprot/P12345'],
            database: 'uniprot',
            identifier: 'P12345'
          }
        ]]
      ]);

      const result = annotationsToJSON(mockModel as SBMLModel, annotationMap);
      const parsedResult = JSON.parse(result);

      expect(parsedResult).toEqual({
        species1: {
          name: 'species1',
          annotations: [
            {
              qualifier: 'BQB_IS',
              database: 'uniprot',
              identifier: 'P12345',
              uri: 'http://identifiers.org/uniprot/P12345'
            }
          ]
        }
      });
    });

    it('falls back to speciesId if species is entirely missing from model', () => {
      // Mock empty SBMLModel
      const mockModel: Partial<SBMLModel> = {
        species: new Map()
      };

      // Mock Annotation Map
      const annotationMap = new Map<string, ParsedAnnotation[]>([
        ['species1', [
          {
            speciesId: 'species1',
            speciesName: '',
            qualifierType: 'biological',
            qualifier: 'BQB_IS',
            resources: ['http://identifiers.org/uniprot/P12345'],
            database: 'uniprot',
            identifier: 'P12345'
          }
        ]]
      ]);

      const result = annotationsToJSON(mockModel as SBMLModel, annotationMap);
      const parsedResult = JSON.parse(result);

      expect(parsedResult).toEqual({
        species1: {
          name: 'species1',
          annotations: [
            {
              qualifier: 'BQB_IS',
              database: 'uniprot',
              identifier: 'P12345',
              uri: 'http://identifiers.org/uniprot/P12345'
            }
          ]
        }
      });
    });

    it('returns empty JSON object for an empty map', () => {
      const mockModel: Partial<SBMLModel> = {
        species: new Map()
      };

      const annotationMap = new Map<string, ParsedAnnotation[]>();

      const result = annotationsToJSON(mockModel as SBMLModel, annotationMap);
      const parsedResult = JSON.parse(result);

      expect(parsedResult).toEqual({});
    });
  });
});
