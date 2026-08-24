import type {
  BNGLModel,
  SimulationOptions,
  SimulationResults,
  WorkerRequest,
  WorkerResponse,
  SerializedWorkerError,
  NetworkGeneratorOptions,
  NetworkAnalysisPayload,
  IgraphAnalysisResult,
} from '../types';

type RequestOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  description?: string;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  cleanup: () => void;
  description?: string;
};

const DEFAULT_TIMEOUT_MS = 300_000;

import { toError } from './workerErrorUtils';

class BnglService {
  private worker!: Worker;
  private messageId = 0;
  private promises = new Map<number, PendingRequest>();
  private ignoredResponseIds = new Set<number>();
  private terminated = false;
  private lastCachedModelId?: number;
  private lastCachedModel?: BNGLModel;
  private lastCachedModelSignature?: string;
  private lastCachedModelPromise?: Promise<number>;
  private modelCacheRequestId = 0;
  private progressListeners = new Set<(payload: any) => void>();
  private warningListeners = new Set<(payload: any) => void>();

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    // Vite needs the URL construction inline so it treats this import as a worker entry.
    this.worker = new Worker(new URL('./bnglWorker.ts', import.meta.url), { type: 'module' });
    this.terminated = false;
    this.messageId = 0;
    this.promises = new Map();
    this.ignoredResponseIds = new Set();
    this.clearModelCache();

    this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const { id, type, payload } = event.data ?? {};

      // Handle progress/warning notifications separately and do not resolve/reject any pending promise
      if (type === 'progress' || type === 'generate_network_progress') {
        const progressPayload = payload ?? {};
        for (const cb of this.progressListeners) {
          try {
            cb(progressPayload);
          } catch (e) {
            console.warn('[BnglService] progress listener error', e);
          }
        }
        if (progressPayload && typeof progressPayload === 'object' && 'warning' in progressPayload) {
          for (const cb of this.warningListeners) {
            try {
              cb(progressPayload);
            } catch (e) {
              console.warn('[BnglService] warning listener error', e);
            }
          }
        }
        return;
      }

      if (type === 'warning') {
        for (const cb of this.warningListeners) {
          try {
            cb(payload);
          } catch (e) {
            console.warn('[BnglService] warning listener error', e);
          }
        }
        return;
      }

      if (type === 'worker_internal_error') {
        const err = toError('worker_internal_error', payload);
        if (err.stack) {
          console.error(`[Worker] ${err.message}\n${err.stack}`);
        } else {
          console.error(`[Worker] ${err.message}`);
        }
        if (typeof id === 'number' && id !== -1 && this.promises.has(id)) {
          const pending = this.promises.get(id)!;
          this.promises.delete(id);
          pending.cleanup();
          pending.reject(err);
          return;
        }
        this.rejectAllPending(err);
        return;
      }

      if (typeof id !== 'number') {
        console.warn('[BnglService] Received response without numeric id:', event.data);
        return;
      }

      if (!this.promises.has(id)) {
        if (this.ignoredResponseIds.has(id)) {
          this.ignoredResponseIds.delete(id);
          return;
        }
        console.warn('[BnglService] Received response for unknown message id:', event.data);
        return;
      }

      const pending = this.promises.get(id)!;
      this.promises.delete(id);
      pending.cleanup();

      if (type === 'parse_success' || type === 'simulate_success' || type === 'generate_network_success' || type === 'atomize_success' || type === 'analyse_network_success') {
        pending.resolve(payload);
        return;
      }
      // handle cache model responses as well
      if (type === 'cache_model_success' || type === 'release_model_success') {
        pending.resolve(payload);
        return;
      }

      if (type === 'parse_error' || type === 'simulate_error' || type === 'cache_model_error' || type === 'release_model_error' || type === 'generate_network_error' || type === 'atomize_error' || type === 'analyse_network_error') {
        const errType = type === 'parse_error' ? 'parse'
          : type === 'simulate_error' ? 'simulate'
          : type === 'atomize_error' ? 'atomize'
          : type === 'generate_network_error' ? 'generate_network'
          : type === 'analyse_network_error' ? 'analyse_network'
          : type === 'release_model_error' ? 'release_model'
          : 'cache_model';
        const err = toError(errType, payload);
        pending.reject(err);
        return;
      }

