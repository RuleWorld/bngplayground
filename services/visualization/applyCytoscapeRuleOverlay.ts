/**
 * Apply rule overlay highlighting to an existing Cytoscape contact map.
 *
 * Port of RuleBender's VisualRule.pack() which assigns nodes to center
 * (red) and context (blue) aggregate bubbles.
 *
 * Strategy:
 * 1. Dim all elements
 * 2. Highlight CENTER elements (bonds added/removed, state changes) in red
 * 3. Highlight CONTEXT elements (tested components, preserved bonds) in blue
 * 4. Un-dim parent molecule nodes for any highlighted child
 */

import cytoscape from 'cytoscape';
import type { RuleOverlay } from './ruleOverlay';

/**
 * Apply rule overlay highlighting to a Cytoscape contact map instance.
 *
 * The contact map builder creates nodes with these data attributes:
 *   - Molecule nodes: id is numeric string, label is molecule name
 *   - Component nodes: id is "molIdx.compIdx", label is component name,
 *     parent is molecule id
 *   - State nodes: id is "molIdx.compIdx.stateIdx", label is state name,
 *     parent is component id
 *   - Edges: from/to are component node ids
 *
 * We need to reverse-map "Mol.Comp" keys from RuleOverlay back to these
 * numeric IDs using node labels.
 */
export function applyCytoscapeRuleOverlay(
  cy: cytoscape.Core,
  overlay: RuleOverlay | null,
): void {
  // Reset all elements to default
  cy.elements().removeClass('rule-center rule-context rule-dimmed');

  if (!overlay) return;

  // Build reverse lookup: moleculeName -> molecule node id
  const molNameToId = new Map<string, string>();
  cy.nodes().forEach(node => {
    const nodeData = node.data();
    // Molecule nodes have no '.' in their id and type 'molecule' or are
    // group parents. In the contact map builder, molecule ids are numeric
    // strings (0, 1, 2...) and their label is the molecule name.
    if (
      !nodeData.id.includes('.') &&
      nodeData.label &&
      !nodeData.id.startsWith('compartment_')
    ) {
      molNameToId.set(nodeData.label, nodeData.id);
    }
  });

  // Build reverse lookup: "Mol.Comp" -> component node(s)
  // A component node's parent is a molecule node, and its label is the
  // component name.
  const molCompToNodes = new Map<string, cytoscape.NodeCollection>();
  cy.nodes().forEach(node => {
    const nodeData = node.data();
    if (nodeData.parent && nodeData.label) {
      // Find parent molecule label
      const parentNode = cy.getElementById(nodeData.parent);
      const parentLabel = parentNode.data('label');
      if (parentLabel) {
        const key = `${parentLabel}.${nodeData.label}`;
        const existing = molCompToNodes.get(key);
        if (existing) {
          molCompToNodes.set(key, existing.union(node));
        } else {
          molCompToNodes.set(key, cy.collection().union(node));
        }
      }
    }
  });

  // Dim everything first
  cy.elements().addClass('rule-dimmed');

  // --- Highlight CENTER elements ---

  // State changes: find component nodes by Mol.Comp key
  for (const key of overlay.center.stateChanges) {
    const nodes = molCompToNodes.get(key);
    if (nodes) {
      highlightCenter(cy, nodes);
    }
  }

  // Bonds added/removed: find edges between component nodes
  const allCenterBonds = [
    ...overlay.center.bondsAdded,
    ...overlay.center.bondsRemoved,
  ];
  for (const [src, tgt] of allCenterBonds) {
    const srcNodes = molCompToNodes.get(src);
    const tgtNodes = molCompToNodes.get(tgt);
    if (srcNodes && tgtNodes) {
      highlightCenter(cy, srcNodes);
      highlightCenter(cy, tgtNodes);
      // Find edges between them
      srcNodes.edgesWith(tgtNodes)
        .removeClass('rule-dimmed')
        .addClass('rule-center');
    }
  }

  // Molecules added/removed: highlight entire molecule group
  const allCenterMols = [
    ...overlay.center.moleculesAdded,
    ...overlay.center.moleculesRemoved,
  ];
  for (const mol of allCenterMols) {
    const molId = molNameToId.get(mol);
    if (molId) {
      const molNode = cy.getElementById(molId);
      molNode.removeClass('rule-dimmed').addClass('rule-center');
      // Also highlight children
      molNode.descendants()
        .removeClass('rule-dimmed')
        .addClass('rule-center');
    }
  }

  // --- Highlight CONTEXT elements ---

  for (const key of overlay.context.testedComponents) {
    const nodes = molCompToNodes.get(key);
    if (nodes) {
      // Only context if not already center
      highlightContext(cy, nodes);
    }
  }

  for (const [src, tgt] of overlay.context.requiredBonds) {
    const srcNodes = molCompToNodes.get(src);
    const tgtNodes = molCompToNodes.get(tgt);
    if (srcNodes && tgtNodes) {
      highlightContext(cy, srcNodes);
      highlightContext(cy, tgtNodes);
      srcNodes.edgesWith(tgtNodes)
        .filter(':not(.rule-center)')
        .removeClass('rule-dimmed')
        .addClass('rule-context');
    }
  }

  // Un-dim parent molecule aggregates for anything highlighted
  cy.nodes('.rule-center, .rule-context').forEach(node => {
    const parent = node.parent();
    if (parent.length > 0) {
      parent.removeClass('rule-dimmed');
      // Also un-dim grandparent (compartment or molecule)
      const grandparent = parent.parent();
      if (grandparent.length > 0) {
        grandparent.removeClass('rule-dimmed');
      }
    }
  });
}

