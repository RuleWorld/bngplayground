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
const shouldLogGraphMatcher = false;

// Safety limits to prevent infinite loops in pathological cases
const MAX_VF2_ITERATIONS = 100000;
const MAX_COMPONENT_ITERATIONS = 10000;

// Cache for findAllMaps results - keyed by pattern string + target string
const matchCache = new Map<string, MatchMap[]>();
const MAX_CACHE_SIZE = 50000;

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

    // Cache result if cache not too large
    if (matchCache.size < MAX_CACHE_SIZE) {
      matchCache.set(cacheKey, matches);
    }

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
    for (const [molType, count] of patternCounts) {
      if ((targetCounts.get(molType) || 0) < count) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if target species matches the pattern (has at least one valid mapping)
   */
  static matchesPattern(pattern: SpeciesGraph, target: SpeciesGraph): boolean {
    const maps = this.findAllMaps(pattern, target);
    return maps.length > 0;
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
      console.warn(
        `[GraphMatcher] VF2 iteration limit exceeded (${MAX_VF2_ITERATIONS}). ` +
        `Pattern may be too complex or combinatorially explosive. Returning partial results.`
      );
      return;
    }
    if (state.isComplete()) {
      matches.push(state.getMatch());
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

    if (patternMol.name !== targetMol.name) {
      return false;
    }

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
   */
  private labelConsistencyCut(pMol: number, tMol: number): boolean {
    const patternCounts = new Map<string, number>();

    const addPatternNeighbors = (sourceIdx: number, skipCandidate: boolean) => {
      for (const neighbor of getNeighborMolecules(this.pattern, sourceIdx)) {
        if (this.corePattern.has(neighbor)) {
          continue;
        }
        if (skipCandidate && neighbor === pMol) {
          continue;
        }
        const mol = this.pattern.molecules[neighbor];
        const key = mol.compartment ? `${mol.name}|${mol.compartment}` : mol.name;
        patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
      }
    };

    for (const coveredIdx of this.corePattern.keys()) {
      addPatternNeighbors(coveredIdx, true);
    }
    addPatternNeighbors(pMol, false);

    if (patternCounts.size === 0) {
      return true;
    }

    const targetCounts = new Map<string, number>();
    const addTargetNeighbors = (sourceIdx: number, skipCandidate: boolean) => {
      for (const neighbor of getNeighborMolecules(this.target, sourceIdx)) {
        if (this.coreTarget.has(neighbor)) {
          continue;
        }
        if (skipCandidate && neighbor === tMol) {
          continue;
        }
        const mol = this.target.molecules[neighbor];
        const key = mol.compartment ? `${mol.name}|${mol.compartment}` : mol.name;
        targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1);
      }
    };

    for (const coveredIdx of this.coreTarget.keys()) {
      addTargetNeighbors(coveredIdx, true);
    }
    addTargetNeighbors(tMol, false);

    for (const [labelKey, required] of patternCounts.entries()) {
      if ((targetCounts.get(labelKey) ?? 0) < required) {
        return false;
      }
    }

    return true;
  }

  private checkFrontierConsistency(pMol: number, tMol: number): boolean {
    const patternCounts = new Map<string, number>();
    for (const neighbor of getNeighborMolecules(this.pattern, pMol)) {
      if (this.corePattern.has(neighbor)) {
        continue;
      }
      const mol = this.pattern.molecules[neighbor];
      const key = mol.compartment ? `${mol.name}|${mol.compartment}` : mol.name;
      patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
    }

    if (!patternCounts.size) {
      return true;
    }

    const targetCounts = new Map<string, number>();
    for (const neighbor of getNeighborMolecules(this.target, tMol)) {
      if (this.coreTarget.has(neighbor)) {
        continue;
      }
      const mol = this.target.molecules[neighbor];
      const key = mol.compartment ? `${mol.name}|${mol.compartment}` : mol.name;
      targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1);
    }

    for (const [key, required] of patternCounts.entries()) {
      if ((targetCounts.get(key) ?? 0) < required) {
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

  getMatch(): MatchMap {
    const componentMap = new Map<string, string>();

    for (const [pMolIdx, tMolIdx] of this.corePattern.entries()) {
      const perMolMap = this.componentMatches.get(pMolIdx);
      if (!perMolMap) continue;

      for (const [pCompIdx, tCompIdx] of perMolMap.entries()) {
        componentMap.set(`${pMolIdx}.${pCompIdx}`, `${tMolIdx}.${tCompIdx}`);
      }
    }

    return {
      moleculeMap: new Map(this.corePattern),
      componentMap
    };
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
   * Compute a signature for a component that identifies structurally equivalent components.
   * Used for symmetry-breaking optimization to avoid trying equivalent permutations.
   */
  private getComponentSignature(pMolIdx: number, pCompIdx: number): string {
    const comp = this.pattern.molecules[pMolIdx].components[pCompIdx];
    // Include name, state, wildcard, and whether it has bonds
    const bondIndicator = comp.edges.size > 0 ? 'B' : (comp.wildcard || 'U');
    return `${comp.name}|${comp.state ?? '?'}|${bondIndicator}`;
  }

  /**
   * Find the minimum target index that a pattern component with a given signature
   * has already been assigned to. Used for symmetry-breaking: when multiple pattern
   * components are equivalent, we constrain later ones to map to higher target indices.
   */
  private getSymmetryBreakingMinIndex(
    pMolIdx: number,
    pCompIdx: number,
    assignment: Map<number, number>
  ): number {
    const mySignature = this.getComponentSignature(pMolIdx, pCompIdx);
    let minIdx = -1;

    // Find all pattern components with the same signature that come BEFORE this one
    // and have already been assigned
    for (let i = 0; i < pCompIdx; i++) {
      const otherSignature = this.getComponentSignature(pMolIdx, i);
      if (otherSignature === mySignature && assignment.has(i)) {
        const targetIdx = assignment.get(i)!;
        if (targetIdx > minIdx) {
          minIdx = targetIdx;
        }
      }
    }

    return minIdx;
  }

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
    if (
      patternMol.compartment &&
      targetMol.compartment &&
      patternMol.compartment !== targetMol.compartment
    ) {
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
      if (!targetBound && shouldLogGraphMatcher) console.log(`[GraphMatcher] Specific bond failed: P${pMolIdx}.${pCompIdx}(${pComp.name}) expects bond`);
      return targetBound;
    }

    if (targetBound && shouldLogGraphMatcher) console.log(`[GraphMatcher] Implicit unbound failed: P${pMolIdx}.${pCompIdx}(${pComp.name}) expects unbound`);
    return !targetBound;
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
        const targetPartnerMolIdx = this.corePattern.get(partnerMolIdx)!;
        const partnerComponentMap = this.componentMatches.get(partnerMolIdx);
        if (!partnerComponentMap) {
          return false;
        }
        const targetPartnerCompIdx = partnerComponentMap.get(partnerCompIdx);
        if (targetPartnerCompIdx === undefined) {
          return false;
        }
        if (!this.areComponentsBonded(tMolIdx, tCompIdx, targetPartnerMolIdx, targetPartnerCompIdx)) {
          return false;
        }
        if (!this.targetCompartmentsMatch(tMolIdx, targetPartnerMolIdx)) {
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
        if (!Number.isNaN(neighborMolIdx) && !this.targetCompartmentsMatch(tMolIdx, neighborMolIdx)) {
          return false;
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

  private targetHasBond(tMolIdx: number, tCompIdx: number): boolean {
    return this.target.adjacency.has(this.getAdjacencyKey(tMolIdx, tCompIdx));
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

  private targetCompartmentsMatch(molIdxA: number, molIdxB: number): boolean {
    const molA = this.target.molecules[molIdxA];
    const molB = this.target.molecules[molIdxB];
    if (!molA || !molB) {
      return false;
    }
    if (molA.compartment && molB.compartment && molA.compartment !== molB.compartment) {
      return false;
    }
    return true;
  }

  private getAdjacencyKey(molIdx: number, compIdx: number): string {
    return `${molIdx}.${compIdx}`;
  }
}