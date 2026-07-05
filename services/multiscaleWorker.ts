/**
 * multiscaleWorker.ts — Web Worker for multiscale simulation.
 *
 * Runs multiscaleSimulation in a dedicated thread so the main UI
 * thread is never blocked by the synchronous while-loop.
 * Follows the spatialWorker.ts message pattern.
 */

import { multiscaleSimulation, parseMultiscaleModel, CVODESolver } from '@bngplayground/engine';
import type { MultiscaleConfig, MultiscaleResult, MultiscaleModelDefinition } from '@bngplayground/engine';

// Wire up the CVODE factory (same lazy dynamic-import pattern as bnglWorker.ts).
// The intracellular BNGL models are integrated with CVODE, so this worker must
// provide the WASM factory before any simulation runs — otherwise CVODESolver.init
// throws "module factory has not been injected".
CVODESolver.cvodeModuleFactory = () =>
  import('./cvode_loader.js').then((m: any) => m.default ?? m);

/** Messages from main thread -> worker */
export type MultiscaleWorkerRequest =
  | { type: 'run'; config: MultiscaleConfig }
  | { type: 'run_from_definition'; definition: MultiscaleModelDefinition }
  | { type: 'cancel' };

/** Messages from worker -> main thread */
export type MultiscaleWorkerResponse =
  | { type: 'progress'; fraction: number }
  | { type: 'complete'; result: MultiscaleResult }
  | { type: 'error'; message: string };

let cancelled = false;

self.onmessage = (event: MessageEvent<MultiscaleWorkerRequest>) => {
  const origin = (event as MessageEvent).origin;
  const expectedOrigin = typeof self.location?.origin === 'string' ? self.location.origin : '';
  if (typeof origin === 'string' && origin.length > 0 && expectedOrigin.length > 0 && origin !== expectedOrigin) {
    return;
  }

  const msg = event.data;

  try {
    switch (msg.type) {
      case 'run': {
        cancelled = false;
        void runSimulation(msg.config);
        break;
      }

      case 'run_from_definition': {
        cancelled = false;
        const config = parseMultiscaleModel(msg.definition);
        void runSimulation(config);
        break;
      }

      case 'cancel': {
        cancelled = true;
        break;
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const response: MultiscaleWorkerResponse = { type: 'error', message: errMsg };
    self.postMessage(response);
  }
};

async function runSimulation(config: MultiscaleConfig): Promise<void> {
  try {
    const result = await multiscaleSimulation(config, (fraction: number) => {
      if (cancelled) {
        // Throwing from the progress callback aborts the simulation loop.
        // multiscaleSimulation catches this and returns partial results.
        throw new Error('__CANCELLED__');
      }
      const response: MultiscaleWorkerResponse = { type: 'progress', fraction };
      self.postMessage(response);
    });

    if (!cancelled) {
      const response: MultiscaleWorkerResponse = { type: 'complete', result };
      self.postMessage(response);
    }
  } catch (err) {
    if (cancelled || (err instanceof Error && err.message === '__CANCELLED__')) {
      // Cancelled — silently ignore
      return;
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    const response: MultiscaleWorkerResponse = { type: 'error', message: errMsg };
    self.postMessage(response);
  }
}
