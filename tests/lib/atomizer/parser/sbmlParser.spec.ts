import { describe, it, expect } from 'vitest';
import { extractGOTerms } from '../../../../src/lib/atomizer/parser/sbmlParser';

describe('sbmlParser', () => {
  describe('extractGOTerms', () => {
    it('returns an empty array when given an empty resources list', () => {
      expect(extractGOTerms([])).toEqual([]);
    });

    it('extracts a single GO term separated by colon', () => {
      expect(extractGOTerms(['http://identifiers.org/go/GO:0005886'])).toEqual(['GO:0005886']);
    });

    it('extracts a single GO term separated by slash', () => {
      expect(extractGOTerms(['http://identifiers.org/go/GO/0005886'])).toEqual(['GO:0005886']);
    });

    it('extracts a GO term in lowercase', () => {
      expect(extractGOTerms(['http://identifiers.org/go/go:0005886'])).toEqual(['GO:0005886']);
    });

    it('extracts multiple GO terms from different resources', () => {
      const resources = [
        'http://identifiers.org/go/GO:0005886',
        'http://identifiers.org/go/GO:0005623'
      ];
      expect(extractGOTerms(resources)).toEqual(['GO:0005886', 'GO:0005623']);
    });

    it('ignores resources that do not contain a GO term', () => {
      const resources = [
        'http://identifiers.org/go/GO:0005886',
        'http://identifiers.org/uniprot/P12345',
        'http://identifiers.org/go/GO:0005623'
      ];
      expect(extractGOTerms(resources)).toEqual(['GO:0005886', 'GO:0005623']);
    });

    it('ignores invalid GO term formats', () => {
      const resources = [
        'http://identifiers.org/go/GO-0005886', // Invalid separator
        'http://identifiers.org/go/GO:abc',    // Invalid numbers
        'http://identifiers.org/go/G:0005886'  // Missing 'O'
      ];
      expect(extractGOTerms(resources)).toEqual([]);
    });
  });
});
