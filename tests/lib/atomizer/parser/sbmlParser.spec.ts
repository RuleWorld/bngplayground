import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractGOTerms,
  getAnnotationsByQualifier,
  getLibSBMLInstance,
  SBML2JSON,
  setLibSBMLInstanceForTest,
} from '../../../../src/lib/atomizer/parser/sbmlParser';
import { BiologicalQualifier, ModelQualifier, type AnnotationInfo } from '../../../../src/lib/atomizer/config/types';
import * as helpers from '../../../../src/lib/atomizer/utils/helpers';

describe('sbmlParser', () => {
  describe('extractGOTerms', () => {
    it('returns an empty array when given an empty resources list', () => {
      expect(extractGOTerms([])).toEqual([]);
    });

    it('extracts a single GO term separated by colon', () => {
      expect(extractGOTerms(['http://identifiers.org/go/GO:0005886'])).toEqual(['GO:0005886']);
    });

    it('extracts a single GO term separated by slash', () => {
      expect(extractGOTerms(['http://identifiers.org/go/GO/0005886'])).toEqual(['GO:0005886']);
    });

    it('extracts a GO term in lowercase', () => {
      expect(extractGOTerms(['http://identifiers.org/go/go:0005886'])).toEqual(['GO:0005886']);
    });

    it('extracts multiple GO terms from different resources', () => {
      const resources = [
        'http://identifiers.org/go/GO:0005886',
        'http://identifiers.org/go/GO:0005623'
      ];
      expect(extractGOTerms(resources)).toEqual(['GO:0005886', 'GO:0005623']);
    });

    it('ignores resources that do not contain a GO term', () => {
      const resources = [
        'http://identifiers.org/go/GO:0005886',
        'http://identifiers.org/uniprot/P12345',
        'http://identifiers.org/go/GO:0005623'
      ];
      expect(extractGOTerms(resources)).toEqual(['GO:0005886', 'GO:0005623']);
    });

    it('ignores invalid GO term formats', () => {
      const resources = [
        'http://identifiers.org/go/GO-0005886', // Invalid separator
        'http://identifiers.org/go/GO:abc',    // Invalid numbers
        'http://identifiers.org/go/G:0005886'  // Missing 'O'
      ];
      expect(extractGOTerms(resources)).toEqual([]);
    });
  });
});

// Mock libsbmljs globally
const mockLibsbml = {
  formulaToString: vi.fn(),
};

vi.mock('../../../../src/lib/atomizer/utils/helpers', () => ({
  standardizeName: vi.fn((name) => name),
  logger: { info: vi.fn(), warning: vi.fn(), error: vi.fn() },
  factorial: vi.fn((n) => {
    let f = 1;
    for (let i = 2; i <= n; i++) f *= i;
    return f;
  }),
  comb: vi.fn((n, k) => {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    let c = 1;
    for (let i = 1; i <= k; i++) {
      c = c * (n - i + 1) / i;
    }
    return c;
  }),
}));


