/**
 * Handler for the 'simulate' worker message.
 *
 * This is the largest handler (~240 lines) — it resolves the simulation method,
 * optionally auto-generates a network, then delegates to the ODE/SSA/NFsim/PLA
 * simulator or the mixed-method workflow.
 *
 * Extracted from bnglWorker.ts. All shared state is passed via parameters.
 */

import type {
  BNGLModel,
  SimulationOptions,
  SimulationResults,
  WorkerResponse,
  SerializedWorkerError,
  SharedSimulationOutputDescriptor,
} from '../../types';

import {
  generateExpandedNetwork as generateExpandedNetworkService,
  simulate,
  runNFsimSimulation,
  validateModelForNFsim,
  loadEvaluator,
} from '@bngplayground/engine';
import type { NFsimSimulationOptions } from '@bngplayground/engine';

import { mergeSimulationOptionsWithModelActionDefaults } from '../bnglWorker';
import { applyParameterOverrides } from './applyParameterOverrides';
import { isRecord } from './guards';
import type { JobState } from './types';

// ---- Shared context contract ------------------------------------------------


/** Mutable simulation-tracking state owned by the worker. */
export interface SimulationState {
  activeSimulationJobId: number | null;
  activeSimulationMethod: 'ode' | 'ssa' | 'nf' | 'pla' | null;
}

export interface WorkerContext {
  postMessage: (msg: any) => void;
  safePostMessage: (msg: any) => void;
  registerJob: (id: number) => void;
  markJobComplete: (id: number) => void;
  ensureNotCancelled: (id: number) => void;
  serializeError: (error: unknown) => SerializedWorkerError;
  forwardWorkerNotification: (jobId: number, msg: Record<string, unknown>) => void;
  workerVerboseLog: (...args: any[]) => void;
  touchCachedModel: (modelId: number) => void;
  cachedModels: Map<number, BNGLModel>;
}

// ---- Type Guards (mirrored from bnglWorker.ts) ------------------------------


const isSimulateModelPayload = (
  p: unknown,
): p is { model: BNGLModel; options: SimulationOptions } => {
  if (!isRecord(p)) return false;
  return 'model' in p && 'options' in p;
};

const isSimulateModelIdPayload = (
  p: unknown,
): p is {
  modelId: number;
  parameterOverrides?: Record<string, number>;
  options: SimulationOptions;
  sharedOutput?: SharedSimulationOutputDescriptor;
} => {
  if (!isRecord(p)) return false;
  const idVal = (p as Record<string, unknown>).modelId;
  return 'modelId' in p && typeof idVal === 'number' && 'options' in p;
};

const isSharedSimulationOutputDescriptor = (
  value: unknown,
): value is SharedSimulationOutputDescriptor => {
  if (!isRecord(value)) return false;
  return (
    typeof value.slot === 'number' &&
    typeof value.runCount === 'number' &&
    typeof value.rowCount === 'number' &&
    typeof value.columnCount === 'number' &&
    Array.isArray(value.headers) &&
    value.valuesBuffer instanceof SharedArrayBuffer &&
    value.completionBuffer instanceof SharedArrayBuffer
  );
};

const writeResultsToSharedOutput = (
  results: SimulationResults,
  descriptor: SharedSimulationOutputDescriptor,
) => {
  if (results.data.length !== descriptor.rowCount) {
    throw new Error(
      `Shared ensemble row count mismatch: expected ${descriptor.rowCount}, received ${results.data.length}`,
    );
  }

  if (results.headers.length !== descriptor.columnCount) {
    throw new Error(
      `Shared ensemble column count mismatch: expected ${descriptor.columnCount}, received ${results.headers.length}`,
    );
  }

  const values = new Float64Array(descriptor.valuesBuffer);
  const completion = new Int32Array(descriptor.completionBuffer);
  const runStride = descriptor.rowCount * descriptor.columnCount;
  let offset = descriptor.slot * runStride;

  for (let rowIdx = 0; rowIdx < descriptor.rowCount; rowIdx++) {
    const row = results.data[rowIdx] ?? {};
    for (let colIdx = 0; colIdx < descriptor.columnCount; colIdx++) {
      const header = descriptor.headers[colIdx];
      const rawValue = row[header];
      values[offset++] = typeof rawValue === 'number' ? rawValue : Number(rawValue ?? Number.NaN);
    }
  }

  Atomics.store(completion, descriptor.slot, 1);
};

