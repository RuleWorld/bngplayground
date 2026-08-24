import { beforeEach, describe, expect, it, vi } from 'vitest';

const simulateMock = vi.hoisted(() => vi.fn());

vi.mock('@bngplayground/engine', async (importOriginal) => ({
  ...await importOriginal<typeof import('@bngplayground/engine')>(),
  simulate: simulateMock,
}));

import { ODESolverAdapter } from './ParameterEstimation.integration';

describe('ODESolverAdapter simulation output', () => {
  beforeEach(() => {
    simulateMock.mockReset();
    simulateMock.mockResolvedValue({
      headers: ['time', 'Obs'],
      data: [{ time: 0, Obs: 10 }, { time: 1, Obs: 4 }],
    });
  });

  it('requests only observable data from the engine', async () => {
    const adapter = new ODESolverAdapter({
      parameters: { k: 1 },
      moleculeTypes: [],
      species: [{ name: 'A()', initialConcentration: 10 }],
      observables: [{ name: 'Obs', type: 'molecules', pattern: 'A()' }],
      reactions: [],
      reactionRules: [],
    });

    const result = await adapter.simulate(['k'], [1.1], [0, 1], ['Obs']);

    expect(simulateMock).toHaveBeenCalledOnce();
    expect(simulateMock.mock.calls[0][2]).toEqual(expect.objectContaining({
      includeSpeciesData: false,
      includeExpandedNetwork: false,
    }));
    expect(result.get('Obs')).toEqual([10, 4]);
  });
});
