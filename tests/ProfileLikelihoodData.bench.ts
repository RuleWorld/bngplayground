import { describe, bench, expect, test } from 'vitest';

// Simulates the original behavior in ProfileLikelihoodTab.tsx
function originalTransform(simData: any[], expData: any[]) {
  return simData.map(d => {
    const exp = expData.find(e => Math.abs(e.time - d.time) < 1e-5);
    const point: any = { ...d };
    if (exp) {
      Object.entries(exp.values).forEach(([k, v]) => {
        point[`${k}_exp`] = v;
      });
    }
    return point;
  });
}

// Simulates the optimized behavior in ProfileLikelihoodTab.tsx
function optimizedTransform(simData: any[], expData: any[]) {
  // We assume expData is sorted by time
  // Using a two-pointer approach
  let expIdx = 0;

  return simData.map(d => {
    // Advance expIdx until e.time + 1e-5 >= d.time
    while (expIdx < expData.length && expData[expIdx].time + 1e-5 <= d.time) {
      expIdx++;
    }

    // Check if current expIdx is within range
    const point: any = { ...d };
    if (expIdx < expData.length && Math.abs(expData[expIdx].time - d.time) < 1e-5) {
      const exp = expData[expIdx];
      Object.entries(exp.values).forEach(([k, v]) => {
        point[`${k}_exp`] = v;
      });
    }
    return point;
  });
}

const N = 50000;
const M = 1000;

// Generate simulated simulation data
const simData = Array.from({ length: N }, (_, i) => ({
  time: i * 0.1,
  val1: Math.random()
}));

// Generate experimental data
const expData = Array.from({ length: M }, (_, i) => ({
  time: i * 5, // Match every 50th simulation point
  values: {
    val1: Math.random()
  }
}));

describe('Data Transformation Benchmark', () => {
  test('both implementations yield identical results', () => {
    // Test on small subset to avoid long test times
    const simSmall = simData.slice(0, 1000);
    const expSmall = expData.slice(0, 100);
    const original = originalTransform(simSmall, expSmall);
    const optimized = optimizedTransform(simSmall, expSmall);
    expect(optimized).toEqual(original);
  });

  bench('original O(N*M)', () => {
    originalTransform(simData, expData);
  });

  bench('optimized O(N+M) two-pointer', () => {
    optimizedTransform(simData, expData);
  });
});
