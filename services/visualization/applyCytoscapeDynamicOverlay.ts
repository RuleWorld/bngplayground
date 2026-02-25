/**
 * Apply dynamic simulation data to an existing Cytoscape contact map.
 *
 * Port of RuleBender's SmallMultiple.java — annotates contact map elements
 * with time-varying simulation data.
 *
 * Modes:
 * - 'abundance': node opacity/border-width scale with molecule abundance
 * - 'state': state nodes colored by fractional occupancy (heatmap)
 */

import cytoscape from 'cytoscape';
import type { ContactMapSnapshot } from './dynamicContactMap';

export function applyCytoscapeDynamicOverlay(
  cy: cytoscape.Core,
  snapshot: ContactMapSnapshot | null,
): void {
  // Reset all dynamic styles using removeStyle for proper Cytoscape cleanup
  cy.nodes().removeStyle('background-opacity border-width background-color');
  cy.edges().removeStyle('width opacity');

  if (!snapshot) return;

  // Find max abundance for normalization
  let maxAbundance = 0;
  for (const val of snapshot.moleculeAbundance.values()) {
    maxAbundance = Math.max(maxAbundance, val);
  }
  if (maxAbundance === 0) maxAbundance = 1;

  // Apply molecule abundance: scale opacity and border width
  cy.nodes().forEach(node => {
    const label = node.data('label') as string;
    const type = node.data('type') as string;

    if (type === 'molecule' && label) {
      const abundance = snapshot.moleculeAbundance.get(label) ?? 0;
      const normalizedAbundance = abundance / maxAbundance;

      // Opacity from 0.15 (very low) to 1.0 (max)
      const opacity = 0.15 + normalizedAbundance * 0.85;
      // Border width from 1 (min) to 4 (max)
      const borderWidth = 1 + normalizedAbundance * 3;

      node.style({
        'background-opacity': opacity,
        'border-width': borderWidth,
      });

      // Also scale children opacity
      node.descendants().style({
        'background-opacity': opacity,
      });
    }

    // State nodes: color by fractional occupancy
    if (type === 'state' && label) {
      // Reconstruct the Mol.Comp~State key
      const parentComp = node.parent();
      const parentMol = parentComp.parent();
      if (parentComp.length > 0 && parentMol.length > 0) {
        const molName = parentMol.data('label');
        const compName = parentComp.data('label');
        const stateKey = `${molName}.${compName}~${label}`;
        const fraction = snapshot.stateFractions.get(stateKey);

        if (fraction !== undefined) {
          // Heatmap: low fraction = cool blue, high fraction = warm red
          const r = Math.round(fraction * 220 + 30);
          const g = Math.round((1 - fraction) * 100 + 50);
          const b = Math.round((1 - fraction) * 220 + 30);
          node.style({
            'background-color': `rgb(${r},${g},${b})`,
            'background-opacity': 0.5 + fraction * 0.5,
          });
        }
      }
    }
  });

  // Apply bond occupancy to edges
  cy.edges().forEach(edge => {
    const sourceLabel = cy.getElementById(edge.data('source'));
    const targetLabel = cy.getElementById(edge.data('target'));

    if (sourceLabel.length > 0 && targetLabel.length > 0) {
      const srcMol = sourceLabel.parent().data('label') ?? '';
      const srcComp = sourceLabel.data('label') ?? '';
      const tgtMol = targetLabel.parent().data('label') ?? '';
      const tgtComp = targetLabel.data('label') ?? '';

      const key = [`${srcMol}.${srcComp}`, `${tgtMol}.${tgtComp}`].sort().join('--');
      const occupancy = snapshot.bondOccupancy.get(key);

      if (occupancy !== undefined) {
        // Width from 1 (no bond) to 4 (fully occupied)
        const width = 1 + occupancy * 3;
        const opacity = 0.2 + occupancy * 0.8;
        edge.style({ width, opacity });
      }
    }
  });
}

/** Cytoscape styles for dynamic overlay (added to stylesheet) */
export const dynamicOverlayStyles: cytoscape.Stylesheet[] = [
  {
    selector: '.dynamic-active',
    style: {
      'transition-property': 'background-opacity, border-width, width, opacity',
      'transition-duration': 200,
    },
  },
];
