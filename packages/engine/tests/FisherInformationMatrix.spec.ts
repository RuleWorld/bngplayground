import { describe, it, expect } from 'vitest';
import { computeFIM, computeCollinearity } from '../src/services/analysis/FisherInformationMatrix';

describe('computeFIM', () => {
  it('2-parameter exponential decay: FIM is positive definite', async () => {
    // y = A*exp(-k*t), A=100, k=0.1
    const times = Array.from({ length: 11 }, (_, i) => i);
    const trueA = 100;
    const trueK = 0.1;

    const result = await computeFIM({
      simulate: async (overrides) => {
        const A = overrides['A'];
        const k = overrides['k'];
        return {
          data: times.map((t) => ({ time: t, Y: A * Math.exp(-k * t) })),
        };
      },
      parameters: { A: trueA, k: trueK },
      parameterNames: ['A', 'k'],
      allTimepoints: true,
    });

    expect(result.fimMatrix.length).toBe(2);
    expect(result.eigenvalues.length).toBe(2);
    // Both eigenvalues should be positive
    result.eigenvalues.forEach((e) => expect(e).toBeGreaterThan(0));
    // Both parameters should be identifiable
    expect(result.identifiableParams).toContain('A');
    expect(result.identifiableParams).toContain('k');
    expect(result.unidentifiableParams).toHaveLength(0);
  });

  it('redundant parameter model: one param is unidentifiable', async () => {
    // y = a*b*x (a and b are not independently identifiable)
    const result = await computeFIM({
      simulate: async (overrides) => {
        const a = overrides['a'];
        const b = overrides['b'];
        return {
          data: [0, 1, 2, 3, 4].map((x) => ({ time: x, Y: a * b * x })),
        };
      },
      parameters: { a: 2, b: 3 },
      parameterNames: ['a', 'b'],
      allTimepoints: true,
    });

    // The FIM should be nearly singular (one small eigenvalue)
    const minEig = Math.min(...result.eigenvalues.map(Math.abs));
    const maxEig = Math.max(...result.eigenvalues.map(Math.abs));
    expect(maxEig / (minEig + 1e-30)).toBeGreaterThan(1e3); // Very high condition number
  });

  it('VIF is computed correctly', async () => {
    const result = await computeFIM({
      simulate: async (overrides) => {
        const a = overrides['a'];
        const b = overrides['b'];
        return {
          data: [0, 1, 2, 3, 4].map((x) => ({ time: x, Y: a * x + b })),
        };
      },
      parameters: { a: 2, b: 1 },
      parameterNames: ['a', 'b'],
      allTimepoints: true,
    });

    expect(result.vif.length).toBe(2);
    result.vif.forEach((v) => expect(v).toBeGreaterThan(0));
  });

  it('sensitivity profiles have correct shape', async () => {
    const nT = 5;
    const result = await computeFIM({
      simulate: async (overrides) => {
        const a = overrides['a'];
        return {
          data: Array.from({ length: nT }, (_, i) => ({ time: i, Y: a * i })),
        };
      },
      parameters: { a: 3 },
      parameterNames: ['a'],
      allTimepoints: true,
    });

    expect(result.sensitivityProfiles.length).toBe(1);
    expect(result.sensitivityProfiles[0].timeProfile.length).toBe(nT);
  });

  it('rejects an empty baseline trajectory with an analysis error', async () => {
    await expect(computeFIM({
      simulate: async () => ({ data: [] }),
      parameters: { k: 1 },
      parameterNames: ['k'],
    })).rejects.toThrow(/FIM baseline simulation returned no trajectory data/);
  });

  it('rejects a trajectory without observable columns', async () => {
    await expect(computeFIM({
      simulate: async () => ({ data: [{ time: 0 }, { time: 1 }] }),
      parameters: { k: 1 },
      parameterNames: ['k'],
    })).rejects.toThrow(/FIM baseline simulation returned no observable columns/);
  });

  it('reports a singular zero-sensitivity system without producing NaN', async () => {
    const result = await computeFIM({
      simulate: async () => ({
        data: [{ time: 0, Y: 1 }, { time: 1, Y: 1 }],
      }),
      parameters: { k: 1 },
      parameterNames: ['k'],
    });

    expect(result.conditionNumber).toBe(Infinity);
    expect(result.regularizedConditionNumber).toBe(Infinity);
    expect(Number.isNaN(result.regularizedConditionNumber)).toBe(false);
  });
});

describe('computeCollinearity', () => {
  it('orthogonal columns: low collinearity', () => {
    // J = [I] → each column is orthogonal
    const J = [
      [1, 0],
      [0, 1],
      [0, 0],
    ];
    const result = computeCollinearity(J, ['a', 'b'], 2);
    expect(result.subsets.length).toBe(1);
    expect(result.subsets[0].collinearityIndex).toBeCloseTo(1, 0);
    expect(result.subsets[0].isCollinear).toBe(false);
  });

  it('parallel columns: high collinearity', () => {
    // J columns are multiples → highly collinear
    const J = [
      [1, 2],
      [2, 4],
      [3, 6],
    ];
    const result = computeCollinearity(J, ['a', 'b'], 2);
    expect(result.subsets[0].collinearityIndex).toBeGreaterThan(10);
    expect(result.subsets[0].isCollinear).toBe(true);
  });

  it('rejects an empty Jacobian explicitly', () => {
    expect(() => computeCollinearity([], ['a', 'b'], 2)).toThrow(/non-empty sensitivity Jacobian/);
  });

  it('preserves infinite collinearity in the aggregate metric', () => {
    const result = computeCollinearity([
      [0, 0],
      [0, 0],
    ], ['a', 'b'], 2);

    expect(result.subsets[0].collinearityIndex).toBe(Infinity);
    expect(result.maxCollinearity).toBe(Infinity);
  });
});
