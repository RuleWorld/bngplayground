/**
 * NFsimProgressMonitoringReliability.spec.ts
 * 
 * Property-based tests for NFsim progress monitoring reliability.
 * Tests that long-running simulations provide regular progress updates
 * and support cancellation without resource leaks.
 * 
 * **Validates: Requirements 6.3**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { 
  NFsimExecutionWrapper, 
  NFsimExecutionOptions, 
  ProgressUpdate,
  ExecutionResult 
} from '@bngplayground/engine';
import { resetConcurrencyManager } from '@bngplayground/engine';

// Mock WASM module for testing with configurable execution time
const createMockModule = (executionTimeMs: number) => {
  let simulationStartTime: number | null = null;
  
  return {
    FS: {
      writeFile: vi.fn(),
      readFile: vi.fn(() => {
        // Return GDAT output
        return `# GDAT output\ntime,obs1\n0,100\n1,95\n2,90\n`;
      }),
      analyzePath: vi.fn((path: string) => ({ exists: path === '/model.gdat' })),
      unlink: vi.fn()
    },
    callMain: vi.fn(async () => {
      simulationStartTime = Date.now();
      // Simulate execution time
      await new Promise(resolve => setTimeout(resolve, executionTimeMs));
      return 0;
    }),
    _malloc: vi.fn(() => Math.floor(Math.random() * 1000000) + 1000),
    _free: vi.fn(),
    HEAPU8: {
      buffer: new ArrayBuffer(1024 * 1024)
    },
    getSimulationStartTime: () => simulationStartTime
  };
};

describe('NFsim Progress Monitoring Reliability', () => {
  beforeEach(async () => {
    await resetConcurrencyManager();
  });

  afterEach(async () => {
    await resetConcurrencyManager();
  });

  describe('Property 12: Progress Monitoring Reliability', () => {
    it('should provide regular progress updates for any long-running simulation', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate simulation configurations with varying durations
          fc.record({
            t_end: fc.float({ min: Math.fround(5), max: Math.fround(100) }),
            n_steps: fc.integer({ min: 50, max: 500 }),
            seed: fc.option(fc.integer({ min: 1, max: 999999 })),
            executionTimeMs: fc.integer({ min: 200, max: 1000 }) // Simulate long-running
          }),
          async (config) => {
            // **Property 12: Progress Monitoring Reliability**
            // *For any* long-running simulation, the system should provide
            // regular progress updates and support cancellation without resource leaks

            const progressUpdates: ProgressUpdate[] = [];
            const mockModuleLoader = vi.fn(async () => createMockModule(config.executionTimeMs));
            const wrapper = new NFsimExecutionWrapper(mockModuleLoader);

            const xmlContent = generateSimpleXML('test_model');
            const options: NFsimExecutionOptions = {
              t_end: config.t_end,
              n_steps: config.n_steps,
              seed: config.seed ?? undefined,
              onProgress: (update) => {
                progressUpdates.push(update);
              }
            };

            const result = await wrapper.executeSimulation(xmlContent, options);

            // 1. Result should be defined (success or failure)
            expect(result).toBeDefined();

            // 2. Should have received multiple progress updates
            expect(progressUpdates.length).toBeGreaterThan(0);

            // 3. Progress updates should cover multiple phases
            const phases = new Set(progressUpdates.map(u => u.phase));
            expect(phases.size).toBeGreaterThanOrEqual(2);
            
            // Should at least have initialization and validation phases
            expect(phases.has('initialization')).toBe(true);
            expect(phases.has('validation')).toBe(true);

            // 4. Progress should be monotonically increasing
            for (let i = 1; i < progressUpdates.length; i++) {
              expect(progressUpdates[i].progress).toBeGreaterThanOrEqual(
                progressUpdates[i - 1].progress
              );
            }

            // 5. Progress values should be in valid range [0, 100]
            progressUpdates.forEach(update => {
              expect(update.progress).toBeGreaterThanOrEqual(0);
              expect(update.progress).toBeLessThanOrEqual(100);
            });

            // 6. Each progress update should have required fields
            progressUpdates.forEach(update => {
              expect(update.executionId).toBeDefined();
              expect(update.phase).toBeDefined();
              expect(update.message).toBeDefined();
              expect(update.timestamp).toBeInstanceOf(Date);
            });

            // 7. Timestamps should be monotonically increasing
            for (let i = 1; i < progressUpdates.length; i++) {
              expect(progressUpdates[i].timestamp.getTime()).toBeGreaterThanOrEqual(
                progressUpdates[i - 1].timestamp.getTime()
              );
            }

            // 8. Result should include progress updates history
            expect(result.progressUpdates).toBeDefined();
            expect(result.progressUpdates!.length).toBeGreaterThan(0);

            // 9. No active contexts should remain after completion
            const activeContexts = wrapper.getActiveContexts();
            expect(activeContexts.length).toBe(0);
          }
        ),
        { numRuns: 100, timeout: 60000 }
      );
    });

    it('should support cancellation at any point without resource leaks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            t_end: fc.float({ min: Math.fround(5), max: Math.fround(50) }),
            n_steps: fc.integer({ min: 50, max: 200 }),
            executionTimeMs: fc.integer({ min: 300, max: 800 }),
            cancelDelayMs: fc.integer({ min: 10, max: 200 }) // Cancel during execution
          }),
          async (config) => {
            // **Property 12: Progress Monitoring Reliability**
            // *For any* long-running simulation, cancellation should work
            // without resource leaks at any point during execution

            const progressUpdates: ProgressUpdate[] = [];
            const mockModuleLoader = vi.fn(async () => createMockModule(config.executionTimeMs));
            const wrapper = new NFsimExecutionWrapper(mockModuleLoader);
            const abortController = new AbortController();

            const xmlContent = generateSimpleXML('test_model');
            const options: NFsimExecutionOptions = {
              t_end: config.t_end,
              n_steps: config.n_steps,
              abortSignal: abortController.signal,
              onProgress: (update) => {
                progressUpdates.push(update);
              }
            };

            // Schedule cancellation after a delay
            setTimeout(() => {
              abortController.abort();
            }, config.cancelDelayMs);

            const result = await wrapper.executeSimulation(xmlContent, options);

            // 1. Result should indicate cancellation or early termination
            // Note: If cancelled very early, validation might complete before cancellation is processed
            if (result.cancelled !== undefined) {
              expect(result.cancelled).toBe(true);
            }
            expect(result.success).toBe(false);

            // 2. Should have received some progress updates before cancellation
            // (unless cancelled very early)
            if (config.cancelDelayMs > 50) {
              expect(progressUpdates.length).toBeGreaterThan(0);
            }

            // 3. All progress updates should be valid
            progressUpdates.forEach(update => {
              expect(update.executionId).toBeDefined();
              expect(update.progress).toBeGreaterThanOrEqual(0);
              expect(update.progress).toBeLessThanOrEqual(100);
            });

            // 4. No active contexts should remain after cancellation (no resource leaks)
            const activeContexts = wrapper.getActiveContexts();
            expect(activeContexts.length).toBe(0);

            // 5. Error message should indicate cancellation or failure
            expect(result.error).toBeDefined();
            // If cancelled, error should mention cancellation
            if (result.cancelled) {
              expect(result.error?.toLowerCase()).toContain('cancel');
            }
          }
        ),
        { numRuns: 100, timeout: 60000 }
      );
    });

    it('should include memory usage information in progress updates', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            t_end: fc.float({ min: Math.fround(5), max: Math.fround(50) }),
            n_steps: fc.integer({ min: 50, max: 200 }),
            executionTimeMs: fc.integer({ min: 200, max: 600 }),
            memoryLimitMB: fc.option(fc.integer({ min: 256, max: 2048 }))
          }),
          async (config) => {
            // **Property 12: Progress Monitoring Reliability**
            // *For any* simulation, progress updates should include memory usage
            // information when available

            const progressUpdates: ProgressUpdate[] = [];
            const mockModuleLoader = vi.fn(async () => createMockModule(config.executionTimeMs));
            const wrapper = new NFsimExecutionWrapper(mockModuleLoader);

            const xmlContent = generateSimpleXML('test_model');
            const options: NFsimExecutionOptions = {
              t_end: config.t_end,
              n_steps: config.n_steps,
              memoryLimitMB: config.memoryLimitMB ?? undefined,
              onProgress: (update) => {
                progressUpdates.push(update);
              }
            };

            const result = await wrapper.executeSimulation(xmlContent, options);

            // 1. Result should be defined
            expect(result).toBeDefined();

            // 2. Should have progress updates
            expect(progressUpdates.length).toBeGreaterThan(0);

            // 3. At least some updates should include memory usage information
            const updatesWithMemory = progressUpdates.filter(u => u.memoryUsage !== undefined);
            
            // Memory usage should be reported in at least some phases
            // (may not be available in all phases, but should be in execution phase)
            if (progressUpdates.length > 2) {
              expect(updatesWithMemory.length).toBeGreaterThan(0);
            }

            // 4. Memory usage values should be non-negative
            updatesWithMemory.forEach(update => {
              expect(update.memoryUsage).toBeGreaterThanOrEqual(0);
            });

            // 5. If memory limit is set, usage should not exceed it significantly
            if (config.memoryLimitMB) {
              updatesWithMemory.forEach(update => {
                // Allow some overhead, but should generally respect the limit
                expect(update.memoryUsage!).toBeLessThan(config.memoryLimitMB! * 1.5);
              });
            }
          }
        ),
        { numRuns: 100, timeout: 60000 }
      );
    });

    it('should calculate estimated time remaining for in-progress simulations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            t_end: fc.float({ min: Math.fround(10), max: Math.fround(50) }),
            n_steps: fc.integer({ min: 100, max: 300 }),
            executionTimeMs: fc.integer({ min: 400, max: 800 }) // Longer execution for estimates
          }),
          async (config) => {
            // **Property 12: Progress Monitoring Reliability**
            // *For any* long-running simulation, progress updates should include
            // estimated time remaining when progress is measurable

            const progressUpdates: ProgressUpdate[] = [];
            const mockModuleLoader = vi.fn(async () => createMockModule(config.executionTimeMs));
            const wrapper = new NFsimExecutionWrapper(mockModuleLoader);

            const xmlContent = generateSimpleXML('test_model');
            const options: NFsimExecutionOptions = {
              t_end: config.t_end,
              n_steps: config.n_steps,
              onProgress: (update) => {
                progressUpdates.push(update);
              }
            };

            const result = await wrapper.executeSimulation(xmlContent, options);

            // 1. Result should be defined
            expect(result).toBeDefined();

            // 2. Should have progress updates
            expect(progressUpdates.length).toBeGreaterThan(0);

            // 3. Updates in the middle of execution should have time estimates
            const midProgressUpdates = progressUpdates.filter(
              u => u.progress > 10 && u.progress < 90
            );

            if (midProgressUpdates.length > 0) {
              const updatesWithEstimate = midProgressUpdates.filter(
                u => u.estimatedTimeRemaining !== undefined
              );

              // At least some mid-progress updates should have estimates
              expect(updatesWithEstimate.length).toBeGreaterThan(0);

              // 4. Time estimates should be non-negative
              updatesWithEstimate.forEach(update => {
                expect(update.estimatedTimeRemaining).toBeGreaterThanOrEqual(0);
              });

              // 5. Time estimates should generally decrease as progress increases
              if (updatesWithEstimate.length > 1) {
                const firstEstimate = updatesWithEstimate[0].estimatedTimeRemaining!;
                const lastEstimate = updatesWithEstimate[updatesWithEstimate.length - 1].estimatedTimeRemaining!;
                
                // Last estimate should be less than or equal to first estimate
                // (allowing for some variance due to execution dynamics)
                expect(lastEstimate).toBeLessThanOrEqual(firstEstimate * 1.5);
              }
            }
          }
        ),
        { numRuns: 100, timeout: 60000 }
      );
    });

    it('should handle multiple concurrent simulations with independent progress tracking', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              t_end: fc.float({ min: Math.fround(5), max: Math.fround(30) }),
              n_steps: fc.integer({ min: 50, max: 150 }),
              executionTimeMs: fc.integer({ min: 200, max: 500 })
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (simConfigs) => {
            // **Property 12: Progress Monitoring Reliability**
            // *For any* set of concurrent simulations, each should have
            // independent progress tracking without interference

            const allProgressUpdates: Map<string, ProgressUpdate[]> = new Map();
            const mockModuleLoader = vi.fn(async () => createMockModule(300));

            // Run simulations concurrently
            const results = await Promise.all(
              simConfigs.map(async (config, index) => {
                const wrapper = new NFsimExecutionWrapper(mockModuleLoader);
                const progressUpdates: ProgressUpdate[] = [];
                
                const xmlContent = generateSimpleXML(`model_${index}`);
                const options: NFsimExecutionOptions = {
                  t_end: config.t_end,
                  n_steps: config.n_steps,
                  onProgress: (update) => {
                    progressUpdates.push(update);
                  }
                };

                const result = await wrapper.executeSimulation(xmlContent, options);
                allProgressUpdates.set(`sim_${index}`, progressUpdates);
                
                return result;
              })
            );

            // 1. All simulations should return results
            results.forEach(result => {
              expect(result).toBeDefined();
            });

            // 2. Each simulation should have its own progress updates
            expect(allProgressUpdates.size).toBe(simConfigs.length);

            // 3. Each simulation should have received progress updates
            allProgressUpdates.forEach((updates, simId) => {
              expect(updates.length).toBeGreaterThan(0);
            });

            // 4. Execution IDs should be unique across simulations
            const allExecutionIds = new Set<string>();
            allProgressUpdates.forEach((updates) => {
              updates.forEach(update => {
                allExecutionIds.add(update.executionId);
              });
            });
            
            // Should have at least as many unique execution IDs as simulations
            expect(allExecutionIds.size).toBeGreaterThanOrEqual(simConfigs.length);

            // 5. Progress updates within each simulation should be consistent
            allProgressUpdates.forEach((updates, simId) => {
              // All updates for a simulation should have the same execution ID
              const executionIds = new Set(updates.map(u => u.executionId));
              expect(executionIds.size).toBe(1);

              // Progress should be monotonically increasing
              for (let i = 1; i < updates.length; i++) {
                expect(updates[i].progress).toBeGreaterThanOrEqual(updates[i - 1].progress);
              }
            });
          }
        ),
        { numRuns: 100, timeout: 60000 }
      );
    });

    it('should maintain progress tracking integrity across retries', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            t_end: fc.float({ min: Math.fround(5), max: Math.fround(30) }),
            n_steps: fc.integer({ min: 50, max: 150 }),
            maxRetries: fc.integer({ min: 1, max: 3 }),
            shouldFailFirst: fc.boolean()
          }),
          async (config) => {
            // **Property 12: Progress Monitoring Reliability**
            // *For any* simulation with retries, progress tracking should
            // remain consistent and not leak information across retry attempts

            const progressUpdates: ProgressUpdate[] = [];
            let attemptCount = 0;
            
            const mockModuleLoader = vi.fn(async () => {
              attemptCount++;
              const module = createMockModule(300);
              
              // Fail first attempt if configured
              if (config.shouldFailFirst && attemptCount === 1) {
                module.callMain = vi.fn(() => {
                  throw new Error('Simulated failure for retry test');
                });
              }
              
              return module;
            });

            const wrapper = new NFsimExecutionWrapper(mockModuleLoader);

            const xmlContent = generateSimpleXML('test_model');
            const options: NFsimExecutionOptions = {
              t_end: config.t_end,
              n_steps: config.n_steps,
              maxRetries: config.maxRetries,
              onProgress: (update) => {
                progressUpdates.push(update);
              }
            };

            const result = await wrapper.executeSimulation(xmlContent, options);

            // 1. Should have progress updates
            expect(progressUpdates.length).toBeGreaterThan(0);

            // 2. All progress updates should have valid execution IDs
            progressUpdates.forEach(update => {
              expect(update.executionId).toBeDefined();
              expect(typeof update.executionId).toBe('string');
            });

            // 3. If retries occurred, progress should still be monotonic within each attempt
            // (execution ID might change between retries)
            const updatesByExecutionId = new Map<string, ProgressUpdate[]>();
            progressUpdates.forEach(update => {
              if (!updatesByExecutionId.has(update.executionId)) {
                updatesByExecutionId.set(update.executionId, []);
              }
              updatesByExecutionId.get(update.executionId)!.push(update);
            });

            // Each execution attempt should have monotonic progress
            updatesByExecutionId.forEach((updates) => {
              for (let i = 1; i < updates.length; i++) {
                expect(updates[i].progress).toBeGreaterThanOrEqual(updates[i - 1].progress);
              }
            });

            // 4. No active contexts should remain
            const activeContexts = wrapper.getActiveContexts();
            expect(activeContexts.length).toBe(0);

            // 5. Result should indicate retry count if retries occurred
            if (config.shouldFailFirst && result.success) {
              expect(result.retryCount).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100, timeout: 60000 }
      );
    });
  });

  describe('Unit Tests for Progress Monitoring', () => {
    it('should report progress for all execution phases', async () => {
      const progressUpdates: ProgressUpdate[] = [];
      const mockModuleLoader = vi.fn(async () => createMockModule(200));
      const wrapper = new NFsimExecutionWrapper(mockModuleLoader);

      const xmlContent = generateSimpleXML('test_model');
      const options: NFsimExecutionOptions = {
        t_end: 10,
        n_steps: 100,
        onProgress: (update) => {
          progressUpdates.push(update);
        }
      };

      await wrapper.executeSimulation(xmlContent, options);

      // Should have updates for multiple phases
      const phases = new Set(progressUpdates.map(u => u.phase));
      expect(phases.has('initialization')).toBe(true);
      expect(phases.has('validation')).toBe(true);
    });

    it('should clean up resources after cancellation', async () => {
      const mockModuleLoader = vi.fn(async () => createMockModule(500));
      const wrapper = new NFsimExecutionWrapper(mockModuleLoader);
      const abortController = new AbortController();

      const xmlContent = generateSimpleXML('test_model');
      const options: NFsimExecutionOptions = {
        t_end: 10,
        n_steps: 100,
        abortSignal: abortController.signal
      };

      // Cancel immediately
      abortController.abort();

      const result = await wrapper.executeSimulation(xmlContent, options);

      expect(result.cancelled).toBe(true);
      
      // No active contexts should remain
      const activeContexts = wrapper.getActiveContexts();
      expect(activeContexts.length).toBe(0);
    });

    it('should handle progress callback errors gracefully', async () => {
      const mockModuleLoader = vi.fn(async () => createMockModule(200));
      const wrapper = new NFsimExecutionWrapper(mockModuleLoader);

      const xmlContent = generateSimpleXML('test_model');
      const options: NFsimExecutionOptions = {
        t_end: 10,
        n_steps: 100,
        onProgress: () => {
          throw new Error('Progress callback error');
        }
      };

      // Should not crash even if progress callback throws
      const result = await wrapper.executeSimulation(xmlContent, options);
      
      // Simulation should still complete (or fail gracefully)
      expect(result).toBeDefined();
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate simple BNG-XML for testing
 */
function generateSimpleXML(modelId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level2" level="2" version="1">
  <model id="${modelId}" totalrate="1">
    <ListOfParameters>
      <Parameter id="k_on" type="Constant" value="1"/>
    </ListOfParameters>
    <ListOfMoleculeTypes>
      <MoleculeType id="A">
        <ListOfComponentTypes>
          <ComponentType id="b"></ComponentType>
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
    <ListOfReactionRules></ListOfReactionRules>
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
}
