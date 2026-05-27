import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import {
  computeEnsembleStatistics,
  initializePRNGState,
  createSSABuffers,
  readSSAResults,
  destroySSABuffers,
  type GPUBufferSet,
} from '../../src/services/WebGPUBuffers';
import type { GPUSSAConfig } from '../../src/services/WebGPUSSA';

describe('WebGPUBuffers', () => {

  // ---------------------------------------------------------------------------
  // 1. Ensemble statistics on known data
  // ---------------------------------------------------------------------------

  describe('computeEnsembleStatistics', () => {
    it('computes correct mean and variance for known data', () => {
      // 4 trajectories, 1 time point, 1 species
      // Values: 2, 4, 6, 8
      const nTraj = 4;
      const nTP = 1;
      const nSp = 1;
      const data = new Float32Array([2, 4, 6, 8]);

      const stats = computeEnsembleStatistics(data, nTraj, nTP, nSp);

      expect(stats.length).toBe(1);
      expect(stats[0].mean[0]).toBeCloseTo(5.0, 5);
      // Sample variance = sum((x-mean)^2) / (n-1) = (9+1+1+9)/3 = 20/3
      expect(stats[0].variance[0]).toBeCloseTo(20 / 3, 4);
    });

    it('computes correct quantiles', () => {
      // 100 trajectories, 1 time point, 1 species
      // Values: 1, 2, ..., 100
      const nTraj = 100;
      const data = new Float32Array(nTraj);
      for (let i = 0; i < nTraj; i++) data[i] = i + 1;

      const stats = computeEnsembleStatistics(data, nTraj, 1, 1);

      // 5th percentile of 1..100: rank = 0.05 * 99 = 4.95 -> ~5.95
      expect(stats[0].quantile05[0]).toBeCloseTo(5.95, 0);
      // 95th percentile: rank = 0.95 * 99 = 94.05 -> ~95.05
      expect(stats[0].quantile95[0]).toBeCloseTo(95.05, 0);
    });

    it('handles multiple species and time points', () => {
      // 2 trajectories, 2 time points, 2 species
      // Layout: traj0_tp0_sp0, traj0_tp0_sp1, traj0_tp1_sp0, traj0_tp1_sp1,
      //         traj1_tp0_sp0, traj1_tp0_sp1, traj1_tp1_sp0, traj1_tp1_sp1
      const data = new Float32Array([
        10, 20, 30, 40,  // trajectory 0
        20, 40, 50, 60,  // trajectory 1
      ]);

      const stats = computeEnsembleStatistics(data, 2, 2, 2);

      expect(stats.length).toBe(2);
      // tp0, sp0: mean of (10, 20) = 15
      expect(stats[0].mean[0]).toBeCloseTo(15, 5);
      // tp0, sp1: mean of (20, 40) = 30
      expect(stats[0].mean[1]).toBeCloseTo(30, 5);
      // tp1, sp0: mean of (30, 50) = 40
      expect(stats[1].mean[0]).toBeCloseTo(40, 5);
      // tp1, sp1: mean of (40, 60) = 50
      expect(stats[1].mean[1]).toBeCloseTo(50, 5);
    });

    it('single trajectory has zero variance', () => {
      const data = new Float32Array([7, 3]);
      const stats = computeEnsembleStatistics(data, 1, 2, 1);
      expect(stats[0].variance[0]).toBe(0);
      expect(stats[1].variance[0]).toBe(0);
      expect(stats[0].quantile05[0]).toBe(7);
      expect(stats[0].quantile95[0]).toBe(7);
    });

    it('handles nTrajectories = 0 gracefully', () => {
      const data = new Float32Array([]);
      const stats = computeEnsembleStatistics(data, 0, 1, 1);
      expect(stats.length).toBe(1);
      expect(stats[0].mean[0]).toBeNaN();
      expect(stats[0].variance[0]).toBe(0);
      expect(stats[0].quantile05[0]).toBe(0); // From percentile n===0 check
      expect(stats[0].quantile95[0]).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. PRNG initialization
  // ---------------------------------------------------------------------------

  describe('initializePRNGState', () => {
    it('produces correct length', () => {
      const state = initializePRNGState(100, 42);
      expect(state.length).toBe(400); // 100 * 4
    });

    it('different seeds produce different states', () => {
      const s1 = initializePRNGState(10, 1);
      const s2 = initializePRNGState(10, 2);

      let allSame = true;
      for (let i = 0; i < s1.length; i++) {
        if (s1[i] !== s2[i]) {
          allSame = false;
          break;
        }
      }
      expect(allSame).toBe(false);
    });

    it('same seed produces same states', () => {
      const s1 = initializePRNGState(10, 42);
      const s2 = initializePRNGState(10, 42);

      for (let i = 0; i < s1.length; i++) {
        expect(s1[i]).toBe(s2[i]);
      }
    });

    it('no trajectory has all-zero state', () => {
      const state = initializePRNGState(50, 0);
      for (let t = 0; t < 50; t++) {
        const allZero =
          state[t * 4] === 0 &&
          state[t * 4 + 1] === 0 &&
          state[t * 4 + 2] === 0 &&
          state[t * 4 + 3] === 0;
        expect(allZero).toBe(false);
      }
    });

    it('different trajectories get different states', () => {
      const state = initializePRNGState(20, 42);
      // Check that at least trajectory 0 and trajectory 1 differ
      const t0 = [state[0], state[1], state[2], state[3]];
      const t1 = [state[4], state[5], state[6], state[7]];
      const same = t0[0] === t1[0] && t0[1] === t1[1] && t0[2] === t1[2] && t0[3] === t1[3];
      expect(same).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. GPU Buffer creation, readback, and destruction
  // ---------------------------------------------------------------------------

  describe('buffer management', () => {
    // Mock GPUDevice and its methods
    const mockDevice = {
      createBuffer: vi.fn(),
      createCommandEncoder: vi.fn(),
      queue: {
        submit: vi.fn(),
      },
    } as unknown as GPUDevice;

    const mockConfig: GPUSSAConfig = {
      nSpecies: 2,
      nTrajectories: 10,
      nOutputPoints: 5,
      tEnd: 10,
      reactions: [],
      speciesNames: ['A', 'B'],
      initialState: new Float64Array([100, 0]),
      seed: 42,
      maxStepsPerTrajectory: 1000,
    };

    beforeAll(() => {
      // Mock WebGPU constants if not in a browser environment
      if (typeof globalThis.GPUBufferUsage === 'undefined') {
        (globalThis as any).GPUBufferUsage = {
          UNIFORM: 0x0040,
          STORAGE: 0x0080,
          COPY_SRC: 0x0004,
          COPY_DST: 0x0008,
          MAP_READ: 0x0001,
        };
      }
      if (typeof globalThis.GPUMapMode === 'undefined') {
        (globalThis as any).GPUMapMode = {
          READ: 0x0001,
          WRITE: 0x0002,
        };
      }
    });

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('createSSABuffers creates all required buffers', () => {
      const mockBuffer = {} as GPUBuffer;
      (mockDevice.createBuffer as any).mockReturnValue(mockBuffer);

      const buffers = createSSABuffers(mockDevice, mockConfig);

      expect(mockDevice.createBuffer).toHaveBeenCalledTimes(8);

      expect(buffers.params).toBe(mockBuffer);
      expect(buffers.initialState).toBe(mockBuffer);
      expect(buffers.output).toBe(mockBuffer);
      expect(buffers.prngState).toBe(mockBuffer);
      expect(buffers.outputTimes).toBe(mockBuffer);
      expect(buffers.totalReactions).toBe(mockBuffer);
      expect(buffers.readbackBuffer).toBe(mockBuffer);
      expect(buffers.readbackReactionsBuffer).toBe(mockBuffer);

      // Verify sizes are computed correctly
      // paramsSize = 16
      expect(mockDevice.createBuffer).toHaveBeenCalledWith(expect.objectContaining({ size: 16 }));
      // initialStateSize = 2 * 4 = 8
      expect(mockDevice.createBuffer).toHaveBeenCalledWith(expect.objectContaining({ size: 8 }));
      // outputSize = 10 * 5 * 2 * 4 = 400
      expect(mockDevice.createBuffer).toHaveBeenCalledWith(expect.objectContaining({ size: 400 }));
      // prngSize = 10 * 4 * 4 = 160
      expect(mockDevice.createBuffer).toHaveBeenCalledWith(expect.objectContaining({ size: 160 }));
      // outputTimesSize = 5 * 4 = 20
      expect(mockDevice.createBuffer).toHaveBeenCalledWith(expect.objectContaining({ size: 20 }));
      // totalReactionsSize = 10 * 4 = 40
      expect(mockDevice.createBuffer).toHaveBeenCalledWith(expect.objectContaining({ size: 40 }));
    });

    it('readSSAResults encodes copies and maps readback buffers', async () => {
      const outputArrayBuffer = new ArrayBuffer(400); // 400 bytes matching outputSize
      const reactionsArrayBuffer = new ArrayBuffer(40); // 40 bytes matching totalReactionsSize

      const mockReadbackBuffer = {
        mapAsync: vi.fn().mockResolvedValue(undefined),
        getMappedRange: vi.fn().mockReturnValue(outputArrayBuffer),
        unmap: vi.fn(),
      } as unknown as GPUBuffer;

      const mockReadbackReactionsBuffer = {
        mapAsync: vi.fn().mockResolvedValue(undefined),
        getMappedRange: vi.fn().mockReturnValue(reactionsArrayBuffer),
        unmap: vi.fn(),
      } as unknown as GPUBuffer;

      const mockBuffers: GPUBufferSet = {
        params: {} as GPUBuffer,
        initialState: {} as GPUBuffer,
        output: {} as GPUBuffer,
        prngState: {} as GPUBuffer,
        outputTimes: {} as GPUBuffer,
        totalReactions: {} as GPUBuffer,
        readbackBuffer: mockReadbackBuffer,
        readbackReactionsBuffer: mockReadbackReactionsBuffer,
      };

      const mockCommandEncoder = {
        copyBufferToBuffer: vi.fn(),
        finish: vi.fn().mockReturnValue('mockCommandBuffer'),
      };
      (mockDevice.createCommandEncoder as any).mockReturnValue(mockCommandEncoder);

      const result = await readSSAResults(mockDevice, mockBuffers, mockConfig);

      // Verify command encoder usage
      expect(mockDevice.createCommandEncoder).toHaveBeenCalled();
      expect(mockCommandEncoder.copyBufferToBuffer).toHaveBeenCalledTimes(2);
      expect(mockCommandEncoder.copyBufferToBuffer).toHaveBeenCalledWith(mockBuffers.output, 0, mockReadbackBuffer, 0, 400);
      expect(mockCommandEncoder.copyBufferToBuffer).toHaveBeenCalledWith(mockBuffers.totalReactions, 0, mockReadbackReactionsBuffer, 0, 40);
      expect(mockCommandEncoder.finish).toHaveBeenCalled();

      // Verify queue submit
      expect(mockDevice.queue.submit).toHaveBeenCalledWith(['mockCommandBuffer']);

      // Verify buffer mapping and reading
      expect(mockReadbackBuffer.mapAsync).toHaveBeenCalledWith(GPUMapMode.READ);
      expect(mockReadbackReactionsBuffer.mapAsync).toHaveBeenCalledWith(GPUMapMode.READ);
      expect(mockReadbackBuffer.getMappedRange).toHaveBeenCalled();
      expect(mockReadbackReactionsBuffer.getMappedRange).toHaveBeenCalled();
      expect(mockReadbackBuffer.unmap).toHaveBeenCalled();
      expect(mockReadbackReactionsBuffer.unmap).toHaveBeenCalled();

      // Verify returned types
      expect(result.rawOutput).toBeInstanceOf(Float32Array);
      expect(result.rawOutput.length).toBe(100); // 400 bytes / 4 bytes per float
      expect(result.totalReactions).toBeInstanceOf(Uint32Array);
      expect(result.totalReactions.length).toBe(10); // 40 bytes / 4 bytes per uint32
    });

    it('destroySSABuffers destroys all buffers', () => {
      const mockBuffer = {
        destroy: vi.fn(),
      } as unknown as GPUBuffer;

      const mockBuffers: GPUBufferSet = {
        params: mockBuffer,
        initialState: mockBuffer,
        output: mockBuffer,
        prngState: mockBuffer,
        outputTimes: mockBuffer,
        totalReactions: mockBuffer,
        readbackBuffer: mockBuffer,
        readbackReactionsBuffer: mockBuffer,
      };

      destroySSABuffers(mockBuffers);

      expect(mockBuffer.destroy).toHaveBeenCalledTimes(8);
    });
  });
});
