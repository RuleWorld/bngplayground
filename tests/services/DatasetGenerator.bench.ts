import { bench, describe } from 'vitest';
import { SurrogateDatasetGenerator } from '../../src/services/NeuralODESurrogate';

describe('DatasetGenerator performance', () => {
    const paramRanges: [number, number][] = [[0, 1], [10, 20]];
    const nSamples = 100;
    const timePoints = [0, 1, 2, 3, 4];

    // Mock simulation function that takes 10ms
    const simulateFunction = async (params: number[]) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return [[1, 2], [3, 4]];
    };

    bench('generateDataset', async () => {
        await SurrogateDatasetGenerator.generateDataset(paramRanges, nSamples, timePoints, simulateFunction);
    }, { time: 1000, iterations: 3 });
});
