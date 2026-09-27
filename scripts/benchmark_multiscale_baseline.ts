// Baseline (pre-optimization) ExtracellularGrid measurements.
// Uses the original implementation extracted from git HEAD.
// Run: npx tsx scripts/benchmark_multiscale_baseline.ts

import { ExtracellularGrid as OldExtracellularGrid } from '/tmp/msbench/OldExtracellularGrid.ts';

function measure(name: string, run: () => number, budgetMs = 60_000): void {
  const start = performance.now();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; }, budgetMs);
  // Run synchronously; the timeout check happens after (blocking loop can't be interrupted)
  const result = run();
  clearTimeout(timer);
  const ms = performance.now() - start;
  if (timedOut || ms > budgetMs) {
    console.log(`${name}: TIMEOUT (> ${budgetMs} ms; measured ${ms.toFixed(0)} ms)`);
  } else {
    console.log(`${name}: ${ms.toFixed(1)} ms (sum=${result.toExponential(3)})`);
  }
}

// Original default-demo configuration: domain [50,50,1] but grid hard-coded [20,20,20]
// => dz = 0.05, D = 100 -> dtMax = 0.05^2 / (6*100) * 0.9 = 3.75e-6
console.log('--- OLD grid: default demo geometry (20x20x20 on [50,50,1], D=100) ---');
measure('old grid.step(dt=0.01)', () => {
  const g = new OldExtracellularGrid({
    domainSize: [50, 50, 1],
    resolution: [20, 20, 20],
    species: [{ name: 'signal', diffusionConstant: 100, degradationRate: 0.1, initialConcentration: 0.5 }],
    boundaryCondition: 'neumann',
  });
  g.step(0.01);
  return g.getConcentration([25, 25, 0.5], 'signal');
}, 30_000);

// One full default-demo extracellular step would be dt = 0.5.
// dt=0.01 already requires ~2,667 substeps; dt=0.5 requires ~133,333 substeps.
// Estimate from the measured dt=0.01 cost instead of running it (~33 s expected).

console.log('\n--- OLD grid: old 2D test geometry (resolution [20,20,1] on [100,100,1], D=50) ---');
measure('old grid.step(dt=1.0) 20x20x1', () => {
  const g = new OldExtracellularGrid({
    domainSize: [100, 100, 1],
    resolution: [20, 20, 1],
    species: [{ name: 's', diffusionConstant: 50, degradationRate: 0, initialConcentration: 0 }],
    boundaryCondition: 'neumann',
  });
  g.step(1.0);
  return g.getConcentration([50, 50, 0.5], 's');
}, 60_000);
