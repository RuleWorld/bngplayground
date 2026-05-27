import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelValidator, runValidation } from '../src/validation/ModelValidator';
import fs from 'fs';
import path from 'path';

vi.mock('fs');
vi.mock('path');

describe('ModelValidator', () => {
  let validator: ModelValidator;

  beforeEach(() => {
    vi.clearAllMocks();
    validator = new ModelValidator('/mock/dir');
    vi.mocked(path.resolve).mockImplementation((...args) => args.join('/'));
  });

  describe('validateModel', () => {
    it('should return error if model file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await validator.validateModel('missing_model');

      expect(result.passed).toBe(false);
      expect(result.errors).toContain('Model file not found: /mock/dir/missing_model/ref_model.bngl');
    });

    it('should pass for valid model without special features', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('normal bngl content');

      const result = await validator.validateModel('valid_model');

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn for bond wildcards', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('A(b!+)');

      const result = await validator.validateModel('wildcard_model');

      expect(result.passed).toBe(true);
      expect(result.warnings).toContain('Model uses bond wildcards - validated separately');
      expect(result.metrics.speciesCount).toBe(0);
    });

    it('should warn for compartments', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('begin compartments\nend compartments');

      const result = await validator.validateModel('compartment_model');

      expect(result.passed).toBe(true);
      expect(result.warnings).toContain('Model uses compartments');
    });

    it('should warn for energy patterns', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('begin energy patterns\nend energy patterns');

      const result = await validator.validateModel('energy_model');

      expect(result.passed).toBe(true);
      expect(result.warnings).toContain('Model uses energy patterns');
    });

    it('should handle fs errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('File read error'); });

      const result = await validator.validateModel('error_model');

      expect(result.passed).toBe(false);
      expect(result.errors).toContain('File read error');
    });
  });

  describe('validateAll', () => {
    it('should validate all test models and aggregate results', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('normal content');

      // Make one model fail to test aggregation
      vi.mocked(fs.existsSync).mockImplementation((p) => !p.toString().includes('LV'));

      const suite = await validator.validateAll();

      expect(suite.totalModels).toBe(8); // 'egfr_simple', 'AB', 'ABC', 'BAB', 'LR', 'LV', 'Blinov_2006', 'FceRI_ji'
      expect(suite.passedModels).toBe(7);
      expect(suite.failedModels).toBe(1);
      expect(suite.results).toHaveLength(8);
    });
  });

  describe('compareTrajectory', () => {
    it('should handle empty computed data', () => {
      const computed = { data: [] } as any;
      const result = validator.compareTrajectory(computed, [[0, 1]]);

      expect(result.passed).toBe(false);
      expect(result.maxError).toBe(Infinity);
    });

    it('should pass for identical trajectories', () => {
      const computed = { data: [{ time: 0, obs1: 1, obs2: 2 }] } as any;
      const reference = [[0, 1, 2]];

      const result = validator.compareTrajectory(computed, reference);

      expect(result.passed).toBe(true);
      expect(result.maxError).toBe(0);
    });

    it('should calculate absolute error correctly for near-zero reference values', () => {
      const computed = { data: [{ time: 0, obs1: 0.002 }] } as any; // abs diff = 0.002
      const reference = [[0, 0]];

      const result = validator.compareTrajectory(computed, reference, 0.001);

      expect(result.passed).toBe(false);
      expect(result.maxError).toBe(0.002);
      expect(result.errorPoints).toEqual([0]);
    });

    it('should calculate relative error correctly for non-zero reference values', () => {
      const computed = { data: [{ time: 0, obs1: 11 }] } as any;
      const reference = [[0, 10]]; // rel error = |11-10|/10 = 0.1

      const result = validator.compareTrajectory(computed, reference, 0.05);

      expect(result.passed).toBe(false);
      expect(result.maxError).toBe(0.1);
      expect(result.errorPoints).toEqual([0]);
    });

    it('should pass if errors are within tolerance', () => {
      const computed = { data: [{ time: 0, obs1: 10.0005 }] } as any;
      const reference = [[0, 10]]; // rel error = 0.00005

      const result = validator.compareTrajectory(computed, reference, 0.001);

      expect(result.passed).toBe(true);
      expect(result.maxError).toBeLessThan(0.001);
    });
  });

  describe('runValidation', () => {
    it('should execute without crashing and print results', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('A(b!+) begin compartments');

      await runValidation();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('BNG2 Parity Validation Suite'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Total models: 8'));

      consoleLogSpy.mockRestore();
    });
  });
});