function highlightCenter(
  cy: cytoscape.Core,
  nodes: cytoscape.NodeCollection,
): void {
  nodes.removeClass('rule-dimmed').addClass('rule-center');
  // Also highlight children (state nodes under component)
  nodes.descendants()
    .removeClass('rule-dimmed')
    .addClass('rule-center');
}

function highlightContext(
  cy: cytoscape.Core,
  nodes: cytoscape.NodeCollection,
): void {
  nodes
    .filter(':not(.rule-center)')
    .removeClass('rule-dimmed')
    .addClass('rule-context');
  // Also highlight children
  nodes.descendants()
    .filter(':not(.rule-center)')
    .removeClass('rule-dimmed')
    .addClass('rule-context');
}

/** Cytoscape stylesheet entries for rule overlay classes */
export const ruleOverlayStyles: cytoscape.Stylesheet[] = [
  {
    selector: 'node.rule-center',
    style: {
      'border-color': '#e74c3c',
      'border-width': 3,
      'background-color': '#fdedec',
      'z-index': 10,
    },
  },
  {
    selector: 'node.rule-center:parent',
    style: {
      'border-color': '#e74c3c',
      'border-width': 3,
      'background-color': '#fcf0f0',
      'background-opacity': 0.4,
    },
  },
  {
    selector: 'edge.rule-center',
    style: {
      'line-color': '#e74c3c',
      'width': 3,
      'z-index': 10,
    },
  },
  {
    selector: 'node.rule-context',
    style: {
      'border-color': '#3498db',
      'border-width': 2,
      'background-color': '#eaf2f8',
      'z-index': 5,
    },
  },
  {
    selector: 'node.rule-context:parent',
    style: {
      'border-color': '#3498db',
      'border-width': 2,
      'background-color': '#eef6fc',
      'background-opacity': 0.3,
    },
  },
  {
    selector: 'edge.rule-context',
    style: {
      'line-color': '#3498db',
      'width': 2,
      'line-style': 'dashed',
      'z-index': 5,
    },
  },
  {
    selector: '.rule-dimmed',
    style: {
      'opacity': 0.15,
    },
  },
];
