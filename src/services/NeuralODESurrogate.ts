// src/services/NeuralODESurrogate.ts
// Phase 2: Neural ODE surrogate models for fast parameter sweeps

import * as tf from '@tensorflow/tfjs';
// Note: BNGLModel type is in root types.ts - using 'any' for flexibility

// Backend initialization state
let backendInitialized = false;
let backendInitPromise: Promise<void> | null = null;

/**
 * Initialize TensorFlow.js backend with fallback support.
 * Tries WebGL first (GPU acceleration), then falls back to WASM or CPU.
 * This prevents crashes on systems without WebGL support.
 */
async function initializeBackend(): Promise<void> {
  if (backendInitialized) return;
  if (backendInitPromise) return backendInitPromise;

  backendInitPromise = (async () => {
    const backends = ['webgl', 'wasm', 'cpu'];
    
    for (const backend of backends) {
      try {
        // Set the backend
        const success = await tf.setBackend(backend);
        if (success) {
          await tf.ready();
          console.log(`TensorFlow.js initialized with ${backend} backend`);
          backendInitialized = true;
          return;
        }
      } catch (e) {
        console.warn(`Failed to initialize ${backend} backend:`, e);
      }
    }
    
    // If all preferred backends fail, let TensorFlow.js pick the best available
    try {
      await tf.ready();
      console.log(`TensorFlow.js initialized with ${tf.getBackend()} backend (fallback)`);
      backendInitialized = true;
    } catch (e) {
      console.error('Failed to initialize any TensorFlow.js backend:', e);
      throw new Error('No TensorFlow.js backend available. Neural ODE features are unavailable.', { cause: e });
    }
  })();

  return backendInitPromise;
}

/**
 * Network size presets for different model complexities
 * - light: [32, 32] for simple models (<5 species) - ~2K params, fast training
 * - standard: [64, 64] for medium models (5-20 species) - ~8K params
 * - full: [128, 128, 64] for complex models (20+ species) - ~25K params
 * - auto: dynamically select based on species count
 */
export type NetworkSizePreset = 'light' | 'standard' | 'full' | 'auto';

export const NETWORK_ARCHITECTURES: Record<Exclude<NetworkSizePreset, 'auto'>, number[]> = {
  light: [32, 32],
  standard: [64, 64],
  full: [128, 128, 64]
};

/**
 * Get appropriate network size based on species count
 */
export function getAutoNetworkSize(nSpecies: number): Exclude<NetworkSizePreset, 'auto'> {
  if (nSpecies < 5) return 'light';
  if (nSpecies < 20) return 'standard';
  return 'full';
}

export interface SurrogateTrainingConfig {
  epochs?: number;
  batchSize?: number;
  validationSplit?: number;
  learningRate?: number;
  earlyStopping?: boolean;
  patience?: number;
  verbose?: boolean;
  onEpochEnd?: (epoch: number, logs?: tf.Logs) => void | Promise<void>;
  /** Network size preset - defaults to 'auto' which selects based on species count */
  networkSize?: NetworkSizePreset;
}

export interface TrainingDataset {
  parameters: number[][];     // [nSamples, nParams]
  timePoints: number[];        // [nTimePoints]
  concentrations: number[][][]; // [nSamples, nTimePoints, nSpecies]
}

export interface PredictionResult {
  concentrations: number[][];  // [nTimePoints, nSpecies]
  confidence?: number[][];     // Optional uncertainty estimates
}

/**
 * Neural ODE Surrogate Model
 * Train a neural network to approximate ODE solutions for fast parameter sweeps
 */
export class NeuralODESurrogate {
  private model: tf.Sequential | null = null;
  private nParams: number;
  private nSpecies: number;
  private paramMean: number[] = [];
  private paramStd: number[] = [];
  private concMean: number[] = [];
  private concStd: number[] = [];
  private isNormalized: boolean = false;
  private networkSizePreset: NetworkSizePreset;
  
