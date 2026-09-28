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
      : request.type === 'get_prepared_network'
        ? 'get_prepared_network_success'
      : request.type === 'release_model'
        ? 'release_model_success'
        : 'simulate_success';
    const payload = request.type === 'cache_model'
      ? { modelId: FakeWorker.messages.filter((message) => message.type === 'cache_model').length }
      : request.type === 'get_prepared_network'
        ? { species: [{ name: 'A()', initialConcentration: 10 }], reactions: [] }
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

  it('retrieves the worker-prepared network only when requested', async () => {
    const { bnglService } = await import('../../services/bnglService');
    const model = createModel();
    await bnglService.simulate(model, { method: 'ode', t_end: 1, n_steps: 1 });

    const network = await bnglService.getPreparedNetwork({ k: 2 });

    expect(network.species).toHaveLength(1);
    const request = FakeWorker.messages.find((message) => message.type === 'get_prepared_network');
    expect(request?.payload).toEqual({ modelId: 1, parameterOverrides: { k: 2 } });
  });

  it('runs prepared overrides without retransferring the model', async () => {
    const { bnglService } = await import('../../services/bnglService');
    const model = createModel();
    const options = { method: 'ode' as const, t_end: 1, n_steps: 1 };
    await bnglService.simulate(model, options);
    await bnglService.simulatePreparedWithOverrides({ k: 2 }, options);

    expect(FakeWorker.messages.filter((message) => message.type === 'cache_model')).toHaveLength(1);
    const simulateRequests = FakeWorker.messages.filter((message) => message.type === 'simulate');
    expect(simulateRequests).toHaveLength(2);
    expect(simulateRequests[1].payload).toMatchObject({ modelId: 1, parameterOverrides: { k: 2 } });
  });

  it('invalidates the cached transfer when parameters change in place', async () => {
    const { bnglService } = await import('../../services/bnglService');
    const model = createModel();
    const options = { method: 'ode' as const, t_end: 10, n_steps: 10 };

    await bnglService.simulate(model, options);
    model.parameters.k = 2;
    model.cacheRevision = 1;
    await bnglService.simulate(model, options);

    expect(FakeWorker.messages.filter((message) => message.type === 'cache_model')).toHaveLength(2);
    expect(FakeWorker.messages.some((message) => message.type === 'release_model')).toBe(true);
  });

  it('invalidates the cached transfer when non-parameter model data changes in place', async () => {
    const { bnglService } = await import('../../services/bnglService');
    const model = createModel();
    const options = { method: 'ode' as const, t_end: 10, n_steps: 10 };

    await bnglService.simulate(model, options);
    model.observables.push({ type: 'Molecules', name: 'A_total', pattern: 'A()' });
    model.cacheRevision = 1;
    await bnglService.simulate(model, options);

    expect(FakeWorker.messages.filter((message) => message.type === 'cache_model')).toHaveLength(2);
    expect(FakeWorker.messages.filter((message) => message.type === 'release_model')).toHaveLength(1);
  });

  it('serializes overlapping cache replacements without orphaning a model', async () => {
    const { bnglService } = await import('../../services/bnglService');
    const firstModel = createModel();
    const secondModel = createModel();
    secondModel.parameters.k = 2;
    const options = { method: 'ode' as const, t_end: 10, n_steps: 10 };

    await Promise.all([
      bnglService.simulate(firstModel, options),
      bnglService.simulate(secondModel, options),
    ]);

    expect(FakeWorker.messages.map((message) => message.type)).toEqual([
      'cache_model',
      'simulate',
      'release_model',
      'cache_model',
      'simulate',
    ]);
  });
});
