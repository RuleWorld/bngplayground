import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CVODESolver, type CVodeModule } from '../src/services/simulation/solvers/CVODESolver';

describe('CVODESolver initial-state reinitialization', () => {
  beforeEach(() => {
    CVODESolver.module = null;
    CVODESolver.initPromise = null;
  });

  it('reinitializes existing solver memory without destroying loaded topology', () => {
    let nextPointer = 64;
    const module: CVodeModule = {
      _malloc: vi.fn(() => { const pointer = nextPointer; nextPointer += 64; return pointer; }),
      _free: vi.fn(),
      _init_solver: vi.fn(() => 77),
      _init_solver_sparse: vi.fn(() => 77),
      _reinit_solver: vi.fn(() => 0),
      _destroy_solver: vi.fn(),
      _solve_step: vi.fn(() => 0),
      _get_y: vi.fn(),
      HEAPF64: new Float64Array(256),
      derivativeCallback: () => undefined,
    };
    CVODESolver.module = module;

    const solver = new CVODESolver(2, (_y, dydt) => dydt.fill(0));
    const initialize = (solver as unknown as { ensureInitialized(y0: Float64Array, t0: number): { success: boolean } }).ensureInitialized.bind(solver);
    expect(initialize(new Float64Array([1, 2]), 0).success).toBe(true);
    expect(initialize(new Float64Array([3, 4]), 0).success).toBe(true);

    expect(module._reinit_solver).toHaveBeenCalledWith(77, 0, expect.any(Number));
    expect(module._init_solver).toHaveBeenCalledTimes(1);
    expect(module._destroy_solver).not.toHaveBeenCalled();
    solver.destroy();
  });
});
