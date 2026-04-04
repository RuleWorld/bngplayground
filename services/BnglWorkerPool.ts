/**
 * services/BnglWorkerPool.ts
 * 
 * Manages a pool of Web Workers for parallel processing of BNGL simulations.
 * Particularly useful for ensembles and parameter sweeps.
 */

import { BNGLModel, SharedSimulationOutputDescriptor, SimulationOptions, SimulationResults, WorkerRequest, WorkerResponse } from '../types';

export interface SharedEnsembleResultsHandle {
    kind: 'shared';
    headers: string[];
    runCount: number;
    rowCount: number;
    columnCount: number;
    values: Float64Array;
    completion: Int32Array;
}

export const isSharedEnsembleResultsHandle = (
    value: SimulationResults[] | SharedEnsembleResultsHandle | null | undefined
): value is SharedEnsembleResultsHandle => !!value && (value as SharedEnsembleResultsHandle).kind === 'shared';

export const canUseSharedArrayBuffer = (): boolean => {
    try {
        return typeof SharedArrayBuffer !== 'undefined' && new SharedArrayBuffer(1).byteLength === 1;
    } catch {
        return false;
    }
};

export const createSharedEnsembleResults = (
    runCount: number,
    headers: string[],
    rowCount: number
): SharedEnsembleResultsHandle => {
    const columnCount = headers.length;
    const valueBuffer = new SharedArrayBuffer(
        Float64Array.BYTES_PER_ELEMENT * runCount * rowCount * columnCount
    );
    const completionBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * runCount);
    return {
        kind: 'shared',
        headers: [...headers],
        runCount,
        rowCount,
        columnCount,
        values: new Float64Array(valueBuffer),
        completion: new Int32Array(completionBuffer)
    };
};

export const writeSimulationResultsToShared = (
    shared: SharedEnsembleResultsHandle,
    runIndex: number,
    results: SimulationResults
): void => {
    if (runIndex < 0 || runIndex >= shared.runCount) {
        throw new Error(`Shared ensemble index out of range: ${runIndex}`);
    }

    if (results.data.length !== shared.rowCount) {
        throw new Error(`Expected ${shared.rowCount} rows, received ${results.data.length}`);
    }

    if (results.headers.length !== shared.columnCount) {
        throw new Error(`Expected ${shared.columnCount} columns, received ${results.headers.length}`);
    }

    const runStride = shared.rowCount * shared.columnCount;
    let offset = runIndex * runStride;
    for (let rowIdx = 0; rowIdx < shared.rowCount; rowIdx++) {
        const row = results.data[rowIdx] ?? {};
        for (let colIdx = 0; colIdx < shared.columnCount; colIdx++) {
            const rawValue = row[shared.headers[colIdx]];
            shared.values[offset++] = typeof rawValue === 'number' ? rawValue : Number(rawValue ?? Number.NaN);
        }
    }
    Atomics.store(shared.completion, runIndex, 1);
};

export const materializeSharedSimulationResult = (
    shared: SharedEnsembleResultsHandle,
    runIndex: number
): SimulationResults => {
    if (Atomics.load(shared.completion, runIndex) !== 1) {
        throw new Error(`Shared ensemble slot ${runIndex} is not complete`);
    }

    const runStride = shared.rowCount * shared.columnCount;
    let offset = runIndex * runStride;
    const data: Record<string, number>[] = new Array(shared.rowCount);

    for (let rowIdx = 0; rowIdx < shared.rowCount; rowIdx++) {
        const row: Record<string, number> = {};
        for (let colIdx = 0; colIdx < shared.columnCount; colIdx++) {
            row[shared.headers[colIdx]] = shared.values[offset++];
        }
        data[rowIdx] = row;
    }

    return {
        headers: [...shared.headers],
        data
    };
};

export const getSharedEnsembleFeatureVector = (
    shared: SharedEnsembleResultsHandle,
    runIndex: number
): number[] => {
    if (Atomics.load(shared.completion, runIndex) !== 1) {
        throw new Error(`Shared ensemble slot ${runIndex} is not complete`);
    }

    const runStride = shared.rowCount * shared.columnCount;
    const start = runIndex * runStride;
    return Array.from(shared.values.subarray(start, start + runStride));
};

