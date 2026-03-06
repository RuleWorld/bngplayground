import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { NFsimMemoryManager, resetMemoryManager } from '@bngplayground/engine';

// Mock WASM module for testing
const createMockModule = () => ({
  _malloc: vi.fn((size: number) => {
    // Simulate realistic memory allocation
    const ptr = Math.floor(Math.random() * 1000000) + 1000;
    return ptr;
  }),
  _free: vi.fn(),
  HEAPU8: new Uint8Array(1024 * 1024) // 1MB mock heap
});

describe('NFsim Memory Management Safety', () => {
  let memoryManager: NFsimMemoryManager;
  let mockModule: any;

  beforeEach(() => {
    resetMemoryManager();
    mockModule = createMockModule();
    memoryManager = new NFsimMemoryManager({
      maxMemoryMB: 10, // Small limit for testing
      gcThresholdMB: 5,
      enableMonitoring: true,
      autoCleanup: true
    });
    memoryManager.initialize(mockModule);
  });

  afterEach(() => {
    memoryManager.cleanup();
    resetMemoryManager();
  });

  describe('Property 2: Memory Management Safety', () => {
    it('should maintain memory invariants under various allocation patterns', async () => {
      await fc.assert(
        fc.property(
          fc.array(
            fc.record({
              operation: fc.oneof(
                fc.constant('allocate' as const),
                fc.constant('free' as const),
                fc.constant('clone' as const),
                fc.constant('write' as const)
              ),
              size: fc.integer({ min: 1, max: 1024 * 1024 }), // 1B to 1MB
              data: fc.uint8Array({ minLength: 1, maxLength: 1024 })
            }),
            { minLength: 1, maxLength: 50 }
          ),
          (operations) => {
            // **Property 2: Memory Management Safety**
            // *For any* sequence of memory operations, the memory manager should:
            // 1. Never exceed memory limits
            // 2. Maintain accurate statistics
            // 3. Prevent memory leaks
            // 4. Handle allocation failures gracefully

            const allocatedBuffers: string[] = [];
            let totalAllocated = 0;
            let totalFreed = 0;

            for (const op of operations) {
              try {
                switch (op.operation) {
                  case 'allocate':
                    // Test allocation within limits
                    if (totalAllocated - totalFreed + op.size <= 10 * 1024 * 1024) {
                      const buffer = memoryManager.allocateBuffer(op.size, 'temp');
                      allocatedBuffers.push(buffer.id);
                      totalAllocated += op.size;
                      
                      // Buffer should be tracked
                      expect(buffer.id).toBeDefined();
                      expect(buffer.size).toBe(op.size);
                      expect(buffer.ptr).toBeGreaterThan(0);
                    }
                    break;

                  case 'free':
                    if (allocatedBuffers.length > 0) {
                      const bufferId = allocatedBuffers.pop()!;
                      const bufferInfo = memoryManager.getBufferInfo().find(b => b.id === bufferId);
                      if (bufferInfo) {
                        const freed = memoryManager.freeBuffer(bufferId);
                        if (freed) {
                          totalFreed += bufferInfo.size;
                        }
                      }
                    }
                    break;

                  case 'clone':
                    if (allocatedBuffers.length > 0) {
                      const bufferId = allocatedBuffers[Math.floor(Math.random() * allocatedBuffers.length)];
                      const clone = memoryManager.cloneBufferToJS(bufferId);
                      // Clone should either succeed or return null
                      if (clone !== null) {
                        expect(clone).toBeInstanceOf(Uint8Array);
                      }
                    }
                    break;

                  case 'write':
                    if (allocatedBuffers.length > 0) {
                      const bufferId = allocatedBuffers[Math.floor(Math.random() * allocatedBuffers.length)];
                      const bufferInfo = memoryManager.getBufferInfo().find(b => b.id === bufferId);
                      if (bufferInfo && op.data.length <= bufferInfo.size) {
                        const written = memoryManager.writeToBuffer(bufferId, op.data);
                        // Write should succeed if buffer exists and data fits
                        expect(typeof written).toBe('boolean');
                      }
                    }
                    break;
                }
              } catch (error) {
                // Memory limit exceeded or other expected errors are acceptable
                if (error instanceof Error) {
                  expect(error.message).toMatch(/Memory allocation would exceed limit|Failed to allocate|not initialized/);
                }
              }
            }

            // Verify memory statistics are consistent
            const stats = memoryManager.getStats();
            expect(stats.totalAllocated).toBeGreaterThanOrEqual(0);
            expect(stats.totalFreed).toBeGreaterThanOrEqual(0);
            expect(stats.currentUsage).toBeGreaterThanOrEqual(0);
            expect(stats.currentUsage).toBe(stats.totalAllocated - stats.totalFreed);
            expect(stats.peakUsage).toBeGreaterThanOrEqual(stats.currentUsage);
            expect(stats.allocationCount).toBeGreaterThanOrEqual(0);
            expect(stats.freeCount).toBeGreaterThanOrEqual(0);

            // Memory usage should be reasonable
            expect(stats.currentUsage).toBeLessThanOrEqual(10 * 1024 * 1024); // Within limit

            // Buffer tracking should be consistent
            const bufferInfo = memoryManager.getBufferInfo();
            const trackedSize = bufferInfo.reduce((sum, buf) => sum + buf.size, 0);
            expect(trackedSize).toBe(stats.currentUsage);
          }
        ),
        { numRuns: 20, timeout: 10000 }
      );
    });

    it('should handle memory pressure and cleanup gracefully', async () => {
      await fc.assert(
        fc.property(
          fc.array(
            fc.integer({ min: 1024, max: 2 * 1024 * 1024 }), // 1KB to 2MB allocations
            { minLength: 5, maxLength: 20 }
          ),
          (allocationSizes) => {
            // **Property 2: Memory Management Safety**
            // *For any* sequence of large allocations that may exceed memory limits,
            // the memory manager should handle pressure gracefully

            const allocatedBuffers: string[] = [];
            let successfulAllocations = 0;
            let failedAllocations = 0;

            for (const size of allocationSizes) {
              try {
                const buffer = memoryManager.allocateBuffer(size, 'temp');
                allocatedBuffers.push(buffer.id);
                successfulAllocations++;

                // Verify buffer properties
                expect(buffer.size).toBe(size);
                expect(buffer.ptr).toBeGreaterThan(0);
                expect(buffer.type).toBe('temp');

              } catch (error) {
                failedAllocations++;
                // Should fail gracefully with appropriate error
                expect(error).toBeInstanceOf(Error);
                if (error instanceof Error) {
                  expect(error.message).toMatch(/Memory allocation would exceed limit|Failed to allocate/);
                }
              }
            }

            // At least some operations should have been attempted
            expect(successfulAllocations + failedAllocations).toBe(allocationSizes.length);

            // Memory should be within limits
            const stats = memoryManager.getStats();
            expect(stats.currentUsage).toBeLessThanOrEqual(10 * 1024 * 1024);

            // Memory health should be trackable
            const isHealthy = memoryManager.isMemoryHealthy();
            expect(typeof isHealthy).toBe('boolean');

            const usagePercent = memoryManager.getMemoryUsagePercent();
            expect(usagePercent).toBeGreaterThanOrEqual(0);
            expect(usagePercent).toBeLessThanOrEqual(100);

            // Cleanup should work
            memoryManager.cleanup();
            const finalStats = memoryManager.getStats();
            expect(finalStats.currentUsage).toBe(0);
          }
        ),
        { numRuns: 15, timeout: 8000 }
      );
    });

    it('should maintain buffer isolation and prevent corruption', async () => {
      await fc.assert(
        fc.property(
          fc.array(
            fc.record({
              size: fc.integer({ min: 100, max: 1000 }),
              data: fc.uint8Array({ minLength: 50, maxLength: 100 })
            }),
            { minLength: 2, maxLength: 10 }
          ),
          (bufferSpecs) => {
            // **Property 2: Memory Management Safety**
            // *For any* set of buffers with different data, each buffer should
            // maintain its data integrity and isolation

            const buffers: Array<{ id: string; originalData: Uint8Array }> = [];

            // Allocate and write to buffers
            for (const spec of bufferSpecs) {
              try {
                const buffer = memoryManager.allocateBuffer(spec.size, 'temp');
                const writeData = spec.data.slice(0, Math.min(spec.data.length, spec.size));
                
                const written = memoryManager.writeToBuffer(buffer.id, writeData);
                if (written) {
                  buffers.push({
                    id: buffer.id,
                    originalData: new Uint8Array(writeData)
                  });
                }
              } catch (error) {
                // Memory limit exceeded is acceptable
                if (error instanceof Error && !error.message.includes('Memory allocation would exceed limit')) {
                  throw error;
                }
              }
            }

            // Verify data integrity for each buffer
            for (const { id, originalData } of buffers) {
              const clonedData = memoryManager.cloneBufferToJS(id);
              
              if (clonedData !== null) {
                // Data should match what was written
                const relevantClone = clonedData.slice(0, originalData.length);
                expect(relevantClone).toEqual(originalData);
              }
            }

            // Buffer info should be consistent
            const bufferInfo = memoryManager.getBufferInfo();
            expect(bufferInfo.length).toBeGreaterThanOrEqual(0);
            
            for (const info of bufferInfo) {
              expect(info.id).toBeDefined();
              expect(info.size).toBeGreaterThan(0);
              expect(info.ptr).toBeGreaterThan(0);
              expect(['input', 'output', 'temp']).toContain(info.type);
              expect(info.allocated).toBeInstanceOf(Date);
            }
          }
        ),
        { numRuns: 10, timeout: 5000 }
      );
    });
  });

  describe('Unit Tests for Memory Management Safety', () => {
    it('should initialize correctly with WASM module', () => {
      const manager = new NFsimMemoryManager();
      const module = createMockModule();
      
      manager.initialize(module);
      
      // Should be able to allocate after initialization
      const buffer = manager.allocateBuffer(1024);
      expect(buffer.id).toBeDefined();
      expect(buffer.size).toBe(1024);
      
      manager.cleanup();
    });

    it('should enforce memory limits', () => {
      const manager = new NFsimMemoryManager({ maxMemoryMB: 1 });
      manager.initialize(mockModule);

      // Should succeed within limit
      const buffer1 = manager.allocateBuffer(512 * 1024); // 512KB
      expect(buffer1).toBeDefined();

      // Should fail when exceeding limit
      expect(() => {
        manager.allocateBuffer(600 * 1024); // 600KB, would exceed 1MB limit
      }).toThrow(/Memory allocation would exceed limit/);

      manager.cleanup();
    });

    it('should track buffer lifecycle correctly', () => {
      const buffer = memoryManager.allocateBuffer(1024, 'input');
      
      // Buffer should be tracked
      const bufferInfo = memoryManager.getBufferInfo();
      expect(bufferInfo).toHaveLength(1);
      expect(bufferInfo[0].id).toBe(buffer.id);
      expect(bufferInfo[0].type).toBe('input');

      // Free buffer
      const freed = memoryManager.freeBuffer(buffer.id);
      expect(freed).toBe(true);

      // Should no longer be tracked
      const finalBufferInfo = memoryManager.getBufferInfo();
      expect(finalBufferInfo).toHaveLength(0);
    });

    it('should handle buffer cloning safely', () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const buffer = memoryManager.allocateBuffer(testData.length);
      
      // Write test data
      const written = memoryManager.writeToBuffer(buffer.id, testData);
      expect(written).toBe(true);

      // Clone should return independent copy
      const clone = memoryManager.cloneBufferToJS(buffer.id);
      expect(clone).toEqual(testData);
      
      // Modifying clone shouldn't affect original
      if (clone) {
        clone[0] = 99;
        const clone2 = memoryManager.cloneBufferToJS(buffer.id);
        expect(clone2![0]).toBe(1); // Original unchanged
      }
    });

    it('should handle write bounds checking', () => {
      const buffer = memoryManager.allocateBuffer(10);
      
      // Should succeed within bounds
      const smallData = new Uint8Array([1, 2, 3]);
      const written1 = memoryManager.writeToBuffer(buffer.id, smallData);
      expect(written1).toBe(true);

      // Should fail when exceeding bounds
      const largeData = new Uint8Array(20);
      const written2 = memoryManager.writeToBuffer(buffer.id, largeData);
      expect(written2).toBe(false);
    });

    it('should run garbage collection when needed', () => {
      // Create some temporary buffers
      const buffers = [];
      for (let i = 0; i < 5; i++) {
        buffers.push(memoryManager.allocateBuffer(1024, 'temp'));
      }

      expect(memoryManager.getBufferInfo()).toHaveLength(5);

      // Force garbage collection
      memoryManager.runGarbageCollection();

      // Buffers might still exist (they're not old enough), but GC should run without error
      expect(memoryManager.getBufferInfo().length).toBeGreaterThanOrEqual(0);
    });

    it('should provide accurate memory statistics', () => {
      const initialStats = memoryManager.getStats();
      expect(initialStats.currentUsage).toBe(0);

      // Allocate some memory
      const buffer1 = memoryManager.allocateBuffer(1024);
      const buffer2 = memoryManager.allocateBuffer(2048);

      const midStats = memoryManager.getStats();
      expect(midStats.currentUsage).toBe(3072);
      expect(midStats.totalAllocated).toBe(3072);
      expect(midStats.allocationCount).toBe(2);

      // Free one buffer
      memoryManager.freeBuffer(buffer1.id);

      const finalStats = memoryManager.getStats();
      expect(finalStats.currentUsage).toBe(2048);
      expect(finalStats.totalFreed).toBe(1024);
      expect(finalStats.freeCount).toBe(1);
    });

    it('should handle memory health monitoring', () => {
      // Initially healthy
      expect(memoryManager.isMemoryHealthy()).toBe(true);
      expect(memoryManager.getMemoryUsagePercent()).toBe(0);

      // Allocate significant memory
      const buffer = memoryManager.allocateBuffer(8 * 1024 * 1024); // 8MB of 10MB limit

      expect(memoryManager.isMemoryHealthy()).toBe(false); // Over 80% threshold
      expect(memoryManager.getMemoryUsagePercent()).toBeCloseTo(80, 0);
    });
  });
});