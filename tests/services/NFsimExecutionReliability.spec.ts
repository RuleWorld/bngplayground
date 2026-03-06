import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { NFsimExecutionWrapper } from '@bngplayground/engine';
import { resetMemoryManager } from '@bngplayground/engine';

// Mock WASM module for testing
const createMockModule = () => ({
  FS: {
    writeFile: vi.fn(),
    readFile: vi.fn().mockReturnValue('# Mock GDAT output\ntime,obs1,obs2\n0,100,50\n1,90,60\n'),
    unlink: vi.fn(),
    analyzePath: vi.fn().mockReturnValue({ exists: true })
  },
  callMain: vi.fn(),
  _malloc: (size: number) => Math.floor(Math.random() * 1000000) + 1000,
  _free: (ptr: number) => {},
  HEAPU8: new Uint8Array(1024 * 1024)
});

describe('NFsim Execution Reliability', () => {
  let executionWrapper: NFsimExecutionWrapper;
  let mockModuleLoader: () => Promise<any>;

  beforeEach(() => {
    resetMemoryManager();
    
    mockModuleLoader = vi.fn().mockResolvedValue(createMockModule());
    executionWrapper = new NFsimExecutionWrapper(mockModuleLoader);
  });

  afterEach(() => {
    resetMemoryManager();
  });

  describe('Property 1: WASM Execution Reliability', () => {
    it('should handle various XML inputs without crashing', async () => {
      await fc.assert(
        fc.asyncProperty(
          validXmlGenerator(),
          fc.record({
            t_end: fc.float({ min: Math.fround(0.1), max: Math.fround(100) }),
            n_steps: fc.integer({ min: 10, max: 1000 }),
            seed: fc.option(fc.integer({ min: 1, max: 999999 })),
            utl: fc.option(fc.integer({ min: 10, max: 1000 })),
            gml: fc.option(fc.integer({ min: 1000, max: 100000 })),
            timeoutMs: fc.constant(5000) // Short timeout for tests
          }),
          async (xmlContent, options) => {
            // **Property 1: WASM Execution Reliability**
            // *For any* valid XML input and simulation options, the execution wrapper
            // should either succeed or fail gracefully without crashing the system

            try {
              const result = await executionWrapper.executeSimulation(xmlContent, options);
              
              // Result should have consistent structure
              expect(result).toHaveProperty('success');
              expect(result).toHaveProperty('executionTime');
              expect(result).toHaveProperty('memoryUsed');
              expect(result).toHaveProperty('retryCount');
              
              if (result.success) {
                expect(result.gdatContent).toBeDefined();
                expect(typeof result.gdatContent).toBe('string');
                expect(result.gdatContent!.length).toBeGreaterThan(0);
              } else {
                expect(result.error).toBeDefined();
                expect(typeof result.error).toBe('string');
              }
              
              // Execution time should be reasonable
              expect(result.executionTime).toBeGreaterThanOrEqual(0);
              expect(result.executionTime).toBeLessThan(10000); // Less than 10 seconds
              
              // Memory usage should be tracked
              expect(result.memoryUsed).toBeGreaterThanOrEqual(0);
              
              // Retry count should be reasonable
              expect(result.retryCount).toBeGreaterThanOrEqual(0);
              expect(result.retryCount).toBeLessThanOrEqual(3);
              
            } catch (error) {
              // Unexpected crashes should not happen
              throw new Error(`Execution wrapper crashed unexpectedly: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        ),
        { numRuns: 15, timeout: 10000 }
      );
    });

    it('should recover from module corruption and retry', async () => {
      await fc.assert(
        fc.asyncProperty(
          validXmlGenerator(),
          fc.record({
            t_end: fc.float({ min: Math.fround(1), max: Math.fround(10) }),
            n_steps: fc.integer({ min: 50, max: 200 }),
            maxRetries: fc.integer({ min: 1, max: 3 }),
            timeoutMs: fc.constant(3000)
          }),
          async (xmlContent, options) => {
            // **Property 1: WASM Execution Reliability**
            // *For any* execution that encounters module corruption, the wrapper
            // should attempt recovery through module reset and retry

            // Create a module that fails on first call but succeeds on retry
            let callCount = 0;
            const flakyModuleLoader = vi.fn().mockImplementation(async () => {
              callCount++;
              const module = createMockModule();
              
              if (callCount === 1) {
                // First call fails
                module.callMain = vi.fn().mockImplementation(() => {
                  throw new Error('Simulated WASM corruption');
                });
              } else {
                // Subsequent calls succeed
                module.callMain = vi.fn();
              }
              
              return module;
            });

            const flakyWrapper = new NFsimExecutionWrapper(flakyModuleLoader);
            
            const result = await flakyWrapper.executeSimulation(xmlContent, options);
            
            // Should eventually succeed after retry
            if (options.maxRetries > 0) {
              // With retries enabled, should either succeed or exhaust retries
              if (result.success) {
                expect(result.retryCount).toBeGreaterThan(0);
                expect(result.gdatContent).toBeDefined();
              } else {
                expect(result.retryCount).toBe(options.maxRetries);
                expect(result.error).toContain('retry');
              }
            }
            
            // Module loader should have been called multiple times for retries
            if (!result.success || result.retryCount > 0) {
              expect(flakyModuleLoader).toHaveBeenCalledTimes(Math.min(callCount, options.maxRetries + 1));
            }
          }
        ),
        { numRuns: 10, timeout: 15000 }
      );
    });

    it('should handle module corruption and retry gracefully', async () => {
      // Test with a simple case that we know will work
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">
  <model id="minimal" totalrate="1">
    <ListOfParameters></ListOfParameters>
    <ListOfMoleculeTypes></ListOfMoleculeTypes>
    <ListOfCompartments></ListOfCompartments>
    <ListOfSpecies></ListOfSpecies>
    <ListOfReactionRules></ListOfReactionRules>
    <ListOfObservables></ListOfObservables>
    <ListOfFunctions></ListOfFunctions>
  </model>
</sbml>`;

      const options = {
        t_end: 1.0,
        n_steps: 10,
        maxRetries: 2,
        timeoutMs: 5000
      };

      // Create a module that fails on first call but succeeds on retry
      let callCount = 0;
      const flakyModuleLoader = vi.fn().mockImplementation(async () => {
        callCount++;
        const module = createMockModule();
        
        if (callCount === 1) {
          // First call fails
          module.callMain = vi.fn().mockImplementation(() => {
            throw new Error('Simulated WASM corruption');
          });
        } else {
          // Subsequent calls succeed
          module.callMain = vi.fn();
        }
        
        return module;
      });

      const flakyWrapper = new NFsimExecutionWrapper(flakyModuleLoader);
      
      const result = await flakyWrapper.executeSimulation(xmlContent, options);
      
      // Should eventually succeed after retry
      expect(result.success).toBe(true);
      expect(result.retryCount).toBeGreaterThan(0);
      expect(result.gdatContent).toBeDefined();
      
      // Module loader should have been called multiple times for retries
      expect(flakyModuleLoader).toHaveBeenCalledTimes(2);
    });
  });

  describe('Unit Tests for Execution Reliability', () => {
    it('should track module health status', async () => {
      const health = executionWrapper.getModuleHealth();
      
      expect(health).toHaveProperty('isCorrupted');
      expect(health).toHaveProperty('crashCount');
      expect(health.isCorrupted).toBe(false);
      expect(health.crashCount).toBe(0);
    });

    it('should handle successful execution', async () => {
      const xmlContent = `<?xml version="1.0"?>
<sbml><model id="test" totalrate="1">
<ListOfParameters></ListOfParameters>
<ListOfMoleculeTypes></ListOfMoleculeTypes>
<ListOfCompartments></ListOfCompartments>
<ListOfSpecies></ListOfSpecies>
<ListOfReactionRules></ListOfReactionRules>
<ListOfObservables></ListOfObservables>
<ListOfFunctions></ListOfFunctions>
</model></sbml>`;

      const result = await executionWrapper.executeSimulation(xmlContent, {
        t_end: 1.0,
        n_steps: 10,
        seed: 12345,
        timeoutMs: 5000
      });

      expect(result.success).toBe(true);
      expect(result.gdatContent).toBeDefined();
      expect(result.executionTime).toBeGreaterThanOrEqual(0); // Mock execution can be 0ms
      expect(result.retryCount).toBe(0);
    });

    it('should handle module reset correctly', async () => {
      const initialHealth = executionWrapper.getModuleHealth();
      
      await executionWrapper.resetModule();
      
      const resetHealth = executionWrapper.getModuleHealth();
      expect(resetHealth.isCorrupted).toBe(false);
      expect(resetHealth.crashCount).toBe(0);
    });

    it('should track active execution contexts', async () => {
      const xmlContent = `<?xml version="1.0"?>
<sbml><model id="test" totalrate="1">
<ListOfParameters></ListOfParameters>
<ListOfMoleculeTypes></ListOfMoleculeTypes>
<ListOfCompartments></ListOfCompartments>
<ListOfSpecies></ListOfSpecies>
<ListOfReactionRules></ListOfReactionRules>
<ListOfObservables></ListOfObservables>
<ListOfFunctions></ListOfFunctions>
</model></sbml>`;

      // Start execution but don't await
      const executionPromise = executionWrapper.executeSimulation(xmlContent, {
        t_end: 1.0,
        n_steps: 10,
        timeoutMs: 5000
      });

      // Check active contexts (this is timing-dependent, so we'll just verify the method works)
      const activeContexts = executionWrapper.getActiveContexts();
      expect(Array.isArray(activeContexts)).toBe(true);

      // Wait for completion
      await executionPromise;
      
      // Contexts should be cleaned up
      const finalContexts = executionWrapper.getActiveContexts();
      expect(finalContexts).toHaveLength(0);
    });

    it('should handle invalid XML gracefully', async () => {
      const invalidXml = 'This is not valid XML';

      // Mock module to throw error on invalid XML
      const errorModuleLoader = vi.fn().mockResolvedValue({
        ...createMockModule(),
        callMain: vi.fn().mockImplementation(() => {
          throw new Error('Invalid XML format');
        })
      });

      const errorWrapper = new NFsimExecutionWrapper(errorModuleLoader);
      
      const result = await errorWrapper.executeSimulation(invalidXml, {
        t_end: 1.0,
        n_steps: 10,
        maxRetries: 1,
        timeoutMs: 5000
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.retryCount).toBeGreaterThanOrEqual(0);
    });
  });
});

// Generator for valid XML content
function validXmlGenerator(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(`<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">
  <model id="simple_binding" totalrate="1">
    <ListOfParameters>
      <Parameter id="k_on" type="Constant" value="1"/>
      <Parameter id="k_off" type="Constant" value="0.1"/>
    </ListOfParameters>
    <ListOfMoleculeTypes>
      <MoleculeType id="A">
        <ListOfComponentTypes>
          <ComponentType id="b"></ComponentType>
        </ListOfComponentTypes>
      </MoleculeType>
      <MoleculeType id="B">
        <ListOfComponentTypes>
          <ComponentType id="a"></ComponentType>
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
      <Species id="S2" concentration="100" name="B(a)">
        <ListOfMolecules>
          <Molecule id="S2_M1" name="B">
            <ListOfComponents>
              <Component id="S2_M1_C1" name="a" numberOfBonds="0"/>
            </ListOfComponents>
          </Molecule>
        </ListOfMolecules>
      </Species>
    </ListOfSpecies>
    <ListOfReactionRules>
      <ReactionRule id="RR1" name="RR1" symmetry_factor="1">
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
          <ReactantPattern id="RR1_RP2">
            <ListOfMolecules>
              <Molecule id="RR1_RP2_M1" name="B">
                <ListOfComponents>
                  <Component id="RR1_RP2_M1_C1" name="a" numberOfBonds="0"/>
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
                  <Component id="RR1_PP1_M1_C1" name="b" numberOfBonds="1" bond="1"/>
                </ListOfComponents>
              </Molecule>
              <Molecule id="RR1_PP1_M2" name="B">
                <ListOfComponents>
                  <Component id="RR1_PP1_M2_C1" name="a" numberOfBonds="1" bond="1"/>
                </ListOfComponents>
              </Molecule>
            </ListOfMolecules>
            <ListOfBonds>
              <Bond id="RR1_PP1_B1" site1="RR1_PP1_M1_C1" site2="RR1_PP1_M2_C1"/>
            </ListOfBonds>
          </ProductPattern>
        </ListOfProductPatterns>
        <RateLaw id="RR1_RateLaw" type="Ele" totalrate="0">
          <ListOfRateConstants>
            <RateConstant value="k_on"/>
          </ListOfRateConstants>
        </RateLaw>
        <Map>
          <MapItem sourceID="RR1_RP1_M1" targetID="RR1_PP1_M1"/>
          <MapItem sourceID="RR1_RP1_M1_C1" targetID="RR1_PP1_M1_C1"/>
          <MapItem sourceID="RR1_RP2_M1" targetID="RR1_PP1_M2"/>
          <MapItem sourceID="RR1_RP2_M1_C1" targetID="RR1_PP1_M2_C1"/>
        </Map>
        <ListOfOperations>
          <AddBond site1="RR1_RP1_M1_C1" site2="RR1_RP2_M1_C1"/>
        </ListOfOperations>
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
      <Observable id="O2" name="BoundAB" type="Molecules">
        <ListOfPatterns>
          <Pattern id="O2_P1">
            <ListOfMolecules>
              <Molecule id="O2_P1_M1" name="A">
                <ListOfComponents>
                  <Component id="O2_P1_M1_C1" name="b" numberOfBonds="1" bond="1"/>
                </ListOfComponents>
              </Molecule>
              <Molecule id="O2_P1_M2" name="B">
                <ListOfComponents>
                  <Component id="O2_P1_M2_C1" name="a" numberOfBonds="1" bond="1"/>
                </ListOfComponents>
              </Molecule>
            </ListOfMolecules>
            <ListOfBonds>
              <Bond id="O2_P1_B1" site1="O2_P1_M1_C1" site2="O2_P1_M2_C1"/>
            </ListOfBonds>
          </Pattern>
        </ListOfPatterns>
      </Observable>
    </ListOfObservables>
    <ListOfFunctions></ListOfFunctions>
  </model>
</sbml>`),
    fc.constant(`<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">
  <model id="minimal" totalrate="1">
    <ListOfParameters></ListOfParameters>
    <ListOfMoleculeTypes></ListOfMoleculeTypes>
    <ListOfCompartments></ListOfCompartments>
    <ListOfSpecies></ListOfSpecies>
    <ListOfReactionRules></ListOfReactionRules>
    <ListOfObservables></ListOfObservables>
    <ListOfFunctions></ListOfFunctions>
  </model>
</sbml>`)
  );
}