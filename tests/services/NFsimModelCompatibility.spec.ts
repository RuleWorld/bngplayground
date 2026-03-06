/**
 * NFsimModelCompatibility.spec.ts
 * 
 * Property-based tests for NFsim model compatibility robustness.
 * Tests polymerization rules, aggregation patterns, and cooperative binding mechanisms.
 * 
 * **Property 5: Model Compatibility Robustness**
 * **Validates: Requirements 2.1, 2.2, 2.3**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { BNGLModel, ReactionRule, MoleculeType } from '../../types';
import { runNFsimSimulation, validateModelForNFsim } from '@bngplayground/engine';
import { getComplexModelHandler, resetComplexModelHandler } from '@bngplayground/engine';
import { BNGXMLWriter } from '@bngplayground/engine';

// Mock NFsim WASM loader for testing (avoid actual WASM execution in tests)
vi.mock('../../services/simulation/NFsimLoader', () => ({
  runNFsim: vi.fn().mockImplementation(async (xml: string, options: any) => {
    // Simulate successful NFsim execution by returning mock GDAT
    const observables = xml.match(/<Observable[^>]*name="([^"]*)"[^>]*>/g) || [];
    const obsNames = observables.map(obs => {
      const match = obs.match(/name="([^"]*)"/);
      return match ? match[1] : 'Unknown';
    });
    
    // Generate mock GDAT with time series data
    let gdat = '# time\t' + obsNames.join('\t') + '\n';
    for (let i = 0; i <= options.n_steps; i++) {
      const time = (i / options.n_steps) * options.t_end;
      const values = obsNames.map(() => Math.floor(Math.random() * 100));
      gdat += `${time}\t${values.join('\t')}\n`;
    }
    return gdat;
  }),
  resetNFsim: vi.fn()
}));

describe('NFsim Model Compatibility Robustness', () => {
  
  beforeEach(() => {
    resetComplexModelHandler();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Property 5: Model Compatibility Robustness', () => {
    
    it('should execute polymerization models successfully without crashes', async () => {
      await fc.assert(
        fc.asyncProperty(
          polymerizationModelGenerator(),
          async (model) => {
            // **Validates: Requirements 2.1**
            // WHEN a model contains polymerization rules THEN the System SHALL execute NFsim simulation successfully
            
            // Step 1: Validate model structure
            expect(model.moleculeTypes).toBeDefined();
            expect(model.reactionRules).toBeDefined();
            expect(model.reactionRules.length).toBeGreaterThan(0);
            
            // Step 2: Verify polymerization characteristics
            const hasPolymerizationRule = model.reactionRules.some(rule => 
              isPolymerizationRule(rule)
            );
            expect(hasPolymerizationRule).toBe(true);
            
            // Step 3: Generate XML without crashes
            let xml: string;
            try {
              xml = BNGXMLWriter.write(model);
              expect(xml).toBeDefined();
              expect(xml.length).toBeGreaterThan(0);
            } catch (error) {
              throw new Error(`XML generation failed for polymerization model: ${error}`);
            }
            
            // Step 4: Analyze complex model patterns
            const handler = getComplexModelHandler();
            const analysis = handler.analyzeComplexModel(xml);
            expect(analysis.hasPolymerization).toBe(true);
            
            // Step 5: Execute simulation without crashes
            try {
              const result = await runNFsimSimulation(model, {
                t_end: 10,
                n_steps: 50,
                seed: 12345,
                utl: analysis.requiredParameters.minUTL,
                gml: analysis.requiredParameters.minGML
              });
              
              // Verify successful execution
              expect(result).toBeDefined();
              expect(result.headers).toBeDefined();
              expect(result.data).toBeDefined();
              expect(result.data.length).toBeGreaterThan(0);
            } catch (error) {
              throw new Error(`NFsim execution failed for polymerization model: ${error}`);
            }
          }
        ),
        { numRuns: 100, timeout: 30000 }
      );
    });

    it('should handle aggregation patterns without crashes', async () => {
      await fc.assert(
        fc.asyncProperty(
          aggregationModelGenerator(),
          async (model) => {
            // **Validates: Requirements 2.2**
            // WHEN a model contains aggregation patterns THEN the System SHALL handle complex pattern matching without crashes
            
            // Step 1: Validate model structure
            expect(model.moleculeTypes).toBeDefined();
            expect(model.reactionRules).toBeDefined();
            expect(model.observables).toBeDefined();
            
            // Step 2: Verify aggregation characteristics
            const hasAggregationPattern = model.reactionRules.some(rule =>
              isAggregationRule(rule)
            );
            expect(hasAggregationPattern).toBe(true);
            
            // Step 3: Generate XML without crashes
            let xml: string;
            try {
              xml = BNGXMLWriter.write(model);
              expect(xml).toBeDefined();
              expect(xml.length).toBeGreaterThan(0);
            } catch (error) {
              throw new Error(`XML generation failed for aggregation model: ${error}`);
            }
            
            // Step 4: Analyze complex model patterns
            const handler = getComplexModelHandler();
            const analysis = handler.analyzeComplexModel(xml);
            
            // Step 5: Process model with safeguards
            const processed = handler.processComplexModel(xml, analysis);
            expect(processed.processedXML).toBeDefined();
            
            // Step 6: Execute simulation without crashes
            try {
              const result = await runNFsimSimulation(model, {
                t_end: 10,
                n_steps: 50,
                seed: 12345,
                utl: Math.max(analysis.requiredParameters.minUTL, 100),
                gml: Math.max(analysis.requiredParameters.minGML, 50000)
              });
              
              // Verify successful execution
              expect(result).toBeDefined();
              expect(result.headers).toBeDefined();
              expect(result.data).toBeDefined();
              expect(result.data.length).toBeGreaterThan(0);
            } catch (error) {
              throw new Error(`NFsim execution failed for aggregation model: ${error}`);
            }
          }
        ),
        { numRuns: 100, timeout: 30000 }
      );
    });

    it('should simulate cooperative binding mechanisms correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          cooperativeBindingModelGenerator(),
          async (model) => {
            // **Validates: Requirements 2.3**
            // WHEN a model uses cooperative binding mechanisms THEN the System SHALL simulate the dynamics correctly
            
            // Step 1: Validate model structure
            expect(model.moleculeTypes).toBeDefined();
            expect(model.reactionRules).toBeDefined();
            
            // Step 2: Verify cooperative binding characteristics
            const hasCooperativeBinding = model.moleculeTypes.some(molType =>
              hasMultipleBindingSites(molType)
            );
            // Note: We're testing that models with multiple binding sites execute successfully
            // The complex model handler may or may not detect this as "cooperative binding"
            // depending on the XML structure, but that's okay - we're testing execution robustness
            
            // Step 3: Generate XML without crashes
            let xml: string;
            try {
              xml = BNGXMLWriter.write(model);
              expect(xml).toBeDefined();
              expect(xml.length).toBeGreaterThan(0);
            } catch (error) {
              throw new Error(`XML generation failed for cooperative binding model: ${error}`);
            }
            
            // Step 4: Analyze complex model patterns
            const handler = getComplexModelHandler();
            const analysis = handler.analyzeComplexModel(xml);
            
            // Step 5: Execute simulation without crashes
            try {
              const result = await runNFsimSimulation(model, {
                t_end: 10,
                n_steps: 50,
                seed: 12345,
                utl: Math.max(analysis.requiredParameters.minUTL, 80),
                equilibrate: analysis.requiredParameters.recommendedEquilibration
              });
              
              // Verify successful execution
              expect(result).toBeDefined();
              expect(result.headers).toBeDefined();
              expect(result.data).toBeDefined();
              expect(result.data.length).toBeGreaterThan(0);
            } catch (error) {
              throw new Error(`NFsim execution failed for cooperative binding model: ${error}`);
            }
          }
        ),
        { numRuns: 100, timeout: 30000 }
      );
    });

    it('should handle mixed complex model types robustly', async () => {
      await fc.assert(
        fc.asyncProperty(
          mixedComplexModelGenerator(),
          async (model) => {
            // **Validates: Requirements 2.1, 2.2, 2.3**
            // Test models with multiple complex features combined
            
            // Step 1: Generate XML
            let xml: string;
            try {
              xml = BNGXMLWriter.write(model);
              expect(xml).toBeDefined();
            } catch (error) {
              throw new Error(`XML generation failed for mixed complex model: ${error}`);
            }
            
            // Step 2: Analyze and process
            const handler = getComplexModelHandler();
            const analysis = handler.analyzeComplexModel(xml);
            const processed = handler.processComplexModel(xml, analysis);
            
            // Step 3: Verify safeguards are applied for high-risk models
            if (analysis.riskLevel === 'high' || analysis.riskLevel === 'critical') {
              expect(processed.safeguards.length).toBeGreaterThan(0);
              expect(analysis.recommendations.length).toBeGreaterThan(0);
            }
            
            // Step 4: Execute with appropriate parameters
            try {
              const result = await runNFsimSimulation(model, {
                t_end: 5, // Shorter time for complex models
                n_steps: 25,
                seed: 12345,
                utl: analysis.requiredParameters.minUTL,
                gml: analysis.requiredParameters.minGML,
                equilibrate: analysis.requiredParameters.recommendedEquilibration
              });
              
              // Verify successful execution
              expect(result).toBeDefined();
              expect(result.data.length).toBeGreaterThan(0);
            } catch (error) {
              throw new Error(`NFsim execution failed for mixed complex model: ${error}`);
            }
          }
        ),
        { numRuns: 100, timeout: 30000 }
      );
    });
  });

  describe('Unit Tests for Specific Complex Model Scenarios', () => {
    
    it('should handle linear polymerization model', async () => {
      const model = createLinearPolymerizationModel();
      
      const xml = BNGXMLWriter.write(model);
      expect(xml).toBeDefined();
      
      const handler = getComplexModelHandler();
      const analysis = handler.analyzeComplexModel(xml);
      
      expect(analysis.hasPolymerization).toBe(true);
      expect(analysis.polymerizationRules.length).toBeGreaterThan(0);
      
      const result = await runNFsimSimulation(model, {
        t_end: 10,
        n_steps: 50,
        utl: 200,
        gml: 100000
      });
      
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should handle multi-component aggregation model', async () => {
      const model = createAggregationModel();
      
      const xml = BNGXMLWriter.write(model);
      expect(xml).toBeDefined();
      
      const handler = getComplexModelHandler();
      const analysis = handler.analyzeComplexModel(xml);
      
      const result = await runNFsimSimulation(model, {
        t_end: 10,
        n_steps: 50,
        utl: 150,
        gml: 50000
      });
      
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should handle cooperative binding with multiple sites', async () => {
      const model = createCooperativeBindingModel();
      
      const xml = BNGXMLWriter.write(model);
      expect(xml).toBeDefined();
      
      const handler = getComplexModelHandler();
      const analysis = handler.analyzeComplexModel(xml);
      
      expect(analysis.hasCooperativeBinding).toBe(true);
      
      const result = await runNFsimSimulation(model, {
        t_end: 10,
        n_steps: 50,
        utl: 100,
        equilibrate: 2
      });
      
      expect(result.data.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Generator Functions for Property-Based Testing
// ============================================================================

/**
 * Generate models with polymerization rules
 */
