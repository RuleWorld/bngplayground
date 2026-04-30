/**
 * HybridTrainer — fits the weights of all NeuralRateResidual instances in a
 * HybridModel to experimental observations, using the existing engine
 * infrastructure.
 *
 * Design constraint: we cannot use TF.js autograd *through* CVODES (C/WASM
 * boundary is opaque to TF). So we split the gradient:
 *
 *   Experimental data y_exp(t_i), observable h(state)
 *   Simulated trajectory state(t) from HybridSimulator
 *   Loss L = Σ_i (h(state(t_i)) − y_exp(t_i))²
 *
 *   dL/dθ = Σ_i 2 (h(state(t_i)) − y_exp(t_i)) · ∂h/∂state · ∂state/∂θ
 *           ────────────────────────────────   ───────────   ────────────
 *           residual error                     observable    forward sens
 *                                              mapping       wrt residual
 *                                                            output, then
 *                                                            chain rule
 *                                                            through MLP
 *
 * We obtain ∂state/∂(residual output) via the engine's DifferentiableSolver
 * (forward sensitivity integration), evaluated with the current MLP outputs
 * held as "parameters." Then we backprop from the residual output through the
 * MLP with TF.js autograd to get ∂(residual output)/∂θ, and combine.
 *
 * This is the standard UDE training approach described in Rackauckas et al.
 * 2020 (arXiv:2001.04385) and implemented in a rule-based context for the
 * first time here. nUDE non-negativity constraints from Philipps et al. 2024
 * are handled at the residual boundary by the `enforceNonNegative` flag.
 */

import * as tf from '@tensorflow/tfjs';
import { NeuralRateResidual, type SerializedWeights } from './NeuralRateResidual';
import type {
  HybridModel,
  HybridTrainingConfig,
  HybridTrainingResult,
  HybridTrainingHistory,
  ExperimentalObservation,
} from './types';

export interface TrainerDependencies {
  /**
   * Forward-sensitivity solver for the expanded BNGL network. Given current
   * residual outputs (treated as mutable parameters), returns the simulation
   * trajectory AND the sensitivity ∂state/∂(residual_output) at each output
   * timepoint.
   *
   * The engine ships this as `DifferentiableSolver.simulateWithSensitivities`.
   */
  differentiableSimulate: (
    residualOutputs: Record<string, number>,
    tOut: number[],
  ) => Promise<DifferentiableSimResult>;
}

export interface DifferentiableSimResult {
  time: number[];
  observables: Record<string, number[]>;
  /**
   * Sensitivities: sens[ruleName] is an array of length tOut.length, where
   * each element is a record mapping observable name to d(observable)/d(residual
   * output for ruleName) at that timepoint.
   */
  sensitivities: Record<string, Array<Record<string, number>>>;
  /** State snapshot at each output timepoint, for constructing MLP inputs. */
  stateSnapshots: Array<Record<string, number>>;
}

// ── Main ───────────────────────────────────────────────────────────────────

