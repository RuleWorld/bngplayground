import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@bngplayground/engine', () => ({
  multiscaleSimulation: vi.fn(),
  parseMultiscaleModel: vi.fn(),
  CVODESolver: { cvodeModuleFactory: null },
}));

describe('multiscaleWorker message handling', () => {
  let mockPostMessage: ReturnType<typeof vi.fn>;
  let originalPostMessage: any;
  let originalSelf: any;

  beforeEach(() => {
    originalPostMessage = (globalThis as any).postMessage;
    originalSelf = (globalThis as any).self;
    mockPostMessage = vi.fn();
    (globalThis as any).postMessage = mockPostMessage;
    (globalThis as any).self = globalThis;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalPostMessage !== undefined) {
      (globalThis as any).postMessage = originalPostMessage;
    } else {
      delete (globalThis as any).postMessage;
    }
    if (originalSelf !== undefined) {
      (globalThis as any).self = originalSelf;
    } else {
      delete (globalThis as any).self;
    }
  });

  it('posts an error response when receiving null or non-object message', async () => {
    await import('../../services/multiscaleWorker');
    const onmessage = (globalThis as any).self.onmessage;
    expect(typeof onmessage).toBe('function');

    onmessage({ data: null, origin: '' } as MessageEvent);

    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'error',
      message: 'MultiscaleWorker received null, undefined, or non-object message',
    });
  });

  it('posts an error response when receiving an unrecognized message type', async () => {
    await import('../../services/multiscaleWorker');
    const onmessage = (globalThis as any).self.onmessage;

    onmessage({ data: { type: 'unknown_action' }, origin: '' } as MessageEvent);

    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'error',
      message: 'MultiscaleWorker received unrecognized message type: unknown_action',
    });
  });
});