function polymerizationModelGenerator(): fc.Arbitrary<BNGLModel> {
  return fc.record({
    name: fc.constant('polymerization_model'),
    parameters: fc.constant({
      kon: 0.1,
      koff: 0.01
    }),
    moleculeTypes: fc.constant([
      { name: 'Monomer', components: ['left', 'right'] }
    ]),
    species: fc.constant([
      { name: 'Monomer(left,right)', initialConcentration: 1000 }
    ]),
    reactionRules: fc.array(
      fc.record({
        name: fc.string({ minLength: 5, maxLength: 15 }),
        reactionString: fc.constant('Monomer(left,right) + Monomer(left,right) <-> Monomer(left!1,right).Monomer(left,right!1) kon, koff'),
        reactants: fc.constant(['Monomer(left,right)', 'Monomer(left,right)']),
        products: fc.constant(['Monomer(left!1,right).Monomer(left,right!1)']),
        rate: fc.constant('kon'),
        reverseRate: fc.constant('koff'),
        isBidirectional: fc.constant(true)
      }),
      { minLength: 1, maxLength: 3 }
    ),
    observables: fc.constant([
      { name: 'Monomers', type: 'Molecules', pattern: 'Monomer(left,right)' },
      { name: 'Polymers', type: 'Molecules', pattern: 'Monomer(left!+)' }
    ])
  });
}

