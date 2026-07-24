/**
 * VirtualPopulation.ts – Virtual patient population generation with correlated
 * parameters, covariate effects, and population simulation orchestration.
 */

import type { SimulationResults } from '../../types';


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PopulationParameter {
  name: string;
  distribution: 'log_normal' | 'normal' | 'uniform';
  mean: number;
  cv: number;
  min?: number;
  max?: number;
  correlations?: Record<string, number>;
}

export interface CovariateEffect {
  type: 'power' | 'linear' | 'exponential';
  coefficient: number;
  reference: number;
}

export interface Covariate {
  name: string;
  distribution: 'normal' | 'uniform';
  mean: number;
  sd?: number;
  min?: number;
  max?: number;
  effects: Record<string, CovariateEffect>;
}

export interface VirtualPopulationConfig {
  nPatients: number;
  parameters: PopulationParameter[];
  covariates?: Covariate[];
  seed?: number;
}

export interface VirtualPatient {
  id: number;
  parameters: Record<string, number>;
  covariates?: Record<string, number>;
}

export interface PopulationSimulationResult {
  patients: VirtualPatient[];
  results: SimulationResults[];
  summary: {
    meanProfile: Record<string, number>[];
    percentile5: Record<string, number>[];
    percentile95: Record<string, number>[];
    medianProfile: Record<string, number>[];
  };
}

// ---------------------------------------------------------------------------
// Seeded PRNG: xorshift128
// ---------------------------------------------------------------------------

class XorShift128 {
  private s: Uint32Array;

  constructor(seed: number) {
    this.s = new Uint32Array(4);
    // Initialize state from seed using splitmix32
    let z = seed >>> 0;
    for (let i = 0; i < 4; i++) {
      z = (z + 0x9e3779b9) >>> 0;
      let t = z;
      t = Math.imul(t ^ (t >>> 16), 0x85ebca6b) >>> 0;
      t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35) >>> 0;
      t = (t ^ (t >>> 16)) >>> 0;
      this.s[i] = t || 1; // Ensure non-zero
    }
  }

  /** Returns a random number in [0, 1). */
  next(): number {
    let t = this.s[3];
    const s = this.s[0];
    this.s[3] = this.s[2];
    this.s[2] = this.s[1];
    this.s[1] = s;
    t = (t ^ (t << 11)) >>> 0;
    t = (t ^ (t >>> 8)) >>> 0;
    this.s[0] = (t ^ s ^ (s >>> 19)) >>> 0;
    return (this.s[0] >>> 0) / 4294967296;
  }
}

// ---------------------------------------------------------------------------
// Box-Muller transform for Gaussian sampling
// ---------------------------------------------------------------------------

function boxMuller(rng: XorShift128): [number, number] {
  let u1: number, u2: number;
  do {
    u1 = rng.next();
  } while (u1 === 0);
  u2 = rng.next();
  const mag = Math.sqrt(-2 * Math.log(u1));
  const z0 = mag * Math.cos(2 * Math.PI * u2);
  const z1 = mag * Math.sin(2 * Math.PI * u2);
  return [z0, z1];
}

function sampleStandardNormal(rng: XorShift128): number {
  return boxMuller(rng)[0];
}

// ---------------------------------------------------------------------------
// Cholesky decomposition
// ---------------------------------------------------------------------------

/**
 * Compute the lower-triangular Cholesky factor L such that A = L * L^T.
 * Input: n x n symmetric positive-definite matrix as a flat row-major array.
 */
function choleskyDecomposition(matrix: number[], n: number): number[] {
  const L = new Array(n * n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i * n + k] * L[j * n + k];
      }
      if (i === j) {
        const diag = matrix[i * n + i] - sum;
        L[i * n + j] = diag > 0 ? Math.sqrt(diag) : 0;
      } else {
        const lJJ = L[j * n + j];
        L[i * n + j] = lJJ > 0 ? (matrix[i * n + j] - sum) / lJJ : 0;
      }
    }
  }

  return L;
}

// ---------------------------------------------------------------------------
// Population generation
// ---------------------------------------------------------------------------

/**
 * Generate a virtual population of patients with correlated PK parameters
 * and optional covariate effects.
 */
