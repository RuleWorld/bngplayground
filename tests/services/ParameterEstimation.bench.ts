import { bench, describe } from 'vitest';
import { VariationalParameterEstimator, SimulationData, ParameterPrior } from '../../src/services/ParameterEstimation';
import * as tf from '@tensorflow/tfjs';

describe('VariationalParameterEstimator.fit', () => {
  const data: SimulationData = {
    timePoints: [0, 1, 2],
    observables: new Map([['obs1', [1, 2, 3]]])
  };
  const parameterNames = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'];
  const priors = new Map<string, ParameterPrior>();
  parameterNames.forEach(name => {
    priors.set(name, { mean: 1, std: 0.1 });
  });

  bench('fit 50 iterations', async () => {
    const estimator = new VariationalParameterEstimator({}, data, parameterNames, priors);
    await estimator.fit({ nIterations: 50, verbose: false, batchSize: 4 });
    estimator.dispose();
  });
});
