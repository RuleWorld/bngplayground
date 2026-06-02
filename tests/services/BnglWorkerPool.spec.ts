import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
    BnglWorkerPool,
    createSharedEnsembleResults,
    getSharedEnsembleFeatureVector,
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
            addEventListener = vi.fn((event, handler) => {
                if (event === 'message') this.handlers.push(handler);
            });
            removeEventListener = vi.fn((event, handler) => {
                if (event === 'message') {
                    this.handlers = this.handlers.filter(h => h !== handler);
                }
            });
            postMessage = vi.fn();
            terminate = vi.fn();

            trigger(eventData: any) {
                this.handlers.forEach(h => h({ data: eventData }));
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
});
