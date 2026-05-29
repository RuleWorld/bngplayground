import type { ReactionRule } from '../../types';
import type { RuleFlowEdge, RuleFlowGraph, RuleFlowNode } from '../../types/visualization';
import {
  extractBonds,
  parseSpeciesGraphs,
  detectStateChanges as detectStateChangesUtil,
} from './speciesGraphUtils';
import { colorFromName } from './colorUtils';

interface RuleFlowBuilderOptions {
  getRuleColor?: (rule: ReactionRule, index: number) => string;
  getRuleId?: (rule: ReactionRule, index: number) => string;
  getRuleLabel?: (rule: ReactionRule, index: number) => string;
}

interface BondChangeSet {
  created: string[];
  destroyed: string[];
}

interface RuleSummary {
  id: string;
  displayName: string;
  nodeType: RuleFlowNode['type'];
  layer: number;
  producedSpecies: string[];
  consumedSpecies: string[];
}

const layerMap: Record<RuleFlowNode['type'], number> = {
  synthesis: 0,
  binding: 1,
  modification: 2,
  complex: 3,
  degradation: 4,
};

const normalize = (value: string): string => value.replace(/\s+/g, '').toLowerCase();

const canonicalizeSpecies = (species: string): string => species.trim();

const detectBondChanges = (rule: ReactionRule): BondChangeSet => {
  const reactantGraphs = parseSpeciesGraphs(rule.reactants);
  const productGraphs = parseSpeciesGraphs(rule.products);

  const created: string[] = [];
  const destroyed: string[] = [];

  const reactantBonds = extractBonds(reactantGraphs);
  const productBonds = extractBonds(productGraphs);

  productBonds.forEach((bondInfo, key) => {
    if (reactantBonds.has(key)) {
      return;
    }
    created.push(
      `${bondInfo.mol1}.${bondInfo.comp1}-${bondInfo.mol2}.${bondInfo.comp2}`,
    );
  });

  reactantBonds.forEach((bondInfo, key) => {
    if (productBonds.has(key)) {
      return;
    }
    destroyed.push(
      `${bondInfo.mol1}.${bondInfo.comp1}-${bondInfo.mol2}.${bondInfo.comp2}`,
    );
  });

  return { created, destroyed };
};

const detectStateChanges = (rule: ReactionRule): string[] => {
  const reactantGraphs = parseSpeciesGraphs(rule.reactants);
  const productGraphs = parseSpeciesGraphs(rule.products);

  // Use the new positional state change detection
  const changes = detectStateChangesUtil(reactantGraphs, productGraphs);

  return changes.map((change) => `${change.molecule}.${change.component}`);
};

export const classifyRule = (rule: ReactionRule): RuleFlowNode['type'] => {
  const bondChanges = detectBondChanges(rule);
  const stateChanges = detectStateChanges(rule);

  if (bondChanges.created.length > 0 && bondChanges.destroyed.length === 0) {
    return 'binding';
  }
  if (bondChanges.created.length === 0 && stateChanges.length > 0) {
    return 'modification';
  }
  if (rule.products.length > rule.reactants.length) {
    return 'synthesis';
  }
  if (rule.products.length < rule.reactants.length) {
    return 'degradation';
  }
  return 'complex';
};

const summarizeRule = (
  rule: ReactionRule,
  index: number,
  options: RuleFlowBuilderOptions,
): RuleSummary => {
  const id = options.getRuleId?.(rule, index) ?? rule.name ?? `rule_${index + 1}`;
  const displayName = options.getRuleLabel?.(rule, index) ?? rule.name ?? `Rule ${index + 1}`;
  const nodeType = classifyRule(rule);
  const layer = layerMap[nodeType] ?? 3;

  const reactantGraphs = parseSpeciesGraphs(rule.reactants);
  const productGraphs = parseSpeciesGraphs(rule.products);

  const producedSpecies = productGraphs.map((graph) => canonicalizeSpecies(graph.toString()));
  const consumedSpecies = reactantGraphs.map((graph) => canonicalizeSpecies(graph.toString()));

  return {
    id,
    displayName,
    nodeType,
    layer,
    producedSpecies,
    consumedSpecies,
  };
};

const speciesOverlap = (speciesA: string, speciesB: string): boolean => {
  const normA = normalize(speciesA);
  const normB = normalize(speciesB);
  return normA === normB || normA.includes(normB) || normB.includes(normA);
};

export const buildRuleFlowGraph = (
  rules: ReactionRule[],
  options: RuleFlowBuilderOptions = {},
): RuleFlowGraph => {
  const summaries = rules.map((rule, index) => summarizeRule(rule, index, options));

  const nodes: RuleFlowNode[] = summaries.map((summary) => ({
    id: summary.id,
    displayName: summary.displayName,
    type: summary.nodeType,
    layer: summary.layer,
    color: colorFromName(summary.displayName),
  }));

  const edges: RuleFlowEdge[] = [];
  const edgeKeySet = new Set<string>();

  summaries.forEach((sourceSummary, sourceIndex) => {
    summaries.forEach((targetSummary, targetIndex) => {
      if (sourceIndex === targetIndex) {
        return;
      }

      const shared: string[] = [];

      sourceSummary.producedSpecies.forEach((produced) => {
        targetSummary.consumedSpecies.forEach((consumed) => {
          if (speciesOverlap(produced, consumed)) {
            shared.push(produced);
          }
        });
      });

      if (shared.length === 0) {
        return;
      }

      const edgeKey = `${sourceSummary.id}->${targetSummary.id}`;
      if (edgeKeySet.has(edgeKey)) {
        return;
      }
      edgeKeySet.add(edgeKey);
      edges.push({
        from: sourceSummary.id,
        to: targetSummary.id,
        producedSpecies: Array.from(new Set(shared)),
      });
    });
  });

  return { nodes, edges };
};