describe('SBML2JSON', () => {
  let mockModel: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    setLibSBMLInstanceForTest(mockLibsbml);

    mockModel = {
      getNumUnitDefinitions: vi.fn().mockReturnValue(0),
      getUnitDefinition: vi.fn(),
      getNumParameters: vi.fn().mockReturnValue(0),
      getParameter: vi.fn(),
      getNumCompartments: vi.fn().mockReturnValue(0),
      getCompartment: vi.fn(),
      getNumSpecies: vi.fn().mockReturnValue(0),
      getSpecies: vi.fn(),
      getNumReactions: vi.fn().mockReturnValue(0),
      getReaction: vi.fn(),
    };
  });

  describe('getUnits', () => {
    it('should extract unit definitions correctly', () => {
      mockModel.getNumUnitDefinitions.mockReturnValue(1);

      const mockUnit1 = { getKind: () => 1, getScale: () => 2, getExponent: () => 3 };
      const mockUnitDef = {
        getId: () => 'my_unit',
        getNumUnits: () => 1,
        getUnit: () => mockUnit1
      };
      mockModel.getUnitDefinition.mockReturnValue(mockUnitDef);

      const parser = new SBML2JSON(mockModel);
      expect(parser['unitDictionary'].get('my_unit')).toEqual([[1, 2, 3]]);
    });
  });

  describe('getParameters', () => {
    it('should extract parameters and apply standard defaults', () => {
      mockModel.getNumParameters.mockReturnValue(1);
      const mockParam = {
        getId: () => 'k1',
        getValue: () => 1.5,
        getUnits: () => 'um',
      };
      mockModel.getParameter.mockReturnValue(mockParam);

      const parser = new SBML2JSON(mockModel);
      const params = parser.getParameters();

      expect(params.get(1)).toEqual({ name: 'k1', value: 1.5, unit: 'um', type: '' });
      expect(params.get(2)).toEqual({ name: 'rxn_layer_t', value: '0.01', unit: 'um', type: '' });
      expect(params.get(3)).toEqual({ name: 'h', value: 'rxn_layer_t', unit: 'um', type: '' });
      expect(params.get(4)).toEqual({ name: 'Rs', value: '0.002564', unit: 'um', type: '' });
      expect(params.get(5)).toEqual({ name: 'Rc', value: '0.0015', unit: 'um', type: '' });
    });

    it('should apply unit conversions based on unitDictionary', () => {
      mockModel.getNumUnitDefinitions.mockReturnValue(1);
      const mockUnit = { getKind: () => 1, getScale: () => 2, getExponent: () => 3 }; // 10^(2*3) = 1e6
      const mockUnitDef = { getId: () => 'converted_unit', getNumUnits: () => 1, getUnit: () => mockUnit };
      mockModel.getUnitDefinition.mockReturnValue(mockUnitDef);

      mockModel.getNumParameters.mockReturnValue(1);
      const mockParam = { getId: () => 'k1', getValue: () => 1.5, getUnits: () => 'converted_unit' };
      mockModel.getParameter.mockReturnValue(mockParam);

      const parser = new SBML2JSON(mockModel);
      const params = parser.getParameters();

      expect(params.get(1)).toEqual({ name: 'k1', value: 1.5 * 1e6, unit: 'converted_unit*1e6', type: '' });
    });
  });

  describe('getOutsideInsideCompartment', () => {
    it('should return correct outside and inside compartments', () => {
      const parser = new SBML2JSON(mockModel);
      const compartmentList = new Map<string, [number, number, string]>([
        ['comp1', [3, 1, 'comp2']], // outside is comp2
        ['comp2', [3, 1, '']],
        ['comp3', [3, 1, 'comp1']],
      ]);

      const [outside, inside] = parser.getOutsideInsideCompartment(compartmentList, 'comp1');
      expect(outside).toBe('comp2');
      expect(inside).toBe('comp3'); // comp3 has comp1 as outside
    });

    it('should return empty inside if no compartment has it as outside', () => {
      const parser = new SBML2JSON(mockModel);
      const compartmentList = new Map<string, [number, number, string]>([
        ['comp1', [3, 1, 'comp2']],
        ['comp2', [3, 1, '']],
      ]);

      const [outside, inside] = parser.getOutsideInsideCompartment(compartmentList, 'comp1');
      expect(outside).toBe('comp2');
      expect(inside).toBe('');
    });
  });

  describe('getMolecules', () => {
    it('should extract molecules and release sites (3D compartment)', () => {
       mockModel.getNumCompartments.mockReturnValue(1);
       mockModel.getCompartment.mockReturnValue({
         getId: () => 'comp1',
         getSize: () => 10,
         getOutside: () => '',
         getSpatialDimensions: () => 3
       });

       mockModel.getNumSpecies.mockReturnValue(1);
       const mockSpecies = {
         getId: () => 'S1',
         getName: () => 'Species 1',
         getCompartment: () => 'comp1',
         getInitialConcentration: () => 5.0,
         getInitialAmount: () => 0,
         getSubstanceUnits: () => 'mol'
       };
       mockModel.getSpecies.mockReturnValue(mockSpecies);

       const parser = new SBML2JSON(mockModel);
       const { molecules, release } = parser.getMolecules();

       expect(molecules.get(1)).toEqual({
         name: 'S1',
         type: '3D',
         extendedName: 'Species 1',
         dif: 'KB*T/(6*PI*mu_comp1*Rs)'
       });

       expect(release.get(1)).toEqual({
          name: 'Release_Site_s1',
          molecule: 'S1',
          shape: 'OBJECT',
          quantity_type: 'NUMBER_TO_RELEASE',
          quantity_expr: 5.0,
          object_expr: 'comp1'
       });
    });

    it('should extract molecules and release sites (2D compartment)', () => {
       mockModel.getNumCompartments.mockReturnValue(2);
       mockModel.getCompartment.mockImplementation((i) => {
         if(i===0) return { getId: () => 'comp1', getSize: () => 10, getOutside: () => '', getSpatialDimensions: () => 3 };
         if(i===1) return { getId: () => 'comp2', getSize: () => 5, getOutside: () => 'comp1', getSpatialDimensions: () => 2 };
       });

       mockModel.getNumSpecies.mockReturnValue(1);
       const mockSpecies = {
         getId: () => 'S1',
         getName: () => 'Species 1',
         getCompartment: () => 'comp2',
         getInitialConcentration: () => 5.0,
         getInitialAmount: () => 0,
         getSubstanceUnits: () => 'mol'
       };
       mockModel.getSpecies.mockReturnValue(mockSpecies);

       const parser = new SBML2JSON(mockModel);
       const { molecules, release } = parser.getMolecules();

       expect(molecules.get(1)).toEqual({
         name: 'S1',
         type: '2D',
         extendedName: 'Species 1',
         dif: 'KB*T*LOG((mu_comp2*h/(SQRT(4)*Rc*(mu_comp1+mu_)/2))-gamma)/(4*PI*mu_comp2*h)' // inside is empty
       });

       expect(release.get(1)).toEqual({
          name: 'Release_Site_s1',
          molecule: 'S1',
          shape: 'OBJECT',
          quantity_type: 'NUMBER_TO_RELEASE',
          quantity_expr: 5.0,
          object_expr: '[COMP2]' // inside is empty, outside is comp1
       });
    });
  });

  describe('getPrunnedTree', () => {
    it('should remove remainder patterns from AST', () => {
      const parser = new SBML2JSON(mockModel);
      const mockMath = {
        getCharacter: () => '*',
        getLeftChild: () => ({ getCharacter: () => 'A', deepCopy: vi.fn(), getNumChildren: () => 0 }),
        getRightChild: () => ({ getCharacter: () => 'B', deepCopy: vi.fn(), getNumChildren: () => 0 }),
        getNumChildren: () => 2,
        replaceChild: vi.fn()
      };

      mockLibsbml.formulaToString.mockImplementation((node) => node.getCharacter());

      // We don't have a full AST mock, so we test base behavior.
      // If left is 'A' and 'A' is in remainder, it returns right child.
      const result = parser.getPrunnedTree(mockMath, ['A']);
      expect(result.getCharacter()).toBe('B');
    });

    it('should replace child if not direct leaf match', () => {
      const parser = new SBML2JSON(mockModel);

      const leafA = { getCharacter: () => 'A', deepCopy: vi.fn(), getNumChildren: () => 0 };
      const leafB = { getCharacter: () => 'B', deepCopy: vi.fn(), getNumChildren: () => 0 };
      const leafC = { getCharacter: () => 'C', deepCopy: vi.fn(), getNumChildren: () => 0 };

      const leftNode = {
        getCharacter: () => '*',
        getLeftChild: () => leafA,
        getRightChild: () => leafC,
        getNumChildren: () => 2,
        replaceChild: vi.fn()
      };

      const rootMath = {
        getCharacter: () => '*',
        getLeftChild: () => leftNode,
        getRightChild: () => leafB,
        getNumChildren: () => 2,
        replaceChild: vi.fn()
      };

      mockLibsbml.formulaToString.mockImplementation((node) => node ? node.getCharacter() : '');

      parser.getPrunnedTree(rootMath, ['C']);
      expect(rootMath.replaceChild).toHaveBeenCalled();
    });
  });

  describe('removeFactorFromMath', () => {
    it('should build rate expression with correct high stoichiometry factor and division', () => {
       const parser = new SBML2JSON(mockModel);
       const math = {
         getCharacter: () => 'k1',
         getNumChildren: () => 0
       };
       mockLibsbml.formulaToString.mockReturnValue('k1');

       const reactants = [['A', 2]] as [string, number][];
       const products = [['B', 1]] as [string, number][];

       const [rateR, numChildren] = parser.removeFactorFromMath(math, reactants, products);

       expect(rateR).toContain('if(A > 0, (if(A > 0, (k1)/A, 0))/A, 0)*2');
       expect(numChildren).toBe(0);
    });
  });

  describe('getInstanceRate', () => {
    it('should generate rate expressions for reversible reactions', () => {
      const parser = new SBML2JSON(mockModel);

      const math = {
        getCharacter: () => '-',
        getNumChildren: () => 2,
        getLeftChild: () => ({ deepCopy: () => ({ getCharacter: () => 'k1', getNumChildren: () => 0 }) }),
        getRightChild: () => ({ deepCopy: () => ({ getCharacter: () => 'k2', getNumChildren: () => 0 }) }),
        deepCopy: () => math
      };

      mockLibsbml.formulaToString.mockImplementation((n: any) => n.getCharacter());

      const [rateL, rateR] = parser.getInstanceRate(math, [], true, [['A', 1]], [['B', 1]]);
      expect(rateL).toContain('if(A > 0, (k1)/A, 0)');
      expect(rateR).toContain('if(B > 0, (k2)/B, 0)');
    });

    it('should generate rate expressions for irreversible reactions', () => {
      const parser = new SBML2JSON(mockModel);

      const math = {
        getCharacter: () => 'k1',
        getNumChildren: () => 0,
        deepCopy: () => math
      };
      mockLibsbml.formulaToString.mockReturnValue('k1');

      const [rateL, rateR] = parser.getInstanceRate(math, [], false, [['A', 1]], [['B', 1]]);
      expect(rateL).toContain('if(A > 0, (k1)/A, 0)');
      expect(rateR).toBe('0');
    });
  });

  describe('adjustParameters', () => {
    it('should adjust parameter units based on stoichiometry', () => {
      const parser = new SBML2JSON(mockModel);
      const params = new Map([
        [1, { name: 'k1', unit: '' }],
        [2, { name: 'k2', unit: '' }],
        [3, { name: 'k3', unit: '' }]
      ]);

      parser.adjustParameters(2, 'k1 * A * B', params);
      parser.adjustParameters(0, 'k2', params);
      parser.adjustParameters(1, 'k3 * A', params);

      expect(params.get(1)?.unit).toBe('Bimolecular');
      expect(params.get(2)?.unit).toBe('0-order');
      expect(params.get(3)?.unit).toBe('Unimolecular');
    });
  });

  describe('getReactions', () => {
    it('should extract reaction specifications', () => {
      mockModel.getNumCompartments.mockReturnValue(0);
      mockModel.getNumReactions.mockReturnValue(1);

      const kineticLaw = {
        getMath: () => ({
          getCharacter: () => 'k1',
          getNumChildren: () => 0,
          deepCopy: function() { return this; }
        })
      };

      const mockReaction = {
        getNumReactants: () => 1,
        getReactant: () => ({ getSpecies: () => 'A', getStoichiometry: () => 1 }),
        getNumProducts: () => 1,
        getProduct: () => ({ getSpecies: () => 'B', getStoichiometry: () => 1 }),
        getKineticLaw: () => kineticLaw,
        getReversible: () => false
      };

      mockModel.getReaction.mockReturnValue(mockReaction);
      mockLibsbml.formulaToString.mockReturnValue('k1');

      const parser = new SBML2JSON(mockModel);
      const sparameters = new Map();
      const reactions = parser.getReactions(sparameters);

      expect(reactions.size).toBe(1);
      expect(reactions.get(1)).toEqual({
        reactants: "A'",
        products: "B'",
        fwd_rate: 'if(A > 0, (k1)/A, 0)'
      });
    });
  });
});

