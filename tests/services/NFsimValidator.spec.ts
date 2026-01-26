import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { NFsimValidator, ValidationErrorType } from '../../services/simulation/NFsimValidator';
import { BNGLModel, ReactionRule, BNGLFunction, BNGLCompartment } from '../../types';

describe('NFsimValidator', () => {
  
  describe('Property 9: Model Validation Comprehensiveness', () => {
    it('should detect TotalRate modifiers in any valid BNGL model', async () => {
      await fc.assert(
        fc.asyncProperty(
          bnglModelWithTotalRateGenerator(),
          async (model) => {
            // **Property 9: Model Validation Comprehensiveness**
            // *For any* BNGL model, the validator should detect TotalRate modifiers
            const result = NFsimValidator.validateForNFsim(model);
            
            const hasTotalRateError = result.errors.some(e => 
              e.type === ValidationErrorType.TOTAL_RATE_MODIFIER
            );
            
            expect(hasTotalRateError).toBe(true);
            expect(result.valid).toBe(false);
          }
        ),
        { numRuns: 50, timeout: 10000 }
      );
    });

    it('should detect observable-dependent rates in any valid BNGL model', async () => {
      await fc.assert(
        fc.asyncProperty(
          bnglModelWithObservableDependentRateGenerator(),
          async (model) => {
            // **Property 9: Model Validation Comprehensiveness**
            // *For any* BNGL model, the validator should detect observable-dependent rates
            const result = NFsimValidator.validateForNFsim(model);
            
            const hasObservableRateError = result.errors.some(e => 
              e.type === ValidationErrorType.OBSERVABLE_DEPENDENT_RATE
            );
            
            expect(hasObservableRateError).toBe(true);
            expect(result.valid).toBe(false);
          }
        ),
        { numRuns: 50, timeout: 10000 }
      );
    });

    it('should detect unsupported functions in any valid BNGL model', async () => {
      await fc.assert(
        fc.asyncProperty(
          bnglModelWithUnsupportedFunctionGenerator(),
          async (model) => {
            // **Property 9: Model Validation Comprehensiveness**
            // *For any* BNGL model, the validator should detect unsupported functions
            const result = NFsimValidator.validateForNFsim(model);
            
            const hasUnsupportedFunctionError = result.errors.some(e => 
              e.type === ValidationErrorType.UNSUPPORTED_FUNCTION
            );
            
            expect(hasUnsupportedFunctionError).toBe(true);
            expect(result.valid).toBe(false);
          }
        ),
        { numRuns: 50, timeout: 10000 }
      );
    });

    it('should recommend optimal parameters for any complex model', async () => {
      await fc.assert(
        fc.asyncProperty(
          complexBnglModelGenerator(),
          async (model) => {
            // **Property 9: Model Validation Comprehensiveness**
            // *For any* complex BNGL model, the validator should provide comprehensive analysis
            const result = NFsimValidator.validateForNFsim(model);
            
            // Validator should always return a result structure
            expect(result).toBeDefined();
            expect(result.valid).toBeDefined();
            expect(result.errors).toBeDefined();
            expect(result.warnings).toBeDefined();
            expect(result.recommendations).toBeDefined();
            
            // All errors should have proper structure
            for (const error of result.errors) {
              expect(error.type).toBeDefined();
              expect(error.message).toBeDefined();
            }
            
            // All warnings should have proper structure
            for (const warning of result.warnings) {
              expect(warning.type).toBeDefined();
              expect(warning.message).toBeDefined();
              expect(warning.severity).toBeDefined();
            }
            
            // All recommendations should have proper structure
            for (const rec of result.recommendations) {
              expect(rec.type).toBeDefined();
              expect(rec.message).toBeDefined();
              expect(rec.priority).toBeDefined();
            }
          }
        ),
        { numRuns: 20, timeout: 10000 }
      );
    });

    it('should validate basic requirements for any model structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          incompleteBnglModelGenerator(),
          async (model) => {
            // **Property 9: Model Validation Comprehensiveness**
            // *For any* incomplete BNGL model, the validator should detect missing requirements
            const result = NFsimValidator.validateForNFsim(model);
            
            // Check that missing requirements are detected
            const hasMissingRequirementsError = result.errors.some(e => 
              e.type === ValidationErrorType.MISSING_REQUIREMENTS
            );
            
            expect(hasMissingRequirementsError).toBe(true);
            expect(result.valid).toBe(false);
          }
        ),
        { numRuns: 40, timeout: 10000 }
      );
    });
  });

  describe('Unit Tests for Specific Scenarios', () => {
    it('should detect TotalRate modifier in rule string', () => {
      const model = createBasicModel();
      model.reactionRules = [{
        name: 'test_rule',
        reactionString: 'A + B -> C k1 TotalRate',
        reactants: ['A', 'B'],
        products: ['C'],
        rate: 'k1',
        isBidirectional: false,
        totalRate: true
      }];

      const result = NFsimValidator.validateForNFsim(model);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe(ValidationErrorType.TOTAL_RATE_MODIFIER);
    });

    it('should detect observable-dependent rate', () => {
      const model = createBasicModel();
      model.observables = [{ name: 'TotalA', type: 'Molecules', pattern: 'A()' }];
      model.reactionRules = [{
        name: 'test_rule',
        reactionString: 'A + B -> C k1*TotalA',
        reactants: ['A', 'B'],
        products: ['C'],
        rate: 'k1*TotalA',
        isBidirectional: false,
        isFunctionalRate: true
      }];

      const result = NFsimValidator.validateForNFsim(model);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe(ValidationErrorType.OBSERVABLE_DEPENDENT_RATE);
    });

    it('should detect unsupported function with if statement', () => {
      const model = createBasicModel();
      model.functions = [{
        name: 'conditional_rate',
        expression: 'if(time > 100, k1*2, k1)',
        arguments: []
      }];

      const result = NFsimValidator.validateForNFsim(model);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe(ValidationErrorType.UNSUPPORTED_FUNCTION);
    });

    it('should validate complete model successfully', () => {
      const model = createCompleteValidModel();
      const result = NFsimValidator.validateForNFsim(model);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should generate performance recommendations for complex models', () => {
      const model = createComplexModel();
      const result = NFsimValidator.validateForNFsim(model);
      
      expect(result.recommendations.length).toBeGreaterThan(0);
      
      const hasUTLRecommendation = result.recommendations.some(r => 
        r.parameters && r.parameters.utl
      );
      expect(hasUTLRecommendation).toBe(true);
    });
  });
});

