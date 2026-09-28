import { afterEach, describe, expect, it, vi } from 'vitest';
import { CVODESolver, type CVodeModule } from '../src/services/simulation/solvers/CVODESolver';

describe('CVODESolver native rate updates', () => {
  afterEach(() => {
    CVODESolver.module = null;
    CVODESolver.initPromise = null;
  });

  it('updates the loaded native network and frees temporary WASM memory', () => {
    const freed: number[] = [];
    const update = vi.fn();
    CVODESolver.module = {
      _malloc: vi.fn(() => 8),
      _free: vi.fn((ptr) => freed.push(ptr)),
      _cvode_update_rate_constants: update,
      HEAPF64: new Float64Array(8),
    } as unknown as CVodeModule;
    const solver = new CVODESolver(1, () => {}, {} as never);
    (solver as unknown as { networkHandle: number }).networkHandle = 41;

    expect(solver.updateRateConstants(new Float64Array([2, 3]))).toBe(true);
    expect(update).toHaveBeenCalledWith(41, 8, 2);
    expect(CVODESolver.module?.HEAPF64.slice(1, 3)).toEqual(new Float64Array([2, 3]));
    expect(freed).toEqual([8]);
  });

  it('reports when native rate updates are unavailable so callers can rebuild', () => {
    CVODESolver.module = { _malloc: vi.fn(() => 8), _free: vi.fn(), HEAPF64: new Float64Array(8) } as unknown as CVodeModule;
    const solver = new CVODESolver(1, () => {}, {} as never);
    (solver as unknown as { networkHandle: number }).networkHandle = 41;
    expect(solver.updateRateConstants(new Float64Array([2]))).toBe(false);
  });
});
