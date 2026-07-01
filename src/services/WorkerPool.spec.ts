import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerPool } from './WorkerPool';

describe('WorkerPool', () => {
  let pool: WorkerPool;
  let mockWorkers: any[] = [];

  beforeEach(() => {
    mockWorkers = [];
    // Mock global Worker
    const mockWorker = class {
      onmessage: any = null;
      onerror: any = null;
      postMessage = vi.fn();
      terminate = vi.fn();

      constructor() {
        mockWorkers.push(this);
      }

      addEventListener = vi.fn((event, handler) => {
        if (event === 'message') {
           // Simulate READY immediately
           setTimeout(() => handler({ data: { type: 'READY' } }), 0);
        }
      });
      removeEventListener = vi.fn();
    };
    vi.stubGlobal('Worker', mockWorker);

    pool = new WorkerPool('dummy-worker.js', 2);
  });

  afterEach(() => {
    pool.terminate();
    vi.unstubAllGlobals();
  });

  describe('Error handling', () => {
    it('should reject promise when worker encounters an error', async () => {
      // Mock crypto for deterministic task IDs
      const mockUUID = 'test-uuid-123';
      vi.stubGlobal('crypto', { randomUUID: () => mockUUID });

      await pool.initialize();

      const submitPromise = pool.submit('RUN_SIMULATION', { dummy: 'data' });

      // Wait for task to be picked up
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify worker has the task
      expect(mockWorkers[0].postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: mockUUID })
      );

      // Additional check to satisfy observing public behavior
      expect(pool.getStats().busyWorkers).toBe(1);

      // Trigger error - note that ErrorEvent might not be defined in Node
      // so we construct a mock object that duck-types it.
      mockWorkers[0].onerror({ message: 'Test error' });

      // The promise should be rejected
      await expect(submitPromise).rejects.toThrow('Worker error: Test error');
    });

    it('should not throw if onerror is called without a current task', async () => {
      await pool.initialize();

      // Trigger error when no task is running
      expect(() => {
        mockWorkers[0].onerror({ message: 'Test error' });
      }).not.toThrow();

      // Ensure it resets busy state
      expect(pool.getStats().busyWorkers).toBe(0);
    });

    it('should handle worker RESULT with type ERROR', async () => {
      const mockUUID = 'test-uuid-456';
      vi.stubGlobal('crypto', { randomUUID: () => mockUUID });

      await pool.initialize();

      const submitPromise = pool.submit('RUN_SIMULATION', { dummy: 'data' });

      // Wait for task to be picked up
      await new Promise(resolve => setTimeout(resolve, 10));

      // Trigger error message from worker
      mockWorkers[0].onmessage({
        data: {
          id: mockUUID,
          type: 'ERROR',
          error: 'Result payload error'
        }
      });

      await expect(submitPromise).rejects.toThrow('Result payload error');
    });
  });
});
