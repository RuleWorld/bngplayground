import { describe, it, expect } from 'vitest';

describe('EigenSolver', () => {
  it('computes eigenvalues of 2x2 matrix', async () => {
    const { qrEigenvalues } = await import('../../src/services/analysis/EigenSolver');
    // Matrix [[2, 1], [1, 2]] has eigenvalues 3 and 1
    const matrix = new Float64Array([2, 1, 1, 2]);
    const eigs = qrEigenvalues(matrix, 2);
    expect(eigs.length).toBe(2);
    const reals = eigs.map(e => e.real).sort((a, b) => b - a);
    expect(reals[0]).toBeCloseTo(3, 4);
    expect(reals[1]).toBeCloseTo(1, 4);
    eigs.forEach(e => expect(e.imag).toBeCloseTo(0, 6));
  });

  it('detects complex eigenvalues', async () => {
    const { qrEigenvalues } = await import('../../src/services/analysis/EigenSolver');
    // Rotation matrix [[0, -1], [1, 0]] has eigenvalues ±i
    const matrix = new Float64Array([0, -1, 1, 0]);
    const eigs = qrEigenvalues(matrix, 2);
    expect(eigs.length).toBe(2);
    eigs.forEach(e => expect(e.real).toBeCloseTo(0, 4));
    const imags = eigs.map(e => Math.abs(e.imag)).sort();
    expect(imags[0]).toBeCloseTo(1, 4);
    expect(imags[1]).toBeCloseTo(1, 4);
  });

  it('handles 3x3 symmetric matrix', async () => {
    const { qrEigenvalues } = await import('../../src/services/analysis/EigenSolver');
    // [[3, 1, 0], [1, 3, 1], [0, 1, 3]] eigenvalues: 3-sqrt(2), 3, 3+sqrt(2)
    const matrix = new Float64Array([3, 1, 0, 1, 3, 1, 0, 1, 3]);
    const eigs = qrEigenvalues(matrix, 3);
    expect(eigs.length).toBe(3);
    const reals = eigs.map(e => e.real).sort((a, b) => a - b);
    expect(reals[0]).toBeCloseTo(3 - Math.SQRT2, 3);
    expect(reals[1]).toBeCloseTo(3, 3);
    expect(reals[2]).toBeCloseTo(3 + Math.SQRT2, 3);
  });
});

describe('SteadyStateFinder', () => {
  it('finds steady state of linear decay', async () => {
    const { findSteadyState } = await import('../../src/services/analysis/SteadyStateFinder');
    // dy/dt = -k*y, steady state: y = 0
    const result = findSteadyState({
      nSpecies: 1,
      parameters: { k: 1 },
      rhsFn: (y: Float64Array, dydt: Float64Array) => { dydt[0] = -1.0 * y[0]; },
      tolerance: 1e-10,
      maxIterations: 100,
    }, new Float64Array([5.0]));

    expect(result).not.toBeNull();
    if (result) {
      expect(result.y[0]).toBeCloseTo(0, 6);
      expect(result.stable).toBe(true);
    }
  });

  it('finds steady state of production-decay', async () => {
    const { findSteadyState } = await import('../../src/services/analysis/SteadyStateFinder');
    // dy/dt = k_prod - k_deg * y, steady state: y = k_prod / k_deg = 5
    const result = findSteadyState({
      nSpecies: 1,
      parameters: {},
      rhsFn: (y: Float64Array, dydt: Float64Array) => { dydt[0] = 10 - 2 * y[0]; },
      tolerance: 1e-10,
    }, new Float64Array([1.0]));

    expect(result).not.toBeNull();
    if (result) {
      expect(result.y[0]).toBeCloseTo(5, 4);
      expect(result.stable).toBe(true);
    }
  });
});

describe('Continuation', () => {
  it('follows steady-state branch of saddle-node', async () => {
    const { continuation } = await import('../../src/services/analysis/Continuation');
    // dx/dt = r + x^2 (saddle-node normal form, bifurcation at r=0)
    const result = await continuation({
      nSpecies: 1,
      rhsFn: (y: Float64Array, p: number, dydt: Float64Array) => {
        dydt[0] = p + y[0] * y[0];
      },
      initialState: new Float64Array([1.0]),
      parameterStart: -1,
      parameterEnd: 0.5,
      stepSize: 0.05,
      maxSteps: 50,
    });

    expect(result.path.length).toBeGreaterThan(0);
    expect(result.bifurcations).toBeDefined();
  });
});

describe('Nullclines', () => {
  it('computes Lotka-Volterra nullclines', async () => {
    const { computeNullclines } = await import('../../src/services/analysis/Nullclines');
    // dx/dt = ax - bxy (nullcline: x=0 or y=a/b)
    // dy/dt = -cy + dxy (nullcline: y=0 or x=c/d)
    const a = 1, b = 0.1, c = 1.5, d = 0.075;
    const result = computeNullclines({
      rhsFn: (state: Float64Array) => {
        const out = new Float64Array(2);
        out[0] = a * state[0] - b * state[0] * state[1];
        out[1] = -c * state[1] + d * state[0] * state[1];
        return out;
      },
      xRange: [0, 40],
      yRange: [0, 20],
      nGridX: 50,
      nGridY: 50,
    });

    expect(result.xNullclines.length).toBeGreaterThan(0);
    expect(result.yNullclines.length).toBeGreaterThan(0);
    expect(result.fixedPoints.length).toBeGreaterThanOrEqual(1);
    // The coexistence fixed point should be at x=c/d=20, y=a/b=10
    const coexistence = result.fixedPoints.find(fp => fp.x > 5 && fp.y > 5);
    if (coexistence) {
      expect(coexistence.x).toBeCloseTo(c / d, 0);
      expect(coexistence.y).toBeCloseTo(a / b, 0);
    }
  });
});
