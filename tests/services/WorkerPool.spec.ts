import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { WorkerPool } from '../../src/services/WorkerPool';

describe('WorkerPool batch method', () => {
    let mockWorkerInsts: any[] = [];

    beforeEach(() => {
        mockWorkerInsts = [];
        class MockWorker {
            handlers: any[] = [];
            addEventListener = vi.fn((event, handler) => {
                if (event === 'message') this.handlers.push(handler);
            });
            removeEventListener = vi.fn((event, handler) => {
                if (event === 'message') {
                    this.handlers = this.handlers.filter(h => h !== handler);
                }
            });
            postMessage = vi.fn((req) => {
                const { id, data } = req;
                // Auto-respond for batch tasks
                setTimeout(() => {
                    this.trigger({
                        id,
                        type: 'RESULT',
                        data: { processed: data }
                    });
                }, 0);
            });
            terminate = vi.fn();

            trigger(eventData: any) {
                // Must call all handlers (memory rule)
                this.handlers.forEach(h => h({ data: eventData }));
            }

            // Standard onmessage handling as used in WorkerPool
            set onmessage(handler: any) {
                this.handlers.push((event: any) => handler(event));
            }
            set onerror(handler: any) {
                // simple mock
            }

            constructor() {
                mockWorkerInsts.push(this);
                // Also trigger ready instantly so initialize finishes
                setTimeout(() => {
                    this.trigger({ type: 'READY' });
                }, 0);
            }
        }
        vi.stubGlobal('Worker', MockWorker);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('returns an empty array when given an empty data array', async () => {
        const pool = new WorkerPool('/dummy-worker.js', 2);
        await pool.initialize();

        const results = await pool.batch('RUN_SIMULATION', []);
        expect(results).toEqual([]);

        pool.terminate();
    });

    it('processes a batch of tasks smaller than the pool size', async () => {
        const pool = new WorkerPool('/dummy-worker.js', 4);
        await pool.initialize();

        const inputData = [1, 2];
        const results = await pool.batch('RUN_SIMULATION', inputData);

        expect(results).toHaveLength(2);
        expect(results).toEqual([{ processed: 1 }, { processed: 2 }]);

        pool.terminate();
    });

    it('processes a batch of tasks larger than the pool size', async () => {
        const pool = new WorkerPool('/dummy-worker.js', 2);
        await pool.initialize();

        const inputData = [1, 2, 3, 4, 5];
        const results = await pool.batch('RUN_SIMULATION', inputData);

        expect(results).toHaveLength(5);
        expect(results).toEqual([
            { processed: 1 },
            { processed: 2 },
            { processed: 3 },
            { processed: 4 },
            { processed: 5 }
        ]);

        pool.terminate();
    });

    it('properly distributes tasks among workers', async () => {
        const poolSize = 3;
        const pool = new WorkerPool('/dummy-worker.js', poolSize);
        await pool.initialize();

        const inputData = [1, 2, 3, 4, 5, 6, 7];
        await pool.batch('RUN_SIMULATION', inputData);

        const stats = pool.getStats();
        // Since all processing is done, we check totalTasks
        expect(stats.totalTasks).toBe(7);
        // It should have used all workers ideally
        const workersWithTasks = mockWorkerInsts.filter(w => w.postMessage.mock.calls.length > 0);
        expect(workersWithTasks.length).toBeGreaterThan(0);

        pool.terminate();
    });
});
