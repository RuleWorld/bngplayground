import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CVODESolver, CVodeModule } from '../src/services/simulation/solvers/CVODESolver';

/**
 * B3 regression: `derivativeCallback` and `rootCallback` must not share one
 * cached y pointer. CVODE may interleave the two callbacks with different `y`
 * buffers; if both consult the same `cachedYPtr`, the second callback to run
 * overwrites the cache and the next call for the other callback reuses a view
 * that points at the wrong state vector.
 */

const NEQ = 2;
const NROOTS = 1;

// Distinct, 8-byte-aligned byte offsets well clear of the solver's own mallocs.
const Y_A = 1024;
const Y_B = 2048;
const DYDT = 3072;
const GOUT = 4096;

function makeMockModule(): CVodeModule {
  let next = 64;
  return {
    _init_solver: vi.fn().mockReturnValue(1),
    _init_solver_sparse: vi.fn().mockReturnValue(1),
    _solve_step: vi.fn().mockReturnValue(0),
    _get_y: vi.fn(),
    _destroy_solver: vi.fn(),
    _malloc: vi.fn().mockImplementation(() => {
      const ptr = next;
      next += 64;
      return ptr;
    }),
    _free: vi.fn(),
    HEAPF64: new Float64Array(1024),
    derivativeCallback: () => {},
  };
}

/** Install both callbacks via integrate(), then hand them back for direct driving. */
function installCallbacks(
  f: (y: Float64Array, dydt: Float64Array, t?: number) => void,
  rootFunction: (t: number, y: Float64Array, gout: Float64Array) => void,
  module: CVodeModule,
): { derivative: NonNullable<CVodeModule['derivativeCallback']>; root: NonNullable<CVodeModule['rootCallback']> } {
  const solver = new CVODESolver(NEQ, f, { numRoots: NROOTS, rootFunction });
  const result = solver.integrate(new Float64Array([1, 1]), 0, 1);
  expect(result.success).toBe(true);

  const derivative = module.derivativeCallback;
  const root = module.rootCallback;
  expect(typeof derivative).toBe('function');
  expect(typeof root).toBe('function');
  return { derivative: derivative!, root: root! };
}

describe('CVODESolver callback view caches', () => {
  beforeEach(() => {
    CVODESolver.module = null;
    CVODESolver.initPromise = null;
  });

  it('derivative view tracks its own pointer when the root callback runs in between', () => {
    const module = makeMockModule();
    CVODESolver.module = module;

    const seenOffsets: number[] = [];
    const f = (y: Float64Array, dydt: Float64Array, _t?: number) => {
      seenOffsets.push(y.byteOffset);
      dydt.fill(0);
    };
    const { derivative, root } = installCallbacks(f, (_t, _y, gout) => { gout[0] = 1; }, module);

    derivative(0, Y_A, DYDT);
    root(0, Y_B, GOUT);
    derivative(0, Y_B, DYDT);

    expect(seenOffsets).toEqual([Y_A, Y_B]);
  });

  it('root view tracks its own pointer when the derivative callback runs in between', () => {
    const module = makeMockModule();
    CVODESolver.module = module;

    const seenOffsets: number[] = [];
    const f = (_y: Float64Array, dydt: Float64Array, _t?: number) => { dydt.fill(0); };
    const rootFunction = (_t: number, y: Float64Array, gout: Float64Array) => {
      seenOffsets.push(y.byteOffset);
      gout[0] = 1;
    };
    const { derivative, root } = installCallbacks(f, rootFunction, module);

    root(0, Y_A, GOUT);
    derivative(0, Y_B, DYDT);
    root(0, Y_B, GOUT);

    expect(seenOffsets).toEqual([Y_A, Y_B]);
  });

  it('refreshes derivative views when WASM memory grows and the buffer is replaced', () => {
    const module = makeMockModule();
    CVODESolver.module = module;

    let seenBuffer: ArrayBufferLike | null = null;
    const f = (y: Float64Array, dydt: Float64Array, _t?: number) => {
      seenBuffer = y.buffer;
      dydt.fill(0);
    };
    const { derivative } = installCallbacks(f, (_t, _y, gout) => { gout[0] = 1; }, module);

    derivative(0, Y_A, DYDT);
    const firstBuffer = seenBuffer;
    expect(firstBuffer).toBe(module.HEAPF64.buffer);

    const grown = new Float64Array(2048);
    module.HEAPF64 = grown;
    derivative(0, Y_A, DYDT);

    expect(seenBuffer).toBe(grown.buffer);
    expect(seenBuffer).not.toBe(firstBuffer);
  });

  it('refreshes root views when WASM memory grows and the buffer is replaced', () => {
    const module = makeMockModule();
    CVODESolver.module = module;

    let seenBuffer: ArrayBufferLike | null = null;
    const f = (_y: Float64Array, dydt: Float64Array, _t?: number) => { dydt.fill(0); };
    const rootFunction = (_t: number, y: Float64Array, gout: Float64Array) => {
      seenBuffer = y.buffer;
      gout[0] = 1;
    };
    const { root } = installCallbacks(f, rootFunction, module);

    root(0, Y_A, GOUT);
    const firstBuffer = seenBuffer;

    const grown = new Float64Array(2048);
    module.HEAPF64 = grown;
    root(0, Y_A, GOUT);

    expect(seenBuffer).toBe(grown.buffer);
    expect(seenBuffer).not.toBe(firstBuffer);
  });
});