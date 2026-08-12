/**
 * ContactMapReachability.ts
 * Layer 1: Fast, over-approximate reachability analysis via contact map BFS.
 *
 * The contact map is a static abstraction of which molecule types can bind
 * to each other through which components, derived from the reaction rules.
 * This layer does NOT expand species — it only checks if the binding
 * topology required by a target pattern is structurally possible.
 */

import type { BNGLMoleculeType } from '../../types';
import {
    parseMoleculeTokens,
    extractMoleculeNames,
    extractBindingRequirements,
} from '../patterns/patternTokens';

/* ---------- Contact-map types ---------- */

export interface ContactNode {
  moleculeType: string;
  component: string;
  states?: string[];
}

export interface ContactEdge {
  source: { moleculeType: string; component: string };
  target: { moleculeType: string; component: string };
  ruleNames: string[];
}

export interface ContactMap {
  nodes: ContactNode[];
  edges: ContactEdge[];
}


/* ---------- Contact-map adjacency ---------- */

type AdjKey = string; // "MolType.Component"

function adjKey(molType: string, component: string): AdjKey {
  return `${molType}.${component}`;
}

/**
 * Build an adjacency list from contact map edges for BFS traversal.
 * Each key is "MolType.Component" and values are the connected "MolType.Component" entries.
 */
function buildAdjacency(contactMap: ContactMap): Map<AdjKey, Set<AdjKey>> {
  const adj = new Map<AdjKey, Set<AdjKey>>();

  const ensureKey = (k: AdjKey) => {
    if (!adj.has(k)) adj.set(k, new Set());
  };

  for (const edge of contactMap.edges) {
    const srcKey = adjKey(edge.source.moleculeType, edge.source.component);
    const tgtKey = adjKey(edge.target.moleculeType, edge.target.component);
    ensureKey(srcKey);
    ensureKey(tgtKey);
    adj.get(srcKey)!.add(tgtKey);
    adj.get(tgtKey)!.add(srcKey);
  }

  return adj;
}

/**
 * Build a set of molecule types that are reachable from a given molecule type
 * via the contact map edges (BFS over molecule-level connectivity).
 */
function reachableMoleculeTypes(
  contactMap: ContactMap,
  startMolType: string
): Set<string> {
  const adj = buildAdjacency(contactMap);
  const visited = new Set<string>();
  const queue: string[] = [startMolType];
  let qHead = 0;
  visited.add(startMolType);

  while (qHead < queue.length) {
    const current = queue[qHead++];
    // Find all edges from any component of `current`
    for (const [key, neighbors] of adj) {
      const dotIdx = key.indexOf('.');
      const molType = dotIdx !== -1 ? key.substring(0, dotIdx) : key;
      if (molType !== current) continue;
      for (const neighborKey of neighbors) {
        const dotIdx2 = neighborKey.indexOf('.');
        const neighborMol = dotIdx2 !== -1 ? neighborKey.substring(0, dotIdx2) : neighborKey;
        if (!visited.has(neighborMol)) {
          visited.add(neighborMol);
          queue.push(neighborMol);
        }
      }
    }
  }

  return visited;
}

/* ---------- Public API ---------- */

/**
 * Checks if a BNGL pattern is abstractly reachable using Layer 1 contact-map analysis.
 *
 * This function performs a fast, static, over-approximate reachability check on the model's
 * contact map to determine if the target pattern is topologically and structurally possible.
 *
 * Specifically, it executes the following sequence of validations:
 * 1. Checks that every molecule type referenced in the query pattern exists among the model's
 *    declared molecule types. If any type is undeclared, it immediately returns `reachable: false`
 *    and specifies the undeclared type in `missingEdges`.
 * 2. Parses and extracts all binding requirements (bonds) from the query pattern. If no bonds are
 *    specified, the pattern represents disconnected or single molecules, which are considered abstractly
 *    reachable (so long as their molecule types are declared).
 * 3. Compares each binding requirement against the contact map edges. It verifies whether an edge
 *    (in either forward or reverse direction) exists in the contact map connecting the specified
 *    molecule type component pairs. Any missing edges are accumulated and returned.
 * 4. Checks connectivity of the molecules within the pattern. If there are multiple molecule types,
 *    it performs a Breadth-First Search (BFS) starting from the first molecule type to ensure that
 *    every other molecule type in the pattern can be reached via contact-map connections.
 *
 * **Non-obvious Invariant**:
 * This is a pure mathematical and topological analysis function. It operates entirely on in-memory data
 * structures and must remain browser-API-free to ensure perfect portability across headless environments
 * (Node.js), Web Workers, and standard web preview clients.
 *
 * @param contactMap - The static contact map of nodes and edges derived from the model's reaction rules.
 * @param pattern - The target BNGL pattern string to evaluate (e.g., `"A(b!1).B(a!1)"`).
 * @param moleculeTypes - The array of declared molecule types in the BNGL model structure.
 * @returns An object indicating topological reachability:
 *  - `reachable`: A boolean indicating if the target pattern is structurally reachable.
 *  - `path`: (Optional) An array of molecule type names ordered by BFS discovery sequence when reachable.
 *  - `missingEdges`: (Optional) An array of missing component-to-component connections if unreachable.
 */
