import { describe, it, expect } from 'vitest';
import { createCell, evaluateCondition, divideCell, moveCell } from '../../src/services/multiscale/CellAgent';
import { ExtracellularGrid } from '../../src/services/multiscale/ExtracellularGrid';
import { parseMultiscaleModel } from '../../src/services/multiscale/MultiscaleParser';
import type { CellTypeDefinition, CellState, CellDecisionRule } from '../../src/services/multiscale/CellAgent';

describe('CellAgent', () => {
  const mockTypeDef: CellTypeDefinition = {
    name: 'cancer',
    bnglModel: 'begin model\nend model',
    initialRadius: 5.0,
    motility: 0.1,
    decisionRules: [],
  };

  it('creates a cell with correct initial state', () => {
    const cell = createCell(1, mockTypeDef, [50, 50, 0]);
    expect(cell.id).toBe(1);
    expect(cell.cellType).toBe('cancer');
    expect(cell.position).toEqual([50, 50, 0]);
    expect(cell.radius).toBe(5.0);
    expect(cell.phase).toBe('active');
    expect(cell.age).toBe(0);
  });

  it('evaluates > condition correctly', () => {
    const cell: CellState = {
      id: 1, cellType: 'cancer', position: [0, 0, 0], radius: 5,
      intracellularState: new Float64Array(0), observables: { pERK: 0.8 },
      age: 0, phase: 'active', volume: 100, secretionRates: {}, uptakeRates: {},
    };
    const condition = { observable: 'pERK', operator: '>' as const, threshold: 0.5 };
    expect(evaluateCondition(cell, condition)).toBe(true);
    condition.threshold = 0.9;
    expect(evaluateCondition(cell, condition)).toBe(false);
  });

  it('evaluates < condition correctly', () => {
    const cell: CellState = {
      id: 1, cellType: 'cancer', position: [0, 0, 0], radius: 5,
      intracellularState: new Float64Array(0), observables: { oxygen: 0.01 },
      age: 0, phase: 'active', volume: 100, secretionRates: {}, uptakeRates: {},
    };
    expect(evaluateCondition(cell, { observable: 'oxygen', operator: '<', threshold: 0.05 })).toBe(true);
    expect(evaluateCondition(cell, { observable: 'oxygen', operator: '<', threshold: 0.001 })).toBe(false);
  });

  it('divides cell conserving total state', () => {
    const parent: CellState = {
      id: 1, cellType: 'cancer', position: [50, 50, 0], radius: 5,
      intracellularState: new Float64Array([100, 200, 50]),
      observables: {}, age: 10, phase: 'active', volume: 500,
      secretionRates: {}, uptakeRates: {},
    };
    const rng = { next: () => 0.5, gaussian: () => 0, binomial: (n: number, p: number) => Math.round(n * p) } as any;
    const daughter = divideCell(parent, 2, rng);

    expect(daughter.id).toBe(2);
    expect(daughter.cellType).toBe('cancer');
    expect(daughter.age).toBe(0);
    // Total state should be approximately conserved
    for (let i = 0; i < parent.intracellularState.length; i++) {
      const total = parent.intracellularState[i] + daughter.intracellularState[i];
      const expected = [100, 200, 50][i];
      expect(total).toBeCloseTo(expected, -1);
    }
  });
});

describe('ExtracellularGrid', () => {
  it('initializes with correct concentration', () => {
    const grid = new ExtracellularGrid({
      domainSize: [100, 100, 1],
      resolution: [10, 10, 1],
      species: [{ name: 'oxygen', diffusionConstant: 100, degradationRate: 0, initialConcentration: 1.0 }],
      boundaryCondition: 'neumann',
    });
    expect(grid.getConcentration([50, 50, 0], 'oxygen')).toBeCloseTo(1.0, 2);
  });

  it('diffusion smooths a point source', () => {
    const grid = new ExtracellularGrid({
      domainSize: [100, 100, 1],
      resolution: [20, 20, 1],
      species: [{ name: 'signal', diffusionConstant: 50, degradationRate: 0, initialConcentration: 0 }],
      boundaryCondition: 'neumann',
    });
    grid.addSource([50, 50, 0], 'signal', 100);
    grid.step(1.0);
    // Center should have higher concentration than edges
    const center = grid.getConcentration([50, 50, 0], 'signal');
    const edge = grid.getConcentration([10, 10, 0], 'signal');
    expect(center).toBeGreaterThan(edge);
  });

  it('computes gradient pointing toward source', () => {
    const grid = new ExtracellularGrid({
      domainSize: [100, 100, 1],
      resolution: [20, 20, 1],
      species: [{ name: 'signal', diffusionConstant: 50, degradationRate: 0, initialConcentration: 0 }],
      boundaryCondition: 'neumann',
    });
    grid.addSource([80, 50, 0], 'signal', 100);
    grid.step(1.0);
    const grad = grid.getGradient([40, 50, 0], 'signal');
    // Gradient x-component should be positive (pointing toward source at x=80)
    expect(grad[0]).toBeGreaterThanOrEqual(0);
  });
});

describe('MultiscaleParser', () => {
  it('parses decision rules correctly', () => {
    const definition = {
      name: 'test',
      cellTypes: {
        cell: {
          model: 'begin model\nend model',
          radius: 5,
          motility: 0.1,
          decisions: [
            { name: 'div', when: 'pERK > 0.5', then: 'divide' },
            { name: 'die', when: 'caspase > 1.0', then: 'die' },
            { name: 'sec', when: 'active > 0.8', then: 'secrete(EGF, 100)' },
          ],
        },
      },
      extracellular: { species: [{ name: 'EGF', D: 100, initial: 0 }] },
      domain: { dimensions: 2 as const, size: [100, 100, 1] as [number, number, number], boundary: 'reflective' as const },
      population: [{ cellType: 'cell', count: 5 }],
      time: { end: 10, dtIntra: 0.01, dtExtra: 0.1, dtDecision: 1.0, outputs: 10 },
    };
    const config = parseMultiscaleModel(definition);
    expect(config.cellTypes.length).toBe(1);
    expect(config.cellTypes[0].decisionRules.length).toBe(3);
    expect(config.cellTypes[0].decisionRules[0].condition.observable).toBe('pERK');
    expect(config.cellTypes[0].decisionRules[0].condition.operator).toBe('>');
    expect(config.cellTypes[0].decisionRules[0].condition.threshold).toBe(0.5);
    expect(config.cellTypes[0].decisionRules[0].action.type).toBe('divide');
    expect(config.cellTypes[0].decisionRules[1].action.type).toBe('die');
    expect(config.cellTypes[0].decisionRules[2].action.type).toBe('secrete');
  });
});
