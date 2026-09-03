import { describe, expect, it, vi } from 'vitest';
import type { BNGLModel } from '../src/types';

const simulateMock = vi.hoisted(() => vi.fn());

vi.mock('../src/services/simulation/SimulationLoop', () => ({
  simulate: simulateMock,
}));
vi.mock('../src/services/simulation/ExpressionEvaluator', () => ({
  loadEvaluator: vi.fn(async () => undefined),
  clearAllEvaluatorCaches: vi.fn(),
}));

import { runParameterScan } from '../src/services/analysis/ParameterScan';

const MODEL = {
  parameters: { x: 1, y: 1 },
  observables: [{ name: 'Obs' }],
  species: [],
  reactions: [],
} as unknown as BNGLModel;

describe('runParameterScan', () => {
  it('supports independent logarithmic spacing for the second axis', async () => {
    simulateMock.mockImplementation(async (_start: number, model: BNGLModel) => ({
      data: [{ time: 0, Obs: model.parameters.y }],
    }));

    const result = await runParameterScan(
      MODEL,
      {
        parameter: 'x',
        start: 1,
        end: 100,
        steps: 3,
        logarithmic: false,
        parameter2: 'y',
        start2: 1,
        end2: 100,
        steps2: 3,
        logarithmic2: true,
      },
      { method: 'ode', t_end: 1, n_steps: 1 },
      new Map(),
    );

    expect(result.mode).toBe('2d');
    expect(result.xValues).toEqual([1, 50.5, 100]);
    expect(result.yValues).toEqual([1, 10, 100]);
  });
});
