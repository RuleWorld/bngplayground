import { describe, it, expect } from 'vitest';
import { computeObservableValue, parseObservablePattern } from '../packages/engine/src/utils/dynamicObservable';
import { evaluateExpression } from '../components/ExpressionInputPanel';
import { BNGLParser } from '../packages/engine/src/services/graph/core/BNGLParser';
import { SpeciesGraph } from '../packages/engine/src/services/graph/core/SpeciesGraph';

describe('Dynamic Observable Pattern Matching', () => {
  const speciesGraphs = new Map<string, SpeciesGraph>();

  const testMatch = (patternStr: string, speciesNames: string[], concentrations: number[], type: 'molecules' | 'species' = 'molecules') => {
    const pattern = parseObservablePattern(patternStr);
    return computeObservableValue(pattern, speciesNames, speciesGraphs, concentrations, type);
  };

  describe('Wildcards', () => {
    it('should match any bond with !+', () => {
      const species = ['A(b!1).B(a!1)', 'A(b)'];
      const counts = [1, 1];
      const result = testMatch('A(b!+)', species, counts);
      expect(result.value).toBe(1); // Only the first species matches
    });

    it('should match unbound state with !-', () => {
      const species = ['A(b!1).B(a!1)', 'A(b)'];
      const counts = [1, 1];
      const result = testMatch('A(b!-)', species, counts);
      expect(result.value).toBe(1); // Only the second species matches
    });

    it('should match any state (bound or unbound) with !?', () => {
      const species = ['A(b!1).B(a!1)', 'A(b)'];
      const counts = [1, 1];
      const result = testMatch('A(b!?)', species, counts);
      expect(result.value).toBe(2); // Both match
    });
  });

  describe('Compartments', () => {
    it('should match global compartment prefix @comp:Mol', () => {
      const species = ['@cell:A(b)', '@extra:A(b)'];
      const counts = [1, 1];
      const result = testMatch('@cell:A()', species, counts);
      expect(result.value).toBe(1);
    });

    it('should match molecule-level suffix Mol@comp', () => {
      const species = ['A(b)@cell', 'A(b)@extra'];
      const counts = [1, 1];
      const result = testMatch('A()@cell', species, counts);
      expect(result.value).toBe(1);
    });

    it('should handle compartment inheritance in complexes', () => {
      // @cell:A.B should match A@cell.B@cell
      const species = ['@cell:A.B', 'A@cell.B@extra'];
      const counts = [1, 1];
      const result = testMatch('@cell:A.B', species, counts);
      expect(result.value).toBe(1);
    });
  });

  describe('Connectivity (Dot vs Plus)', () => {
    it('should match molecules in the same complex with dot operator', () => {
      const species = ['A(b!1).B(a!1)', 'A(b).B(a)'];
      const counts = [1, 1];
      // A.B in a pattern means A and B are in the SAME SpeciesGraph (connected or not)
      // In BNG2, A.B matches if A and B are in the same complex.
      const result = testMatch('A.B', species, counts);
      expect(result.value).toBe(2); // In BNGL, both match because they are in the same SpeciesGraph
    });
  });

  describe('Multiplicity', () => {
    it('should count multiplicity for "molecules" type', () => {
      const species = ['A(b!1).A(b!2).B(a!1).B(a!2)'];
      const counts = [1];
      const result = testMatch('A()', species, counts, 'molecules');
      expect(result.value).toBe(2); // Two A molecules in the complex
    });

    it('should count only once for "species" type', () => {
      const species = ['A(b!1).A(b!2).B(a!1).B(a!2)'];
      const counts = [1];
      const result = testMatch('A()', species, counts, 'species');
      expect(result.value).toBe(1);
    });
  });

  describe('Asterisk Wildcard (*)', () => {
    it('should match any molecule name with *', () => {
      const species = ['A(b)', 'B(b)', 'C(d)'];
      const counts = [1, 1, 1];
      const result = testMatch('*(b)', species, counts);
      expect(result.value).toBe(2); // A(b) and B(b) match, C(d) fails component name check
    });

    it('should match * with specific bond', () => {
      const species = ['A(b!1).B(a!1)', 'C(b)'];
      const counts = [1, 1];
      const result = testMatch('*(b!+)', species, counts);
      expect(result.value).toBe(1); // Only A(b!1) matches
    });

    it('should match multiple * molecules in a complex', () => {
      const species = ['A(b!1).B(a!1)'];
      const counts = [1];
      const result = testMatch('*(b!1).*(a!1)', species, counts);
      expect(result.value).toBe(1); // Standard BNGL matching for A.B
    });
  });

  describe('Complex Compartment Behaviors', () => {
    it('should match compartments with wildcards', () => {
      const species = ['A(b)@cell', 'A(b)@extra'];
      const counts = [10, 5];
      const result = testMatch('A()', species, counts);
      expect(result.value).toBe(15); // Sums A from all compartments
    });

    it('should respect exact compartment in complex pattern', () => {
      const species = ['A@cell.B@cell', 'A@cell.B@cyt'];
      const counts = [1, 1];
      const result = testMatch('@cell:A.B', species, counts);
      expect(result.value).toBe(1);
    });
  });

  describe('Hard Test Case: Association with Parameter Seeds', () => {
    // Model: A(b) + B(a) <-> A(b!1).B(a!1)
    // Seeds: A(b) 100, B(a) 100
    it('should correctly compute observables with large initial populations', () => {
      const species = ['A(b)', 'B(a)', 'A(b!1).B(a!1)'];
      // At some time point, 40 complexes have formed
      const counts = [60, 60, 40];

      const obsA = testMatch('A()', species, counts);
      const obsB = testMatch('B()', species, counts);
      const obsC = testMatch('A(b!1).B(a!1)', species, counts);

      // Molecules A should be 60 (free) + 40 (complex) = 100
      expect(obsA.value).toBe(100);
      // Molecules B should be 60 (free) + 40 (complex) = 100
      expect(obsB.value).toBe(100);
      // Molecules C (complex) should be 40
      expect(obsC.value).toBe(40);
    });

    it('should handle symmetry in complex observables', () => {
      const species = ['A(b!1).A(b!2).B(a!1).B(a!2)'];
      const counts = [10];
      // Observable: A.A (two A's in same complex)
      const result = testMatch('A.A', species, counts, 'species');
      expect(result.value).toBe(10); // Matches once per species instance
    });
  });

  describe('Math Expressions with Entities', () => {
    it('should resolve simple parameters in math expressions', () => {
      const vars = { k_on: 10, A: 5 };
      const result = evaluateExpression('k_on * A', vars);
      expect(result).toBe(50);
    });

    it('should resolve species names with special characters', () => {
      const vars = { 'A(b!1).B(a!1)': 40, 'A(b)': 60 };
      const result = evaluateExpression('A(b!1).B(a!1) / (A(b!1).B(a!1) + A(b))', vars);
      // 40 / (40 + 60) = 0.4
      expect(result).toBeCloseTo(0.4);
    });

    it('should handle scientific notation and nested parentheses', () => {
      const vars = { p1: 1.2e-3, p2: 10 };
      const result = evaluateExpression('(p1 * p2) / (1 + p2)', vars);
      expect(result).toBeCloseTo((1.2e-3 * 10) / 11);
    });
  });
});
