import { describe, it, expect } from 'vitest';
import { getAllAnnotations } from '../../src/lib/atomizer/annotation/annotationParser';
import { SBMLModel, SBMLSpecies, AnnotationInfo } from '../../src/lib/atomizer/config/types';

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
