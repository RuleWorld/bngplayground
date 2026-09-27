/**
 * multiscaleWorker.ts — Web Worker for multiscale simulation.
 *
 * Runs multiscaleSimulation in a dedicated thread with cooperative
 * cancellation and throttled progress reporting.
 */

import { multiscaleSimulation, parseMultiscaleModel, CVODESolver } from '@bngplayground/engine';
import type { MultiscaleConfig, MultiscaleResult, MultiscaleModelDefinition } from '@bngplayground/engine';

// Wire up the CVODE factory
CVODESolver.cvodeModuleFactory = () =>
  import('./cvode_loader.js').then((m: { default?: unknown }) => (m.default ?? m) as never);

/** Messages from main thread -> worker */
export type MultiscaleWorkerRequest =
  | { type: 'run'; config: MultiscaleConfig }
  | { type: 'run_from_definition'; definition: MultiscaleModelDefinition }
  | { type: 'cancel' };

/** Messages from worker -> main thread */
export type MultiscaleWorkerResponse =
  | { type: 'progress'; fraction: number }
  | { type: 'complete'; result: MultiscaleResult }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('error', (event: ErrorEvent) => {
    try {
      const response: MultiscaleWorkerResponse = {
        type: 'error',
        message: event.message || 'Multiscale worker encountered an unhandled error',
      };
      self.postMessage(response);
    } catch {
      // Best-effort message post
    }
  });

  self.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    try {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      const response: MultiscaleWorkerResponse = {
        type: 'error',
        message: `Multiscale worker unhandled promise rejection: ${message}`,
      };
      self.postMessage(response);
    } catch {
      // Best-effort message post
    }
  });

  self.addEventListener('messageerror', () => {
    try {
      const response: MultiscaleWorkerResponse = {
        type: 'error',
        message: 'Multiscale worker failed to deserialize incoming message',
      };
      self.postMessage(response);
    } catch {
      // Best-effort message post
    }
  });
}

let cancelled = false;
let currentRunId = 0;

self.onmessage = (event: MessageEvent<MultiscaleWorkerRequest>) => {
  const origin = (event as MessageEvent).origin;
  const expectedOrigin = typeof self.location?.origin === 'string' ? self.location.origin : '';
  if (typeof origin === 'string' && origin.length > 0 && expectedOrigin.length > 0 && origin !== expectedOrigin) {
    return;
  }

  const msg = event.data;
  if (!msg || typeof msg !== 'object') {
    const response: MultiscaleWorkerResponse = {
      type: 'error',
      message: 'MultiscaleWorker received null, undefined, or non-object message',
    };
    self.postMessage(response);
    return;
  }

  try {
    switch (msg.type) {
      case 'run': {
        cancelled = false;
        currentRunId++;
        const runId = currentRunId;
        void runSimulation(msg.config, runId);
        break;
      }

      case 'run_from_definition': {
        cancelled = false;
        currentRunId++;
        const runId = currentRunId;
        const config = parseMultiscaleModel(msg.definition);
        void runSimulation(config, runId);
        break;
      }

      case 'cancel': {
        cancelled = true;
        currentRunId++;
        const response: MultiscaleWorkerResponse = { type: 'cancelled' };
        self.postMessage(response);
        break;
      }

      default: {
        const raw: unknown = event.data;
        const unknownType = typeof raw === 'object' && raw !== null && 'type' in raw
          ? String(raw.type)
          : 'unknown';
        const response: MultiscaleWorkerResponse = {
          type: 'error',
          message: `MultiscaleWorker received unrecognized message type: ${String(unknownType)}`,
        };
        self.postMessage(response);
        break;
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const response: MultiscaleWorkerResponse = { type: 'error', message: errMsg };
    self.postMessage(response);
  }
};

async function runSimulation(config: MultiscaleConfig, runId: number): Promise<void> {
  let lastProgressPost = 0;

  try {
    const result = await multiscaleSimulation(
      config,
      (fraction: number) => {
        if (cancelled || runId !== currentRunId) {
          throw new Error('__CANCELLED__');
        }
        const now = performance.now();
        // Throttle progress messages to at most once per 60ms or on completion
        if (now - lastProgressPost >= 60 || fraction >= 1.0) {
          lastProgressPost = now;
          const response: MultiscaleWorkerResponse = {
            type: 'progress',
            fraction: Math.min(1, Math.max(0, fraction)),
          };
          self.postMessage(response);
        }
      },
      {
        isCancelled: () => cancelled || runId !== currentRunId,
      },
    );

    if (!cancelled && runId === currentRunId) {
      const response: MultiscaleWorkerResponse = { type: 'complete', result };
      self.postMessage(response);
    }
  } catch (err) {
    if (cancelled || runId !== currentRunId || (err instanceof Error && err.message === '__CANCELLED__')) {
      // Cancelled cleanly
      return;
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    const response: MultiscaleWorkerResponse = { type: 'error', message: errMsg };
    self.postMessage(response);
  }
}
