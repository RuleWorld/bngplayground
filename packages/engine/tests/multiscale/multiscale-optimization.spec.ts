// ---------------------------------------------------------------------------
// multiscale-optimization.spec.ts – Tests for the optimized multiscale engine
//
// Covers: dimension-aware extracellular diffusion, multirate scheduling,
// O(1) bookkeeping (maxCells, lineage), refractory periods, 2D cell movement,
// domain boundaries, snapshot immutability/compactness, determinism, parser
// validation, and cancellation.
//
// These tests intentionally avoid intracellular CVODE models (empty
// bnglModel) so they exercise the agent + extracellular machinery in pure JS.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { ExtracellularGrid } from '../../src/services/multiscale/ExtracellularGrid';
import {
  SimpleRNG,
  createCell,
  moveCell,
  applyCellBoundary,
  divideCell,
  type CellState,
  type CellTypeDefinition,
} from '../../src/services/multiscale/CellAgent';
import { parseMultiscaleModel, type MultiscaleModelDefinition } from '../../src/services/multiscale/MultiscaleParser';
import { multiscaleSimulation, type MultiscaleConfig } from '../../src/services/multiscale/MultiscaleSimulation';

// ---------------------------------------------------------------------------
// ExtracellularGrid: dimensionality
// ---------------------------------------------------------------------------

