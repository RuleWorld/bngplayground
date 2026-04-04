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

/* ---------- Parsed binding requirement ---------- */

interface BindingRequirement {
  mol1: string;
  comp1: string;
  mol2: string;
  comp2: string;
}

interface MoleculeToken {
  name: string;
  components: Array<{
    name: string;
    state?: string;
    bondLabel?: string;
  }>;
}

/* ---------- Pattern parsing ---------- */

/**
 * Parse a BNGL pattern string (e.g., "A(b!1).B(a!1)") into molecule tokens.
 * Handles nested parentheses for components, states (~), and bonds (!).
 */
function parseMoleculeTokens(pattern: string): MoleculeToken[] {
  const molecules: MoleculeToken[] = [];
  // Split on '.' that separates molecules — but only at top-level depth.
  // A '.' inside component parentheses should not split.
  const molStrings: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;

    if (ch === '.' && depth === 0) {
      molStrings.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) {
    molStrings.push(current.trim());
  }

  for (const molStr of molStrings) {
    const parenStart = molStr.indexOf('(');
    if (parenStart === -1) {
      // Molecule with no components listed
      molecules.push({ name: molStr.trim(), components: [] });
      continue;
    }

    const name = molStr.substring(0, parenStart).trim();
    const parenEnd = molStr.lastIndexOf(')');
    const compBody = molStr.substring(parenStart + 1, parenEnd === -1 ? molStr.length : parenEnd);

    const components: MoleculeToken['components'] = [];

    if (compBody.trim().length > 0) {
      // Split components on ','
      const compParts = compBody.split(',');
      for (const part of compParts) {
        const trimmedPart = part.trim();
        if (trimmedPart.length === 0) continue;

        let compName = trimmedPart;
        let state: string | undefined;
        let bondLabel: string | undefined;

        // Extract bond label (!...)
        const bangIdx = compName.indexOf('!');
        if (bangIdx !== -1) {
          bondLabel = compName.substring(bangIdx + 1);
          compName = compName.substring(0, bangIdx);
        }

        // Extract state (~...)
        const tildeIdx = compName.indexOf('~');
        if (tildeIdx !== -1) {
          state = compName.substring(tildeIdx + 1);
          compName = compName.substring(0, tildeIdx);
        }

        components.push({ name: compName, state, bondLabel });
      }
    }

    molecules.push({ name, components });
  }

  return molecules;
}

/**
 * Extract binding requirements from a pattern string.
 * A binding requirement exists when two components share the same numeric bond label.
 * E.g., "A(b!1).B(a!1)" has a binding requirement: A.b <-> B.a
 */
function extractBindingRequirements(pattern: string): BindingRequirement[] {
  const molecules = parseMoleculeTokens(pattern);

  // Collect all (molecule, component, bondLabel) triples
  const bondMap = new Map<string, Array<{ mol: string; comp: string }>>();
  for (const mol of molecules) {
    for (const comp of mol.components) {
      if (comp.bondLabel && /^\d+$/.test(comp.bondLabel)) {
        const label = comp.bondLabel;
        if (!bondMap.has(label)) {
          bondMap.set(label, []);
        }
        bondMap.get(label)!.push({ mol: mol.name, comp: comp.name });
      }
    }
  }

  const requirements: BindingRequirement[] = [];
  for (const [, partners] of bondMap) {
    if (partners.length === 2) {
      requirements.push({
        mol1: partners[0].mol,
        comp1: partners[0].comp,
        mol2: partners[1].mol,
        comp2: partners[1].comp,
      });
    }
    // More than 2 partners for same label would be invalid BNGL, but we skip gracefully.
  }

  return requirements;
}

/**
 * Extract molecule type names that appear in the pattern.
 */
function extractMoleculeNames(pattern: string): string[] {
  const tokens = parseMoleculeTokens(pattern);
  return tokens.map(t => t.name);
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
      const [molType] = key.split('.');
      if (molType !== current) continue;
      for (const neighborKey of neighbors) {
        const [neighborMol] = neighborKey.split('.');
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
 * Check if a pattern is abstractly reachable via the contact map.
 *
 * This is an over-approximate check: it verifies that every binding requirement
 * in the pattern corresponds to an existing edge in the contact map, and that
 * all molecule types in the pattern can be connected via BFS.
 *
 * @param contactMap - The contact map derived from model rules
 * @param pattern - A BNGL pattern string (e.g., "A(b!1).B(a!1)")
 * @param moleculeTypes - Array of declared molecule types in the model
 * @returns Object with `reachable` boolean, `path` of molecule types if reachable,
 *          and `missingEdges` if not reachable.
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
      const [molType] = key.split('.');
      if (molType !== current) continue;
      for (const neighborKey of neighbors) {
        const [neighborMol] = neighborKey.split('.');
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
  const adj = buildAdjacency(contactMap);

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
