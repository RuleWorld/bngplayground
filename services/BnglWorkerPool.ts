/**
 * services/BnglWorkerPool.ts
 * 
 * Manages a pool of Web Workers for parallel processing of BNGL simulations.
 * Particularly useful for ensembles and parameter sweeps.
 */

import { BNGLModel, SharedSimulationOutputDescriptor, SimulationOptions, SimulationResults, WorkerRequest, WorkerResponse } from '../types';
import { extractErrorMessage, toError } from './workerErrorUtils';

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

/**
 * Uses cryptographically secure random number generator to prevent predictability
 * in inter-process communication IDs.
 */
export const generateSecureMessageId = (): number => {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        return crypto.getRandomValues(new Uint32Array(1))[0];
    }
    throw new Error('Secure random generation is not supported in this environment (crypto.getRandomValues is missing).');
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

interface PendingPoolRequest {
    messageId: number;
    successType: WorkerResponse['type'];
    errorType: WorkerResponse['type'];
    defaultErrorMessage: string;
    errorLogLabel?: string;
    resolvePayload: (payload: unknown) => void;
    reject: (err: Error) => void;
}

export class BnglWorkerPool {
    private workers: Worker[] = [];
    private poolSize: number;
    private nextWorkerIdx = 0;
    private isInitialized = false;
    private pendingWorkerRequests = new Map<Worker, Map<number, PendingPoolRequest>>();
    private workerResponseHandlers = new Map<Worker, (event: MessageEvent<WorkerResponse>) => void>();

    constructor(poolSize?: number) {
        // Default to hardware concurrency - 1 (leave one for UI)
        const hardwareConcurrency = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
        this.poolSize = poolSize ?? Math.max(1, hardwareConcurrency - 1);
    }

    private registerPendingRequest(worker: Worker, req: PendingPoolRequest) {
        let requests = this.pendingWorkerRequests.get(worker);
        if (!requests) {
            requests = new Map();
            this.pendingWorkerRequests.set(worker, requests);
        }
        requests.set(req.messageId, req);
    }

    private removePendingRequest(worker: Worker, messageId: number) {
        this.pendingWorkerRequests.get(worker)?.delete(messageId);
    }

    private rejectAllPendingOnWorker(worker: Worker, error: Error) {
        const requests = this.pendingWorkerRequests.get(worker);
        if (requests) {
            for (const req of requests.values()) {
                req.reject(error);
            }
            requests.clear();
        }
    }

    private dispatchWorkerResponse(worker: Worker, workerIdx: number, event: MessageEvent<WorkerResponse>): void {
        const { id, type, payload } = event.data ?? {};

        if (type === 'worker_internal_error') {
            const detail = extractErrorMessage(payload);
            const p = payload && typeof payload === 'object' ? (payload as any) : undefined;
            const details = p?.details;
            const filename = details && typeof details.filename === 'string' ? details.filename : undefined;
            const lineno = details && typeof details.lineno === 'number' ? details.lineno : undefined;
            const colno = details && typeof details.colno === 'number' ? details.colno : undefined;
            const location = `${filename ?? 'unknown'}:${lineno ?? '?'}:${colno ?? '?'}`;
            const stack = p && 'stack' in p && typeof p.stack === 'string' ? p.stack : undefined;
            if (stack) {
                console.error(`[Pool] Worker ${workerIdx} internal error reported: ${detail} (${location})\n${stack}`);
            } else {
                console.error(`[Pool] Worker ${workerIdx} internal error reported: ${detail} (${location})`);
            }
            this.rejectAllPendingOnWorker(worker, new Error(`Worker internal error: ${detail} (${location})`));
            return;
        }

        if (typeof id !== 'number') return;
        const req = this.pendingWorkerRequests.get(worker)?.get(id);
        if (!req) return;

        if (type === req.successType) {
            this.removePendingRequest(worker, id);
            req.resolvePayload(payload);
        } else if (type === req.errorType) {
            this.removePendingRequest(worker, id);
            const errType = type === 'simulate_error' ? 'simulate'
              : type === 'cache_model_error' ? 'cache_model'
              : type === 'release_model_error' ? 'release_model'
              : 'request';
            const err = toError(errType, payload);
            if (req.errorLogLabel) {
                console.error(`[Pool] Worker ${req.errorLogLabel}: ${err.message}`, payload);
            }
            req.reject(err);
        }
        // Progress and warning notifications are intentionally non-terminal.
    }

