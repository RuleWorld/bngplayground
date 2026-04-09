import { ODESolverAdapter } from './src/services/ParameterEstimation.integration';

const mockModel = {
  parameters: {
    k1: 1.0,
    k2: 2.0
  }
} as any;

const adapter = new ODESolverAdapter(mockModel);

// Mock simulationResult
const N = 10000;
const data = [];
for (let i = 0; i < N; i++) {
  data.push({ time: i * 0.1, obs1: i, obs2: i * 2 });
}
const simulationResult = { data };

const M = 100;
const timePoints = [];
for (let i = 0; i < M; i++) {
  timePoints.push(i * 1.0); // 0 to 99
}

const start = performance.now();
for (let i = 0; i < 100; i++) {
  // @ts-ignore
  adapter.extractObservable(simulationResult, 'obs1', timePoints);
}
const end = performance.now();
console.log(`Original Time: ${end - start} ms`);
