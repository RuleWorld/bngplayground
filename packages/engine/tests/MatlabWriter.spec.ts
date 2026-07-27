import { describe, it, expect } from 'vitest';
import { MatlabWriter } from '../src/services/export/MatlabWriter';
import type { BNGLModel } from '../src/types';

describe('MatlabWriter', () => {
  describe('makeMatlabFunctionName', () => {
    it('replaces non-alphanumeric characters with underscores', () => {
      expect(MatlabWriter.makeMatlabFunctionName('my-model-name')).toBe('my_model_name');
      expect(MatlabWriter.makeMatlabFunctionName('model.1')).toBe('model_1');
    });

    it('adds model_ prefix if it starts with a number', () => {
      expect(MatlabWriter.makeMatlabFunctionName('123model')).toBe('model_123model');
    });

    it('returns bng_model for empty or invalid names', () => {
      expect(MatlabWriter.makeMatlabFunctionName('')).toBe('bng_model');
      expect(MatlabWriter.makeMatlabFunctionName('---')).toBe('___');
    });
  });

  describe('write', () => {
    const mockModel: BNGLModel = {
      name: 'TestModel',
      parameters: { k1: 0.1, k_reverse: 0.05, k10: 0.5 }, // k1 and k10 to test partial match overlapping (line 401)
      moleculeTypes: [],
      species: [
        { name: 'A()', initialConcentration: 100, isConstant: false },
        { name: 'B()', initialConcentration: 0, isConstant: false },
        { name: 'C()', initialConcentration: 10, isConstant: true }, // fixed/constant species
        { name: 'D()', initialConcentration: 5, isConstant: false },
        { name: 'E()', initialConcentration: 0, isConstant: false }, // unused species
      ],
      observables: [
        { name: 'A_obs', type: 'Species', pattern: 'A()' },
        { name: 'B_mol_obs', type: 'Molecules', pattern: 'B()' },
        { name: 'Empty_obs', type: 'Species', pattern: 'X()' }, // Completely non-existent species
      ],
      reactions: [
        {
          reactants: ['A()', 'C()', 'NonExistent()'], // 'NonExistent()' reactant to hit idx < 0 (line 307)
          products: ['B()'],
          rate: 'k1',
          rateConstant: 0.1,
          productStoichiometries: [1],
        },
        {
          reactants: ['B()'],
          products: ['A()', 'C()'],
          rate: 'k_reverse*1.5|local:some_local_data', // rate string with |local: and * expression
          rateConstant: 0.05,
          statFactor: 2.0,
          productStoichiometries: [1, 1],
        },
        {
          // A custom reaction to test non-1 and non--1 coefficients
          reactants: ['A()'],
          products: ['D()', 'B()'], // B() is product here too to hit second loop iteration for B()
          rate: 'k1_fake', // 'k1' is a parameter but k1_fake is not. Hits pos = found + name.length (line 401)
          rateConstant: 0.5,
          productStoichiometries: [2, 3], // B() has coeff +3 (line 351)
        },
        {
          // A custom reaction to test non-1 reactants coefficient (by referencing same reactant multiple times)
          reactants: ['A()', 'A()'],
          products: ['B()'],
          rate: 'k1',
          rateConstant: 0.1,
          productStoichiometries: [1],
        }
      ],
      reactionRules: [],
      compartments: [],
      functions: [],
    };

    it('generates a valid MATLAB script structure', () => {
      const result = MatlabWriter.write(mockModel);

      expect(result).toContain('function [err, timepoints, species_out, observables_out] = TestModel(timepoints, species_init, parameters, suppress_plot)');
      expect(result).toContain('y0 = zeros(5, 1);');
      expect(result).toContain('y0(1) = 100; % A()');
      expect(result).toContain('y0(2) = 0; % B()');
      expect(result).toContain('y0(3) = 10; % C()');

      expect(result).toContain('p = zeros(3, 1);');
      expect(result).toContain('p(1) = 0.1; % k1');
      expect(result).toContain('p(2) = 0.05; % k_reverse');

      expect(result).toContain('odeopts = odeset(\'RelTol\', 1e-8, \'AbsTol\', 1e-8, \'Stats\', \'on\', \'BDF\', \'off\', \'MaxOrder\', 5);');
    });

    it('respects writer options', () => {
      const result = MatlabWriter.write(mockModel, null, {
        tStart: 2,
        tEnd: 20,
        nSteps: 50,
        rtol: 1e-5,
        atol: 1e-6,
        stats: false,
        bdf: true,
        maxOrder: 4,
        maxStep: 0.5,
      });

      expect(result).toContain('linspace(2, 20, 51)');
      expect(result).toContain('odeopts = odeset(\'RelTol\', 0.00001, \'AbsTol\', 0.000001, \'Stats\', \'off\', \'BDF\', \'on\', \'MaxOrder\', 4, \'MaxStep\', 0.5);');
    });

    it('converts rate expressions to MATLAB correctly', () => {
      const result = MatlabWriter.write(mockModel);

      // Reaction 1 rate: k1
      expect(result).toContain('ratelaws(1) = expressions(1)*species(1)*species(3);');

      // Reaction 2 rate: k_reverse*1.5 |local:... with statFactor 2.0
      // "k_reverse" is the 2nd parameter, so should map to expressions(2).
      // The substring logic should remove "|local:" suffix.
      // Since statFactor is 2.0, rate should have multiplier.
      expect(result).toContain('ratelaws(2) = 2*expressions(2)*1.5*species(2);');

      // Reaction 3 rate: k1_fake. The name 'k1' is a prefix of 'k1_fake' but should not match partially (convertRateToMatlab else branch)
      expect(result).toContain('ratelaws(3) = k1_fake*species(1);');
    });

    it('handles numeric rates correctly', () => {
      const numericRateModel: BNGLModel = {
        ...mockModel,
        reactions: [
          {
            reactants: ['A()'],
            products: ['B()'],
            rate: '0.123',
            rateConstant: 0.123,
            statFactor: 3.0,
          },
        ],
      };
      const result = MatlabWriter.write(numericRateModel);
      expect(result).toContain('ratelaws(1) = 0.369*species(1);');
    });

    it('correctly maps species stoichiometry including constant species', () => {
      const result = MatlabWriter.write(mockModel);

      // A() (index 1 in Matlab, index 0 in JS)
      // Reactant in rxn 1 (-1), product in rxn 2 (+1), reactant in rxn 3 (-1), reactant in rxn 4 (-2)
      // Total stoichiometry pattern should be matched:
      expect(result).toContain('Dspecies(1) = -ratelaws(1) + ratelaws(2) - ratelaws(3) - 2*ratelaws(4);');

      // B() (index 2 in Matlab, index 1 in JS)
      // Product in rxn 1 (+1), reactant in rxn 2 (-1), product in rxn 3 (+3 coeff), product in rxn 4 (+1)
      expect(result).toContain('Dspecies(2) = ratelaws(1) - ratelaws(2) + 3*ratelaws(3) + ratelaws(4);');

      // C() (index 3 in Matlab, index 2 in JS): constant species should have derivative 0 and have comments
      expect(result).toContain('Dspecies(3) = 0; % fixed species');

      // D() (index 4 in Matlab, index 3 in JS)
      // Product in rxn 3 with productStoichiometries [2] (+2 coeff)
      expect(result).toContain('Dspecies(4) = 2*ratelaws(3);');

      // E() is unused, should hit entry.rxnCoeffs.length === 0 (line 332)
      expect(result).not.toContain('Dspecies(5) =');
    });

    it('supports concrete observables option from ExpandedNetwork', () => {
      const network = {
        species: [
          { name: 'A()', initialConcentration: 100, isConstant: false },
          { name: 'B()', initialConcentration: 0, isConstant: false },
        ],
        reactions: [],
      };
      const concreteModel = {
        ...mockModel,
        concreteObservables: [
          {
            name: 'A_concrete',
            type: 'Species',
            indices: [0],
            coefficients: [2],
            volumes: [1],
          },
        ],
      };

      const result = MatlabWriter.write(concreteModel as any, network as any);
      expect(result).toContain('observables(1) = 2*species(1); % A_concrete');
    });

    it('handles fallback observable calculations', () => {
      const result = MatlabWriter.write(mockModel);

      // 'A_obs' of type 'Species' matching 'A()'
      expect(result).toContain('observables(1) = species(1); % A_obs');

      // 'B_mol_obs' of type 'Molecules' matching 'B()'
      expect(result).toContain('observables(2) = species(2); % B_mol_obs');

      // 'Empty_obs' of type 'Species' matching 'X()' which doesn't exist
      expect(result).toContain('observables(3) = 0; % Empty_obs');
    });

    it('handles model with no observables', () => {
      const modelNoObs: BNGLModel = {
        ...mockModel,
        observables: [],
      };
      const result = MatlabWriter.write(modelNoObs);
      expect(result).toContain('plot(timepoints, species_out);');
      expect(result).toContain('ylabel(\'Species Count\', \'FontSize\', 12);');
    });
  });
});
