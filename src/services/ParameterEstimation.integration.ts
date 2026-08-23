// @ts-nocheck
// src/services/ParameterEstimation.integration.ts
// Integration layer between ParameterEstimation and existing ODESolver

import type { SimulationData } from './ParameterEstimation';
import { simulate } from '@bngplayground/engine';
import type { SimulationOptions, BNGLModel } from '@bngplayground/engine';

/**
 * Integration helper to connect ParameterEstimation with existing ODESolver
 * 
 * Usage:
 * 
 * const adapter = new ODESolverAdapter(model);
 * const estimator = new VariationalParameterEstimator(
 *   model,
 *   experimentalData,
 *   parameterNames,
 *   priors,
 *   adapter.simulate.bind(adapter)  // Pass simulation function
 * );
 */
export class ODESolverAdapter {
  private model: BNGLModel;
  private baseParameters: Map<string, number>;

  constructor(model: BNGLModel) {
    this.model = model;

    // Store original parameter values
    this.baseParameters = new Map();
    if (model.parameters) {
      for (const [name, value] of Object.entries(model.parameters)) {
        if (typeof value === 'number') {
          this.baseParameters.set(name, value);
        }
      }
    }
  }

  /**
   * Simulate model with given parameter values
   * This is the function to pass to VariationalParameterEstimator
   */
  async simulate(
    parameterNames: string[],
    parameterValues: number[],
    timePoints: number[],
    observableNames: string[]
  ): Promise<Map<string, number[]>> {

    // Create modified model with new parameter values
    const modifiedModel = this.createModifiedModel(parameterNames, parameterValues);

    const maxTime = Math.max(...timePoints);
    const nSteps = Math.max(1, timePoints.length - 1);
    
    const options: SimulationOptions = {
      method: 'ode',
      t_end: maxTime,
      n_steps: nSteps,
      atol: 1e-6,
      rtol: 1e-6,
      includeSpeciesData: false,
      includeExpandedNetwork: false
    };

    // WARNING: engine.simulate on the browser main thread with method:'ode' and
    // default solver (cvode) would crash because CVODESolver.cvodeModuleFactory
    // is only injected in workers. This is safe in Node (cvode_node.ts fallback)
    // and when called from a worker context. If this adapter is ever wired to a
    // browser UI, route through bnglService.simulate (lazy-imported) instead.
    const simulationResult = await simulate(
      0, // jobId
      modifiedModel,
      options,
      {
        checkCancelled: () => {},
        postMessage: () => {}
      }
    );

    // Extract observables at specified time points
    const result = new Map<string, number[]>();
    
    const data = simulationResult.data;
    const simTime = data ? data.map((row: any) => row.time) : [];

    const timeIndices: number[] = new Array(timePoints.length);
    let simIdx = 0;
    const simLen = simTime.length;
    if (simLen > 0) {
      for (let i = 0; i < timePoints.length; i++) {
        const t = timePoints[i];
        while (simIdx < simLen - 1) {
          const currentDiff = Math.abs(simTime[simIdx] - t);
          const nextDiff = Math.abs(simTime[simIdx + 1] - t);
          if (nextDiff <= currentDiff) {
            simIdx++;
          } else {
            break;
          }
        }
        timeIndices[i] = simIdx;
      }
    } else {
      timeIndices.fill(0);
    }

    for (const obsName of observableNames) {
      const obsData = this.extractObservable(
        simulationResult,
        obsName,
        timePoints,
        timeIndices
      );
      result.set(obsName, obsData);
    }
    
    return result;
  }
  /**
   * Create a copy of the model with modified parameters
   */
  private createModifiedModel(
    parameterNames: string[],
    parameterValues: number[]
  ): BNGLModel {
    const modifiedModel = { ...this.model };

    // Deep copy parameters
    modifiedModel.parameters = { ...this.model.parameters };

    // Update specified parameters
    for (let i = 0; i < parameterNames.length; i++) {
      modifiedModel.parameters[parameterNames[i]] = parameterValues[i];
    }

    return modifiedModel;
  }

  /**
   * Extract observable values at specified time points
   */
  private extractObservable(
    simulationResult: any, // SimulationResults from @bngplayground/engine
    observableName: string,
    timePoints: number[],
    timeIndices?: number[]
  ): number[] {
    const values: number[] = [];
    const data = simulationResult.data;

    if (!data || data.length === 0) {
      return timePoints.map(() => 0);
    }

    let simIdx = 0;
    const simTime = !timeIndices ? data.map((row: any) => row.time) : [];
    const simLen = simTime.length;

    for (let i = 0; i < timePoints.length; i++) {
      let idx;
      if (timeIndices) {
        idx = timeIndices[i];
      } else {
        const t = timePoints[i];
        if (simLen > 0) {
          while (simIdx < simLen - 1) {
            const currentDiff = Math.abs(simTime[simIdx] - t);
            const nextDiff = Math.abs(simTime[simIdx + 1] - t);
            if (nextDiff <= currentDiff) {
              simIdx++;
            } else {
              break;
            }
          }
          idx = simIdx;
        } else {
          idx = 0;
        }
      }

      // Extract observable value at that time
      const value = data[idx]?.[observableName] ?? 0;
      values.push(value);
    }

    return values;
  }

