/**
 * spatialWorker.ts — Web Worker for spatial simulation.
 *
 * Runs the SpatialSimulation in a dedicated thread.
 * Communicates with the main thread via structured messages.
 * Transfers ArrayBuffers for zero-copy snapshot delivery.
 */

import { SpatialSimulation } from '@bngplayground/engine';
import type { SpatialSimulationConfig, SpatialSnapshot, SpatialSimulationResult } from '@bngplayground/engine';

/** Messages from main thread → worker */
export type SpatialWorkerRequest =
  | { type: 'init'; bnglText: string; config: Partial<SpatialSimulationConfig> }
  | { type: 'run' }
  | { type: 'cancel' }
  | { type: 'destroy' };

/** Messages from worker → main thread */
export type SpatialWorkerResponse =
  | { type: 'initialized'; geometries: import('@bngplayground/engine').CompartmentGeometry[]; speciesNames: Record<number, string> }
  | { type: 'snapshot'; snapshot: SpatialSnapshot }
  | { type: 'progress'; step: number; totalSteps: number; time: number }
  | { type: 'complete'; result: SpatialSimulationResult }
  | { type: 'error'; message: string };

let simulation: SpatialSimulation | null = null;
let cancelled = false;

self.onmessage = async (event: MessageEvent<SpatialWorkerRequest>) => {
  const origin = (event as MessageEvent).origin;
  const expectedOrigin = typeof self.location?.origin === 'string' ? self.location.origin : '';
  if (typeof origin === 'string' && origin.length > 0 && expectedOrigin.length > 0 && origin !== expectedOrigin) {
    return;
  }

  const msg = event.data;

  try {
    switch (msg.type) {
      case 'init': {
        simulation = new SpatialSimulation(msg.config);
        await simulation.initialize(msg.bnglText);

        const geometries = simulation.getGeometries();
        const speciesNamesMap = simulation.getSpeciesNames();
        const speciesNames: Record<number, string> = {};
        for (const [id, name] of speciesNamesMap) {
          speciesNames[id] = name;
        }

        const response: SpatialWorkerResponse = {
          type: 'initialized',
          geometries,
          speciesNames,
        };
        self.postMessage(response);
        break;
      }

      case 'run': {
        if (!simulation) {
          const err: SpatialWorkerResponse = { type: 'error', message: 'Simulation not initialized' };
          self.postMessage(err);
          return;
        }

        cancelled = false;

        try {
          const result = await simulation.run((snapshot: SpatialSnapshot) => {
            if (cancelled) return;
            if (!snapshot.positions) return;

            // Transfer the positions buffer for zero-copy
            const transferable = snapshot.positions.buffer;
            const response: SpatialWorkerResponse = { type: 'snapshot', snapshot };
            self.postMessage(response, [transferable]);
          });

          if (!cancelled) {
            const response: SpatialWorkerResponse = { type: 'complete', result };
            self.postMessage(response);
          }
        } catch (err) {
          console.error('[spatialWorker] Simulation error:', err);
          const errMsg = err instanceof Error ? err.message : String(err);
          const response: SpatialWorkerResponse = { type: 'error', message: errMsg };
          self.postMessage(response);
        }
        break;
      }

      case 'cancel': {
        cancelled = true;
        break;
      }

      case 'destroy': {
        if (simulation) {
          simulation.destroy();
          simulation = null;
        }
        break;
      }
    }
  } catch (err) {
    console.error('[spatialWorker] Error:', err);
    const errMsg = err instanceof Error ? err.message : String(err);
    const response: SpatialWorkerResponse = { type: 'error', message: errMsg };
    self.postMessage(response);
  }
};