// Generator functions for property-based testing

function bnglModelWithTotalRateGenerator(): fc.Arbitrary<BNGLModel> {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    parameters: fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.float({ min: Math.fround(0.1), max: Math.fround(100) })),
    moleculeTypes: fc.array(moleculeTypeGenerator(), { minLength: 1, maxLength: 5 }),
    species: fc.array(speciesGenerator(), { minLength: 1, maxLength: 5 }),
    reactionRules: fc.array(totalRateRuleGenerator(), { minLength: 1, maxLength: 3 }),
    observables: fc.array(observableGenerator(), { minLength: 1, maxLength: 3 })
  });
}

function bnglModelWithObservableDependentRateGenerator(): fc.Arbitrary<BNGLModel> {
  const specificObservables = fc.constant([
      { name: 'TotalA', type: 'Molecules', pattern: 'A()' },
      { name: 'ObsB', type: 'Molecules', pattern: 'B()' },
      { name: 'S_total', type: 'Molecules', pattern: 'S()' }
  ]);

  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    parameters: fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.float({ min: Math.fround(0.1), max: Math.fround(100) })),
    moleculeTypes: fc.array(moleculeTypeGenerator(), { minLength: 1, maxLength: 5 }),
    species: fc.array(speciesGenerator(), { minLength: 1, maxLength: 5 }),
    reactionRules: fc.array(observableDependentRuleGenerator(), { minLength: 1, maxLength: 3 }),
    observables: specificObservables
  });
}

function bnglModelWithUnsupportedFunctionGenerator(): fc.Arbitrary<BNGLModel> {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    parameters: fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.float({ min: Math.fround(0.1), max: Math.fround(100) })),
    moleculeTypes: fc.array(moleculeTypeGenerator(), { minLength: 1, maxLength: 5 }),
    species: fc.array(speciesGenerator(), { minLength: 1, maxLength: 5 }),
    reactionRules: fc.array(basicRuleGenerator(), { minLength: 1, maxLength: 3 }),
    observables: fc.array(observableGenerator(), { minLength: 1, maxLength: 3 }),
    functions: fc.array(unsupportedFunctionGenerator(), { minLength: 1, maxLength: 2 })
  });
}

function complexBnglModelGenerator(): fc.Arbitrary<BNGLModel> {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    parameters: fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.float({ min: Math.fround(0.1), max: Math.fround(100) })),
    moleculeTypes: fc.array(complexMoleculeTypeGenerator(), { minLength: 3, maxLength: 8 }),
    species: fc.array(speciesGenerator(), { minLength: 5, maxLength: 15 }),
    reactionRules: fc.array(complexRuleGenerator(), { minLength: 10, maxLength: 25 }),
    observables: fc.array(observableGenerator(), { minLength: 3, maxLength: 10 })
  });
}