export class BnglWorkerPool {
    private workers: Worker[] = [];
    private poolSize: number;
    private nextWorkerIdx = 0;
    private isInitialized = false;

    constructor(poolSize?: number) {
        // Default to hardware concurrency - 1 (leave one for UI)
        const hardwareConcurrency = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
        this.poolSize = poolSize ?? Math.max(1, hardwareConcurrency - 1);
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        for (let i = 0; i < this.poolSize; i++) {
            // Use the same worker as BnglService
            const worker = new Worker(new URL('./bnglWorker.ts', import.meta.url), { type: 'module' });
            
            // Add global error handler to catch worker crashes
            worker.addEventListener('error', (err) => {
                console.error(`[Pool] Worker ${i} global error:`, err);
            });
            
            // Listen for internal error messages from our own error trapping in the worker
            worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
                if (event.data.type === 'worker_internal_error') {
                   console.error(`[Pool] Worker ${i} internal error reported:`, event.data.payload);
                }
            });

            this.workers.push(worker);
        }
        this.isInitialized = true;
    }

    /**
     * Run a single simulation on a specific worker or the next available one.
     */
    async simulate(model: BNGLModel, options: SimulationOptions, workerIdx?: number): Promise<SimulationResults> {
        if (!this.isInitialized) await this.initialize();

        const idx = workerIdx ?? (this.nextWorkerIdx++ % this.poolSize);
        const worker = this.workers[idx];

        return new Promise((resolve, reject) => {
            const messageId = Math.floor(Math.random() * 1000000);

            const handler = (event: MessageEvent<WorkerResponse>) => {
                const { id, type, payload } = event.data;
                if (id !== messageId) return;

                if (type === 'simulate_success') {
                    worker.removeEventListener('message', handler);
                    resolve(payload as SimulationResults);
                } else if (type === 'simulate_error') {
                    worker.removeEventListener('message', handler);
                    const errorMsg = (payload as any)?.message || 'Simulation failed';
                    console.error(`[Pool] Worker simulate_error: ${errorMsg}`, payload);
                    reject(new Error(errorMsg));
                }
                // Ignore other types like 'progress'
            };

            worker.addEventListener('message', handler);

            const request: WorkerRequest = {
                id: messageId,
                type: 'simulate',
                payload: { model, options }
            };

            worker.postMessage(request);
        });
    }

    /**
     * Run an ensemble of simulations in parallel across the pool.
     */
    async runEnsemble(
        model: BNGLModel,
        options: SimulationOptions,
        count: number,
        onProgress?: (index: number) => void
    ): Promise<SimulationResults[] | SharedEnsembleResultsHandle> {
        if (!this.isInitialized) await this.initialize();

        // Prepare model on ALL workers for cached simulation
        const modelIds = await Promise.all(this.workers.map(w => this.prepareModelOnWorker(w, model)));
        try {
            const firstWorker = this.workers[0];
            const firstModelId = modelIds[0];
            const firstResult = await this.simulateCachedOnWorker(firstWorker, firstModelId, { ...options, seed: 0 });

            if (count === 1) {
                onProgress?.(1);
                return [firstResult];
            }

            if (canUseSharedArrayBuffer() && firstResult.data.length > 0 && firstResult.headers.length > 0) {
                const shared = createSharedEnsembleResults(count, firstResult.headers, firstResult.data.length);
                writeSimulationResultsToShared(shared, 0, firstResult);
                let completed = 1;
                onProgress?.(completed);

                const runSharedTask = async (taskIdx: number) => {
                    const workerIdx = taskIdx % this.poolSize;
                    const worker = this.workers[workerIdx];
                    const modelId = modelIds[workerIdx];
                    await this.simulateCachedOnWorkerShared(worker, modelId, { ...options, seed: taskIdx }, {
                        slot: taskIdx,
                        runCount: shared.runCount,
                        rowCount: shared.rowCount,
                        columnCount: shared.columnCount,
                        headers: shared.headers,
                        valuesBuffer: shared.values.buffer as SharedArrayBuffer,
                        completionBuffer: shared.completion.buffer as SharedArrayBuffer
                    });
                    completed++;
                    onProgress?.(completed);
                };

                await Promise.all(Array.from({ length: count - 1 }, (_, index) => runSharedTask(index + 1)));
                return shared;
            }

            const results: SimulationResults[] = new Array(count);
            results[0] = firstResult;
            let completed = 1;
            onProgress?.(completed);

            const runTask = async (taskIdx: number) => {
                const workerIdx = taskIdx % this.poolSize;
                const worker = this.workers[workerIdx];
                const modelId = modelIds[workerIdx];

                const res = await this.simulateCachedOnWorker(worker, modelId, { ...options, seed: taskIdx });
                results[taskIdx] = res;
                completed++;
                onProgress?.(completed);
            };

            await Promise.all(Array.from({ length: count - 1 }, (_, index) => runTask(index + 1)));
            return results;
        } finally {
            await Promise.all(this.workers.map((w, i) => this.releaseModelOnWorker(w, modelIds[i])));
        }
    }

    private prepareModelOnWorker(worker: Worker, model: BNGLModel): Promise<number> {
        return new Promise((resolve, reject) => {
            const messageId = Math.floor(Math.random() * 1000000);
            const handler = (event: MessageEvent<WorkerResponse>) => {
                const { id, type, payload } = event.data;
                if (id !== messageId) return;

                if (type === 'cache_model_success') {
                    worker.removeEventListener('message', handler);
                    resolve((payload as any).modelId);
                } else if (type === 'cache_model_error') {
                    worker.removeEventListener('message', handler);
                    const errorMsg = (payload as any)?.message || 'Failed to cache model';
                    console.error(`[Pool] Worker cache_model_error: ${errorMsg}`, payload);
                    reject(new Error(errorMsg));
                }
            };
            worker.addEventListener('message', handler);
            worker.postMessage({ id: messageId, type: 'cache_model', payload: { model } });
        });
    }

    private simulateCachedOnWorker(worker: Worker, modelId: number, options: SimulationOptions): Promise<SimulationResults> {
        return new Promise((resolve, reject) => {
            const messageId = Math.floor(Math.random() * 1000000);
            const handler = (event: MessageEvent<WorkerResponse>) => {
                const { id, type, payload } = event.data;
                if (id !== messageId) return;

                if (type === 'simulate_success') {
                    worker.removeEventListener('message', handler);
                    resolve(payload as SimulationResults);
                } else if (type === 'simulate_error') {
                    worker.removeEventListener('message', handler);
                    const errorMsg = (payload as any)?.message || 'Simulation failed';
                    console.error(`[Pool] Worker simulate_error: ${errorMsg}`, payload);
                    reject(new Error(errorMsg));
                }
            };
            worker.addEventListener('message', handler);
            worker.postMessage({ id: messageId, type: 'simulate', payload: { modelId, options } });
        });
    }

    private simulateCachedOnWorkerShared(
        worker: Worker,
        modelId: number,
        options: SimulationOptions,
        sharedOutput: SharedSimulationOutputDescriptor
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const messageId = Math.floor(Math.random() * 1000000);
            const handler = (event: MessageEvent<WorkerResponse>) => {
                const { id, type, payload } = event.data;
                if (id !== messageId) return;

                if (type === 'simulate_shared_success') {
                    worker.removeEventListener('message', handler);
                    resolve();
                } else if (type === 'simulate_error') {
                    worker.removeEventListener('message', handler);
                    const errorMsg = (payload as any)?.message || 'Simulation failed';
                    reject(new Error(errorMsg));
                }
            };

            worker.addEventListener('message', handler);
            worker.postMessage({
                id: messageId,
                type: 'simulate',
                payload: { modelId, options, sharedOutput }
            } satisfies WorkerRequest);
        });
    }

    private releaseModelOnWorker(worker: Worker, modelId: number): Promise<void> {
        return new Promise((resolve) => {
            const messageId = Math.floor(Math.random() * 1000000);
            const handler = (event: MessageEvent<WorkerResponse>) => {
                if (event.data.id !== messageId) return;
                worker.removeEventListener('message', handler);
                resolve();
            };
            worker.addEventListener('message', handler);
            worker.postMessage({ id: messageId, type: 'release_model', payload: { modelId } });
        });
    }

    terminate(): void {
        this.workers.forEach(w => w.terminate());
        this.workers = [];
        this.isInitialized = false;
    }
}

export const bnglWorkerPool = new BnglWorkerPool();
