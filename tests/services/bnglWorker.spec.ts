import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@bngplayground/engine', () => {
  return {
    generateExpandedNetwork: vi.fn(),
    simulate: vi.fn(),
    resolveCompartmentVolumes: vi.fn(),
    requiresCompartmentResolution: vi.fn(),
    runNFsimSimulation: vi.fn(async () => {
      return { data: [], headers: [] };
    }),
    validateModelForNFsim: vi.fn(() => ({ valid: true, warnings: [], errors: [] })),
    getCacheSizes: vi.fn(),
    loadEvaluator: vi.fn(),
    parseBNGLWithANTLR: vi.fn(),
    CVODESolver: { cvodeModuleFactory: vi.fn() }
  };
});

describe('bnglWorker logging error handling', () => {
  let mockPostMessage: any;
  let mockAddEventListener: any;
  let originalConsoleLog: any;
  let originalConsoleWarn: any;
  let originalConsoleError: any;
  let originalConsoleDebug: any;

  beforeEach(async () => {
    vi.resetModules();
    mockPostMessage = vi.fn();
    mockAddEventListener = vi.fn();
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    originalConsoleDebug = console.debug;
    (global as any).self = {
      postMessage: mockPostMessage,
      addEventListener: mockAddEventListener,
      location: { origin: '' }
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.debug = originalConsoleDebug;
    vi.clearAllMocks();
    delete (global as any).self;
  });

  it('should parse NFsim simulation time and post progress', async () => {
    await import('../../services/bnglWorker');

    // We need to trigger the message handler to set activeSimulationJobId and activeSimulationMethod
    const messageListener = mockAddEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];

    const simulatePromise = messageListener({
      origin: '',
      data: {
        id: 42,
        type: 'simulate',
        payload: {
          model: {
            species: [], parameters: {}, observables: [], reactions: [], reactionRules: [],
            simulationPhases: [{ method: 'nf' }]
          },
          options: { method: 'nf', t_end: 10, n_steps: 10 }
        }
      }
    });

    console.log('Sim time: 5.0');

    await simulatePromise;

    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'progress',
      payload: expect.objectContaining({
        simulationTime: 5,
        source: 'nfsim-console'
      })
    }));
  });

  it('should swallow errors gracefully if ctx.postMessage throws during log parsing', async () => {
    await import('../../services/bnglWorker');

    // We need to trigger the message handler to set activeSimulationJobId and activeSimulationMethod
    const messageListener = mockAddEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];

    const simulatePromise = messageListener({
      origin: '',
      data: {
        id: 42,
        type: 'simulate',
        payload: {
          model: {
            species: [], parameters: {}, observables: [], reactions: [], reactionRules: [],
            simulationPhases: [{ method: 'nf' }]
          },
          options: { method: 'nf', t_end: 10, n_steps: 10 }
        }
      }
    });

    // Make ctx.postMessage throw when called with the progress update
    mockPostMessage.mockImplementation((msg: any) => {
      if (msg && msg.type === 'progress' && msg.payload?.source === 'nfsim-console') {
        throw new Error('Simulated postMessage failure');
      }
    });

    // Simulate a console.log that matches the progress regex, while the simulate handler is running
    // This will trigger the `try { ... ctx.postMessage ... } catch { }` block
    console.log('Sim time: 5.0');

    await simulatePromise;

    // Verify postMessage was actually called with the progress
    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'progress',
      payload: expect.objectContaining({
        simulationTime: 5,
        source: 'nfsim-console'
      })
    }));
  });

  it('should ignore NaN simulation times', async () => {
    await import('../../services/bnglWorker');

    // We need to trigger the message handler to set activeSimulationJobId and activeSimulationMethod
    const messageListener = mockAddEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];

    const simulatePromise = messageListener({
      origin: '',
      data: {
        id: 42,
        type: 'simulate',
        payload: {
          model: {
            species: [], parameters: {}, observables: [], reactions: [], reactionRules: [],
            simulationPhases: [{ method: 'nf' }]
          },
          options: { method: 'nf', t_end: 10, n_steps: 10 }
        }
      }
    });

    mockPostMessage.mockClear();

    // Trigger log with invalid number format that bypasses regex matching.
    // The regex is: /(?:^|\b)Sim\s*time\s*[:=]\s*([0-9.eE+-]+)/i
    // We can't really get `Number.isNaN(val)` to be true if it matches `[0-9.eE+-]+`
    // unless it is just "e", "-", "+" or something that isn't a valid number but passes the regex character class.
    console.log('Sim time: -e+'); // Passes regex but Number("-e+") is NaN

    await simulatePromise;

    // It shouldn't post a progress message because val is NaN
    const progressCalls = mockPostMessage.mock.calls.filter((call: any) => call[0]?.type === 'progress' && call[0]?.payload?.source === 'nfsim-console');
    expect(progressCalls.length).toBe(0);
  });
});