function incompleteBnglModelGenerator(): fc.Arbitrary<BNGLModel> {
  return fc.oneof(
    // Missing molecule types
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 20 }),
      parameters: fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.float({ min: Math.fround(0.1), max: Math.fround(100) })),
      moleculeTypes: fc.constant([]),
      species: fc.array(speciesGenerator(), { minLength: 1, maxLength: 3 }),
      reactionRules: fc.array(basicRuleGenerator(), { minLength: 1, maxLength: 3 }),
      observables: fc.array(observableGenerator(), { minLength: 1, maxLength: 3 })
    }),
    // Missing species
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 20 }),
      parameters: fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.float({ min: Math.fround(0.1), max: Math.fround(100) })),
      moleculeTypes: fc.array(moleculeTypeGenerator(), { minLength: 1, maxLength: 3 }),
      species: fc.constant([]),
      reactionRules: fc.array(basicRuleGenerator(), { minLength: 1, maxLength: 3 }),
      observables: fc.array(observableGenerator(), { minLength: 1, maxLength: 3 })
    }),
    // Missing rules
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 20 }),
      parameters: fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.float({ min: Math.fround(0.1), max: Math.fround(100) })),
      moleculeTypes: fc.array(moleculeTypeGenerator(), { minLength: 1, maxLength: 3 }),
      species: fc.array(speciesGenerator(), { minLength: 1, maxLength: 3 }),
      reactionRules: fc.constant([]),
      observables: fc.array(observableGenerator(), { minLength: 1, maxLength: 3 })
    }),
    // Missing observables
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 20 }),
      parameters: fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.float({ min: Math.fround(0.1), max: Math.fround(100) })),
      moleculeTypes: fc.array(moleculeTypeGenerator(), { minLength: 1, maxLength: 3 }),
      species: fc.array(speciesGenerator(), { minLength: 1, maxLength: 3 }),
      reactionRules: fc.array(basicRuleGenerator(), { minLength: 1, maxLength: 3 }),
      observables: fc.constant([])
    })
  );
}

function moleculeTypeGenerator(): fc.Arbitrary<any> {
  return fc.record({
    name: fc.stringMatching(/^[A-Z][a-zA-Z0-9_]*$/),
    components: fc.array(fc.stringMatching(/^[a-z][a-zA-Z0-9_]*$/), { minLength: 0, maxLength: 3 })
  });
}

function complexMoleculeTypeGenerator(): fc.Arbitrary<any> {
  return fc.record({
    name: fc.stringMatching(/^[A-Z][a-zA-Z0-9_]*$/),
    components: fc.array(fc.stringMatching(/^[a-z][a-zA-Z0-9_]*$/), { minLength: 2, maxLength: 6 })
  });
}

function speciesGenerator(): fc.Arbitrary<any> {
  return fc.record({
    name: fc.stringMatching(/^[A-Z][a-zA-Z0-9_()~!]*$/),
    initialConcentration: fc.float({ min: Math.fround(1), max: Math.fround(10000) })
  });
}

function basicRuleGenerator(): fc.Arbitrary<ReactionRule> {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 15 }),
    reactionString: fc.string({ minLength: 5, maxLength: 50 }),
    reactants: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
    products: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
    rate: fc.oneof(fc.float({ min: Math.fround(0.001), max: Math.fround(1000) }), fc.string({ minLength: 1, maxLength: 10 })),
    isBidirectional: fc.boolean()
  });
}

function totalRateRuleGenerator(): fc.Arbitrary<ReactionRule> {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 15 }),
    reactionString: fc.string({ minLength: 5, maxLength: 50 }).map(s => s + ' TotalRate'),
    reactants: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
    products: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
    rate: fc.oneof(fc.float({ min: Math.fround(0.001), max: Math.fround(1000) }), fc.string({ minLength: 1, maxLength: 10 })),
    isBidirectional: fc.boolean(),
    totalRate: fc.constant(true)
  });
}

function observableDependentRuleGenerator(): fc.Arbitrary<ReactionRule> {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 15 }),
    reactionString: fc.string({ minLength: 5, maxLength: 50 }),
    reactants: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
    products: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
    rate: fc.oneof(
      fc.constant('k1*TotalA'),
      fc.constant('k2*ObsB'),
      fc.constant('Vmax*S_total/(Km+S_total)')
    ),
    isBidirectional: fc.boolean(),
    isFunctionalRate: fc.constant(true)
  });
}

