import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
    BnglWorkerPool,
    createSharedEnsembleResults,
    getSharedEnsembleFeatureVector,
    isSharedEnsembleResultsHandle,
    materializeSharedSimulationResult,
    writeSimulationResultsToShared,
} from '../../services/BnglWorkerPool';
import { mergeSimulationOptionsWithModelActionDefaults } from '../../services/bnglWorker';
import { SimulationResults } from '../../types';

describe('BnglWorkerPool shared ensemble helpers', () => {
    it('writes and materializes shared ensemble runs without copying per-read', () => {
        const shared = createSharedEnsembleResults(2, ['time', 'A', 'B'], 2);

        writeSimulationResultsToShared(shared, 0, {
            headers: ['time', 'A', 'B'],
            data: [
                { time: 0, A: 1, B: 2 },
                { time: 1, A: 3, B: 4 },
            ]
        });

        const run = materializeSharedSimulationResult(shared, 0);
        const featureVector = getSharedEnsembleFeatureVector(shared, 0);

        expect(run.headers).toEqual(['time', 'A', 'B']);
        expect(run.data).toEqual([
            { time: 0, A: 1, B: 2 },
            { time: 1, A: 3, B: 4 },
        ]);
        expect(featureVector).toEqual([0, 1, 2, 1, 3, 4]);
    });

    it('prefers explicit options t_end and n_steps over model action defaults', () => {
        const model = {
            actions: [
                { type: 'simulate_ode', args: { t_end: 50, n_steps: 42 } }
            ],
            simulationPhases: [],
        } as any;

        const explicitOptions = { method: 'ode', t_end: 100, n_steps: 200 } as any;
        const mergedExplicit = mergeSimulationOptionsWithModelActionDefaults(explicitOptions, model, 'ode');

        expect(mergedExplicit.t_end).toBe(100);
        expect(mergedExplicit.n_steps).toBe(200);

        const fallbackOptions = { method: 'ode' } as any;
        const mergedFallback = mergeSimulationOptionsWithModelActionDefaults(fallbackOptions, model, 'ode');

        expect(mergedFallback.t_end).toBe(50);
        expect(mergedFallback.n_steps).toBe(42);
    });

    it('ignores non-numeric optional action args and preserves explicit values', () => {
        const model = {
            actions: [
                { type: 'simulate_ode', args: { utl: 'auto', gml: 'oops', equilibrate: 'bad', eq: 'also_bad', seed: 'nan' } }
            ],
            simulationPhases: [],
        } as any;

        const merged = mergeSimulationOptionsWithModelActionDefaults({ method: 'ode' } as any, model, 'ode');
        expect(merged.utl).toBeUndefined();
        expect(merged.gml).toBeUndefined();
        expect(merged.equilibrate).toBeUndefined();
        expect(merged.seed).toBeUndefined();

        const explicit = mergeSimulationOptionsWithModelActionDefaults(
            { method: 'ode', utl: 3, gml: 4, equilibrate: 5, seed: 6 } as any,
            model,
            'ode'
        );
        expect(explicit.utl).toBe(3);
        expect(explicit.gml).toBe(4);
        expect(explicit.equilibrate).toBe(5);
        expect(explicit.seed).toBe(6);
    });
});

