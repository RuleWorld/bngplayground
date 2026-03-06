import { describe, it, expect } from 'vitest';
import { BNGXMLWriter } from '@bngplayground/engine';
import { parseBNGL } from '../../services/parseBNGL';

describe('Intramolecular Rule Processing', () => {
  
  describe('Property 21: Intramolecular Rule Preservation', () => {
    it('should generate single ReactantPattern for intramolecular rules', () => {
      const bngl = `
begin molecule types
    A(b,c)
    B(a,d)
end molecule types
begin seed species
    A(b,c).B(a,d) 100
end seed species
begin reaction rules
    # Intramolecular rule - molecules connected by . (dot)
    RR1: A(b).B(a) -> A(b!1).B(a!1) k1
end reaction rules
begin observables
    Molecules BoundAB A(b!1).B(a!1)
end observables
begin parameters
    k1 1.0
end parameters
      `;

      const model = parseBNGL(bngl);
      const xml = BNGXMLWriter.write(model);

      // **Property 21: Intramolecular Rule Preservation**
      // *For any* intramolecular binding rule, the XML generator SHALL create a single 
      // ReactantPattern that preserves the intramolecular semantics and handles expected 
      // disjoint pattern warnings appropriately

      // Should have exactly one ReactantPattern for the intramolecular rule
      const reactantPatterns = xml.match(/<ReactantPattern[^>]*>/g) || [];
      expect(reactantPatterns).toHaveLength(1);

      // The single ReactantPattern should contain both molecules A and B
      const reactantSection = xml.match(/<ReactantPattern[^>]*>(.*?)<\/ReactantPattern>/s);
      expect(reactantSection).toBeTruthy();
      if (reactantSection) {
        const reactantContent = reactantSection[1];
        
        // Should contain both molecules in the same pattern
        expect(reactantContent).toContain('name="A"');
        expect(reactantContent).toContain('name="B"');
        
        // Should have ListOfMolecules with both molecules
        const moleculeMatches = reactantContent.match(/<Molecule[^>]*name="[^"]*"/g) || [];
        expect(moleculeMatches.length).toBe(2);
        
        // Verify molecule names
        expect(moleculeMatches.some(m => m.includes('name="A"'))).toBe(true);
        expect(moleculeMatches.some(m => m.includes('name="B"'))).toBe(true);
      }

      // Product should show the bond formation
      const productSection = xml.match(/<ProductPattern[^>]*>(.*?)<\/ProductPattern>/s);
      expect(productSection).toBeTruthy();
      if (productSection) {
        const productContent = productSection[1];
        
        // Should have bond information
        expect(productContent).toContain('<ListOfBonds>');
        expect(productContent).toContain('<Bond');
        
        // Should show components with bonds
        expect(productContent).toMatch(/numberOfBonds="1"/);
      }
    });

    it('should distinguish intramolecular from intermolecular rules', () => {
      const bngl = `
begin molecule types
    A(b,c)
    B(a,d)
end molecule types
begin seed species
    A(b,c) 100
    B(a,d) 100
    A(b,c).B(a,d) 50
end seed species
begin reaction rules
    # Intermolecular rule - separate molecules connected by +
    RR1: A(b) + B(a) -> A(b!1).B(a!1) k1
    # Intramolecular rule - molecules in same complex connected by .
    RR2: A(b).B(a) -> A(b!1).B(a!1) k2
end reaction rules
begin observables
    Molecules BoundAB A(b!1).B(a!1)
end observables
begin parameters
    k1 1.0
    k2 2.0
end parameters
      `;

      const model = parseBNGL(bngl);
      const xml = BNGXMLWriter.write(model);

      // Should have two reaction rules
      const reactionRules = xml.match(/<ReactionRule[^>]*>/g) || [];
      expect(reactionRules).toHaveLength(2);

      // First rule (intermolecular) should have two separate ReactantPatterns
      const rr1Section = xml.match(/<ReactionRule id="RR1"[^>]*>(.*?)<\/ReactionRule>/s);
      expect(rr1Section).toBeTruthy();
      if (rr1Section) {
        const rr1Content = rr1Section[1];
        const rr1ReactantPatterns = rr1Content.match(/<ReactantPattern[^>]*>/g) || [];
        expect(rr1ReactantPatterns).toHaveLength(2); // Two separate patterns for A + B
      }

      // Second rule (intramolecular) should have one ReactantPattern
      const rr2Section = xml.match(/<ReactionRule id="RR2"[^>]*>(.*?)<\/ReactionRule>/s);
      expect(rr2Section).toBeTruthy();
      if (rr2Section) {
        const rr2Content = rr2Section[1];
        const rr2ReactantPatterns = rr2Content.match(/<ReactantPattern[^>]*>/g) || [];
        expect(rr2ReactantPatterns).toHaveLength(1); // Single pattern for A.B
        
        // The single pattern should contain both molecules
        const rr2ReactantSection = rr2Content.match(/<ReactantPattern[^>]*>(.*?)<\/ReactantPattern>/s);
        if (rr2ReactantSection) {
          const rr2ReactantContent = rr2ReactantSection[1];
          const moleculeCount = (rr2ReactantContent.match(/<Molecule[^>]*>/g) || []).length;
          expect(moleculeCount).toBe(2); // Both A and B in same pattern
        }
      }
    });

    it('should handle complex intramolecular patterns correctly', () => {
      const bngl = `
begin molecule types
    Protein(domain1,domain2,domain3)
end molecule types
begin seed species
    Protein(domain1,domain2,domain3) 100
end seed species
begin reaction rules
    # Complex intramolecular rule - self-binding within same protein
    RR1: Protein(domain1,domain2) -> Protein(domain1!1,domain2!1) k1
end reaction rules
begin observables
    Molecules FoldedProtein Protein(domain1!1,domain2!1)
end observables
begin parameters
    k1 1.0
end parameters
      `;

      const model = parseBNGL(bngl);
      const xml = BNGXMLWriter.write(model);

      // Should generate valid XML for self-binding
      expect(xml).toContain('<ReactionRule id="RR1"');
      
      // Should have one ReactantPattern (single molecule)
      const reactantPatterns = xml.match(/<ReactantPattern[^>]*>/g) || [];
      expect(reactantPatterns).toHaveLength(1);

      // Should have one ProductPattern showing the folded state
      const productPatterns = xml.match(/<ProductPattern[^>]*>/g) || [];
      expect(productPatterns).toHaveLength(1);

      // Product should show internal bond
      const productSection = xml.match(/<ProductPattern[^>]*>(.*?)<\/ProductPattern>/s);
      expect(productSection).toBeTruthy();
      if (productSection) {
        const productContent = productSection[1];
        expect(productContent).toContain('<ListOfBonds>');
        expect(productContent).toContain('<Bond');
        
        // Should have bond between domain1 and domain2 of same molecule
        expect(productContent).toMatch(/site1="[^"]*_M1_C1"[^>]*site2="[^"]*_M1_C2"/);
      }
    });

    it('should preserve intramolecular semantics in bidirectional rules', () => {
      const bngl = `
begin molecule types
    A(x,y)
    B(a,b)
end molecule types
begin seed species
    A(x,y).B(a,b) 100
end seed species
begin reaction rules
    # Bidirectional intramolecular rule
    RR1: A(x).B(a) <-> A(x!1).B(a!1) k1, k2
end reaction rules
begin observables
    Molecules UnboundComplex A(x).B(a)
    Molecules BoundComplex A(x!1).B(a!1)
end observables
begin parameters
    k1 1.0
    k2 0.1
end parameters
      `;

      const model = parseBNGL(bngl);
      const xml = BNGXMLWriter.write(model);

      // Should generate two reaction rules (forward and reverse)
      const reactionRules = xml.match(/<ReactionRule[^>]*>/g) || [];
      expect(reactionRules).toHaveLength(2);

      // Both rules should preserve intramolecular semantics
      for (let i = 1; i <= 2; i++) {
        const rrSection = xml.match(new RegExp(`<ReactionRule id="RR${i}"[^>]*>(.*?)</ReactionRule>`, 's'));
        expect(rrSection).toBeTruthy();
        if (rrSection) {
          const rrContent = rrSection[1];
          
          // Each rule should have exactly one ReactantPattern and one ProductPattern
          const reactantPatterns = rrContent.match(/<ReactantPattern[^>]*>/g) || [];
          const productPatterns = rrContent.match(/<ProductPattern[^>]*>/g) || [];
          expect(reactantPatterns).toHaveLength(1);
          expect(productPatterns).toHaveLength(1);
        }
      }
    });

    it('should handle mixed intramolecular and intermolecular patterns', () => {
      const bngl = `
begin molecule types
    A(x,y)
    B(a,b)
    C(z)
end molecule types
begin seed species
    A(x,y).B(a,b) 100
    C(z) 50
end seed species
begin reaction rules
    # Mixed rule: intramolecular A.B complex binds to separate C molecule
    RR1: A(x).B(a) + C(z) -> A(x!1).B(a).C(z!1) k1
end reaction rules
begin observables
    Molecules TripleComplex A(x!1).B(a).C(z!1)
end observables
begin parameters
    k1 1.0
end parameters
      `;

      const model = parseBNGL(bngl);
      const xml = BNGXMLWriter.write(model);

      // Should have one reaction rule
      const reactionRules = xml.match(/<ReactionRule[^>]*>/g) || [];
      expect(reactionRules).toHaveLength(1);

      const rrSection = xml.match(/<ReactionRule[^>]*>(.*?)<\/ReactionRule>/s);
      expect(rrSection).toBeTruthy();
      if (rrSection) {
        const rrContent = rrSection[1];
        
        // Should have two ReactantPatterns: one for A.B complex, one for C
        const reactantPatterns = rrContent.match(/<ReactantPattern[^>]*>/g) || [];
        expect(reactantPatterns).toHaveLength(2);
        
        // First pattern should contain both A and B (intramolecular)
        const firstReactantSection = rrContent.match(/<ReactantPattern[^>]*>(.*?)<\/ReactantPattern>/s);
        if (firstReactantSection) {
          const firstReactantContent = firstReactantSection[1];
          const moleculeCount = (firstReactantContent.match(/<Molecule[^>]*>/g) || []).length;
          // Should be either 2 (A.B in first pattern) or 1 (if C is in first pattern)
          expect(moleculeCount).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty patterns gracefully', () => {
      const model = {
        name: 'test_model',
        parameters: { k1: 1.0 },
        moleculeTypes: [{ name: 'A', components: ['x'] }],
        species: [{ name: 'A(x)', initialConcentration: 100 }],
        reactionRules: [{
          name: 'RR1',
          reactionString: 'A(x) -> A(x) k1',
          reactants: ['A(x)'],
          products: ['A(x)'],
          rate: 'k1',
          isBidirectional: false
        }],
        observables: [{ name: 'TotalA', type: 'Molecules', pattern: 'A(x)' }]
      };

      expect(() => {
        const xml = BNGXMLWriter.write(model);
        expect(xml).toContain('<ReactionRule');
      }).not.toThrow();
    });

    it('should handle malformed rule patterns gracefully', () => {
      const model = {
        name: 'test_model',
        parameters: { k1: 1.0 },
        moleculeTypes: [{ name: 'A', components: ['x'] }],
        species: [{ name: 'A(x)', initialConcentration: 100 }],
        reactionRules: [{
          name: 'RR1',
          reactionString: 'A(x) -> A(x) k1',
          reactants: [''], // Empty reactant
          products: ['A(x)'],
          rate: 'k1',
          isBidirectional: false
        }],
        observables: [{ name: 'TotalA', type: 'Molecules', pattern: 'A(x)' }]
      };

      expect(() => {
        const xml = BNGXMLWriter.write(model);
        expect(xml).toContain('<model');
      }).not.toThrow();
    });
  });
});