export function generatePopulation(config: VirtualPopulationConfig): VirtualPatient[] {
  const rng = new XorShift128(config.seed ?? 42);
  const { nPatients, parameters, covariates } = config;
  const nParams = parameters.length;

  // Build correlation matrix (default: identity)
  const corrMatrix = new Array(nParams * nParams).fill(0);
  for (let i = 0; i < nParams; i++) {
    corrMatrix[i * nParams + i] = 1.0;
    const corrs = parameters[i].correlations;
    if (corrs) {
      for (let j = 0; j < nParams; j++) {
        if (i !== j && corrs[parameters[j].name] !== undefined) {
          const rho = corrs[parameters[j].name];
          corrMatrix[i * nParams + j] = rho;
          corrMatrix[j * nParams + i] = rho;
        }
      }
    }
  }

  // Cholesky decomposition
  const L = choleskyDecomposition(corrMatrix, nParams);

  // Generate patients
  const patients: VirtualPatient[] = [];

  for (let patientId = 0; patientId < nPatients; patientId++) {
    // Generate independent standard normals
    const z = new Array(nParams);
    for (let i = 0; i < nParams; i++) {
      z[i] = sampleStandardNormal(rng);
    }

    // Apply Cholesky to get correlated normals
    const zCorr = new Array(nParams).fill(0);
    for (let i = 0; i < nParams; i++) {
      for (let j = 0; j <= i; j++) {
        zCorr[i] += L[i * nParams + j] * z[j];
      }
    }

    // Transform to parameter distributions
    const paramValues: Record<string, number> = {};
    for (let i = 0; i < nParams; i++) {
      const p = parameters[i];
      let value: number;

      switch (p.distribution) {
        case 'log_normal': {
          // sigma^2 = log(1 + CV^2), mu = log(mean) - sigma^2/2
          const sigma = Math.sqrt(Math.log(1 + p.cv * p.cv));
          const mu = Math.log(p.mean) - sigma * sigma / 2;
          value = Math.exp(mu + sigma * zCorr[i]);
          break;
        }
        case 'normal': {
          const sd = p.mean * p.cv;
          value = p.mean + sd * zCorr[i];
          break;
        }
        case 'uniform': {
          // Map normal CDF to uniform range
          const u = 0.5 * (1 + erf(zCorr[i] / Math.SQRT2));
          const lo = p.min ?? p.mean * (1 - p.cv);
          const hi = p.max ?? p.mean * (1 + p.cv);
          value = lo + u * (hi - lo);
          break;
        }
        default:
          value = p.mean;
      }

      // Clamp to bounds
      if (p.min !== undefined) value = Math.max(p.min, value);
      if (p.max !== undefined) value = Math.min(p.max, value);

      paramValues[p.name] = value;
    }

    // Generate covariates and apply effects
    let covariateValues: Record<string, number> | undefined;
    if (covariates && covariates.length > 0) {
      covariateValues = {};
      for (const cov of covariates) {
        let covValue: number;
        switch (cov.distribution) {
          case 'normal': {
            const sd = cov.sd ?? cov.mean * 0.1;
            covValue = cov.mean + sd * sampleStandardNormal(rng);
            break;
          }
          case 'uniform': {
            const lo = cov.min ?? cov.mean * 0.5;
            const hi = cov.max ?? cov.mean * 1.5;
            covValue = lo + rng.next() * (hi - lo);
            break;
          }
          default:
            covValue = cov.mean;
        }
        if (cov.min !== undefined) covValue = Math.max(cov.min, covValue);
        if (cov.max !== undefined) covValue = Math.min(cov.max, covValue);
        covariateValues[cov.name] = covValue;

        // Apply covariate effects on parameters
        for (const [paramName, effect] of Object.entries(cov.effects)) {
          if (paramValues[paramName] === undefined) continue;
          const baseValue = paramValues[paramName];
          switch (effect.type) {
            case 'power':
              // CL_i = CL_typ * (COV_i / REF)^coeff
              paramValues[paramName] = baseValue * Math.pow(covValue / effect.reference, effect.coefficient);
              break;
            case 'linear':
              // CL_i = CL_typ * (1 + coeff * (COV_i - REF))
              paramValues[paramName] = baseValue * (1 + effect.coefficient * (covValue - effect.reference));
              break;
            case 'exponential':
              // CL_i = CL_typ * exp(coeff * (COV_i - REF))
              paramValues[paramName] = baseValue * Math.exp(effect.coefficient * (covValue - effect.reference));
              break;
          }
        }
      }
    }

    patients.push({
      id: patientId,
      parameters: paramValues,
      covariates: covariateValues,
    });
  }

  return patients;
}