function complexRuleGenerator(): fc.Arbitrary<ReactionRule> {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 15 }),
    reactionString: fc.string({ minLength: 20, maxLength: 100 }).map(s => 
      s + '(a!1,b!2,c!3).B(x!1,y!2,z!3) -> ' + s + '(a,b,c) + B(x,y,z)'
    ),
    reactants: fc.array(fc.string({ minLength: 10, maxLength: 50 }), { minLength: 1, maxLength: 2 }),
    products: fc.array(fc.string({ minLength: 10, maxLength: 50 }), { minLength: 1, maxLength: 3 }),
    rate: fc.oneof(fc.float({ min: Math.fround(0.001), max: Math.fround(1000) }), fc.string({ minLength: 1, maxLength: 10 })),
    isBidirectional: fc.boolean()
  });
}

function observableGenerator(): fc.Arbitrary<any> {
  return fc.record({
    name: fc.stringMatching(/^[A-Z][a-zA-Z0-9_]*$/),
    type: fc.oneof(fc.constant('Molecules'), fc.constant('Species')),
    pattern: fc.stringMatching(/^[A-Z][a-zA-Z0-9_()~!]*$/)
  });
}

function unsupportedFunctionGenerator(): fc.Arbitrary<BNGLFunction> {
  return fc.record({
    name: fc.stringMatching(/^[a-z][a-zA-Z0-9_]*$/),
    expression: fc.oneof(
      fc.constant('if(time > 100, k1*2, k1)'),
      fc.constant('if(TotalA > 50, k2, k3)'),
      fc.constant('k1 * time'),
      fc.constant('exp(-time/tau)')
    ),
    arguments: fc.constant([])
  });
}

// Helper functions for creating test models

function createBasicModel(): BNGLModel {
  return {
    name: 'test_model',
    parameters: { k1: 1.0 },
    moleculeTypes: [{ name: 'A', components: [] }, { name: 'B', components: [] }, { name: 'C', components: [] }],
    species: [
      { name: 'A()', initialConcentration: 100 },
      { name: 'B()', initialConcentration: 100 }
    ],
    reactionRules: [{
      name: 'basic_rule',
      reactionString: 'A + B -> C k1',
      reactants: ['A', 'B'],
      products: ['C'],
      rate: 'k1',
      isBidirectional: false
    }],
    observables: [{ name: 'TotalC', type: 'Molecules', pattern: 'C()' }]
  };
}

function createCompleteValidModel(): BNGLModel {
  return {
    name: 'valid_model',
    parameters: { k1: 1.0, k2: 2.0 },
    moleculeTypes: [
      { name: 'A', components: ['b'] },
      { name: 'B', components: ['a'] }
    ],
    species: [
      { name: 'A(b)', initialConcentration: 100 },
      { name: 'B(a)', initialConcentration: 100 }
    ],
    reactionRules: [{
      name: 'binding',
      reactionString: 'A(b) + B(a) <-> A(b!1).B(a!1) k1, k2',
      reactants: ['A(b)', 'B(a)'],
      products: ['A(b!1).B(a!1)'],
      rate: 'k1',
      reverseRate: 'k2',
      isBidirectional: true
    }],
    observables: [
      { name: 'FreeA', type: 'Molecules', pattern: 'A(b)' },
      { name: 'BoundAB', type: 'Molecules', pattern: 'A(b!1).B(a!1)' }
    ]
  };
}

function createComplexModel(): BNGLModel {
  const rules: ReactionRule[] = [];
  for (let i = 1; i <= 15; i++) {
    rules.push({
      name: `complex_rule_${i}`,
      reactionString: `A(b1,b2,b3,b4,b5) + B(a1,a2,a3,a4,a5) -> A(b1!1,b2,b3,b4,b5).B(a1!1,a2,a3,a4,a5) k${i}`,
      reactants: ['A(b1,b2,b3,b4,b5)', 'B(a1,a2,a3,a4,a5)'],
      products: ['A(b1!1,b2,b3,b4,b5).B(a1!1,a2,a3,a4,a5)'],
      rate: `k${i}`,
      isBidirectional: false
    });
  }

  return {
    name: 'complex_model',
    parameters: Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`k${i + 1}`, Math.random()])),
    moleculeTypes: [
      { name: 'A', components: ['b1', 'b2', 'b3', 'b4', 'b5'] },
      { name: 'B', components: ['a1', 'a2', 'a3', 'a4', 'a5'] }
    ],
    species: [
      { name: 'A(b1,b2,b3,b4,b5)', initialConcentration: 1000 },
      { name: 'B(a1,a2,a3,a4,a5)', initialConcentration: 1000 }
    ],
    reactionRules: rules,
    observables: [
      { name: 'FreeA', type: 'Molecules', pattern: 'A(b1,b2,b3,b4,b5)' },
      { name: 'Complexes', type: 'Molecules', pattern: 'A(b1!+)' }
    ]
  };
}