// ---- Handler ----------------------------------------------------------------

export async function handleSimulate(
  id: number,
  payload: unknown,
  jobStates: Map<number, JobState>,
  ctx: WorkerContext,
  simulationState: SimulationState,
): Promise<void> {
  ctx.registerJob(id);
  const jobEntry = jobStates.get(id);
  if (!jobEntry) return; // Should not happen

  try {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Simulation payload missing');
    }

    // Backwards-compatible: payload can be { model, options } or { modelId, parameterOverrides?, options }
    const p = payload as unknown;
    let model: BNGLModel | undefined;
    let options: SimulationOptions | undefined;

    if (isSimulateModelPayload(p)) {
      model = p.model;
      options = p.options;
    } else if (isSimulateModelIdPayload(p)) {
      const cached = ctx.cachedModels.get(p.modelId);
      if (!cached) throw new Error('Cached model not found in worker');
      ctx.touchCachedModel(p.modelId);
      options = p.options;

      if (!p.parameterOverrides || Object.keys(p.parameterOverrides).length === 0) {
        model = cached;
      } else {
        model = applyParameterOverrides(cached, p.parameterOverrides);
      }
    }

    if (!model || !options) {
      throw new Error('Simulation payload incomplete');
    }

    const sharedOutput =
      isRecord(p) &&
      'sharedOutput' in p &&
      isSharedSimulationOutputDescriptor((p as Record<string, unknown>).sharedOutput)
        ? (p as { sharedOutput: SharedSimulationOutputDescriptor }).sharedOutput
        : undefined;

    // Auto-generate network if model has reaction rules but no reactions
    const hasRules = model.reactionRules && model.reactionRules.length > 0;
    const hasReactions = model.reactions && model.reactions.length > 0;

    // Determine if this is an NFsim simulation
    const phases = model.simulationPhases || [];

    // Resolve effective method from 'default' (Auto) to explicit 'ode'/'ssa'/'nf'
    let effectiveMethod: 'ode' | 'ssa' | 'nf' | 'pla' = 'ode';

    if (options.method && options.method !== 'default') {
      effectiveMethod = options.method as 'ode' | 'ssa' | 'nf' | 'pla';
    } else if (phases.length > 0) {
      const m = phases[0].method;
      if (m === 'nf' || m === 'ssa' || m === 'ode' || m === 'pla') {
        effectiveMethod = m;
      }
    }

    // Update options with resolved method
    options.method = effectiveMethod;

    // Track active simulation for progress forwarding
    simulationState.activeSimulationJobId = id;
    simulationState.activeSimulationMethod = effectiveMethod;

    // Merge model action defaults only when the UI did not explicitly override them.
    options = mergeSimulationOptionsWithModelActionDefaults(options, model, effectiveMethod);

    const isNF = effectiveMethod === 'nf';

    // Check for mixed-method workflows (phases with different methods)
    const hasMixedMethods =
      phases.length > 1 && phases.some((p) => p.method !== phases[0].method);

    const VERBOSE_BNGL_WORKER_DEBUG = false;
    if (VERBOSE_BNGL_WORKER_DEBUG) {
      ctx.workerVerboseLog(
        `[Worker Debug] Resolved method: ${effectiveMethod}, isNF=${isNF}, hasMixedMethods=${hasMixedMethods}`,
      );
    }

    if (hasRules && !hasReactions && !isNF) {
      ctx.workerVerboseLog('[Worker] Auto-generating network from reaction rules...');
      ctx.workerVerboseLog('[Worker] Model parameters:', model.parameters);
      ctx.workerVerboseLog(
        '[Worker] Model reactionRules:',
        model.reactionRules.map((r, i) => `${i}: ${r.rate}`),
      );
      try {
        await loadEvaluator();

        model = await generateExpandedNetworkService(
          model,
          () => ctx.ensureNotCancelled(id),
          (p) =>
            ctx.safePostMessage({ id, type: 'generate_network_progress', payload: p }),
        );
        ctx.workerVerboseLog(
          `[Worker] Network auto-generation complete: ${model.species.length} species, ${model.reactions?.length ?? 0} reactions`,
        );
      } catch (genError) {
        console.error('[Worker] Network auto-generation failed:', genError);
        throw new Error(
          `Network generation failed: ${genError instanceof Error ? genError.message : String(genError)}`,
        );
      }
    }

    // Delegate to appropriate simulator
    const results: SimulationResults = await (async () => {
      if (hasMixedMethods) {
        ctx.workerVerboseLog('[Worker] Using mixed-method simulation workflow');
        return await simulate(id, model, options, {
          checkCancelled: () => ctx.ensureNotCancelled(id),
          postMessage: (msg) =>
            ctx.forwardWorkerNotification(id, msg as Record<string, unknown>),
        });
      }

      if (isNF) {
        ctx.workerVerboseLog('[Worker] Using NFsim for simulation');

        if (!model) throw new Error('Model missing for NFsim simulation');
        if (!options) throw new Error('Options missing for NFsim simulation');

        const validation = validateModelForNFsim(model);

        if (validation.warnings && validation.warnings.length > 0) {
          const warningMessages = validation.warnings.map((w) => w.message);
          console.warn('[Worker] NFsim warnings:\n\u2022 ' + warningMessages.join('\n\u2022 '));
          ctx.safePostMessage({
            id: -1,
            type: 'warning',
            payload: {
              message: `NFsim Warnings:\n\u2022 ${warningMessages.join('\n\u2022 ')}`,
            },
          });
        }

        if (!validation.valid) {
          const errorMessages = validation.errors.map((e) => e.message);
          throw new Error(
            `Model incompatible with NFsim:\n\u2022 ${errorMessages.join('\n\u2022 ')}`,
          );
        }

        ctx.safePostMessage({
          id,
          type: 'progress',
          payload: { message: 'NFsim progress hook active' },
        });

        const nfOptions: NFsimSimulationOptions = {
          t_end: options.t_end,
          n_steps: options.n_steps,
          seed: options.seed,
          utl: options.utl,
          gml: options.gml,
          equilibrate: options.equilibrate,
          includeSpeciesData: options.includeSpeciesData,
          includeExpandedNetwork: options.includeExpandedNetwork,
          timeoutMs: 300000,
          requireRuntime: true,
          verbose: true,
        };

        return await runNFsimSimulation(model, nfOptions, id);
      } else {
        ctx.workerVerboseLog(
          `[Worker] Received 'simulate' request. Model has ${phases.length} phases. Options: t_end=${options?.t_end}, method=${options?.method}`,
        );
        if (!model || !options) throw new Error('Model or options missing during simulate');
        return await simulate(id, model, options, {
          checkCancelled: () => ctx.ensureNotCancelled(id),
          postMessage: (msg) => ctx.safePostMessage(msg),
        });
      }
    })();

    if (sharedOutput) {
      writeResultsToSharedOutput(results, sharedOutput);
      const response: WorkerResponse = {
        id,
        type: 'simulate_shared_success',
        payload: { slot: sharedOutput.slot },
      };
      ctx.safePostMessage(response);
    } else {
      const response: WorkerResponse = { id, type: 'simulate_success', payload: results };
      try {
        ctx.postMessage(response);
      } catch (postError: any) {
        const msg = postError?.message ?? String(postError ?? '');
        if (/Data cannot be cloned|out of memory/i.test(msg)) {
          console.warn(
            '[Worker] simulate_success payload too large; retrying without speciesData payload',
          );
          const slimResults = {
            ...(results as any),
            speciesHeaders: undefined,
            speciesData: undefined,
          };
          const slimResponse: WorkerResponse = {
            id,
            type: 'simulate_success',
            payload: slimResults,
          };
          ctx.postMessage(slimResponse);
        } else {
          throw postError;
        }
      }
    }
  } catch (error) {
    console.error(`[Worker] Simulation error for job ${id}:`, error);
    const response: WorkerResponse = {
      id,
      type: 'simulate_error',
      payload: ctx.serializeError(error),
    };
    ctx.safePostMessage(response);
  } finally {
    ctx.markJobComplete(id);
    if (simulationState.activeSimulationJobId === id) {
      simulationState.activeSimulationJobId = null;
      simulationState.activeSimulationMethod = null;
    }
  }
}
