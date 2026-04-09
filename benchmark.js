import { performance } from 'perf_hooks';

// Simulate a mock model to test parameterSweep
class NeuralODESurrogate {
    constructor() {
        this.model = true; // just to pass the check
    }

    predict(params, timePoints) {
        // Mock some computation
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
            sum += Math.sqrt(i);
        }
        return { concentrations: [[sum]] };
    }

    async parameterSweep(paramSets, timePoints) {
        if (!this.model) {
            throw new Error('Model not trained yet. Call train() first.');
        }

        const results = [];

        // Batch predictions for efficiency
        const batchSize = 100;
        for (let i = 0; i < paramSets.length; i += batchSize) {
            const batch = paramSets.slice(i, Math.min(i + batchSize, paramSets.length));

            const batchResults = await Promise.all(
                batch.map(params => {
                    const result = this.predict(params, timePoints);
                    return result.concentrations;
                })
            );

            results.push(...batchResults);
        }

        return results;
    }
}

async function run() {
    const surrogate = new NeuralODESurrogate();
    const paramSets = Array.from({ length: 10000 }, () => [1, 2, 3]);
    const timePoints = [0, 1, 2];

    const start = performance.now();
    await surrogate.parameterSweep(paramSets, timePoints);
    const end = performance.now();

    console.log(`Duration: ${end - start} ms`);
}

run();
