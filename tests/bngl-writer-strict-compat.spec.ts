import { describe, expect, it } from 'vitest';
import { Molecule, Species } from '../src/lib/atomizer/core/structures';
import { writeFunctions, writeSeedSpecies } from '../src/lib/atomizer/writer/bnglWriter';

describe('BNGL writer strict-parser compatibility', () => {
  it('does not emit argument-taking functionDefinitions (they are inlined at call sites)', () => {
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

    // BNG2's run_network rejects functions with arguments ("Functions cannot contain
    // arguments"), so argument-taking functionDefinitions are inlined at every call site and
    // must NOT appear as standalone definitions in the functions block. (Zero-argument
    // functionDefinitions are still emitted; keyword sanitization on the inlined bodies is
    // covered where those call sites are exercised.)
    expect(section).not.toContain('function_id(');
    expect(section).not.toContain('function_1(');
    expect(section).not.toContain('function_2(');
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