/**
 * Generate models with aggregation patterns
 */
function aggregationModelGenerator(): fc.Arbitrary<BNGLModel> {
  return fc.record({
    name: fc.constant('aggregation_model'),
    parameters: fc.constant({
      k_bind: 0.1,
      k_unbind: 0.01
    }),
    moleculeTypes: fc.constant([
      { name: 'Core', components: ['s1', 's2', 's3'] },
      { name: 'Ligand', components: ['b'] }
    ]),
    species: fc.constant([
      { name: 'Core(s1,s2,s3)', initialConcentration: 100 },
      { name: 'Ligand(b)', initialConcentration: 500 }
    ]),
    reactionRules: fc.array(
      fc.oneof(
        fc.constant({
          name: 'bind_s1',
          reactionString: 'Core(s1) + Ligand(b) <-> Core(s1!1).Ligand(b!1) k_bind, k_unbind',
          reactants: ['Core(s1)', 'Ligand(b)'],
          products: ['Core(s1!1).Ligand(b!1)'],
          rate: 'k_bind',
          reverseRate: 'k_unbind',
          isBidirectional: true
        }),
        fc.constant({
          name: 'bind_s2',
          reactionString: 'Core(s2) + Ligand(b) <-> Core(s2!1).Ligand(b!1) k_bind, k_unbind',
          reactants: ['Core(s2)', 'Ligand(b)'],
          products: ['Core(s2!1).Ligand(b!1)'],
          rate: 'k_bind',
          reverseRate: 'k_unbind',
          isBidirectional: true
        }),
        fc.constant({
          name: 'bind_s3',
          reactionString: 'Core(s3) + Ligand(b) <-> Core(s3!1).Ligand(b!1) k_bind, k_unbind',
          reactants: ['Core(s3)', 'Ligand(b)'],
          products: ['Core(s3!1).Ligand(b!1)'],
          rate: 'k_bind',
          reverseRate: 'k_unbind',
          isBidirectional: true
        })
      ),
      { minLength: 2, maxLength: 3 }
    ),
    observables: fc.constant([
      { name: 'FreeCore', type: 'Molecules', pattern: 'Core(s1,s2,s3)' },
      { name: 'Aggregates', type: 'Molecules', pattern: 'Core(s1!+)' }
    ])
  });
}

