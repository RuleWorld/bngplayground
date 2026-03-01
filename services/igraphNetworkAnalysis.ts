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

// ---- helpers ---------------------------------------------------------------

/**
 * Extract all molecule-type names from a BNGL pattern string.
 * e.g. "A(b!1).B(a!1,c~p)" → ["A", "B"]
 */
function extractMoleculeNames(pattern: string): string[] {
  const names: string[] = [];
  // Molecule names are C-identifier characters followed immediately by '('
  const re = /(?:^|\.)([A-Za-z_][A-Za-z0-9_]*)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pattern)) !== null) {
    names.push(m[1]);
  }
  return names;
}

// ---- Reaction graph (requires expanded model.reactions) --------------------

export function buildReactionGraph(model: BNGLModel): NetworkAnalysisPayload {
  const speciesNames = model.species.map((s) => s.name);
  const speciesIndex = new Map<string, number>();
  speciesNames.forEach((name, idx) => speciesIndex.set(name, idx));

  const edgeSet = new Set<string>();
  const edges: Array<{ from: number; to: number }> = [];

  for (const rxn of model.reactions) {
    for (const reactant of rxn.reactants) {
      const rIdx = speciesIndex.get(reactant);
      if (rIdx === undefined) continue;
      for (const product of rxn.products) {
        const pIdx = speciesIndex.get(product);
        if (pIdx === undefined) continue;
        if (rIdx === pIdx) continue; // skip self-loops
        const key = `${rIdx}->${pIdx}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ from: rIdx, to: pIdx });
        }
      }
    }
  }

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
  const molNames = model.moleculeTypes.map((m) => m.name);
  const molIndex = new Map<string, number>(molNames.map((n, i) => [n, i]));

  const edgeSet = new Set<string>();
  const edges: Array<{ from: number; to: number }> = [];

  for (const rule of model.reactionRules) {
    // Molecule types exclusively in reactants (left-hand side only)
    const lhsMols = new Set<number>();
    for (const pat of rule.reactants) {
      for (const name of extractMoleculeNames(pat)) {
        const idx = molIndex.get(name);
        if (idx !== undefined) lhsMols.add(idx);
      }
    }
    const rhsMols = new Set<number>();
    for (const pat of rule.products) {
      for (const name of extractMoleculeNames(pat)) {
        const idx = molIndex.get(name);
        if (idx !== undefined) rhsMols.add(idx);
      }
    }

    // Edge: LHS mol → RHS mol that is different (regulatory influence)
    for (const lhs of lhsMols) {
      for (const rhs of rhsMols) {
        if (lhs === rhs) continue;
        const key = `${lhs}->${rhs}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ from: lhs, to: rhs });
        }
      }
    }
  }

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
      return buildReactionGraph(model);
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
