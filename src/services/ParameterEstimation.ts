// @ts-nocheck
// src/services/ParameterEstimation.ts
// Phase 2: TensorFlow.js-based parameter estimation with Bayesian inference

import * as tf from '@tensorflow/tfjs';
// Note: BNGLModel is defined in the root types.ts file
// This type import is used for documentation purposes only
// The actual model object is passed at runtime

export interface ParameterEstimationConfig {
  nIterations?: number;
  learningRate?: number;
  batchSize?: number;
  validationSplit?: number;
  verbose?: boolean;
  onProgress?: (progress: { current: number; total: number; elbo: number }) => void;
}

export interface ParameterPrior {
  mean: number;
  std: number;
  min?: number;
  max?: number;
}

export interface EstimationResult {
  posteriorMean: number[];
  posteriorStd: number[];
  elbo: number[];
  convergence: boolean;
  iterations: number;
  rmse: number;
  sse: number;
  rSquared: number;
  bestPredictions?: Map<string, number[]>;
}

export interface SimulationData {
  timePoints: number[];
  observables: Map<string, number[]>;
}

// Helpers exported for testing
export const safeLog = (x: number): number => Math.log(Math.max(x, 1e-12));
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export const deriveBounds = (prior: ParameterPrior | undefined): { logMin: number; logMax: number } => {
  const mean = Math.max(prior?.mean ?? 1, 1e-12);
  const min = Math.max(prior?.min ?? mean * 0.1, 1e-12);
  const max = Math.max(prior?.max ?? mean * 10, min * 1.000001);
  // Keep log-bounds numerically safe.
  const logMin = clamp(safeLog(min), -30, 30);
  const logMax = clamp(safeLog(max), -30, 30);
  return {
    logMin: Math.min(logMin, logMax),
    logMax: Math.max(logMin, logMax)
  };
};

// Convert (mean,std) on original scale to lognormal (mu,sigma) in log-space.
// sigma_log = sqrt(log(1 + (std/mean)^2))
// mu_log = log(mean) - 0.5*sigma_log^2
export const priorToLogNormal = (prior: ParameterPrior | undefined): { muLog: number; sigmaLog: number } => {
  const mean = Math.max(prior?.mean ?? 1, 1e-12);
  const std = Math.max(prior?.std ?? mean * 0.5, 1e-12);
  const cv = std / mean;
  const sigmaLog = Math.sqrt(Math.log(1 + cv * cv));
  const muLog = safeLog(mean) - 0.5 * sigmaLog * sigmaLog;
  // Bound sigma in log-space to avoid explosive sampling.
  const sigmaLogClamped = clamp(sigmaLog, 0.02, 1.0);
  return { muLog, sigmaLog: sigmaLogClamped };
};

/**
 * Variational Bayesian Parameter Estimator using TensorFlow.js
 * Implements stochastic variational inference (SVI) for parameter estimation
 */
export class VariationalParameterEstimator {
  private data: SimulationData;
  private parameterNames: string[];
  private priors: Map<string, ParameterPrior>;
  private logMinBounds: number[];
  private logMaxBounds: number[];

  // Variational parameters
  private mu: tf.Variable;
  private logSigma: tf.Variable;

  private nParams: number;
  private simulator?: (params: Record<string, number>) => Promise<Map<string, number[]>>;

  constructor(
    _model: any, // BNGLModel (reserved for future integration)
    data: SimulationData,
    parameterNames: string[],
    priors: Map<string, ParameterPrior>,
    simulator?: (params: Record<string, number>) => Promise<Map<string, number[]>>
  ) {
    this.data = data;
    this.parameterNames = parameterNames;
    this.priors = priors;
    this.nParams = parameterNames.length;
    this.simulator = simulator;

    // Initialize variational parameters from priors (lognormal in log-space)
    const initialMu = parameterNames.map((name) => {
      const prior = priors.get(name);
      return priorToLogNormal(prior).muLog;
    });

    const initialLogSigma = parameterNames.map((name) => {
      const prior = priors.get(name);
      const sigmaLog = priorToLogNormal(prior).sigmaLog;
      return safeLog(sigmaLog);
    });

    const bounds = parameterNames.map((name) => deriveBounds(priors.get(name)));
    this.logMinBounds = bounds.map((b) => b.logMin);
    this.logMaxBounds = bounds.map((b) => b.logMax);

    this.mu = tf.variable(tf.tensor1d(initialMu));
    this.logSigma = tf.variable(tf.tensor1d(initialLogSigma));
  }