describe('ExtracellularGrid dimensionality', () => {
  it('2D grid uses Nx x Ny voxels, not Nx x Ny x Nz', () => {
    const grid = new ExtracellularGrid({
      dimensions: 2,
      domainSize: [50, 50, 1],
      resolution: [20, 20, 1],
      species: [{ name: 's', diffusionConstant: 10, degradationRate: 0, initialConcentration: 0 }],
      boundaryCondition: 'neumann',
    });
    expect(grid.dimensions).toBe(2);
    expect(grid.nx).toBe(20);
    expect(grid.ny).toBe(20);
    expect(grid.nz).toBe(1);
  });

  it('infers 2D from a z-resolution of 1', () => {
    const grid = new ExtracellularGrid({
      domainSize: [50, 50, 1],
      resolution: [20, 20, 1],
      species: [{ name: 's', diffusionConstant: 10, degradationRate: 0, initialConcentration: 0 }],
      boundaryCondition: 'neumann',
    });
    expect(grid.dimensions).toBe(2);
  });

  it('3D grid uses Nx x Ny x Nz voxels', () => {
    const grid = new ExtracellularGrid({
      dimensions: 3,
      domainSize: [30, 30, 30],
      resolution: [10, 10, 10],
      species: [{ name: 's', diffusionConstant: 1, degradationRate: 0, initialConcentration: 0 }],
      boundaryCondition: 'neumann',
    });
    expect(grid.dimensions).toBe(3);
    expect(grid.nx).toBe(10);
    expect(grid.ny).toBe(10);
    expect(grid.nz).toBe(10);
  });

  it('rejects negative diffusion constants and non-positive resolutions', () => {
    expect(() => new ExtracellularGrid({
      dimensions: 2,
      domainSize: [10, 10],
      resolution: [5, 5],
      species: [{ name: 's', diffusionConstant: -1, degradationRate: 0, initialConcentration: 0 }],
      boundaryCondition: 'neumann',
    })).toThrow();
    expect(() => new ExtracellularGrid({
      dimensions: 2,
      domainSize: [10, 10],
      resolution: [5, 0],
      species: [{ name: 's', diffusionConstant: 1, degradationRate: 0, initialConcentration: 0 }],
      boundaryCondition: 'neumann',
    })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ExtracellularGrid: diffusion correctness
// ---------------------------------------------------------------------------

describe('ExtracellularGrid diffusion', () => {
  const SP = 'o2';

  function make2D(resolution: number, bc: 'neumann' | 'dirichlet' | 'periodic' = 'neumann') {
    return new ExtracellularGrid({
      dimensions: 2,
      domainSize: [100, 100, 1],
      resolution: [resolution, resolution, 1],
      species: [{ name: SP, diffusionConstant: 50, degradationRate: 0, initialConcentration: 0 }],
      boundaryCondition: bc,
    });
  }

  it('mass is conserved under Neumann boundaries (no decay)', () => {
    const grid = make2D(21);
    grid.addSource([50, 50, 0], SP, 0); // register nothing; seed via direct injection
    const g = grid.getGrid(SP)!;
    g[10 + 10 * 21] = 1000;

    const sum = (arr: Float64Array) => arr.reduce((a, b) => a + b, 0);
    const before = sum(g);
    grid.step(0.2);
    grid.step(0.2);
    const after = sum(grid.getGrid(SP)!);
    expect(after).toBeCloseTo(before, 6);
  });

  it('uniform field remains uniform under Neumann boundaries', () => {
    const grid = new ExtracellularGrid({
      dimensions: 2,
      domainSize: [100, 100, 1],
      resolution: [15, 15, 1],
      species: [{ name: SP, diffusionConstant: 80, degradationRate: 0, initialConcentration: 1.0 }],
      boundaryCondition: 'neumann',
    });
    grid.step(1.0);
    grid.step(1.0);
    const g = grid.getGrid(SP)!;
    for (let i = 0; i < g.length; i++) {
      expect(g[i]).toBeCloseTo(1.0, 10);
    }
  });

  it('point source spreads symmetrically in 2D', () => {
    const grid = make2D(21);
    grid.addSource([50, 50, 0], SP, 100);
    grid.step(0.05);
    const g = grid.getGrid(SP)!;
    const cx = 10, cy = 10, n = 21;
    const at = (dx: number, dy: number) => g[(cx + dx) + (cy + dy) * n];
    expect(at(2, 0)).toBeCloseTo(at(-2, 0), 10);
    expect(at(0, 2)).toBeCloseTo(at(0, -2), 10);
    expect(at(1, 1)).toBeCloseTo(at(-1, -1), 10);
  });

  it('degradation decays the field', () => {
    const grid = new ExtracellularGrid({
      dimensions: 2,
      domainSize: [100, 100, 1],
      resolution: [10, 10, 1],
      species: [{ name: SP, diffusionConstant: 0, degradationRate: 1.0, initialConcentration: 1.0 }],
      boundaryCondition: 'neumann',
    });
    grid.step(1.0);
    const g = grid.getGrid(SP)!;
    for (let i = 0; i < g.length; i++) {
      expect(g[i]).toBeLessThan(1.0);
      expect(g[i]).toBeGreaterThan(0);
    }
  });

  it('2D gradient has zero z-component and points toward the source', () => {
    const grid = make2D(21);
    grid.addSource([80, 50, 0], SP, 10000);
    grid.step(0.5);
    const grad = grid.getGradient([65, 50, 0], SP);
    expect(grad[2]).toBe(0);
    expect(grad[0]).toBeGreaterThan(0);
  });

  it('periodic boundaries wrap concentration', () => {
    const grid = new ExtracellularGrid({
      dimensions: 2,
      domainSize: [100, 100, 1],
      resolution: [20, 20, 1],
      species: [{ name: SP, diffusionConstant: 0, degradationRate: 0, initialConcentration: 0 }],
      boundaryCondition: 'periodic',
    });
    const g = grid.getGrid(SP)!;
    g[0] = 7;
    grid.step(1.0); // D=0: no diffusion, but verify interpolation across boundary
    const c = grid.getConcentration([1, 1, 0], SP); // near lower-left corner
    expect(c).toBeGreaterThan(0);
  });

  it('3D diffusion conserves mass under Neumann and spreads in z', () => {
    const grid = new ExtracellularGrid({
      dimensions: 3,
      domainSize: [30, 30, 30],
      resolution: [10, 10, 10],
      species: [{ name: SP, diffusionConstant: 2, degradationRate: 0, initialConcentration: 0 }],
      boundaryCondition: 'neumann',
    });
    const g = grid.getGrid(SP)!;
    g[5 + 5 * 10 + 5 * 100] = 1000;
    const sum = (arr: Float64Array) => arr.reduce((a, b) => a + b, 0);
    const before = sum(g);
    grid.step(0.1);
    const after = sum(grid.getGrid(SP)!);
    expect(after).toBeCloseTo(before, 6);
    const grad = grid.getGradient([10, 15, 15], SP);
    expect(grad[2]).not.toBeNaN();
  });
});

// ---------------------------------------------------------------------------
// ExtracellularGrid: analytic accuracy (VCell-style analytic verification)
//
// VCell validates PDE solvers against closed-form solutions
// (cbit.vcell.solver.test.MathTestingUtilities). The solver-agnostic
// accuracy standard for a diffusion kernel is the Gaussian heat kernel:
// initial delta of mass M spreads as
//   2D: c(r, T) = M / (4 pi D T) * exp(-r^2 / (4 D T))
//   3D: c(r, T) = M / ((4 pi D T)^(3/2)) * exp(-r^2 / (4 D T))
// far from boundaries.
// ---------------------------------------------------------------------------

describe('ExtracellularGrid analytic accuracy', () => {
  const SP = 'heat';

  it('2D profile matches the Gaussian heat kernel', () => {
    // Large domain so boundary influence is negligible over the simulated time
    const D = 20;
    const grid = new ExtracellularGrid({
      dimensions: 2,
      domainSize: [200, 200, 1],
      resolution: [101, 101, 1],
      species: [{ name: SP, diffusionConstant: D, degradationRate: 0, initialConcentration: 0 }],
      boundaryCondition: 'neumann',
    });
    const n = 101;
    const dx = 200 / n;
    const mass = 100 / (dx * dx); // delta of total mass 100 units placed at center
    const g = grid.getGrid(SP)!;
    g[50 + 50 * n] = mass;

    const T = 1.0;
    // Substep to total T with safe explicit steps
    const dt = 0.9 / (4 * D) / (1 / (dx * dx));
    const nSteps = Math.ceil(T / dt);
    for (let s = 0; s < nSteps; s++) grid.step(T / nSteps);

    const gg = grid.getGrid(SP)!;
    const at = (ix: number, iy: number) => gg[ix + iy * n];
    const totalMass = gg.reduce((a, b) => a + b, 0) * dx * dx;

    // Mass conserved
    expect(totalMass).toBeCloseTo(100, 4);

    // Analytic center and ring values (grid stores continuum concentration)
    const cCenter = 100 / (4 * Math.PI * D * T);
    const atOffset = (off: number) => 100 / (4 * Math.PI * D * T) * Math.exp((-((off * dx) ** 2)) / (4 * D * T));

    expect(at(50, 50) / cCenter).toBeCloseTo(1, 1);
    expect(at(55, 50) / atOffset(5)).toBeCloseTo(1, 1);
    expect(at(58, 50) / atOffset(8)).toBeCloseTo(1, 1);
    expect(at(50, 55) / atOffset(5)).toBeCloseTo(1, 1);
    // Isotropy
    expect(at(55, 50)).toBeCloseTo(at(45, 50), 6);
    expect(at(50, 55)).toBeCloseTo(at(50, 45), 6);
  });

  it('3D profile matches the Gaussian heat kernel', () => {
    const D = 10;
    const grid = new ExtracellularGrid({
      dimensions: 3,
      domainSize: [150, 150, 150],
      resolution: [51, 51, 51],
      species: [{ name: SP, diffusionConstant: D, degradationRate: 0, initialConcentration: 0 }],
      boundaryCondition: 'neumann',
    });
    const n = 51;
    const dx = 150 / n;
    const c = 25;
    // Initialize from the smooth analytic Gaussian at T0 (a resolved field,
    // so the comparison tests the evolution operator rather than a
    // delta-initialized lattice artifact), then evolve to T1.
    const T0 = 0.5, T1 = 1.5;
    const analyticAt = (t: number, r2: number) =>
      50 / ((4 * Math.PI * D * t) ** 1.5) * Math.exp(-r2 / (4 * D * t));
    const g = grid.getGrid(SP)!;
    for (let iz = 0; iz < n; iz++) {
      for (let iy = 0; iy < n; iy++) {
        for (let ix = 0; ix < n; ix++) {
          const r2 = ((ix - c) ** 2 + (iy - c) ** 2 + (iz - c) ** 2) * dx * dx;
          g[ix + n * (iy + n * iz)] = analyticAt(T0, r2);
        }
      }
    }
    grid.step(T1 - T0);
    const gg = grid.getGrid(SP)!;
    const at = (ix: number, iy: number, iz: number) => gg[ix + n * (iy + n * iz)];
    const ana = (off: number) => analyticAt(T1, (off * dx) ** 2);
    expect(at(25, 25, 25) / ana(0)).toBeCloseTo(1, 1);
    expect(at(27, 25, 25) / ana(2)).toBeCloseTo(1, 1);
    expect(at(25, 27, 25) / ana(2)).toBeCloseTo(1, 1);
    expect(at(25, 25, 27) / ana(2)).toBeCloseTo(1, 1);
    expect(at(29, 25, 25) / ana(4)).toBeCloseTo(1, 0);
  });

  it('pure decay is exactly exponential (c = c0 * exp(-k*t))', () => {
    const k = 0.5;
    const grid = new ExtracellularGrid({
      dimensions: 2,
      domainSize: [100, 100, 1],
      resolution: [10, 10, 1],
      species: [{ name: SP, diffusionConstant: 0, degradationRate: k, initialConcentration: 2.0 }],
      boundaryCondition: 'neumann',
    });
    grid.step(1.0);
    grid.step(1.0);
    const expected = 2.0 * Math.exp(-2.0 * k);
    const g = grid.getGrid(SP)!;
    for (let i = 0; i < g.length; i++) {
      expect(g[i]).toBeCloseTo(expected, 8);
    }
  });

  it('dirichlet (absorbing) boundary leaks mass; neumann does not', () => {
    function massAfter(bc: 'neumann' | 'dirichlet'): number {
      const grid = new ExtracellularGrid({
        dimensions: 2,
        domainSize: [40, 40, 1],
        resolution: [20, 20, 1],
        species: [{ name: SP, diffusionConstant: 5, degradationRate: 0, initialConcentration: 0 }],
        boundaryCondition: bc,
      });
      const g = grid.getGrid(SP)!;
      g[0] = 100; // corner cell touches both absorbing walls
      for (let s = 0; s < 20; s++) grid.step(0.1);
      return grid.getGrid(SP)!.reduce((a, b) => a + b, 0);
    }
    const neumann = massAfter('neumann');
    const dirichlet = massAfter('dirichlet');
    expect(neumann).toBeCloseTo(100, 3);
    expect(dirichlet).toBeLessThan(60);
  });
});

// ---------------------------------------------------------------------------
// CellAgent: movement, boundaries, division
// ---------------------------------------------------------------------------

describe('CellAgent movement and boundaries', () => {
  const typeDef: CellTypeDefinition = {
    name: 'c', bnglModel: '', initialRadius: 5, motility: 0, decisionRules: [],
  };

  it('seeded RNG is deterministic', () => {
    const a = new SimpleRNG(123);
    const b = new SimpleRNG(123);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
    expect(new SimpleRNG(1).next()).not.toBe(new SimpleRNG(2).next());
  });

  it('2D random walk stays in the z=0 plane and uses the seeded RNG', () => {
    const cell = createCell(0, typeDef, [50, 50, 3]);
    const rng = new SimpleRNG(7);
    moveCell(cell, 'random', 2, undefined, rng, 2);
    expect(cell.position[2]).toBe(0);
    expect(cell.position[0]).not.toBe(50);
    expect(cell.position[1]).not.toBe(50);
  });

  it('3D random walk changes all coordinates', () => {
    const cell = createCell(0, typeDef, [50, 50, 50]);
    const before = [...cell.position];
    moveCell(cell, 'random', 2, undefined, new SimpleRNG(9), 3);
    const moved = cell.position.some((v, i) => v !== before[i]);
    expect(moved).toBe(true);
  });

  it('chemotaxis in 2D moves along the in-plane gradient only', () => {
    const cell = createCell(0, typeDef, [50, 50, 0]);
    moveCell(cell, 'chemotaxis', 1, [1, 0, 5], new SimpleRNG(1), 2);
    expect(cell.position[0]).toBeCloseTo(51, 10);
    expect(cell.position[1]).toBeCloseTo(50, 10);
    expect(cell.position[2]).toBe(0);
  });

  it('reflective boundary keeps the cell inside the domain', () => {
    const cell = createCell(0, typeDef, [-3, 50, 0]);
    applyCellBoundary(cell, [100, 100, 1], 'reflective', 2);
    expect(cell.position[0]).toBe(3);
    expect(cell.position[1]).toBe(50);
  });

  it('periodic boundary wraps cell positions', () => {
    const cell = createCell(0, typeDef, [105, 50, 0]);
    applyCellBoundary(cell, [100, 100, 1], 'periodic', 2);
    expect(cell.position[0]).toBeCloseTo(5, 10);
  });

  it('absorbing boundary kills the cell', () => {
    const cell = createCell(0, typeDef, [-5, 50, 0]);
    applyCellBoundary(cell, [100, 100, 1], 'absorbing', 2);
    expect(cell.phase).toBe('dead');
  });
});

describe('divideCell', () => {
  it('conserves integer molecule counts exactly', () => {
    const parent: CellState = {
      id: 1, cellType: 'c', position: [50, 50, 0], radius: 5,
      intracellularState: new Float64Array([100, 200, 50]),
      observables: {}, age: 10, phase: 'active', volume: 500,
      secretionRates: {}, uptakeRates: {},
    };
    const rng = new SimpleRNG(5);
    const daughter = divideCell(parent, 2, rng, 2);
    const totals = [100, 200, 50];
    for (let i = 0; i < 3; i++) {
      expect(parent.intracellularState[i] + daughter.intracellularState[i]).toBe(totals[i]);
    }
    expect(daughter.position[2]).toBe(0); // 2D: daughter stays in plane
  });

  it('conserves continuous concentrations exactly', () => {
    const parent: CellState = {
      id: 1, cellType: 'c', position: [50, 50, 0], radius: 5,
      intracellularState: new Float64Array([3.7, 1250.25, 0.001]),
      observables: {}, age: 0, phase: 'active', volume: 500,
      secretionRates: {}, uptakeRates: {},
    };
    const rng = new SimpleRNG(11);
    const daughter = divideCell(parent, 2, rng, 2);
    const totals = [3.7, 1250.25, 0.001];
    for (let i = 0; i < 3; i++) {
      expect(parent.intracellularState[i] + daughter.intracellularState[i]).toBeCloseTo(totals[i], 12);
    }
  });
});

// ---------------------------------------------------------------------------
// MultiscaleSimulation: scheduler, bookkeeping, snapshots
// ---------------------------------------------------------------------------

describe('MultiscaleSimulation', () => {
  function agentConfig(overrides: Partial<MultiscaleConfig> = {}): MultiscaleConfig {
    return {
      cellTypes: [
        {
          name: 'cell',
          bnglModel: '',
          initialRadius: 2,
          motility: 0,
          decisionRules: [
            {
              name: 'divide',
              condition: { observable: 'stim', operator: '>', threshold: 0.5 },
              action: { type: 'divide' },
            },
          ],
          uptake: [{ species: 'stim', intracellularParameter: 'stim', scalingFactor: 1 }],
        },
      ],
      initialCells: [{ cellType: 'cell', position: [50, 50, 0], count: 1 }],
      extracellularSpecies: [
        { name: 'stim', diffusionConstant: 10, initialConcentration: 1.0, degradationRate: 0 },
      ],
      domain: {
        dimensions: 2,
        size: [100, 100, 1],
        boundaryCondition: 'reflective',
      },
      tEnd: 6,
      dtIntracellular: 0.1,
      dtExtracellular: 0.1,
      dtDecision: 1.0,
      nOutput: 6,
      seed: 42,
      ...overrides,
    };
  }

  it('honors non-commensurate clocks (dtIntra=0.07, dtExtra=0.13, dtDecision=0.5)', async () => {
    const config = agentConfig({
      tEnd: 1.0,
      dtIntracellular: 0.07,
      dtExtracellular: 0.13,
      dtDecision: 0.5,
      nOutput: 2,
    });
    const result = await multiscaleSimulation(config);
    // Output schedule: snapshots at 0.0, 0.5, 1.0
    const times = result.snapshots.map((s) => s.time);
    expect(times.length).toBe(3);
    expect(times[1]).toBeCloseTo(0.5, 6);
    expect(times[2]).toBeCloseTo(1.0, 6);
    // Population series has one entry per snapshot
    expect(result.populationTimeSeries.time.length).toBe(3);
  });

  it('enforces refractory periods on division', async () => {
    const config = agentConfig({
      tEnd: 10,
      dtDecision: 1.0,
      cellTypes: [
        {
          name: 'cell',
          bnglModel: '',
          initialRadius: 2,
          motility: 0,
          decisionRules: [
            {
              name: 'divide',
              condition: { observable: 'stim', operator: '>', threshold: 0.5 },
              action: { type: 'divide' },
              refractoryPeriod: 5,
            },
          ],
          uptake: [{ species: 'stim', intracellularParameter: 'stim', scalingFactor: 1 }],
        },
      ],
    });
    const result = await multiscaleSimulation(config);
    // Root cell divides at t=1; refractory 5 blocks the next division until t=6.
    const root = result.cellLineage.find((l) => l.cellId === 0)!;
    expect(root.divisionTimes.length).toBe(2);
    expect(root.divisionTimes[0]).toBe(1);
    expect(root.divisionTimes[1]).toBe(6);
  });

  it('never exceeds maxCells under simultaneous division attempts', async () => {
    const config = agentConfig({
      initialCells: [{ cellType: 'cell', position: [50, 50, 0], count: 10 }],
      maxCells: 12,
      tEnd: 5,
    });
    const result = await multiscaleSimulation(config);
    const last = result.snapshots[result.snapshots.length - 1];
    const liveCount = last.populationCounts['cell'] ?? 0;
    expect(liveCount).toBeLessThanOrEqual(12);
  });

  it('maintains lineage records: parent ids, birth and division times', async () => {
    const config = agentConfig({ tEnd: 2, dtDecision: 1.0 });
    const result = await multiscaleSimulation(config);
    const byId = new Map(result.cellLineage.map((l) => [l.cellId, l]));
    expect(byId.get(0)!.parentId).toBeNull();
    expect(byId.get(0)!.birthTime).toBe(0);
    expect(byId.get(0)!.divisionTimes.length).toBeGreaterThan(0);
    for (const rec of result.cellLineage) {
      if (rec.cellId !== 0) {
        expect(rec.parentId).not.toBeNull();
        expect(rec.birthTime).toBeGreaterThan(0);
        expect(byId.get(rec.parentId!)).toBeDefined();
      }
    }
  });

  it('records death times for dead cells', async () => {
    const config: MultiscaleConfig = {
      cellTypes: [
        {
          name: 'cell',
          bnglModel: '',
          initialRadius: 2,
          motility: 0,
          decisionRules: [
            {
              name: 'die',
              condition: { observable: 'none', operator: '<=', threshold: 0 },
              action: { type: 'die' },
            },
          ],
        },
      ],
      initialCells: [{ cellType: 'cell', position: [50, 50, 0], count: 1 }],
      extracellularSpecies: [],
      domain: { dimensions: 2, size: [100, 100, 1], boundaryCondition: 'reflective' },
      tEnd: 2,
      dtIntracellular: 1,
      dtExtracellular: 1,
      dtDecision: 1.0,
      nOutput: 2,
      seed: 1,
    };
    const result = await multiscaleSimulation(config);
    const rec = result.cellLineage.find((l) => l.cellId === 0)!;
    expect(rec.deathTime).toBe(1);
    const last = result.snapshots[result.snapshots.length - 1];
    expect(last.populationCounts['cell']).toBe(0);
  });

  it('produces compact immutable snapshots without runtime solver state', async () => {
    const config = agentConfig({ tEnd: 2, nOutput: 2 });
    const result = await multiscaleSimulation(config);
    const s0 = result.snapshots[0];
    const s1 = result.snapshots[1];
    // No intracellular runtime state leaks into snapshots
    for (const cell of [...s0.cells, ...s1.cells]) {
      expect(cell).not.toHaveProperty('intracellularState');
      expect(cell).not.toHaveProperty('secretionRates');
      expect(cell).not.toHaveProperty('uptakeRates');
      expect(cell).not.toHaveProperty('ruleCooldowns');
    }
    // Historical snapshots don't alias live mutable structures across times
    const c0 = s0.cells[0];
    const c1 = s1.cells.find((c) => c.id === c0.id)!;
    expect(c0).toBeDefined();
    expect(c1).toBeDefined();
    expect(c0.position).not.toBe(c1.position);
    expect(c0.observables).not.toBe(c1.observables);
  });

  it('is deterministic for identical seeds', async () => {
    const config = agentConfig({ tEnd: 3, dtDecision: 1.0 });
    const a = await multiscaleSimulation(config);
    const b = await multiscaleSimulation(config);
    expect(JSON.stringify(a.snapshots.map((s) => s.cells.map((c) => [c.id, c.position]))))
      .toBe(JSON.stringify(b.snapshots.map((s) => s.cells.map((c) => [c.id, c.position]))));
    expect(JSON.stringify(a.cellLineage)).toBe(JSON.stringify(b.cellLineage));
  });

  it('reports monotonic progress that reaches 1', async () => {
    const config = agentConfig({ tEnd: 2 });
    const fractions: number[] = [];
    await multiscaleSimulation(config, (f) => fractions.push(f));
    // No decreasing or out-of-range progress
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i]).toBeGreaterThanOrEqual(fractions[i - 1]);
      expect(fractions[i]).toBeLessThanOrEqual(1);
    }
    expect(fractions[fractions.length - 1]).toBe(1);
  });

  it('stops early when cancelled and cleans up', async () => {
    const config = agentConfig({ tEnd: 10 });
    let cancelAfter = 3;
    const result = await multiscaleSimulation(config, undefined, {
      isCancelled: () => cancelAfter-- <= 0,
    });
    // Fewer snapshots than a full run's nOutput
    expect(result.snapshots.length).toBeLessThan(11);
    expect(result.snapshots.length).toBeGreaterThan(0);
  });

  it('throws on invalid time configuration', async () => {
    await expect(multiscaleSimulation(agentConfig({ tEnd: 0 }))).rejects.toThrow();
    await expect(multiscaleSimulation(agentConfig({ dtDecision: -1 }))).rejects.toThrow();
  });

  it('migrating cells respect reflective domain boundaries in 2D', async () => {
    const config: MultiscaleConfig = {
      cellTypes: [
        {
          name: 'cell',
          bnglModel: '',
          initialRadius: 2,
          motility: 50, // aggressive default motility, applied every decision
          decisionRules: [],
        },
      ],
      initialCells: [{ cellType: 'cell', position: [1, 50, 0], count: 1 }],
      extracellularSpecies: [],
      domain: { dimensions: 2, size: [100, 100, 1], boundaryCondition: 'reflective' },
      tEnd: 10,
      dtIntracellular: 1,
      dtExtracellular: 1,
      dtDecision: 1.0,
      nOutput: 1,
      seed: 3,
    };
    const result = await multiscaleSimulation(config);
    const last = result.snapshots[result.snapshots.length - 1];
    for (const cell of last.cells) {
      expect(cell.position[0]).toBeGreaterThanOrEqual(0);
      expect(cell.position[0]).toBeLessThanOrEqual(100);
      expect(cell.position[1]).toBeGreaterThanOrEqual(0);
      expect(cell.position[1]).toBeLessThanOrEqual(100);
      expect(cell.position[2]).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// MultiscaleParser: validation
// ---------------------------------------------------------------------------

describe('MultiscaleParser validation', () => {
  function baseDefinition(): MultiscaleModelDefinition {
    return {
      name: 't',
      cellTypes: {
        cell: {
          model: '',
          radius: 5,
          motility: 0,
          decisions: [{ name: 'd', when: 'x > 0.5', then: 'divide' }],
        },
      },
      extracellular: { species: [{ name: 'EGF', D: 10, initial: 0 }] },
      domain: { dimensions: 2, size: [100, 100, 1], boundary: 'reflective' },
      population: [{ cellType: 'cell', count: 1 }],
      time: { end: 10, dtIntra: 0.1, dtExtra: 0.1, dtDecision: 1.0, outputs: 10 },
    };
  }

  it('parses a valid definition', () => {
    const cfg = parseMultiscaleModel(baseDefinition());
    expect(cfg.cellTypes.length).toBe(1);
    expect(cfg.dtIntracellular).toBe(0.1);
    expect(cfg.nOutput).toBe(10);
    expect(cfg.domain.dimensions).toBe(2);
  });

  it('rejects non-positive tEnd and dts', () => {
    expect(() => parseMultiscaleModel({ ...baseDefinition(), time: { end: 0, dtIntra: 0.1, dtExtra: 0.1, dtDecision: 1, outputs: 10 } })).toThrow();
    expect(() => parseMultiscaleModel({ ...baseDefinition(), time: { end: 10, dtIntra: 0, dtExtra: 0.1, dtDecision: 1, outputs: 10 } })).toThrow();
    expect(() => parseMultiscaleModel({ ...baseDefinition(), time: { end: 10, dtIntra: 0.1, dtExtra: -1, dtDecision: 1, outputs: 10 } })).toThrow();
  });

  it('rejects negative diffusion constants and invalid dimensions', () => {
    expect(() => parseMultiscaleModel({
      ...baseDefinition(),
      extracellular: { species: [{ name: 'EGF', D: -5 }] },
    })).toThrow();
    expect(() => parseMultiscaleModel({
      ...baseDefinition(),
      domain: { dimensions: 4 as 2 | 3, size: [100, 100, 1], boundary: 'reflective' },
    })).toThrow();
  });

  it('parses refractory periods', () => {
    const cfg = parseMultiscaleModel({
      ...baseDefinition(),
      cellTypes: {
        cell: {
          model: '',
          radius: 5,
          motility: 0,
          decisions: [{ name: 'd', when: 'x > 0.5', then: 'divide', refractory: 3 }],
        },
      },
    });
    expect(cfg.cellTypes[0].decisionRules[0].refractoryPeriod).toBe(3);
  });
});
