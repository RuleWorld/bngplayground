import { describe, it, expect } from 'vitest';
import { analyzeNetwork, checkDeficiencyZeroTheorem } from '../../src/services/analysis/NetworkAnalysis';
import { Rxn } from '../../src/services/graph/core/Rxn';

describe('NetworkAnalysis - analyzeNetwork', () => {
  it('should correctly analyze a simple reversible reaction A <-> B', () => {
    // A (0) <-> B (1)
    const reactions = [
      new Rxn([0], [1], 1.0, 'fwd'),
      new Rxn([1], [0], 1.0, 'rev')
    ];
    const nSpecies = 2;

    const analysis = analyzeNetwork(reactions, nSpecies);

    expect(analysis.numSpecies).toBe(2);
    expect(analysis.numReactions).toBe(2);
    expect(analysis.numComplexes).toBe(2); // A and B
    expect(analysis.numLinkageClasses).toBe(1); // {A, B}
    expect(analysis.stoichiometricRank).toBe(1);
    expect(analysis.deficiency).toBe(0); // 2 - 1 - 1 = 0
    expect(analysis.isWeaklyReversible).toBe(true);
    expect(analysis.isReversible).toBe(true);
    expect(analysis.floatingSpecies).toEqual([0, 1]);
    expect(analysis.boundarySpecies).toEqual([]);
  });

  it('should correctly analyze a weakly reversible network A -> B -> C -> A', () => {
    // A (0) -> B (1), B (1) -> C (2), C (2) -> A (0)
    const reactions = [
      new Rxn([0], [1], 1.0, 'r1'),
      new Rxn([1], [2], 1.0, 'r2'),
      new Rxn([2], [0], 1.0, 'r3')
    ];
    const nSpecies = 3;

    const analysis = analyzeNetwork(reactions, nSpecies);

    expect(analysis.numComplexes).toBe(3); // A, B, C
    expect(analysis.numLinkageClasses).toBe(1); // {A, B, C}
    expect(analysis.stoichiometricRank).toBe(2); // independent vectors
    expect(analysis.deficiency).toBe(0); // 3 - 1 - 2 = 0
    expect(analysis.isWeaklyReversible).toBe(true);
    expect(analysis.isReversible).toBe(false); // Only forward cycles
  });

  it('should correctly analyze a non-weakly reversible network A -> B -> C', () => {
    // A (0) -> B (1), B (1) -> C (2)
    const reactions = [
      new Rxn([0], [1], 1.0, 'r1'),
      new Rxn([1], [2], 1.0, 'r2')
    ];
    const nSpecies = 3;

    const analysis = analyzeNetwork(reactions, nSpecies);

    expect(analysis.numComplexes).toBe(3); // A, B, C
    expect(analysis.numLinkageClasses).toBe(1); // {A, B, C}
    expect(analysis.stoichiometricRank).toBe(2);
    expect(analysis.deficiency).toBe(0); // 3 - 1 - 2 = 0
    expect(analysis.isWeaklyReversible).toBe(false);
    expect(analysis.isReversible).toBe(false);
    expect(analysis.floatingSpecies).toEqual([1]); // B is both
    expect(analysis.boundarySpecies).toEqual([0, 2]); // A and C are boundary
  });

  it('should handle complex stoich and zero species: A + B -> 2C', () => {
    // A (0) + B (1) -> C (2) + C (2)
    // 0 -> A (0)
    const reactions = [
      new Rxn([0, 1], [2, 2], 1.0, 'r1'),
      new Rxn([], [0], 1.0, 'r2')
    ];
    const nSpecies = 3;

    const analysis = analyzeNetwork(reactions, nSpecies);

    expect(analysis.numComplexes).toBe(4); // A+B, 2C, 0, A
    expect(analysis.numLinkageClasses).toBe(2); // {A+B, 2C}, {0, A}
    expect(analysis.stoichiometricRank).toBe(2);
    expect(analysis.deficiency).toBe(0); // 4 - 2 - 2 = 0
  });
});

describe('NetworkAnalysis - checkDeficiencyZeroTheorem', () => {
  it('should apply and return true when deficiency is 0 and is weakly reversible', () => {
    const analysis: any = {
      deficiency: 0,
      isWeaklyReversible: true
    };

    const result = checkDeficiencyZeroTheorem(analysis);

    expect(result.applies).toBe(true);
    expect(result.hasUniqueStableSSS).toBe(true);
    expect(result.explanation).toContain('unique, asymptotically stable');
  });

  it('should not apply when deficiency is 0 but is not weakly reversible', () => {
    const analysis: any = {
      deficiency: 0,
      isWeaklyReversible: false
    };

    const result = checkDeficiencyZeroTheorem(analysis);

    expect(result.applies).toBe(false);
    expect(result.hasUniqueStableSSS).toBe(false);
    expect(result.explanation).toContain('not weakly reversible');
  });

  it('should not apply when deficiency is non-zero', () => {
    const analysis: any = {
      deficiency: 1,
      isWeaklyReversible: true
    };

    const result = checkDeficiencyZeroTheorem(analysis);

    expect(result.applies).toBe(false);
    expect(result.hasUniqueStableSSS).toBe(false);
    expect(result.explanation).toContain('Deficiency is 1');
  });
});