export function checkAbstractReachability(
  contactMap: ContactMap,
  pattern: string,
  moleculeTypes: BNGLMoleculeType[]
): {
  reachable: boolean;
  path?: string[];
  missingEdges?: Array<{ from: string; to: string }>;
} {
  // Step 1: Check all molecule types in pattern exist in declared types
  const patternMolNames = extractMoleculeNames(pattern);
  const declaredNames = new Set(moleculeTypes.map(mt => mt.name));
  for (const name of patternMolNames) {
    if (!declaredNames.has(name)) {
      return {
        reachable: false,
        missingEdges: [{ from: name, to: '(undeclared molecule type)' }],
      };
    }
  }

  // Step 2: Extract binding requirements
  const requirements = extractBindingRequirements(pattern);

  // If no binding requirements, the pattern is a single molecule or collection
  // of disconnected molecules — always abstractly reachable if types exist.
  if (requirements.length === 0) {
    return { reachable: true, path: [...new Set(patternMolNames)] };
  }

  // Step 3: Check each binding requirement against contact map edges
  const adj = buildAdjacency(contactMap);
  const missingEdges: Array<{ from: string; to: string }> = [];

  for (const req of requirements) {
    const srcKey = adjKey(req.mol1, req.comp1);
    const tgtKey = adjKey(req.mol2, req.comp2);

    const srcNeighbors = adj.get(srcKey);
    if (!srcNeighbors || !srcNeighbors.has(tgtKey)) {
      // Also check the reverse direction
      const tgtNeighbors = adj.get(tgtKey);
      if (!tgtNeighbors || !tgtNeighbors.has(srcKey)) {
        missingEdges.push({
          from: `${req.mol1}.${req.comp1}`,
          to: `${req.mol2}.${req.comp2}`,
        });
      }
    }
  }

  if (missingEdges.length > 0) {
    return { reachable: false, missingEdges };
  }

  // Step 4: BFS connectivity — check all molecule types in pattern are connected
  const uniqueMols = [...new Set(patternMolNames)];
  if (uniqueMols.length <= 1) {
    return { reachable: true, path: uniqueMols };
  }

  const reachableFromFirst = reachableMoleculeTypes(contactMap, uniqueMols[0]);
  for (const mol of uniqueMols) {
    if (!reachableFromFirst.has(mol)) {
      return {
        reachable: false,
        missingEdges: [{ from: uniqueMols[0], to: mol }],
      };
    }
  }

  // Build the path using BFS ordering
  const path: string[] = [];
  const visited = new Set<string>();
  const bfsQueue = [uniqueMols[0]];
  let bfsHead = 0;
  visited.add(uniqueMols[0]);

  while (bfsHead < bfsQueue.length) {
    const current = bfsQueue[bfsHead++];
    if (uniqueMols.includes(current)) {
      path.push(current);
    }
    for (const [key, neighbors] of adj) {
      const dotIdx = key.indexOf('.');
      const molType = dotIdx !== -1 ? key.substring(0, dotIdx) : key;
      if (molType !== current) continue;
      for (const neighborKey of neighbors) {
        const dotIdx2 = neighborKey.indexOf('.');
        const neighborMol = dotIdx2 !== -1 ? neighborKey.substring(0, dotIdx2) : neighborKey;
        if (!visited.has(neighborMol)) {
          visited.add(neighborMol);
          bfsQueue.push(neighborMol);
        }
      }
    }
  }

  return { reachable: true, path };
}

/**
 * Enumerate all abstractly reachable complexes up to a given size (number of molecules).
 *
 * Performs a DFS/BFS over the contact map to produce all connected sets of molecule types
 * up to `maxSize` molecules, respecting the binding topology.
 *
 * @param contactMap - The contact map
 * @param maxSize - Maximum number of molecules per complex (default: 4)
 * @returns Array of abstract complexes, each represented as an array of molecule type names
 */
export function enumerateAbstractComplexes(
  contactMap: ContactMap,
  maxSize: number = 4
): string[][] {
  // Gather all molecule types from nodes
  const allMolTypes = new Set<string>();
  for (const node of contactMap.nodes) {
    allMolTypes.add(node.moleculeType);
  }

  // Find which molecule types can bind to which (abstracting away component details)
  const molBindings = new Map<string, Set<string>>();
  for (const molType of allMolTypes) {
    molBindings.set(molType, new Set());
  }
  for (const edge of contactMap.edges) {
    const src = edge.source.moleculeType;
    const tgt = edge.target.moleculeType;
    if (molBindings.has(src)) molBindings.get(src)!.add(tgt);
    if (molBindings.has(tgt)) molBindings.get(tgt)!.add(src);
  }

  const results: string[][] = [];
  const sortedMolTypes = [...allMolTypes].sort();

  // Each molecule type alone is a valid complex of size 1
  for (const mt of sortedMolTypes) {
    results.push([mt]);
  }

  if (maxSize <= 1) return results;

  // Enumerate connected complexes by incrementally growing them.
  // Use canonical sorted form to avoid duplicate enumeration.
  const seen = new Set<string>();
  for (const r of results) {
    seen.add(r.join(','));
  }

  /**
   * Grow a complex by one molecule. The new molecule must be bindable
   * to at least one existing molecule in the complex.
   */
  function grow(complex: string[]): void {
    if (complex.length >= maxSize) return;

    // Collect all molecule types that can bind to any member of the complex
    const candidates = new Set<string>();
    for (const member of complex) {
      const neighbors = molBindings.get(member);
      if (neighbors) {
        for (const n of neighbors) {
          candidates.add(n);
        }
      }
    }

    for (const candidate of [...candidates].sort()) {
      const newComplex = [...complex, candidate].sort();
      const key = newComplex.join(',');
      if (!seen.has(key)) {
        seen.add(key);
        results.push(newComplex);
        grow(newComplex);
      }
    }
  }

  // Start growth from each single-molecule complex
  for (const mt of sortedMolTypes) {
    grow([mt]);
  }

  return results;
}

// Re-export helpers for testing
export { parseMoleculeTokens, extractBindingRequirements, extractMoleculeNames };
