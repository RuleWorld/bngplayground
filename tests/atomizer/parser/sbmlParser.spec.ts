import { describe, it, expect } from 'vitest';
import { extractUniProtIds } from '../../../src/lib/atomizer/parser/sbmlParser';

describe('extractUniProtIds', () => {
  it('should return an empty array when given an empty list', () => {
    expect(extractUniProtIds([])).toEqual([]);
  });

  it('should return an empty array when no UniProt IDs are present', () => {
    const resources = [
      'urn:miriam:go:GO:0005623',
      'http://identifiers.org/kegg.pathway/hsa04010',
      'invalid_resource_string'
    ];
    expect(extractUniProtIds(resources)).toEqual([]);
  });

  it('should extract a valid UniProt ID with a colon separator', () => {
    const resources = ['urn:miriam:uniprot:P12345'];
    expect(extractUniProtIds(resources)).toEqual(['P12345']);
  });

  it('should extract a valid UniProt ID with a slash separator', () => {
    const resources = ['http://identifiers.org/uniprot/Q9Y243'];
    expect(extractUniProtIds(resources)).toEqual(['Q9Y243']);
  });

  it('should be case-insensitive to the "uniprot" prefix', () => {
    const resources = [
      'urn:miriam:UniProt:P12345',
      'http://identifiers.org/UNIPROT/Q9Y243'
    ];
    expect(extractUniProtIds(resources)).toEqual(['P12345', 'Q9Y243']);
  });

  it('should extract multiple UniProt IDs from a list of resources', () => {
    const resources = [
      'urn:miriam:go:GO:0005623',
      'urn:miriam:uniprot:P12345',
      'http://identifiers.org/uniprot/Q9Y243',
      'random_string'
    ];
    expect(extractUniProtIds(resources)).toEqual(['P12345', 'Q9Y243']);
  });

  it('should handle IDs with letters and numbers', () => {
    const resources = ['uniprot:A1B2C3D4'];
    expect(extractUniProtIds(resources)).toEqual(['A1B2C3D4']);
  });
});
