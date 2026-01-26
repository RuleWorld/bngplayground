import { SpeciesGraph } from './SpeciesGraph.ts';
import { Component } from './Component.ts';

const adjacencyKey = (molIdx: number, compIdx: number): string => `${molIdx}.${compIdx}`;

const getNeighborMolecules = (graph: SpeciesGraph, molIdx: number): number[] => {
  const neighbors = new Set<number>();
  const molecule = graph.molecules[molIdx];
  if (!molecule) {
    return [];
  }

  for (let compIdx = 0; compIdx < molecule.components.length; compIdx++) {
    const partnerKeys = graph.adjacency.get(adjacencyKey(molIdx, compIdx));
    if (!partnerKeys) {
      continue;
    }

    // Support multi-site bonding: iterate over all partners
    for (const partnerKey of partnerKeys) {
      const [partnerMolStr] = partnerKey.split('.');
      const partnerMolIdx = Number(partnerMolStr);
      if (!Number.isNaN(partnerMolIdx)) {
        neighbors.add(partnerMolIdx);
      }
    }
  }

  return Array.from(neighbors);
};

export interface MatchMap {
  moleculeMap: Map<number, number>;      // pattern mol => target mol
  componentMap: Map<string, string>;     // "pMol.pCompIdx" => "tMol.tCompIdx"
}

// Disable verbose logging in production to prevent console spam
// Can be enabled via environment: DEBUG_GRAPH_MATCHER=1
const shouldLogGraphMatcher = typeof process !== 'undefined' && process.env?.DEBUG_GRAPH_MATCHER === '1';

// Safety limits to prevent infinite loops in pathological cases
// These values were chosen empirically based on BNG2 model complexity:
// - MAX_VF2_ITERATIONS: molecule-level subgraph matching (typical models: <1k iterations)
// - MAX_COMPONENT_ITERATIONS: component-level assignment enumeration (typical: <100 iterations)
const MAX_VF2_ITERATIONS = 100000;
const MAX_COMPONENT_ITERATIONS = 10000;

// Cache for findAllMaps results - keyed by pattern string + target string
// Size: ~2000 entries to match conservative browser memory budget
// Note: Cache is cleared at the start of each network generation run
const matchCache = new Map<string, MatchMap[]>();
const MAX_CACHE_SIZE = 2000;  // Reduced from 50000 for browser memory constraints

/**
 * Add entry to matchCache with LRU eviction when size exceeds limit
 */
function addToMatchCache(key: string, value: MatchMap[]): void {
  matchCache.set(key, value);
  if (matchCache.size > MAX_CACHE_SIZE) {
    // Remove oldest entry (Map maintains insertion order, so the first key is the oldest)
    const oldestKey = matchCache.keys().next().value;
    if (oldestKey !== undefined) {
      matchCache.delete(oldestKey);
    }
  }
}

/**
 * Clear the match cache. Call this at the start of network generation.
 */
export function clearMatchCache() {
  matchCache.clear();
}

/**
 * BioNetGen: Map::findMap() - VF2 subgraph isomorphism
 */
export class GraphMatcher {

  /**
   * VF2++ Algorithm 1 (Egerváry & Madarasi 2018, Section 3): compute an order that prioritizes
   * rare, highly connected pattern nodes to maximize early pruning. Each connected component is
   * explored with a BFS, starting from the highest degree / rarest label root. Within each level
   * nodes are sorted by the number of already covered neighbours, then raw degree, then label
   * frequency, yielding a deterministic, duplicate-free ordering.
   */
  private static computeNodeOrdering(pattern: SpeciesGraph, target: SpeciesGraph): number[] {
    if (!pattern.molecules.length) {
      return [];
    }

    const ordering: number[] = [];
    const visited = new Set<number>();
    const labelFrequency = this.buildTargetLabelFrequency(target);
    const components = this.findConnectedComponents(pattern);

    for (const component of components) {
      const root = this.selectBfsRoot(component, pattern, labelFrequency);
      if (root === undefined) {
        continue;
      }

      const queue: number[] = [root];
      visited.add(root);
      ordering.push(root);

      let levelIndex = 0;
      while (levelIndex < queue.length) {
        const levelEnd = queue.length;
        const nextLevel: number[] = [];
        const nextLevelSet = new Set<number>();

        for (let i = levelIndex; i < levelEnd; i++) {
          const node = queue[i];
          for (const neighbor of getNeighborMolecules(pattern, node)) {
            if (!component.has(neighbor) || visited.has(neighbor) || nextLevelSet.has(neighbor)) {
              continue;
            }
            nextLevelSet.add(neighbor);
            nextLevel.push(neighbor);
          }
        }

        nextLevel.sort((a, b) => {
          const coveredA = this.countCoveredNeighbors(pattern, a, visited);
          const coveredB = this.countCoveredNeighbors(pattern, b, visited);
          if (coveredA !== coveredB) {
            return coveredB - coveredA;
          }

          const degreeA = getNeighborMolecules(pattern, a).length;
          const degreeB = getNeighborMolecules(pattern, b).length;
          if (degreeA !== degreeB) {
            return degreeB - degreeA;
          }

          const freqA = labelFrequency.get(pattern.molecules[a].name) ?? 0;
          const freqB = labelFrequency.get(pattern.molecules[b].name) ?? 0;
          if (freqA !== freqB) {
            return freqA - freqB;
          }

          return a - b;
        });

        const deduplicated = Array.from(new Set(nextLevel));
        for (const node of deduplicated) {
          visited.add(node);
          queue.push(node);
          ordering.push(node);
        }

        levelIndex = levelEnd;
      }
    }

    return ordering;
  }

  private static buildTargetLabelFrequency(target: SpeciesGraph): Map<string, number> {
    const freq = new Map<string, number>();
    for (const molecule of target.molecules) {
      freq.set(molecule.name, (freq.get(molecule.name) ?? 0) + 1);
    }
    return freq;
  }

  private static findConnectedComponents(graph: SpeciesGraph): Array<Set<number>> {
    const visited = new Set<number>();
    const components: Array<Set<number>> = [];

    for (let idx = 0; idx < graph.molecules.length; idx++) {
      if (visited.has(idx)) {
        continue;
      }

      const component = new Set<number>();
      const stack: number[] = [idx];
      const maxIterations = graph.molecules.length * 2;
      let iterations = 0;

      while (stack.length > 0) {
        iterations += 1;
        if (iterations > maxIterations) {
          console.warn('[GraphMatcher] Connected component traversal exceeded safety bound');
          break;
        }
        const node = stack.pop()!;
        if (visited.has(node)) {
          continue;
        }
        visited.add(node);
        component.add(node);

        for (const neighbor of getNeighborMolecules(graph, node)) {
          if (!visited.has(neighbor)) {
            stack.push(neighbor);
          }
        }
      }

      components.push(component);
    }

    return components;
  }

