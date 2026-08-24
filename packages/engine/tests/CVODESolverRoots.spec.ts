import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CVODESolver, CVodeModule } from '../src/services/simulation/solvers/CVODESolver';

describe('CVODESolver rootsFoundPtr allocation safety', () => {
  beforeEach(async () => {
    // Reset static module state
    CVODESolver.module = null;
    CVODESolver.initPromise = null;
  });

  it('handles rootsFoundPtr malloc failure gracefully and cleans up allocated memory', () => {
    const freedPtrs: number[] = [];

    let mallocCallCount = 0;
    const mockModule: CVodeModule = {
      _init_solver: vi.fn().mockReturnValue(1),
      _init_solver_sparse: vi.fn().mockReturnValue(1),
      _solve_step: vi.fn().mockReturnValue(0),
      _get_y: vi.fn(),
      _destroy_solver: vi.fn(),
      _malloc: vi.fn().mockImplementation((size: number) => {
        mallocCallCount++;
        if (mallocCallCount === 1) return 1000; // yPtr
        if (mallocCallCount === 2) return 2000; // tretPtr
        if (mallocCallCount === 3) return 0;    // rootsFoundPtr allocation failure
        return 3000;
      }),
      _free: vi.fn().mockImplementation((ptr: number) => {
        freedPtrs.push(ptr);
      }),
      HEAPF64: new Float64Array(10000),
      derivativeCallback: () => {},
    };

    CVODESolver.module = mockModule;

    const dummyRhs = (_y: Float64Array, dydt: Float64Array) => {
      dydt[0] = 1.0;
    };

    const solver = new CVODESolver(
      1,
      dummyRhs,
      {
        numRoots: 2,
        rootFunction: (_t, _y, gout) => { gout[0] = 1; gout[1] = -1; },
      }
    );

    const y0 = new Float64Array([1.0]);
    const result = solver.integrate(y0, 0, 1.0);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('CVODE malloc failed for rootsFoundPtr');
    expect(freedPtrs).toContain(1000); // yPtr freed
    expect(freedPtrs).toContain(2000); // tretPtr freed
  });
});
