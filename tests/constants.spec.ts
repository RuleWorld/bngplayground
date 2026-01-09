// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { CHART_COLORS, EXAMPLES, INITIAL_BNGL_CODE } from '../constants';

const getBlockContent = (blockName: string, code: string): string => {
  const regex = new RegExp(`begin\\s+${blockName}([\\s\\S]*?)end\\s+${blockName}`, 'i');
  const match = regex.exec(code);
  return match ? match[1].trim() : '';
};

// Check if a block exists in code (with possible aliases)
const hasBlock = (code: string, blockNames: string[]): boolean => {
  const lc = code.toLowerCase();
  return blockNames.some(
    (name) => lc.includes(`begin ${name}`) && lc.includes(`end ${name}`)
  );
};

describe('Example catalog integrity', () => {
  it('defines at least thirty curated examples', () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(30);
  });

  it('ensures each example id is unique', () => {
    const ids = EXAMPLES.map((example) => example.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('ensures each example has at least one tag', () => {
    EXAMPLES.forEach((example) => {
      expect(example.tags.length).toBeGreaterThan(0);
    });
  });

  it('keeps the initial template synchronized with an example in the catalog', () => {
    // INITIAL_BNGL_CODE should match one of the examples in the catalog
    const matchingExample = EXAMPLES.find((e) => e.code.trim() === INITIAL_BNGL_CODE.trim());
    expect(matchingExample).toBeDefined();
  });

  it('lists at least eight distinct chart colors', () => {
    expect(CHART_COLORS.length).toBeGreaterThanOrEqual(8);
  });

  it('provides hexadecimal color strings for charts', () => {
    CHART_COLORS.forEach((color) => {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});

// Core blocks with their acceptable aliases
// BNGL allows various block name variations
// cBNGL models can infer molecule types from species, so molecule types is optional
const requiredBlocksWithAliases: { name: string; aliases: string[] }[] = [
  // molecule types is optional - cBNGL can infer from species block
  { name: 'seed species', aliases: ['seed species', 'species'] },
  { name: 'observables', aliases: ['observables'] },
  { name: 'reaction rules', aliases: ['reaction rules'] },
];

// Optional wrapper/action blocks - not all BNGL files use these
const optionalBlocks = ['model', 'actions'];

EXAMPLES.forEach((example) => {
  const lowerCaseCode = example.code.toLowerCase();
  const exampleLabel = `${example.name} (${example.id})`;

  describe(exampleLabel, () => {
    it('uses a non-empty id', () => {
      expect(example.id.trim().length).toBeGreaterThan(0);
    });

    it('provides a descriptive name', () => {
      expect(example.name.trim().length).toBeGreaterThan(3);
    });

    it('includes a helpful description', () => {
      expect(example.description.trim().length).toBeGreaterThan(10);
    });

    requiredBlocksWithAliases.forEach(({ name, aliases }) => {
      it(`includes the ${name} block`, () => {
        expect(hasBlock(example.code, aliases)).toBe(true);
      });
    });

    // Optional blocks - test that IF present, they have matching begin/end
    optionalBlocks.forEach((block) => {
      const hasBegin = lowerCaseCode.includes(`begin ${block}`);
      const hasEnd = lowerCaseCode.includes(`end ${block}`);
      if (hasBegin || hasEnd) {
        it(`has matching begin/end for optional ${block} block`, () => {
          expect(hasBegin).toBe(true);
          expect(hasEnd).toBe(true);
        });
      }
    });

    it('declares at least one observable entry', () => {
      const block = getBlockContent('observables', example.code);
      const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'));
      expect(lines.length).toBeGreaterThan(0);
    });

    it('declares at least one reaction rule with an arrow', () => {
      const block = getBlockContent('reaction rules', example.code);
      expect(block.includes('->') || block.includes('<->')).toBe(true);
    });

    // Simulation action can be inline or in actions block
    // Accept various BNGL actions: simulate, simulate_nf, generate_network, writeSBML, etc.
    // Library models may only have visualize() or commented-out actions
    it('configures an action', () => {
      // All lowercase to match against lowerCaseCode
      const validActions = [
        'simulate(',
        'simulate_nf(',
        'generate_network(',
        'writesbml(',
        'writexml(',
        'writenetwork(',
        'writemfile(',
        'setconcentration(',
        'saveconcentrations(',
        'resetconcentrations(',
        'visualize(',  // Library models may only have visualize
      ];
      const hasAction = validActions.some((action) => lowerCaseCode.includes(action));
      expect(hasAction).toBe(true);
    });

    it('ensures every tag is lower case', () => {
      example.tags.forEach((tag) => {
        expect(tag).toBe(tag.toLowerCase());
      });
    });
  });
});

