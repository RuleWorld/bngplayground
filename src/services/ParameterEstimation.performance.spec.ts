import { VariationalParameterEstimator } from './ParameterEstimation';
import type { SimulationData } from './ParameterEstimation';
import { describe, it } from 'vitest';

describe('ParameterEstimation performance', () => {
  it('measures fit() speed', async () => {
    // Basic setup
    const timePoints = Array.from({ length: 50 }, (_, i) => i * 0.1);
    const observableData = {
      'ObsA': timePoints.map(t => Math.sin(t)),
      'ObsB': timePoints.map(t => Math.cos(t))
    };

    const data: SimulationData = {
      timePoints,
      observables: new Map(Object.entries(observableData))
    };

    const parameterNames = ['k1', 'k2', 'k3'];
    const priors = new Map([
      ['k1', { mean: 1.0, std: 0.1 }],
      ['k2', { mean: 0.5, std: 0.05 }],
      ['k3', { mean: 2.0, std: 0.2 }]
    ]);

    // Create an artificial slow simulator to emphasize the async overhead
    const simulator = async (params: Record<string, number>) => {
      // Small artificial delay to simulate async real work
      await new Promise(r => setTimeout(r, 10));

      const result = new Map<string, number[]>();
      result.set('ObsA', timePoints.map(t => Math.sin(t * params.k1)));
      result.set('ObsB', timePoints.map(t => Math.cos(t * params.k2 * params.k3)));
      return result;
    };

    const estimator = new VariationalParameterEstimator(
      null,
      data,
      parameterNames,
      priors,
      simulator
    );

    // Warm up
    await estimator.fit({ nIterations: 1, batchSize: 2, verbose: false });

    // Benchmark
    const start = performance.now();
    await estimator.fit({ nIterations: 10, batchSize: 32, verbose: false });
    const end = performance.now();

    console.log(`\n\n--- BENCHMARK RESULT ---`);
    console.log(`fit() took: ${(end - start).toFixed(2)}ms`);
    console.log(`------------------------\n\n`);
  }, 30000);
});