      console.warn('[BnglService] Received response with unexpected type:', event.data);
      pending.reject(new Error('Unexpected worker response type'));
    });

    this.worker.addEventListener('error', (event) => {
      const baseMessage = event.message || (event.error && event.error.message) || 'unknown error';
      const details = `Worker error: ${baseMessage} at ${event.filename ?? 'unknown file'}:${event.lineno ?? '?'}:${event.colno ?? '?'}`;
      if (event.error && event.error.stack) {
        console.error(details, '\n', event.error.stack);
      } else {
        console.error(details, event);
      }
      this.rejectAllPending(details);
    });

    this.worker.addEventListener('messageerror', (event) => {
      console.error('[BnglService] Worker failed to deserialize message:', event.data);
      this.rejectAllPending('Worker posted an unserializable message');
    });
  }

  public restart() {
    console.warn('[BnglService] Restarting worker...');
    this.terminate('Restarting');
    this.initWorker();
  }

  private sendCancel(targetId: number) {
    if (this.terminated) return;
    try {
      const cancelRequest: WorkerRequest = { id: this.messageId++, type: 'cancel', payload: { targetId } };
      this.worker.postMessage(cancelRequest);
    } catch (error) {
      console.warn('[BnglService] Failed to post cancel message', error);
    }
  }

  private markResponseAsIgnorable(id: number) {
    this.ignoredResponseIds.add(id);
    if (this.ignoredResponseIds.size > 2048) {
      const oldest = this.ignoredResponseIds.values().next().value;
      if (typeof oldest === 'number') {
        this.ignoredResponseIds.delete(oldest);
      }
    }
  }

  private rejectAllPending(reason: string | Error) {
    const err = reason instanceof Error ? reason : new Error(reason);
    this.promises.forEach((pending, requestId) => {
      this.promises.delete(requestId);
      this.markResponseAsIgnorable(requestId);
      pending.cleanup();
      pending.reject(err);
    });
  }

  private postMessage<T>(type: WorkerRequest['type'], payload: WorkerRequest['payload'], options?: RequestOptions): Promise<T> {
    if (this.terminated) {
      return Promise.reject(new Error('Worker has been terminated'));
    }
    const id = this.messageId++;
    return new Promise<T>((resolve, reject) => {
      const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const signal = options?.signal ?? null;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let abortHandler: (() => void) | undefined;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        if (signal && abortHandler) {
          signal.removeEventListener('abort', abortHandler);
          abortHandler = undefined;
        }
      };

      const pending: PendingRequest = {
        resolve: (value) => resolve(value as T),
        reject,
        cleanup,
        description: options?.description,
      };

      this.promises.set(id, pending);

      if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
        timeoutId = setTimeout(() => {
          if (!this.promises.has(id)) {
            return;
          }
          this.promises.delete(id);
          this.markResponseAsIgnorable(id);
          cleanup();
          this.sendCancel(id);
          const timeoutError = new Error(`${options?.description ?? type} timed out after ${timeoutMs} ms`);
          timeoutError.name = 'TimeoutError';
          reject(timeoutError);
        }, timeoutMs);
      }

      if (signal) {
        if (signal.aborted) {
          this.promises.delete(id);
          this.markResponseAsIgnorable(id);
          cleanup();
          this.sendCancel(id);
          reject(new DOMException(signal.reason ?? 'The operation was aborted.', 'AbortError'));
          return;
        }

        abortHandler = () => {
          if (!this.promises.has(id)) {
            return;
          }
          this.promises.delete(id);
          this.markResponseAsIgnorable(id);
          cleanup();
          this.sendCancel(id);
          reject(new DOMException(signal.reason ?? 'The operation was aborted.', 'AbortError'));
        };

        signal.addEventListener('abort', abortHandler);
      }

      let request: WorkerRequest;
      if (type === 'parse') {
        request = { id, type, payload: payload as string };
      } else if (type === 'simulate') {
        // payload may be one of the allowed simulate payload shapes (full model or modelId + overrides)
        request = { id, type, payload: payload as any };
      } else if (type === 'cache_model') {
        request = { id, type, payload: payload as { model: BNGLModel } };
      } else {
        request = { id, type, payload } as WorkerRequest;
      }

      try {
        this.worker.postMessage(request);
      } catch (error) {
        this.promises.delete(id);
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  public terminate(reason?: string) {
    if (this.terminated) return;
    this.terminated = true;
    try {
      this.worker.terminate();
    } catch (error) {
      console.warn('[BnglService] Error terminating worker', error);
    }
    this.clearModelCache();
    this.rejectAllPending(reason ?? 'Worker terminated');
  }

  public cancelAllPending(reason?: string) {
    const cancellation = new DOMException(reason ?? 'Requests cancelled', 'AbortError');
    this.promises.forEach((pending, requestId) => {
      this.promises.delete(requestId);
      this.markResponseAsIgnorable(requestId);
      this.sendCancel(requestId);
      pending.cleanup();
      pending.reject(cancellation);
    });
  }

  public parse(code: string, options?: RequestOptions): Promise<BNGLModel> {
    return this.postMessage<BNGLModel>('parse', code, { ...options, description: options?.description ?? 'Parse request' });
  }

  public simulate(model: BNGLModel, options: SimulationOptions, requestOptions?: RequestOptions): Promise<SimulationResults> {
    return this.prepareModel(model, requestOptions).then((modelId) =>
      this.simulateCached(modelId, undefined, options, requestOptions)
    );
  }

  public atomize(sbmlCode: string, requestOptions?: RequestOptions): Promise<import('../types').AtomizerResult> {
    return this.postMessage<import('../types').AtomizerResult>('atomize', sbmlCode, {
      ...requestOptions,
      description: requestOptions?.description ?? 'Atomize SBML',
    });
  }

  public generateNetwork(model: BNGLModel, options?: NetworkGeneratorOptions, requestOptions?: RequestOptions): Promise<BNGLModel> {
    return this.postMessage<BNGLModel>('generate_network', { model, options }, {
      ...requestOptions,
      description: requestOptions?.description ?? 'Network Generation'
    });
  }

  public analyseNetwork(payload: NetworkAnalysisPayload, requestOptions?: RequestOptions): Promise<IgraphAnalysisResult> {
    return this.postMessage<IgraphAnalysisResult>('analyse_network', payload, {
      ...requestOptions,
      description: requestOptions?.description ?? `Network Analysis (${payload.graphType})`,
    });
  }

  /**
   * Cache a parsed/expanded model in the worker to avoid re-serializing/passing the full model
   * for each simulation run. Returns a numeric modelId that can be used with simulateCached.
   */
  public prepareModel(model: BNGLModel, requestOptions?: RequestOptions): Promise<number> {
    const signature = this.getModelCacheSignature(model);
    if (
      this.lastCachedModel === model
      && this.lastCachedModelSignature === signature
      && this.lastCachedModelPromise
    ) {
      return this.lastCachedModelPromise;
    }

    const previousPromise = this.lastCachedModelPromise;
    const previousId = this.lastCachedModelId;
    const cacheRequestId = ++this.modelCacheRequestId;
    this.lastCachedModel = model;
    this.lastCachedModelSignature = signature;

    const cachePromise = (async () => {
      let modelIdToRelease = previousId;
      if (previousPromise) {
        try {
          modelIdToRelease = await previousPromise;
        } catch {
          modelIdToRelease = undefined;
        }
      }

      if (typeof modelIdToRelease === 'number') {
        try {
          await this.postMessage<{ modelId: number }>(
            'release_model',
            { modelId: modelIdToRelease },
            { description: 'Release cached model' },
          );
        } catch (error) {
          console.warn('[BnglService] Failed to release previous cached model', modelIdToRelease, error);
        }
      }

      const response = await this.postMessage<{ modelId: number }>(
        'cache_model',
        { model },
        { ...requestOptions, description: 'Cache model' },
      );
      const modelId = response.modelId;
      if (this.modelCacheRequestId === cacheRequestId) {
        this.lastCachedModelId = modelId;
      }
      return modelId;
    })().catch((error) => {
      if (this.modelCacheRequestId === cacheRequestId) this.clearModelCache();
      throw error;
    });
    this.lastCachedModelPromise = cachePromise;
    return cachePromise;
  }

  /**
   * Simulate using a cached model id and optional parameter overrides. This sends only the modelId and overrides
   * to the worker (much smaller payload), so repeated runs are cheaper on the main thread.
   */
  public simulateCached(modelId: number, parameterOverrides: Record<string, number> | undefined, options: SimulationOptions, requestOptions?: RequestOptions): Promise<SimulationResults> {
    return this.postMessage<SimulationResults>('simulate', { modelId, parameterOverrides, options }, {
      ...requestOptions,
      description: requestOptions?.description ?? `Simulation (${options.method}) (cached)`,
    });
  }

  /**
   * Release a previously cached model in the worker to free memory.
   */
  public releaseModel(modelId: number, requestOptions?: RequestOptions): Promise<{ modelId: number } | void> {
    if (this.lastCachedModelId === modelId) {
      this.clearModelCache();
    }
    return this.postMessage<{ modelId: number }>('release_model', { modelId }, { ...requestOptions, description: 'Release cached model' });
  }

  private clearModelCache() {
    this.modelCacheRequestId++;
    this.lastCachedModelId = undefined;
    this.lastCachedModel = undefined;
    this.lastCachedModelSignature = undefined;
    this.lastCachedModelPromise = undefined;
  }

  private getModelCacheSignature(model: BNGLModel): string {
    const signature = JSON.stringify(model);
    if (signature === undefined) {
      throw new Error('Unable to serialize model for worker cache validation');
    }
    return signature;
  }

  /**
   * Register a progress listener for long-running worker tasks. Returns an unsubscribe function.
   */
  public onProgress(cb: (payload: any) => void): () => void {
    this.progressListeners.add(cb);
    return () => this.progressListeners.delete(cb);
  }

  /**
   * Register a warning listener for worker warnings. Returns an unsubscribe function.
   */
  public onWarning(cb: (payload: any) => void): () => void {
    this.warningListeners.add(cb);
    return () => this.warningListeners.delete(cb);
  }
}

export const bnglService = new BnglService();
