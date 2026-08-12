import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BNGLModel, WorkerRequest } from '../../types';

class FakeWorker {
  static messages: WorkerRequest[] = [];
  private messageListeners: Array<(event: MessageEvent) => void> = [];

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (type === 'message') this.messageListeners.push(listener);
  }

  postMessage(request: WorkerRequest) {
    FakeWorker.messages.push(request);
    const responseType = request.type === 'cache_model'
      ? 'cache_model_success'
      : request.type === 'release_model'
        ? 'release_model_success'
        : 'simulate_success';
    const payload = request.type === 'cache_model'
      ? { modelId: FakeWorker.messages.filter((message) => message.type === 'cache_model').length }
      : request.type === 'release_model'
        ? request.payload
        : { headers: ['time'], data: [[0]], timePoints: [0] };

    queueMicrotask(() => {
      for (const listener of this.messageListeners) {
        listener({ data: { id: request.id, type: responseType, payload } } as MessageEvent);
      }
    });
  }

  terminate() {}
}

const createModel = (): BNGLModel => ({
  parameters: { k: 1 },
  moleculeTypes: [],
  species: [{ name: 'A()', initialConcentration: 10 }],
  observables: [],
  reactions: [],
  reactionRules: [],
});

describe('BnglService model cache', () => {
  beforeEach(() => {
    vi.resetModules();
    FakeWorker.messages = [];
    vi.stubGlobal('Worker', FakeWorker);
  });

  it('transfers an unchanged model only once across repeated simulations', async () => {
    const { bnglService } = await import('../../services/bnglService');
    const model = createModel();
    const options = { method: 'ode' as const, t_end: 10, n_steps: 10 };

    await bnglService.simulate(model, options);
    await bnglService.simulate(model, options);

    expect(FakeWorker.messages.filter((message) => message.type === 'cache_model')).toHaveLength(1);
    expect(FakeWorker.messages.filter((message) => message.type === 'simulate')).toHaveLength(2);
  });

  it('invalidates the cached transfer when parameters change in place', async () => {
    const { bnglService } = await import('../../services/bnglService');
    const model = createModel();
    const options = { method: 'ode' as const, t_end: 10, n_steps: 10 };

    await bnglService.simulate(model, options);
    model.parameters.k = 2;
    await bnglService.simulate(model, options);

    expect(FakeWorker.messages.filter((message) => message.type === 'cache_model')).toHaveLength(2);
    expect(FakeWorker.messages.some((message) => message.type === 'release_model')).toBe(true);
  });
});
