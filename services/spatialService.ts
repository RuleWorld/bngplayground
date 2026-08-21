/**
 * spatialService.ts — App-level service for managing spatial simulation.
 *
 * Wraps the SpatialSimulation web worker. Can be used by React components.
 * Pattern: services/bnglService.ts
 */

import type { SpatialSimulationConfig, SpatialSnapshot, SpatialSimulationResult, CompartmentGeometry } from '@bngplayground/engine';
import type { SpatialWorkerRequest, SpatialWorkerResponse } from './spatialWorker';

export type SpatialSimulationState = 'idle' | 'initializing' | 'running' | 'complete' | 'error';

export interface SpatialServiceCallbacks {
  onStateChange?: (state: SpatialSimulationState) => void;
  onInitialized?: (data: { geometries: CompartmentGeometry[]; speciesNames: Record<number, string> }) => void;
  onSnapshot?: (snapshot: SpatialSnapshot) => void;
  onProgress?: (step: number, totalSteps: number, time: number) => void;
  onComplete?: (result: SpatialSimulationResult) => void;
  onError?: (message: string) => void;
}

class SpatialService {
  private worker: Worker | null = null;
  private callbacks: SpatialServiceCallbacks = {};
  private state: SpatialSimulationState = 'idle';

  /**
   * Initialize the spatial simulation with a BNGL model.
   */
  async init(
    bnglText: string,
    config: Partial<SpatialSimulationConfig>,
    callbacks: SpatialServiceCallbacks
  ): Promise<void> {
    this.callbacks = callbacks;

    // Terminate any existing worker first
    this.terminate();
    
    // Set state AFTER terminate (to override terminate's 'idle' state)
    this.setState('initializing');

    // Create new worker
    this.worker = new Worker(
      new URL('./spatialWorker.ts', import.meta.url),
      { type: 'module' }
    );

    this.worker.onmessage = (event: MessageEvent<SpatialWorkerResponse>) => {
      const data = event.data ?? { type: 'error', message: 'Empty or undefined worker response' };
      this.handleWorkerMessage(data);
    };

    this.worker.onerror = (error) => {
      this.setState('error');
      this.callbacks.onError?.(error.message);
    };

    this.worker.onmessageerror = (event) => {
      console.error('[SpatialService] Worker failed to deserialize message:', event.data);
      this.setState('error');
      this.callbacks.onError?.('SpatialService worker failed to deserialize message');
    };

    // Send init message
    const request: SpatialWorkerRequest = {
      type: 'init',
      bnglText,
      config,
    };
    this.worker.postMessage(request);
  }

  /**
   * Start the simulation.
   */
  run(): void {
    if (!this.worker) {
      console.warn('SpatialService: No worker available');
      return;
    }
    if (this.state === 'idle') {
      console.warn('SpatialService: Not initialized, call init() first');
      return;
    }
    if (this.state !== 'initializing' && this.state !== 'running') {
      console.warn('SpatialService: Cannot run, state is', this.state);
      return;
    }
    this.setState('running');
    const request: SpatialWorkerRequest = { type: 'run' };
    this.worker.postMessage(request);
  }

  /**
   * Cancel a running simulation.
   */
  cancel(): void {
    if (this.worker) {
      const request: SpatialWorkerRequest = { type: 'cancel' };
      this.worker.postMessage(request);
    }
    this.setState('idle');
  }

  /**
   * Terminate the worker and clean up.
   */
  terminate(): void {
    if (this.worker) {
      const request: SpatialWorkerRequest = { type: 'destroy' };
      this.worker.postMessage(request);
      this.worker.terminate();
      this.worker = null;
    }
    this.setState('idle');
  }

  getState(): SpatialSimulationState {
    return this.state;
  }

  private setState(state: SpatialSimulationState): void {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  private handleWorkerMessage(msg: SpatialWorkerResponse): void {
    switch (msg.type) {
      case 'initialized':
        this.callbacks.onInitialized?.({ geometries: msg.geometries, speciesNames: msg.speciesNames });
        this.run();
        break;

      case 'snapshot':
        this.callbacks.onSnapshot?.(msg.snapshot);
        break;

      case 'progress':
        this.callbacks.onProgress?.(msg.step, msg.totalSteps, msg.time);
        break;

      case 'complete':
        this.setState('complete');
        this.callbacks.onComplete?.(msg.result);
        break;

      case 'error':
        this.setState('error');
        this.callbacks.onError?.(msg.message);
        break;
    }
  }
}

/** Singleton instance */
export const spatialService = new SpatialService();
