/**
 * Model Comparison — adjacency matrix diff of two contact maps.
 *
 * Ported from RuleBender's CoMoDifference.java:
 * 1. Build adjacency matrices from two models' contact maps
 * 2. Diff them to find added, removed, and shared connections
 */

export interface ContactMapAdjacency {
  /** Ordered list of element labels (molecules + "Mol.Comp" keys) */
  labels: string[];
  /** labels[i] -> labels[j] -> true if connected */
  matrix: boolean[][];
}

export interface DiffEntry {
  source: string;
  target: string;
  status: 'added' | 'removed' | 'shared';
}

export interface ModelComparisonResult {
  /** Labels from the union of both models */
  labels: string[];
  diffs: DiffEntry[];
  /** Summary counts */
  summary: {
    shared: number;
    addedInB: number;
    removedFromA: number;
    totalA: number;
    totalB: number;
  };
}

/**
 * Build an adjacency from a ContactMap structure.
 * Contact map nodes have types "molecule", "component", "state".
 * Edges connect components.
 */
import type { ContactMap } from '../../types/visualization';

export function buildAdjacencyMatrix(contactMap: ContactMap): ContactMapAdjacency {
  // Collect unique labels: molecule nodes + component nodes as "Mol.Comp"
  const labelSet = new Set<string>();
  const nodeIdToLabel = new Map<string, string>();
  const nodeParents = new Map<string, string>(); // node id -> parent label

  for (const node of contactMap.nodes) {
    if (node.type === 'molecule') {
      labelSet.add(node.label);
      nodeIdToLabel.set(node.id, node.label);
    }
  }

  for (const node of contactMap.nodes) {
    if (node.type === 'component' && node.parent) {
      const parentLabel = nodeIdToLabel.get(node.parent);
      if (parentLabel) {
        const compLabel = `${parentLabel}.${node.label}`;
        labelSet.add(compLabel);
        nodeIdToLabel.set(node.id, compLabel);
        nodeParents.set(node.id, parentLabel);
      }
    }
  }

  const labels = Array.from(labelSet).sort();
  const labelIdx = new Map<string, number>();
  labels.forEach((l, i) => labelIdx.set(l, i));

  // Build adjacency
  const n = labels.length;
  const matrix: boolean[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => false),
  );

  // Component membership: molecule contains component
  for (const [nodeId, parentLabel] of nodeParents) {
    const compLabel = nodeIdToLabel.get(nodeId);
    if (compLabel) {
      const pi = labelIdx.get(parentLabel);
      const ci = labelIdx.get(compLabel);
      if (pi !== undefined && ci !== undefined) {
        matrix[pi][ci] = true;
        matrix[ci][pi] = true;
      }
    }
  }

  // Bond edges between components
  for (const edge of contactMap.edges) {
    const srcLabel = nodeIdToLabel.get(edge.from);
    const tgtLabel = nodeIdToLabel.get(edge.to);
    if (srcLabel && tgtLabel) {
      const si = labelIdx.get(srcLabel);
      const ti = labelIdx.get(tgtLabel);
      if (si !== undefined && ti !== undefined) {
        matrix[si][ti] = true;
        matrix[ti][si] = true;
      }
    }
  }

  return { labels, matrix };
}

/**
 * Compare two adjacency matrices and produce a diff.
 */
export function compareModels(
  a: ContactMapAdjacency,
  b: ContactMapAdjacency,
): ModelComparisonResult {
  // Union of labels
  const allLabels = Array.from(
    new Set([...a.labels, ...b.labels]),
  ).sort();

  const aIdx = new Map<string, number>();
  a.labels.forEach((l, i) => aIdx.set(l, i));
  const bIdx = new Map<string, number>();
  b.labels.forEach((l, i) => bIdx.set(l, i));

  const diffs: DiffEntry[] = [];
  let shared = 0, addedInB = 0, removedFromA = 0;

  for (let i = 0; i < allLabels.length; i++) {
    for (let j = i + 1; j < allLabels.length; j++) {
      const srcLabel = allLabels[i];
      const tgtLabel = allLabels[j];

      const ai = aIdx.get(srcLabel);
      const aj = aIdx.get(tgtLabel);
      const bi = bIdx.get(srcLabel);
      const bj = bIdx.get(tgtLabel);

      const inA = ai !== undefined && aj !== undefined && a.matrix[ai][aj];
      const inB = bi !== undefined && bj !== undefined && b.matrix[bi][bj];

      if (inA && inB) {
        diffs.push({ source: srcLabel, target: tgtLabel, status: 'shared' });
        shared++;
      } else if (inA && !inB) {
        diffs.push({ source: srcLabel, target: tgtLabel, status: 'removed' });
        removedFromA++;
      } else if (!inA && inB) {
        diffs.push({ source: srcLabel, target: tgtLabel, status: 'added' });
        addedInB++;
      }
    }
  }

  // Count total edges
  const countEdges = (m: ContactMapAdjacency) => {
    let count = 0;
    for (let i = 0; i < m.labels.length; i++) {
      for (let j = i + 1; j < m.labels.length; j++) {
        if (m.matrix[i][j]) count++;
      }
    }
    return count;
  };

  return {
    labels: allLabels,
    diffs,
    summary: {
      shared,
      addedInB,
      removedFromA,
      totalA: countEdges(a),
      totalB: countEdges(b),
    },
  };
}