  constructor(nParams: number, nSpecies: number, networkSize: NetworkSizePreset = 'auto') {
    this.nParams = nParams;
    this.nSpecies = nSpecies;
    this.networkSizePreset = networkSize;
  }
  
  /**
   * Get the hidden units array based on network size preset
   */
  private getHiddenUnits(): number[] {
    const preset = this.networkSizePreset === 'auto' 
      ? getAutoNetworkSize(this.nSpecies) 
      : this.networkSizePreset;
    return NETWORK_ARCHITECTURES[preset];
  }
  
  /**
   * Get info about current network configuration
   */
  getNetworkInfo(): { preset: string; hiddenUnits: number[]; estimatedParams: number } {
    const preset = this.networkSizePreset === 'auto' 
      ? getAutoNetworkSize(this.nSpecies) 
      : this.networkSizePreset;
    const hiddenUnits = NETWORK_ARCHITECTURES[preset];
    // Rough estimate: (input+1)*h1 + h1*h2 + ... + hN*output
    const inputSize = this.nParams + 1;
    let params = (inputSize + 1) * hiddenUnits[0];
    for (let i = 1; i < hiddenUnits.length; i++) {
      params += (hiddenUnits[i-1] + 1) * hiddenUnits[i];
    }
    params += (hiddenUnits[hiddenUnits.length - 1] + 1) * this.nSpecies;
    return { preset, hiddenUnits, estimatedParams: params };
  }
  
  /**
   * Build the neural network architecture
   * Architecture dynamically sized based on model complexity:
   * - light: [32, 32] for <5 species
   * - standard: [64, 64] for 5-20 species  
   * - full: [128, 128, 64] for 20+ species
   */
  private buildModel(hiddenUnits?: number[]): tf.Sequential {
    const units = hiddenUnits ?? this.getHiddenUnits();
    console.log(`[NeuralODESurrogate] Building model with architecture: [${units.join(', ')}]`);
    const model = tf.sequential();
    
    // Input: parameters + time point
    model.add(tf.layers.dense({
      inputShape: [this.nParams + 1],
      units: units[0],
      activation: 'relu',
      kernelInitializer: 'heNormal'
    }));
    
    // Hidden layers with batch normalization
    for (let i = 1; i < units.length; i++) {
      model.add(tf.layers.batchNormalization());
      model.add(tf.layers.dense({
        units: units[i],
        activation: 'relu',
        kernelInitializer: 'heNormal'
      }));
      model.add(tf.layers.dropout({ rate: 0.1 })); // Prevent overfitting
    }
    
    // Output layer: species concentrations
    model.add(tf.layers.dense({
      units: this.nSpecies,
      activation: 'softplus', // Ensure positive concentrations
      kernelInitializer: 'glorotUniform'
    }));
    
    return model;
  }
  
  /**
   * Normalize training data for better convergence
   */
  private normalizeData(data: TrainingDataset): {
    normalizedParams: tf.Tensor2D;
    normalizedTime: tf.Tensor2D;
    normalizedConc: tf.Tensor3D;
  } {
    // Normalize parameters
    const paramsTensor = tf.tensor2d(data.parameters);
    this.paramMean = paramsTensor.mean(0).arraySync() as number[];
    this.paramStd = tf.moments(paramsTensor, 0).variance.sqrt().arraySync() as number[];
    
    const normalizedParams = tf.tidy(() => {
      const mean = tf.tensor1d(this.paramMean);
      const std = tf.tensor1d(this.paramStd);
      return tf.div(tf.sub(paramsTensor, mean), tf.add(std, 1e-7)) as tf.Tensor2D;
    });
    
    // Normalize time (simple min-max scaling)
    const tMin = Math.min(...data.timePoints);
    const tMax = Math.max(...data.timePoints);
    const normalizedTimeArray = data.timePoints.map(t => (t - tMin) / (tMax - tMin + 1e-7));
    const normalizedTime = tf.tensor2d(
      normalizedTimeArray.map(t => [t])
    );
    
    // Normalize concentrations (log-transform + standardize)
    const concTensor = tf.tensor3d(data.concentrations);
    const logConc = tf.log(tf.add(concTensor, 1e-10)); // Add small constant to avoid log(0)
    
    const flatLogConc = logConc.reshape([-1, this.nSpecies]);
    this.concMean = flatLogConc.mean(0).arraySync() as number[];
    this.concStd = tf.moments(flatLogConc, 0).variance.sqrt().arraySync() as number[];
    
    const normalizedConc = tf.tidy(() => {
      const mean = tf.tensor1d(this.concMean);
      const std = tf.tensor1d(this.concStd);
      const normalized = tf.div(tf.sub(flatLogConc, mean), tf.add(std, 1e-7));
      return normalized.reshape(concTensor.shape) as tf.Tensor3D;
    });
    
    this.isNormalized = true;
    
    return { normalizedParams, normalizedTime, normalizedConc };
  }
  
