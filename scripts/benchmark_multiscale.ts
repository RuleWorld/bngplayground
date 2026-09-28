// Benchmark harness for the multiscale engine.
// Run: npx tsx scripts/benchmark_multiscale.ts
// Deterministic; prints a JSON + human-readable table of wall-clock runtimes.

import { parseMultiscaleModel, multiscaleSimulation } from '../packages/engine/src/index';
import type { MultiscaleModelDefinition } from '../packages/engine/src/services/multiscale/MultiscaleParser';
import type { MultiscaleConfig } from '../packages/engine/src/services/multiscale/MultiscaleSimulation';

// Under Node/tsx the engine's built-in `cvode_node` loader provides CVODE WASM.
// The browser worker injects its own factory (services/cvode_loader.js); do not
// inject it here — the browser loader uses `require` and fails under tsx.

async function timeRun(name: string, fn: () => Promise<unknown>, budgetMs = 120_000): Promise<{ name: string; ms: number | 'timeout' }> {
  const start = performance.now();
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('BENCH_TIMEOUT')), budgetMs)),
    ]);
    const ms = performance.now() - start;
    console.log(`${name}: ${ms.toFixed(1)} ms`);
    return { name, ms };
  } catch (err) {
    if (err instanceof Error && err.message === 'BENCH_TIMEOUT') {
      console.log(`${name}: TIMEOUT (> ${budgetMs} ms)`);
      return { name, ms: 'timeout' };
    }
    throw err;
  }
}

const DEFAULT_DEFINITION: MultiscaleModelDefinition = {
  name: 'Simple Growth',
  cellTypes: {
    cell: {
      model: 'begin parameters\n  k 0.01\nend parameters\nbegin molecule types\n  A()\nend molecule types\nbegin seed species\n  A() 10\nend seed species\nbegin observables\n  Molecules A_count A()\nend observables\nbegin reaction rules\n  A() -> 0 k\nend reaction rules',
      radius: 5.0,
      motility: 0.5,
      decisions: [
        { name: 'divide', when: 'A_count > 5', then: 'divide', probability: 0.3 },
        { name: 'death', when: 'A_count < 1', then: 'die' },
      ],
    },
  },
  extracellular: { species: [{ name: 'signal', D: 100, degradation: 0.1, initial: 0.5 }] },
  domain: { dimensions: 2, size: [50, 50, 1], boundary: 'reflective' },
  population: [{ cellType: 'cell', count: 5 }],
  time: { end: 10, dtIntra: 0.1, dtExtra: 0.5, dtDecision: 1.0, outputs: 10 },
};

function agentOnlyConfig(initialCount: number, res: [number, number, number], tEnd: number, speciesCount = 1): MultiscaleConfig {
  return {
    cellTypes: [
      {
        name: 'cell',
        bnglModel: '',
        initialRadius: 2,
        motility: 1,
        decisionRules: [
          { name: 'divide', condition: { observable: 'stim', operator: '>', threshold: 0.5 }, action: { type: 'divide' }, probability: 0.1 },
        ],
        uptake: [{ species: 'stim', intracellularParameter: 'stim', scalingFactor: 1 }],
        secretion: [{ species: 'stim', intracellularObservable: 'stim', scalingFactor: 0.1 }],
      },
    ],
    initialCells: [{ cellType: 'cell', position: [50, 50, 0], count: initialCount }],
    extracellularSpecies: Array.from({ length: speciesCount }, (_, i) => ({
      name: `s${i}`,
      diffusionConstant: 20,
      initialConcentration: 0.5,
      degradationRate: 0.05,
    })),
    domain: { dimensions: 2, size: [100, 100, 1], boundaryCondition: 'reflective', resolution: res },
    tEnd,
    dtIntracellular: 0.1,
    dtExtracellular: 0.1,
    dtDecision: 0.5,
    nOutput: 10,
    seed: 42,
    maxCells: 12000,
  };
}

async function main() {
  const results: Array<{ name: string; ms: number | 'timeout' }> = [];

  // A. Default demo (full stack incl. CVODE)
  results.push(await timeRun('A: default demo (5 cells, D=100, tEnd=10, CVODE)', async () => {
    const cfg = parseMultiscaleModel(DEFAULT_DEFINITION);
    return multiscaleSimulation(cfg);
  }));

  // B. No intracellular (empty BNGL) — agent + extracellular only
  results.push(await timeRun('B: no intracellular (5 cells, CVODE skipped)', async () => {
    const cfg = parseMultiscaleModel({
      ...DEFAULT_DEFINITION,
      cellTypes: {
        cell: {
          ...DEFAULT_DEFINITION.cellTypes.cell,
          model: '',
          decisions: [
            { name: 'divide', when: 'stim > 0.5', then: 'divide', probability: 0.3 },
            { name: 'death', when: 'stim < 0.0001', then: 'die' },
          ],
          uptakes: [{ species: 'signal', sets_parameter: 'stim', rate: 1 }],
        },
      },
    });
    return multiscaleSimulation(cfg);
  }));

  // C. No extracellular species — cell + decision only
  results.push(await timeRun('C: no extracellular species (5 cells)', async () => {
    const cfg = parseMultiscaleModel({
      ...DEFAULT_DEFINITION,
      cellTypes: {
        cell: {
          ...DEFAULT_DEFINITION.cellTypes.cell,
          model: '',
          decisions: [{ name: 'divide', when: 'stim > 0.5', then: 'divide', probability: 0.3 }],
          uptakes: [{ species: 'x', sets_parameter: 'stim', rate: 1 }],
        },
      },
      extracellular: { species: [] },
    });
    return multiscaleSimulation(cfg);
  }));

  // D. Population growth: 10 / 100 / 1000 initial cells
  for (const n of [10, 100, 1000]) {
    results.push(await timeRun(`D: population growth, ${n} initial cells (no intracellular)`, async () =>
      multiscaleSimulation(agentOnlyConfig(n, [20, 20, 1], 10)),
    ));
  }

  // E. PDE scaling (10 cells, tEnd=2, dtExtra=0.1): 20x20 / 50x50 / 100x100 / 200x200
  for (const res of [20, 50, 100, 200]) {
    results.push(await timeRun(`E: PDE 2D ${res}x${res} (10 cells, tEnd=2)`, async () =>
      multiscaleSimulation(agentOnlyConfig(10, [res, res, 1], 2)),
    ));
  }
  results.push(await timeRun('E: PDE 3D 20x20x10 (10 cells, tEnd=2)', async () => {
    const cfg = agentOnlyConfig(10, [20, 20, 10], 2);
    cfg.domain = { dimensions: 3, size: [100, 100, 50], boundaryCondition: 'reflective', resolution: [20, 20, 10] };
    return multiscaleSimulation(cfg);
  }));

  // F. Multiple species: 1 / 4 / 8
  for (const nsp of [1, 4, 8]) {
    results.push(await timeRun(`F: ${nsp} extracellular species (10 cells, tEnd=2)`, async () =>
      multiscaleSimulation(agentOnlyConfig(10, [20, 20, 1], 2, nsp)),
    ));
  }

  console.log('\n=== RESULTS (JSON) ===');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
