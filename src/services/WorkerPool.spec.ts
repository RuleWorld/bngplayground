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

    it('should process next task in queue when a worker encounters an error', async () => {
      await pool.initialize();

      // Submit first task which will run on worker 0
      const task1Promise = pool.submit('RUN_SIMULATION', { task: 1 });
      // Submit second task which will run on worker 1
      const task2Promise = pool.submit('RUN_SIMULATION', { task: 2 });
      // Submit third task which will be queued
      const task3Promise = pool.submit('RUN_SIMULATION', { task: 3 });

      // Attach catch handlers to avoid unhandled rejections on teardown
      void task1Promise.catch(() => {});
      void task2Promise.catch(() => {});
      void task3Promise.catch(() => {});

      // Wait for tasks to be picked up
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(pool.getStats().busyWorkers).toBe(2);
      expect(pool.getStats().pendingTasks).toBe(1);

      // Trigger error on worker 0
      mockWorkers[0].onerror({ message: 'Crash 1' });

      // Worker 0 should pick up task 3 from the queue now
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(pool.getStats().busyWorkers).toBe(2); // Worker 1 still busy, Worker 0 busy with task 3
      expect(pool.getStats().pendingTasks).toBe(0); // Queued task is now running

      // Task 1 should have been rejected
      await expect(task1Promise).rejects.toThrow('Worker error: Crash 1');
    });

    it('should reject all pending and active promises when pool is terminated', async () => {
      await pool.initialize();

      const task1Promise = pool.submit('RUN_SIMULATION', { task: 1 });
      const task2Promise = pool.submit('RUN_SIMULATION', { task: 2 });
      const task3Promise = pool.submit('RUN_SIMULATION', { task: 3 });

      // Wait for tasks to be picked up/queued
      await new Promise(resolve => setTimeout(resolve, 10));

      pool.terminate();

      await Promise.all([
        expect(task1Promise).rejects.toThrow('WorkerPool was terminated'),
        expect(task2Promise).rejects.toThrow('WorkerPool was terminated'),
        expect(task3Promise).rejects.toThrow('WorkerPool was terminated')
      ]);
    });
  });
});