  private static selectBfsRoot(
    component: Set<number>,
    pattern: SpeciesGraph,
    labelFrequency: Map<string, number>
  ): number | undefined {
    let bestNode: number | undefined;
    let bestDegree = -1;
    let bestLabelFrequency = Number.POSITIVE_INFINITY;

    for (const node of component) {
      const degree = getNeighborMolecules(pattern, node).length;
      const freq = labelFrequency.get(pattern.molecules[node].name) ?? 0;

      if (
        degree > bestDegree ||
        (degree === bestDegree && freq < bestLabelFrequency) ||
        (degree === bestDegree && freq === bestLabelFrequency && (bestNode === undefined || node < bestNode))
      ) {
        bestNode = node;
        bestDegree = degree;
        bestLabelFrequency = freq;
      }
    }

    return bestNode;
  }

  private static countCoveredNeighbors(
    pattern: SpeciesGraph,
    node: number,
    visited: Set<number>
  ): number {
    let covered = 0;
    for (const neighbor of getNeighborMolecules(pattern, node)) {
      if (visited.has(neighbor)) {
        covered += 1;
      }
    }
    return covered;
  }

  /**
   * Find ALL isomorphic embeddings of pattern in target
   * BioNetGen: SpeciesGraph::findMaps($pattern)
   */
  static findAllMaps(pattern: SpeciesGraph, target: SpeciesGraph): MatchMap[] {
    // Fast pre-filter: check if target has enough molecules of each type
    if (!this.canPossiblyMatch(pattern, target)) {
      return [];
    }

    // Check cache - use toString() as key since graphs are immutable during generation
    // Note: caching is only valid within a single network generation run
    const cacheKey = pattern.toString() + '|' + target.toString();
    const cached = matchCache.get(cacheKey);
    if (cached !== undefined) {
      // Return a shallow copy to prevent mutations
      return cached.map(m => ({
        moleculeMap: new Map(m.moleculeMap),
        componentMap: new Map(m.componentMap)
      }));
    }

    const matches: MatchMap[] = [];
    const ordering = this.computeNodeOrdering(pattern, target);
    const state = new VF2State(pattern, target, ordering);

    const iterationCount = { value: 0 };
    this.vf2Backtrack(state, matches, iterationCount);

    // Cache result with LRU eviction
    addToMatchCache(cacheKey, matches);

    if (shouldLogGraphMatcher) {
      // console.log(
      //   `[GraphMatcher] Found ${matches.length} matches for pattern ${pattern.toString()} in target ${target.toString()}`
      // );
    }
    return matches;
  }

  /**
   * Fast O(n) pre-filter: check if target has at least as many molecules of each type as pattern
   */
  private static canPossiblyMatch(pattern: SpeciesGraph, target: SpeciesGraph): boolean {
    // Build molecule type count for pattern
    const patternCounts = new Map<string, number>();
    for (const mol of pattern.molecules) {
      patternCounts.set(mol.name, (patternCounts.get(mol.name) || 0) + 1);
    }

    // Build molecule type count for target
    const targetCounts = new Map<string, number>();
    for (const mol of target.molecules) {
      targetCounts.set(mol.name, (targetCounts.get(mol.name) || 0) + 1);
    }

    // Check that target has enough of each type
    let targetTotal = target.molecules.length;
    let patternTotal = pattern.molecules.length;

    for (const [molType, count] of patternCounts) {
      if (molType === '*') {
        // '*' matches anything, don't check name-based counts for these
        continue;
      }
      if ((targetCounts.get(molType) || 0) < count) {
        return false;
      }
    }

    return targetTotal >= patternTotal;
  }

  /**
   * Check if target species matches the pattern (has at least one valid mapping)
   */
  static matchesPattern(pattern: SpeciesGraph, target: SpeciesGraph): boolean {
    return this.findFirstMap(pattern, target) !== null;
  }

  /**
   * Find the first valid embedding of `pattern` in `target`, or null.
   * This is a performance-friendly alternative to `findAllMaps` for boolean checks.
   */
  static findFirstMap(pattern: SpeciesGraph, target: SpeciesGraph): MatchMap | null {
    if (!this.canPossiblyMatch(pattern, target)) {
      return null;
    }

    const ordering = this.computeNodeOrdering(pattern, target);
    const state = new VF2State(pattern, target, ordering);
    const iterationCount = { value: 0 };
    return this.vf2BacktrackFirst(state, iterationCount);
  }

  /**
   * VF2 recursive backtracking with iteration limit to prevent infinite loops
   */
  private static vf2Backtrack(
    state: VF2State,
    matches: MatchMap[],
    iterationCount: { value: number }
  ): void {
    iterationCount.value++;
    if (iterationCount.value > MAX_VF2_ITERATIONS) {
      throw new Error(
        `[GraphMatcher] VF2 iteration limit exceeded (${MAX_VF2_ITERATIONS}). ` +
        `Pattern may be too complex or combinatorially explosive. Aborting match to avoid partial results.`
      );
    }
    if (state.isComplete()) {
      const match = state.tryGetMatch();
      if (match) {
        matches.push(match);
      }
      return;
    }

    const candidates = state.getCandidatePairs();
    for (const [pNode, tNode] of candidates) {
      // Early exit if we've hit the iteration limit
      if (iterationCount.value > MAX_VF2_ITERATIONS) {
        return;
      }
      if (state.isFeasible(pNode, tNode)) {
        state.addPair(pNode, tNode);
        this.vf2Backtrack(state, matches, iterationCount);
        state.removePair(pNode, tNode);
      }
    }
  }

