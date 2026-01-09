// @ts-nocheck
// src/services/ParameterEstimation.integration.ts
// Integration layer between ParameterEstimation and existing ODESolver

import type { SimulationData } from './ParameterEstimation';
// Note: ODESolver may not exist yet - this is a template for future integration
// import { ODESolver } from './ODESolver';

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
  private model: any; // BNGLModel
  private baseParameters: Map<string, number>;

  constructor(model: any) { // BNGLModel
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

    // NOTE: This is a placeholder implementation
    // In practice, integrate with your actual ODE solver (bnglService, CVODE, etc.)
    // For now, return dummy data to avoid runtime errors

    // TODO: Integrate with actual ODESolver when available
    // const solver = new ODESolver(modifiedModel);
    // const simulationResult = await solver.solve({...});

    // Placeholder: return the model parameters as dummy result
    const result = new Map<string, number[]>();
    for (const obsName of observableNames) {
      // Return time-varying dummy data
      result.set(obsName, timePoints.map(t => Math.random() * 100));
    }
    return result;

    /* Original implementation - uncomment when ODESolver is available:
    const solver = new ODESolver(modifiedModel);
    
    const simulationResult = await solver.solve({
      method: 'ode',
      t_end: Math.max(...timePoints),
      n_steps: timePoints.length,
      atol: 1e-6,
      rtol: 1e-6
    });
    
    // Extract observables at specified time points
    const result = new Map<string, number[]>();
    
    for (const obsName of observableNames) {
      const obsData = this.extractObservable(
        simulationResult,
        obsName,
        timePoints
      );
      result.set(obsName, obsData);
    }
    
    return result;
    */
  }
  /**
   * Create a copy of the model with modified parameters
   */
  private createModifiedModel(
    parameterNames: string[],
    parameterValues: number[]
  ): any { // BNGLModel
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
    simulationResult: any, // Type depends on your ODESolver return type
    observableName: string,
    timePoints: number[]
  ): number[] {
    // This implementation depends on your ODESolver's output format
    // Adjust according to your actual structure

    const values: number[] = [];

    for (const t of timePoints) {
      // Find closest time point in simulation result
      const idx = this.findClosestTimeIndex(simulationResult.timePoints, t);

      // Extract observable value at that time
      const value = simulationResult.observables[observableName]?.[idx] ?? 0;
      values.push(value);
    }

    return values;
  }

  /**
   * Find index of closest time point
   */
  private findClosestTimeIndex(timePoints: number[], targetTime: number): number {
    let minDiff = Infinity;
    let closestIdx = 0;

    for (let i = 0; i < timePoints.length; i++) {
      const diff = Math.abs(timePoints[i] - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    return closestIdx;
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

  constructor(model: any, observableNames: string[]) { // BNGLModel
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