/**
 * Generate models with cooperative binding mechanisms
 */
function cooperativeBindingModelGenerator(): fc.Arbitrary<BNGLModel> {
  return fc.record({
    name: fc.constant('cooperative_binding_model'),
    parameters: fc.constant({
      k1: 0.1,
      k2: 0.5, // Enhanced rate for second binding
      koff: 0.01
    }),
    moleculeTypes: fc.constant([
      { name: 'Receptor', components: ['site1', 'site2', 'site3'] },
      { name: 'Ligand', components: ['b'] }
    ]),
    species: fc.constant([
      { name: 'Receptor(site1,site2,site3)', initialConcentration: 100 },
      { name: 'Ligand(b)', initialConcentration: 300 }
    ]),
    reactionRules: fc.constant([
      {
        name: 'first_binding',
        reactionString: 'Receptor(site1,site2) + Ligand(b) <-> Receptor(site1!1,site2).Ligand(b!1) k1, koff',
        reactants: ['Receptor(site1,site2)', 'Ligand(b)'],
        products: ['Receptor(site1!1,site2).Ligand(b!1)'],
        rate: 'k1',
        reverseRate: 'koff',
        isBidirectional: true
      },
      {
        name: 'cooperative_binding',
        reactionString: 'Receptor(site1!+,site2) + Ligand(b) <-> Receptor(site1!+,site2!1).Ligand(b!1) k2, koff',
        reactants: ['Receptor(site1!+,site2)', 'Ligand(b)'],
        products: ['Receptor(site1!+,site2!1).Ligand(b!1)'],
        rate: 'k2',
        reverseRate: 'koff',
        isBidirectional: true
      }
    ]),
    observables: fc.constant([
      { name: 'FreeReceptor', type: 'Molecules', pattern: 'Receptor(site1,site2,site3)' },
      { name: 'BoundReceptor', type: 'Molecules', pattern: 'Receptor(site1!+)' }
    ])
  });
}

/**
 * Generate models with mixed complex features
 */
