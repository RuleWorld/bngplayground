import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { getValidator, resetValidator, NFsimValidator } from '@bngplayground/engine';
import { NFsimExecutionOptions } from '@bngplayground/engine';

describe('NFsim Input Validation Consistency', () => {
  let validator: NFsimValidator;

  beforeEach(() => {
    resetValidator();
    validator = getValidator();
  });

  afterEach(() => {
    resetValidator();
  });

  describe('Property 3: Input Validation Consistency', () => {
    it('should consistently validate parameters across different input ranges', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            t_end: fc.float({ min: -100, max: 1000 }),
            n_steps: fc.integer({ min: -100, max: 20000 }),
            seed: fc.option(fc.integer({ min: -1000, max: 2000000 })),
            utl: fc.option(fc.integer({ min: -10, max: 2000 })),
            gml: fc.option(fc.integer({ min: -1000, max: 2000000 })),
            equilibrate: fc.option(fc.float({ min: -10, max: 100 })),
            timeoutMs: fc.option(fc.integer({ min: -1000, max: 300000 })),
            verbose: fc.option(fc.boolean())
          }),
          (options: NFsimExecutionOptions) => {
            // **Property 3: Input Validation Consistency**
            // *For any* set of simulation parameters, validation should:
            // 1. Always return a consistent result structure
            // 2. Correctly identify invalid parameters
            // 3. Provide appropriate error messages and suggestions
            // 4. Be deterministic (same input = same output)

            const result1 = validator.validateParameters(options);
            const result2 = validator.validateParameters(options);

            // Validation should be deterministic
            expect(result1.isValid).toBe(result2.isValid);
            expect(result1.errors).toEqual(result2.errors);
            expect(result1.warnings).toEqual(result2.warnings);

            // Result structure should be consistent
            expect(result1).toHaveProperty('isValid');
            expect(result1).toHaveProperty('errors');
            expect(result1).toHaveProperty('warnings');
            expect(result1).toHaveProperty('suggestions');
            expect(Array.isArray(result1.errors)).toBe(true);
            expect(Array.isArray(result1.warnings)).toBe(true);
            expect(Array.isArray(result1.suggestions)).toBe(true);

            // Validate error detection logic
            if (options.t_end <= 0) {
              expect(result1.isValid).toBe(false);
              expect(result1.errors.some(e => e.message.includes('end time'))).toBe(true);
            }

            if (options.n_steps <= 0) {
              expect(result1.isValid).toBe(false);
              expect(result1.errors.some(e => e.message.includes('steps'))).toBe(true);
            }

            if (options.seed !== undefined && options.seed !== null && (options.seed < 1 || options.seed > 999999)) {
              expect(result1.isValid).toBe(false);
              expect(result1.errors.some(e => e.message.includes('seed'))).toBe(true);
            }

            if (options.utl !== undefined && options.utl !== null && options.utl < 1) {
              expect(result1.isValid).toBe(false);
              expect(result1.errors.some(e => e.message.includes('UTL'))).toBe(true);
            }

            if (options.equilibrate !== undefined && options.equilibrate !== null && options.equilibrate < 0) {
              expect(result1.isValid).toBe(false);
              expect(result1.errors.some(e => e.message.includes('Equilibration'))).toBe(true);
            }

            // All errors should have required properties
            result1.errors.forEach(error => {
              expect(error).toHaveProperty('type');
              expect(error).toHaveProperty('message');
              expect(error).toHaveProperty('severity');
              expect(['structure', 'parameter', 'compatibility', 'syntax']).toContain(error.type);
              expect(['error', 'warning']).toContain(error.severity);
              expect(typeof error.message).toBe('string');
              expect(error.message.length).toBeGreaterThan(0);
            });

            // All warnings should have required properties
            result1.warnings.forEach(warning => {
              expect(warning).toHaveProperty('type');
              expect(warning).toHaveProperty('message');
              expect(['performance', 'compatibility', 'best-practice']).toContain(warning.type);
              expect(typeof warning.message).toBe('string');
              expect(warning.message.length).toBeGreaterThan(0);
            });
          }
        ),
        { numRuns: 50, timeout: 10000 }
      );
    });

    it('should consistently validate XML structure across different inputs', async () => {
      const testCases = [
        // Valid XML structures
        `<?xml version="1.0" encoding="UTF-8"?>
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
    <ListOfCompartments/>
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
          <ReactantPattern id="RP1">
            <ListOfMolecules>
              <Molecule id="RP1_M1" name="A">
                <ListOfComponents>
                  <Component id="RP1_M1_C1" name="b" numberOfBonds="0"/>
                </ListOfComponents>
              </Molecule>
            </ListOfMolecules>
          </ReactantPattern>
        </ListOfReactantPatterns>
        <ListOfProductPatterns/>
        <RateLaw id="RL1" type="Ele" totalrate="0">
          <ListOfRateConstants>
            <RateConstant value="k1"/>
          </ListOfRateConstants>
        </RateLaw>
      </ReactionRule>
    </ListOfReactionRules>
    <ListOfObservables>
      <Observable id="O1" name="A_total" type="Molecules">
        <ListOfPatterns>
          <Pattern id="P1">
            <ListOfMolecules>
              <Molecule id="P1_M1" name="A"/>
            </ListOfMolecules>
          </Pattern>
        </ListOfPatterns>
      </Observable>
    </ListOfObservables>
    <ListOfFunctions/>
  </model>
</sbml>`,
        // Invalid XML structures
        'This is not XML',
        '<?xml version="1.0"?><invalid>',
        '<?xml version="1.0"?><sbml><model>', // Missing closing tag
        '<?xml version="1.0"?><sbml><model id="test"/></sbml>', // Minimal but valid
        '', // Empty string
        // XML with compatibility issues
        `<?xml version="1.0"?>
<sbml><model id="test" totalrate="1">
  <ListOfParameters/>
  <ListOfMoleculeTypes/>
  <ListOfCompartments/>
  <ListOfSpecies/>
  <ListOfReactionRules>
    <ReactionRule id="RR1">
      <ListOfReactantPatterns/>
      <ListOfProductPatterns/>
      <RateLaw type="Ele" totalrate="1">
        <ListOfRateConstants>
          <RateConstant value="Observable_1"/>
        </ListOfRateConstants>
      </RateLaw>
    </ReactionRule>
  </ListOfReactionRules>
  <ListOfObservables/>
  <ListOfFunctions/>
</model></sbml>`
      ];

      for (const xmlContent of testCases) {
        // **Property 3: Input Validation Consistency**
        // *For any* XML input, validation should be consistent and comprehensive

        const result1 = await validator.validateXML(xmlContent);
        const result2 = await validator.validateXML(xmlContent);

        // Validation should be deterministic
        expect(result1.isValid).toBe(result2.isValid);
        expect(result1.errors).toEqual(result2.errors);
        expect(result1.warnings).toEqual(result2.warnings);

        // Result structure should be consistent
        expect(result1).toHaveProperty('isValid');
        expect(result1).toHaveProperty('errors');
        expect(result1).toHaveProperty('warnings');
        expect(result1).toHaveProperty('suggestions');

        // Invalid XML should be caught (only check specific known cases)
        if (xmlContent === 'This is not XML' || xmlContent === '' || xmlContent.includes('<invalid>')) {
          expect(result1.isValid).toBe(false);
          expect(result1.errors.length).toBeGreaterThan(0);
        }
        
        // For malformed XML (unclosed tags), it should be invalid
        if (xmlContent.includes('<model>') && !xmlContent.includes('</model>') && !xmlContent.includes('<model/>')) {
          expect(result1.isValid).toBe(false);
          expect(result1.errors.length).toBeGreaterThan(0);
        }

        // Observable-dependent rates should be flagged
        if (xmlContent.includes('Observable_1')) {
          expect(result1.isValid).toBe(false);
          expect(result1.errors.some(e => e.message.includes('Observable-dependent') || e.type === 'compatibility')).toBe(true);
        }

        // All errors should have proper structure
        result1.errors.forEach(error => {
          expect(error).toHaveProperty('type');
          expect(error).toHaveProperty('message');
          expect(error).toHaveProperty('severity');
          expect(typeof error.message).toBe('string');
          expect(error.message.length).toBeGreaterThan(0);
        });

        // All warnings should have proper structure
        result1.warnings.forEach(warning => {
          expect(warning).toHaveProperty('type');
          expect(warning).toHaveProperty('message');
          expect(typeof warning.message).toBe('string');
          expect(warning.message.length).toBeGreaterThan(0);
        });
      }
    });

    it('should provide consistent parameter sanitization', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            t_end: fc.float({ min: -10, max: 1000 }),
            n_steps: fc.float({ min: -10, max: 10000 }), // Using float to test rounding
            seed: fc.option(fc.float({ min: -100, max: 2000000 })),
            utl: fc.option(fc.float({ min: -10, max: 2000 })),
            gml: fc.option(fc.float({ min: -1000, max: 2000000 })),
            equilibrate: fc.option(fc.float({ min: -10, max: 100 })),
            timeoutMs: fc.option(fc.float({ min: -1000, max: 300000 }))
          }),
          (options: NFsimExecutionOptions) => {
            // **Property 3: Input Validation Consistency**
            // *For any* parameters, sanitization should be consistent and safe

            const sanitized1 = validator.sanitizeParameters(options);
            const sanitized2 = validator.sanitizeParameters(options);

            // Sanitization should be deterministic
            expect(sanitized1).toEqual(sanitized2);

            // Sanitized parameters should be valid
            expect(sanitized1.t_end).toBeGreaterThan(0);
            expect(sanitized1.n_steps).toBeGreaterThan(0);
            expect(Number.isInteger(sanitized1.n_steps)).toBe(true);

            if (sanitized1.seed !== undefined && sanitized1.seed !== null) {
              expect(sanitized1.seed).toBeGreaterThanOrEqual(1);
              expect(sanitized1.seed).toBeLessThanOrEqual(999999);
              expect(Number.isInteger(sanitized1.seed)).toBe(true);
            }

            if (sanitized1.utl !== undefined && sanitized1.utl !== null) {
              expect(sanitized1.utl).toBeGreaterThanOrEqual(1);
              expect(sanitized1.utl).toBeLessThanOrEqual(1000);
            }

            if (sanitized1.gml !== undefined && sanitized1.gml !== null) {
              expect(sanitized1.gml).toBeGreaterThanOrEqual(1000);
            }

            if (sanitized1.equilibrate !== undefined && sanitized1.equilibrate !== null) {
              expect(sanitized1.equilibrate).toBeGreaterThanOrEqual(0);
            }

            if (sanitized1.timeoutMs !== undefined && sanitized1.timeoutMs !== null) {
              expect(sanitized1.timeoutMs).toBeGreaterThan(0);
            }

            // Original options should not be modified
            expect(options).not.toEqual(sanitized1);
          }
        ),
        { numRuns: 30, timeout: 5000 }
      );
    });
  });

  describe('Unit Tests for Input Validation Consistency', () => {
    it('should validate basic parameter constraints', () => {
      const validOptions: NFsimExecutionOptions = {
        t_end: 10,
        n_steps: 100,
        seed: 12345
      };

      const result = validator.validateParameters(validOptions);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid time parameters', () => {
      const invalidOptions: NFsimExecutionOptions = {
        t_end: -1,
        n_steps: 0
      };

      const result = validator.validateParameters(invalidOptions);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('end time'))).toBe(true);
      expect(result.errors.some(e => e.message.includes('steps'))).toBe(true);
    });

    it('should validate seed range', () => {
      const invalidSeed: NFsimExecutionOptions = {
        t_end: 1,
        n_steps: 10,
        seed: 2000000 // Too large
      };

      const result = validator.validateParameters(invalidSeed);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('seed'))).toBe(true);
    });

    it('should validate UTL constraints', () => {
      const invalidUTL: NFsimExecutionOptions = {
        t_end: 1,
        n_steps: 10,
        utl: 0 // Too small
      };

      const result = validator.validateParameters(invalidUTL);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('UTL'))).toBe(true);
    });

    it('should provide performance warnings', () => {
      const heavyOptions: NFsimExecutionOptions = {
        t_end: 2000, // Very long simulation
        n_steps: 50000 // Many steps
      };

      const result = validator.validateParameters(heavyOptions);
      expect(result.isValid).toBe(true); // Valid but with warnings
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.type === 'performance')).toBe(true);
    });

    it('should parse valid XML without errors', async () => {
      const validXML = `<?xml version="1.0"?>
<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">
  <model id="test" totalrate="1">
    <ListOfParameters/>
    <ListOfMoleculeTypes/>
    <ListOfCompartments/>
    <ListOfSpecies/>
    <ListOfReactionRules/>
    <ListOfObservables/>
    <ListOfFunctions/>
  </model>
</sbml>`;

      const result = await validator.validateXML(validXML);
      expect(result.isValid).toBe(true);
      expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    });

    it('should reject malformed XML', async () => {
      const invalidXML = '<?xml version="1.0"?><invalid><unclosed>';

      const result = await validator.validateXML(invalidXML);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.type === 'syntax')).toBe(true);
    });

    it('should detect NFsim compatibility issues', async () => {
      const incompatibleXML = `<?xml version="1.0"?>
<sbml><model id="test" totalrate="1">
  <ListOfParameters/>
  <ListOfMoleculeTypes/>
  <ListOfCompartments/>
  <ListOfSpecies/>
  <ListOfReactionRules>
    <ReactionRule id="RR1">
      <ListOfReactantPatterns/>
      <ListOfProductPatterns/>
      <RateLaw type="Ele" totalrate="0">
        <ListOfRateConstants>
          <RateConstant value="Observable_1"/>
        </ListOfRateConstants>
      </RateLaw>
    </ReactionRule>
  </ListOfReactionRules>
  <ListOfObservables/>
  <ListOfFunctions/>
</model></sbml>`;

      const result = await validator.validateXML(incompatibleXML);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.type === 'compatibility')).toBe(true);
      expect(result.errors.some(e => e.message.includes('Observable-dependent'))).toBe(true);
    });

    it('should sanitize parameters correctly', () => {
      const messyOptions: NFsimExecutionOptions = {
        t_end: -5, // Negative
        n_steps: 10.7, // Float
        seed: 2000000, // Too large
        utl: -10, // Negative
        gml: 500, // Too small
        equilibrate: -1 // Negative
      };

      const sanitized = validator.sanitizeParameters(messyOptions);

      expect(sanitized.t_end).toBe(0.001); // Minimum positive value
      expect(sanitized.n_steps).toBe(10); // Rounded down
      expect(sanitized.seed).toBe(999999); // Clamped to max
      expect(sanitized.utl).toBe(1); // Clamped to minimum
      expect(sanitized.gml).toBe(1000); // Raised to minimum
      expect(sanitized.equilibrate).toBe(0); // Clamped to minimum
      expect(sanitized.timeoutMs).toBeGreaterThan(0); // Should have default timeout
    });

    it('should provide helpful suggestions', () => {
      const basicOptions: NFsimExecutionOptions = {
        t_end: 100,
        n_steps: 1000
      };

      const result = validator.validateParameters(basicOptions);
      expect(result.isValid).toBe(true);
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.some(s => s.includes('UTL'))).toBe(true);
    });

    it('should handle empty XML gracefully', async () => {
      const result = await validator.validateXML('');
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate molecule type structure', async () => {
      const xmlWithDuplicates = `<?xml version="1.0"?>
<sbml><model id="test" totalrate="1">
  <ListOfMoleculeTypes>
    <MoleculeType id="A"/>
    <MoleculeType id="A"/>
  </ListOfMoleculeTypes>
  <ListOfParameters/>
  <ListOfCompartments/>
  <ListOfSpecies/>
  <ListOfReactionRules/>
  <ListOfObservables/>
  <ListOfFunctions/>
</model></sbml>`;

      const result = await validator.validateXML(xmlWithDuplicates);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Duplicate'))).toBe(true);
    });
  });
});