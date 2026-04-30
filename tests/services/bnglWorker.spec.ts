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