  /**
   * Prepare training inputs: (params, time) pairs
   */
  private prepareTrainingData(
    normalizedParams: tf.Tensor2D,
    normalizedTime: tf.Tensor2D,
    normalizedConc: tf.Tensor3D
  ): { inputs: tf.Tensor2D; outputs: tf.Tensor2D } {
    return tf.tidy(() => {
      // Defensive alignment: dataset sources may disagree on dimensions.
      // Concentrations define the authoritative [nSamples, nTimePoints, nSpecies] shape.
      const nSamples = Math.min(normalizedParams.shape[0], normalizedConc.shape[0]);
      const nTimePoints = Math.min(normalizedTime.shape[0], normalizedConc.shape[1]);

      if (nSamples <= 0 || nTimePoints <= 0) {
        throw new Error(
          `Invalid training data dimensions: params=${normalizedParams.shape}, time=${normalizedTime.shape}, conc=${normalizedConc.shape}`
        );
      }

      // Slice to common shapes:
      // params2d: [nSamples, nParams]
      // time2d:   [nTimePoints, 1]
      // conc3d:   [nSamples, nTimePoints, nSpecies]
      const params2d = normalizedParams.slice([0, 0], [nSamples, this.nParams]);
      const time2d = normalizedTime.slice([0, 0], [nTimePoints, 1]);
      const conc3d = normalizedConc.slice([0, 0, 0], [nSamples, nTimePoints, this.nSpecies]);

      // Expand params across time: [nSamples, 1, nParams] -> tile -> [nSamples, nTimePoints, nParams]
      const paramsTiled = params2d.expandDims(1).tile([1, nTimePoints, 1]);

      // Expand time across samples: [1, nTimePoints, 1] -> tile -> [nSamples, nTimePoints, 1]
      const timeTiled = time2d.expandDims(0).tile([nSamples, 1, 1]);

      // Concat along last axis: [nSamples, nTimePoints, nParams + 1]
      const inputs3d = tf.concat([paramsTiled, timeTiled], 2);

      // Flatten for training: [nSamples * nTimePoints, nParams + 1]
      const inputs = inputs3d.reshape([nSamples * nTimePoints, this.nParams + 1]) as tf.Tensor2D;
      const outputs = conc3d.reshape([nSamples * nTimePoints, this.nSpecies]) as tf.Tensor2D;

      return { inputs, outputs };
    });
  }
  
