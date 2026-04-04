/**
 * Handlers for 'generate_network' and 'analyse_network' worker messages.
 *
 * Extracted from bnglWorker.ts. All shared state is passed via parameters.
 */

import type {
  BNGLModel,
  WorkerResponse,
  SerializedWorkerError,
  NetworkGeneratorOptions,
  NetworkAnalysisPayload,
} from '../../types';

import {
  generateExpandedNetwork as generateExpandedNetworkService,
  loadEvaluator,
} from '@bngplayground/engine';
import { analyseGraph } from '../igraphLoader';

// ---- Shared context contract ------------------------------------------------

export interface JobState {
  cancelled: boolean;
  controller?: AbortController;
}

export interface WorkerContext {
  safePostMessage: (msg: any) => void;
  registerJob: (id: number) => void;
  markJobComplete: (id: number) => void;
  ensureNotCancelled: (id: number) => void;
  serializeError: (error: unknown) => SerializedWorkerError;
  workerVerboseLog: (...args: any[]) => void;
}

// ---- Handlers ---------------------------------------------------------------

export async function handleGenerateNetwork(
  id: number,
  payload: unknown,
  jobStates: Map<number, JobState>,
  ctx: WorkerContext,
): Promise<void> {
  ctx.registerJob(id);
  const jobEntry = jobStates.get(id);
  if (!jobEntry) return; // Should not happen

  try {
    // Initialize evaluator for functional rates
    await loadEvaluator();

    if (!payload || typeof payload !== 'object') {
      throw new Error('Generate network payload missing');
    }

    const p = payload as { model: BNGLModel; options?: NetworkGeneratorOptions };
    let { model, options } = p;

    if (!model) {
      throw new Error('Model missing in generate_network payload');
    }

    // Check for model-defined generate_network action to override defaults
    if (model.actions) {
      const genAction = model.actions
        .slice()
        .reverse()
        .find((a) => a.type === 'generate_network');
      if (genAction) {
        const actionMaxIter = Number(genAction.args['max_iter']);
        if (!isNaN(actionMaxIter)) {
          ctx.workerVerboseLog(
            `[Worker] Overriding maxIterations with model action value: ${actionMaxIter}`,
          );
          options = { ...options, maxIterations: actionMaxIter };
        }

        const actionMaxAgg = Number(genAction.args['max_agg']);
        if (!isNaN(actionMaxAgg)) {
          ctx.workerVerboseLog(
            `[Worker] Overriding maxAgg with model action value: ${actionMaxAgg}`,
          );
          options = { ...options, maxAgg: actionMaxAgg };
        }

        const actionMaxStoich = Number(genAction.args['max_stoich']);
        if (!isNaN(actionMaxStoich)) {
          ctx.workerVerboseLog(
            `[Worker] Overriding maxStoich with model action value: ${actionMaxStoich}`,
          );
          options = { ...options, maxStoich: actionMaxStoich as any };
        }
      }
    }

    // Prepare model with merged network options.
    // Preserve parser-populated options (e.g., max_stoich maps) unless explicitly overridden.
    const mergedNetworkOptions: Record<string, any> = { ...(model.networkOptions || {}) };
    if (options?.maxSpecies !== undefined)
      mergedNetworkOptions.maxSpecies = options.maxSpecies;
    if (options?.maxReactions !== undefined)
      mergedNetworkOptions.maxReactions = options.maxReactions;
    if (options?.maxIterations !== undefined)
      mergedNetworkOptions.maxIter = options.maxIterations;
    if (options?.maxAgg !== undefined) mergedNetworkOptions.maxAgg = options.maxAgg;
    if (options?.maxStoich !== undefined) {
      mergedNetworkOptions.maxStoich =
        options.maxStoich instanceof Map
          ? Object.fromEntries(options.maxStoich.entries())
          : options.maxStoich;
    }

    const modelWithOptions = {
      ...model,
      networkOptions: mergedNetworkOptions,
    };

    // Call service
    const generatedModel = await generateExpandedNetworkService(
      modelWithOptions,
      () => ctx.ensureNotCancelled(id),
      (p) => ctx.safePostMessage({ id, type: 'generate_network_progress', payload: p }),
    );

    const response: WorkerResponse = {
      id,
      type: 'generate_network_success',
      payload: generatedModel,
    };
    ctx.safePostMessage(response);
  } catch (error) {
    console.error(`[Worker] Generate network error for job ${id}:`, error);
    const response: WorkerResponse = {
      id,
      type: 'generate_network_error',
      payload: ctx.serializeError(error),
    };
    ctx.safePostMessage(response);
  } finally {
    ctx.markJobComplete(id);
  }
}

export async function handleAnalyseNetwork(
  id: number,
  payload: unknown,
  _jobStates: Map<number, JobState>,
  ctx: WorkerContext,
): Promise<void> {
  ctx.workerVerboseLog(`[Worker] Received analyse_network request ${id}`);
  ctx.registerJob(id);
  try {
    const analysisPayload = payload as NetworkAnalysisPayload;
    if (!analysisPayload || !Array.isArray(analysisPayload.nodeLabels)) {
      throw new Error('analyse_network: invalid or missing NetworkAnalysisPayload');
    }
    const result = await analyseGraph(analysisPayload);
    const response: WorkerResponse = {
      id,
      type: 'analyse_network_success',
      payload: result,
    };
    ctx.safePostMessage(response);
  } catch (error) {
    console.error(`[Worker] Analyse network error for job ${id}:`, error);
    const response: WorkerResponse = {
      id,
      type: 'analyse_network_error',
      payload: ctx.serializeError(error),
    };
    ctx.safePostMessage(response);
  } finally {
    ctx.markJobComplete(id);
  }
}
