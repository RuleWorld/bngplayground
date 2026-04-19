/**
 * Hybrid UDE — types shared by NeuralRateResidual, HybridSimulator, HybridTrainer.
 */

import type { SerializedWeights } from './NeuralRateResidual';

export interface HybridRule {
  /** Name of the BNGL reaction rule whose rate this MLP corrects. */
  ruleName: string;
  /**
   * Observables or species whose values feed the MLP as inputs.
   * Order matters — serialized weight matrices depend on it.
   */
  inputFeatures: string[];
  /** Hidden layer sizes, excluding input and output. */
  hiddenLayers: number[];
  /** Activation for hidden layers. Output is always linear. */
  activation: 'tanh' | 'relu' | 'swish' | 'gelu' | 'sigmoid';
  /** Multiplier applied to MLP output before combining with mass-action rate. */
  outputScale: number;
  /** If true, the residual is clamped to ≥ 0 (nUDE-style). */
  enforceNonNegative: boolean;
  /**
   * Combination semantics for this rule's rate:
   *   'multiplicative': rate = mass_action * (1 + residual)
   *   'additive':       rate = mass_action + residual
   *   'replace':        rate = residual  (pure NODE in rule-based form)
   */
  combination: 'multiplicative' | 'additive' | 'replace';
}

export interface HybridModel {
  /** Serialized or runtime BNGL model payload — opaque to the trainer. */
  bnglSource?: string;
  /** Hybrid rules (each BNGL rule that carries a neural residual). */
  hybridRules: HybridRule[];
  /** Optional: previously-trained weights, keyed by rule name. */
  weights?: Record<string, SerializedWeights>;
}

export interface ExperimentalObservation {
  time: number;
  observables: Record<string, number>;
}

export interface HybridTrainingConfig {
  experimentalData: ExperimentalObservation[];
  validationData?: ExperimentalObservation[];
  /** Adam learning rate. Default 1e-3. */
  learningRate?: number;
  /** Stop after this many epochs regardless. */
  maxEpochs: number;
  /** Early stopping patience on validation loss. Default: Infinity. */
  earlyStoppingPatience?: number;
  /** Called after every epoch for progress UI. */
  onProgress?: (update: ProgressUpdate) => void;
}

export interface ProgressUpdate {
  epoch: number;
  trainLoss: number;
  valLoss?: number;
  earlyStopped?: boolean;
}

export interface HybridTrainingHistory {
  epochs: number[];
  trainLoss: number[];
  valLoss: number[];
}

export interface HybridTrainingResult {
  weights: Record<string, SerializedWeights>;
  history: HybridTrainingHistory;
  finalLoss: number;
  bestValLoss?: number;
}

export type { SerializedWeights };
