import { describe, it, expect } from 'vitest';
import { XMLValidator, XMLErrorType } from '../../services/simulation/XMLValidator';

describe('XMLValidator', () => {
  
  describe('Case Sensitivity Validation', () => {
    it('should detect camelCase totalRate in model tag', () => {
      const xmlWithCamelCase = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">
  <model id="test_model" totalRate="1">
    <ListOfParameters></ListOfParameters>
    <ListOfMoleculeTypes></ListOfMoleculeTypes>
    <ListOfSpecies></ListOfSpecies>
    <ListOfReactionRules></ListOfReactionRules>
    <ListOfObservables></ListOfObservables>
  </model>
</sbml>`;

      const result = XMLValidator.validateBNGXML(xmlWithCamelCase);
      
      expect(result.valid).toBe(false);
      
      // Should have at least one case sensitivity error
      const caseSensitivityErrors = result.errors.filter(e => e.type === XMLErrorType.CASE_SENSITIVITY);
      expect(caseSensitivityErrors.length).toBeGreaterThan(0);
      expect(caseSensitivityErrors[0].message).toContain('camelCase "totalRate"');
      expect(caseSensitivityErrors[0].attribute).toBe('totalRate');
    });

    it('should accept correct lowercase totalrate in model tag', () => {
      const xmlWithLowercase = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">
  <model id="test_model" totalrate="1">
    <ListOfParameters></ListOfParameters>
    <ListOfMoleculeTypes></ListOfMoleculeTypes>
    <ListOfSpecies></ListOfSpecies>
    <ListOfReactionRules></ListOfReactionRules>
    <ListOfObservables></ListOfObservables>
  </model>
</sbml>`;

      const result = XMLValidator.validateBNGXML(xmlWithLowercase);
      
      // Should not have case sensitivity errors
      const caseSensitivityErrors = result.errors.filter(e => e.type === XMLErrorType.CASE_SENSITIVITY);
      expect(caseSensitivityErrors).toHaveLength(0);
    });

    it('should detect camelCase totalRate in RateLaw tags', () => {
      const xmlWithCamelCaseRateLaw = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">
  <model id="test_model" totalrate="1">
    <ListOfParameters></ListOfParameters>
    <ListOfMoleculeTypes></ListOfMoleculeTypes>
    <ListOfSpecies></ListOfSpecies>
    <ListOfReactionRules>
      <ReactionRule id="RR1" name="test_rule">
        <RateLaw id="RR1_RateLaw" type="Ele" totalRate="0">
          <ListOfRateConstants>
            <RateConstant value="1.0"/>
          </ListOfRateConstants>
        </RateLaw>
      </ReactionRule>
    </ListOfReactionRules>
    <ListOfObservables></ListOfObservables>
  </model>
</sbml>`;

      const result = XMLValidator.validateBNGXML(xmlWithCamelCaseRateLaw);
      
      expect(result.valid).toBe(false);
      const caseSensitivityErrors = result.errors.filter(e => e.type === XMLErrorType.CASE_SENSITIVITY);
      expect(caseSensitivityErrors.length).toBeGreaterThan(0);
      expect(caseSensitivityErrors.some(e => e.element === 'RateLaw')).toBe(true);
      expect(caseSensitivityErrors.some(e => e.attribute === 'totalRate')).toBe(true);
    });

    it('should accept correct lowercase totalrate in RateLaw tags', () => {
      const xmlWithLowercaseRateLaw = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">
  <model id="test_model" totalrate="1">
    <ListOfParameters></ListOfParameters>
    <ListOfMoleculeTypes></ListOfMoleculeTypes>
    <ListOfSpecies></ListOfSpecies>
    <ListOfReactionRules>
      <ReactionRule id="RR1" name="test_rule">
        <RateLaw id="RR1_RateLaw" type="Ele" totalrate="0">
          <ListOfRateConstants>
            <RateConstant value="1.0"/>
          </ListOfRateConstants>
        </RateLaw>
      </ReactionRule>
    </ListOfReactionRules>
    <ListOfObservables></ListOfObservables>
  </model>
</sbml>`;

      const result = XMLValidator.validateBNGXML(xmlWithLowercaseRateLaw);
      
      // Should not have case sensitivity errors for RateLaw
      const caseSensitivityErrors = result.errors.filter(e => 
        e.type === XMLErrorType.CASE_SENSITIVITY && e.element === 'RateLaw'
      );
      expect(caseSensitivityErrors).toHaveLength(0);
    });
  });

  describe('Required Attributes Validation', () => {
    it('should detect missing totalrate attribute in model tag', () => {
      const xmlMissingTotalrate = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">
  <model id="test_model">
    <ListOfParameters></ListOfParameters>
    <ListOfMoleculeTypes></ListOfMoleculeTypes>
    <ListOfSpecies></ListOfSpecies>
    <ListOfReactionRules></ListOfReactionRules>
    <ListOfObservables></ListOfObservables>
  </model>
</sbml>`;

      const result = XMLValidator.validateBNGXML(xmlMissingTotalrate);
      
      expect(result.valid).toBe(false);
      const missingAttrErrors = result.errors.filter(e => e.type === XMLErrorType.MISSING_REQUIRED_ATTRIBUTE);
      expect(missingAttrErrors.length).toBeGreaterThan(0);
      expect(missingAttrErrors[0].element).toBe('model');
      expect(missingAttrErrors[0].attribute).toBe('totalrate');
    });

    it('should detect missing totalrate attribute in RateLaw tags', () => {
      const xmlMissingRateLawTotalrate = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">
  <model id="test_model" totalrate="1">
    <ListOfParameters></ListOfParameters>
    <ListOfMoleculeTypes></ListOfMoleculeTypes>
    <ListOfSpecies></ListOfSpecies>
    <ListOfReactionRules>
      <ReactionRule id="RR1" name="test_rule">
        <RateLaw id="RR1_RateLaw" type="Ele">
          <ListOfRateConstants>
            <RateConstant value="1.0"/>
          </ListOfRateConstants>
        </RateLaw>
      </ReactionRule>
    </ListOfReactionRules>
    <ListOfObservables></ListOfObservables>
  </model>
</sbml>`;

      const result = XMLValidator.validateBNGXML(xmlMissingRateLawTotalrate);
      
      expect(result.valid).toBe(false);
      const missingAttrErrors = result.errors.filter(e => 
        e.type === XMLErrorType.MISSING_REQUIRED_ATTRIBUTE && e.element === 'RateLaw'
      );
      expect(missingAttrErrors.length).toBeGreaterThan(0);
      expect(missingAttrErrors[0].attribute).toBe('totalrate');
    });
  });

  describe('Schema Validation', () => {
    it('should detect missing required sections', () => {
      const xmlMissingSections = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">
  <model id="test_model" totalrate="1">
    <ListOfParameters></ListOfParameters>
    <!-- Missing other required sections -->
  </model>
</sbml>`;

      const result = XMLValidator.validateBNGXML(xmlMissingSections);
      
      expect(result.valid).toBe(false);
      const schemaErrors = result.errors.filter(e => e.type === XMLErrorType.SCHEMA_ERROR);
      expect(schemaErrors.length).toBeGreaterThan(0);
      
      const missingElements = schemaErrors.map(e => e.element);
      expect(missingElements).toContain('ListOfMoleculeTypes');
      expect(missingElements).toContain('ListOfSpecies');
      expect(missingElements).toContain('ListOfReactionRules');
      expect(missingElements).toContain('ListOfObservables');
    });

    it('should validate complete XML structure successfully', () => {
      const completeXML = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">
  <model id="test_model" totalrate="1">
    <ListOfParameters>
      <Parameter id="k1" type="Constant" value="1.0"/>
    </ListOfParameters>
    <ListOfMoleculeTypes>
      <MoleculeType id="A">
        <ListOfComponentTypes>
          <ComponentType id="b"/>
        </ListOfComponentTypes>
      </MoleculeType>
    </ListOfMoleculeTypes>
    <ListOfCompartments></ListOfCompartments>
    <ListOfSpecies>
      <Species id="S1" concentration="100" name="A(b)">
        <ListOfMolecules>
          <Molecule id="S1_M1" name="A">
            <ListOfComponents>
              <Component id="S1_M1_C1" name="b" numberOfBonds="0"/>
            </ListOfComponents>
          </Molecule>
        </ListOfMolecules>
      </Species>
    </ListOfSpecies>
    <ListOfReactionRules>
      <ReactionRule id="RR1" name="test_rule">
        <ListOfReactantPatterns>
          <ReactantPattern id="RR1_RP1">
            <ListOfMolecules>
              <Molecule id="RR1_RP1_M1" name="A">
                <ListOfComponents>
                  <Component id="RR1_RP1_M1_C1" name="b" numberOfBonds="0"/>
                </ListOfComponents>
              </Molecule>
            </ListOfMolecules>
          </ReactantPattern>
        </ListOfReactantPatterns>
        <ListOfProductPatterns>
          <ProductPattern id="RR1_PP1">
            <ListOfMolecules>
              <Molecule id="RR1_PP1_M1" name="A">
                <ListOfComponents>
                  <Component id="RR1_PP1_M1_C1" name="b" numberOfBonds="1"/>
                </ListOfComponents>
              </Molecule>
            </ListOfMolecules>
          </ProductPattern>
        </ListOfProductPatterns>
        <RateLaw id="RR1_RateLaw" type="Ele" totalrate="0">
          <ListOfRateConstants>
            <RateConstant value="k1"/>
          </ListOfRateConstants>
        </RateLaw>
      </ReactionRule>
    </ListOfReactionRules>
    <ListOfObservables>
      <Observable id="O1" name="FreeA" type="Molecules">
        <ListOfPatterns>
          <Pattern id="O1_P1">
            <ListOfMolecules>
              <Molecule id="O1_P1_M1" name="A">
                <ListOfComponents>
                  <Component id="O1_P1_M1_C1" name="b" numberOfBonds="0"/>
                </ListOfComponents>
              </Molecule>
            </ListOfMolecules>
          </Pattern>
        </ListOfPatterns>
      </Observable>
    </ListOfObservables>
    <ListOfFunctions></ListOfFunctions>
  </model>
</sbml>`;

      const result = XMLValidator.validateBNGXML(completeXML);
      
      // Debug: log errors if validation fails
      if (!result.valid) {
        console.log('Validation errors:', result.errors.map(e => e.message));
      }
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('NFsim-Specific Validation', () => {
    it('should detect intramolecular patterns and provide appropriate warnings', () => {
      const xmlWithIntramolecular = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">
  <model id="test_model" totalrate="1">
    <ListOfParameters></ListOfParameters>
    <ListOfMoleculeTypes></ListOfMoleculeTypes>
    <ListOfSpecies></ListOfSpecies>
    <ListOfReactionRules>
      <ReactionRule id="RR1" name="intramolecular_rule">
        <ListOfReactantPatterns>
          <ReactantPattern id="RR1_RP1">
            <ListOfMolecules>
              <Molecule id="RR1_RP1_M1" name="A"/>
              <Molecule id="RR1_RP1_M2" name="B"/>
            </ListOfMolecules>
            <ListOfBonds>
              <Bond id="RR1_B1" site1="RR1_RP1_M1_C1" site2="RR1_RP1_M2_C1"/>
            </ListOfBonds>
          </ReactantPattern>
        </ListOfReactantPatterns>
        <RateLaw id="RR1_RateLaw" type="Ele" totalrate="0">
          <ListOfRateConstants>
            <RateConstant value="1.0"/>
          </ListOfRateConstants>
        </RateLaw>
      </ReactionRule>
    </ListOfReactionRules>
    <ListOfObservables></ListOfObservables>
  </model>
</sbml>`;

      const result = XMLValidator.validateForNFsim(xmlWithIntramolecular);
      
      const intramolecularWarnings = result.warnings.filter(w => 
        w.message.includes('intramolecular') || w.message.includes('Disjoint sets')
      );
      expect(intramolecularWarnings.length).toBeGreaterThan(0);
    });

    it('should detect high pattern complexity and recommend UTL adjustment', () => {
      const xmlWithComplexPattern = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">
  <model id="test_model" totalrate="1">
    <ListOfParameters></ListOfParameters>
    <ListOfMoleculeTypes></ListOfMoleculeTypes>
    <ListOfSpecies></ListOfSpecies>
    <ListOfReactionRules>
      <ReactionRule id="RR1" name="complex_rule">
        <ListOfReactantPatterns>
          <ReactantPattern id="RR1_RP1">
            <ListOfMolecules>
              <Molecule id="RR1_RP1_M1" name="A">
                <ListOfComponents>
                  ${Array.from({length: 15}, (_, i) => 
                    `<Component id="RR1_RP1_M1_C${i+1}" name="c${i+1}" numberOfBonds="0"/>`
                  ).join('\n                  ')}
                </ListOfComponents>
              </Molecule>
            </ListOfMolecules>
            <ListOfBonds>
              ${Array.from({length: 10}, (_, i) => 
                `<Bond id="RR1_B${i+1}" site1="RR1_RP1_M1_C${i+1}" site2="RR1_RP1_M1_C${i+2}"/>`
              ).join('\n              ')}
            </ListOfBonds>
          </ReactantPattern>
        </ListOfReactantPatterns>
        <RateLaw id="RR1_RateLaw" type="Ele" totalrate="0">
          <ListOfRateConstants>
            <RateConstant value="1.0"/>
          </ListOfRateConstants>
        </RateLaw>
      </ReactionRule>
    </ListOfReactionRules>
    <ListOfObservables></ListOfObservables>
  </model>
</sbml>`;

      const result = XMLValidator.validateForNFsim(xmlWithComplexPattern);
      
      const complexityWarnings = result.warnings.filter(w => 
        w.message.includes('complexity') || w.message.includes('UTL')
      );
      expect(complexityWarnings.length).toBeGreaterThan(0);
    });
  });
});