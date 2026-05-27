// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRobustness } from '../../src/hooks/useRobustness';
import { bnglService } from '../../services/bnglService';
import { perturbParameterOverrides } from '../../src/utils/bnglManipulation';

vi.mock('../../services/bnglService', () => ({
    bnglService: {
        prepareModel: vi.fn(),
        simulateCached: vi.fn(),
        releaseModel: vi.fn(),
    }
}));

vi.mock('../../src/utils/bnglManipulation', () => ({
    perturbParameterOverrides: vi.fn()
}));

describe('useRobustness hook', () => {
    const dummyModel = { parameters: { k: 1 } } as any;
    const dummySimOptions = { method: 'ode' } as any;
    const dummyRobustnessOptions = { iterations: 2, variationPercent: 10 };

    beforeEach(() => {
        vi.clearAllMocks();
        // Default happy path mocks
        vi.mocked(bnglService.prepareModel).mockResolvedValue(123);
        vi.mocked(bnglService.releaseModel).mockResolvedValue(undefined);
        vi.mocked(perturbParameterOverrides).mockReturnValue({ k: 1.1 });
    });

    it('should initialize with default states', () => {
        const { result } = renderHook(() => useRobustness());

        expect(result.current.isRunning).toBe(false);
        expect(result.current.progress).toBe(0);
        expect(result.current.result).toBeNull();
        expect(result.current.error).toBeNull();
        expect(typeof result.current.runRobustness).toBe('function');
        expect(typeof result.current.cancelRobustness).toBe('function');
    });

    it('should successfully execute robustness analysis and calculate stats', async () => {
        // Mock simulation results for 2 iterations
        // Run 1: A=10
        // Run 2: A=20
        vi.mocked(bnglService.simulateCached)
            .mockResolvedValueOnce({
                headers: ['time', 'A'],
                data: [{ time: 0, A: 10 }, { time: 1, A: 10 }]
            } as any)
            .mockResolvedValueOnce({
                headers: ['time', 'A'],
                data: [{ time: 0, A: 20 }, { time: 1, A: 30 }]
            } as any);

        const { result } = renderHook(() => useRobustness());

        act(() => {
            result.current.runRobustness(dummyModel, dummySimOptions, dummyRobustnessOptions);
        });

        // Ensure state is updated correctly while running
        await waitFor(() => {
            expect(result.current.isRunning).toBe(true);
        });

        // Wait for it to finish
        await waitFor(() => {
            expect(result.current.isRunning).toBe(false);
        });

        expect(result.current.error).toBeNull();
        expect(result.current.progress).toBe(100);

        // Verify bnglService interactions
        expect(bnglService.prepareModel).toHaveBeenCalledTimes(1);
        expect(bnglService.simulateCached).toHaveBeenCalledTimes(2);
        expect(bnglService.releaseModel).toHaveBeenCalledWith(123);

        // Verify calculations
        // Iteration 1: time=0: A=10, time=1: A=10
        // Iteration 2: time=0: A=20, time=1: A=30
        // Expected mean for A at time 0: (10+20)/2 = 15
        // Expected mean for A at time 1: (10+30)/2 = 20

        // Variance at time 0 = (100+400)/2 - (15*15) = 250 - 225 = 25. StdDev = sqrt(25) = 5
        // Variance at time 1 = (100+900)/2 - (20*20) = 500 - 400 = 100. StdDev = sqrt(100) = 10

        expect(result.current.result).not.toBeNull();
        expect(result.current.result?.time).toEqual([0, 1]);
        expect(result.current.result?.iterations).toBe(2);
        expect(result.current.result?.speciesData['A']).toEqual({
            mean: [15, 20],
            stdDev: [5, 10],
            min: [10, 10],
            max: [20, 30]
        });
    });

    it('should handle simulation errors correctly', async () => {
        vi.mocked(bnglService.simulateCached).mockRejectedValueOnce(new Error('Simulation failed dramatically'));

        const { result } = renderHook(() => useRobustness());

        act(() => {
            result.current.runRobustness(dummyModel, dummySimOptions, dummyRobustnessOptions);
        });

        await waitFor(() => {
            expect(result.current.isRunning).toBe(false);
        });

        expect(result.current.error).toBe('Simulation failed dramatically');
        expect(result.current.result).toBeNull();
    });

    it('should handle cancellation (AbortError) without setting an error', async () => {
        const abortError = new Error('Simulation aborted');
        abortError.name = 'AbortError';

        vi.mocked(bnglService.simulateCached).mockRejectedValueOnce(abortError);

        const { result } = renderHook(() => useRobustness());

        act(() => {
            result.current.runRobustness(dummyModel, dummySimOptions, dummyRobustnessOptions);
        });

        await waitFor(() => {
            expect(result.current.isRunning).toBe(false);
        });

        // Error should remain null for cancellations
        expect(result.current.error).toBeNull();
        expect(result.current.result).toBeNull();
    });

    it('cancelRobustness should trigger abort controller', async () => {
        // Mock to hang so we can cancel it
        vi.mocked(bnglService.simulateCached).mockImplementation(
            () => new Promise((_, reject) => { const err = new Error("Simulation aborted"); err.name = "AbortError"; setTimeout(() => reject(err), 100); })
        );

        const { result } = renderHook(() => useRobustness());

        act(() => {
            result.current.runRobustness(dummyModel, dummySimOptions, dummyRobustnessOptions);
        });

        // Ensure it's running
        await waitFor(() => {
            expect(result.current.isRunning).toBe(true);
        });

        // Trigger cancellation
        act(() => {
            result.current.cancelRobustness();
        });

        // The AbortError logic inside runRobustness should catch it
        // Wait for it to settle back to false
        await waitFor(() => {
            expect(result.current.isRunning).toBe(false);
        });

        // No error should be set
        expect(result.current.error).toBeNull();
    });
});