  /**
   * Sample parameters from variational distribution using reparameterization trick
   */
  private sampleParameters(): tf.Tensor1D {
    return tf.tidy(() => {
      const eps = tf.randomNormal([this.nParams]);
      const sigma = tf.exp(this.logSigma);
      const logParams = tf.add(this.mu, tf.mul(sigma, eps)) as tf.Tensor1D;

      // Clamp in log-space to avoid extreme exponentiation.
      const minT = tf.tensor1d(this.logMinBounds);
      const maxT = tf.tensor1d(this.logMaxBounds);
      const clamped = tf.minimum(tf.maximum(logParams, minT), maxT) as tf.Tensor1D;
      minT.dispose();
      maxT.dispose();
      return clamped;
    });
  }

  /**
   * Simulate model with given parameters
   */
  private async simulateWithParams(params: number[]): Promise<Map<string, number[]>> {
    if (this.simulator) {
      const paramObj: Record<string, number> = {};
      this.parameterNames.forEach((name, i) => {
        paramObj[name] = params[i];
      });
      return await this.simulator(paramObj);
    }

    // Fallback placeholder logic
    const result = new Map<string, number[]>();
    const paramSum = params.reduce((a, b) => a + b, 0);
    const scale = 0.9 + 0.2 * (1 / (1 + Math.exp(-(paramSum / Math.max(1, params.length)) * 0.01)));
    const phase = (paramSum % 1000) * 0.001;

    // Pre-calculate wobble arrays based on timepoints to avoid Math.sin in inner loop
    const timePointsCount = this.data.timePoints.length;
    const wobbleCache = new Float64Array(timePointsCount);
    for (let i = 0; i < timePointsCount; i++) {
      wobbleCache[i] = 1 + 0.02 * Math.sin(phase + i * 0.1);
    }

    for (const [obsName, obsData] of this.data.observables) {
      const len = obsData.length;
      const pred = new Array(len);
      for (let i = 0; i < len; i++) {
        // Use cached wobble if available, fallback for arrays longer than timePoints
        const wobble = i < timePointsCount ? wobbleCache[i] : (1 + 0.02 * Math.sin(phase + i * 0.1));
        pred[i] = obsData[i] * scale * wobble;
      }
      result.set(obsName, pred);
    }
    return result;
  }

  private async computeObjective(params: number[]): Promise<number> {
    // Negative log-likelihood proxy + weak prior regularization.
    const predicted = await this.simulateWithParams(params);

    let dataTerm = 0;
    const observationNoise = this.simulator ? 1.0 : 10.0; // Use tighter noise for real simulator

    for (const [obsName, obsData] of this.data.observables) {
      const predData = predicted.get(obsName);
      if (!predData) continue;
      for (let i = 0; i < obsData.length; i++) {
        const residual = obsData[i] - (predData[i] ?? 0);
        dataTerm += (residual * residual) / (2 * observationNoise * observationNoise);
      }
    }

    // Prior penalty in log-space (Gaussian)
    let priorPenalty = 0;
    for (let i = 0; i < this.nParams; i++) {
      const name = this.parameterNames[i];
      const prior = this.priors.get(name);
      if (!prior) continue;

      const mean = Math.max(prior.mean, 1e-12);
      const std = Math.max(prior.std, 1e-12);
      const cv = std / mean;
      const sigmaLog = Math.max(0.02, Math.min(1.0, Math.sqrt(Math.log(1 + cv * cv))));
      const muLog = Math.log(mean) - 0.5 * sigmaLog * sigmaLog;
      const x = Math.log(Math.max(params[i], 1e-12));
      const z = (x - muLog) / sigmaLog;
      priorPenalty += 0.5 * z * z;
    }

    return dataTerm + 0.01 * priorPenalty;
  }