  /**
   * Train the surrogate model on simulation data
   */
  async train(
    data: TrainingDataset,
    config: SurrogateTrainingConfig = {}
  ): Promise<tf.History> {
    // Initialize backend with fallback support (WebGL -> WASM -> CPU)
    await initializeBackend();
    
    const {
      epochs = 100,
      batchSize = 32,
      validationSplit = 0.1,
      learningRate = 0.001,
      earlyStopping = true,
      patience = 10,
      verbose = true,
      onEpochEnd
    } = config;
    
    // Build model if not already built
    if (!this.model) {
      this.model = this.buildModel();
    }
    
    // Compile model
    this.model.compile({
      optimizer: tf.train.adam(learningRate),
      loss: 'meanSquaredError',
      metrics: ['mae']
    });
    
    // Normalize data
    const { normalizedParams, normalizedTime, normalizedConc } = this.normalizeData(data);
    
    // Prepare training data
    const { inputs, outputs } = this.prepareTrainingData(
      normalizedParams,
      normalizedTime,
      normalizedConc
    );
    
    // Training callbacks
    const callbacks: tf.CustomCallbackArgs = {};

    let bestLoss = Infinity;
    let patienceCounter = 0;

    callbacks.onEpochEnd = async (epoch, logs) => {
      // Yield to keep UI responsive and avoid long synchronous stalls.
      await tf.nextFrame();

      if (earlyStopping && logs && logs.val_loss !== undefined) {
        const valLoss = logs.val_loss as number;
        if (valLoss < bestLoss) {
          bestLoss = valLoss;
          patienceCounter = 0;
        } else {
          patienceCounter++;
          if (patienceCounter >= patience) {
            console.log(`Early stopping at epoch ${epoch}`);
            this.model!.stopTraining = true;
          }
        }
      }

      if (onEpochEnd) {
        await onEpochEnd(epoch, logs);
      }

      if (verbose && epoch % 10 === 0) {
        const loss = typeof logs?.loss === 'number' ? logs.loss.toFixed(4) : String(logs?.loss);
        const valLoss = typeof logs?.val_loss === 'number' ? logs.val_loss.toFixed(4) : String(logs?.val_loss);
        const mae = typeof logs?.mae === 'number' ? logs.mae.toFixed(4) : String(logs?.mae);
        console.log(`Epoch ${epoch}: loss=${loss}, val_loss=${valLoss}, mae=${mae}`);
      }
    };
    
    // Train model
    const history = await this.model.fit(inputs, outputs, {
      epochs,
      batchSize,
      validationSplit,
      callbacks,
      shuffle: true
    });
    
    // Cleanup
    inputs.dispose();
    outputs.dispose();
    normalizedParams.dispose();
    normalizedTime.dispose();
    normalizedConc.dispose();
    
    return history;
  }
  
  /**
   * Predict concentrations for a batch of parameters and time points
   * Uses native TF tensor batching to avoid JS iteration overhead
   */
  predictBatch(paramSets: number[][], timePoints: number[]): number[][][] {
    if (!this.model) {
      throw new Error('Model not trained yet. Call train() first.');
    }

    if (!this.isNormalized) {
      throw new Error('Model normalization parameters not set. Train the model first.');
    }

    return tf.tidy(() => {
      const tMin = 0; // Assuming time starts at 0
      const tMax = Math.max(...timePoints);
      const normalizedTime = timePoints.map(t => (t - tMin) / (tMax - tMin + 1e-7));

      // Flatten the inputs for the entire batch into a single 2D array
      const inputs: number[][] = [];
      for (const params of paramSets) {
        const normalizedParams = params.map((p, i) =>
          (p - this.paramMean[i]) / (this.paramStd[i] + 1e-7)
        );
        for (const t of normalizedTime) {
          inputs.push([...normalizedParams, t]);
        }
      }

      const inputTensor = tf.tensor2d(inputs);
      const predictions = this.model!.predict(inputTensor) as tf.Tensor2D;

      // Denormalize the whole batch in one operation
      const mean = tf.tensor1d(this.concMean);
      const std = tf.tensor1d(this.concStd);
      const unnormalized = tf.add(tf.mul(predictions, std), mean);
      const denormalized = tf.exp(unnormalized); // Reverse log transform

      const flatConcentrations = denormalized.arraySync() as number[][];

      // Re-chunk the flat output into [nParamSets, nTimePoints, nSpecies]
      const results: number[][][] = [];
      const nTimePoints = timePoints.length;
      for (let i = 0; i < paramSets.length; i++) {
        const startIdx = i * nTimePoints;
        const endIdx = startIdx + nTimePoints;
        results.push(flatConcentrations.slice(startIdx, endIdx));
      }

      return results;
    });
  }

