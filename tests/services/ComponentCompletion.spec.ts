import { describe, it, expect } from 'vitest';
import { BNGXMLWriter } from '@bngplayground/engine';
import { parseBNGL } from '../../services/parseBNGL';

describe('Component Completion in BNG-XML Generation', () => {
  
  describe('Property 20: Pattern Component Completeness', () => {
    it('should include all molecule type components with wildcards for unspecified ones', () => {
      const bngl = `
begin molecule types
    A(x,y,z)
    B(a,b,c)
end molecule types
begin seed species
    A(x,y,z) 100
end seed species
begin reaction rules
    RR1: A(x) -> A(x!1).B(a!1) k1
end reaction rules
begin observables
    Molecules FreeA A(x)
end observables
begin parameters
    k1 1.0
end parameters
      `;

      const model = parseBNGL(bngl);
      const xml = BNGXMLWriter.write(model);

      // **Property 20: Pattern Component Completeness**
      // *For any* reaction pattern in BNG-XML, all components defined in the 
      // corresponding molecule type SHALL be present, with unspecified components 
      // marked with wildcard bond constraints (numberOfBonds="?")

      // Check that molecule type A has all components defined
      expect(xml).toContain('<MoleculeType id="A">');
      expect(xml).toContain('<ComponentType id="x">');
      expect(xml).toContain('<ComponentType id="y">');
      expect(xml).toContain('<ComponentType id="z">');

      // Check seed species has all components (concrete, so numberOfBonds="0" for unspecified)
      expect(xml).toContain('<Species id="S1"');
      expect(xml).toContain('name="A(x,y,z)"');
      
      // In seed species, all components should be present
      const speciesSection = xml.match(/<Species id="S1"[^>]*>(.*?)<\/Species>/s);
      expect(speciesSection).toBeTruthy();
      if (speciesSection) {
        const speciesContent = speciesSection[1];
        expect(speciesContent).toContain('name="x"');
        expect(speciesContent).toContain('name="y"');
        expect(speciesContent).toContain('name="z"');
      }

      // Check reaction rule patterns have component completion
      expect(xml).toContain('<ReactionRule id="RR1"');
      
      // In reactant pattern A(x), should have x, y, z components
      const reactantSection = xml.match(/<ReactantPattern[^>]*>(.*?)<\/ReactantPattern>/s);
      expect(reactantSection).toBeTruthy();
      if (reactantSection) {
        const reactantContent = reactantSection[1];
        expect(reactantContent).toContain('name="x"');
        expect(reactantContent).toContain('name="y"');
        expect(reactantContent).toContain('name="z"');
        
        // Unspecified components (y, z) should have numberOfBonds="?"
        expect(reactantContent).toMatch(/name="y"[^>]*numberOfBonds="\?"/);
        expect(reactantContent).toMatch(/name="z"[^>]*numberOfBonds="\?"/);
      }

      // Check observable pattern has component completion
      expect(xml).toContain('<Observable id="O1"');
      
      const observableSection = xml.match(/<Pattern[^>]*>(.*?)<\/Pattern>/s);
      expect(observableSection).toBeTruthy();
      if (observableSection) {
        const observableContent = observableSection[1];
        expect(observableContent).toContain('name="x"');
        expect(observableContent).toContain('name="y"');
        expect(observableContent).toContain('name="z"');
        
        // Unspecified components should have numberOfBonds="?"
        expect(observableContent).toMatch(/name="y"[^>]*numberOfBonds="\?"/);
        expect(observableContent).toMatch(/name="z"[^>]*numberOfBonds="\?"/);
      }
    });

    it('should handle complex molecule types with states correctly', () => {
      const bngl = `
begin molecule types
    Receptor(ligand,kinase~inactive~active,location~membrane~cytoplasm)
end molecule types
begin seed species
    Receptor(ligand,kinase~inactive,location~membrane) 1000
end seed species
begin reaction rules
    RR1: Receptor(ligand) -> Receptor(ligand!1).Ligand(receptor!1) k1
end reaction rules
begin observables
    Molecules ActiveReceptors Receptor(kinase~active)
end observables
begin parameters
    k1 1.0
end parameters
      `;

      const model = parseBNGL(bngl);
      const xml = BNGXMLWriter.write(model);

      // Check molecule type has all components with states
      expect(xml).toContain('<MoleculeType id="Receptor">');
      expect(xml).toContain('<ComponentType id="ligand">');
      expect(xml).toContain('<ComponentType id="kinase">');
      expect(xml).toContain('<ComponentType id="location">');
      expect(xml).toContain('<AllowedState id="inactive"/>');
      expect(xml).toContain('<AllowedState id="active"/>');
      expect(xml).toContain('<AllowedState id="membrane"/>');
      expect(xml).toContain('<AllowedState id="cytoplasm"/>');

      // Check that reaction rule includes all components
      const reactantSection = xml.match(/<ReactantPattern[^>]*>(.*?)<\/ReactantPattern>/s);
      expect(reactantSection).toBeTruthy();
      if (reactantSection) {
        const reactantContent = reactantSection[1];
        expect(reactantContent).toContain('name="ligand"');
        expect(reactantContent).toContain('name="kinase"');
        expect(reactantContent).toContain('name="location"');
        
        // Unspecified components should have wildcards
        expect(reactantContent).toMatch(/name="kinase"[^>]*numberOfBonds="\?"/);
        expect(reactantContent).toMatch(/name="location"[^>]*numberOfBonds="\?"/);
      }

      // Check observable pattern completion
      const observableSection = xml.match(/<Pattern[^>]*>(.*?)<\/Pattern>/s);
      expect(observableSection).toBeTruthy();
      if (observableSection) {
        const observableContent = observableSection[1];
        expect(observableContent).toContain('name="ligand"');
        expect(observableContent).toContain('name="kinase"');
        expect(observableContent).toContain('name="location"');
        
        // Should have specific state for kinase
        expect(observableContent).toMatch(/name="kinase"[^>]*state="active"/);
        
        // Unspecified components should have wildcards
        expect(observableContent).toMatch(/name="ligand"[^>]*numberOfBonds="\?"/);
        expect(observableContent).toMatch(/name="location"[^>]*numberOfBonds="\?"/);
      }
    });

    it('should distinguish between concrete species and pattern wildcards', () => {
      const bngl = `
begin molecule types
    A(x,y,z)
end molecule types
begin seed species
    A(x!1,y).A(x!1) 50
end seed species
begin reaction rules
    RR1: A(x) -> A(x) k1
end reaction rules
begin observables
    Molecules SingleA A(x)
end observables
begin parameters
    k1 1.0
end parameters
      `;

      const model = parseBNGL(bngl);
      const xml = BNGXMLWriter.write(model);

      // In seed species (concrete), unspecified components should have numberOfBonds="0"
      const speciesSection = xml.match(/<Species[^>]*>(.*?)<\/Species>/s);
      expect(speciesSection).toBeTruthy();
      if (speciesSection) {
        const speciesContent = speciesSection[1];
        // Should have all components x, y, z
        expect(speciesContent).toContain('name="x"');
        expect(speciesContent).toContain('name="y"');
        expect(speciesContent).toContain('name="z"');
        
        // Unspecified component z should have numberOfBonds="0" in concrete species
        expect(speciesContent).toMatch(/name="z"[^>]*numberOfBonds="0"/);
      }

      // In reaction patterns (wildcards), unspecified components should have numberOfBonds="?"
      const reactantSection = xml.match(/<ReactantPattern[^>]*>(.*?)<\/ReactantPattern>/s);
      expect(reactantSection).toBeTruthy();
      if (reactantSection) {
        const reactantContent = reactantSection[1];
        expect(reactantContent).toContain('name="x"');
        expect(reactantContent).toContain('name="y"');
        expect(reactantContent).toContain('name="z"');
        
        // Unspecified components should have wildcards in patterns
        expect(reactantContent).toMatch(/name="y"[^>]*numberOfBonds="\?"/);
        expect(reactantContent).toMatch(/name="z"[^>]*numberOfBonds="\?"/);
      }
    });

    it('should handle missing molecule type gracefully', () => {
      // Create a model with incomplete molecule type information
      const model = {
        name: 'test_model',
        parameters: { k1: 1.0 },
        moleculeTypes: [], // Empty - missing molecule type
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

      // Should not crash even with missing molecule type
      expect(() => {
        const xml = BNGXMLWriter.write(model);
        expect(xml).toContain('<model');
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle molecules with no components', () => {
      const bngl = `
begin molecule types
    A()
    B()
end molecule types
begin seed species
    A() 100
end seed species
begin reaction rules
    RR1: A() + B() -> A().B() k1
end reaction rules
begin observables
    Molecules TotalA A()
end observables
begin parameters
    k1 1.0
end parameters
      `;

      const model = parseBNGL(bngl);
      const xml = BNGXMLWriter.write(model);

      expect(xml).toContain('<MoleculeType id="A">');
      expect(xml).toContain('<MoleculeType id="B">');
      
      // Should not have ListOfComponents for molecules with no components
      const moleculeTypeA = xml.match(/<MoleculeType id="A">(.*?)<\/MoleculeType>/s);
      expect(moleculeTypeA).toBeTruthy();
      if (moleculeTypeA) {
        expect(moleculeTypeA[1]).not.toContain('<ListOfComponentTypes>');
      }
    });

    it('should preserve bond information in completed components', () => {
      const bngl = `
begin molecule types
    A(x,y,z)
    B(a,b,c)
end molecule types
begin seed species
    A(x,y,z) 100
    B(a,b,c) 100
end seed species
begin reaction rules
    RR1: A(x,y) + B(a,b) -> A(x!1,y!2).B(a!1,b!2) k1
end reaction rules
begin observables
    Molecules BoundAB A(x!+,y!+)
end observables
begin parameters
    k1 1.0
end parameters
      `;

      const model = parseBNGL(bngl);
      const xml = BNGXMLWriter.write(model);

      // Check that bonds are preserved in product patterns
      const productSection = xml.match(/<ProductPattern[^>]*>(.*?)<\/ProductPattern>/s);
      expect(productSection).toBeTruthy();
      if (productSection) {
        const productContent = productSection[1];
        
        // Should have bond information for specified components
        expect(productContent).toMatch(/name="x"[^>]*numberOfBonds="1"/);
        expect(productContent).toMatch(/name="y"[^>]*numberOfBonds="1"/);
        
        // Should have wildcards for unspecified components
        expect(productContent).toMatch(/name="z"[^>]*numberOfBonds="\?"/);
        expect(productContent).toMatch(/name="c"[^>]*numberOfBonds="\?"/);
        
        // Should have bond elements
        expect(productContent).toContain('<ListOfBonds>');
        expect(productContent).toContain('<Bond');
      }
    });
  });
});