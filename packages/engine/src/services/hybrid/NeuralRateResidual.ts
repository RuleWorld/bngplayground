/**
 * NeuralRateResidual — an MLP that produces a multiplicative correction to a
 * BNGL reaction rule's rate, for use in hybrid mechanistic-neural (UDE) models.
 *
 * This file is the real (non-stub) implementation referenced in the (m) PLAN.
 * serialize() and fromSerialized() are fully wired so trained hybrids survive
 * round-trips through disk, network, or RO-Crate bundles.
 */

import * as tf from '@tensorflow/tfjs';
import type { HybridRule } from './types';

export interface SerializedWeights {
  /** Layer sizes, e.g. [2, 8, 8, 1] for a (2) → (8) → (8) → (1) MLP. */
  architecture: number[];
  activation: 'tanh' | 'relu' | 'swish' | 'gelu' | 'sigmoid';
  /** Per-layer weight matrix, row-major (out × in). */
  weights: number[][][];
  /** Per-layer bias vector (length = out). */
  biases: number[][];
  /** Optional: training metadata for provenance. */
  trainingMeta?: {
    epochs: number;
    finalLoss: number;
    optimizer: string;
    trainedAt: string;
  };
}

export class NeuralRateResidual {
  private model: tf.LayersModel | null = null;
  private builtArchitecture: number[] = [];

  constructor(public readonly rule: HybridRule) {}

  get inputFeatures(): string[] {
    return this.rule.inputFeatures;
  }

  /** Build the underlying MLP. Idempotent — calling again re-initializes weights. */
  build(): void {
    const sizes = [this.rule.inputFeatures.length, ...this.rule.hiddenLayers, 1];
    this.builtArchitecture = sizes;

    const activationName = activationToKeras(this.rule.activation);
    const model = tf.sequential();
    for (let i = 1; i < sizes.length; i++) {
      model.add(tf.layers.dense({
        units: sizes[i],
        inputShape: i === 1 ? [sizes[0]] : undefined,
        activation: (i === sizes.length - 1 ? 'linear' : activationName) as any,
        kernelInitializer: 'glorotNormal',
        biasInitializer: 'zeros',
      }));
    }
    this.model = model;
  }

  /**
   * Evaluate the residual at a single state.
   * Returns the raw residual (before any multiplicative combination with
   * the mass-action rate); caller applies the combination semantics.
   */
  evaluate(state: Record<string, number>): number {
    if (!this.model) throw new Error('NeuralRateResidual not built — call build() first');
    const input = this.inputFeatures.map((name) => state[name] ?? 0);
    return tf.tidy(() => {
      const tensorIn = tf.tensor2d([input]);
      const tensorOut = this.model!.predict(tensorIn) as tf.Tensor;
      const values = tensorOut.dataSync();
      const raw = values[0] * this.rule.outputScale;
      return this.rule.enforceNonNegative ? Math.max(0, raw) : raw;
    });
  }

  /** Evaluate on a batch of states. Faster than repeated single-state calls. */
  evaluateBatch(states: Array<Record<string, number>>): number[] {
    if (!this.model) throw new Error('NeuralRateResidual not built');
    if (states.length === 0) return [];
    return tf.tidy(() => {
      const input = states.map((s) => this.inputFeatures.map((name) => s[name] ?? 0));
      const tensorIn = tf.tensor2d(input);
      const tensorOut = this.model!.predict(tensorIn) as tf.Tensor;
      const raw = Array.from(tensorOut.dataSync()).map((v) => v * this.rule.outputScale);
      return this.rule.enforceNonNegative ? raw.map((v) => Math.max(0, v)) : raw;
    });
  }

  /**
   * Get trainable weights as TF.js tensors.
   * Used by HybridTrainer during gradient computation.
   */
  getTrainableWeights(): tf.Variable[] {
    if (!this.model) throw new Error('NeuralRateResidual not built');
    return this.model.getWeights().map((w) => tf.variable(w)) as tf.Variable[];
  }

