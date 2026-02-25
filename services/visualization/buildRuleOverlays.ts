/**
 * Build Rule Overlays from parsed BNGL model data.
 *
 * Port of RuleBender's CMapModelBuilder.foundRule() + VisualRule.pack():
 * - Walk reactant and product SpeciesGraphs to collect all components
 * - Use extractBonds() to find bond pairs on each side
 * - Use detectStateChanges() to find state changes (center)
 * - Classify into center (what changes) vs context (what is tested)
 *
 * Reuses existing infrastructure:
 *   - parseSpeciesGraphs() from speciesGraphUtils.ts
 *   - extractBonds() from speciesGraphUtils.ts
 *   - detectStateChanges() from speciesGraphUtils.ts
 */

import type { ReactionRule, BNGLMoleculeType } from '../../types';
import type { BondInfo } from './speciesGraphUtils';
import {
  parseSpeciesGraphs,
  extractBonds,
  detectStateChanges,
} from './speciesGraphUtils';
import type { RuleOverlay } from './ruleOverlay';

/**
 * For each reaction rule, determine which contact map elements are in the
 * "center" (modified) vs "context" (tested but unchanged).
 */
export function buildRuleOverlays(
  rules: ReactionRule[],
  moleculeTypes: BNGLMoleculeType[] = [],
): RuleOverlay[] {
  return rules.map((rule, ruleIndex) =>
    buildSingleOverlay(rule, ruleIndex),
  );
}

