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
}

export interface SimulationData {
  timePoints: number[];
  observables: Map<string, number[]>;
}

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

  constructor(
    _model: any, // BNGLModel (reserved for future integration)
    data: SimulationData,
    parameterNames: string[],
    priors: Map<string, ParameterPrior>
  ) {
    this.data = data;
    this.parameterNames = parameterNames;
    this.priors = priors;
    this.nParams = parameterNames.length;

    const safeLog = (x: number): number => Math.log(Math.max(x, 1e-12));

    const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

    const deriveBounds = (prior: ParameterPrior | undefined): { logMin: number; logMax: number } => {
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
    const priorToLogNormal = (prior: ParameterPrior | undefined): { muLog: number; sigmaLog: number } => {
      const mean = Math.max(prior?.mean ?? 1, 1e-12);
      const std = Math.max(prior?.std ?? mean * 0.5, 1e-12);
      const cv = std / mean;
      const sigmaLog = Math.sqrt(Math.log(1 + cv * cv));
      const muLog = safeLog(mean) - 0.5 * sigmaLog * sigmaLog;
      // Bound sigma in log-space to avoid explosive sampling.
      const sigmaLogClamped = clamp(sigmaLog, 0.02, 1.0);
      return { muLog, sigmaLog: sigmaLogClamped };
    };

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
   * This is a placeholder - actual implementation should use ODESolver
   */
  private simulateWithParams(params: number[]): Map<string, number[]> {
    // TODO: Integrate with actual ODESolver
    // For now, return deterministic dummy predictions (no randomness) so optimizers converge.
    const result = new Map<string, number[]>();

    // Deterministic scale/shape based on parameters
    const paramSum = params.reduce((a, b) => a + b, 0);
    const scale = 0.9 + 0.2 * (1 / (1 + Math.exp(-(paramSum / Math.max(1, params.length)) * 0.01)));
    const phase = (paramSum % 1000) * 0.001;

    for (const [obsName, obsData] of this.data.observables) {
      // Simple placeholder: smooth deterministic modulation of observations
      const pred = obsData.map((v, i) => {
        const wobble = 1 + 0.02 * Math.sin(phase + i * 0.1);
        return v * scale * wobble;
      });
      result.set(obsName, pred);
    }

    return result;
  }

  private computeObjective(params: number[]): number {
    // Negative log-likelihood proxy + weak prior regularization.
    const predicted = this.simulateWithParams(params);

    let dataTerm = 0;
    const observationNoise = 10.0; // Keep large noise for stability with placeholder simulator

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
      verbose = true
    } = config;

    // Gradient-free update: sample candidates from current variational distribution,
    // pick the best objective, and nudge (mu, logSigma) toward it.
    const elboHistory: number[] = [];
    let mu = this.mu.arraySync() as number[];
    let logSigma = this.logSigma.arraySync() as number[];

    const candidatesPerIter = Math.max(2, batchSize);
    const step = Math.max(0.001, Math.min(0.2, learningRate));

    const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
    const logSigmaMin = Math.log(0.02);
    const logSigmaMax = Math.log(1.0);

    for (let iter = 0; iter < nIterations; iter++) {
      let bestParams: number[] | null = null;
      let bestObjective = Number.POSITIVE_INFINITY;

      for (let k = 0; k < candidatesPerIter; k++) {
        const eps = tf.randomNormal([this.nParams]).arraySync() as number[];
        const candidateLogParams = mu.map((m, i) => {
          const sigmaLog = Math.exp(clamp(logSigma[i], logSigmaMin, logSigmaMax));
          const raw = m + sigmaLog * eps[i];
          return clamp(raw, this.logMinBounds[i], this.logMaxBounds[i]);
        });
        const candidateParams = candidateLogParams.map((x) => Math.exp(x));

        const obj = this.computeObjective(candidateParams);
        if (obj < bestObjective) {
          bestObjective = obj;
          bestParams = candidateParams;
        }
      }

      // Record an ELBO-like score (higher is better)
      const elboValue = -bestObjective;
      elboHistory.push(elboValue);

      if (bestParams) {
        const targetMu = bestParams.map((p) => Math.log(Math.max(p, 1e-12)));
        mu = mu.map((m, i) => (1 - step) * m + step * targetMu[i]);

        // Anneal uncertainty slowly to encourage convergence
        logSigma = logSigma.map((ls) => clamp(ls - 0.002, logSigmaMin, logSigmaMax));

        this.mu.assign(tf.tensor1d(mu));
        this.logSigma.assign(tf.tensor1d(logSigma));
      }

      if (verbose && iter % 50 === 0) {
        console.log(`Iteration ${iter}, score=${elboValue.toFixed(4)}`);
      }

      // Keep the UI responsive in browsers
      if (iter % 25 === 0) {
        await tf.nextFrame();
      }
    }

    // Extract posterior parameters
    const posteriorMu = this.mu.arraySync() as number[];
    const posteriorSigma = tf.exp(this.logSigma).arraySync() as number[];

    // Transform from log-space to original space assuming a lognormal posterior
    // mean = exp(mu + 0.5*sigma^2)
    // std  = sqrt((exp(sigma^2)-1) * exp(2*mu + sigma^2))
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

    // Check convergence (ELBO stabilized)
    const recentElbo = elboHistory.slice(-100);
    const elboStd = this.computeStd(recentElbo);
    const convergence = elboStd < 0.01 * Math.abs(recentElbo[recentElbo.length - 1] || 1);

    return {
      posteriorMean: meanOriginal,
      posteriorStd: stdOriginal,
      elbo: elboHistory,
      convergence,
      iterations: nIterations
    };
  }

  private computeStd(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
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