  /**
   * Predict concentrations for given parameters and time points
   */
  predict(params: number[], timePoints: number[]): PredictionResult {
    if (!this.model) {
      throw new Error('Model not trained yet. Call train() first.');
    }
    
    if (!this.isNormalized) {
      throw new Error('Model normalization parameters not set. Train the model first.');
    }
    
    return tf.tidy(() => {
      // Normalize inputs
      const normalizedParams = params.map((p, i) => 
        (p - this.paramMean[i]) / (this.paramStd[i] + 1e-7)
      );
      
      const tMin = 0; // Assuming time starts at 0
      const tMax = Math.max(...timePoints);
      const normalizedTime = timePoints.map(t => (t - tMin) / (tMax - tMin + 1e-7));
      
      // Create input pairs
      const inputs: number[][] = normalizedTime.map(t => [...normalizedParams, t]);
      const inputTensor = tf.tensor2d(inputs);
      
      // Predict (normalized log concentrations)
      const predictions = this.model!.predict(inputTensor) as tf.Tensor2D;
      
      // Denormalize: reverse standardization and exp transform
      const denormalized = tf.tidy(() => {
        const mean = tf.tensor1d(this.concMean);
        const std = tf.tensor1d(this.concStd);
        const unnormalized = tf.add(tf.mul(predictions, std), mean);
        return tf.exp(unnormalized); // Reverse log transform
      });
      
      const concentrations = denormalized.arraySync() as number[][];
      
      return { concentrations };
    });
  }
  
  /**
   * Fast parameter sweep using the surrogate model
   */
  async parameterSweep(
    paramSets: number[][],
    timePoints: number[]
  ): Promise<number[][][]> {
    if (!this.model) {
      throw new Error('Model not trained yet. Call train() first.');
    }
    
    const results: number[][][] = [];
    
    // Batch predictions for efficiency
    const batchSize = 100;
    for (let i = 0; i < paramSets.length; i += batchSize) {
      const batch = paramSets.slice(i, Math.min(i + batchSize, paramSets.length));
      
      const batchResults = this.predictBatch(batch, timePoints);
      results.push(...batchResults);

      // Yield to keep UI responsive
      await tf.nextFrame();
    }
    
    return results;
  }
  
  /**
   * Evaluate model performance on test data
   */
  evaluate(testData: TrainingDataset): { mse: number; mae: number; r2: number[] } {
    if (!this.model) {
      throw new Error('Model not trained yet. Call train() first.');
    }
    
    const predictions: number[][][] = [];
    
    // Predict for all test samples
    for (let i = 0; i < testData.parameters.length; i++) {
      const pred = this.predict(testData.parameters[i], testData.timePoints);
      predictions.push(pred.concentrations);
    }
    
    // Compute true means per species (Pass 1)
    const trueSums = new Array(this.nSpecies).fill(0);
    const nSamples = predictions.length;
    const nTimePoints = testData.timePoints.length;
    let totalCount = 0;

    for (let i = 0; i < nSamples; i++) {
      for (let t = 0; t < nTimePoints; t++) {
        for (let s = 0; s < this.nSpecies; s++) {
          trueSums[s] += testData.concentrations[i][t][s];
        }
        totalCount++;
      }
    }

    const trueMeans = trueSums.map(sum => sum / totalCount);

    // Compute metrics (Pass 2)
    let totalMSE = 0;
    let totalMAE = 0;
    const ssResPerSpecies = new Array(this.nSpecies).fill(0);
    const ssTotPerSpecies = new Array(this.nSpecies).fill(0);
    
    for (let i = 0; i < nSamples; i++) {
      for (let t = 0; t < nTimePoints; t++) {
        for (let s = 0; s < this.nSpecies; s++) {
          const pred = predictions[i][t][s];
          const true_val = testData.concentrations[i][t][s];
          const error = pred - true_val;
          
          totalMSE += error * error;
          totalMAE += Math.abs(error);

          ssResPerSpecies[s] += error * error;
          ssTotPerSpecies[s] += (true_val - trueMeans[s]) ** 2;
        }
      }
    }
    
    const nTotal = totalCount * this.nSpecies;
    const mse = totalMSE / nTotal;
    const mae = totalMAE / nTotal;
    
    const r2PerSpecies: number[] = new Array(this.nSpecies);
    for (let s = 0; s < this.nSpecies; s++) {
      r2PerSpecies[s] = 1 - ssResPerSpecies[s] / (ssTotPerSpecies[s] + 1e-10);
    }
    
    return { mse, mae, r2: r2PerSpecies };
  }
  