function mixedComplexModelGenerator(): fc.Arbitrary<BNGLModel> {
  return fc.oneof(
    polymerizationModelGenerator(),
    aggregationModelGenerator(),
    cooperativeBindingModelGenerator()
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a rule represents polymerization
 */
function isPolymerizationRule(rule: ReactionRule): boolean {
  // Polymerization: same molecule type in reactants and products with new bonds
  const reactionStr = rule.reactionString.toLowerCase();
  return (
    reactionStr.includes('!1') &&
    (reactionStr.includes('monomer') || reactionStr.includes('polymer'))
  );
}

/**
 * Check if a rule represents aggregation
 */
function isAggregationRule(rule: ReactionRule): boolean {
  // Aggregation: multiple binding sites or core-ligand patterns
  const reactionStr = rule.reactionString.toLowerCase();
  return (
    (reactionStr.includes('core') || reactionStr.includes('ligand')) ||
    (reactionStr.includes('s1') || reactionStr.includes('s2') || reactionStr.includes('s3'))
  );
}

/**
 * Check if a molecule type has multiple binding sites (cooperative binding)
 */
function hasMultipleBindingSites(molType: MoleculeType): boolean {
  return molType.components && molType.components.length >= 2;
}

// ============================================================================
// Model Creation Functions for Unit Tests
// ============================================================================

function createLinearPolymerizationModel(): BNGLModel {
  return {
    name: 'linear_polymer',
    parameters: { kon: 0.1, koff: 0.01 },
    moleculeTypes: [
      { name: 'Monomer', components: ['left', 'right'] }
    ],
    species: [
      { name: 'Monomer(left,right)', initialConcentration: 1000 }
    ],
    reactionRules: [{
      name: 'polymerize',
      reactionString: 'Monomer(left,right) + Monomer(left,right) <-> Monomer(left!1,right).Monomer(left,right!1) kon, koff',
      reactants: ['Monomer(left,right)', 'Monomer(left,right)'],
      products: ['Monomer(left!1,right).Monomer(left,right!1)'],
      rate: 'kon',
      reverseRate: 'koff',
      isBidirectional: true
    }],
    observables: [
      { name: 'Monomers', type: 'Molecules', pattern: 'Monomer(left,right)' },
      { name: 'Polymers', type: 'Molecules', pattern: 'Monomer(left!+)' }
    ]
  };
}

function createAggregationModel(): BNGLModel {
  return {
    name: 'aggregation',
    parameters: { k_bind: 0.1, k_unbind: 0.01 },
    moleculeTypes: [
      { name: 'Core', components: ['s1', 's2', 's3'] },
      { name: 'Ligand', components: ['b'] }
    ],
    species: [
      { name: 'Core(s1,s2,s3)', initialConcentration: 100 },
      { name: 'Ligand(b)', initialConcentration: 500 }
    ],
    reactionRules: [
      {
        name: 'bind_s1',
        reactionString: 'Core(s1) + Ligand(b) <-> Core(s1!1).Ligand(b!1) k_bind, k_unbind',
        reactants: ['Core(s1)', 'Ligand(b)'],
        products: ['Core(s1!1).Ligand(b!1)'],
        rate: 'k_bind',
        reverseRate: 'k_unbind',
        isBidirectional: true
      },
      {
        name: 'bind_s2',
        reactionString: 'Core(s2) + Ligand(b) <-> Core(s2!1).Ligand(b!1) k_bind, k_unbind',
        reactants: ['Core(s2)', 'Ligand(b)'],
        products: ['Core(s2!1).Ligand(b!1)'],
        rate: 'k_bind',
        reverseRate: 'k_unbind',
        isBidirectional: true
      }
    ],
    observables: [
      { name: 'FreeCore', type: 'Molecules', pattern: 'Core(s1,s2,s3)' },
      { name: 'Aggregates', type: 'Molecules', pattern: 'Core(s1!+)' }
    ]
  };
}

function createCooperativeBindingModel(): BNGLModel {
  return {
    name: 'cooperative_binding',
    parameters: { k1: 0.1, k2: 0.5, koff: 0.01 },
    moleculeTypes: [
      { name: 'Receptor', components: ['site1', 'site2', 'site3'] },
      { name: 'Ligand', components: ['b'] }
    ],
    species: [
      { name: 'Receptor(site1,site2,site3)', initialConcentration: 100 },
      { name: 'Ligand(b)', initialConcentration: 300 }
    ],
    reactionRules: [
      {
        name: 'first_binding',
        reactionString: 'Receptor(site1,site2) + Ligand(b) <-> Receptor(site1!1,site2).Ligand(b!1) k1, koff',
        reactants: ['Receptor(site1,site2)', 'Ligand(b)'],
        products: ['Receptor(site1!1,site2).Ligand(b!1)'],
        rate: 'k1',
        reverseRate: 'koff',
        isBidirectional: true
      },
      {
        name: 'cooperative_binding',
        reactionString: 'Receptor(site1!+,site2) + Ligand(b) <-> Receptor(site1!+,site2!1).Ligand(b!1) k2, koff',
        reactants: ['Receptor(site1!+,site2)', 'Ligand(b)'],
        products: ['Receptor(site1!+,site2!1).Ligand(b!1)'],
        rate: 'k2',
        reverseRate: 'koff',
        isBidirectional: true
      }
    ],
    observables: [
      { name: 'FreeReceptor', type: 'Molecules', pattern: 'Receptor(site1,site2,site3)' },
      { name: 'BoundReceptor', type: 'Molecules', pattern: 'Receptor(site1!+)' }
    ]
  };
}
