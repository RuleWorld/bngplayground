import { describe, it, expect, vi } from 'vitest';
import { BNGXMLWriter } from '@bngplayground/engine';
import { XMLValidator } from '../../services/simulation/XMLValidator';
import { parseBNGL } from '../../services/parseBNGL';

// Mock the NFsim loader to avoid WASM issues in tests
vi.mock('../services/simulation/NFsimLoader', () => ({
  runNFsim: vi.fn().mockRejectedValue(new Error('NFsim WASM not available in test environment')),
  resetNFsim: vi.fn()
}));

describe('NFsim XML Validation Integration', () => {
  
  describe('Property 3: Input Validation Consistency', () => {
    it('should validate XML structure and content correctly', () => {
      const validBngl = `
begin molecule types
    A(b)
    B(a)
end molecule types
begin seed species
    A(b) 100
    B(a) 100
end seed species
begin reaction rules
    RR1: A(b) + B(a) -> A(b!1).B(a!1) k1
end reaction rules
begin observables
    Molecules FreeA A(b)
    Molecules BoundAB A(b!1).B(a!1)
end observables
begin parameters
    k1 1.0
end parameters
      `;

      const model = parseBNGL(validBngl);
      
      // **Property 3: Input Validation Consistency**
      // *For any* BNG-XML input, the system should validate structure and content 
      // before WASM execution and reject invalid inputs with appropriate error messages

      // Generate XML
      const xml = BNGXMLWriter.write(model);
      expect(xml).toBeDefined();
      expect(xml.length).toBeGreaterThan(0);

      // Validate the generated XML
      const validation = XMLValidator.validateForNFsim(xml);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      
      // Should have proper structure
      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain('<sbml');
      expect(xml).toContain('<model');
      expect(xml).toContain('totalrate="1"');
      expect(xml).toContain('<ListOfParameters>');
      expect(xml).toContain('<ListOfMoleculeTypes>');
      expect(xml).toContain('<ListOfSpecies>');
      expect(xml).toContain('<ListOfReactionRules>');
      expect(xml).toContain('<ListOfObservables>');
    });

    it('should detect and reject invalid XML structures', () => {
      // Create a model that will generate problematic XML
      const invalidModel = {
        name: 'invalid_model',
        parameters: { k1: 1.0 },
        moleculeTypes: [], // Missing molecule types
        species: [{ name: 'A(b)', initialConcentration: 100 }],
        reactionRules: [{
          name: 'RR1',
          reactionString: 'A(b) -> A(b) k1',
          reactants: ['A(b)'],
          products: ['A(b)'],
          rate: 'k1',
          isBidirectional: false
        }],
        observables: [{ name: 'TotalA', type: 'Molecules', pattern: 'A(b)' }]
      };

      // Generate XML (should succeed)
      const xml = BNGXMLWriter.write(invalidModel);
      expect(xml).toBeDefined();

      // Validate XML (should fail due to missing molecule types)
      const validation = XMLValidator.validateForNFsim(xml);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      
      // Should have specific error about missing molecule types
      const hasSchemaError = validation.errors.some(e => 
        e.message.includes('Required section ListOfMoleculeTypes is empty') || 
        e.message.includes('Missing required section')
      );
      expect(hasSchemaError).toBe(true);
    });

    it('should validate case sensitivity in XML attributes', () => {
      const model = {
        name: 'case_test_model',
        parameters: { k1: 1.0 },
        moleculeTypes: [{ name: 'A', components: ['b'] }],
        species: [{ name: 'A(b)', initialConcentration: 100 }],
        reactionRules: [{
          name: 'RR1',
          reactionString: 'A(b) -> A(b) k1',
          reactants: ['A(b)'],
          products: ['A(b)'],
          rate: 'k1',
          isBidirectional: false
        }],
        observables: [{ name: 'TotalA', type: 'Molecules', pattern: 'A(b)' }]
      };

      // Generate XML
      const xml = BNGXMLWriter.write(model);
      
      // Should use correct lowercase totalrate
      expect(xml).toContain('totalrate="1"');
      expect(xml).toContain('totalrate="0"');
      expect(xml).not.toContain('totalRate=');

      // Validate XML
      const validation = XMLValidator.validateForNFsim(xml);
      expect(validation.valid).toBe(true);
      
      // Should not have case sensitivity errors
      const hasCaseError = validation.errors.some(e => 
        e.message.includes('camelCase') || 
        e.message.includes('totalRate')
      );
      expect(hasCaseError).toBe(false);
    });

    it('should detect missing required attributes', () => {
      // Create XML with missing totalrate attribute
      const xmlWithMissingTotalrate = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">
  <model id="test_model">
    <ListOfParameters></ListOfParameters>
    <ListOfMoleculeTypes></ListOfMoleculeTypes>
    <ListOfSpecies></ListOfSpecies>
    <ListOfReactionRules></ListOfReactionRules>
    <ListOfObservables></ListOfObservables>
  </model>
</sbml>`;

      const validation = XMLValidator.validateForNFsim(xmlWithMissingTotalrate);
      expect(validation.valid).toBe(false);
      
      const hasMissingAttrError = validation.errors.some(e => 
        e.message.includes('missing required totalrate') ||
        e.message.includes('Missing required attribute')
      );
      expect(hasMissingAttrError).toBe(true);
    });

    it('should handle XML validation warnings appropriately', () => {
      const bnglWithWarnings = `
begin molecule types
    A(x,y,z)
end molecule types
begin seed species
    A(x,y,z) 100
end seed species
begin reaction rules
    RR1: A(x) -> A(x) k1
end reaction rules
begin observables
    Molecules PartialA A(x)
end observables
begin parameters
    k1 1.0
end parameters
      `;

      const model = parseBNGL(bnglWithWarnings);
      const xml = BNGXMLWriter.write(model);
      const validation = XMLValidator.validateForNFsim(xml);

      // Should be valid despite warnings
      expect(validation.valid).toBe(true);
      
      // May have warnings about component completeness
      if (validation.warnings.length > 0) {
        const hasComponentWarning = validation.warnings.some(w => 
          w.message.includes('component') || 
          w.message.includes('missing')
        );
        // This is acceptable - warnings don't prevent execution
        expect(hasComponentWarning || validation.warnings.length === 0).toBe(true);
      }
    });
  });

  describe('XML Structure Validation', () => {
    it('should validate complete XML document structure', () => {
      const completeModel = {
        name: 'complete_model',
        parameters: { k1: 1.0, k2: 0.1 },
        moleculeTypes: [
          { name: 'A', components: ['x', 'y'] },
          { name: 'B', components: ['a', 'b'] }
        ],
        species: [
          { name: 'A(x,y)', initialConcentration: 100 },
          { name: 'B(a,b)', initialConcentration: 50 }
        ],
        reactionRules: [{
          name: 'RR1',
          reactionString: 'A(x) + B(a) <-> A(x!1).B(a!1) k1, k2',
          reactants: ['A(x)', 'B(a)'],
          products: ['A(x!1).B(a!1)'],
          rate: 'k1',
          reverseRate: 'k2',
          isBidirectional: true
        }],
        observables: [
          { name: 'FreeA', type: 'Molecules', pattern: 'A(x)' },
          { name: 'BoundAB', type: 'Molecules', pattern: 'A(x!1).B(a!1)' }
        ]
      };

      const xml = BNGXMLWriter.write(completeModel);
      const validation = XMLValidator.validateForNFsim(xml);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Should have all required sections
      expect(xml).toContain('<ListOfParameters>');
      expect(xml).toContain('<ListOfMoleculeTypes>');
      expect(xml).toContain('<ListOfSpecies>');
      expect(xml).toContain('<ListOfReactionRules>');
      expect(xml).toContain('<ListOfObservables>');
      
      // Should have proper attributes
      expect(xml).toContain('totalrate="1"');
      expect(xml).toMatch(/totalrate="0"/g);
    });

    it('should detect intramolecular patterns and provide appropriate guidance', () => {
      const intramolecularModel = {
        name: 'intramolecular_model',
        parameters: { k1: 1.0 },
        moleculeTypes: [
          { name: 'A', components: ['x'] },
          { name: 'B', components: ['a'] }
        ],
        species: [
          { name: 'A(x).B(a)', initialConcentration: 100 }
        ],
        reactionRules: [{
          name: 'RR1',
          reactionString: 'A(x).B(a) -> A(x!1).B(a!1) k1',
          reactants: ['A(x).B(a)'],
          products: ['A(x!1).B(a!1)'],
          rate: 'k1',
          isBidirectional: false
        }],
        observables: [
          { name: 'BoundAB', type: 'Molecules', pattern: 'A(x!1).B(a!1)' }
        ]
      };

      const xml = BNGXMLWriter.write(intramolecularModel);
      const validation = XMLValidator.validateForNFsim(xml);

      // Should be valid
      expect(validation.valid).toBe(true);

      // May have warnings about intramolecular patterns
      const hasIntramolecularWarning = validation.warnings.some(w => 
        w.message.includes('intramolecular') || 
        w.message.includes('Disjoint sets')
      );
      
      // This is informational - not an error
      if (hasIntramolecularWarning) {
        expect(validation.valid).toBe(true); // Still valid despite warning
      }
    });
  });

  describe('Error Message Quality', () => {
    it('should provide specific error messages with context', () => {
      const xmlWithMultipleIssues = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">
  <model id="test_model" totalRate="1">
    <ListOfParameters></ListOfParameters>
    <ListOfReactionRules>
      <ReactionRule id="RR1" name="test_rule">
        <RateLaw id="RR1_RateLaw" type="Ele" totalRate="0">
          <ListOfRateConstants>
            <RateConstant value="1.0"/>
          </ListOfRateConstants>
        </RateLaw>
      </ReactionRule>
    </ListOfReactionRules>
  </model>
</sbml>`;

      const validation = XMLValidator.validateForNFsim(xmlWithMultipleIssues);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);

      // Should have specific error messages
      const errorMessages = validation.errors.map(e => e.message);
      
      // Should mention case sensitivity issues
      const hasCaseError = errorMessages.some(msg => 
        msg.includes('camelCase') || msg.includes('totalRate')
      );
      expect(hasCaseError).toBe(true);

      // Should mention missing sections
      const hasMissingSection = errorMessages.some(msg => 
        msg.includes('Missing required section')
      );
      expect(hasMissingSection).toBe(true);

      // Errors should have context information
      validation.errors.forEach(error => {
        expect(error.type).toBeDefined();
        expect(error.message).toBeDefined();
        expect(error.message.length).toBeGreaterThan(10); // Meaningful message
      });
    });
  });
});