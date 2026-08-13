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
    BNGLParser: { evaluateExpression: vi.fn() },
    CVODESolver: { cvodeModuleFactory: vi.fn() }
  };
});

describe('mergeSimulationOptionsWithModelActionDefaults', () => {
  it('should not modify options if no model actions exist', async () => {
    const { mergeSimulationOptionsWithModelActionDefaults } = await import('../../services/bnglWorker');
    const options = { method: 'ode' };
    const model = { species: [], parameters: {}, observables: [], reactions: [], reactionRules: [] };
    const result = mergeSimulationOptionsWithModelActionDefaults(options, model, 'ode');
    expect(result).toEqual(options);
  });

  it('should apply defaults from simulate action if they are not set in options', async () => {
    const { mergeSimulationOptionsWithModelActionDefaults } = await import('../../services/bnglWorker');
    const options = { method: 'ode' };
    const model = {
      species: [], parameters: {}, observables: [], reactions: [], reactionRules: [],
      actions: [{ type: 'simulate', args: { method: 'ode', t_end: 100, n_steps: 50, seed: 123 } }]
    };
    const result = mergeSimulationOptionsWithModelActionDefaults(options, model, 'ode');
    expect(result.t_end).toBe(100);
    expect(result.n_steps).toBe(50);
    expect(result.seed).toBe(123);
  });

  it('should not override options that are already set', async () => {
    const { mergeSimulationOptionsWithModelActionDefaults } = await import('../../services/bnglWorker');
    const options = { method: 'ode', t_end: 200, n_steps: 10 };
    const model = {
      species: [], parameters: {}, observables: [], reactions: [], reactionRules: [],
      actions: [{ type: 'simulate', args: { method: 'ode', t_end: 100, n_steps: 50 } }]
    };
    const result = mergeSimulationOptionsWithModelActionDefaults(options, model, 'ode');
    expect(result.t_end).toBe(200);
    expect(result.n_steps).toBe(10);
  });

  it('should use simulate_method action if available', async () => {
    const { mergeSimulationOptionsWithModelActionDefaults } = await import('../../services/bnglWorker');
    const options = { method: 'nf' };
    const model = {
      species: [], parameters: {}, observables: [], reactions: [], reactionRules: [],
      actions: [{ type: 'simulate_nf', args: { t_end: 50, n_steps: 25, utl: 3, gml: 100000, equilibrate: 10 } }]
    };
    const result = mergeSimulationOptionsWithModelActionDefaults(options, model, 'nf');
    expect(result.t_end).toBe(50);
    expect(result.n_steps).toBe(25);
    expect(result.utl).toBe(3);
    expect(result.gml).toBe(100000);
    expect(result.equilibrate).toBe(10);
  });
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

describe('bnglWorker simulation queue', () => {
  let mockPostMessage: ReturnType<typeof vi.fn>;
  let mockAddEventListener: ReturnType<typeof vi.fn>;
  let messageListener: (event: unknown) => Promise<void>;
  let originalConsoleLog: typeof console.log;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;
  let originalConsoleDebug: typeof console.debug;

  const model = {
    parameters: {},
    moleculeTypes: [],
    species: [],
    observables: [],
    reactions: [{}],
    reactionRules: [],
  };
  const options = { method: 'ssa' as const, t_end: 1, n_steps: 1 };
  const result = { headers: ['time'], data: [{ time: 0 }] };

  const sendSimulation = async (id: number) => {
    await messageListener({
      origin: '',
      data: { id, type: 'simulate', payload: { model, options: { ...options } } },
    });
  };

  const sendCancel = async (requestId: number, targetId: number) => {
    await messageListener({
      origin: '',
      data: { id: requestId, type: 'cancel', payload: { targetId } },
    });
  };

  const terminalMessages = () => mockPostMessage.mock.calls
    .map((call) => call[0])
    .filter((message) => message?.type === 'simulate_success' || message?.type === 'simulate_error');

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPostMessage = vi.fn();
    mockAddEventListener = vi.fn();
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    originalConsoleDebug = console.debug;
    (global as any).self = {
      postMessage: mockPostMessage,
      addEventListener: mockAddEventListener,
      location: { origin: '' },
    };

    await import('../../services/bnglWorker');
    messageListener = mockAddEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.debug = originalConsoleDebug;
    vi.clearAllMocks();
    delete (global as any).self;
  });

  it('runs simulations one at a time and preserves progress and terminal ids', async () => {
    const engine = await import('@bngplayground/engine');
    let resolveFirst!: (value: typeof result) => void;
    const firstResult = new Promise<typeof result>((resolve) => {
      resolveFirst = resolve;
    });

    vi.mocked(engine.simulate).mockImplementation(async (jobId, _model, _options, callbacks) => {
      callbacks.postMessage({ type: 'progress', payload: { jobId } });
      return jobId === 101 ? await firstResult : result;
    });

    await sendSimulation(101);
    await sendSimulation(102);

    expect(engine.simulate).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      id: 101,
      type: 'progress',
      payload: { jobId: 101 },
    }));
    expect(mockPostMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      id: 102,
      type: 'progress',
    }));

    resolveFirst(result);
    await vi.waitFor(() => expect(engine.simulate).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(terminalMessages()).toHaveLength(2));

    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      id: 102,
      type: 'progress',
      payload: { jobId: 102 },
    }));
    expect(terminalMessages().map(({ id, type }) => ({ id, type }))).toEqual([
      { id: 101, type: 'simulate_success' },
      { id: 102, type: 'simulate_success' },
    ]);
  });

  it('continues with the next simulation after a rejection', async () => {
    const engine = await import('@bngplayground/engine');
    vi.mocked(engine.simulate)
      .mockRejectedValueOnce(new Error('first simulation failed'))
      .mockResolvedValueOnce(result as any);

    await sendSimulation(201);
    await sendSimulation(202);

    await vi.waitFor(() => expect(terminalMessages()).toHaveLength(2));
    expect(engine.simulate).toHaveBeenCalledTimes(2);
    expect(terminalMessages().map(({ id, type }) => ({ id, type }))).toEqual([
      { id: 201, type: 'simulate_error' },
      { id: 202, type: 'simulate_success' },
    ]);
    expect(terminalMessages()[0].payload).toEqual(expect.objectContaining({
      message: 'first simulation failed',
    }));
  });

  it('continues after cancelling the active simulation', async () => {
    const engine = await import('@bngplayground/engine');
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    vi.mocked(engine.simulate)
      .mockImplementationOnce(async (_jobId, _model, _options, callbacks) => {
        await firstGate;
        callbacks.checkCancelled();
        return result as any;
      })
      .mockResolvedValueOnce(result as any);

    await sendSimulation(301);
    await sendSimulation(302);
    await sendCancel(9001, 301);
    releaseFirst();

    await vi.waitFor(() => expect(terminalMessages()).toHaveLength(2));
    expect(engine.simulate).toHaveBeenCalledTimes(2);
    expect(terminalMessages().map(({ id, type }) => ({ id, type }))).toEqual([
      { id: 301, type: 'simulate_error' },
      { id: 302, type: 'simulate_success' },
    ]);
    expect(terminalMessages()[0].payload).toEqual(expect.objectContaining({ name: 'AbortError' }));
  });

  it('skips a cancelled queued simulation without blocking later work', async () => {
    const engine = await import('@bngplayground/engine');
    let resolveFirst!: (value: typeof result) => void;
    const firstResult = new Promise<typeof result>((resolve) => {
      resolveFirst = resolve;
    });

    vi.mocked(engine.simulate)
      .mockImplementationOnce(async () => await firstResult)
      .mockResolvedValueOnce(result as any);

    await sendSimulation(401);
    await sendSimulation(402);
    await sendSimulation(403);
    await sendCancel(9002, 402);
    resolveFirst(result);

    await vi.waitFor(() => expect(terminalMessages()).toHaveLength(3));
    expect(engine.simulate).toHaveBeenCalledTimes(2);
    expect(terminalMessages().map(({ id, type }) => ({ id, type }))).toEqual([
      { id: 401, type: 'simulate_success' },
      { id: 402, type: 'simulate_error' },
      { id: 403, type: 'simulate_success' },
    ]);
    expect(terminalMessages()[1].payload).toEqual(expect.objectContaining({ name: 'AbortError' }));
  });
});