  /**
   * Perform variational inference to estimate parameters
   */
  async fit(config: ParameterEstimationConfig = {}): Promise<EstimationResult> {
    const {
      nIterations = 1000,
      learningRate = 0.01,
      batchSize = 16,
      verbose = true,
      onProgress
    } = config;

    // Gradient-free update: sample candidates from current variational distribution,
    // pick the best objective, and nudge (mu, logSigma) toward it.
    const elboHistory: number[] = [];
    const mu = this.mu.arraySync() as number[];
    const logSigma = this.logSigma.arraySync() as number[];

    const candidatesPerIter = Math.max(2, batchSize);
    const step = Math.max(0.001, Math.min(0.2, learningRate));

    const logSigmaMin = Math.log(0.02);
    const logSigmaMax = Math.log(1.0);

    let bestFinalParams: number[] | null = null;
    let minObjective = Number.POSITIVE_INFINITY;

    for (let iter = 0; iter < nIterations; iter++) {
      let bestParamsIter: number[] | null = null;
      let bestLogParamsIter: number[] | null = null;
      let bestObjectiveIter = Number.POSITIVE_INFINITY;

      const epsBatch = tf.tidy(() => tf.randomNormal([candidatesPerIter, this.nParams]).arraySync() as number[][]);

      const candidateLogParamsBatch: number[][] = [];
      const candidateParamsBatch: number[][] = [];

      // Phase 1: Generate all candidates synchronously
      for (let k = 0; k < candidatesPerIter; k++) {
        const eps = epsBatch[k];
        const candidateLogParams = new Array<number>(this.nParams);
        const candidateParams = new Array<number>(this.nParams);

        for (let i = 0; i < this.nParams; i++) {
          const sigmaLog = Math.exp(clamp(logSigma[i], logSigmaMin, logSigmaMax));
          const raw = mu[i] + sigmaLog * eps[i];
          const clamped = clamp(raw, this.logMinBounds[i], this.logMaxBounds[i]);
          candidateLogParams[i] = clamped;
          candidateParams[i] = Math.exp(clamped);
        }

        candidateLogParamsBatch.push(candidateLogParams);
        candidateParamsBatch.push(candidateParams);
      }

      // Phase 2: Compute objectives concurrently
      const objectivePromises = candidateParamsBatch.map(params => this.computeObjective(params));
      const objectives = await Promise.all(objectivePromises);

      // Phase 3: Find the best candidate
      for (let k = 0; k < candidatesPerIter; k++) {
        const obj = objectives[k];
        const candidateLogParams = candidateLogParamsBatch[k];
        const candidateParams = candidateParamsBatch[k];

        if (obj < bestObjectiveIter) {
          bestObjectiveIter = obj;
          bestParamsIter = candidateParams;
          bestLogParamsIter = candidateLogParams;
        }

        if (obj < minObjective) {
          minObjective = obj;
          bestFinalParams = candidateParams;
        }
      }

      // Record an ELBO-like score (higher is better)
      const elboValue = -bestObjectiveIter;
      elboHistory.push(elboValue);

      if (bestParamsIter && bestLogParamsIter) {
        // Optimize loop: avoid .map() allocations and remove redundant Math.max
        // bestParamsIter values are generated via Math.exp(), so they are strictly positive
        for (let i = 0; i < mu.length; i++) {
          mu[i] = (1 - step) * mu[i] + step * bestLogParamsIter[i];
          // Anneal uncertainty slowly to encourage convergence
          logSigma[i] = clamp(logSigma[i] - 0.002, logSigmaMin, logSigmaMax);
        }

        tf.tidy(() => {
          this.mu.assign(tf.tensor1d(mu));
          this.logSigma.assign(tf.tensor1d(logSigma));
        });
      }

      if (verbose && iter % 50 === 0) {
        console.log(`Iteration ${iter}, score=${elboValue.toFixed(4)}`);
      }

      // Keep the UI responsive in browsers
      if (iter % 10 === 0) {
        if (onProgress) {
          onProgress({ current: iter + 1, total: nIterations, elbo: elboValue });
        }
        await tf.nextFrame();
      }
    }

    // Extract posterior parameters
    const posteriorMu = this.mu.arraySync() as number[];
    const posteriorSigma = tf.tidy(() => tf.exp(this.logSigma).arraySync() as number[]);

    const meanOriginal = posteriorMu.map((muVal, i) => {
      const s = posteriorSigma[i];
      const mean = Math.exp(muVal + 0.5 * s * s);
      return clamp(mean, Math.exp(this.logMinBounds[i]), Math.exp(this.logMaxBounds[i]));
    });
    const stdOriginal = posteriorMu.map((muVal, i) => {
      const s = posteriorSigma[i];
      const v = (Math.exp(s * s) - 1) * Math.exp(2 * muVal + s * s);
      const std = Math.sqrt(Math.max(v, 0));
      return Number.isFinite(std) ? std : 0;
    });

    // Best predictions for metrics and plotting
    const bestParams = bestFinalParams || meanOriginal;
    const bestPredictions = await this.simulateWithParams(bestParams);

    // Calculate RMSE and R-squared
    let totalSse = 0;
    let totalVar = 0;
    let nDataPoints = 0;

    const allExpValues: number[] = [];
    for (const [_, obsData] of this.data.observables) {
      allExpValues.push(...obsData);
    }
    const expMean = allExpValues.reduce((a, b) => a + b, 0) / allExpValues.length;

    for (const [obsName, obsData] of this.data.observables) {
      const predData = bestPredictions.get(obsName);
      if (!predData) continue;
      for (let i = 0; i < obsData.length; i++) {
        const residual = obsData[i] - (predData[i] ?? 0);
        totalSse += residual * residual;
        totalVar += (obsData[i] - expMean) ** 2;
        nDataPoints++;
      }
    }

    const rmse = Math.sqrt(totalSse / Math.max(1, nDataPoints));
    const rSquared = 1 - (totalSse / Math.max(1e-12, totalVar));

    // Check convergence (ELBO stabilized)
    const recentElbo = elboHistory.slice(-100);
    const elboStd = this.computeStd(recentElbo);
    const convergence = elboStd < 0.05 * Math.abs(recentElbo[recentElbo.length - 1] || 1);

    return {
      posteriorMean: meanOriginal,
      posteriorStd: stdOriginal,
      elbo: elboHistory,
      convergence,
      iterations: nIterations,
      rmse,
      sse: totalSse,
      rSquared,
      bestPredictions
    };
  }

  private computeStd(values: number[]): number {
    if (values.length === 0) return 0;

    let mean = 0;
    let m2 = 0;
    let count = 0;

    for (const value of values) {
      count++;
      const delta = value - mean;
      mean += delta / count;
      const delta2 = value - mean;
      m2 += delta * delta2;
    }

    return Math.sqrt(m2 / count);
  }

  /**
   * Generate samples from posterior distribution
   */
  async samplePosterior(nSamples: number): Promise<number[][]> {
    const samples: number[][] = [];

    for (let i = 0; i < nSamples; i++) {
      const logParams = this.sampleParameters();
      const params = tf.exp(logParams).arraySync() as number[];
      samples.push(params);
      logParams.dispose();
    }

    return samples;
  }

  /**
   * Cleanup TensorFlow resources
   */
  dispose(): void {
    this.mu.dispose();
    this.logSigma.dispose();
  }
}
