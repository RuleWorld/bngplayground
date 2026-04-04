/**
 * multiscaleWorker.ts — Web Worker for multiscale simulation.
 *
 * Runs multiscaleSimulation in a dedicated thread so the main UI
 * thread is never blocked by the synchronous while-loop.
 * Follows the spatialWorker.ts message pattern.
 */

import { multiscaleSimulation, parseMultiscaleModel } from '@bngplayground/engine';
import type { MultiscaleConfig, MultiscaleResult, MultiscaleModelDefinition } from '@bngplayground/engine';

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
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'run': {
        cancelled = false;
        runSimulation(msg.config);
        break;
      }

      case 'run_from_definition': {
        cancelled = false;
        const config = parseMultiscaleModel(msg.definition);
        runSimulation(config);
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

function runSimulation(config: MultiscaleConfig): void {
  try {
    const result = multiscaleSimulation(config, (fraction: number) => {
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
