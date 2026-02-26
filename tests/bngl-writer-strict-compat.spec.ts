import { describe, expect, it } from 'vitest';
import { Molecule, Species } from '../src/lib/atomizer/core/structures';
import { writeFunctions, writeSeedSpecies } from '../src/lib/atomizer/writer/bnglWriter';

describe('BNGL writer strict-parser compatibility', () => {
  it('sanitizes strict-parser keyword identifiers in function names and arguments', () => {
    const functions = new Map<string, any>([
      [
        'function',
        {
          id: 'function',
          name: 'function',
          arguments: ['param', 'mod', 'parameter', 'modifier', 'substrate'],
          math: 'function_1(param, mod) + function_2(parameter, modifier) + function(parameter, modifier, substrate)',
        },
      ],
      [
        'function_1',
        {
          id: 'function_1',
          name: 'function_1',
          arguments: ['param', 'mod'],
          math: 'param * mod',
        },
      ],
      [
        'function_2',
        {
          id: 'function_2',
          name: 'function_2',
          arguments: ['parameter', 'modifier'],
          math: 'parameter * modifier',
        },
      ],
    ]);

    const section = writeFunctions(
      functions,
      [],
      new Map(),
      new Map(),
      new Map(),
      new Set(),
      new Set(),
      new Map(),
      new Map(),
      [],
      new Set(),
      false
    );

    expect(section).toContain(
      'function_id(param_id, mod_id, parameter_id, modifier_id, substrate_id)'
    );
    expect(section).toContain('function_1(param_id, mod_id)');
    expect(section).toContain('function_2(parameter_id, modifier_id)');
    expect(section).not.toContain('function(param, mod');
  });

  it('keeps $ marker in seed species lines but not in canonical idToPattern mapping', () => {
    const seedStructure = new Species();
    seedStructure.addMolecule(new Molecule('A'));
    seedStructure.renumberBonds();

    const sct = {
      entries: new Map([
        [
          'A',
          {
            structure: seedStructure.copy(),
            components: [],
            sbmlId: 'A',
            isElemental: true,
            modifications: new Map(),
            weight: 0,
            bonds: [],
          },
        ],
      ]),
      dependencies: new Map(),
      reverseDependencies: new Map(),
      sortedSpecies: ['A'],
      weights: [['A', 0]],
    } as any;

    const out = writeSeedSpecies(
      [
        {
          species: seedStructure.copy(),
          concentration: '1',
          compartment: 'c',
          sbmlId: 'A',
        },
      ],
      new Map(),
      sct,
      new Map([['A', 'c']]),
      false,
      new Set(['A'])
    );

    expect(out.section).toContain('$');
    const mappedPattern = Array.from(out.idToPattern.values())[0] || '';
    expect(mappedPattern.startsWith('$')).toBe(false);
    expect(out.patternToId.has(mappedPattern)).toBe(true);
    expect(out.patternToId.has(`$${mappedPattern}`)).toBe(true);
  });
});