    private requestOnWorker<T>(
        worker: Worker,
        createRequest: (messageId: number) => WorkerRequest,
        successType: WorkerResponse['type'],
        errorType: WorkerResponse['type'],
        defaultErrorMessage: string,
        mapPayload: (payload: unknown) => T,
        errorLogLabel?: string
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const requests = this.pendingWorkerRequests.get(worker);
            if (!requests) {
                reject(new Error('Worker is not initialized'));
                return;
            }

            let messageId = generateSecureMessageId();
            while (requests.has(messageId)) {
                messageId = generateSecureMessageId();
            }

            const req: PendingPoolRequest = {
                messageId,
                successType,
                errorType,
                defaultErrorMessage,
                errorLogLabel,
                resolvePayload: (payload) => {
                    try {
                        resolve(mapPayload(payload));
                    } catch (error) {
                        reject(error instanceof Error ? error : new Error(String(error)));
                    }
                },
                reject
            };
            this.registerPendingRequest(worker, req);

            try {
                worker.postMessage(createRequest(messageId));
            } catch (error) {
                this.removePendingRequest(worker, messageId);
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        for (let i = 0; i < this.poolSize; i++) {
            // Use the same worker as BnglService
            const worker = new Worker(new URL('./bnglWorker.ts', import.meta.url), { type: 'module' });
            this.pendingWorkerRequests.set(worker, new Map());

            const responseHandler = (event: MessageEvent<WorkerResponse>) => {
                this.dispatchWorkerResponse(worker, i, event);
            };
            this.workerResponseHandlers.set(worker, responseHandler);
            worker.addEventListener('message', responseHandler);
            
            // Add global error handler to catch worker crashes
            worker.addEventListener('error', (err) => {
                console.error(`[Pool] Worker ${i} global error:`, err);
                const errorMsg = err instanceof Error ? err.message : (err && typeof err === 'object' && 'message' in err ? (err as any).message : String(err));
                this.rejectAllPendingOnWorker(worker, new Error(`Worker global error: ${errorMsg}`));
            });

            // Add global messageerror handler to catch deserialization/serialization failures
            worker.addEventListener('messageerror', (event) => {
                console.error(`[Pool] Worker ${i} deserialization error:`, event.data);
                this.rejectAllPendingOnWorker(worker, new Error('Worker posted an unserializable message'));
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
        return this.requestOnWorker(
            worker,
            (messageId) => ({
                id: messageId,
                type: 'simulate',
                payload: { model, options }
            }),
            'simulate_success',
            'simulate_error',
            'Simulation failed',
            (payload) => payload as SimulationResults,
            'simulate_error'
        );
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

        // Prepare model on ALL workers for cached simulation using Promise.allSettled to avoid leaking on partial failures
        const preparationResults = await Promise.allSettled(
            this.workers.map(w => this.prepareModelOnWorker(w, model))
        );

        const failures = preparationResults.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
        if (failures.length > 0) {
            // Release the successfully prepared models to prevent memory leaks in the workers
            await Promise.all(
                preparationResults.map((res, i) => {
                    if (res.status === 'fulfilled') {
                        return this.releaseModelOnWorker(this.workers[i], res.value).catch(() => {});
                    }
                    return Promise.resolve();
                })
            );
            throw failures[0].reason;
        }

        const modelIds = preparationResults.map((r) => (r as PromiseFulfilledResult<number>).value);
        try {
            const initialWaveCount = Math.min(count, this.workers.length);
            const initialResults: SimulationResults[] = new Array(initialWaveCount);
            let completed = 0;
            const initialWave = await Promise.allSettled(
                Array.from({ length: initialWaveCount }, async (_, taskIdx) => {
                    const result = await this.simulateCachedOnWorker(
                        this.workers[taskIdx],
                        modelIds[taskIdx],
                        { ...options, seed: taskIdx }
                    );
                    initialResults[taskIdx] = result;
                    completed++;
                    onProgress?.(completed);
                })
            );
            const initialFailure = initialWave.find(
                (result): result is PromiseRejectedResult => result.status === 'rejected'
            );
            if (initialFailure) throw initialFailure.reason;

            if (count === 1) {
                return initialResults;
            }

            const referenceResult = initialResults[0];
            const hasSharedShape = canUseSharedArrayBuffer()
                && referenceResult.data.length > 0
                && referenceResult.headers.length > 0
                && initialResults.every((result) =>
                    result.data.length === referenceResult.data.length
                    && result.headers.length === referenceResult.headers.length
                    && result.headers.every((header, index) => header === referenceResult.headers[index])
                );

            if (hasSharedShape) {
                const shared = createSharedEnsembleResults(
                    count,
                    referenceResult.headers,
                    referenceResult.data.length
                );
                for (let taskIdx = 0; taskIdx < initialWaveCount; taskIdx++) {
                    writeSimulationResultsToShared(shared, taskIdx, initialResults[taskIdx]);
                }

                await this.runBoundedEnsembleTasks(count, initialWaveCount, async (workerIdx, taskIdx) => {
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
                });

                return shared;
            }

            const results: SimulationResults[] = new Array(count);
            for (let taskIdx = 0; taskIdx < initialWaveCount; taskIdx++) {
                results[taskIdx] = initialResults[taskIdx];
            }

            await this.runBoundedEnsembleTasks(count, initialWaveCount, async (workerIdx, taskIdx) => {
                const worker = this.workers[workerIdx];
                const modelId = modelIds[workerIdx];

                const res = await this.simulateCachedOnWorker(worker, modelId, { ...options, seed: taskIdx });
                results[taskIdx] = res;
                completed++;
                onProgress?.(completed);
            });

            return results;
        } finally {
            await Promise.all(this.workers.map((w, i) => this.releaseModelOnWorker(w, modelIds[i])));
        }
    }

    private async runBoundedEnsembleTasks(
        count: number,
        initialWaveCount: number,
        runTask: (workerIdx: number, taskIdx: number) => Promise<void>
    ): Promise<void> {
        const workerCount = this.workers.length;
        const workerLoops = this.workers.map(async (_worker, workerIdx) => {
            // Each worker already completed its corresponding initial-wave task.
            // Continue the same modulo assignment while awaiting every request
            // before posting that worker's next simulation.
            const firstTaskIdx = workerIdx < initialWaveCount
                ? workerIdx + workerCount
                : workerIdx;
            for (let taskIdx = firstTaskIdx; taskIdx < count; taskIdx += workerCount) {
                await runTask(workerIdx, taskIdx);
            }
        });

        // Wait for every worker loop to settle before release_model messages are
        // posted. This prevents a failure on one worker from releasing models
        // underneath simulations that are still active on other workers.
        const settled = await Promise.allSettled(workerLoops);
        const failure = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (failure) throw failure.reason;
    }

    private prepareModelOnWorker(worker: Worker, model: BNGLModel): Promise<number> {
        return this.requestOnWorker(
            worker,
            (messageId) => ({ id: messageId, type: 'cache_model', payload: { model } }),
            'cache_model_success',
            'cache_model_error',
            'Failed to cache model',
            (payload) => (payload as { modelId: number }).modelId,
            'cache_model_error'
        );
    }

    private simulateCachedOnWorker(worker: Worker, modelId: number, options: SimulationOptions): Promise<SimulationResults> {
        return this.requestOnWorker(
            worker,
            (messageId) => ({ id: messageId, type: 'simulate', payload: { modelId, options } }),
            'simulate_success',
            'simulate_error',
            'Simulation failed',
            (payload) => payload as SimulationResults,
            'simulate_error'
        );
    }

    private simulateCachedOnWorkerShared(
        worker: Worker,
        modelId: number,
        options: SimulationOptions,
        sharedOutput: SharedSimulationOutputDescriptor
    ): Promise<void> {
        return this.requestOnWorker(
            worker,
            (messageId) => ({
                    id: messageId,
                    type: 'simulate',
                    payload: { modelId, options, sharedOutput }
                }),
            'simulate_shared_success',
            'simulate_error',
            'Simulation failed',
            () => undefined
        );
    }

    private releaseModelOnWorker(worker: Worker, modelId: number): Promise<void> {
        return this.requestOnWorker(
            worker,
            (messageId) => ({ id: messageId, type: 'release_model', payload: { modelId } }),
            'release_model_success',
            'release_model_error',
            'Failed to release model',
            () => undefined
        );
    }

    terminate(): void {
        this.workers.forEach(w => {
            this.rejectAllPendingOnWorker(w, new Error('Worker was terminated'));
            const responseHandler = this.workerResponseHandlers.get(w);
            if (responseHandler) {
                w.removeEventListener('message', responseHandler);
            }
            w.terminate();
        });
        this.workers = [];
        this.isInitialized = false;
        this.pendingWorkerRequests.clear();
        this.workerResponseHandlers.clear();
    }
}

export const bnglWorkerPool = new BnglWorkerPool();
