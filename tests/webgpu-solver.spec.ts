// @ts-nocheck
/**
 * WebGPU ODE Solver Tests
 * 
 * Note: WebGPU is not available in Node.js. These tests verify:
 * 1. Module structure and exports
 * 2. WGSL shader generation
 * 3. Fallback behavior when WebGPU is unavailable
 * 
 * Full WebGPU integration testing requires browser environment.
 */

import { describe, it, expect } from 'vitest';
import {
  WebGPUODESolver,
  GPUReaction,
  convertToGPUReactions,
  isWebGPUODESolverAvailable
} from '../src/services/WebGPUODESolver';
import {
  isWebGPUSupported,
  isWebGPUReady
} from '../src/services/WebGPUContext';

describe('WebGPU ODE Solver', () => {
  describe('Availability Detection', () => {
    it('should detect WebGPU is not supported in Node.js', () => {
      // WebGPU is only available in browsers
      expect(isWebGPUSupported()).toBe(false);
    });

    it('should report WebGPU not ready in Node.js', () => {
      expect(isWebGPUReady()).toBe(false);
    });

    it('should return false for WebGPU solver availability in Node.js', async () => {
      const available = await isWebGPUODESolverAvailable();
      expect(available).toBe(false);
    });
  });

  describe('ConvertToGPUReactions', () => {
    it('should convert reaction network to GPU format', () => {
      const reactions = [
        {
          reactants: [{ index: 0, stoichiometry: 1 }, { index: 1, stoichiometry: 1 }],
          products: [{ index: 2, stoichiometry: 1 }],
          rateConstant: 0.1
        },
        {
          reactants: [{ index: 2, stoichiometry: 1 }],
          products: [{ index: 0, stoichiometry: 1 }, { index: 1, stoichiometry: 1 }],
          rateConstant: 0.05
        }
      ];

      const { gpuReactions, rateConstants } = convertToGPUReactions(reactions);

      expect(gpuReactions).toHaveLength(2);
      expect(rateConstants).toEqual([0.1, 0.05]);
      
      // Check first reaction (A + B -> C)
      expect(gpuReactions[0].reactantIndices).toEqual([0, 1]);
      expect(gpuReactions[0].reactantStoich).toEqual([1, 1]);
      expect(gpuReactions[0].productIndices).toEqual([2]);
      expect(gpuReactions[0].productStoich).toEqual([1]);
      expect(gpuReactions[0].rateConstantIndex).toBe(0);

      // Check second reaction (C -> A + B)
      expect(gpuReactions[1].reactantIndices).toEqual([2]);
      expect(gpuReactions[1].reactantStoich).toEqual([1]);
      expect(gpuReactions[1].productIndices).toEqual([0, 1]);
      expect(gpuReactions[1].productStoich).toEqual([1, 1]);
    });

    it('should handle empty reactions', () => {
      const { gpuReactions, rateConstants } = convertToGPUReactions([]);
      expect(gpuReactions).toHaveLength(0);
      expect(rateConstants).toHaveLength(0);
    });
  });

  describe('WebGPUODESolver Constructor', () => {
    it('should create solver with valid parameters', () => {
      const gpuReactions: GPUReaction[] = [
        {
          reactantIndices: [0, 1],
          reactantStoich: [1, 1],
          productIndices: [2],
          productStoich: [1],
          rateConstantIndex: 0,
          isForward: true
        }
      ];

      const solver = new WebGPUODESolver(3, gpuReactions, [0.1]);
      expect(solver).toBeDefined();
    });

    it('should accept custom options', () => {
      const gpuReactions: GPUReaction[] = [];
      const solver = new WebGPUODESolver(2, gpuReactions, [0.1], {
        dt: 0.001,
        atol: 1e-8,
        rtol: 1e-6,
        maxSteps: 50000
      });
      expect(solver).toBeDefined();
    });
  });

  describe('WGSL Shader Generation', () => {
    it('should generate valid shader structure', async () => {
      // Create a simple A + B -> C reaction network
      const gpuReactions: GPUReaction[] = [
        {
          reactantIndices: [0, 1],
          reactantStoich: [1, 1],
          productIndices: [2],
          productStoich: [1],
          rateConstantIndex: 0,
          isForward: true
        },
        {
          reactantIndices: [2],
          reactantStoich: [1],
          productIndices: [0, 1],
          productStoich: [1, 1],
          rateConstantIndex: 1,
          isForward: false
        }
      ];

      const solver = new WebGPUODESolver(3, gpuReactions, [0.1, 0.05]);

      // Access private method for testing (using any type)
      const solverAny = solver as any;
      const rhsShader = solverAny.generateRHSShader();

      // Verify shader contains expected WGSL elements
      expect(rhsShader).toContain('@compute');
      expect(rhsShader).toContain('@workgroup_size');
      expect(rhsShader).toContain('compute_rhs');
      expect(rhsShader).toContain('concentrations');
      expect(rhsShader).toContain('rate_constants');
      expect(rhsShader).toContain('derivatives');
      expect(rhsShader).toContain('SimParams');

      // Verify reaction rates are generated
      expect(rhsShader).toContain('rate_0');
      expect(rhsShader).toContain('rate_1');
    });

    it('should generate RK4 shader', () => {
      const gpuReactions: GPUReaction[] = [];
      const solver = new WebGPUODESolver(2, gpuReactions, []);

      const solverAny = solver as any;
      const rk4Shader = solverAny.generateRK4Shader();

      // Verify RK4 shader structure
      expect(rk4Shader).toContain('@compute');
      expect(rk4Shader).toContain('rk4_step');
      expect(rk4Shader).toContain('k1');
      expect(rk4Shader).toContain('k2');
      expect(rk4Shader).toContain('k3');
      expect(rk4Shader).toContain('k4');
      expect(rk4Shader).toContain('dt / 6.0');
    });
  });

  describe('Fallback Behavior', () => {
    it('should fail compile gracefully when WebGPU unavailable', async () => {
      const gpuReactions: GPUReaction[] = [
        {
          reactantIndices: [0],
          reactantStoich: [1],
          productIndices: [1],
          productStoich: [1],
          rateConstantIndex: 0,
          isForward: true
        }
      ];

      const solver = new WebGPUODESolver(2, gpuReactions, [0.1]);
      
      // compile() should return false when WebGPU is not available
      const compiled = await solver.compile();
      expect(compiled).toBe(false);
    });

    it('should throw error on integrate when not compiled', async () => {
      const solver = new WebGPUODESolver(2, [], []);
      
      await expect(
        solver.integrate(new Float32Array([1, 0]), 0, 1, [0, 0.5, 1])
      ).rejects.toThrow('WebGPU compilation failed');
    });
  });

  describe('Dispose', () => {
    it('should dispose solver without error', () => {
      const solver = new WebGPUODESolver(2, [], []);
      expect(() => solver.dispose()).not.toThrow();
    });
  });
});

describe('WebGPU Context', () => {
  describe('Module Exports', () => {
    it('should export all required functions', async () => {
      const context = await import('../src/services/WebGPUContext');
      
      expect(context.isWebGPUSupported).toBeDefined();
      expect(context.initWebGPU).toBeDefined();
      expect(context.getGPUDevice).toBeDefined();
      expect(context.getGPUAdapter).toBeDefined();
      expect(context.isWebGPUReady).toBeDefined();
      expect(context.createBuffer).toBeDefined();
      expect(context.createStorageBuffer).toBeDefined();
      expect(context.createUniformBuffer).toBeDefined();
      expect(context.createReadBuffer).toBeDefined();
      expect(context.readBuffer).toBeDefined();
      expect(context.createComputePipeline).toBeDefined();
      expect(context.executeComputePass).toBeDefined();
      expect(context.getDeviceLimits).toBeDefined();
      expect(context.disposeWebGPU).toBeDefined();
      expect(context.WebGPUContext).toBeDefined();
    });
  });
});

