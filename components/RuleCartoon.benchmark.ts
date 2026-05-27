import { bench, describe } from 'vitest';
import { annotateRule } from './RuleCartoon';
import type { VisualizationRule } from '../types/visualization';

// Generate a large rule to test performance
const generateRule = (numComplexes: number, numMolecules: number, numComponents: number): VisualizationRule => {
  const createComplexes = () => Array.from({ length: numComplexes }, (_, i) =>
    Array.from({ length: numMolecules }, (_, j) => ({
      name: `Molecule_${j}`,
      components: Array.from({ length: numComponents }, (_, k) => ({
        name: `Component_${k}`,
        state: `state_${i}_${j}_${k}`,
        bondLabel: k % 2 === 0 ? '1' : undefined
      }))
    }))
  );

  return {
    id: `rule-${numComplexes}-${numMolecules}-${numComponents}`,
    name: `Rule_${numComplexes}_${numMolecules}_${numComponents}`,
    reactants: createComplexes(),
    products: createComplexes(),
    rate: 'k1',
    isBidirectional: false
  };
};

describe('annotateRule performance', () => {
  const smallRule = generateRule(2, 5, 5);
  const largeRule = generateRule(5, 50, 10);

  bench('annotateRule - small', () => {
    annotateRule(smallRule);
  });

  bench('annotateRule - large', () => {
    annotateRule(largeRule);
  });
});