  /**
   * Save model to browser storage or download
   */
  async save(name: string): Promise<void> {
    if (!this.model) {
      throw new Error('No model to save');
    }
    
    await this.model.save(`localstorage://${name}`);
    
    // Save normalization parameters
    const metadata = {
      nParams: this.nParams,
      nSpecies: this.nSpecies,
      paramMean: this.paramMean,
      paramStd: this.paramStd,
      concMean: this.concMean,
      concStd: this.concStd,
      isNormalized: this.isNormalized
    };
    
    localStorage.setItem(`${name}_metadata`, JSON.stringify(metadata));
  }
  
  /**
   * Load model from browser storage
   */
  async load(name: string): Promise<void> {
    this.model = await tf.loadLayersModel(`localstorage://${name}`) as tf.Sequential;
    
    // Load normalization parameters
    const metadataStr = localStorage.getItem(`${name}_metadata`);
    if (metadataStr) {
      const metadata = JSON.parse(metadataStr);
      this.nParams = metadata.nParams;
      this.nSpecies = metadata.nSpecies;
      this.paramMean = metadata.paramMean;
      this.paramStd = metadata.paramStd;
      this.concMean = metadata.concMean;
      this.concStd = metadata.concStd;
      this.isNormalized = metadata.isNormalized;
    }
  }
  
  /**
   * Cleanup TensorFlow resources
   */
  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
  }
}

/**
 * Generate training dataset by sampling parameter space and running ODE simulations
 */
export class SurrogateDatasetGenerator {
  /**
   * Latin Hypercube Sampling for parameter space
   */
  static latinHypercubeSample(
    paramRanges: [number, number][],
    nSamples: number
  ): number[][] {
    const nParams = paramRanges.length;
    const samples: number[][] = Array(nSamples).fill(0).map(() => Array(nParams).fill(0));
    
    for (let p = 0; p < nParams; p++) {
      const [min, max] = paramRanges[p];
      const interval = (max - min) / nSamples;
      
      // Stratified sampling
      const stratifiedSamples = Array(nSamples).fill(0).map((_, i) => {
        const lower = min + i * interval;
        const upper = min + (i + 1) * interval;
        return lower + Math.random() * (upper - lower);
      });
      
      // Shuffle
      for (let i = nSamples - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [stratifiedSamples[i], stratifiedSamples[j]] = [stratifiedSamples[j], stratifiedSamples[i]];
      }
      
      for (let i = 0; i < nSamples; i++) {
        samples[i][p] = stratifiedSamples[i];
      }
    }
    
    return samples;
  }
  
  /**
   * Generate training dataset
   * NOTE: This requires integration with the actual ODE solver
   */
  static async generateDataset(
    paramRanges: [number, number][],
    nSamples: number,
    timePoints: number[],
    simulateFunction: (params: number[]) => Promise<number[][]>
  ): Promise<TrainingDataset> {
    const parameters = this.latinHypercubeSample(paramRanges, nSamples);
    const concentrations: number[][][] = [];
    
    // Run simulations for each parameter set
    for (const params of parameters) {
      const result = await simulateFunction(params);
      concentrations.push(result);
    }
    
    return { parameters, timePoints, concentrations };
  }
}
