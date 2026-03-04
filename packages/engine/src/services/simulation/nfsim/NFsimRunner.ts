import type { BNGLModel, SimulationOptions, SimulationResults } from '../../../types';
import { generateExpandedNetwork } from '../NetworkExpansion';
import { loadEvaluator } from '../ExpressionEvaluator';
import { simulate } from '../SimulationLoop';
import { BNGXMLWriter } from '../BNGXMLWriter';
import { runNFsim } from './NFsimLoader';
import { NFsimResultAdapter } from './NFsimResultAdapter';
import { NFsimValidator, type ValidationResult } from './NFsimValidator';

export interface NFsimSimulationOptions {
  t_end: number;
  n_steps: number;
  seed?: number;
  utl?: number;
  gml?: number;
  equilibrate?: number;
  cb?: boolean;
  timeoutMs?: number;
  requireRuntime?: boolean;
  verbose?: boolean;
}

export const validateModelForNFsim = (model: BNGLModel): ValidationResult =>
  NFsimValidator.validateForNFsim(model);

const formatNFsimError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const lower = message.toLowerCase();
  let hint: string | undefined;

  if (lower.includes('runtime not available')) {
    hint = 'NFsim runtime not loaded. Ensure the JS/WASM loader initializes globalThis.__nfsimRuntime.';
  } else if (lower.includes("compartments aren't supported") || lower.includes('compartments are not supported')) {
    hint = 'NFsim does not support compartments. Remove compartments or run an ODE/SSA solver instead.';
  } else if (lower.includes('out of memory') || lower.includes('oom') || lower.includes('memory')) {
    hint = 'NFsim ran out of memory. Increase memoryLimit or reduce model size/complexity.';
  } else if (lower.includes('unsupported') || lower.includes('not supported') || lower.includes('unknown keyword')) {
    hint = 'Model uses unsupported NFsim feature/keyword. Check BNGL actions or simplify the model.';
  }

  return hint ? `${message} (${hint})` : message;
};

const ensureExpandedNetwork = async (model: BNGLModel): Promise<BNGLModel> => {
  if ((model.reactions && model.reactions.length > 0) || !(model.reactionRules?.length)) {
    return model;
  }

  await loadEvaluator();
  return generateExpandedNetwork(
    model,
    () => undefined,
    () => undefined
  );
};

export async function runNFsimSimulation(
  inputModel: BNGLModel,
  options: NFsimSimulationOptions,
  jobId?: number
): Promise<SimulationResults> {
  const validation = validateModelForNFsim(inputModel);
  if (!validation.valid) {
    const errors = validation.errors.map((e) => e.message).join('\n• ');
    throw new Error(`Model incompatible with NFsim:\n• ${errors}`);
  }

  try {
    const xml = BNGXMLWriter.write(inputModel);
    const VERBOSE_NFSIM_DEBUG = true; // Enabled to help investigate why iteration isn't showing
    if (VERBOSE_NFSIM_DEBUG) console.log('[NFsimRunner] Generated XML:\n', xml);
    const hasSpeciesObservables = (inputModel.observables || [])
      .some((obs) => String(obs.type ?? '').toLowerCase() === 'species');
    const runOptions = {
      ...options,
      cb: options.cb ?? hasSpeciesObservables
    };
    // Attach a progress callback so we can forward NFsim stdout lines to the main thread as 'progress' messages
    const progressCallback = (line: string) => {
      try {
        const message = String(line).trim();
        // Strict regex: only parse "Sim time" to avoid CPU time / events noise
        const tm = message.match(/(?:^|\b)Sim\s*time\s*[:=]\s*([0-9.eE+-]+)/i) ||
             message.match(/\bt\s*=\s*([0-9.eE+-]+)/i);
        
        const payload: any = { message: line, source: 'nfsim-progress' };
        if (tm) {
          const val = Number(tm[1]);
          if (!isNaN(val)) {
            payload.simulationTime = val;
            // Also set a percentage if t_end is known
            if (options.t_end) {
              payload.simulationProgress = (val / options.t_end) * 100;
            }
          }
        }
        
        // Log to worker console so we can see it in dev tools
        if (payload.simulationTime !== undefined) {
           if (VERBOSE_NFSIM_DEBUG) console.log(`[NF Progress] t=${payload.simulationTime.toFixed(4)}`);
        }

        (self as any).postMessage({ id: jobId ?? -1, type: 'progress', payload });
      } catch (e) {
        // swallow
      }
    };

    const gdat = await runNFsim(xml, { ...runOptions, progressCallback });
    if (VERBOSE_NFSIM_DEBUG) console.log('[NFsimRunner] gdat output (first 800 chars):\n', gdat.slice(0, 800));

    // Ensure final progress update shows completed time
    (globalThis as any).postMessage({ id: jobId ?? -1, type: 'progress', payload: { message: 'Simulation complete', simulationProgress: 100, simulationTime: runOptions.t_end } });

    return NFsimResultAdapter.adaptGdatToSimulationResults(gdat, inputModel);
  } catch (error) {
    const formatted = formatNFsimError(error);
    if (options.requireRuntime) {
      throw new Error(`NFsim failed: ${formatted}`);
    }
    console.warn('[NFsimRunner] NFsim runtime unavailable, falling back to SSA.', formatted);
    const expanded = await ensureExpandedNetwork(inputModel);
    const ssaOptions: SimulationOptions = {
      method: 'ssa',
      t_end: options.t_end,
      n_steps: options.n_steps,
      seed: options.seed
    };
    return simulate(-1, expanded, ssaOptions, {
      checkCancelled: () => undefined,
      postMessage: () => undefined
    });
  }
}
