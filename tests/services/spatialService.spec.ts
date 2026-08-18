import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spatialService } from '../../services/spatialService';
import type { SpatialWorkerResponse } from '../../services/spatialWorker';

describe('spatialService', () => {
  let mockWorker: any;

  beforeEach(() => {
    mockWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };
    const MockWorker = class {
      postMessage = mockWorker.postMessage;
      terminate = mockWorker.terminate;
      set onmessage(fn: any) { mockWorker.onmessage = fn; }
      set onerror(fn: any) { mockWorker.onerror = fn; }
    };
    vi.stubGlobal('Worker', MockWorker);
  });

  afterEach(() => {
    spatialService.terminate();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('is exported as a singleton', () => {
    expect(spatialService).toBeDefined();
    expect(spatialService.getState()).toBe('idle');
  });

  it('initializes worker, sets state, and posts init message', async () => {
    const bnglText = 'begin model...';
    const config = { timeLimit: 10 } as any;
    const onStateChange = vi.fn();

    await spatialService.init(bnglText, config, { onStateChange });

    expect(spatialService.getState()).toBe('initializing');
    expect(onStateChange).toHaveBeenCalledWith('initializing');

    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      type: 'init',
      bnglText,
      config,
    });
  });

  it('handles worker initialized message and calls run automatically', async () => {
    const onInitialized = vi.fn();
    const onStateChange = vi.fn();

    await spatialService.init('', {}, { onInitialized, onStateChange });

    // Simulate worker sending 'initialized'
    const response: SpatialWorkerResponse = {
      type: 'initialized',
      geometries: [],
      speciesNames: {}
    };
    mockWorker.onmessage({ data: response });

    expect(onInitialized).toHaveBeenCalledWith({ geometries: [], speciesNames: {} });
    expect(spatialService.getState()).toBe('running');
    expect(onStateChange).toHaveBeenCalledWith('running');
    expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'run' });
  });

  it('handles worker snapshot message', async () => {
    const onSnapshot = vi.fn();
    await spatialService.init('', {}, { onSnapshot });

    const snapshot = { positions: new Float32Array() } as any;
    mockWorker.onmessage({ data: { type: 'snapshot', snapshot } });

    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('handles worker progress message', async () => {
    const onProgress = vi.fn();
    await spatialService.init('', {}, { onProgress });

    mockWorker.onmessage({ data: { type: 'progress', step: 5, totalSteps: 10, time: 0.5 } });

    expect(onProgress).toHaveBeenCalledWith(5, 10, 0.5);
  });

  it('handles worker complete message', async () => {
    const onComplete = vi.fn();
    const onStateChange = vi.fn();
    await spatialService.init('', {}, { onComplete, onStateChange });

    const result = { finalTime: 1.0 } as any;
    mockWorker.onmessage({ data: { type: 'complete', result } });

    expect(onComplete).toHaveBeenCalledWith(result);
    expect(spatialService.getState()).toBe('complete');
    expect(onStateChange).toHaveBeenCalledWith('complete');
  });

  it('handles worker error message', async () => {
    const onError = vi.fn();
    const onStateChange = vi.fn();
    await spatialService.init('', {}, { onError, onStateChange });

    mockWorker.onmessage({ data: { type: 'error', message: 'test error' } });

    expect(onError).toHaveBeenCalledWith('test error');
    expect(spatialService.getState()).toBe('error');
    expect(onStateChange).toHaveBeenCalledWith('error');
  });

  it('handles unhandled worker response type without silently dropping it', async () => {
    const onError = vi.fn();
    const onStateChange = vi.fn();
    await spatialService.init('', {}, { onError, onStateChange });

    mockWorker.onmessage({ data: { type: 'unknown_type' as any, message: 'Custom unknown message' } });

    expect(onError).toHaveBeenCalledWith('Custom unknown message');
    expect(spatialService.getState()).toBe('error');
    expect(onStateChange).toHaveBeenCalledWith('error');
  });

  it('handles worker native onerror event', async () => {
    const onError = vi.fn();
    const onStateChange = vi.fn();
    await spatialService.init('', {}, { onError, onStateChange });

    mockWorker.onerror(new Error('native error'));

    expect(onError).toHaveBeenCalledWith('native error');
    expect(spatialService.getState()).toBe('error');
  });

  it('cancels simulation with worker', async () => {
    await spatialService.init('', {}, {});
    spatialService.cancel();

    expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'cancel' });
    expect(spatialService.getState()).toBe('idle');
  });

  it('cancels simulation without worker', () => {
    // By default tests call terminate() in afterEach, so worker is null
    spatialService.cancel();
    expect(mockWorker.postMessage).not.toHaveBeenCalled();
    expect(spatialService.getState()).toBe('idle');
  });

  it('terminates simulation', async () => {
    await spatialService.init('', {}, {});
    spatialService.terminate();

    expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'destroy' });
    expect(mockWorker.terminate).toHaveBeenCalled();
    expect(spatialService.getState()).toBe('idle');
  });

  it('warns when run is called without initialization', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    spatialService.run();
    expect(consoleSpy).toHaveBeenCalledWith('SpatialService: No worker available');
    consoleSpy.mockRestore();
  });

  it('warns when run is called and worker is not initializing or running', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await spatialService.init('', {}, {});

    // Set state to 'idle' directly via cancel to test this condition
    spatialService.cancel();

    // Now state is idle but worker exists
    spatialService.run();
    expect(consoleSpy).toHaveBeenCalledWith('SpatialService: Not initialized, call init() first');

    // Change state artificially by mocking internal setState (or trigger complete)
    mockWorker.onmessage({ data: { type: 'complete', result: {} as any } });

    spatialService.run();
    expect(consoleSpy).toHaveBeenCalledWith('SpatialService: Cannot run, state is', 'complete');

    consoleSpy.mockRestore();
  });

  it('does not crash if callbacks are undefined', async () => {
    // Should not throw when initialized with no callbacks and worker sends messages
    await spatialService.init('', {}, {});

    expect(() => {
      mockWorker.onmessage({ data: { type: 'initialized', geometries: [], speciesNames: {} } });
      mockWorker.onmessage({ data: { type: 'snapshot', snapshot: {} } });
      mockWorker.onmessage({ data: { type: 'progress', step: 1, totalSteps: 2, time: 0.1 } });
      mockWorker.onmessage({ data: { type: 'complete', result: {} } });
    }).not.toThrow();

    await spatialService.init('', {}, {});
    expect(() => {
      mockWorker.onmessage({ data: { type: 'error', message: 'err' } });
    }).not.toThrow();

    await spatialService.init('', {}, {});
    expect(() => {
      mockWorker.onerror(new Error('err'));
    }).not.toThrow();
  });
});