// ---------------------------------------------------------------------------
// Error function approximation (for uniform distribution mapping)
// ---------------------------------------------------------------------------

function erf(x: number): number {
  // Abramowitz and Stegun approximation 7.1.26
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

// ---------------------------------------------------------------------------
// Population simulation
// ---------------------------------------------------------------------------

export type SimulatorFunction = (
  modelCode: string,
  parameterOverrides: Record<string, number>,
) => Promise<SimulationResults>;

/**
 * Run a simulation for each virtual patient in the population, collecting
 * individual results and computing summary statistics (mean, median, 5th/95th
 * percentiles).
 *
 * @param modelCode       The base BNGL model code.
 * @param population      Array of virtual patients.
 * @param dosingRegimen   The dosing regimen (used for documentation; dosing events
 *                        should already be embedded in the model or phases).
 * @param observableName  The observable to summarize.
 * @param simulator       A callback that runs a single simulation given model code
 *                        and parameter overrides.
 * @param onProgress      Optional progress callback (called with fraction complete).
 */
export async function populationSimulation(
  modelCode: string,
  population: VirtualPatient[],
  observableName: string,
  simulator: SimulatorFunction,
  onProgress?: (fraction: number) => void,
): Promise<PopulationSimulationResult> {
  const allResults: SimulationResults[] = [];

  for (let i = 0; i < population.length; i++) {
    const patient = population[i];
    const result = await simulator(modelCode, patient.parameters);
    allResults.push(result);
    if (onProgress) {
      onProgress((i + 1) / population.length);
    }
  }

  // Compute summary statistics
  const nTimePoints = allResults.length > 0 ? allResults[0].data.length : 0;
  const meanProfile: Record<string, number>[] = [];
  const medianProfile: Record<string, number>[] = [];
  const percentile5: Record<string, number>[] = [];
  const percentile95: Record<string, number>[] = [];

  for (let t = 0; t < nTimePoints; t++) {
    const timeVal = allResults[0].data[t]['time'];
    const values: number[] = [];
    for (const res of allResults) {
      if (res.data[t]) {
        values.push(res.data[t][observableName] ?? 0);
      }
    }
    values.sort((a, b) => a - b);

    const n = values.length;
    const mean = n > 0 ? values.reduce((s, v) => s + v, 0) / n : 0;
    const median = n > 0 ? percentile(values, 0.5) : 0;
    const p5 = n > 0 ? percentile(values, 0.05) : 0;
    const p95 = n > 0 ? percentile(values, 0.95) : 0;

    meanProfile.push({ time: timeVal, [observableName]: mean });
    medianProfile.push({ time: timeVal, [observableName]: median });
    percentile5.push({ time: timeVal, [observableName]: p5 });
    percentile95.push({ time: timeVal, [observableName]: p95 });
  }

  return {
    patients: population,
    results: allResults,
    summary: {
      meanProfile,
      medianProfile,
      percentile5,
      percentile95,
    },
  };
}

/**
 * Compute the p-th percentile from a sorted array (linear interpolation).
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * Summarizes virtual patient population parameters by calculating the mean and CV (coefficient of variation).
 */
export function summarizePopulationParameters(population: VirtualPatient[]): Record<string, { mean: number; cv: number }> {
  if (population.length === 0) return {};
  const firstPatientParams = population[0].parameters || {};
  const names = Object.keys(firstPatientParams);

  const summary: Record<string, { mean: number; cv: number }> = {};
  for (const name of names) {
    const values = population.map((p) => p.parameters[name]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const cv = mean !== 0 ? Math.sqrt(variance) / mean : 0;
    summary[name] = { mean, cv };
  }
  return summary;
}
