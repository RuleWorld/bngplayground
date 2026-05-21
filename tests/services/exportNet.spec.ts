import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToNet } from '../../services/exportNet';
import { NetworkExporter } from '@bngplayground/engine';
import type { BNGLModel } from '../../types';

vi.mock('@bngplayground/engine', async () => {
  const actual = await vi.importActual<typeof import('@bngplayground/engine')>('@bngplayground/engine');
  return {
    ...actual,
    NetworkExporter: {
      export: vi.fn().mockReturnValue('mocked net output'),
    },
  };
});

describe('exportToNet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call NetworkExporter.export with correctly parsed species and reactions', async () => {
    const mockModel: BNGLModel = {
      name: 'TestModel',
      parameters: { k1: 1.5, k2: 2.0 },
      species: [
        { name: 'A()', initialConcentration: 10, isConstant: false },
        { name: 'B()', initialConcentration: 0, isConstant: true },
      ],
      reactions: [
        {
          name: 'Rxn1',
          reactants: ['A()'],
          products: ['B()'],
          rateConstant: 1.5,
          rateExpression: 'k1',
          degeneracy: 1,
          propensityFactor: 1,
          statFactor: 1,
        },
      ],
    } as unknown as BNGLModel;

    const result = await exportToNet(mockModel);

    expect(result).toBe('mocked net output');
    expect(NetworkExporter.export).toHaveBeenCalled();
    const calls = vi.mocked(NetworkExporter.export).mock.calls;
    expect(calls.length).toBe(1);

    const [modelArg, speciesArg, reactionsArg] = calls[0];
    expect(modelArg).toBe(mockModel);
    expect(speciesArg).toHaveLength(2);
    expect(speciesArg[0].initialConcentration).toBe(10);
    expect((speciesArg[1] as unknown as { isConstant: boolean }).isConstant).toBe(true);

    expect(reactionsArg).toHaveLength(1);
    expect(reactionsArg[0].rate).toBe(1.5);
    expect(reactionsArg[0].reactants).toEqual([0]); // A() maps to index 0
    expect(reactionsArg[0].products).toEqual([1]); // B() maps to index 1
  });

  it('should handle empty species and reactions gracefully', async () => {
    const mockModel: BNGLModel = {
      name: 'EmptyModel',
      parameters: {},
    } as unknown as BNGLModel;

    const result = await exportToNet(mockModel);
    expect(result).toBe('mocked net output');

    const calls = vi.mocked(NetworkExporter.export).mock.calls;
    const [, speciesArg, reactionsArg] = calls[0];
    expect(speciesArg).toHaveLength(0);
    expect(reactionsArg).toHaveLength(0);
  });

  it('should throw an error when a reaction reactant or product cannot be mapped to an index', async () => {
    const mockModel: BNGLModel = {
      name: 'ErrorModel',
      parameters: {},
      species: [
        { name: 'A()', initialConcentration: 10 }
      ],
      reactions: [
        {
          reactants: ['C()'], // C() is not in species
          products: ['A()'],
          rateConstant: 1.0,
        }
      ]
    } as unknown as BNGLModel;

    await expect(exportToNet(mockModel)).rejects.toThrow('Unable to map generated species "C()" to index');
  });

  it('should resolve species by canonical name if direct match fails', async () => {
    const mockModel: BNGLModel = {
      name: 'CanonicalModel',
      parameters: {},
      species: [
        { name: 'A(b!1).B(a!1)', initialConcentration: 10 }
      ],
      reactions: [
        {
          // Same graph, different string representation
          reactants: ['B(a!1).A(b!1)'],
          products: [],
          rateConstant: 1.0,
        }
      ]
    } as unknown as BNGLModel;

    await exportToNet(mockModel);
    const calls = vi.mocked(NetworkExporter.export).mock.calls;
    const [, , reactionsArg] = calls[0];
    // Should map to index 0 despite string difference because canonical forms match
    expect(reactionsArg[0].reactants).toEqual([0]);
  });

  it('should infer statFactor from evaluated expression and rateConstant when statFactor is not provided', async () => {
    const mockModel: BNGLModel = {
      name: 'StatFactorModel',
      parameters: { k_base: 2.0 },
      species: [
        { name: 'A()', initialConcentration: 10 }
      ],
      reactions: [
        {
          reactants: ['A()'],
          products: [],
          rateConstant: 6.0, // Effective rate
          rate: 'k_base', // Symbolic rate expression
          // statFactor is undefined, but numericRate (6.0) / exprValue (k_base=2.0) = 3.0
        }
      ]
    } as unknown as BNGLModel;

    await exportToNet(mockModel);
    const calls = vi.mocked(NetworkExporter.export).mock.calls;
    const [, , reactionsArg] = calls[0];

    // Inferred statFactor should be 3
    expect(reactionsArg[0].statFactor).toBe(3);
    expect(reactionsArg[0].rate).toBe(6.0);
  });

  it('should use provided evalParamMap for statFactor inference', async () => {
    const mockModel: BNGLModel = {
      name: 'EvalMapModel',
      parameters: { k_base: 2.0 }, // Model param is 2.0
      species: [],
      reactions: [
        {
          reactants: [],
          products: [],
          rateConstant: 10.0,
          rate: 'k_base',
        }
      ]
    } as unknown as BNGLModel;

    // Provide a custom map where k_base is 5.0
    const customMap = new Map([['k_base', 5.0]]);

    await exportToNet(mockModel, customMap);
    const calls = vi.mocked(NetworkExporter.export).mock.calls;
    const [, , reactionsArg] = calls[0];

    // Inferred statFactor = rateConstant(10.0) / exprValue(5.0) = 2.0
    expect(reactionsArg[0].statFactor).toBe(2);
  });

  it('should handle reactions without reactants or products safely', async () => {
    const mockModel: BNGLModel = {
      name: 'NoReactantsModel',
      parameters: {},
      species: [],
      reactions: [
        {
          reactants: null,
          products: undefined,
          rateConstant: 1.0,
        }
      ]
    } as unknown as BNGLModel;

    await exportToNet(mockModel);
    const calls = vi.mocked(NetworkExporter.export).mock.calls;
    const [, , reactionsArg] = calls[0];

    expect(reactionsArg[0].reactants).toEqual([]);
    expect(reactionsArg[0].products).toEqual([]);
  });
});