describe('bnglWorker cached network expansion', () => {
  let mockPostMessage: ReturnType<typeof vi.fn>;
  let mockAddEventListener: ReturnType<typeof vi.fn>;
  let messageListener: (event: unknown) => Promise<void>;
  let originalConsoleLog: typeof console.log;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;
  let originalConsoleDebug: typeof console.debug;

  const sourceModel = (k = 1) => ({
    parameters: { k },
    moleculeTypes: [],
    species: [{ name: 'A()', initialConcentration: 10 }],
    observables: [],
    reactions: [],
    reactionRules: [{
      name: 'decay', reactants: ['A()'], products: [], rate: 'k',
      isBidirectional: false, type: 'reaction',
    }],
  });

  const expandedModel = (model: ReturnType<typeof sourceModel>) => ({
    ...model,
    reactions: [{ reactants: ['A()'], products: [], rate: 'k', rateConstant: model.parameters.k }],
  });

  const sendAndWait = async (id: number, type: string, payload: unknown, terminalType: string) => {
    await messageListener({ origin: '', data: { id, type, payload } });
    await vi.waitFor(() => {
      expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ id, type: terminalType }));
    });
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPostMessage = vi.fn();
    mockAddEventListener = vi.fn();
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    originalConsoleDebug = console.debug;
    (global as any).self = {
      postMessage: mockPostMessage,
      addEventListener: mockAddEventListener,
      location: { origin: '' },
    };

    const engine = await import('@bngplayground/engine');
    vi.mocked(engine.loadEvaluator).mockResolvedValue(undefined as never);
    vi.mocked(engine.generateExpandedNetwork).mockImplementation(async (model: any) => expandedModel(model));
    vi.mocked(engine.simulate).mockResolvedValue({ headers: ['time'], data: [{ time: 0 }] } as any);

    await import('../../services/bnglWorker');
    messageListener = mockAddEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.debug = originalConsoleDebug;
    vi.clearAllMocks();
    delete (global as any).self;
  });

  it('generates a cached base network once across repeated simulations', async () => {
    const engine = await import('@bngplayground/engine');
    await sendAndWait(1, 'cache_model', { model: sourceModel() }, 'cache_model_success');
    await sendAndWait(2, 'simulate', { modelId: 1, options: { method: 'ssa', t_end: 1, n_steps: 1 } }, 'simulate_success');
    await sendAndWait(3, 'simulate', { modelId: 1, parameterOverrides: {}, options: { method: 'ssa', t_end: 1, n_steps: 1 } }, 'simulate_success');

    expect(engine.generateExpandedNetwork).toHaveBeenCalledTimes(1);
    expect(engine.simulate).toHaveBeenCalledTimes(2);
    expect((vi.mocked(engine.simulate).mock.calls[1][1] as any).reactions).toHaveLength(1);
  });

  it('regenerates override variants without poisoning the cached baseline', async () => {
    const engine = await import('@bngplayground/engine');
    await sendAndWait(10, 'cache_model', { model: sourceModel() }, 'cache_model_success');
    await sendAndWait(11, 'simulate', { modelId: 1, options: { method: 'ssa', t_end: 1, n_steps: 1 } }, 'simulate_success');
    await sendAndWait(12, 'simulate', { modelId: 1, parameterOverrides: { k: 2 }, options: { method: 'ssa', t_end: 1, n_steps: 1 } }, 'simulate_success');
    await sendAndWait(13, 'simulate', { modelId: 1, options: { method: 'ssa', t_end: 1, n_steps: 1 } }, 'simulate_success');

    expect(engine.generateExpandedNetwork).toHaveBeenCalledTimes(2);
    expect((vi.mocked(engine.generateExpandedNetwork).mock.calls[1][0] as any).parameters.k).toBe(2);
    expect((vi.mocked(engine.simulate).mock.calls[2][1] as any).parameters.k).toBe(1);
  });

  it('applies initial-expression parameter overrides before regeneration', async () => {
    const engine = await import('@bngplayground/engine');
    vi.mocked(engine.BNGLParser.evaluateExpression).mockImplementation((expr: string, params: Map<string, number>) => {
      if (expr === 'A0') return params.get('A0') ?? 0;
      return Number(expr);
    });
    const model = sourceModel();
    model.parameters = { ...model.parameters, A0: 100 };
    model.species = [{ name: 'A()', initialConcentration: 100, initialExpression: 'A0' }];

    await sendAndWait(14, 'cache_model', { model }, 'cache_model_success');
    await sendAndWait(15, 'simulate', { modelId: 1, parameterOverrides: { A0: 110 }, options: { method: 'ssa', t_end: 1, n_steps: 1 } }, 'simulate_success');

    const regenerated = vi.mocked(engine.generateExpandedNetwork).mock.calls[0][0] as any;
    expect(regenerated.parameters.A0).toBe(110);
    expect(regenerated.species[0].initialConcentration).toBeCloseTo(110);
  });

  it('keeps pure NFsim runs on the original seed model after warming the expanded cache', async () => {
    const engine = await import('@bngplayground/engine');
    await sendAndWait(16, 'cache_model', { model: sourceModel() }, 'cache_model_success');
    await sendAndWait(17, 'simulate', { modelId: 1, options: { method: 'ssa', t_end: 1, n_steps: 1 } }, 'simulate_success');
    await sendAndWait(18, 'simulate', { modelId: 1, options: { method: 'nf', t_end: 1, n_steps: 1 } }, 'simulate_success');

    expect(engine.generateExpandedNetwork).toHaveBeenCalledTimes(1);
    expect(engine.runNFsimSimulation).toHaveBeenCalledTimes(1);
    const nfModel = vi.mocked(engine.runNFsimSimulation).mock.calls[0][0] as any;
    expect(nfModel.reactions).toHaveLength(0);
    expect(nfModel.species).toHaveLength(1);
  });

  it('forwards lean result options to pure NFsim runs', async () => {
    const engine = await import('@bngplayground/engine');
    await sendAndWait(19, 'simulate', {
      model: sourceModel(),
      options: {
        method: 'nf',
        t_end: 1,
        n_steps: 1,
        includeSpeciesData: false,
        includeExpandedNetwork: false,
      },
    }, 'simulate_success');

    expect(engine.runNFsimSimulation).toHaveBeenCalledTimes(1);
    expect(vi.mocked(engine.runNFsimSimulation).mock.calls[0][1]).toEqual(expect.objectContaining({
      includeSpeciesData: false,
      includeExpandedNetwork: false,
    }));
  });

  it('removes the expanded network when its model is released', async () => {
    const engine = await import('@bngplayground/engine');
    await sendAndWait(20, 'cache_model', { model: sourceModel() }, 'cache_model_success');
    await sendAndWait(21, 'simulate', { modelId: 1, options: { method: 'ssa', t_end: 1, n_steps: 1 } }, 'simulate_success');
    await sendAndWait(22, 'release_model', { modelId: 1 }, 'release_model_success');
    await sendAndWait(23, 'simulate', { modelId: 1, options: { method: 'ssa', t_end: 1, n_steps: 1 } }, 'simulate_error');

    expect(engine.generateExpandedNetwork).toHaveBeenCalledTimes(1);
    expect(engine.simulate).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      id: 23,
      type: 'simulate_error',
      payload: expect.objectContaining({ message: 'Cached model not found in worker' }),
    }));
  });

  it('evicts the least-recently-used expanded network independently of source models', async () => {
    const engine = await import('@bngplayground/engine');
    await sendAndWait(30, 'cache_model', { model: sourceModel(1) }, 'cache_model_success');
    await sendAndWait(31, 'cache_model', { model: sourceModel(2) }, 'cache_model_success');
    await sendAndWait(32, 'cache_model', { model: sourceModel(3) }, 'cache_model_success');

    await sendAndWait(33, 'simulate', { modelId: 1, options: { method: 'ssa', t_end: 1, n_steps: 1 } }, 'simulate_success');
    await sendAndWait(34, 'simulate', { modelId: 2, options: { method: 'ssa', t_end: 1, n_steps: 1 } }, 'simulate_success');
    await sendAndWait(35, 'simulate', { modelId: 1, options: { method: 'ssa', t_end: 1, n_steps: 1 } }, 'simulate_success');
    await sendAndWait(36, 'simulate', { modelId: 3, options: { method: 'ssa', t_end: 1, n_steps: 1 } }, 'simulate_success');
    expect(engine.generateExpandedNetwork).toHaveBeenCalledTimes(3);

    await sendAndWait(37, 'simulate', { modelId: 1, options: { method: 'ssa', t_end: 1, n_steps: 1 } }, 'simulate_success');
    expect(engine.generateExpandedNetwork).toHaveBeenCalledTimes(3);

    await sendAndWait(38, 'simulate', { modelId: 2, options: { method: 'ssa', t_end: 1, n_steps: 1 } }, 'simulate_success');
    expect(engine.generateExpandedNetwork).toHaveBeenCalledTimes(4);
  });

  it('does not treat an empty generated network as reusable expansion state', async () => {
    const engine = await import('@bngplayground/engine');
    vi.mocked(engine.generateExpandedNetwork).mockImplementation(async (model: any) => ({
      ...model,
      reactions: [],
    }));
    await sendAndWait(40, 'cache_model', { model: sourceModel() }, 'cache_model_success');
    await sendAndWait(41, 'simulate', { modelId: 1, options: { method: 'ssa', t_end: 1, n_steps: 1 } }, 'simulate_success');
    await sendAndWait(42, 'simulate', { modelId: 1, options: { method: 'ssa', t_end: 1, n_steps: 1 } }, 'simulate_success');

    expect(engine.generateExpandedNetwork).toHaveBeenCalledTimes(2);
  });
});