describe('bnglWorker - parse message', () => {
  let mockPostMessage: any;
  let mockAddEventListener: any;

  beforeEach(async () => {
    vi.resetModules();
    mockPostMessage = vi.fn();
    mockAddEventListener = vi.fn();
    (global as any).self = {
      postMessage: mockPostMessage,
      addEventListener: mockAddEventListener,
      location: { origin: '' }
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete (global as any).self;
  });

  it('should handle parse message and succeed', async () => {
    const engine = await import('@bngplayground/engine');
    (engine.parseBNGLWithANTLR as any).mockReturnValue({
      model: { some: 'model' },
      success: true,
      errors: []
    });
    (engine.requiresCompartmentResolution as any).mockReturnValue(false);

    await import('../../services/bnglWorker');

    const messageListener = mockAddEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];

    const parsePromise = messageListener({
      origin: '',
      data: {
        id: 42,
        type: 'parse',
        payload: 'begin model\nend model'
      }
    });

    await parsePromise;

    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'parse_success',
      payload: { some: 'model' },
      id: 42
    }));
  });

  it('should handle parse message and fail when model is not returned', async () => {
    const engine = await import('@bngplayground/engine');
    (engine.parseBNGLWithANTLR as any).mockReturnValue({
      model: null,
      success: false,
      errors: [{ line: 1, column: 1, message: 'Syntax error' }]
    });

    await import('../../services/bnglWorker');

    const messageListener = mockAddEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];

    const parsePromise = messageListener({
      origin: '',
      data: {
        id: 42,
        type: 'parse',
        payload: 'invalid model'
      }
    });

    await parsePromise;

    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'parse_error',
      id: 42,
      payload: expect.objectContaining({
        message: expect.stringContaining('BNGL parse error')
      })
    }));
  });

  it('should continue parsing when there are recoverable errors', async () => {
    const engine = await import('@bngplayground/engine');

    // NOTE: in bnglWorker, console.warn is intercepted to add to logBuffer and then call originalConsoleWarn
    // However, our string checking is tricky. Let's just mock the post message, and we know if we got parse_success, we must have continued
    (engine.parseBNGLWithANTLR as any).mockReturnValue({
      model: { some: 'model' },
      success: false,
      errors: [{ line: 1, column: 1, message: 'Recoverable error' }]
    });
    (engine.requiresCompartmentResolution as any).mockReturnValue(false);

    await import('../../services/bnglWorker');

    const messageListener = mockAddEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];

    const parsePromise = messageListener({
      origin: '',
      data: {
        id: 42,
        type: 'parse',
        payload: 'model with recoverable error'
      }
    });

    await parsePromise;

    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'parse_success',
      payload: { some: 'model' },
      id: 42
    }));
  });

  it('should resolve compartments if needed', async () => {
    const engine = await import('@bngplayground/engine');
    (engine.parseBNGLWithANTLR as any).mockReturnValue({
      model: { some: 'model' },
      success: true,
      errors: []
    });
    (engine.requiresCompartmentResolution as any).mockReturnValue(true);
    (engine.resolveCompartmentVolumes as any).mockReturnValue({ some: 'resolved_model' });

    await import('../../services/bnglWorker');

    const messageListener = mockAddEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];

    const parsePromise = messageListener({
      origin: '',
      data: {
        id: 42,
        type: 'parse',
        payload: 'model with compartments'
      }
    });

    await parsePromise;

    expect(engine.resolveCompartmentVolumes).toHaveBeenCalled();
    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'parse_success',
      payload: { some: 'resolved_model' },
      id: 42
    }));
  });
});

describe('bnglWorker - getCacheSizes', () => {
  it('should call getEvaluatorCacheSizes and return its value', async () => {
    // The worker imports getCacheSizes as getEvaluatorCacheSizes from @bngplayground/engine
    const engine = await import('@bngplayground/engine');
    (engine.getCacheSizes as any).mockReturnValue({ evaluatorCache: 123 });

    const worker = await import('../../services/bnglWorker');
    const result = worker.getCacheSizes();

    // We expect the original exported name to have been called
    expect(engine.getCacheSizes).toHaveBeenCalled();
    expect(result).toEqual({ evaluatorCache: 123 });
  });
});