describe('BnglWorkerPool class', () => {
    let mockWorkerInsts: any[] = [];

    beforeEach(() => {
        mockWorkerInsts = [];
        class MockWorker {
            handlers: any[] = [];
            eventHandlers = new Map<string, any[]>();
            addEventListener = vi.fn((event, handler) => {
                const handlers = this.eventHandlers.get(event) ?? [];
                handlers.push(handler);
                this.eventHandlers.set(event, handlers);
                if (event === 'message') this.handlers = handlers;
            });
            removeEventListener = vi.fn((event, handler) => {
                const handlers = (this.eventHandlers.get(event) ?? []).filter(h => h !== handler);
                this.eventHandlers.set(event, handlers);
                if (event === 'message') this.handlers = handlers;
            });
            postMessage = vi.fn();
            terminate = vi.fn();

            trigger(eventData: any) {
                this.handlers.forEach(h => h({ data: eventData }));
            }

            triggerEvent(event: string, eventData: any) {
                (this.eventHandlers.get(event) ?? []).forEach(h => h(eventData));
            }
            constructor() {
                mockWorkerInsts.push(this);
            }
        }
        vi.stubGlobal('Worker', MockWorker);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('initializes the correct number of workers', async () => {
        const pool = new BnglWorkerPool(2);
        await pool.initialize();

        expect(mockWorkerInsts.length).toBe(2);
        pool.terminate();
        expect(mockWorkerInsts[0].terminate).toHaveBeenCalled();
        expect(mockWorkerInsts[1].terminate).toHaveBeenCalled();
    });

    it('successfully simulates a model', async () => {
        const pool = new BnglWorkerPool(1);
        await pool.initialize();

        let resultData: any;
        const simulatePromise = pool.simulate({} as any, {} as any).then(res => resultData = res);

        const worker = mockWorkerInsts[0];

        // Let event loop settle so message is posted
        await new Promise(r => setTimeout(r, 0));

        const postMessageCall = worker.postMessage.mock.calls[0];
        const messageId = postMessageCall[0].id;

        const mockResults: SimulationResults = { headers: ['time', 'A'], data: [{ time: 0, A: 1 }] };
        worker.trigger({ id: messageId, type: 'simulate_success', payload: mockResults });

        await simulatePromise;
        expect(resultData).toEqual(mockResults);
    });

    it('ignores non-terminal progress and generate_network_progress messages without rejecting simulation', async () => {
        const pool = new BnglWorkerPool(1);
        await pool.initialize();

        let resultData: any;
        const simulatePromise = pool.simulate({} as any, {} as any).then(res => resultData = res);

        const worker = mockWorkerInsts[0];
        await new Promise(r => setTimeout(r, 0));

        const postMessageCall = worker.postMessage.mock.calls[0];
        const messageId = postMessageCall[0].id;

        // Emit non-terminal progress and warning messages
        worker.trigger({ id: messageId, type: 'generate_network_progress', payload: { species: 10, reactions: 20, iteration: 1, memoryUsed: 100, timeElapsed: 1 } });
        worker.trigger({ id: messageId, type: 'progress', payload: { progress: 50 } });
        worker.trigger({ id: messageId, type: 'warning', payload: { message: 'test warning' } });

        const mockResults: SimulationResults = { headers: ['time', 'A'], data: [{ time: 0, A: 1 }] };
        worker.trigger({ id: messageId, type: 'simulate_success', payload: mockResults });

        await simulatePromise;
        expect(resultData).toEqual(mockResults);
    });

    it('uses one permanent message listener while dispatching concurrent replies by id', async () => {
        const pool = new BnglWorkerPool(1);
        await pool.initialize();
        const worker = mockWorkerInsts[0];

        const first = pool.simulate({ label: 'first' } as any, {} as any);
        const second = pool.simulate({ label: 'second' } as any, {} as any);
        await Promise.resolve();

        const messageListenerRegistrations = worker.addEventListener.mock.calls
            .filter(([event]: [string]) => event === 'message');
        expect(messageListenerRegistrations).toHaveLength(1);
        expect(worker.handlers).toHaveLength(1);

        const [firstRequest, secondRequest] = worker.postMessage.mock.calls.map(([request]: [any]) => request);
        const firstResult = { headers: [], data: [], marker: 'first' };
        const secondResult = { headers: [], data: [], marker: 'second' };

        // Replies may arrive in any order; the dispatcher must route by ID.
        worker.trigger({ id: secondRequest.id, type: 'simulate_success', payload: secondResult });
        worker.trigger({ id: firstRequest.id, type: 'simulate_success', payload: firstResult });

        await expect(first).resolves.toEqual(firstResult);
        await expect(second).resolves.toEqual(secondResult);
        expect(worker.handlers).toHaveLength(1);
    });

    it('rejects when simulation fails', async () => {
        const pool = new BnglWorkerPool(1);
        await pool.initialize();

        let error: any;
        const simulatePromise = pool.simulate({} as any, {} as any).catch(err => error = err);

        const worker = mockWorkerInsts[0];

        await new Promise(r => setTimeout(r, 0));

        const postMessageCall = worker.postMessage.mock.calls[0];
        const messageId = postMessageCall[0].id;

        worker.trigger({ id: messageId, type: 'simulate_error', payload: { message: 'Worker crashed' } });

        await simulatePromise;
        expect(error).toBeDefined();
        expect(error.message).toBe('Worker crashed');
    });

    it('rejects when worker_internal_error is reported during simulation', async () => {
        const pool = new BnglWorkerPool(1);
        await pool.initialize();

        let error: any;
        const simulatePromise = pool.simulate({} as any, {} as any).catch(err => error = err);

        const worker = mockWorkerInsts[0];

        await new Promise(r => setTimeout(r, 0));

        worker.trigger({ id: -1, type: 'worker_internal_error', payload: { message: 'Fatal out of memory' } });

        await simulatePromise;
        expect(error).toBeDefined();
        expect(error.message).toContain('Worker internal error: Fatal out of memory');
    });

    it('rejects only the matching request for an id-scoped worker_internal_error', async () => {
        const pool = new BnglWorkerPool(1);
        await pool.initialize();

        let firstError: Error | undefined;
        let secondSettled = false;
        const firstPromise = pool.simulate({} as any, {} as any).catch((err) => {
            firstError = err;
        });
        const secondPromise = pool.simulate({} as any, {} as any).then((result) => {
            secondSettled = true;
            return result;
        });

        const worker = mockWorkerInsts[0];
        await new Promise(r => setTimeout(r, 0));
        const firstId = worker.postMessage.mock.calls[0][0].id;
        const secondId = worker.postMessage.mock.calls[1][0].id;

        worker.trigger({
            id: firstId,
            type: 'worker_internal_error',
            payload: { message: 'Unsupported request type' },
        });

        await firstPromise;
        await Promise.resolve();
        expect(firstError?.message).toContain('Unsupported request type');
        expect(secondSettled).toBe(false);

        worker.trigger({
            id: secondId,
            type: 'simulate_success',
            payload: { headers: [], data: [] },
        });
        await expect(secondPromise).resolves.toEqual({ headers: [], data: [] });
    });

    it('retains rich error fields, stack, and location details on worker_internal_error', async () => {
        const pool = new BnglWorkerPool(1);
        await pool.initialize();

        let error: any;
        const simulatePromise = pool.simulate({} as any, {} as any).catch(err => error = err);

        const worker = mockWorkerInsts[0];

        await new Promise(r => setTimeout(r, 0));

        const payload = {
            name: 'RangeError',
            message: 'Out of bound',
            stack: 'RangeError: Out of bound\n  at worker.ts:42:7',
            details: {
                filename: 'test-file.js',
                lineno: 42,
                colno: 7
            }
        };

        worker.trigger({
            id: -1,
            type: 'worker_internal_error',
            payload
        });

        await simulatePromise;
        expect(error).toBeDefined();
        expect(error.name).toBe('RangeError');
        expect(error.message).toContain('test-file.js:42:7');
        expect(error.stack).toContain('worker.ts:42:7');
        expect(error.cause).toEqual(payload);
    });

    it('retains stack traces and custom error names for simulation failures', async () => {
        const pool = new BnglWorkerPool(1);
        await pool.initialize();

        let error: any;
        const simulatePromise = pool.simulate({} as any, {} as any).catch(err => error = err);

        const worker = mockWorkerInsts[0];

        await new Promise(r => setTimeout(r, 0));

        const postMessageCall = worker.postMessage.mock.calls[0];
        const messageId = postMessageCall[0].id;

        worker.trigger({
            id: messageId,
            type: 'simulate_error',
            payload: {
                name: 'StiffnessError',
                message: 'Simulation detected numerical stiffness',
                stack: 'Error: Simulation detected numerical stiffness\n  at runSimulation (bnglWorker.ts:12:34)'
            }
        });

        await simulatePromise;
        expect(error).toBeDefined();
        expect(error.name).toBe('StiffnessError');
        expect(error.message).toBe('Simulation detected numerical stiffness');
        expect(error.stack).toContain('bnglWorker.ts:12:34');
    });

    it('rejects and clears all pending requests after a global worker error', async () => {
        const pool = new BnglWorkerPool(1);
        await pool.initialize();
        const worker = mockWorkerInsts[0];

        const firstError = pool.simulate({} as any, {} as any).catch(error => error);
        const secondError = pool.simulate({} as any, {} as any).catch(error => error);
        await Promise.resolve();

        worker.triggerEvent('error', { message: 'worker process crashed' });

        await expect(firstError).resolves.toMatchObject({ message: 'Worker global error: worker process crashed' });
        await expect(secondError).resolves.toMatchObject({ message: 'Worker global error: worker process crashed' });

        // The pending map was cleared, so the permanent dispatcher can serve a
        // later request without stale callbacks or additional listeners.
        const recovery = pool.simulate({} as any, {} as any);
        await Promise.resolve();
        const recoveryRequest = worker.postMessage.mock.calls.at(-1)[0];
        const recoveryResult = { headers: [], data: [] };
        worker.trigger({ id: recoveryRequest.id, type: 'simulate_success', payload: recoveryResult });

        await expect(recovery).resolves.toEqual(recoveryResult);
        expect(worker.handlers).toHaveLength(1);
    });

    it('runs an ensemble simulation automatically responding', async () => {
        // Redefine the mock to auto-respond
        class AutoResponderWorker {
            handlers: any[] = [];
            addEventListener = vi.fn((event, handler) => {
                if (event === 'message') this.handlers.push(handler);
            });
            removeEventListener = vi.fn((event, handler) => {
                if (event === 'message') {
                    this.handlers = this.handlers.filter(h => h !== handler);
                }
            });
            terminate = vi.fn();
            postMessage = vi.fn((req) => {
                const { id, type } = req;
                setTimeout(() => {
                    if (type === 'cache_model') {
                        this.trigger({ id, type: 'cache_model_success', payload: { modelId: 42 } });
                    } else if (type === 'simulate') {
                        this.trigger({ id, type: 'simulate_success', payload: { headers: ['time'], data: [] } });
                    } else if (type === 'release_model') {
                        this.trigger({ id, type: 'release_model_success' });
                    }
                }, 0);
            });

            trigger(eventData: any) {
                this.handlers.forEach(h => h({ data: eventData }));
            }
            constructor() {
                mockWorkerInsts.push(this);
            }
        }

        vi.stubGlobal('Worker', AutoResponderWorker);

        const pool = new BnglWorkerPool(2);
        const results = await pool.runEnsemble({} as any, {} as any, 1);

        // count: 1 means it returns an array of length 1
        expect(Array.isArray(results)).toBe(true);
        expect(results).toHaveLength(1);
    });

    it('bounds ensembles to one outstanding simulation per worker and preserves seed ordering', async () => {
        let peakConcurrentSimulations = 0;
        let seedZeroCompleted = false;
        const pilotWorkersStartedBeforeSeedZeroCompleted = new Set<number>();
        class ControlledEnsembleWorker {
            handlers: any[] = [];
            outstandingSimulations = 0;
            maxOutstandingSimulations = 0;
            simulateSeeds: number[] = [];
            addEventListener = vi.fn((event, handler) => {
                if (event === 'message') this.handlers.push(handler);
            });
            removeEventListener = vi.fn((event, handler) => {
                if (event === 'message') this.handlers = this.handlers.filter(h => h !== handler);
            });
            terminate = vi.fn();
            postMessage = vi.fn((request) => {
                if (request.type === 'cache_model') {
                    queueMicrotask(() => this.trigger({
                        id: request.id,
                        type: 'cache_model_success',
                        payload: { modelId: mockWorkerInsts.indexOf(this) + 100 },
                    }));
                } else if (request.type === 'simulate') {
                    this.outstandingSimulations++;
                    peakConcurrentSimulations = Math.max(
                        peakConcurrentSimulations,
                        mockWorkerInsts.reduce(
                            (total, worker) => total + worker.outstandingSimulations,
                            0
                        )
                    );
                    this.maxOutstandingSimulations = Math.max(
                        this.maxOutstandingSimulations,
                        this.outstandingSimulations
                    );
                    this.simulateSeeds.push(request.payload.options.seed);
                    const seed = request.payload.options.seed;
                    if (seed < 3 && !seedZeroCompleted) {
                        pilotWorkersStartedBeforeSeedZeroCompleted.add(mockWorkerInsts.indexOf(this));
                    }
                    setTimeout(() => {
                        if (seed === 0) seedZeroCompleted = true;
                        this.outstandingSimulations--;
                        this.trigger({
                            id: request.id,
                            type: 'simulate_success',
                            payload: { headers: ['seed'], data: [{ seed }] },
                        });
                    }, seed % 3);
                } else if (request.type === 'release_model') {
                    queueMicrotask(() => this.trigger({
                        id: request.id,
                        type: 'release_model_success',
                        payload: { modelId: request.payload.modelId },
                    }));
                }
            });

            trigger(eventData: any) {
                this.handlers.forEach(handler => handler({ data: eventData }));
            }

            constructor() {
                mockWorkerInsts.push(this);
            }
        }

        vi.stubGlobal('Worker', ControlledEnsembleWorker);
        vi.stubGlobal('SharedArrayBuffer', undefined);
        const pool = new BnglWorkerPool(3);
        const progress: number[] = [];
        const results = await pool.runEnsemble(
            {} as any,
            {} as any,
            8,
            value => progress.push(value)
        ) as SimulationResults[];
        expect(results.map(run => run.data[0].seed)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(mockWorkerInsts.map(worker => worker.simulateSeeds)).toEqual([
            [0, 3, 6],
            [1, 4, 7],
            [2, 5],
        ]);
        expect(pilotWorkersStartedBeforeSeedZeroCompleted).toEqual(new Set([0, 1, 2]));
        expect(peakConcurrentSimulations).toBe(3);
        expect(mockWorkerInsts.every(worker => worker.maxOutstandingSimulations === 1)).toBe(true);
        expect(progress).toHaveLength(8);
        expect(progress.at(-1)).toBe(8);
        expect(mockWorkerInsts.every(worker => worker.postMessage.mock.calls.some(
            ([request]: [any]) => request.type === 'release_model'
        ))).toBe(true);
    });

    it('preserves bounded scheduling and slot ordering for shared ensemble output', async () => {
        class SharedEnsembleWorker {
            handlers: any[] = [];
            outstandingSimulations = 0;
            maxOutstandingSimulations = 0;
            simulateSeeds: number[] = [];
            addEventListener = vi.fn((event, handler) => {
                if (event === 'message') this.handlers.push(handler);
            });
            removeEventListener = vi.fn((event, handler) => {
                if (event === 'message') this.handlers = this.handlers.filter(h => h !== handler);
            });
            terminate = vi.fn();
            postMessage = vi.fn((request) => {
                const workerIdx = mockWorkerInsts.indexOf(this);
                if (request.type === 'cache_model') {
                    queueMicrotask(() => this.trigger({
                        id: request.id,
                        type: 'cache_model_success',
                        payload: { modelId: workerIdx + 300 },
                    }));
                } else if (request.type === 'simulate') {
                    this.outstandingSimulations++;
                    this.maxOutstandingSimulations = Math.max(
                        this.maxOutstandingSimulations,
                        this.outstandingSimulations
                    );
                    const seed = request.payload.options.seed;
                    this.simulateSeeds.push(seed);
                    setTimeout(() => {
                        this.outstandingSimulations--;
                        const sharedOutput = request.payload.sharedOutput;
                        if (sharedOutput) {
                            const values = new Float64Array(sharedOutput.valuesBuffer);
                            const completion = new Int32Array(sharedOutput.completionBuffer);
                            values[sharedOutput.slot] = seed;
                            Atomics.store(completion, sharedOutput.slot, 1);
                            this.trigger({
                                id: request.id,
                                type: 'simulate_shared_success',
                                payload: { slot: sharedOutput.slot },
                            });
                        } else {
                            this.trigger({
                                id: request.id,
                                type: 'simulate_success',
                                payload: { headers: ['seed'], data: [{ seed }] },
                            });
                        }
                    }, seed % 2);
                } else if (request.type === 'release_model') {
                    queueMicrotask(() => this.trigger({
                        id: request.id,
                        type: 'release_model_success',
                        payload: { modelId: request.payload.modelId },
                    }));
                }
            });

            trigger(eventData: any) {
                this.handlers.forEach(handler => handler({ data: eventData }));
            }

            constructor() {
                mockWorkerInsts.push(this);
            }
        }

        vi.stubGlobal('Worker', SharedEnsembleWorker);
        const pool = new BnglWorkerPool(2);
        const results = await pool.runEnsemble({} as any, {} as any, 5);

        expect(isSharedEnsembleResultsHandle(results)).toBe(true);
        if (!isSharedEnsembleResultsHandle(results)) throw new Error('Expected shared ensemble output');
        expect(Array.from(results.completion)).toEqual([1, 1, 1, 1, 1]);
        expect(Array.from(results.values)).toEqual([0, 1, 2, 3, 4]);
        expect(mockWorkerInsts.map(worker => worker.simulateSeeds)).toEqual([
            [0, 2, 4],
            [1, 3],
        ]);
        expect(mockWorkerInsts.every(worker => worker.maxOutstandingSimulations === 1)).toBe(true);
    });

    it('falls back to ordered ordinary results when the initial wave has mismatched shapes', async () => {
        class ShapeMismatchWorker {
            handlers: any[] = [];
            outstandingSimulations = 0;
            maxOutstandingSimulations = 0;
            simulateRequests: any[] = [];
            addEventListener = vi.fn((event, handler) => {
                if (event === 'message') this.handlers.push(handler);
            });
            removeEventListener = vi.fn((event, handler) => {
                if (event === 'message') this.handlers = this.handlers.filter(h => h !== handler);
            });
            terminate = vi.fn();
            postMessage = vi.fn((request) => {
                const workerIdx = mockWorkerInsts.indexOf(this);
                if (request.type === 'cache_model') {
                    queueMicrotask(() => this.trigger({
                        id: request.id,
                        type: 'cache_model_success',
                        payload: { modelId: workerIdx + 400 },
                    }));
                } else if (request.type === 'simulate') {
                    this.outstandingSimulations++;
                    this.maxOutstandingSimulations = Math.max(
                        this.maxOutstandingSimulations,
                        this.outstandingSimulations
                    );
                    this.simulateRequests.push(request);
                    const seed = request.payload.options.seed;
                    setTimeout(() => {
                        this.outstandingSimulations--;
                        if (request.payload.sharedOutput) {
                            this.trigger({
                                id: request.id,
                                type: 'simulate_error',
                                payload: { message: 'mismatched pilot must not use shared output' },
                            });
                            return;
                        }
                        const mismatched = seed === 1;
                        this.trigger({
                            id: request.id,
                            type: 'simulate_success',
                            payload: {
                                headers: mismatched ? ['seed', 'extra'] : ['seed'],
                                data: [mismatched ? { seed, extra: 1 } : { seed }],
                            },
                        });
                    }, seed % 2);
                } else if (request.type === 'release_model') {
                    queueMicrotask(() => this.trigger({
                        id: request.id,
                        type: 'release_model_success',
                        payload: { modelId: request.payload.modelId },
                    }));
                }
            });

            trigger(eventData: any) {
                this.handlers.forEach(handler => handler({ data: eventData }));
            }

            constructor() {
                mockWorkerInsts.push(this);
            }
        }

        vi.stubGlobal('Worker', ShapeMismatchWorker);
        const pool = new BnglWorkerPool(2);
        const results = await pool.runEnsemble({} as any, {} as any, 5);

        expect(isSharedEnsembleResultsHandle(results)).toBe(false);
        expect(Array.isArray(results)).toBe(true);
        if (!Array.isArray(results)) throw new Error('Expected ordinary ensemble results');
        expect(results.map(run => run.data[0].seed)).toEqual([0, 1, 2, 3, 4]);
        expect(results[1].headers).toEqual(['seed', 'extra']);
        expect(mockWorkerInsts.flatMap(worker => worker.simulateRequests).every(
            (request: any) => request.payload.sharedOutput === undefined
        )).toBe(true);
        expect(mockWorkerInsts.every(worker => worker.maxOutstandingSimulations === 1)).toBe(true);
    });

    it('waits for sibling worker loops and releases every model after an ensemble rejection', async () => {
        class RejectingEnsembleWorker {
            handlers: any[] = [];
            simulateCount = 0;
            activeSimulations = 0;
            releaseWhileActive = false;
            addEventListener = vi.fn((event, handler) => {
                if (event === 'message') this.handlers.push(handler);
            });
            removeEventListener = vi.fn((event, handler) => {
                if (event === 'message') this.handlers = this.handlers.filter(h => h !== handler);
            });
            terminate = vi.fn();
            postMessage = vi.fn((request) => {
                const workerIdx = mockWorkerInsts.indexOf(this);
                if (request.type === 'cache_model') {
                    queueMicrotask(() => this.trigger({
                        id: request.id,
                        type: 'cache_model_success',
                        payload: { modelId: workerIdx + 200 },
                    }));
                } else if (request.type === 'simulate') {
                    this.simulateCount++;
                    this.activeSimulations++;
                    const seed = request.payload.options.seed;
                    setTimeout(() => {
                        this.activeSimulations--;
                        this.trigger(workerIdx === 1 && seed === 1
                            ? { id: request.id, type: 'simulate_error', payload: { message: 'seed one failed' } }
                            : {
                                id: request.id,
                                type: 'simulate_success',
                                payload: { headers: ['seed'], data: [{ seed }] },
                            });
                    }, workerIdx === 0 && seed > 0 ? 10 : 0);
                } else if (request.type === 'release_model') {
                    if (mockWorkerInsts.some(worker => worker.activeSimulations > 0)) {
                        this.releaseWhileActive = true;
                    }
                    queueMicrotask(() => this.trigger({
                        id: request.id,
                        type: 'release_model_success',
                        payload: { modelId: request.payload.modelId },
                    }));
                }
            });

            trigger(eventData: any) {
                this.handlers.forEach(handler => handler({ data: eventData }));
            }

            constructor() {
                mockWorkerInsts.push(this);
            }
        }

        vi.stubGlobal('Worker', RejectingEnsembleWorker);
        vi.stubGlobal('SharedArrayBuffer', undefined);
        const pool = new BnglWorkerPool(2);

        await expect(pool.runEnsemble({} as any, {} as any, 5)).rejects.toThrow('seed one failed');
        expect(mockWorkerInsts.every(worker => worker.postMessage.mock.calls.some(
            ([request]: [any]) => request.type === 'release_model'
        ))).toBe(true);
        expect(mockWorkerInsts.every(worker => worker.releaseWhileActive === false)).toBe(true);
        expect(mockWorkerInsts.every(worker => worker.activeSimulations === 0)).toBe(true);
    });
});