  /**
   * VF2 recursive backtracking that stops after the first complete match.
   */
  private static vf2BacktrackFirst(state: VF2State, iterationCount: { value: number }): MatchMap | null {
    iterationCount.value++;
    if (iterationCount.value > MAX_VF2_ITERATIONS) {
      // Note: Some callers catch this error and handle gracefully (e.g., countMoleculeEmbeddings returns 0),
      // but others propagate it (e.g., during network generation). Upstream must handle this limit explicitly.
      throw new Error(
        `[GraphMatcher] VF2 iteration limit exceeded (${MAX_VF2_ITERATIONS}). ` +
        `Pattern may be too complex or combinatorially explosive. Aborting match to avoid partial results.`
      );
    }

    if (state.isComplete()) {
      return state.tryGetMatch();
    }

    const candidates = state.getCandidatePairs();
    for (const [pNode, tNode] of candidates) {
      if (state.isFeasible(pNode, tNode)) {
        state.addPair(pNode, tNode);
        const result = this.vf2BacktrackFirst(state, iterationCount);
        state.removePair(pNode, tNode);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }
}

interface BondEndpoint {
  molIdx: number;
  compIdx: number;
}

interface PendingComponentResult {
  patternMolIdx: number;
  targetMolIdx: number;
  mapping: Map<number, number>;
}

/**
 * VF2 matching state with BioNetGen semantic feasibility rules
 */
class VF2State {
  pattern: SpeciesGraph;
  target: SpeciesGraph;
  corePattern: Map<number, number>;
  coreTarget: Map<number, number>;
  componentMatches: Map<number, Map<number, number>>;
  pendingComponentResult?: PendingComponentResult;
  bondPartnerLookup: Map<string, BondEndpoint>;
  nodeOrdering: number[];
  private componentCandidateCache: Map<number, Map<number, Map<number, Map<string, number[]>>>>;
  private usedTargetsScratch: number[];

  constructor(pattern: SpeciesGraph, target: SpeciesGraph, nodeOrdering: number[]) {
    this.pattern = pattern;
    this.target = target;
    this.corePattern = new Map();
    this.coreTarget = new Map();
    this.componentMatches = new Map();
    this.bondPartnerLookup = this.buildBondPartnerLookup();
    this.nodeOrdering = nodeOrdering.length ? nodeOrdering : pattern.molecules.map((_, idx) => idx);
    this.componentCandidateCache = new Map();
    this.usedTargetsScratch = [];
  }

  isComplete(): boolean {
    return this.corePattern.size === this.pattern.molecules.length;
  }

  private computePatternFrontier(): Set<number> {
    const frontier = new Set<number>();
    for (const patternIdx of this.corePattern.keys()) {
      for (const neighbor of getNeighborMolecules(this.pattern, patternIdx)) {
        if (!this.corePattern.has(neighbor)) {
          frontier.add(neighbor);
        }
      }
    }
    return frontier;
  }

  private computeTargetFrontier(): Set<number> {
    const frontier = new Set<number>();
    for (const targetIdx of this.coreTarget.keys()) {
      for (const neighbor of getNeighborMolecules(this.target, targetIdx)) {
        if (!this.coreTarget.has(neighbor)) {
          frontier.add(neighbor);
        }
      }
    }
    return frontier;
  }

  private getUncoveredPatternNodes(): Set<number> {
    const nodes = new Set<number>();
    for (let idx = 0; idx < this.pattern.molecules.length; idx++) {
      if (!this.corePattern.has(idx)) {
        nodes.add(idx);
      }
    }
    return nodes;
  }

  private getUncoveredTargetNodes(): Set<number> {
    const nodes = new Set<number>();
    for (let idx = 0; idx < this.target.molecules.length; idx++) {
      if (!this.coreTarget.has(idx)) {
        nodes.add(idx);
      }
    }
    return nodes;
  }

  private neighborConsistencyCheck(pNode: number, tNode: number): boolean {
    let patternUncovered = 0;
    for (const neighbor of getNeighborMolecules(this.pattern, pNode)) {
      if (!this.corePattern.has(neighbor)) {
        patternUncovered += 1;
      }
    }

    let targetUncovered = 0;
    for (const neighbor of getNeighborMolecules(this.target, tNode)) {
      if (!this.coreTarget.has(neighbor)) {
        targetUncovered += 1;
      }
    }

    return patternUncovered <= targetUncovered;
  }

  /**
   * VF2++ frontier-driven candidate generation. Preference is given to frontier nodes (those
   * adjacent to the current core), falling back to uncovered nodes following the precomputed
   * ordering. Target candidates are filtered with quick feasibility and neighbourhood degree
   * consistency before being returned for recursive exploration.
   */
  getCandidatePairs(): [number, number][] {
    const pairs: [number, number][] = [];

    const patternFrontier = this.computePatternFrontier();
    const targetFrontier = this.computeTargetFrontier();

    const patternCandidates = patternFrontier.size > 0 ? patternFrontier : this.getUncoveredPatternNodes();

    let nextPatternIdx: number | undefined;
    for (const idx of this.nodeOrdering) {
      if (patternCandidates.has(idx) && !this.corePattern.has(idx)) {
        nextPatternIdx = idx;
        break;
      }
    }

    if (nextPatternIdx === undefined) {
      return pairs;
    }

    // KEY FIX: When the next pattern node is NOT in the pattern frontier (i.e., it's from
    // a disconnected component in the pattern), we must consider ALL uncovered target nodes,
    // not just the target frontier. This is essential for patterns like "A.B" where A and B
    // are not directly bonded but must be in the same species/complex.
    // 
    // BNG semantics: "A.B" means A and B are in the same complex, but they don't need to
    // be directly bonded. They could be connected through intermediate molecules.
    const nextPatternNodeInFrontier = patternFrontier.has(nextPatternIdx);
    const targetCandidates = (targetFrontier.size > 0 && nextPatternNodeInFrontier)
      ? targetFrontier
      : this.getUncoveredTargetNodes();

    const sortedTargetCandidates = Array.from(targetCandidates).sort((a, b) => a - b);
    for (const tIdx of sortedTargetCandidates) {
      if (this.coreTarget.has(tIdx)) {
        continue;
      }

      if (!this.quickFeasibilityCheck(nextPatternIdx, tIdx)) {
        continue;
      }

      if (!this.neighborConsistencyCheck(nextPatternIdx, tIdx)) {
        continue;
      }

      pairs.push([nextPatternIdx, tIdx]);
    }

    return pairs;
  }

  isFeasible(pMol: number, tMol: number): boolean {
    this.pendingComponentResult = undefined;

    if (!this.quickFeasibilityCheck(pMol, tMol)) {
      return false;
    }

    if (!this.labelConsistencyCut(pMol, tMol)) {
      return false;
    }

    const componentMapping = this.matchComponents(pMol, tMol);
    if (!componentMapping) {
      if (shouldLogGraphMatcher) {
        console.log(`[GraphMatcher] Component match failed for P${pMol} -> T${tMol}`);
      }
      return false;
    }

    if (!this.checkFrontierConsistency(pMol, tMol)) {
      return false;
    }

    this.pendingComponentResult = {
      patternMolIdx: pMol,
      targetMolIdx: tMol,
      mapping: componentMapping
    };

    return true;
  }

  private quickFeasibilityCheck(pMol: number, tMol: number): boolean {
    const patternMol = this.pattern.molecules[pMol];
    const targetMol = this.target.molecules[tMol];

    // FIX: Support '*' molecule name wildcard
    if (patternMol.name !== '*' && patternMol.name !== targetMol.name) {
      return false;
    }

    // BioNetGen compartment matching semantics:
    // - If pattern specifies a compartment, target must be in the same compartment
    // - If pattern does NOT specify a compartment (undefined/null), it matches ANY compartment
    // This allows rules like "L(r) + R(l)" to match "L(r)@EC + R(l)@PM"
    if (patternMol.compartment && patternMol.compartment !== targetMol.compartment) {
      return false;
    }

    if (targetMol.components.length < patternMol.components.length) {
      return false;
    }

    const requiredCounts = new Map<string, number>();
    for (const comp of patternMol.components) {
      requiredCounts.set(comp.name, (requiredCounts.get(comp.name) ?? 0) + 1);
    }

    for (const [name, count] of requiredCounts.entries()) {
      let available = 0;
      for (const targetComp of targetMol.components) {
        if (targetComp.name === name) {
          available += 1;
        }
      }
      if (available < count) {
        return false;
      }
    }

    return true;
  }
  /**
   * VF2++ Algorithm 2 label consistency check. We compare the unmatched neighbourhoods (T1' and T2')
   * induced by already mapped nodes plus the candidate pair (pMol, tMol). Every label/compartment
   * requirement exposed by the pattern frontier must be satisfiable by the target frontier.
   * 
   * BioNetGen compartment semantics:
   * - If pattern molecule specifies a compartment, target must be in the same compartment
   * - If pattern molecule does NOT specify a compartment, it matches ANY compartment
   */
  private labelConsistencyCut(pMol: number, tMol: number): boolean {
    // Pattern counts: key is either "name|compartment" or "name|*" for wildcarded compartments
    const patternCounts = new Map<string, number>();
    // Also track name-only counts for patterns without compartment (compartment wildcards)
    const patternNameOnlyCounts = new Map<string, number>();

    const addPatternNeighbors = (sourceIdx: number, skipCandidate: boolean) => {
      for (const neighbor of getNeighborMolecules(this.pattern, sourceIdx)) {
        if (this.corePattern.has(neighbor)) {
          continue;
        }
        if (skipCandidate && neighbor === pMol) {
          continue;
        }
        const mol = this.pattern.molecules[neighbor];
        if (mol.name !== '*' && mol.compartment) {
          // Pattern specifies compartment - must match exactly
          const key = `${mol.name}|${mol.compartment}`;
          patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
        } else if (mol.name !== '*') {
          // Pattern doesn't specify compartment - track by name only (wildcard)
          patternNameOnlyCounts.set(mol.name, (patternNameOnlyCounts.get(mol.name) ?? 0) + 1);
        }
        // If mol.name is '*', we don't count it for label-based pruning (too expensive/broad)
      }
    };

    for (const coveredIdx of this.corePattern.keys()) {
      addPatternNeighbors(coveredIdx, true);
    }
    addPatternNeighbors(pMol, false);

    if (patternCounts.size === 0 && patternNameOnlyCounts.size === 0) {
      return true;
    }

    // Target counts: "name|compartment" exact match, and also name-only counts
    const targetCounts = new Map<string, number>();
    const targetNameOnlyCounts = new Map<string, number>();

    const addTargetNeighbors = (sourceIdx: number, skipCandidate: boolean) => {
      for (const neighbor of getNeighborMolecules(this.target, sourceIdx)) {
        if (this.coreTarget.has(neighbor)) {
          continue;
        }
        if (skipCandidate && neighbor === tMol) {
          continue;
        }
        const mol = this.target.molecules[neighbor];
        const key = `${mol.name}|${mol.compartment ?? ''}`;
        targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1);
        // Also count by name only for wildcard matching
        targetNameOnlyCounts.set(mol.name, (targetNameOnlyCounts.get(mol.name) ?? 0) + 1);
      }
    };

    for (const coveredIdx of this.coreTarget.keys()) {
      addTargetNeighbors(coveredIdx, true);
    }
    addTargetNeighbors(tMol, false);

    // Check exact compartment requirements
    for (const [labelKey, required] of patternCounts.entries()) {
      if ((targetCounts.get(labelKey) ?? 0) < required) {
        return false;
      }
    }

    // Check compartment wildcard requirements (pattern without compartment matches any)
    for (const [name, required] of patternNameOnlyCounts.entries()) {
      if ((targetNameOnlyCounts.get(name) ?? 0) < required) {
        return false;
      }
    }

    return true;
  }

  private checkFrontierConsistency(pMol: number, tMol: number): boolean {
    // Build pattern counts: separate by compartmented vs non-compartmented patterns
    // Pattern counts for exact compartment match
    const patternCounts = new Map<string, number>();
    // Pattern counts for compartment wildcard (name only)
    const patternNameOnlyCounts = new Map<string, number>();

    for (const neighbor of getNeighborMolecules(this.pattern, pMol)) {
      if (this.corePattern.has(neighbor)) {
        continue;
      }
      const mol = this.pattern.molecules[neighbor];
      if (mol.name !== '*' && mol.compartment) {
        // Pattern specifies compartment - must match exactly
        const key = `${mol.name}|${mol.compartment}`;
        patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
      } else if (mol.name !== '*') {
        // Pattern doesn't specify compartment - wildcard match by name
        patternNameOnlyCounts.set(mol.name, (patternNameOnlyCounts.get(mol.name) ?? 0) + 1);
      }
    }

    if (patternCounts.size === 0 && patternNameOnlyCounts.size === 0) {
      return true;
    }

    // Build target counts: exact compartment and name-only
    const targetCounts = new Map<string, number>();
    const targetNameOnlyCounts = new Map<string, number>();

    for (const neighbor of getNeighborMolecules(this.target, tMol)) {
      if (this.coreTarget.has(neighbor)) {
        continue;
      }
      const mol = this.target.molecules[neighbor];
      const key = `${mol.name}|${mol.compartment ?? ''}`;
      targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1);
      // Also count by name only for wildcard matching
      targetNameOnlyCounts.set(mol.name, (targetNameOnlyCounts.get(mol.name) ?? 0) + 1);
    }

    // Check exact compartment requirements
    for (const [key, required] of patternCounts.entries()) {
      if ((targetCounts.get(key) ?? 0) < required) {
        return false;
      }
    }

    // Check compartment wildcard requirements (pattern without compartment matches any)
    for (const [name, required] of patternNameOnlyCounts.entries()) {
      if ((targetNameOnlyCounts.get(name) ?? 0) < required) {
        return false;
      }
    }

    return true;
  }

