/**
 * Handler for 'parse' and 'atomize' worker messages.
 *
 * Extracted from bnglWorker.ts to keep the main worker file manageable.
 * Each handler receives the message id, payload, and a shared WorkerContext
 * so it never depends on worker-level globals.
 */

import type { BNGLModel, WorkerResponse, SerializedWorkerError } from '../../types';
import {
  parseBNGLWithANTLR,
  resolveCompartmentVolumes,
  requiresCompartmentResolution,
} from '@bngplayground/engine';
import { Atomizer } from '../../src/lib/atomizer';

// ---- Shared context contract ------------------------------------------------

export interface JobState {
  cancelled: boolean;
  controller?: AbortController;
}

export interface WorkerContext {
  postMessage: (msg: any) => void;
  registerJob: (id: number) => void;
  markJobComplete: (id: number) => void;
  ensureNotCancelled: (id: number) => void;
  serializeError: (error: unknown) => SerializedWorkerError;
  workerVerboseLog: (...args: any[]) => void;
}

// ---- Internal helpers -------------------------------------------------------

async function parseBNGL(
  jobId: number,
  bnglCode: string,
  ctx: WorkerContext,
): Promise<BNGLModel> {
  ctx.ensureNotCancelled(jobId);
  ctx.workerVerboseLog('[Worker-Debug] parseBNGL called for job', jobId);

  // 1. Parse via ANTLR best-effort model recovery (preserves recoverable legacy inputs)
  const parseResult = parseBNGLWithANTLR(bnglCode);
  if (!parseResult.model) {
    const errorMsg = parseResult.errors
      .map((e) => `Line ${e.line}:${e.column}: ${e.message}`)
      .join('\n');
    throw new Error(`BNGL parse error:\n${errorMsg}`);
  }
  if (!parseResult.success) {
    const errorMsg = parseResult.errors
      .map((e) => `Line ${e.line}:${e.column}: ${e.message}`)
      .join('\n');
    console.warn(
      `[Worker] ANTLR parse reported recoverable errors; continuing with best-effort model:\n${errorMsg}`,
    );
  }
  const model = parseResult.model;

  // 2. Resolve compartmental volumes if needed
  if (requiresCompartmentResolution(model)) {
    ctx.workerVerboseLog('[Worker] Model has compartments, resolving volumes...');
    return await resolveCompartmentVolumes(model);
  }

  return model;
}

// ---- Handlers ---------------------------------------------------------------

export async function handleParse(
  id: number,
  payload: unknown,
  _jobStates: Map<number, JobState>,
  ctx: WorkerContext,
): Promise<void> {
  ctx.registerJob(id);
  try {
    const code = typeof payload === 'string' ? payload : '';
    const model = await parseBNGL(id, code, ctx);
    const response: WorkerResponse = { id, type: 'parse_success', payload: model };
    ctx.postMessage(response);
  } catch (error) {
    console.error(`[Worker] Parse error for job ${id}:`, error);
    const response: WorkerResponse = {
      id,
      type: 'parse_error',
      payload: ctx.serializeError(error),
    };
    ctx.postMessage(response);
  } finally {
    ctx.markJobComplete(id);
  }
}

export async function handleAtomize(
  id: number,
  payload: unknown,
  _jobStates: Map<number, JobState>,
  ctx: WorkerContext,
): Promise<void> {
  ctx.workerVerboseLog(`[Worker] Received atomize request ${id}`);
  ctx.registerJob(id);
  try {
    const sbml = typeof payload === 'string' ? payload : '';
    const atomizer = new Atomizer();
    ctx.workerVerboseLog('[Worker] Initializing atomizer...');
    await atomizer.initialize();
    ctx.workerVerboseLog('[Worker] Starting atomization...');
    const result = await atomizer.atomize(sbml);
    ctx.workerVerboseLog(`[Worker] Atomization complete ${id}: success=${result.success}`);
    const response: WorkerResponse = { id, type: 'atomize_success', payload: result };
    ctx.postMessage(response);
  } catch (error) {
    console.error(`[Worker] Atomize error for job ${id}:`, error);
    const response: WorkerResponse = {
      id,
      type: 'atomize_error',
      payload: ctx.serializeError(error),
    };
    ctx.postMessage(response);
  } finally {
    ctx.markJobComplete(id);
  }
}
