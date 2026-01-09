// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import type { BNGLModel, SimulationOptions } from '../types';
import * as fimModule from '../services/fim';

// Mock bnglService
vi.mock('../services/bnglService', async () => {
  return {
    bnglService: {
      prepareModel: vi.fn(async (_model: BNGLModel) => {
        return 1;
      }),
      simulateCached: vi.fn(async (_modelId: number, parameterOverrides: Record<string, number> | undefined, options: SimulationOptions) => {
        // Simple analytic model: observable "obs" = (a + b) * time
        const params = { ...(parameterOverrides ?? {}) } as Record<string, number>;
        // default parameters if not overridden
        const a = params['a'] ?? (globalThis as any).TEST_MODEL.parameters['a'];
        const b = params['b'] ?? (globalThis as any).TEST_MODEL.parameters['b'];
        const n = options.n_steps ?? 5;
        const t_end = options.t_end ?? 10;
        const data: Record<string, number>[] = [];
        for (let i = 0; i <= n; i++) {
          const t = (t_end * i) / n;
          data.push({ time: t, obs: (a + b) * t });
        }
        return { headers: ['time', 'obs'], data };
      }),
      releaseModel: vi.fn(async () => {}),
    },
  };
});

describe('FIM identifiability', () => {
  it('detects nullspace for additive parameters (a + b)', async () => {
    // prepare a fake model with parameters a and b
    const model: BNGLModel = {
      parameters: { a: 2, b: 3 },
      moleculeTypes: [],
      species: [],
      observables: [],
      reactions: [],
      reactionRules: [],
    } as any;

    // expose model to mock simulateCached
    (globalThis as any).TEST_MODEL = model;

    const parameterNames = ['a', 'b'];
    const simOptions: SimulationOptions = { method: 'ode', t_end: 10, n_steps: 10 };

    const res = await fimModule.computeFIM(model, parameterNames, simOptions, undefined, undefined, true, true, true);

    // There should be a nullspace combination (a-b) or similar
    expect(res.nullspaceCombinations).toBeDefined();
    expect(res.nullspaceCombinations!.length).toBeGreaterThan(0);

    // Since only (a+b) is observable, a and b are not individually identifiable.
    expect(res.unidentifiableParams).toEqual(expect.arrayContaining(['a', 'b']));
    const comb = res.nullspaceCombinations![0];
    // components should include a and b
    const names = comb.components.map((c) => c.name);
    expect(names).toContain('a');
    expect(names).toContain('b');
    // loadings should have opposite sign
    const loadings = Object.fromEntries(comb.components.map((c) => [c.name, c.loading]));
    expect(loadings['a'] * loadings['b']).toBeLessThan(0);
  });

  it('reports strong correlation between a and b', async () => {
    const model: BNGLModel = {
      parameters: { a: 2, b: 3 },
      moleculeTypes: [],
      species: [],
      observables: [],
      reactions: [],
      reactionRules: [],
    } as any;
    (globalThis as any).TEST_MODEL = model;
    const res = await fimModule.computeFIM(model, ['a', 'b'], { method: 'ode', t_end: 10, n_steps: 10 }, undefined, undefined, true, true, true);
    expect(res.topCorrelatedPairs).toBeDefined();
    // top pair should be a-b with correlation near 1 or -1
    const top = res.topCorrelatedPairs![0];
    expect(top.names).toEqual(expect.arrayContaining(['a', 'b']));
    expect(Math.abs(top.corr)).toBeGreaterThan(0.9);
  });

  it('detects unused parameter (degenerate) as nullspace component', async () => {
    const model: BNGLModel = {
      parameters: { a: 1, b: 2, c: 3 },
      moleculeTypes: [],
      species: [],
      observables: [],
      reactions: [],
      reactionRules: [],
    } as any;
    // Adjust mock: observable ignores 'c'
    (globalThis as any).TEST_MODEL = model;
    const res = await fimModule.computeFIM(model, ['a', 'b', 'c'], { method: 'ode', t_end: 10, n_steps: 10 }, undefined, undefined, true, true, true);
    expect(res.nullspaceCombinations).toBeDefined();
    // at least one nullspace combination should include 'c' (unused parameter)
    const includesC = (res.nullspaceCombinations ?? []).some(comb => comb.components.some(cmp => cmp.name === 'c'));
    expect(includesC).toBeTruthy();
  });

  it('computes profile CIs correctly', async () => {
    const model: BNGLModel = {
      parameters: { a: 1, b: 2, c: 3 },
      moleculeTypes: [],
      species: [],
      observables: [],
      reactions: [],
      reactionRules: [],
    } as any;
    (globalThis as any).TEST_MODEL = model;
    const result = await fimModule.computeFIM(model, ['a', 'b', 'c'], { method: 'ode', t_end: 10, n_steps: 10 }, undefined, undefined, true, true, true);
    expect(result.profileApproxExtended?.c).toBeDefined();
    expect(result.profileApproxExtended?.c.ci).toBeDefined();
  });

  it('exports FIM in standard format', () => {
    const mockResult: fimModule.FIMResult = {
      eigenvalues: [1, 2, 3],
      eigenvectors: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      paramNames: ['p1', 'p2', 'p3'],
      conditionNumber: 3,
      regularizedConditionNumber: 3,
      covarianceMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      correlations: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      fimMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      jacobian: [[1, 0], [0, 1]],
    } as fimModule.FIMResult;
    const exported = fimModule.exportFIM(mockResult);
    expect(exported.format).toBe('FIM-v1');
    expect(exported.eigenvalues).toHaveLength(3);
  });
});

