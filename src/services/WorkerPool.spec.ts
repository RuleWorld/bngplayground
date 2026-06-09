import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerPool } from './WorkerPool';

describe('WorkerPool', () => {
  let pool: WorkerPool;

  beforeEach(() => {
    // Mock global Worker
    const mockWorker = class {
      onmessage: any = null;
      onerror: any = null;
      postMessage = vi.fn();
      terminate = vi.fn();
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

      // We need access to the workers array to trigger the error
      // Since it's private, we'll use a hack to get it for testing
      const workers = (pool as any).workers;

      // Wait for task to be picked up
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify worker has the task
      expect(workers[0].currentTask).toBe(mockUUID);

      // Trigger error - note that ErrorEvent might not be defined in Node
      // so we construct a mock object that duck-types it.
      workers[0].worker.onerror({ message: 'Test error' });

      // The promise should be rejected
      await expect(submitPromise).rejects.toThrow('Worker error: Test error');
    });

    it('should not throw if onerror is called without a current task', async () => {
      await pool.initialize();

      const workers = (pool as any).workers;

      // Trigger error when no task is running
      expect(() => {
        workers[0].worker.onerror({ message: 'Test error' });
      }).not.toThrow();

      // Ensure it resets busy state and currentTask
      expect(workers[0].busy).toBe(false);
      expect(workers[0].currentTask).toBe(null);
    });

    it('should handle worker RESULT with type ERROR', async () => {
      const mockUUID = 'test-uuid-456';
      vi.stubGlobal('crypto', { randomUUID: () => mockUUID });

      await pool.initialize();

      const submitPromise = pool.submit('RUN_SIMULATION', { dummy: 'data' });

      const workers = (pool as any).workers;

      // Wait for task to be picked up
      await new Promise(resolve => setTimeout(resolve, 10));

      // Trigger error message from worker
      workers[0].worker.onmessage({
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