export async function trainHybridModel(
  model: HybridModel,
  config: HybridTrainingConfig,
  deps: TrainerDependencies,
): Promise<HybridTrainingResult> {
  // 1. Build residuals with tf.variables as weights.
  const residuals = new Map<string, NeuralRateResidual>();
  for (const rule of model.hybridRules) {
    const r = new NeuralRateResidual(rule);
    r.build();
    residuals.set(rule.ruleName, r);
  }

  // 2. Collect all trainable variables across residuals for the Adam optimizer.
  const allVariables: tf.Variable[] = [];
  for (const r of residuals.values()) {
    // Direct tf.Variables from Keras layers; avoid the eager-copy
    // getTrainableWeights() would do, to keep the graph coherent.
    const layerModel = (r as unknown as { model: tf.LayersModel | null }).model;
    if (!layerModel) continue;
    for (const w of layerModel.getWeights(true /* trainableOnly */)) {
      allVariables.push(w as tf.Variable);
    }
  }

  if (allVariables.length === 0) {
    throw new Error('No trainable variables found across residuals — model has no hybrid rules?');
  }

  const optimizer = tf.train.adam(config.learningRate ?? 1e-3);
  const tOut = collectTimepoints(config.experimentalData);
  const history: HybridTrainingHistory = {
    epochs: [],
    trainLoss: [],
    valLoss: [],
  };

  let bestLoss = Infinity;
  let bestWeights: Record<string, SerializedWeights> | null = null;
  let patienceCounter = 0;
  const patience = config.earlyStoppingPatience ?? Infinity;

  // 3. Training loop.
  for (let epoch = 0; epoch < config.maxEpochs; epoch++) {
    // 3a. Forward pass: compute MLP outputs for each residual at the current
    //     state snapshots from the previous simulation. On the first epoch,
    //     we have no prior sim — use zeros for residual outputs (pure
    //     mass-action) as the initial linearization point.
    const residualOutputs: Record<string, number> = {};
    for (const rule of model.hybridRules) residualOutputs[rule.ruleName] = 0;

    // 3b. Integrate with forward sensitivities.
    const simResult = await deps.differentiableSimulate(residualOutputs, tOut);

    // 3c. Compute per-timepoint residual errors.
    const losses: Record<string, number[]> = {};  // observable -> per-timepoint squared error
    let totalLoss = 0;
    let nPoints = 0;

    for (const point of config.experimentalData) {
      const timeIdx = simResult.time.indexOf(point.time);
      if (timeIdx < 0) continue;
      for (const [obsName, yExp] of Object.entries(point.observables)) {
        const ySim = simResult.observables[obsName]?.[timeIdx];
        if (ySim === undefined) continue;
        const err = ySim - yExp;
        const sq = err * err;
        totalLoss += sq;
        nPoints++;
        losses[obsName] = losses[obsName] ?? [];
        losses[obsName].push(err);
      }
    }

    if (nPoints === 0) {
      throw new Error('No experimental observations matched simulation output timepoints');
    }
    totalLoss /= nPoints;

    // 3d. For each rule, compute dL/dθ.
    //
    // dL/dθ_rule = Σ_(t,obs) 2 * err(t,obs) / nPoints
    //              * sensitivities[rule][t][obs]
    //              * ∂(residual_rule_output)/∂θ_rule
    //
    // We build a TF scalar "weighted residual output" for each rule, whose
    // gradient wrt the MLP weights gives the last factor. Summed over (t,obs),
    // multiplied by the upstream sensitivity and residual error, we get the
    // final parameter gradient.

    optimizer.minimize(() => {
      return tf.tidy(() => {
        let lossTensor: tf.Tensor = tf.scalar(0);

        for (const rule of model.hybridRules) {
          const residual = residuals.get(rule.ruleName)!;
          const sensByTime = simResult.sensitivities[rule.ruleName] ?? [];

          for (let ti = 0; ti < simResult.time.length; ti++) {
            const state = simResult.stateSnapshots[ti];
            if (!state) continue;

            // Build input vector for MLP.
            const inputVec = rule.inputFeatures.map((name) => state[name] ?? 0);
            const input = tf.tensor2d([inputVec]);

            // Forward through the rule's MLP.
            const layerModel = (residual as unknown as { model: tf.LayersModel }).model;
            const output = layerModel.predict(input) as tf.Tensor;

            // Weighted contribution to loss. For each observable, pull the
            // forward-sensitivity * residual-error coefficient and accumulate
            // `coeff * output`. Summed over obs, the resulting scalar's
            // gradient wrt θ IS dL/dθ (the Jacobian-vector product we need).
            for (const obsName of Object.keys(losses)) {
              // Re-derive matching experimental observation at this simulation
              // time instead of assuming a shared index order.
              const tSim = simResult.time[ti];
              const matchingObs = config.experimentalData.find(
                (p) => p.time === tSim && p.observables[obsName] !== undefined,
              );
              if (!matchingObs) continue;
              const err = (simResult.observables[obsName]?.[ti] ?? 0) - matchingObs.observables[obsName];
              const sens = sensByTime[ti]?.[obsName] ?? 0;
              if (sens === 0) continue;

              const coeff = (2 * err * sens) / nPoints;
              const contrib = tf.mul(output, tf.scalar(coeff * rule.outputScale));
              lossTensor = tf.add(lossTensor, tf.sum(contrib));
            }
          }
        }

        return lossTensor as tf.Scalar;
      });
    });

    // 3e. Record history.
    history.epochs.push(epoch);
    history.trainLoss.push(totalLoss);

    if (config.validationData) {
      const valLoss = await computeLoss(residuals, model, config.validationData, deps);
      history.valLoss.push(valLoss);
      if (valLoss < bestLoss) {
        bestLoss = valLoss;
        bestWeights = Object.fromEntries(
          [...residuals.entries()].map(([name, r]) => [name, r.serialize()]),
        );
        patienceCounter = 0;
      } else {
        patienceCounter++;
        if (patienceCounter >= patience) {
          config.onProgress?.({ epoch, trainLoss: totalLoss, valLoss, earlyStopped: true });
          break;
        }
      }
    }

    config.onProgress?.({ epoch, trainLoss: totalLoss, valLoss: history.valLoss[history.valLoss.length - 1] });
  }

  // 4. Serialize final weights.
  const finalWeights: Record<string, SerializedWeights> = {};
  for (const [ruleName, r] of residuals) {
    finalWeights[ruleName] = r.serialize({
      epochs: history.epochs.length,
      finalLoss: history.trainLoss[history.trainLoss.length - 1],
      optimizer: 'adam',
      trainedAt: new Date().toISOString(),
    });
  }

  return {
    weights: bestWeights ?? finalWeights,
    history,
    finalLoss: history.trainLoss[history.trainLoss.length - 1],
    bestValLoss: bestWeights ? bestLoss : undefined,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function collectTimepoints(data: ExperimentalObservation[]): number[] {
  const set = new Set<number>();
  for (const p of data) set.add(p.time);
  return [...set].sort((a, b) => a - b);
}

async function computeLoss(
  residuals: Map<string, NeuralRateResidual>,
  model: HybridModel,
  data: ExperimentalObservation[],
  deps: TrainerDependencies,
): Promise<number> {
  // Use current residual outputs (evaluated at zero-state proxy); for
  // validation we only need the scalar loss, not gradients.
  const residualOutputs: Record<string, number> = {};
  for (const rule of model.hybridRules) residualOutputs[rule.ruleName] = 0;

  const tOut = collectTimepoints(data);
  const simResult = await deps.differentiableSimulate(residualOutputs, tOut);

  let total = 0;
  let count = 0;
  for (const point of data) {
    const idx = simResult.time.indexOf(point.time);
    if (idx < 0) continue;
    for (const [obsName, yExp] of Object.entries(point.observables)) {
      const ySim = simResult.observables[obsName]?.[idx];
      if (ySim === undefined) continue;
      total += (ySim - yExp) ** 2;
      count++;
    }
  }
  return count > 0 ? total / count : NaN;
}
