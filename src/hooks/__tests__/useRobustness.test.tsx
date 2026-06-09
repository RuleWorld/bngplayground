// @vitest-environment jsdom
// Mock Worker globally before ANY imports
globalThis.Worker = class Worker {
  constructor() {}
  postMessage() {}
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
} as any;

import { renderHook, act } from '@testing-library/react';
import { useRobustness } from '../useRobustness';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the dependencies FIRST before they get imported
vi.mock('../../../services/bnglService', () => ({
  bnglService: {
    prepareModel: vi.fn(),
    simulateCached: vi.fn(),
    releaseModel: vi.fn(),
  }
}));

vi.mock('../../utils/bnglManipulation', () => ({
  perturbParameterOverrides: vi.fn((params) => params) // identity map for tests
}));

describe('useRobustness', () => {
  let bnglService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    bnglService = (await import('../../../services/bnglService')).bnglService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should calculate stats correctly across multiple iterations', async () => {
    const { result } = renderHook(() => useRobustness());

    (bnglService.prepareModel as any).mockResolvedValue(123);

    const run1Data = [
      { time: 0, S1: 10, S2: 5 },
      { time: 1, S1: 20, S2: 10 }
    ];

    const run2Data = [
      { time: 0, S1: 12, S2: 7 },
      { time: 1, S1: 24, S2: 14 }
    ];

    (bnglService.simulateCached as any)
      .mockResolvedValueOnce({ data: run1Data, headers: ['time', 'S1', 'S2'] })
      .mockResolvedValueOnce({ data: run2Data, headers: ['time', 'S1', 'S2'] });

    const model: any = { parameters: { k1: 1.0 } };
    const simOptions: any = {};
    const robustnessOptions = { iterations: 2, variationPercent: 10 };

    await act(async () => {
      await result.current.runRobustness(model, simOptions, robustnessOptions);
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.progress).toBe(100);
    expect(result.current.error).toBeNull();

    const robustnessResult = result.current.result;
    expect(robustnessResult).not.toBeNull();

    expect(robustnessResult?.time).toEqual([0, 1]);

    expect(robustnessResult?.speciesData['S1'].mean).toEqual([11, 22]);
    expect(robustnessResult?.speciesData['S1'].stdDev[0]).toBeCloseTo(1);
    expect(robustnessResult?.speciesData['S1'].stdDev[1]).toBeCloseTo(2);
    expect(robustnessResult?.speciesData['S1'].min).toEqual([10, 20]);
    expect(robustnessResult?.speciesData['S1'].max).toEqual([12, 24]);

    expect(robustnessResult?.speciesData['S2'].mean).toEqual([6, 12]);
    expect(robustnessResult?.speciesData['S2'].stdDev[0]).toBeCloseTo(1);
    expect(robustnessResult?.speciesData['S2'].stdDev[1]).toBeCloseTo(2);
    expect(robustnessResult?.speciesData['S2'].min).toEqual([5, 10]);
    expect(robustnessResult?.speciesData['S2'].max).toEqual([7, 14]);

    expect(bnglService.prepareModel).toHaveBeenCalledTimes(1);
    expect(bnglService.simulateCached).toHaveBeenCalledTimes(2);
    expect(bnglService.releaseModel).toHaveBeenCalledTimes(1);
    expect(bnglService.releaseModel).toHaveBeenCalledWith(123);
  });

  it('should handle cancellation correctly', async () => {
    const { result } = renderHook(() => useRobustness());

    let prepareModelPromiseResolve: any;
    const prepareModelPromise = new Promise((resolve) => {
      prepareModelPromiseResolve = resolve;
    });

    (bnglService.prepareModel as any).mockImplementation((model: any, opts: any) => {
      if (opts?.signal) {
        opts.signal.addEventListener('abort', () => {
          const err = new Error('Simulation aborted');
          err.name = 'AbortError';
          prepareModelPromiseResolve(Promise.reject(err));
        });
      }
      return prepareModelPromise;
    });

    const model: any = { parameters: {} };
    const simOptions: any = {};
    const robustnessOptions = { iterations: 1, variationPercent: 10 };

    let robustnessPromise: any;

    await act(async () => {
      robustnessPromise = result.current.runRobustness(model, simOptions, robustnessOptions);
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.isRunning).toBe(true);

    await act(async () => {
      result.current.cancelRobustness();
    });

    await act(async () => {
      await robustnessPromise;
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();
  });

  it('should not throw if cancelling when not running', () => {
    const { result } = renderHook(() => useRobustness());

    // Nothing is running, so abortControllerRef.current is null
    act(() => {
      expect(() => result.current.cancelRobustness()).not.toThrow();
    });
  });

  it('should handle errors during simulation', async () => {
    const { result } = renderHook(() => useRobustness());

    const testError = new Error('Simulation failed unexpectedly');
    (bnglService.prepareModel as any).mockRejectedValue(testError);

    const model: any = { parameters: {} };
    const simOptions: any = {};
    const robustnessOptions = { iterations: 1, variationPercent: 10 };

    // Prevent React from logging the expected error during tests to keep console clean
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      await result.current.runRobustness(model, simOptions, robustnessOptions);
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toBe('Simulation failed unexpectedly');
    expect(result.current.result).toBeNull();

    consoleSpy.mockRestore();
  });

  it('should fallback to default error message if error has no message', async () => {
    const { result } = renderHook(() => useRobustness());

    (bnglService.prepareModel as any).mockRejectedValue('String error without message property');

    const model: any = { parameters: {} };
    const simOptions: any = {};
    const robustnessOptions = { iterations: 1, variationPercent: 10 };

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      await result.current.runRobustness(model, simOptions, robustnessOptions);
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toBe('Robustness Analysis Failed');
    expect(result.current.result).toBeNull();

    consoleSpy.mockRestore();
  });

  it('should handle missing data points smoothly and update mins and maxs', async () => {
    const { result } = renderHook(() => useRobustness());

    (bnglService.prepareModel as any).mockResolvedValue(123);

    // Simulate data where some points might be undefined (this matches the if (value !== undefined) check)
    const run1Data = [
      { time: 0, S1: 10 },
      { time: 1, S1: undefined as unknown as number } // Type cast for testing
    ];
    // A second run with a smaller and larger value to hit min/max update branches
    const run2Data = [
      { time: 0, S1: 5 },
      { time: 1, S1: 20 }
    ];

    (bnglService.simulateCached as any)
      .mockResolvedValueOnce({ data: run1Data, headers: ['time', 'S1'] })
      .mockResolvedValueOnce({ data: run2Data, headers: ['time', 'S1'] });

    const model: any = { parameters: { k1: 1.0 } };
    const simOptions: any = {};
    const robustnessOptions = { iterations: 2, variationPercent: 10 };

    await act(async () => {
      await result.current.runRobustness(model, simOptions, robustnessOptions);
    });

    expect(result.current.isRunning).toBe(false);

    const robustnessResult = result.current.result;
    expect(robustnessResult).not.toBeNull();

    // Run 1: t=0 -> 10, t=1 -> undef
    // Run 2: t=0 -> 5,  t=1 -> 20
    // sum t=0 -> 15. mean -> 7.5. min -> 5. max -> 10.
    // sum t=1 -> 20. mean -> 10. min -> 20. max -> 20.
    expect(robustnessResult?.speciesData['S1'].mean[0]).toBe(7.5);
    expect(robustnessResult?.speciesData['S1'].mean[1]).toBe(10);
    expect(robustnessResult?.speciesData['S1'].min[0]).toBe(5);
    expect(robustnessResult?.speciesData['S1'].max[0]).toBe(10);
    expect(robustnessResult?.speciesData['S1'].min[1]).toBe(20);
    expect(robustnessResult?.speciesData['S1'].max[1]).toBe(20);
  });

  it('should hit the signal.aborted case in the iteration loop', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useRobustness());

    (bnglService.prepareModel as any).mockResolvedValue(123);

    (bnglService.simulateCached as any).mockImplementation(async (id: number, overrides: any, simOpts: any, requestOpts: any) => {
      if (requestOpts?.signal) {
         // just mutate it directly
         Object.defineProperty(requestOpts.signal, 'aborted', { value: true, writable: true });
         Object.defineProperty(requestOpts.signal, 'aborted', { value: true });
      }
      return { data: [{ time: 0, S1: 10 }], headers: ['time', 'S1'] };
    });

    const model: any = { parameters: {} };
    const simOptions: any = {};
    const robustnessOptions = { iterations: 2, variationPercent: 10 };

    await act(async () => {
      await result.current.runRobustness(model, simOptions, robustnessOptions);
    });

    expect(result.current.isRunning).toBe(false);
    consoleSpy.mockRestore();
  });
});
