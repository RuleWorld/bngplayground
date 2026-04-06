import { describe, it, expect } from 'vitest';
import { CVODESolver } from '../src/services/simulation/solvers/CVODESolver';

describe('CVODESolver.computeScaledAtol', () => {
  const BASE_ATOL = 1e-8;

  it('returns base atol for empty state vector', () => {
    const y0 = new Float64Array([]);
    expect(CVODESolver.computeScaledAtol(y0, BASE_ATOL)).toBe(BASE_ATOL);
  });

  it('returns base atol when all species are zero', () => {
    const y0 = new Float64Array([0, 0, 0]);
    expect(CVODESolver.computeScaledAtol(y0, BASE_ATOL)).toBe(BASE_ATOL);
  });

  it('returns base atol when concentrations are within 3 orders of magnitude', () => {
    // Range: 0.1 to 10 = 2 orders of magnitude
    const y0 = new Float64Array([0.1, 1.0, 10.0]);
    expect(CVODESolver.computeScaledAtol(y0, BASE_ATOL)).toBe(BASE_ATOL);
  });

  it('returns base atol when range is exactly 1000x (boundary)', () => {
    // Range: 1 to 1000 = exactly 3 orders of magnitude (1e3), should NOT trigger
    const y0 = new Float64Array([1.0, 1000.0]);
    expect(CVODESolver.computeScaledAtol(y0, BASE_ATOL)).toBe(BASE_ATOL);
  });

  it('scales atol when concentrations span > 3 orders of magnitude', () => {
    // Range: 1e-3 to 1e6 = 9 orders of magnitude
    const y0 = new Float64Array([1e-3, 1.0, 1e6]);
    const scaled = CVODESolver.computeScaledAtol(y0, BASE_ATOL);
    expect(scaled).not.toBe(BASE_ATOL);
    // Should be clamped within [1e-12, 1e-6]
    expect(scaled).toBeGreaterThanOrEqual(1e-12);
    expect(scaled).toBeLessThanOrEqual(1e-6);
  });

  it('clamps scaled atol to minimum of 1e-12', () => {
    // Very small concentrations: geometric mean near 1e-10
    // baseAtol * geoMean = 1e-8 * 1e-10 = 1e-18, should clamp to 1e-12
    const y0 = new Float64Array([1e-15, 1e-5]);
    const scaled = CVODESolver.computeScaledAtol(y0, BASE_ATOL);
    expect(scaled).toBeGreaterThanOrEqual(1e-12);
  });

  it('clamps scaled atol to maximum of 1e-6', () => {
    // Very large concentrations: geometric mean near 1e5
    // baseAtol * geoMean = 1e-8 * 1e5 = 1e-3, should clamp to 1e-6
    const y0 = new Float64Array([1e-2, 1e12]);
    const scaled = CVODESolver.computeScaledAtol(y0, BASE_ATOL);
    expect(scaled).toBeLessThanOrEqual(1e-6);
  });

  it('ignores zero-valued species in geometric mean calculation', () => {
    // Only nonzero species contribute; zeros are excluded
    const withZeros = new Float64Array([0, 1.0, 0, 1.0, 0]);
    const withoutZeros = new Float64Array([1.0, 1.0]);
    expect(CVODESolver.computeScaledAtol(withZeros, BASE_ATOL))
      .toBe(CVODESolver.computeScaledAtol(withoutZeros, BASE_ATOL));
  });

  it('handles negative concentrations (uses absolute values)', () => {
    // Negative values can appear transiently; should use |y0_i|
    const y0 = new Float64Array([-1e-3, 1e6]);
    const y0Positive = new Float64Array([1e-3, 1e6]);
    expect(CVODESolver.computeScaledAtol(y0, BASE_ATOL))
      .toBe(CVODESolver.computeScaledAtol(y0Positive, BASE_ATOL));
  });

  it('is backward-compatible: uniform concentrations yield base atol', () => {
    // All species at the same concentration
    const y0 = new Float64Array([100, 100, 100, 100, 100]);
    expect(CVODESolver.computeScaledAtol(y0, BASE_ATOL)).toBe(BASE_ATOL);
  });

  it('produces a reasonable value for a typical multi-scale model', () => {
    // Typical model: receptor at 1e3, ligand at 1e-1, complex at 1e-6, enzyme at 1e2
    const y0 = new Float64Array([1e3, 0.1, 1e-6, 1e2]);
    const scaled = CVODESolver.computeScaledAtol(y0, BASE_ATOL);
    // Range is 1e3 / 1e-6 = 1e9, so scaling activates
    expect(scaled).not.toBe(BASE_ATOL);
    expect(scaled).toBeGreaterThanOrEqual(1e-12);
    expect(scaled).toBeLessThanOrEqual(1e-6);
    // Geometric mean of [1e3, 0.1, 1e-6, 1e2] ~ exp(mean(ln)) ~ exp((6.9 - 2.3 - 13.8 + 4.6)/4) ~ exp(-1.15) ~ 0.32
    // scaledAtol ~ 1e-8 * 0.32 ~ 3.2e-9, clamped to [1e-12, 1e-6] -> 3.2e-9
    expect(scaled).toBeCloseTo(3.16e-9, 10); // roughly
  });
});
