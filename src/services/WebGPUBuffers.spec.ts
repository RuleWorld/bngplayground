import { describe, it, expect } from 'vitest';
import { initializePRNGState } from './WebGPUBuffers';

describe('WebGPUBuffers PRNG Initialization', () => {
  describe('initializePRNGState', () => {
    it('should return a Uint32Array of the correct length', () => {
      const nTrajectories = 5;
      const seed = 12345;
      const state = initializePRNGState(nTrajectories, seed);

      expect(state).toBeInstanceOf(Uint32Array);
      expect(state.length).toBe(nTrajectories * 4);
    });

    it('should be deterministic (same inputs yield same outputs)', () => {
      const nTrajectories = 3;
      const seed = 42;

      const state1 = initializePRNGState(nTrajectories, seed);
      const state2 = initializePRNGState(nTrajectories, seed);

      expect(state1).toEqual(state2);
    });

    it('should generate distinct values across trajectories', () => {
      const nTrajectories = 2;
      const seed = 42;
      const state = initializePRNGState(nTrajectories, seed);

      const traj0State = state.slice(0, 4);
      const traj1State = state.slice(4, 8);

      // Arrays should not be strictly equal
      expect(traj0State).not.toEqual(traj1State);

      // Values should also be distinct to avoid poor state initialization
      const allValues = new Set(state);
      expect(allValues.size).toBeGreaterThan(1);
    });

    it('should generate distinct states for different seeds', () => {
      const nTrajectories = 2;

      const state1 = initializePRNGState(nTrajectories, 42);
      const state2 = initializePRNGState(nTrajectories, 43);

      expect(state1).not.toEqual(state2);
    });

    it('should handle zero trajectories correctly', () => {
      const state = initializePRNGState(0, 42);
      expect(state).toBeInstanceOf(Uint32Array);
      expect(state.length).toBe(0);
    });

    it('should handle seed = 0 correctly', () => {
      const state = initializePRNGState(2, 0);
      expect(state).toBeInstanceOf(Uint32Array);
      expect(state.length).toBe(8);

      // Verify that the state is not just all zeros
      const allZero = Array.from(state).every((val) => val === 0);
      expect(allZero).toBe(false);
    });

    it('should avoid generating all-zero chunks to prevent broken xoshiro states', () => {
      const state = initializePRNGState(100, 1337);

      for (let i = 0; i < 100; i++) {
         const chunk = state.slice(i * 4, i * 4 + 4);
         const isAllZeros = chunk.every(v => v === 0);
         expect(isAllZeros).toBe(false);
      }
    });
  });
});
