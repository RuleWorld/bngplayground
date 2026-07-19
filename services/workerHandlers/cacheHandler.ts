/**
 * Handlers for 'cache_model' and 'release_model' worker messages.
 *
 * Extracted from bnglWorker.ts. All shared state is passed via parameters.
 */

import type { BNGLModel, WorkerResponse, SerializedWorkerError } from '../../types';
import { isRecord } from './guards';
import type { JobState } from './types';

// ---- Shared context contract ------------------------------------------------


/** Mutable cache state owned by the worker. */
export interface CacheState {
  cachedModels: Map<number, BNGLModel>;
  nextModelId: number;
  maxCachedModels: number;
}

export interface WorkerContext {
  safePostMessage: (msg: any) => void;
  registerJob: (id: number) => void;
  markJobComplete: (id: number) => void;
  serializeError: (error: unknown) => SerializedWorkerError;
  workerVerboseLog: (...args: any[]) => void;
}

// ---- Type guards (mirrored from bnglWorker.ts) ------------------------------


const isCacheModelPayload = (p: unknown): p is { model: BNGLModel } => {
  return isRecord(p) && 'model' in p;
};

const isReleaseModelPayload = (p: unknown): p is { modelId: number } => {
  if (!isRecord(p) || !('modelId' in p)) return false;
  const idVal = (p as Record<string, unknown>).modelId;
  return typeof idVal === 'number';
};

// ---- Handlers ---------------------------------------------------------------

export async function handleCacheModel(
  id: number,
  payload: unknown,
  _jobStates: Map<number, JobState>,
  ctx: WorkerContext,
  cacheState: CacheState,
): Promise<void> {
  ctx.registerJob(id);
  try {
    const p = payload as unknown;
    const model = isCacheModelPayload(p) ? p.model : undefined;
    if (!model) throw new Error('Cache model payload missing');

    const modelId = cacheState.nextModelId++;

    // Store a shallow clone to avoid accidental mutation from main thread
    const stored: BNGLModel = {
      ...model,
      parameters: { ...(model.parameters || {}) },
      moleculeTypes: (model.moleculeTypes || []).map((m) => ({ ...m })),
      species: (model.species || []).map((s) => ({ ...s })),
      observables: (model.observables || []).map((o) => ({ ...o })),
      reactions: (model.reactions || []).map((r) => ({ ...r })),
      reactionRules: (model.reactionRules || []).map((r) => ({ ...r })),
      // Preserve action-derived simulation simulationOptions for parity and for simulateCached callers
      simulationOptions: model.simulationOptions
        ? { ...(model.simulationOptions as any) }
        : model.simulationOptions,
      simulationPhases: (model.simulationPhases || []).map((p: any) => ({ ...p })),
      concentrationChanges: (model.concentrationChanges || []).map((c: any) => ({
        ...c,
      })),
      parameterChanges: (model.parameterChanges || []).map((c: any) => ({ ...c })),
    };

    cacheState.cachedModels.set(modelId, stored);

    // Enforce LRU eviction if we exceed the cache size
    try {
      if (cacheState.cachedModels.size > cacheState.maxCachedModels) {
        const it = cacheState.cachedModels.keys();
        const oldest = it.next().value as number | undefined;
        if (typeof oldest === 'number') {
          cacheState.cachedModels.delete(oldest);
          ctx.workerVerboseLog('[Worker] Evicted cached model (LRU) id=', oldest);
        }
      }
    } catch (_e) {
      // ignore eviction errors
    }

    const response: WorkerResponse = {
      id,
      type: 'cache_model_success',
      payload: { modelId },
    };
    ctx.safePostMessage(response);
  } catch (error) {
    console.error(`[Worker] Cache model error for job ${id}:`, error);
    const response: WorkerResponse = {
      id,
      type: 'cache_model_error',
      payload: ctx.serializeError(error),
    };
    ctx.safePostMessage(response);
  } finally {
    ctx.markJobComplete(id);
  }
}

export async function handleReleaseModel(
  id: number,
  payload: unknown,
  _jobStates: Map<number, JobState>,
  ctx: WorkerContext,
  cacheState: CacheState,
): Promise<void> {
  ctx.registerJob(id);
  try {
    const p = payload as unknown;
    const modelId = isReleaseModelPayload(p) ? p.modelId : undefined;
    if (typeof modelId !== 'number')
      throw new Error('release_model payload missing modelId');
    cacheState.cachedModels.delete(modelId);
    const response: WorkerResponse = {
      id,
      type: 'release_model_success',
      payload: { modelId },
    };
    ctx.safePostMessage(response);
  } catch (error) {
    console.error(`[Worker] Release model error for job ${id}:`, error);
    const response: WorkerResponse = {
      id,
      type: 'release_model_error',
      payload: ctx.serializeError(error),
    };
    ctx.safePostMessage(response);
  } finally {
    ctx.markJobComplete(id);
  }
}
