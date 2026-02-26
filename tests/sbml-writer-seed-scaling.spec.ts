import { describe, expect, it } from 'vitest';
import { generateSBML } from '../src/lib/atomizer';

describe('SBML writer seed concentration resolution', () => {
  it(
    'prefers initialExpression with Na-neutralization over amount-scaled numeric cache',
    async () => {
      const model = {
        name: 'seed-scale-test',
        parameters: {
          Na: 6.02214076e23,
          __compartment_c__: 1,
        },
        compartments: [{ name: 'c', size: 1, dimensions: 3 }],
        moleculeTypes: [{ name: 'A()' }],
        species: [
          {
            name: 'A()@c',
            // Amount-scaled cache from parser.
            initialConcentration: 7.836063576737594e22,
            // Concentration-space expression in BNGL seed form.
            initialExpression: '(0.130120897020308*Na*__compartment_c__)',
            isConstant: false,
          },
        ],
        observables: [{ name: 'A_amt', type: 'Species', pattern: 'A()@c' }],
        reactions: [],
        reactionRules: [],
      };

      const sbml = await generateSBML(model as any);
      const match = sbml.match(/<species[^>]*initialConcentration="([^"]+)"/i);
      expect(match?.[1]).toBeTruthy();

      const initial = Number(match![1]);
      expect(Number.isFinite(initial)).toBe(true);
      expect(initial).toBeCloseTo(0.130120897020308, 12);
    },
    30000
  );

  it(
    'de-scales amount-like numeric seeds when initialExpression is unavailable',
    async () => {
      const model = {
        name: 'seed-amount-cache-test',
        parameters: {
          Na: 6.02214076e23,
          __compartment_compartment__: 1,
        },
        compartments: [{ name: 'compartment', size: 1, dimensions: 3 }],
        moleculeTypes: [{ name: 'M_mass()' }],
        species: [
          {
            name: 'M_mass()@compartment',
            // Amount-like cache, no expression available (e.g. expanded network output).
            initialConcentration: 1.204428152e24,
            isConstant: false,
          },
        ],
        observables: [{ name: 'mass_amt', type: 'Species', pattern: 'M_mass()@compartment' }],
        reactions: [],
        reactionRules: [],
      };

      const sbml = await generateSBML(model as any);
      const match = sbml.match(/<species[^>]*initialConcentration="([^"]+)"/i);
      expect(match?.[1]).toBeTruthy();

      const initial = Number(match![1]);
      expect(Number.isFinite(initial)).toBe(true);
      expect(initial).toBeCloseTo(2, 12);
    },
    30000
  );

  it(
    'uses Avogadro fallback when Na parameter is absent',
    async () => {
      const model = {
        name: 'seed-amount-cache-no-na-test',
        parameters: {
          // Common in imported models: only quantity_to_number_factor is present.
          quantity_to_number_factor: 6.022140857e20,
          __compartment_compartment__: 1,
        },
        compartments: [{ name: 'compartment', size: 1, dimensions: 3 }],
        moleculeTypes: [{ name: 'M_mass()' }],
        species: [
          {
            name: 'M_mass()@compartment',
            initialConcentration: 1.204428152e24,
            isConstant: false,
          },
        ],
        observables: [{ name: 'mass_amt', type: 'Species', pattern: 'M_mass()@compartment' }],
        reactions: [],
        reactionRules: [],
      };

      const sbml = await generateSBML(model as any);
      const match = sbml.match(/<species[^>]*initialConcentration="([^"]+)"/i);
      expect(match?.[1]).toBeTruthy();

      const initial = Number(match![1]);
      expect(Number.isFinite(initial)).toBe(true);
      expect(initial).toBeCloseTo(2, 9);
    },
    30000
  );

  it(
    'normalizes Na*volume seed expressions to concentration space',
    async () => {
      const model = {
        name: 'seed-expression-volume-test',
        parameters: {
          Na: 6.02214076e23,
          __compartment_tot_cell__: 5.7,
        },
        compartments: [{ name: 'tot_cell', size: 5.7, dimensions: 3 }],
        moleculeTypes: [{ name: 'M_Glucose()' }],
        species: [
          {
            name: 'M_Glucose()@tot_cell',
            initialConcentration: Number.NaN,
            initialExpression: '(0.0340009*Na*__compartment_tot_cell__)',
            isConstant: false,
          },
        ],
        observables: [{ name: 'GlcI_amt', type: 'Species', pattern: 'M_Glucose()@tot_cell' }],
        reactions: [],
        reactionRules: [],
      };

      const sbml = await generateSBML(model as any);
      const match = sbml.match(/<species[^>]*initialConcentration="([^"]+)"/i);
      expect(match?.[1]).toBeTruthy();

      const initial = Number(match![1]);
      expect(Number.isFinite(initial)).toBe(true);
      expect(initial).toBeCloseTo(0.0340009, 9);
    },
    30000
  );

  it(
    'does not de-scale direct high concentration seeds that are already in concentration units',
    async () => {
      const model = {
        name: 'seed-direct-high-concentration-test',
        parameters: {
          Na: 6.02214076e23,
          __compartment_Lumen__: 1,
        },
        compartments: [{ name: 'Lumen', size: 1, dimensions: 3 }],
        moleculeTypes: [{ name: 'M_Commensal_Dead()' }],
        species: [
          {
            name: 'M_Commensal_Dead()@Lumen',
            initialConcentration: 5e10,
            isConstant: false,
          },
        ],
        observables: [{ name: 'Commensal_Dead_amt', type: 'Species', pattern: 'M_Commensal_Dead()@Lumen' }],
        reactions: [],
        reactionRules: [],
      };

      const sbml = await generateSBML(model as any);
      const match = sbml.match(/<species[^>]*initialConcentration="([^"]+)"/i);
      expect(match?.[1]).toBeTruthy();

      const initial = Number(match![1]);
      expect(Number.isFinite(initial)).toBe(true);
      expect(initial).toBeCloseTo(5e10, 6);
    },
    30000
  );

  it(
    'exports numeric non-amount seeds as initialAmount when _c_ mapping uses compartment division',
    async () => {
      const model = {
        name: 'seed-non-amount-initial-amount-test',
        parameters: {
          __compartment_Environment__: 1,
        },
        compartments: [{ name: 'Environment', size: 1, dimensions: 3 }],
        moleculeTypes: [{ name: 'M_GLC()' }],
        species: [
          {
            name: 'M_GLC()@Environment',
            initialConcentration: 4.8,
            initialExpression: '4.8',
            isConstant: false,
          },
        ],
        functions: [{ name: '_c_GLC', args: [], expression: 'GLC / __compartment_Environment__' }],
        observables: [{ name: 'GLC_amt', type: 'Species', pattern: 'M_GLC()@Environment' }],
        reactions: [],
        reactionRules: [],
      };

      const sbml = await generateSBML(model as any);
      const glcSpecies = sbml.match(
        /<species[^>]*name="M_GLC\(\)@Environment"[^>]*>/i
      )?.[0];

      expect(glcSpecies).toBeTruthy();
      expect(glcSpecies).toContain('initialAmount="4.8"');
      expect(glcSpecies).toContain('hasOnlySubstanceUnits="false"');
      expect(glcSpecies).not.toContain('initialConcentration=');
    },
    30000
  );

  it(
    'maps observable-style _c_ symbols to amount-only species export',
    async () => {
      const model = {
        name: 'seed-amount-only-observable-alias-test',
        parameters: {
          __compartment_compartment_1__: 1,
        },
        compartments: [{ name: 'compartment_1', size: 1, dimensions: 3 }],
        moleculeTypes: [{ name: 'M_IkBa_NF()' }],
        species: [
          {
            name: '@compartment_1::M_IkBa_NF()',
            initialConcentration: 1.66053878316273e-13,
            initialExpression: '1.66053878316273e-13',
            isConstant: false,
          },
        ],
        observables: [
          { name: 'species_2_amt', type: 'Species', pattern: 'M_IkBa_NF@compartment_1' },
          { name: 'species_2', type: 'Species', pattern: 'M_IkBa_NF@compartment_1' },
        ],
        functions: [{ name: '_c_species_2', args: [], expression: 'species_2' }],
        reactions: [],
        reactionRules: [],
      };

      const sbml = await generateSBML(model as any);
      const speciesLine = sbml.match(
        /<species[^>]*name="@compartment_1::M_IkBa_NF\(\)"[^>]*>/i
      )?.[0];

      expect(speciesLine).toBeTruthy();
      expect(speciesLine).toContain('hasOnlySubstanceUnits="true"');
      const amountMatch = speciesLine!.match(/initialAmount="([^"]+)"/i);
      expect(amountMatch?.[1]).toBeTruthy();
      expect(Number(amountMatch![1])).toBeCloseTo(1.66053878316273e-13, 20);
      expect(speciesLine).not.toContain('initialConcentration=');
    },
    30000
  );

  it(
    'de-scales very-large direct seeds without expressions to concentration space',
    async () => {
      const model = {
        name: 'seed-large-direct-no-expression-test',
        parameters: {
          Na: 6.02214076e23,
          __compartment_Whole_organism_blood__: 1,
        },
        compartments: [{ name: 'Whole_organism_blood', size: 1, dimensions: 3 }],
        moleculeTypes: [{ name: 'M_Leukaemic_B_cells()' }],
        species: [
          {
            name: 'M_Leukaemic_B_cells()@Whole_organism_blood',
            initialConcentration: 3.01107038e34,
            isConstant: false,
          },
        ],
        observables: [
          {
            name: 'Leukaemic_B_cells_amt',
            type: 'Species',
            pattern: 'M_Leukaemic_B_cells@Whole_organism_blood',
          },
          {
            name: 'Leukaemic_B_cells',
            type: 'Species',
            pattern: 'M_Leukaemic_B_cells@Whole_organism_blood',
          },
        ],
        functions: [
          {
            name: '_c_Leukaemic_B_cells',
            args: [],
            expression: 'Leukaemic_B_cells / __compartment_Whole_organism_blood__',
          },
        ],
        reactions: [],
        reactionRules: [],
      };

      const sbml = await generateSBML(model as any);
      const speciesLine = sbml.match(
        /<species[^>]*name="M_Leukaemic_B_cells\(\)@Whole_organism_blood"[^>]*>/i
      )?.[0];

      expect(speciesLine).toBeTruthy();
      expect(speciesLine).toContain('hasOnlySubstanceUnits="false"');
      const concentrationMatch = speciesLine!.match(/initialConcentration="([^"]+)"/i);
      expect(concentrationMatch?.[1]).toBeTruthy();
      const concentration = Number(concentrationMatch![1]);
      expect(Number.isFinite(concentration)).toBe(true);
      expect(Math.abs(concentration - 5e10) / 5e10).toBeLessThan(1e-12);
      expect(speciesLine).not.toContain('initialAmount=');
    },
    30000
  );

  it(
    'exports amount-only seeds as initialAmount based on _c_ function identity mapping',
    async () => {
      const model = {
        name: 'seed-amount-only-via-c-function',
        parameters: {
          Na: 6.02214076e23,
          __compartment_Environment__: 1,
        },
        compartments: [{ name: 'Environment', size: 1, dimensions: 3 }],
        moleculeTypes: [{ name: 'M_BM()' }, { name: 'M_ACT()' }],
        species: [
          {
            name: 'M_BM()@Environment',
            initialConcentration: 0.03,
            isConstant: true,
          },
          {
            name: 'M_ACT()@Environment',
            initialConcentration: 2,
            isConstant: false,
          },
        ],
        functions: [
          { name: '_c_BM', args: [], expression: 'BM' },
          { name: '_c_ACT', args: [], expression: 'ACT / __compartment_Environment__' },
        ],
        observables: [{ name: 'BM_amt', type: 'Species', pattern: 'M_BM()@Environment' }],
        reactions: [],
        reactionRules: [],
      };

      const sbml = await generateSBML(model as any);
      const bmSpecies = sbml.match(
        /<species[^>]*name="M_BM\(\)@Environment"[^>]*>/i
      )?.[0];
      const actSpecies = sbml.match(
        /<species[^>]*name="M_ACT\(\)@Environment"[^>]*>/i
      )?.[0];

      expect(bmSpecies).toBeTruthy();
      expect(actSpecies).toBeTruthy();

      expect(bmSpecies).toContain('initialAmount="0.03"');
      expect(bmSpecies).toContain('hasOnlySubstanceUnits="true"');
      expect(bmSpecies).toContain('boundaryCondition="true"');
      expect(bmSpecies).toContain('constant="true"');

      expect(actSpecies).toContain('initialConcentration="2"');
      expect(actSpecies).toContain('hasOnlySubstanceUnits="false"');
      expect(actSpecies).toContain('boundaryCondition="false"');
    },
    30000
  );

  it(
    'maps rate-rule metadata onto aliased species ids and avoids synthetic rate-rule reactions',
    async () => {
      const model = {
        name: 'rate-rule-alias-species-target-test',
        parameters: {
          Na: 6.02214076e23,
          __compartment_Whole_organism_blood__: 1,
          rho: 8.8,
        },
        compartments: [{ name: 'Whole_organism_blood', size: 1, dimensions: 3 }],
        moleculeTypes: [{ name: 'M_Expanding_CAR()' }, { name: 'M_Tumor_cells()' }],
        species: [
          {
            name: '$M_Expanding_CAR@Whole_organism_blood',
            initialConcentration: 10,
            isConstant: true,
          },
          {
            name: 'M_Tumor_cells@Whole_organism_blood',
            initialConcentration: 900,
            isConstant: false,
          },
        ],
        observables: [
          {
            name: 'Expanding_CAR_T_cells_amt',
            type: 'Species',
            pattern: 'M_Expanding_CAR@Whole_organism_blood',
          },
          {
            name: 'Expanding_CAR_T_cells',
            type: 'Species',
            pattern: 'M_Expanding_CAR@Whole_organism_blood',
          },
        ],
        functions: [
          {
            name: '__rate_rule__Expanding_CAR_T_cells',
            args: [],
            expression: 'rho',
          },
          {
            name: '__rate_rule_pos__Expanding_CAR_T_cells',
            args: [],
            expression: '__rate_rule__Expanding_CAR_T_cells()',
          },
        ],
        reactions: [
          {
            reactants: [],
            products: ['$M_Expanding_CAR@Whole_organism_blood'],
            rate: '__rate_rule_pos__Expanding_CAR_T_cells()',
            rateConstant: 0,
          },
        ],
        reactionRules: [],
      };

      const sbml = await generateSBML(model as any);

      expect(sbml).toContain('<rateRule variable="s0">');
      expect(sbml).not.toContain('<rateRule variable="Expanding_CAR_T_cells">');
      expect(sbml).not.toMatch(/<parameter[^>]*id="Expanding_CAR_T_cells"/i);

      const speciesLine = sbml.match(
        /<species[^>]*id="s0"[^>]*name="\$M_Expanding_CAR@Whole_organism_blood"[^>]*>/i
      )?.[0];
      expect(speciesLine).toBeTruthy();
      expect(speciesLine).toContain('boundaryCondition="true"');
      expect(speciesLine).toContain('constant="false"');

      expect(sbml).not.toContain('__rate_rule_pos__Expanding_CAR_T_cells()');
    },
    30000
  );

  it(
    'rewrites S#_amt kinetic-law placeholders to concrete species ids in SBML export',
    async () => {
      const model = {
        name: 'reaction-s-index-placeholder-test',
        parameters: {
          __compartment_cell__: 1,
          k: 2,
        },
        compartments: [{ name: 'cell', size: 1, dimensions: 3 }],
        moleculeTypes: [{ name: 'M_A()' }],
        species: [
          {
            name: 'M_A()@cell',
            initialConcentration: 3,
            isConstant: false,
          },
        ],
        observables: [{ name: 'A_amt', type: 'Species', pattern: 'M_A()@cell' }],
        reactions: [
          {
            reactants: ['M_A()@cell'],
            products: [],
            rate: 'k * S1_amt',
            rateConstant: 0,
          },
        ],
        reactionRules: [],
      };

      const sbml = await generateSBML(model as any);
      expect(sbml).toContain('<kineticLaw formula="k * s0"/>');
      expect(sbml).not.toContain('S1_amt');
    },
    30000
  );
});