function buildSingleOverlay(
  rule: ReactionRule,
  ruleIndex: number,
): RuleOverlay {
  const ruleName = rule.name ?? `Rule ${ruleIndex + 1}`;
  const ruleExpression = [
    rule.reactants.join(' + '),
    rule.isBidirectional ? '<->' : '->',
    rule.products.join(' + '),
  ].join(' ');

  const overlay: RuleOverlay = {
    ruleIndex,
    ruleName,
    ruleExpression,
    center: {
      stateChanges: new Set(),
      bondsAdded: [],
      bondsRemoved: [],
      moleculesAdded: new Set(),
      moleculesRemoved: new Set(),
    },
    context: {
      testedComponents: new Set(),
      requiredBonds: [],
      testedStates: new Set(),
    },
    productContext: {
      testedComponents: new Set(),
      requiredBonds: [],
      testedStates: new Set(),
    },
  };

  // Filter out null molecule '0' before parsing — the BNGL parser rejects it
  const validReactants = rule.reactants.filter(r => r.trim() !== '0');
  const validProducts = rule.products.filter(p => p.trim() !== '0');

  const reactantGraphs = parseSpeciesGraphs(validReactants);
  const productGraphs = parseSpeciesGraphs(validProducts);

  const sanitize = (name: string) => name.split('.')[0];

  // --- Collect CONTEXT: all components appearing in reactant patterns ---
  for (const graph of reactantGraphs) {
    for (const mol of graph.molecules) {
      if (mol.name === '0') continue;
      const molName = sanitize(mol.name);
      for (const comp of mol.components) {
        const key = `${molName}.${comp.name}`;
        overlay.context.testedComponents.add(key);
        if (comp.state && comp.state !== '?' && comp.state !== '*') {
          overlay.context.testedStates.add(`${key}~${comp.state}`);
        }
      }
    }
  }

  // --- Collect PRODUCT CONTEXT: all components appearing in product patterns ---
  // Used as the "context" when this rule is treated as a reverse-rule target.
  for (const graph of productGraphs) {
    for (const mol of graph.molecules) {
      if (mol.name === '0') continue;
      const molName = sanitize(mol.name);
      for (const comp of mol.components) {
        const key = `${molName}.${comp.name}`;
        overlay.productContext.testedComponents.add(key);
        if (comp.state && comp.state !== '?' && comp.state !== '*') {
          overlay.productContext.testedStates.add(`${key}~${comp.state}`);
        }
      }
    }
  }

  // --- Find BONDS on each side ---
  const reactantBonds = extractBonds(reactantGraphs);
  const productBonds = extractBonds(productGraphs);

  // Bonds in reactants but not products → REMOVED (center)
  // Bonds in both → PRESERVED (context)
  for (const [key, bondInfo] of reactantBonds) {
    if (!productBonds.has(key)) {
      overlay.center.bondsRemoved.push(
        bondPairFromInfo(bondInfo),
      );
    } else {
      const pair = bondPairFromInfo(bondInfo);
      overlay.context.requiredBonds.push(pair);
      overlay.productContext.requiredBonds.push(pair);
    }
  }

  // Bonds in products but not reactants → ADDED (center)
  for (const [key, bondInfo] of productBonds) {
    if (!reactantBonds.has(key)) {
      overlay.center.bondsAdded.push(
        bondPairFromInfo(bondInfo),
      );
    }
  }

  // --- Detect STATE CHANGES (center) ---
  const stateChanges = detectStateChanges(reactantGraphs, productGraphs);
  for (const sc of stateChanges) {
    const key = `${sanitize(sc.molecule)}.${sc.component}`;
    overlay.center.stateChanges.add(key);
  }

  // --- Detect SYNTHESIS / DEGRADATION ---
  if (rule.reactants.length === 1 && rule.reactants[0] === '0') {
    // Synthesis: 0 -> Products
    for (const graph of productGraphs) {
      for (const mol of graph.molecules) {
        if (mol.name !== '0') {
          overlay.center.moleculesAdded.add(sanitize(mol.name));
        }
      }
    }
  } else if (rule.products.length === 1 && rule.products[0] === '0') {
    // Degradation: Reactants -> 0
    for (const graph of reactantGraphs) {
      for (const mol of graph.molecules) {
        if (mol.name !== '0') {
          overlay.center.moleculesRemoved.add(sanitize(mol.name));
        }
      }
    }
  } else {
    // Check for unmatched molecules (synthesis/degradation fragments)
    const reactantMolCounts = countMolecules(reactantGraphs, sanitize);
    const productMolCounts = countMolecules(productGraphs, sanitize);

    for (const [mol, count] of productMolCounts) {
      const rCount = reactantMolCounts.get(mol) ?? 0;
      if (count > rCount) {
        overlay.center.moleculesAdded.add(mol);
      }
    }
    for (const [mol, count] of reactantMolCounts) {
      const pCount = productMolCounts.get(mol) ?? 0;
      if (count > pCount) {
        overlay.center.moleculesRemoved.add(mol);
      }
    }
  }

  // --- Remove center elements from context ---
  // Center takes priority, mirroring VisualRule.pack() logic:
  //   "if(!center.containsItem(...)) { context.addItem(...) }"
  for (const sc of overlay.center.stateChanges) {
    overlay.context.testedComponents.delete(sc);
  }
  for (const [a, b] of overlay.center.bondsAdded) {
    overlay.context.testedComponents.delete(a);
    overlay.context.testedComponents.delete(b);
  }
  for (const [a, b] of overlay.center.bondsRemoved) {
    overlay.context.testedComponents.delete(a);
    overlay.context.testedComponents.delete(b);
  }
  for (const mol of overlay.center.moleculesAdded) {
    // Collect keys first to avoid mutating the Set during iteration (V8 can skip entries)
    const toRemove = [...overlay.context.testedComponents].filter(k => k.startsWith(`${mol}.`));
    toRemove.forEach(k => overlay.context.testedComponents.delete(k));
  }
  for (const mol of overlay.center.moleculesRemoved) {
    const toRemove = [...overlay.context.testedComponents].filter(k => k.startsWith(`${mol}.`));
    toRemove.forEach(k => overlay.context.testedComponents.delete(k));
  }

  return overlay;
}

function bondPairFromInfo(info: BondInfo): [string, string] {
  return [`${info.mol1}.${info.comp1}`, `${info.mol2}.${info.comp2}`];
}

function countMolecules(
  graphs: ReturnType<typeof parseSpeciesGraphs>,
  sanitize: (name: string) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const graph of graphs) {
    for (const mol of graph.molecules) {
      if (mol.name === '0') continue;
      const name = sanitize(mol.name);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return counts;
}