  /**
   * Find index of closest time point
   */
  private findClosestTimeIndex(timePoints: number[], targetTime: number): number {
    if (timePoints.length === 0) return 0;

    let left = 0;
    let right = timePoints.length - 1;

    if (targetTime <= timePoints[left]) return left;
    if (targetTime >= timePoints[right]) return right;

    while (left <= right) {
      const mid = (left + right) >> 1;

      if (timePoints[mid] === targetTime) {
        return mid;
      }

      if (timePoints[mid] < targetTime) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    const diffRight = Math.abs(timePoints[right] - targetTime);
    const diffLeft = Math.abs(timePoints[left] - targetTime);

    return diffRight < diffLeft ? right : left;
  }

  /**
   * Convenience method to prepare experimental data for parameter estimation
   */
  static prepareExperimentalData(
    timePoints: number[],
    observableData: Record<string, number[]>
  ): SimulationData {
    const observables = new Map<string, number[]>();

    for (const [name, values] of Object.entries(observableData)) {
      observables.set(name, values);
    }

    return { timePoints, observables };
  }
}

/**
 * Integration helper for NeuralODESurrogate
 */
export class SurrogateSimulationFunction {
  private adapter: ODESolverAdapter;
  private observableNames: string[];

  constructor(model: BNGLModel, observableNames: string[]) {
    this.adapter = new ODESolverAdapter(model);
    this.observableNames = observableNames;
  }

  /**
   * Create simulation function for surrogate training
   * Returns a function that takes parameters and returns concentration matrix
   */
  createSimulationFunction(
    parameterNames: string[],
    timePoints: number[]
  ): (params: number[]) => Promise<number[][]> {
    return async (params: number[]): Promise<number[][]> => {
      const result = await this.adapter.simulate(
        parameterNames,
        params,
        timePoints,
        this.observableNames
      );

      // Convert Map to 2D array: [timePoints, species]
      const matrix: number[][] = [];

      for (let t = 0; t < timePoints.length; t++) {
        const row: number[] = [];
        for (const obsName of this.observableNames) {
          const values = result.get(obsName) ?? [];
          row.push(values[t] ?? 0);
        }
        matrix.push(row);
      }

      return matrix;
    };
  }
}

/**
 * Example usage:
 * 
 * // For Parameter Estimation
 * import { VariationalParameterEstimator } from './ParameterEstimation';
 * import { ODESolverAdapter } from './ParameterEstimation.integration';
 * 
 * const adapter = new ODESolverAdapter(model);
 * const experimentalData = ODESolverAdapter.prepareExperimentalData(
 *   [0, 10, 20, 30, 40, 50],
 *   {
 *     'Receptor_bound': [0, 20, 45, 68, 82, 90],
 *     'Signaling_active': [0, 5, 18, 35, 52, 65]
 *   }
 * );
 * 
 * const estimator = new VariationalParameterEstimator(
 *   model,
 *   experimentalData,
 *   ['k_bind', 'k_unbind'],
 *   priors
 * );
 * 
 * // Override simulate method to use real solver
 * estimator.simulateWithParams = async (params: number[]) => {
 *   return adapter.simulate(
 *     ['k_bind', 'k_unbind'],
 *     params,
 *     experimentalData.timePoints,
 *     ['Receptor_bound', 'Signaling_active']
 *   );
 * };
 * 
 * const result = await estimator.fit();
 * 
 * // For Neural Surrogate
 * import { SurrogateDatasetGenerator } from './NeuralODESurrogate';
 * import { SurrogateSimulationFunction } from './ParameterEstimation.integration';
 * 
 * const surrogateHelper = new SurrogateSimulationFunction(
 *   model,
 *   ['Receptor_bound', 'Signaling_active', 'Complex_AB']
 * );
 * 
 * const timePoints = Array.from({ length: 101 }, (_, i) => i);
 * const simulateFunc = surrogateHelper.createSimulationFunction(
 *   ['k_bind', 'k_unbind', 'k_activate'],
 *   timePoints
 * );
 * 
 * const trainingData = await SurrogateDatasetGenerator.generateDataset(
 *   [[0.01, 1.0], [0.001, 0.5], [0.1, 2.0]],  // parameter ranges
 *   500,  // number of samples
 *   timePoints,
 *   simulateFunc  // our wrapped simulation function
 * );
 */