  addPair(p: number, t: number): void {
    this.corePattern.set(p, t);
    this.coreTarget.set(t, p);
    this.componentCandidateCache.clear();

    if (
      this.pendingComponentResult &&
      this.pendingComponentResult.patternMolIdx === p &&
      this.pendingComponentResult.targetMolIdx === t
    ) {
      this.componentMatches.set(p, new Map(this.pendingComponentResult.mapping));
    } else {
      const fallback = this.matchComponents(p, t) ?? new Map<number, number>();
      this.componentMatches.set(p, fallback);
    }

    this.pendingComponentResult = undefined;
  }

  removePair(p: number, t: number): void {
    this.corePattern.delete(p);
    this.coreTarget.delete(t);
    this.componentMatches.delete(p);
    this.componentCandidateCache.clear();
  }

  tryGetMatch(): MatchMap | null {
    // Component maps recorded during VF2 descent are usually correct.
    // However, in symmetric/repeated-site cases (e.g., BAB), a molecule-level mapping can be
    // feasible while an earlier component assignment becomes inconsistent once all molecules
    // are mapped. Recompute only when needed.

    const componentMap = new Map<string, string>();

    for (const [pMolIdx, tMolIdx] of this.corePattern.entries()) {
      const storedMap = this.componentMatches.get(pMolIdx);

      let perMolMap: Map<number, number> | null = null;
      if (storedMap && this.isStoredComponentMapConsistent(pMolIdx, tMolIdx, storedMap)) {
        perMolMap = storedMap;
      } else {
        perMolMap = this.matchComponentsWithBondConsistency(pMolIdx, tMolIdx);
      }

      // If we cannot produce a bond-consistent component mapping, the molecule mapping is not a valid match.
      if (!perMolMap) {
        return null;
      }

      for (const [pCompIdx, tCompIdx] of perMolMap.entries()) {
        componentMap.set(`${pMolIdx}.${pCompIdx}`, `${tMolIdx}.${tCompIdx}`);
      }
    }

    return {
      moleculeMap: new Map(this.corePattern),
      componentMap
    };
  }

