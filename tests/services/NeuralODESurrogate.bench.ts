import { bench, describe } from 'vitest';
import { NeuralODESurrogate } from '../../src/services/NeuralODESurrogate';
import * as tf from '@tensorflow/tfjs';

describe('NeuralODESurrogate evaluation performance', () => {
    // We mock tf and prediction purely so evaluate can run.
    const nParams = 3;
    const nSpecies = 20;
    const surrogate = new NeuralODESurrogate(nParams, nSpecies, 'light');

    // Fake the fact that it is trained
    (surrogate as any).model = {
      predict: () => tf.tensor2d([])
    };
    (surrogate as any).isNormalized = true;
    (surrogate as any).paramMean = [0, 0, 0];
    (surrogate as any).paramStd = [1, 1, 1];
    (surrogate as any).concMean = new Array(nSpecies).fill(0);
    (surrogate as any).concStd = new Array(nSpecies).fill(1);

    // Mock predict to return somewhat random concentrations
    surrogate.predict = () => {
      const concentrations = [];
      for (let t = 0; t < 100; t++) {
        const row = [];
        for (let s = 0; s < nSpecies; s++) {
          row.push(Math.random());
        }
        concentrations.push(row);
      }
      return { concentrations };
    };

    const testData = {
        parameters: new Array(50).fill([0, 0, 0]),
        timePoints: new Array(100).fill(0).map((_, i) => i),
        concentrations: []
    };

    for (let i = 0; i < 50; i++) {
      const sample = [];
      for (let t = 0; t < 100; t++) {
        const row = [];
        for (let s = 0; s < nSpecies; s++) {
          row.push(Math.random());
        }
        sample.push(row);
      }
      testData.concentrations.push(sample);
    }

    bench('evaluate', () => {
        surrogate.evaluate(testData);
    });
});