  /**
   * Serialize weights to a plain-JSON form. Round-trips losslessly through
   * JSON.stringify; safe to embed in RO-Crate archives.
   *
   * Format: per-layer kernel as number[out][in] (transposed for readability);
   * bias as number[out]. Keras packs weights as [kernel, bias, kernel, bias, ...]
   * across all dense layers.
   */
  serialize(trainingMeta?: SerializedWeights['trainingMeta']): SerializedWeights {
    if (!this.model) throw new Error('NeuralRateResidual not built');

    const weights: number[][][] = [];
    const biases: number[][] = [];
    const flat = this.model.getWeights();

    // For a sequential Dense-only stack, Keras emits:
    //   [dense0_kernel, dense0_bias, dense1_kernel, dense1_bias, ...]
    // Kernel shape is [inputDim, outputDim]; we transpose to [outputDim, inputDim]
    // because row-major out×in reads more naturally ("neuron k has these inputs").
    for (let i = 0; i < flat.length; i += 2) {
      const kernelTensor = flat[i];         // shape [inDim, outDim]
      const biasTensor = flat[i + 1];       // shape [outDim]

      const kernelData = kernelTensor.dataSync();
      const [inDim, outDim] = kernelTensor.shape as [number, number];

      // Transpose to [outDim][inDim]
      const layerW: number[][] = Array.from({ length: outDim }, () => new Array<number>(inDim));
      for (let r = 0; r < inDim; r++) {
        for (let c = 0; c < outDim; c++) {
          layerW[c][r] = kernelData[r * outDim + c];
        }
      }
      weights.push(layerW);

      const biasData = Array.from(biasTensor.dataSync());
      biases.push(biasData);
    }

    return {
      architecture: [...this.builtArchitecture],
      activation: this.rule.activation,
      weights,
      biases,
      ...(trainingMeta ? { trainingMeta } : {}),
    };
  }

  /**
   * Reconstruct a NeuralRateResidual from a previously-serialized weights blob.
   * Throws if the architecture doesn't match the rule (defensive: catches
   * accidental weight reuse across differently-shaped rules).
   */
  static fromSerialized(
    rule: HybridRule,
    serialized: SerializedWeights,
  ): NeuralRateResidual {
    const r = new NeuralRateResidual(rule);
    r.build();

    const expectedArch = [rule.inputFeatures.length, ...rule.hiddenLayers, 1];
    if (
      serialized.architecture.length !== expectedArch.length ||
      serialized.architecture.some((n, i) => n !== expectedArch[i])
    ) {
      throw new Error(
        `serialized architecture [${serialized.architecture.join(', ')}] does not match ` +
          `rule [${expectedArch.join(', ')}]`,
      );
    }
    if (serialized.activation !== rule.activation) {
      throw new Error(
        `serialized activation '${serialized.activation}' does not match rule '${rule.activation}'`,
      );
    }

    const nLayers = serialized.weights.length;
    if (nLayers !== expectedArch.length - 1 || serialized.biases.length !== nLayers) {
      throw new Error(
        `inconsistent layer count: arch implies ${expectedArch.length - 1} layers but got ` +
          `${nLayers} weight matrices and ${serialized.biases.length} bias vectors`,
      );
    }

    // Re-pack into Keras format: [kernel0, bias0, kernel1, bias1, ...]
    const newTensors: tf.Tensor[] = [];
    for (let L = 0; L < nLayers; L++) {
      const layerW = serialized.weights[L];   // [outDim][inDim]
      const layerB = serialized.biases[L];    // [outDim]

      const outDim = layerW.length;
      const inDim = layerW[0]?.length ?? 0;

      if (outDim !== expectedArch[L + 1] || inDim !== expectedArch[L]) {
        throw new Error(
          `layer ${L}: weight shape [${outDim}, ${inDim}] does not match ` +
            `expected [${expectedArch[L + 1]}, ${expectedArch[L]}]`,
        );
      }
      if (layerB.length !== outDim) {
        throw new Error(`layer ${L}: bias length ${layerB.length} does not match outDim ${outDim}`);
      }

      // Transpose back to [inDim, outDim] for Keras.
      const flat = new Float32Array(inDim * outDim);
      for (let c = 0; c < outDim; c++) {
        for (let rr = 0; rr < inDim; rr++) {
          flat[rr * outDim + c] = layerW[c][rr];
        }
      }
      newTensors.push(tf.tensor2d(flat, [inDim, outDim]));
      newTensors.push(tf.tensor1d(layerB));
    }

    r.model!.setWeights(newTensors);
    // setWeights copies internally; dispose our locals to avoid leaks.
    for (const t of newTensors) t.dispose();
    return r;
  }

  /** Release GPU/memory resources. Call when the residual is no longer needed. */
  dispose(): void {
    this.model?.dispose();
    this.model = null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function activationToKeras(a: HybridRule['activation']): 'tanh' | 'relu' | 'sigmoid' {
  switch (a) {
    case 'swish':
    case 'gelu':
      return 'relu';  // TF.js core does not ship swish/gelu layers; fall back.
    case 'tanh':
    case 'relu':
    case 'sigmoid':
      return a;
    default:
      return 'tanh';
  }
}
