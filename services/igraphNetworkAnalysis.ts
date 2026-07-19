/**
 * igraphNetworkAnalysis.ts
 *
 * Converts a BNGLModel into a graph payload suitable for igraph WASM analysis.
 * Supports three graph types:
 *
 *   'reaction'  – Directed species interaction graph. nodes = species,
 *                 edges from reactants → products for each enumerated reaction.
 *                 Requires model.reactions (expanded network).
 *
 *   'molecular' – Undirected molecule-type contact map. nodes = moleculeTypes,
 *                 edges between any two molecule types that co-appear in the same
 *                 reaction rule pattern. Available without network expansion.
 *
 *   'regulatory'– Directed rule-level influence graph. nodes = moleculeTypes,
 *                 directed edge A→B if molecule type A appears only in the left-hand
 *                 side of a rule (consumed/modifiable) and B appears only in the
 *                 right-hand side (produced/modified). Approximates a regulatory graph.
 */

import type { BNGLModel, NetworkAnalysisPayload } from '../types';
import { extractMoleculeNames, buildDirectedReactionGraph, type DirectedEdge } from '@bngplayground/engine';

// ---- helpers ---------------------------------------------------------------

/**
 * Map neutral (string-keyed) directed edges from the shared reaction-graph
 * primitive to igraph index edges, dropping endpoints absent from the node
 * index and any self-loops.
 */
function toIndexedEdges(
  edges: DirectedEdge[],
  index: Map<string, number>,
): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = [];
  for (const e of edges) {
    const from = index.get(e.from);
    const to = index.get(e.to);
    if (from === undefined || to === undefined || from === to) continue;
    out.push({ from, to });
  }
  return out;
}

// ---- Reaction graph (requires expanded model.reactions) --------------------

export function buildSpeciesReactionGraph(model: BNGLModel): NetworkAnalysisPayload {
  // Species-level instance of the shared directed reactant->product primitive:
  // nodes are species (identity mapping), edges are unlabelled.
  const speciesNames = model.species.map((s) => s.name);
  const speciesIndex = new Map<string, number>(speciesNames.map((n, i) => [n, i]));
  const edges = toIndexedEdges(buildDirectedReactionGraph(model.reactions), speciesIndex);

  return {
    edges,
    nodeLabels: speciesNames,
    directed: true,
    graphType: 'reaction',
  };
}

// ---- Molecular contact map (always available) ------------------------------

export function buildMolecularGraph(model: BNGLModel): NetworkAnalysisPayload {
  const molNames = model.moleculeTypes.map((m) => m.name);
  const molIndex = new Map<string, number>(molNames.map((n, i) => [n, i]));

  const edgeSet = new Set<string>();
  const edges: Array<{ from: number; to: number }> = [];

  const processPattern = (patterns: string[]) => {
    const inPattern: number[] = [];
    for (const pattern of patterns) {
      for (const name of extractMoleculeNames(pattern)) {
        const idx = molIndex.get(name);
        if (idx !== undefined && !inPattern.includes(idx)) {
          inPattern.push(idx);
        }
      }
    }
    // Connect all pairs (undirected — store as from < to)
    for (let i = 0; i < inPattern.length; i++) {
      for (let j = i + 1; j < inPattern.length; j++) {
        const a = Math.min(inPattern[i], inPattern[j]);
        const b = Math.max(inPattern[i], inPattern[j]);
        const key = `${a}-${b}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ from: a, to: b });
        }
      }
    }
  };

  for (const rule of model.reactionRules) {
    processPattern([...rule.reactants, ...rule.products]);
  }
  // Also include expanded reactions if available
  if (model.reactions.length > 0 && model.moleculeTypes.length > 1) {
    for (const rxn of model.reactions) {
      processPattern([...rxn.reactants, ...rxn.products]);
    }
  }

  return {
    edges,
    nodeLabels: molNames,
    directed: false,
    graphType: 'molecular',
  };
}

// ---- Regulatory influence graph --------------------------------------------

export function buildRegulatoryGraph(model: BNGLModel): NetworkAnalysisPayload {
  // Molecule-level instance of the shared directed reactant->product primitive
  // over rules: nodes are molecule types (extracted from patterns), unlabelled.
  const molNames = model.moleculeTypes.map((m) => m.name);
  const molIndex = new Map<string, number>(molNames.map((n, i) => [n, i]));
  const edges = toIndexedEdges(
    buildDirectedReactionGraph(model.reactionRules, { nodesOf: extractMoleculeNames }),
    molIndex,
  );

  return {
    edges,
    nodeLabels: molNames,
    directed: true,
    graphType: 'regulatory',
  };
}

// ---- top-level dispatch ----------------------------------------------------

/**
 * Build a NetworkAnalysisPayload for the requested graph type.
 * Throws if the required data is not available (e.g. 'reaction' without expansion).
 */
export function buildGraphPayload(
  model: BNGLModel,
  graphType: NetworkAnalysisPayload['graphType'],
): NetworkAnalysisPayload {
  switch (graphType) {
    case 'reaction':
      if (model.reactions.length === 0) {
        throw new Error(
          'Reaction graph requires network expansion (generate_network). ' +
            'No reactions found in the current model.',
        );
      }
      return buildSpeciesReactionGraph(model);
    case 'molecular':
      if (model.moleculeTypes.length === 0) {
        throw new Error('Molecular graph requires at least one molecule type.');
      }
      return buildMolecularGraph(model);
    case 'regulatory':
      if (model.moleculeTypes.length === 0) {
        throw new Error('Regulatory graph requires at least one molecule type.');
      }
      return buildRegulatoryGraph(model);
  }
}
