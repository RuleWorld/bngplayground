import { WebGPUODESolver, convertToGPUReactions } from './src/services/WebGPUODESolver.ts';

async function runBenchmark() {
  const gpuReactions = [
    {
      reactantIndices: [0, 1],
      reactantStoich: [1, 1],
      productIndices: [2],
      productStoich: [1],
      rateConstantIndex: 0,
      isForward: true
    }
  ];

  const solver = new WebGPUODESolver(3, gpuReactions, [0.1]);
  await solver.compile();

  const y0 = new Float32Array([100, 100, 0]);

  const t0 = 0;
  const tEnd = 10;
  const numOutputs = 100;
  const outputTimes = Array.from({length: numOutputs}, (_, i) => (i + 1) * (tEnd / numOutputs));

  const start = performance.now();
  await solver.integrate(y0, t0, tEnd, outputTimes);
  const end = performance.now();

  console.log(`Time taken: ${end - start}ms`);
}

runBenchmark().catch(console.error);
