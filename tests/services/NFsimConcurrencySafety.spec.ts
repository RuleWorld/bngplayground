/**
 * NFsimConcurrencySafety.spec.ts
 * 
 * Property-based tests for NFsim concurrency safety.
 * Tests WASM module instance management to prevent interference.
 * 
 * **Validates: Requirements 6.4**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { 
  NFsimConcurrencyManager, 
  getConcurrencyManager,
  resetConcurrencyManager 
} from '@bngplayground/engine';
import { NFsimExecutionOptions } from '@bngplayground/engine';

// Mock WASM module for testing
const createMockModule = (moduleId: string) => {
  const executionDelay = Math.random() * 100 + 50; // 50-150ms random delay
  
  return {
    FS: {
      writeFile: vi.fn(),
      readFile: vi.fn(() => {
        // Return unique GDAT output per module to detect interference
        return `# GDAT output from module ${moduleId}\ntime,obs1\n0,${Math.floor(Math.random() * 100)}\n1,${Math.floor(Math.random() * 100)}\n`;
      }),
      analyzePath: vi.fn(() => ({ exists: true })),
      unlink: vi.fn()
    },
    callMain: vi.fn(async () => {
      // Simulate execution time
      await new Promise(resolve => setTimeout(resolve, executionDelay));
      return 0;
    }),
    _malloc: vi.fn(() => Math.floor(Math.random() * 1000000) + 1000),
    _free: vi.fn(),
    HEAPU8: {
      buffer: new ArrayBuffer(1024 * 1024)
    },
    __moduleId: moduleId // Track module identity
  };
};

describe('NFsim Concurrency Safety', () => {
  let mockModuleLoader: () => Promise<any>;
  let moduleCounter = 0;

  beforeEach(async () => {
    await resetConcurrencyManager();
    moduleCounter = 0;
    
    // Create mock module loader that tracks module instances
    mockModuleLoader = vi.fn(async () => {
      const moduleId = `mock_module_${++moduleCounter}`;
      return createMockModule(moduleId);
    });
  });

  afterEach(async () => {
    await resetConcurrencyManager();
  });

  describe('Property 11: Concurrency Safety', () => {
    it('should manage WASM module instances to prevent interference across concurrent simulations', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate array of concurrent simulation requests
          fc.array(
            fc.record({
              xmlContent: fc.constantFrom(
                generateSimpleXML('model_A'),
                generateSimpleXML('model_B'),
                generateSimpleXML('model_C')
              ),
              options: fc.record({
                t_end: fc.float({ min: Math.fround(1), max: Math.fround(10) }),
                n_steps: fc.integer({ min: 10, max: 100 }),
                seed: fc.option(fc.integer({ min: 1, max: 999999 })),
                timeoutMs: fc.constant(5000)
              }),
              priority: fc.integer({ min: 0, max: 10 })
            }),
            { minLength: 2, maxLength: 8 } // Test with 2-8 concurrent simulations
          ),
          fc.record({
            maxConcurrentSimulations: fc.integer({ min: 2, max: 4 }),
            maxModuleInstances: fc.integer({ min: 2, max: 6 })
          }),
          async (simulationRequests, concurrencyConfig) => {
            // **Property 11: Concurrency Safety**
            // *For any* set of concurrent NFsim simulations, the system should manage
            // WASM module instances to prevent interference and ensure thread safety

            const manager = new NFsimConcurrencyManager(mockModuleLoader, {
              maxConcurrentSimulations: concurrencyConfig.maxConcurrentSimulations,
              maxModuleInstances: concurrencyConfig.maxModuleInstances,
              moduleReuseLimit: 5,
              moduleIdleTimeoutMs: 10000,
              queueMaxSize: 20,
              enableModulePooling: true
            });

            try {
              // Submit all simulations concurrently
              const taskIds = await Promise.all(
                simulationRequests.map(req => 
                  manager.submitSimulation(req.xmlContent, req.options, req.priority)
                )
              );

              // Verify all tasks were submitted successfully
              expect(taskIds).toHaveLength(simulationRequests.length);
              expect(new Set(taskIds).size).toBe(taskIds.length); // All IDs unique

              // Wait for all simulations to complete
              const completionPromises = taskIds.map(taskId => 
                waitForTaskCompletion(manager, taskId, 10000)
              );

              const results = await Promise.allSettled(completionPromises);

              // Verify concurrency constraints were respected
              const stats = manager.getStats();
              
              // 1. Peak concurrency should not exceed configured limit
              expect(stats.peakConcurrency).toBeLessThanOrEqual(
                concurrencyConfig.maxConcurrentSimulations
              );

              // 2. Total modules should not exceed configured limit
              expect(stats.totalModules).toBeLessThanOrEqual(
                concurrencyConfig.maxModuleInstances
              );

              // 3. All simulations should have been processed (completed, failed, or cancelled)
              const totalProcessed = stats.completedSimulations + 
                                    stats.failedSimulations + 
                                    stats.cancelledSimulations;
              expect(totalProcessed).toBe(simulationRequests.length);

              // 4. No active simulations should remain
              expect(stats.activeSimulations).toBe(0);

              // 5. No tasks should remain in queue
              expect(stats.queuedSimulations).toBe(0);

              // 6. Verify task isolation - each task should have completed independently
              for (let i = 0; i < taskIds.length; i++) {
                const taskStatus = manager.getTaskStatus(taskIds[i]);
                expect(taskStatus).not.toBeNull();
                
                if (taskStatus) {
                  // Task should have reached a terminal state
                  expect(['completed', 'failed', 'cancelled']).toContain(taskStatus.status);
                  
                  // If completed, should have a result
                  if (taskStatus.status === 'completed') {
                    expect(taskStatus.result).toBeDefined();
                    expect(taskStatus.result?.executionTime).toBeGreaterThanOrEqual(0);
                  }
                  
                  // Task should have been assigned a module instance
                  if (taskStatus.status === 'completed' || taskStatus.status === 'failed') {
                    expect(taskStatus.moduleInstanceId).toBeDefined();
                  }
                }
              }

              // 7. Verify no interference - check that results are independent
              const completedResults = results
                .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
                .map(r => r.value);

              if (completedResults.length > 1) {
                // Each result should have unique execution characteristics
                const executionTimes = completedResults
                  .filter(r => r.result?.executionTime)
                  .map(r => r.result.executionTime);
                
                // Execution times should vary (not all identical, which would indicate interference)
                if (executionTimes.length > 1) {
                  const allSame = executionTimes.every(t => t === executionTimes[0]);
                  // Allow for some identical times due to mocking, but not all
                  if (executionTimes.length > 3) {
                    expect(allSame).toBe(false);
                  }
                }
              }

            } finally {
              await manager.shutdown();
            }
          }
        ),
        { numRuns: 100, timeout: 30000 }
      );
    });

    it('should isolate module failures and prevent cross-contamination', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 4, max: 6 }), // Number of simulations
          async (numSimulations) => {
            // **Property 11: Concurrency Safety**
            // *For any* concurrent simulations, the system should isolate failures
            // and prevent cross-contamination between simulations

            // Create a module loader where some modules randomly fail
            let callCount = 0;
            const mixedModuleLoader = vi.fn(async () => {
              const moduleId = callCount++;
              const module = createMockModule(`module_${moduleId}`);
              
              // Make every 3rd module fail to test isolation
              if (moduleId % 3 === 0 && moduleId > 0) {
                module.callMain = vi.fn(() => {
                  throw new Error(`Simulated failure in module ${moduleId}`);
                });
              }
              
              return module;
            });

            const manager = new NFsimConcurrencyManager(mixedModuleLoader, {
              maxConcurrentSimulations: 3,
              maxModuleInstances: 4,
              moduleReuseLimit: 2, // Low reuse to ensure we hit failing modules
              queueMaxSize: 20
            });

            try {
              // Submit multiple simulations
              const taskIds: string[] = [];
              for (let i = 0; i < numSimulations; i++) {
                const taskId = await manager.submitSimulation(
                  generateSimpleXML(`model_${i}`),
                  { t_end: 2, n_steps: 20, timeoutMs: 5000 },
                  i
                );
                taskIds.push(taskId);
              }

              // Wait for all to complete (some will fail, some will succeed)
              await Promise.all(
                taskIds.map(id => waitForTaskCompletion(manager, id, 10000).catch(() => {}))
              );

              const stats = manager.getStats();

              // All simulations should be accounted for
              expect(stats.completedSimulations + stats.failedSimulations).toBe(numSimulations);
              
              // The key property: isolation means that not ALL simulations failed
              // Even with some failing modules, other simulations should succeed
              // We should have at least one success (isolation working)
              expect(stats.completedSimulations).toBeGreaterThanOrEqual(1);
              
              // Verify that each task reached a terminal state
              for (const taskId of taskIds) {
                const task = manager.getTaskStatus(taskId);
                expect(task).not.toBeNull();
                expect(['completed', 'failed']).toContain(task!.status);
              }

            } finally {
              await manager.shutdown();
            }
          }
        ),
        { numRuns: 100, timeout: 30000 }
      );
    });

    it('should maintain module instance integrity under concurrent load', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            numSimulations: fc.integer({ min: 5, max: 10 }),
            maxConcurrent: fc.integer({ min: 2, max: 4 }),
            maxModules: fc.integer({ min: 2, max: 5 })
          }),
          async (config) => {
            // **Property 11: Concurrency Safety**
            // *For any* concurrent load, module instances should maintain integrity
            // and be properly reused without corruption

            const manager = new NFsimConcurrencyManager(mockModuleLoader, {
              maxConcurrentSimulations: config.maxConcurrent,
              maxModuleInstances: config.maxModules,
              moduleReuseLimit: 3, // Force module reuse
              queueMaxSize: 20
            });

            try {
              // Submit simulations in waves to force module reuse
              const allTaskIds: string[] = [];
              
              for (let i = 0; i < config.numSimulations; i++) {
                const taskId = await manager.submitSimulation(
                  generateSimpleXML(`model_${i}`),
                  { t_end: 2, n_steps: 20, timeoutMs: 5000 },
                  0
                );
                allTaskIds.push(taskId);
              }

              // Wait for all to complete
              await Promise.all(
                allTaskIds.map(id => waitForTaskCompletion(manager, id, 15000))
              );

              const stats = manager.getStats();

              // 1. All simulations should have been processed
              expect(stats.completedSimulations + stats.failedSimulations).toBe(config.numSimulations);

              // 2. Module count should not exceed limit
              expect(stats.totalModules).toBeLessThanOrEqual(config.maxModules);

              // 3. If we had more simulations than modules, reuse must have occurred
              if (config.numSimulations > config.maxModules) {
                // At least some modules were reused
                // We can verify this by checking that all simulations completed
                // with fewer modules than simulations
                expect(stats.totalModules).toBeLessThan(config.numSimulations);
              }

              // 4. No simulations should remain active
              expect(stats.activeSimulations).toBe(0);

              // 5. Verify all tasks reached terminal state
              for (const taskId of allTaskIds) {
                const task = manager.getTaskStatus(taskId);
                expect(task).not.toBeNull();
                expect(['completed', 'failed', 'cancelled']).toContain(task!.status);
              }

              // 6. Most simulations should have succeeded (module reuse working)
              const successRate = stats.completedSimulations / config.numSimulations;
              expect(successRate).toBeGreaterThan(0.8); // At least 80% success rate

            } finally {
              await manager.shutdown();
            }
          }
        ),
        { numRuns: 100, timeout: 40000 }
      );
    });

    it('should handle cancellation without affecting other concurrent simulations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            numSimulations: fc.integer({ min: 4, max: 8 }),
            cancelIndices: fc.array(fc.integer({ min: 0, max: 7 }), { minLength: 1, maxLength: 3 })
          }),
          async (config) => {
            // **Property 11: Concurrency Safety**
            // *For any* set of concurrent simulations, cancelling some should not
            // affect the execution of others

            const manager = new NFsimConcurrencyManager(mockModuleLoader, {
              maxConcurrentSimulations: 3,
              maxModuleInstances: 4,
              queueMaxSize: 20
            });

            try {
              // Submit all simulations
              const taskIds: string[] = [];
              for (let i = 0; i < config.numSimulations; i++) {
                const taskId = await manager.submitSimulation(
                  generateSimpleXML(`model_${i}`),
                  { t_end: 3, n_steps: 30, timeoutMs: 5000 },
                  0
                );
                taskIds.push(taskId);
              }

              // Cancel some simulations
              const validCancelIndices = config.cancelIndices.filter(idx => idx < taskIds.length);
              const cancelledIds = new Set<string>();
              
              for (const idx of validCancelIndices) {
                const cancelled = await manager.cancelSimulation(taskIds[idx]);
                if (cancelled) {
                  cancelledIds.add(taskIds[idx]);
                }
              }

              // Wait for all to complete or be cancelled
              await Promise.all(
                taskIds.map(id => waitForTaskCompletion(manager, id, 10000))
              );

              const stats = manager.getStats();

              // 1. All simulations should be accounted for
              const totalProcessed = stats.completedSimulations + 
                                    stats.failedSimulations + 
                                    stats.cancelledSimulations;
              expect(totalProcessed).toBe(config.numSimulations);

              // 2. Cancelled simulations should be marked as cancelled
              for (const cancelledId of cancelledIds) {
                const task = manager.getTaskStatus(cancelledId);
                expect(task?.status).toBe('cancelled');
              }

              // 3. Non-cancelled simulations should have completed or failed (not cancelled)
              const nonCancelledIds = taskIds.filter(id => !cancelledIds.has(id));
              for (const taskId of nonCancelledIds) {
                const task = manager.getTaskStatus(taskId);
                expect(['completed', 'failed']).toContain(task!.status);
              }

              // 4. At least some non-cancelled simulations should have succeeded
              if (nonCancelledIds.length > 0) {
                const successfulNonCancelled = nonCancelledIds
                  .map(id => manager.getTaskStatus(id))
                  .filter(task => task?.status === 'completed');
                
                // Most non-cancelled should succeed
                expect(successfulNonCancelled.length).toBeGreaterThan(0);
              }

            } finally {
              await manager.shutdown();
            }
          }
        ),
        { numRuns: 100, timeout: 30000 }
      );
    });
  });

  describe('Unit Tests for Concurrency Safety', () => {
    it('should create isolated module instances', async () => {
      const manager = new NFsimConcurrencyManager(mockModuleLoader, {
        maxConcurrentSimulations: 2,
        maxModuleInstances: 3
      });

      try {
        // Submit two simulations
        const task1 = await manager.submitSimulation(
          generateSimpleXML('model1'),
          { t_end: 1, n_steps: 10, timeoutMs: 5000 }
        );
        
        const task2 = await manager.submitSimulation(
          generateSimpleXML('model2'),
          { t_end: 1, n_steps: 10, timeoutMs: 5000 }
        );

        // Wait for completion
        await Promise.all([
          waitForTaskCompletion(manager, task1, 5000),
          waitForTaskCompletion(manager, task2, 5000)
        ]);

        // Verify both tasks used different module instances
        const status1 = manager.getTaskStatus(task1);
        const status2 = manager.getTaskStatus(task2);

        expect(status1?.moduleInstanceId).toBeDefined();
        expect(status2?.moduleInstanceId).toBeDefined();
        
        // Module IDs should be different (isolation)
        expect(status1?.moduleInstanceId).not.toBe(status2?.moduleInstanceId);

      } finally {
        await manager.shutdown();
      }
    });

    it('should respect max concurrent simulations limit', async () => {
      // Create a module loader with artificial delay to ensure queueing
      const delayedModuleLoader = vi.fn(async () => {
        const module = createMockModule(`delayed_module_${++moduleCounter}`);
        // Add delay to callMain to slow down execution
        const originalCallMain = module.callMain;
        module.callMain = vi.fn(async (...args: any[]) => {
          await new Promise(resolve => setTimeout(resolve, 300)); // 300ms delay
          return originalCallMain(...args);
        });
        return module;
      });

      const manager = new NFsimConcurrencyManager(delayedModuleLoader, {
        maxConcurrentSimulations: 2,
        maxModuleInstances: 4
      });

      try {
        // Submit 5 simulations rapidly
        const taskIds: string[] = [];
        for (let i = 0; i < 5; i++) {
          taskIds.push(
            await manager.submitSimulation(
              generateSimpleXML(`model${i}`),
              { t_end: 1, n_steps: 10, timeoutMs: 10000 }
            )
          );
        }

        // Check stats immediately after submission
        const stats = manager.getStats();
        
        // Active simulations should not exceed limit
        expect(stats.activeSimulations).toBeLessThanOrEqual(2);
        
        // Total tasks should be 5
        expect(stats.totalSimulations).toBe(5);

        // Wait for all to complete
        await Promise.all(
          taskIds.map(id => waitForTaskCompletion(manager, id, 15000))
        );

        // Verify all completed
        const finalStats = manager.getStats();
        expect(finalStats.completedSimulations).toBe(5);
        
        // Peak concurrency should not have exceeded the limit
        expect(finalStats.peakConcurrency).toBeLessThanOrEqual(2);

      } finally {
        await manager.shutdown();
      }
    });

    it('should clean up resources after shutdown', async () => {
      const manager = new NFsimConcurrencyManager(mockModuleLoader, {
        maxConcurrentSimulations: 2,
        maxModuleInstances: 3
      });

      // Submit and complete a simulation
      const taskId = await manager.submitSimulation(
        generateSimpleXML('model'),
        { t_end: 1, n_steps: 10, timeoutMs: 5000 }
      );

      await waitForTaskCompletion(manager, taskId, 5000);

      const statsBeforeShutdown = manager.getStats();
      expect(statsBeforeShutdown.totalModules).toBeGreaterThan(0);

      // Shutdown
      await manager.shutdown();

      const statsAfterShutdown = manager.getStats();
      expect(statsAfterShutdown.totalModules).toBe(0);
      expect(statsAfterShutdown.activeSimulations).toBe(0);
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Wait for a task to reach a terminal state
 */
async function waitForTaskCompletion(
  manager: NFsimConcurrencyManager,
  taskId: string,
  timeoutMs: number
): Promise<any> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const task = manager.getTaskStatus(taskId);
    
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    if (['completed', 'failed', 'cancelled'].includes(task.status)) {
      return task;
    }
    
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  throw new Error(`Task ${taskId} did not complete within ${timeoutMs}ms`);
}

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