describe('getAnnotationsByQualifier', () => {
  it('should return empty array for empty annotations list', () => {
    const annotations: AnnotationInfo[] = [];
    const result = getAnnotationsByQualifier(annotations, BiologicalQualifier.BQB_IS, true);
    expect(result).toEqual([]);
  });

  it('should return correct biological qualifier items', () => {
    const annotations: AnnotationInfo[] = [
      {
        qualifierType: 1, // Biological
        biologicalQualifier: BiologicalQualifier.BQB_IS,
        resources: ['uniprot:P12345', 'uniprot:Q67890'],
      },
      {
        qualifierType: 1, // Biological
        biologicalQualifier: BiologicalQualifier.BQB_HAS_PART,
        resources: ['go:GO:0005515'],
      }
    ];

    const result = getAnnotationsByQualifier(annotations, BiologicalQualifier.BQB_IS, true);
    expect(result).toEqual(['uniprot:P12345', 'uniprot:Q67890']);
  });

  it('should return correct model qualifier items', () => {
    const annotations: AnnotationInfo[] = [
      {
        qualifierType: 0, // Model
        modelQualifier: ModelQualifier.BQM_IS_DESCRIBED_BY,
        resources: ['pubmed:12345678'],
      },
      {
        qualifierType: 1, // Biological
        biologicalQualifier: BiologicalQualifier.BQB_IS,
        resources: ['uniprot:P12345'],
      }
    ];

    const result = getAnnotationsByQualifier(annotations, ModelQualifier.BQM_IS_DESCRIBED_BY, false);
    expect(result).toEqual(['pubmed:12345678']);
  });

  it('should not mix up qualifier types and identifiers', () => {
    // Both biological and model qualifiers have numeric enums.
    // They could accidentally match if the boolean isBiological is ignored.
    const annotations: AnnotationInfo[] = [
      {
        qualifierType: 1, // Biological
        biologicalQualifier: 1 as BiologicalQualifier, // BQB_HAS_PART
        resources: ['biological:1'],
      },
      {
        qualifierType: 0, // Model
        modelQualifier: 1 as ModelQualifier, // BQM_IS_DESCRIBED_BY
        resources: ['model:1'],
      }
    ];

    const biologicalResult = getAnnotationsByQualifier(annotations, 1 as BiologicalQualifier, true);
    expect(biologicalResult).toEqual(['biological:1']);

    const modelResult = getAnnotationsByQualifier(annotations, 1 as ModelQualifier, false);
    expect(modelResult).toEqual(['model:1']);
  });

  it('should correctly combine resources from multiple matching annotations', () => {
    const annotations: AnnotationInfo[] = [
      {
        qualifierType: 1, // Biological
        biologicalQualifier: BiologicalQualifier.BQB_IS,
        resources: ['uniprot:P1'],
      },
      {
        qualifierType: 1, // Biological
        biologicalQualifier: BiologicalQualifier.BQB_IS,
        resources: ['uniprot:P2'],
      }
    ];

    const result = getAnnotationsByQualifier(annotations, BiologicalQualifier.BQB_IS, true);
    expect(result).toEqual(['uniprot:P1', 'uniprot:P2']);
  });
});
