import type { ReactionRule } from '../../types';
import type {
  CompactRule,
  RuleOperation,
  VisualizationMolecule,
} from '../../types/visualization';
import type { SpeciesGraph } from '@bngplayground/engine';
import {
  convertSpeciesGraph,
  extractBonds,
  parseSpeciesGraphs,
  detectStateChanges,
} from './speciesGraphUtils';

const collectMoleculeCounts = (graphs: SpeciesGraph[]): Map<string, number> => {
  const counts = new Map<string, number>();

  graphs.forEach((graph) => {
    graph.molecules.forEach((molecule) => {
      const current = counts.get(molecule.name) ?? 0;
      counts.set(molecule.name, current + 1);
    });
  });

  return counts;
};

const buildContext = (graphs: SpeciesGraph[]): VisualizationMolecule[] => {
  const context: VisualizationMolecule[] = [];
  const seen = new Set<string>();

  graphs.forEach((graph) => {
    const molecules = convertSpeciesGraph(graph);
    molecules.forEach((mol) => {
      const signature = [
        mol.name,
        mol.components
          .map((component) => {
            const state = component.state ? `~${component.state}` : '';
            const bond = component.bondLabel ? component.bondLabel : '';
            return `${component.name}${state}${bond}`;
          })
          .join(','),
      ].join('|');
      if (!seen.has(signature)) {
        seen.add(signature);
        context.push(mol);
      }
    });
  });

  return context;
};

export const buildCompactRule = (rule: ReactionRule, displayName?: string): CompactRule => {
  const reactantGraphs = parseSpeciesGraphs(rule.reactants);
  const productGraphs = parseSpeciesGraphs(rule.products);

  const operations: RuleOperation[] = [];

  const reactantBonds = extractBonds(reactantGraphs);
  const productBonds = extractBonds(productGraphs);

  productBonds.forEach((bondInfo, key) => {
    if (!reactantBonds.has(key)) {
      operations.push({
        type: 'bind',
        target: `${bondInfo.mol1}.${bondInfo.comp1}-${bondInfo.mol2}.${bondInfo.comp2}`,
        bondLabel: bondInfo.label,
      });
    }
  });

  reactantBonds.forEach((bondInfo, key) => {
    if (!productBonds.has(key)) {
      operations.push({
        type: 'unbind',
        target: `${bondInfo.mol1}.${bondInfo.comp1}-${bondInfo.mol2}.${bondInfo.comp2}`,
        bondLabel: bondInfo.label,
      });
    }
  });

  // Use the new positional state change detection
  const stateChanges = detectStateChanges(reactantGraphs, productGraphs);

  stateChanges.forEach((change) => {
    operations.push({
      type: 'state_change',
      target: `${change.molecule}.${change.component}`,
      from: change.fromState,
      to: change.toState,
    });
  });

  const reactantCounts = collectMoleculeCounts(reactantGraphs);
  const productCounts = collectMoleculeCounts(productGraphs);

  productCounts.forEach((count, name) => {
    const reactantCount = reactantCounts.get(name) ?? 0;
    const delta = count - reactantCount;
    for (let i = 0; i < delta; i += 1) {
      operations.push({
        type: 'add_molecule',
        target: name,
      });
    }
  });

  reactantCounts.forEach((count, name) => {
    const productCount = productCounts.get(name) ?? 0;
    const delta = count - productCount;
    for (let i = 0; i < delta; i += 1) {
      operations.push({
        type: 'remove_molecule',
        target: name,
      });
    }
  });

  const context = buildContext(reactantGraphs);

  return {
    name: displayName ?? rule.name ?? `Rule`,
    context,
    operations,
    rate: String(rule.rate),
    comment: rule.comment,
  };
};