  private isStoredComponentMapConsistent(
    pMolIdx: number,
    tMolIdx: number,
    storedMap: Map<number, number>
  ): boolean {
    const patternMol = this.pattern.molecules[pMolIdx];
    const targetMol = this.target.molecules[tMolIdx];
    if (!patternMol || !targetMol) return false;

    // If the stored map is incomplete, we must recompute.
    if (storedMap.size < patternMol.components.length) return false;

    // Injective within molecule.
    const seenTargets = new Set<number>();
    for (const [pCompIdx, tCompIdx] of storedMap.entries()) {
      if (seenTargets.has(tCompIdx)) return false;
      seenTargets.add(tCompIdx);
      const pComp = patternMol.components[pCompIdx];
      const tComp = targetMol.components[tCompIdx];
      if (!pComp || !tComp) return false;
      if (!this.isComponentCompatible(pMolIdx, pCompIdx, tMolIdx, tCompIdx)) return false;
    }

    // Bond consistency across already-mapped molecules: any pattern bond to a mapped partner
    // must correspond to a bond to the partner molecule in the target.
    for (let pCompIdx = 0; pCompIdx < patternMol.components.length; pCompIdx++) {
      const mappedTargetCompIdx = storedMap.get(pCompIdx);
      if (mappedTargetCompIdx === undefined) return false;
      const pComp = patternMol.components[pCompIdx];

      for (const [bondLabel] of pComp.edges.entries()) {
        const partner = this.getBondPartner(pMolIdx, pCompIdx, bondLabel);
        if (!partner) continue;

        // Only enforce inter-molecule bonds.
        if (partner.molIdx === pMolIdx) continue;

        const partnerMolIdx = partner.molIdx;
        if (!this.corePattern.has(partnerMolIdx)) continue;

        const targetPartnerMolIdx = this.corePattern.get(partnerMolIdx)!;
        const partnerStoredMap = this.componentMatches.get(partnerMolIdx);
        if (!partnerStoredMap) {
          // Can't validate without partner's mapping.
          return false;
        }

        const targetPartnerCompIdx = partnerStoredMap.get(partner.compIdx);
        if (targetPartnerCompIdx === undefined) {
          return false;
        }

        if (!this.areComponentsBonded(tMolIdx, mappedTargetCompIdx, targetPartnerMolIdx, targetPartnerCompIdx)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Recompute component assignment for a molecule pair, ensuring inter-molecule bond consistency.
   * This uses the FULL corePattern (all molecule mappings) to constrain component choices.
   */
  private matchComponentsWithBondConsistency(pMolIdx: number, tMolIdx: number): Map<number, number> | null {
    const patternMol = this.pattern.molecules[pMolIdx];
    if (patternMol.components.length === 0) {
      return new Map();
    }

    // Order components by priority (bound components first)
    const order = patternMol.components
      .map((_, idx) => idx)
      .sort((a, b) => this.componentPriority(patternMol.components[b]) - this.componentPriority(patternMol.components[a]));

    const assignment = new Map<number, number>();
    const usedTargets = new Set<number>();
    const iterationCount = { value: 0 };

    const success = this.assignComponentsWithFullContext(
      pMolIdx, tMolIdx, order, 0, assignment, usedTargets, iterationCount
    );
    return success ? assignment : null;
  }

  /**
   * Component assignment backtracking that uses full molecule mapping context.
   */
  private assignComponentsWithFullContext(
    pMolIdx: number,
    tMolIdx: number,
    order: number[],
    orderIdx: number,
    assignment: Map<number, number>,
    usedTargets: Set<number>,
    iterationCount: { value: number }
  ): boolean {
    iterationCount.value++;
    if (iterationCount.value > MAX_COMPONENT_ITERATIONS) {
      return false;
    }

    if (orderIdx >= order.length) {
      return true;
    }

    const pCompIdx = order[orderIdx];
    const candidates = this.getComponentCandidates(pMolIdx, tMolIdx, pCompIdx, usedTargets);

    for (const tCompIdx of candidates) {
      if (iterationCount.value > MAX_COMPONENT_ITERATIONS) {
        return false;
      }

      // Check basic component compatibility (name, state, bond patterns)
      if (!this.isComponentAssignmentValid(pMolIdx, pCompIdx, tMolIdx, tCompIdx, assignment)) {
        continue;
      }

      // CRITICAL: Verify inter-molecule bond consistency using FULL corePattern
      if (!this.checkInterMoleculeBondConsistency(pMolIdx, pCompIdx, tMolIdx, tCompIdx, assignment)) {
        continue;
      }

      assignment.set(pCompIdx, tCompIdx);
      usedTargets.add(tCompIdx);

      if (this.assignComponentsWithFullContext(
        pMolIdx, tMolIdx, order, orderIdx + 1, assignment, usedTargets, iterationCount
      )) {
        return true;
      }

      assignment.delete(pCompIdx);
      usedTargets.delete(tCompIdx);
    }

    return false;
  }

  /**
   * Check if a component assignment is consistent with inter-molecule bonds,
   * using the FULL molecule mapping (corePattern) as context.
   */
  private checkInterMoleculeBondConsistency(
    pMolIdx: number,
    pCompIdx: number,
    tMolIdx: number,
    tCompIdx: number,
    // currentAssignment - unused parameter removed from signature
    _currentAssignment: Map<number, number>
  ): boolean {
    const pComp = this.pattern.molecules[pMolIdx].components[pCompIdx];

    for (const [bondLabel] of pComp.edges.entries()) {
      const partner = this.getBondPartner(pMolIdx, pCompIdx, bondLabel);
      if (!partner) continue;

      const partnerMolIdx = partner.molIdx;

      // Only check inter-molecule bonds (partner is in a DIFFERENT molecule)
      if (partnerMolIdx === pMolIdx) continue;

      // Check if partner molecule is in corePattern (already matched)
      if (!this.corePattern.has(partnerMolIdx)) continue;

      const targetPartnerMolIdx = this.corePattern.get(partnerMolIdx)!;

      // Component-level bond feasibility: pattern's (partner.molIdx, partner.compIdx) must map to
      // some compatible component on the already-mapped target partner molecule that is bonded to (tMolIdx,tCompIdx).
      if (!this.hasCompatibleBondedPartnerComponent(tMolIdx, tCompIdx, partner.molIdx, partner.compIdx, targetPartnerMolIdx)) {
        return false;
      }
    }

    return true;
  }

  private buildBondPartnerLookup(): Map<string, BondEndpoint> {
    const lookup = new Map<string, BondEndpoint>();
    const grouped = new Map<number, BondEndpoint[]>();

    for (let molIdx = 0; molIdx < this.pattern.molecules.length; molIdx++) {
      const mol = this.pattern.molecules[molIdx];
      mol.components.forEach((comp, compIdx) => {
        for (const bondLabel of comp.edges.keys()) {
          if (!grouped.has(bondLabel)) {
            grouped.set(bondLabel, []);
          }
          grouped.get(bondLabel)!.push({ molIdx, compIdx });
        }
      });
    }

    for (const [label, endpoints] of grouped.entries()) {
      if (endpoints.length < 2) continue;
      for (const endpoint of endpoints) {
        const partner = endpoints.find(ep => ep.molIdx !== endpoint.molIdx || ep.compIdx !== endpoint.compIdx);
        if (!partner) continue;
        lookup.set(this.componentBondKey(endpoint.molIdx, endpoint.compIdx, label), partner);
      }
    }

    return lookup;
  }

  private componentBondKey(molIdx: number, compIdx: number, bondLabel: number): string {
    return `${molIdx}.${compIdx}.${bondLabel}`;
  }

  private matchComponents(pMolIdx: number, tMolIdx: number): Map<number, number> | null {
    const patternMol = this.pattern.molecules[pMolIdx];
    if (patternMol.components.length === 0) {
      return new Map();
    }

    const order = patternMol.components
      .map((_, idx) => idx)
      .sort((a, b) => this.componentPriority(patternMol.components[b]) - this.componentPriority(patternMol.components[a]));

    const assignment = new Map<number, number>();
    const usedTargets = new Set<number>();
    const iterationCount = { value: 0 };

    const success = this.assignComponentsBacktrack(
      pMolIdx, tMolIdx, order, 0, assignment, usedTargets, iterationCount
    );
    return success ? assignment : null;
  }

  private assignComponentsBacktrack(
    pMolIdx: number,
    tMolIdx: number,
    order: number[],
    orderIdx: number,
    assignment: Map<number, number>,
    usedTargets: Set<number>,
    iterationCount: { value: number }
  ): boolean {
    iterationCount.value++;
    if (iterationCount.value > MAX_COMPONENT_ITERATIONS) {
      console.warn(
        `[GraphMatcher] Component iteration limit exceeded for molecule ${pMolIdx}. ` +
        `May have too many symmetric components.`
      );
      return false;
    }

    if (orderIdx >= order.length) {
      return true;
    }

    let bestPos = orderIdx;
    let minCandidates = Number.POSITIVE_INFINITY;
    const candidateCache = new Map<number, number[]>();

    for (let i = orderIdx; i < order.length; i++) {
      const compIdx = order[i];
      const candidatesForComp = this.getComponentCandidates(pMolIdx, tMolIdx, compIdx, usedTargets);
      candidateCache.set(compIdx, candidatesForComp);

      if (candidatesForComp.length < minCandidates) {
        minCandidates = candidatesForComp.length;
        bestPos = i;
        if (minCandidates === 0) {
          break;
        }
      }
    }

    if (bestPos !== orderIdx) {
      const tmp = order[orderIdx];
      order[orderIdx] = order[bestPos];
      order[bestPos] = tmp;
    }

    const pCompIdx = order[orderIdx];
    const candidates = candidateCache.get(pCompIdx) ?? [];

    if (candidates.length === 0) {
      return false;
    }

    for (const tCompIdx of candidates) {
      // Early exit if we've hit the iteration limit
      if (iterationCount.value > MAX_COMPONENT_ITERATIONS) {
        return false;
      }

      if (!this.isComponentAssignmentValid(pMolIdx, pCompIdx, tMolIdx, tCompIdx, assignment)) {
        if (shouldLogGraphMatcher) {
          // console.log(`[GraphMatcher] Assignment invalid: P${pMolIdx}.${pCompIdx} -> T${tMolIdx}.${tCompIdx}`);
        }
        continue;
      }

      assignment.set(pCompIdx, tCompIdx);
      usedTargets.add(tCompIdx);

      if (this.assignComponentsBacktrack(
        pMolIdx, tMolIdx, order, orderIdx + 1, assignment, usedTargets, iterationCount
      )) {
        return true;
      }

      assignment.delete(pCompIdx);
      usedTargets.delete(tCompIdx);
    }

    return false;
  }

  private getComponentCandidates(
    pMolIdx: number,
    tMolIdx: number,
    pCompIdx: number,
    usedTargets: Set<number>
  ): number[] {
    const usedKey = this.getUsedTargetsKey(usedTargets);
    let level1 = this.componentCandidateCache.get(pMolIdx);
    if (!level1) {
      level1 = new Map();
      this.componentCandidateCache.set(pMolIdx, level1);
    }

    let level2 = level1.get(tMolIdx);
    if (!level2) {
      level2 = new Map();
      level1.set(tMolIdx, level2);
    }

    let level3 = level2.get(pCompIdx);
    if (!level3) {
      level3 = new Map();
      level2.set(pCompIdx, level3);
    }

    const cached = level3.get(usedKey);
    if (cached) {
      return cached;
    }

    const pComp = this.pattern.molecules[pMolIdx].components[pCompIdx];
    const targetMol = this.target.molecules[tMolIdx];
    const candidates: number[] = [];

    for (let idx = 0; idx < targetMol.components.length; idx++) {
      if (usedTargets.has(idx)) continue;
      const tComp = targetMol.components[idx];
      if (tComp.name !== pComp.name) continue;
      if (!this.componentStateCompatible(pComp, tComp)) continue;
      candidates.push(idx);
    }

    level3.set(usedKey, candidates);
    return candidates;
  }

  private getUsedTargetsKey(usedTargets: Set<number>): string {
    this.usedTargetsScratch.length = 0;
    for (const value of usedTargets) {
      this.usedTargetsScratch.push(value);
    }
    this.usedTargetsScratch.sort((a, b) => a - b);
    return this.usedTargetsScratch.join(',');
  }



  /**
   * Find the minimum target index that a pattern component with a given signature
   * has already been assigned to. Used for symmetry-breaking: when multiple pattern
   * components are equivalent, we constrain later ones to map to higher target indices.
   */


  private componentPriority(comp: Component): number {
    let score = 0;
    score += comp.edges.size * 10;
    if (comp.wildcard === '+') score += 5;
    if (comp.wildcard === '?') score += 1;
    if (comp.wildcard === '-') score += 4;
    if (!comp.wildcard && comp.edges.size === 0) score += 2;
    if (comp.state && comp.state !== '?') score += 3;
    return score;
  }

  private isComponentAssignmentValid(
    pMolIdx: number,
    pCompIdx: number,
    tMolIdx: number,
    tCompIdx: number,
    currentAssignments: Map<number, number>
  ): boolean {
    if (!this.componentBondStateCompatible(pMolIdx, pCompIdx, tMolIdx, tCompIdx)) {
      if (shouldLogGraphMatcher) {
        console.log(`[GraphMatcher] Bond state incompatible: P${pMolIdx}.${pCompIdx} vs T${tMolIdx}.${tCompIdx}`);
      }
      return false;
    }

    if (!this.componentBondConsistencySatisfied(pMolIdx, pCompIdx, tMolIdx, tCompIdx, currentAssignments)) {
      if (shouldLogGraphMatcher) {
        console.log(`[GraphMatcher] Bond consistency failed: P${pMolIdx}.${pCompIdx} vs T${tMolIdx}.${tCompIdx}`);
      }
      return false;
    }

    return true;
  }

  /**
   * Check if a pattern component is compatible with a target component.
   * Combines state compatibility and bond state compatibility checks.
   */
  private isComponentCompatible(
    pMolIdx: number,
    pCompIdx: number,
    tMolIdx: number,
    tCompIdx: number
  ): boolean {
    const patternMol = this.pattern.molecules[pMolIdx];
    const targetMol = this.target.molecules[tMolIdx];
    if (!patternMol || !targetMol) return false;

    const pComp = patternMol.components[pCompIdx];
    const tComp = targetMol.components[tCompIdx];
    if (!pComp || !tComp) return false;

    // Check name match
    if (pComp.name !== tComp.name) return false;

    // Check state compatibility
    if (!this.componentStateCompatible(pComp, tComp)) return false;

    // Check bond state compatibility
    if (!this.componentBondStateCompatible(pMolIdx, pCompIdx, tMolIdx, tCompIdx)) return false;

    return true;
  }

  private componentStateCompatible(patternComp: Component, targetComp: Component): boolean {
    if (!patternComp.state || patternComp.state === '?') {
      return true;
    }
    return targetComp.state === patternComp.state;
  }

  private componentBondStateCompatible(
    pMolIdx: number,
    pCompIdx: number,
    tMolIdx: number,
    tCompIdx: number
  ): boolean {
    const patternMol = this.pattern.molecules[pMolIdx];
    const targetMol = this.target.molecules[tMolIdx];

    // BioNetGen compartment matching semantics:
    // - If pattern specifies a compartment, target must be in the same compartment
    // - If pattern does NOT specify a compartment (undefined/null), it matches ANY compartment
    if (patternMol.compartment && patternMol.compartment !== targetMol.compartment) {
      return false;
    }

    const pComp = this.pattern.molecules[pMolIdx].components[pCompIdx];
    const hasSpecificBond = pComp.edges.size > 0;
    const targetBound = this.targetHasBond(tMolIdx, tCompIdx);

    if (pComp.wildcard === '+') {
      if (!targetBound && shouldLogGraphMatcher) console.log(`[GraphMatcher] Wildcard + failed: P${pMolIdx}.${pCompIdx}(${pComp.name}) expects bound`);
      return targetBound;
    }

    if (pComp.wildcard === '?') {
      return true;
    }

    if (pComp.wildcard === '-') {
      if (targetBound && shouldLogGraphMatcher) console.log(`[GraphMatcher] Wildcard - failed: P${pMolIdx}.${pCompIdx}(${pComp.name}) expects unbound`);
      return !targetBound;
    }

    if (hasSpecificBond) {
      if (!targetBound) {
        if (shouldLogGraphMatcher) console.log(`[GraphMatcher] Specific bond failed: P${pMolIdx}.${pCompIdx}(${pComp.name}) expects bond`);
        return false;
      }
      return true;
    } else {
      // Pattern specifies NO edges and NO wildcard.
      // BioNetGen semantics: A(b) matches both A(b) and A(b!1).
      // If the user wants to specify unbound, they should use !-.
      // This fix ensures observables like "A()" or "A(b)" count bound molecules correctly.
      return true;
    }

  }

  private componentBondConsistencySatisfied(
    pMolIdx: number,
    pCompIdx: number,
    tMolIdx: number,
    tCompIdx: number,
    currentAssignments: Map<number, number>
  ): boolean {
    const pComp = this.pattern.molecules[pMolIdx].components[pCompIdx];

    for (const [bondLabel] of pComp.edges.entries()) {
      const partner = this.getBondPartner(pMolIdx, pCompIdx, bondLabel);
      if (!partner) {
        continue;
      }

      const partnerMolIdx = partner.molIdx;
      const partnerCompIdx = partner.compIdx;

      if (partnerMolIdx === pMolIdx) {
        if (currentAssignments.has(partnerCompIdx)) {
          const targetPartnerCompIdx = currentAssignments.get(partnerCompIdx)!;
          if (!this.areComponentsBonded(tMolIdx, tCompIdx, tMolIdx, targetPartnerCompIdx)) {
            return false;
          }
        } else {
          const neighborKeys = this.target.adjacency.get(this.getAdjacencyKey(tMolIdx, tCompIdx));
          if (!neighborKeys || neighborKeys.length === 0) {
            return false;
          }
          // For multi-site bonding, check if any neighbor is in the same molecule
          const hasSameMolNeighbor = neighborKeys.some(neighborKey => {
            const [neighborMolIdxStr] = neighborKey.split('.');
            return Number(neighborMolIdxStr) === tMolIdx;
          });
          if (!hasSameMolNeighbor) {
            return false;
          }
        }
      } else if (this.corePattern.has(partnerMolIdx)) {
        // The bond partner's molecule is already matched in corePattern.
        // CRITICAL FIX: Instead of requiring the frozen componentMatches to satisfy the bond,
        // we check if SOME component of the target partner molecule could satisfy this bond.
        // This is essential for finding multiple symmetric embeddings (e.g., BAB).
        const targetPartnerMolIdx = this.corePattern.get(partnerMolIdx)!;

        if (!this.hasCompatibleBondedPartnerComponent(tMolIdx, tCompIdx, partnerMolIdx, partnerCompIdx, targetPartnerMolIdx)) {
          return false;
        }
      } else {
        const neighborKeys = this.target.adjacency.get(this.getAdjacencyKey(tMolIdx, tCompIdx));
        if (!neighborKeys || neighborKeys.length === 0) {
          return false;
        }
        // For multi-site bonding, check all neighbors
        // Use the first neighbor for now (simplification - may need more sophisticated handling)
        const neighborKey = neighborKeys[0];
        const [neighborMolIdxStr] = neighborKey.split('.');
        const neighborMolIdx = Number(neighborMolIdxStr);
        if (this.coreTarget.has(neighborMolIdx)) {
          const mappedPatternMol = this.coreTarget.get(neighborMolIdx)!;
          if (mappedPatternMol !== partnerMolIdx) {
            return false;
          }
        }
      }
    }

    return true;
  }

  private getBondPartner(molIdx: number, compIdx: number, bondLabel: number): BondEndpoint | null {
    return (
      this.bondPartnerLookup.get(this.componentBondKey(molIdx, compIdx, bondLabel)) ?? null
    );
  }

  /**
   * Check if a target component has any bond.
   * Returns true if:
   * 1. The component is in the adjacency map (fully resolved bond), OR
   * 2. The component has unresolved/dangling bonds (edges with value -1)
   * 
   * This is important for matching patterns like EGFR(Y1068~P!+) against
   * single molecules parsed from complex species strings like EGFR(CR1!3,L!1,Y1068~P!4)
   * where the bonds are dangling (partner not present).
   */
  private targetHasBond(tMolIdx: number, tCompIdx: number): boolean {
    // Check resolved bonds in adjacency map
    if (this.target.adjacency.has(this.getAdjacencyKey(tMolIdx, tCompIdx))) {
      return true;
    }
    // Also check for dangling/unresolved bonds in component.edges
    // These have value -1 to indicate the partner wasn't found during parsing
    const comp = this.target.molecules[tMolIdx]?.components[tCompIdx];
    if (comp && comp.edges.size > 0) {
      return true;
    }
    return false;
  }

  private areComponentsBonded(
    tMolIdxA: number,
    tCompIdxA: number,
    tMolIdxB: number,
    tCompIdxB: number
  ): boolean {
    const keyA = this.getAdjacencyKey(tMolIdxA, tCompIdxA);
    const keyB = this.getAdjacencyKey(tMolIdxB, tCompIdxB);
    const partnersA = this.target.adjacency.get(keyA);
    // Support multi-site bonding: check if keyB is in partners array
    return partnersA !== undefined && partnersA.includes(keyB);
  }

  private hasCompatibleBondedPartnerComponent(
    tMolIdx: number,
    tCompIdx: number,
    pPartnerMolIdx: number,
    pPartnerCompIdx: number,
    tPartnerMolIdx: number
  ): boolean {
    const partnerPatternMol = this.pattern.molecules[pPartnerMolIdx];
    const partnerTargetMol = this.target.molecules[tPartnerMolIdx];
    if (!partnerPatternMol || !partnerTargetMol) {
      return false;
    }

    // If the partner pattern molecule is compartmented, it must match exactly (already ensured at molecule feasibility).
    const pPartnerComp = partnerPatternMol.components[pPartnerCompIdx];
    if (!pPartnerComp) {
      return false;
    }

    for (let tPartnerCompIdx = 0; tPartnerCompIdx < partnerTargetMol.components.length; tPartnerCompIdx++) {
      const tPartnerComp = partnerTargetMol.components[tPartnerCompIdx];

      if (tPartnerComp.name !== pPartnerComp.name) continue;
      if (!this.componentStateCompatible(pPartnerComp, tPartnerComp)) continue;

      // Apply bond wildcard/unbound semantics for the partner endpoint as well.
      if (!this.componentBondStateCompatible(pPartnerMolIdx, pPartnerCompIdx, tPartnerMolIdx, tPartnerCompIdx)) continue;

      if (this.areComponentsBonded(tMolIdx, tCompIdx, tPartnerMolIdx, tPartnerCompIdx)) {
        return true;
      }
    }

    return false;
  }

  private getAdjacencyKey(molIdx: number, compIdx: number): string {
    return `${molIdx}.${compIdx}`;
  }
}