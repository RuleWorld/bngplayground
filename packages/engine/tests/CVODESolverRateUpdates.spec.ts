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

  it('logs the native verifier reason and evaluates JS RHS after native upload rejection', () => {
    const heap = new ArrayBuffer(8192);
    const heapBytes = new Uint8Array(heap);
    const message = new TextEncoder().encode('reactantIdx[0] out of range');
    heapBytes.set(message, 3000);
    heapBytes[3000 + message.length] = 0;
    let nextPtr = 8;
    let statePtr = 0;
    let module: CVodeModule;
    const load = vi.fn(() => 0);
    const rhs = vi.fn((state: Float64Array, derivative: Float64Array) => {
      derivative[0] = state[0] * 2;
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    module = {
      _malloc: vi.fn((size: number) => {
        const ptr = nextPtr;
        nextPtr += Math.max(8, (size + 7) & ~7);
        return ptr;
      }),
      _free: vi.fn(),
      _cvode_load_network: load,
      _get_last_load_error: vi.fn(() => 3000),
      _init_solver: vi.fn((_neq, _t0, yPtr) => {
        statePtr = yPtr;
        return 1;
      }),
      _solve_step: vi.fn((_mem, tout, tretPtr) => {
        module.HEAPF64[tretPtr >> 3] = tout;
        module.derivativeCallback(tout / 2, statePtr, 2048);
        return 1;
      }),
      _get_y: vi.fn(),
      _destroy_solver: vi.fn(),
      HEAPF64: new Float64Array(heap),
      derivativeCallback: vi.fn(),
    } as unknown as CVodeModule;
    CVODESolver.module = module;

    const bytecode = {
      nReactions: 1, nSpecies: 1, rateConstants: new Float64Array([1]),
      nReactantsPerRxn: new Int32Array([0]), reactantOffsets: new Int32Array([0, 0]),
      reactantIdx: new Int32Array(0), reactantStoich: new Int32Array(0),
      scalingVolumes: new Float64Array([1]), speciesOffsets: new Int32Array([0, 0]),
      speciesRxnIdx: new Int32Array(0), speciesStoich: new Float64Array(0),
      speciesVolumes: new Float64Array([1]), nObservables: 0,
      jacRowPtr: new Int32Array([0, 0]), jacColIdx: new Int32Array(0),
      jacContribOffsets: new Int32Array([0]), jacContribRxnIdx: new Int32Array(0),
      jacContribCoeffs: new Float64Array(0),
      obsOffsets: new Int32Array([0]), obsSpeciesIdx: new Int32Array(0),
      obsCoeffs: new Float64Array(0), exprBytecodeOffsets: new Int32Array([0, 0]),
      exprBytecode: new Uint8Array(0), exprConstants: new Float64Array(0),
    };
    const solver = new CVODESolver(1, rhs, { networkByteCode: bytecode });
    const result = solver.integrate(new Float64Array([3.5]), 0, 1);

    expect(result.success).toBe(true);
    expect(load).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('reactantIdx[0] out of range'));
    expect(rhs).toHaveBeenCalledOnce();
    expect(Array.from(rhs.mock.calls[0][0])).toEqual([3.5]);
    warn.mockRestore();
  });
});
