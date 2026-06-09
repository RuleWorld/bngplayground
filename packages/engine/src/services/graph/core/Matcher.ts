import { SpeciesGraph } from './SpeciesGraph.ts';
import { Component } from './Component.ts';
import { countEmbeddingDegeneracy } from './degeneracy.ts';

const adjacencyKey = (molIdx: number, compIdx: number): string => `${molIdx}.${compIdx}`;

const getNeighborMolecules = (graph: SpeciesGraph, molIdx: number): number[] => {
  return graph.neighborList[molIdx] ?? [];
};

export interface MatchMap {
  moleculeMap: Map<number, number>;      // pattern mol => target mol
  componentMap: Map<string, string>;     // "pMol.pCompIdx" => "tMol.tCompIdx"
}

export interface GraphMatchOptions {
  symmetryBreaking?: boolean;
  // Observable semantics: allow target sites to carry additional bonds as long
  // as the explicit pattern bonds are satisfied.
  allowExtraTargetBonds?: boolean;
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

// WeakMaps for nested caching: Pattern -> Target -> MatchMap[]
// To support both strict and relaxed matching, as well as symmetry-breaking,
// we use four separate WeakMaps. This completely avoids string construction,
// hashing, and the need for LRU eviction.
let matchCacheStrictNoSB = new WeakMap<SpeciesGraph, WeakMap<SpeciesGraph, MatchMap[]>>();
let matchCacheStrictSB = new WeakMap<SpeciesGraph, WeakMap<SpeciesGraph, MatchMap[]>>();
let matchCacheRelaxedNoSB = new WeakMap<SpeciesGraph, WeakMap<SpeciesGraph, MatchMap[]>>();
let matchCacheRelaxedSB = new WeakMap<SpeciesGraph, WeakMap<SpeciesGraph, MatchMap[]>>();

function getSelectedCache(allowExtra: boolean, sb: boolean) {
  if (allowExtra) {
    return sb ? matchCacheRelaxedSB : matchCacheRelaxedNoSB;
  } else {
    return sb ? matchCacheStrictSB : matchCacheStrictNoSB;
  }
}

/**
 * Clear the match cache. Call this at the start of network generation.
 */
export function clearMatchCache() {
  matchCacheStrictNoSB = new WeakMap();
  matchCacheStrictSB = new WeakMap();
  matchCacheRelaxedNoSB = new WeakMap();
  matchCacheRelaxedSB = new WeakMap();
}

/**
 * BioNetGen: Map::findMap() - VF2 subgraph isomorphism
 */
export class GraphMatcher {
  // Profiling counters for component matching (innermost hot path)
  static matchComponentsTime = 0;
  static matchComponentsCount = 0;

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

        // X-4: decorate-then-sort — precompute covered/degree/freq once per node
        const k = nextLevel.length;
        const covered = new Array(k);
        const degree = new Array(k);
        const freq = new Array(k);
        for (let ni = 0; ni < k; ni++) {
          const node = nextLevel[ni];
          covered[ni] = this.countCoveredNeighbors(pattern, node, visited);
          degree[ni] = getNeighborMolecules(pattern, node).length;
          freq[ni] = labelFrequency.get(pattern.molecules[node].name) ?? 0;
        }
        // sort indices by covered desc, degree desc, freq asc, index asc
        const indices = new Array(k);
        for (let ni = 0; ni < k; ni++) indices[ni] = ni;
        indices.sort((a, b) => {
          if (covered[a] !== covered[b]) return covered[b] - covered[a];
          if (degree[a] !== degree[b]) return degree[b] - degree[a];
          if (freq[a] !== freq[b]) return freq[a] - freq[b];
          return nextLevel[a] - nextLevel[b];
        });
        const sorted = new Array(k);
        for (let ni = 0; ni < k; ni++) sorted[ni] = nextLevel[indices[ni]];

        // X-3: nextLevel is already duplicate-free (Set guard at push), so iterate directly
        for (const node of sorted) {
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
  static findAllMaps(pattern: SpeciesGraph, target: SpeciesGraph, options: GraphMatchOptions = {}): MatchMap[] {
    // Check cache FIRST using nested WeakMaps - completely avoids string serialization and O(N) hashing
    // Cache entries only exist for pairs that already passed canPossiblyMatch, so on cache hit
    // the structural prefilter is guaranteed-true redundant work.
    const selectedCache = getSelectedCache(options.allowExtraTargetBonds ?? false, options.symmetryBreaking ?? false);
    const targetMap = selectedCache.get(pattern);
    if (targetMap !== undefined) {
      const cached = targetMap.get(target);
      if (cached !== undefined) {
        return cached;
      }
    }

    // Fast pre-filter (only on cache miss): check if target has enough molecules of each type
    if (!this.canPossiblyMatch(pattern, target)) {
      if (shouldLogGraphMatcher && pattern.toString().includes('C3(s~b)')) {
        console.log(`[GM_DEBUG] canPossiblyMatch failed for ${pattern.toString()} in ${target.toString()}`);
      }
      return [];
    }

    const matches: MatchMap[] = [];
    const ordering = this.computeNodeOrdering(pattern, target);
    const state = new VF2State(
      pattern,
      target,
      ordering,
      options.symmetryBreaking ?? false,
      options.allowExtraTargetBonds ?? false
    );

    const iterationCount = { value: 0 };
    this.vf2Backtrack(state, matches, iterationCount);
    if (shouldLogGraphMatcher && pattern.toString().includes('C3(s~b)')) {
      console.log(`[GM_DEBUG] findAllMaps result for ${pattern.toString()} in ${target.toString()}: ${matches.length} matches`);
    }
    if (shouldLogGraphMatcher && pattern.toString().includes('EGFR')) {
      console.log(`[GM_DEBUG] EGFR Match count for ${pattern.toString()} in ${target.toString()}: ${matches.length} (sb=${options.symmetryBreaking})`);
    }

    // Cache result with nested WeakMaps
    let tMap = selectedCache.get(pattern);
    if (tMap === undefined) {
      tMap = new WeakMap<SpeciesGraph, MatchMap[]>();
      selectedCache.set(pattern, tMap);
    }
    tMap.set(target, matches);

    if (shouldLogGraphMatcher) {
      // console.log(
      //   `[GraphMatcher] Found ${matches.length} matches for pattern ${pattern.toString()} in target ${target.toString()}`
      // );
    }
    return matches;
  }

  /**
   * Fast O(n) pre-filter: check if target has at least as many molecules of each type as pattern,
   * along with fast topological checks (bond count, max degree, and bound components) to prune rejections in O(1) time.
   */
  public static canPossiblyMatch(pattern: SpeciesGraph, target: SpeciesGraph): boolean {
    // 0. Fingerprint check
    const patternFp = pattern.fingerprint;
    const targetFp = target.fingerprint;
    for (const [key, patCount] of patternFp.entries()) {
      // Wildcard molecules use literal "*" in the fingerprint, but that is only a
      // placeholder for "any molecule name". Skip those entries so the VF2 matcher
      // can evaluate the real structural constraints.
      if (key.startsWith('M:*') || key.startsWith('S:*:') || key.startsWith('B:*:')) {
        continue;
      }
      const tarCount = targetFp.get(key) ?? 0;
      if (tarCount < patCount) {
        return false;
      }
    }

    // 1. Read cached topological aggregates for pattern
    const patternCounts = pattern.molTypeCounts;
    const patternBonds = pattern.bondCount;
    const patternBoundComps = pattern.boundCompCount;
    const maxPatternDegree = pattern.maxDegree;

    // 2. Read cached topological aggregates for target
    const targetCounts = target.molTypeCounts;
    const targetBonds = target.bondCount;
    const targetBoundComps = target.boundCompCount;
    const maxTargetDegree = target.maxDegree;

    // 3. Topological rejections
    if (targetBonds < patternBonds) {
      return false;
    }
    if (targetBoundComps < patternBoundComps) {
      return false;
    }
    if (maxTargetDegree < maxPatternDegree) {
      return false;
    }

    // 3.5 Type-connectivity check
    const patternBondsMap = pattern.typeBonds;
    const targetBondsMap = target.typeBonds;
    for (const [pairKey, patCount] of patternBondsMap.entries()) {
      if (pairKey.includes('*')) {
        continue;
      }
      const tarCount = targetBondsMap.get(pairKey) ?? 0;
      if (tarCount < patCount) {
        return false;
      }
    }

    // 4. Name-based molecule count checks
    const targetTotal = target.molecules.length;
    const patternTotal = pattern.molecules.length;

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
  static matchesPattern(pattern: SpeciesGraph, target: SpeciesGraph, options: GraphMatchOptions = {}): boolean {
    return this.findFirstMap(pattern, target, options) !== null;
  }

  /**
   * Find the first valid embedding of `pattern` in `target`, or null.
   * This is a performance-friendly alternative to `findAllMaps` for boolean checks.
   */
  static findFirstMap(pattern: SpeciesGraph, target: SpeciesGraph, options: GraphMatchOptions = {}): MatchMap | null {
    if (!this.canPossiblyMatch(pattern, target)) {
      return null;
    }

    const ordering = this.computeNodeOrdering(pattern, target);
    const state = new VF2State(
      pattern,
      target,
      ordering,
      options.symmetryBreaking ?? false,
      options.allowExtraTargetBonds ?? false
    );
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

  private static moleculeAutomorphismCache = new WeakMap<SpeciesGraph, number>();

  /**
   * Calculate and cache the molecule-level self-automorphisms of a pattern.
   * Completely avoids redundant graph matching runs for static reactant patterns.
   */
  static getMoleculeAutomorphismFactor(pattern: SpeciesGraph): number {
    const cached = this.moleculeAutomorphismCache.get(pattern);
    if (cached !== undefined) return cached;

    try {
      if (pattern.molecules.length === 0) return 1;
      const autos = this.findAllMaps(pattern, pattern);
      const factor = autos.length || 1;
      this.moleculeAutomorphismCache.set(pattern, factor);
      return factor;
    } catch (err) {
      console.warn(`[GraphMatcher] Failed to compute molecule automorphisms for pattern`, err);
      return 1;
    }
  }

  /**
   * BNGL PARITY: Calculate the total number of isomorphisms of a pattern into itself.
   * This includes both molecule-level automorphisms and component-level degeneracies.
   * Used to correct double-counting in observables and reaction rates.
   */
  static getPatternAutomorphismFactor(pattern: SpeciesGraph): number {
    try {
      if (pattern.molecules.length === 0) return 1;

      // Find all ways to map molecules.
      const maps = this.findAllMaps(pattern, pattern);
      if (maps.length === 0) return 1;

      let total = 0;
      for (const map of maps) {
        // Multiply each molecule mapping by the number of ways to assign its components.
        total += countEmbeddingDegeneracy(pattern, pattern, map);
      }

      return total || 1;
    } catch (err) {
      console.warn(`[GraphMatcher] Failed to compute automorphisms for pattern`, err);
      return 1;
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
  corePattern: Int32Array;
  coreTarget: Int32Array;
  coreSize: number;
  componentMatches: Map<number, Map<number, number>>;
  pendingComponentResult?: PendingComponentResult;
  bondPartnerLookup: Map<string, BondEndpoint>;
  nodeOrdering: number[];
  symmetryBreaking: boolean;
  allowExtraTargetBonds: boolean;
  private componentCandidateCache: Map<number, Map<number, Map<number, Map<number, number[]>>>>;
  private componentCandidateCacheLarge: Map<number, Map<number, Map<number, Map<string, number[]>>>>;
  private frontierBits: Uint8Array;
  private frontierSize: number;
  private componentOrders: number[][];
  private scratchAssignment: Int32Array;
  private scratchIterationCount: { value: number };
  private mcvCandidateCache: Map<number, number[]>;
  private orderScratch: number[];
  private largeUsedFlags: Set<number>;
  private largeUsedKeyScratch: number[];

  constructor(
    pattern: SpeciesGraph,
    target: SpeciesGraph,
    nodeOrdering: number[],
    symmetryBreaking: boolean = false,
    allowExtraTargetBonds: boolean = false
  ) {
    this.pattern = pattern;
    this.target = target;
    const pLen = pattern.molecules.length;
    const tLen = target.molecules.length;
    this.corePattern = new Int32Array(pLen);
    this.corePattern.fill(-1);
    this.coreTarget = new Int32Array(tLen);
    this.coreTarget.fill(-1);
    this.coreSize = 0;
    this.componentMatches = new Map();
    this.bondPartnerLookup = this.buildBondPartnerLookup();
    this.nodeOrdering = nodeOrdering.length ? nodeOrdering : pattern.molecules.map((_, idx) => idx);
    this.symmetryBreaking = symmetryBreaking;
    this.allowExtraTargetBonds = allowExtraTargetBonds;
    this.componentCandidateCache = new Map();
    this.componentCandidateCacheLarge = new Map();
    this.frontierBits = new Uint8Array(Math.max(pLen, tLen));
    this.frontierSize = 0;

    let maxComps = 0;
    this.componentOrders = new Array(pattern.molecules.length);
    for (let m = 0; m < pattern.molecules.length; m++) {
      const mol = pattern.molecules[m];
      this.componentOrders[m] = mol.components
        .map((_, idx) => idx)
        .sort((a, b) => this.componentPriority(mol.components[b]) - this.componentPriority(mol.components[a]));
      if (mol.components.length > maxComps) maxComps = mol.components.length;
    }
    this.scratchAssignment = new Int32Array(maxComps);
    this.scratchIterationCount = { value: 0 };
    this.mcvCandidateCache = new Map();
    this.orderScratch = new Array(maxComps);
    this.largeUsedFlags = new Set<number>();
    this.largeUsedKeyScratch = [];
  }

  isComplete(): boolean {
    return this.coreSize === this.pattern.molecules.length;
  }

  private computePatternFrontier(): void {
    const bits = this.frontierBits;
    const core = this.corePattern;
    const n = this.pattern.molecules.length;
    bits.fill(0, 0, n);
    let count = 0;
    for (let pIdx = 0; pIdx < core.length; pIdx++) {
      if (core[pIdx] === -1) continue;
      for (const neighbor of getNeighborMolecules(this.pattern, pIdx)) {
        if (core[neighbor] === -1 && bits[neighbor] === 0) {
          bits[neighbor] = 1;
          count++;
        }
      }
    }
    this.frontierSize = count;
  }

  private computeTargetFrontier(): void {
    const bits = this.frontierBits;
    const core = this.coreTarget;
    const n = this.target.molecules.length;
    bits.fill(0, 0, n);
    let count = 0;
    for (let tIdx = 0; tIdx < core.length; tIdx++) {
      if (core[tIdx] === -1) continue;
      for (const neighbor of getNeighborMolecules(this.target, tIdx)) {
        if (core[neighbor] === -1 && bits[neighbor] === 0) {
          bits[neighbor] = 1;
          count++;
        }
      }
    }
    this.frontierSize = count;
  }

  private computeUncoveredPatternNodes(): void {
    const bits = this.frontierBits;
    const core = this.corePattern;
    const n = this.pattern.molecules.length;
    bits.fill(0, 0, n);
    let count = 0;
    for (let idx = 0; idx < n; idx++) {
      if (core[idx] === -1) {
        bits[idx] = 1;
        count++;
      }
    }
    this.frontierSize = count;
  }

  private computeUncoveredTargetNodes(): void {
    const bits = this.frontierBits;
    const core = this.coreTarget;
    const n = this.target.molecules.length;
    bits.fill(0, 0, n);
    let count = 0;
    for (let idx = 0; idx < n; idx++) {
      if (core[idx] === -1) {
        bits[idx] = 1;
        count++;
      }
    }
    this.frontierSize = count;
  }

  private neighborConsistencyCheck(pNode: number, tNode: number): boolean {
    let patternUncovered = 0;
    const pCore = this.corePattern;
    for (const neighbor of getNeighborMolecules(this.pattern, pNode)) {
      if (pCore[neighbor] === -1) {
        patternUncovered += 1;
      }
    }

    let targetUncovered = 0;
    const tCore = this.coreTarget;
    for (const neighbor of getNeighborMolecules(this.target, tNode)) {
      if (tCore[neighbor] === -1) {
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
    const pCore = this.corePattern;
    const tCore = this.coreTarget;

    this.computePatternFrontier();
    const patternFrontierSize = this.frontierSize;
    const bits = this.frontierBits;

    const patternCandidatesSize = patternFrontierSize > 0 ? patternFrontierSize : (() => {
      this.computeUncoveredPatternNodes();
      return this.frontierSize;
    })();

    if (patternCandidatesSize === 0) return pairs;

    let nextPatternIdx: number | undefined;
    for (const idx of this.nodeOrdering) {
      if (bits[idx] === 1 && pCore[idx] === -1) {
        nextPatternIdx = idx;
        break;
      }
    }

    if (nextPatternIdx === undefined) {
      return pairs;
    }

    // NOTE: When the next pattern node is NOT in the pattern frontier (i.e., it's from
    // a disconnected component in the pattern), we must consider ALL uncovered target nodes,
    // not just the target frontier. This is essential for patterns like "A.B" where A and B
    // are not directly bonded but must be in the same species/complex.
    // 
    // BNG semantics: "A.B" means A and B are in the same complex, but they don't need to
    // be directly bonded. They could be connected through intermediate molecules.
    const isNextPatternNodeInFrontier = patternFrontierSize > 0 && bits[nextPatternIdx] === 1;

    if (isNextPatternNodeInFrontier) {
      this.computeTargetFrontier();
    } else {
      this.computeUncoveredTargetNodes();
    }
    const targetCandidateCount = this.frontierSize;

    // Iterate target candidates in order (bitset naturally gives ascending order)
    for (let tIdx = 0; tIdx < tCore.length; tIdx++) {
      if (bits[tIdx] !== 1) continue;
      if (tCore[tIdx] !== -1) continue;

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

  private getEffectiveCompartment(graph: SpeciesGraph, molIdx: number): string | undefined {
    return graph.molecules[molIdx].compartment || graph.compartment;
  }

  private quickFeasibilityCheck(pMol: number, tMol: number): boolean {
    const patternMol = this.pattern.molecules[pMol];
    const targetMol = this.target.molecules[tMol];

    // NOTE: Support '*' molecule name wildcard
    if (patternMol.name !== '*' && patternMol.name !== targetMol.name) {
      return false;
    }

    // BioNetGen compartment matching semantics:
    // - If pattern specifies a compartment, target must be in the same compartment
    // - If pattern does NOT specify a compartment (undefined/null), it matches ANY compartment
    // This allows rules like "L(r) + R(l)" to match "L(r)@EC + R(l)@PM"
    const pComp = this.getEffectiveCompartment(this.pattern, pMol);
    const tComp = this.getEffectiveCompartment(this.target, tMol);
    if (pComp && pComp !== tComp) {
      return false;
    }

    if (targetMol.components.length < patternMol.components.length) {
      return false;
    }

    if (!this.checkMoleculeWildcard(patternMol, targetMol, tMol)) {
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
    const pCore = this.corePattern;
    const tCore = this.coreTarget;
    const patternCounts = new Map<string, number>();
    const patternNameOnlyCounts = new Map<string, number>();

    const addPatternNeighbors = (sourceIdx: number, skipCandidate: boolean) => {
      for (const neighbor of getNeighborMolecules(this.pattern, sourceIdx)) {
        if (pCore[neighbor] !== -1) {
          continue;
        }
        if (skipCandidate && neighbor === pMol) {
          continue;
        }
        const mol = this.pattern.molecules[neighbor];
        const molComp = this.getEffectiveCompartment(this.pattern, neighbor);
        if (mol.name !== '*' && molComp) {
          const key = `${mol.name}|${molComp}`;
          patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
        } else if (mol.name !== '*') {
          patternNameOnlyCounts.set(mol.name, (patternNameOnlyCounts.get(mol.name) ?? 0) + 1);
        }
      }
    };

    for (let idx = 0; idx < pCore.length; idx++) {
      if (pCore[idx] !== -1) {
        addPatternNeighbors(idx, true);
      }
    }
    addPatternNeighbors(pMol, false);

    if (patternCounts.size === 0 && patternNameOnlyCounts.size === 0) {
      return true;
    }

    const targetCounts = new Map<string, number>();
    const targetNameOnlyCounts = new Map<string, number>();

    const addTargetNeighbors = (sourceIdx: number, skipCandidate: boolean) => {
      for (const neighbor of getNeighborMolecules(this.target, sourceIdx)) {
        if (tCore[neighbor] !== -1) {
          continue;
        }
        if (skipCandidate && neighbor === tMol) {
          continue;
        }
        const mol = this.target.molecules[neighbor];
        const molComp = this.getEffectiveCompartment(this.target, neighbor);
        const key = `${mol.name}|${molComp ?? ''}`;
        targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1);
        targetNameOnlyCounts.set(mol.name, (targetNameOnlyCounts.get(mol.name) ?? 0) + 1);
      }
    };

    for (let idx = 0; idx < tCore.length; idx++) {
      if (tCore[idx] !== -1) {
        addTargetNeighbors(idx, true);
      }
    }
    addTargetNeighbors(tMol, false);

    for (const [labelKey, required] of patternCounts.entries()) {
      if ((targetCounts.get(labelKey) ?? 0) < required) {
        return false;
      }
    }

    for (const [name, required] of patternNameOnlyCounts.entries()) {
      if ((targetNameOnlyCounts.get(name) ?? 0) < required) {
        return false;
      }
    }

    return true;
  }

  private checkFrontierConsistency(pMol: number, tMol: number): boolean {
    const pCore = this.corePattern;
    const tCore = this.coreTarget;
    const patternCounts = new Map<string, number>();
    const patternNameOnlyCounts = new Map<string, number>();

    for (const neighbor of getNeighborMolecules(this.pattern, pMol)) {
      if (pCore[neighbor] !== -1) {
        continue;
      }
      const mol = this.pattern.molecules[neighbor];
      const molComp = this.getEffectiveCompartment(this.pattern, neighbor);
      if (mol.name !== '*' && molComp) {
        // Pattern specifies compartment - must match exactly
        const key = `${mol.name}|${molComp}`;
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
      if (tCore[neighbor] !== -1) {
        continue;
      }
      const mol = this.target.molecules[neighbor];
      const molComp = this.getEffectiveCompartment(this.target, neighbor);
      const key = `${mol.name}|${molComp ?? ''}`;
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
    this.corePattern[p] = t;
    this.coreTarget[t] = p;
    this.coreSize++;

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
    this.corePattern[p] = -1;
    this.coreTarget[t] = -1;
    this.coreSize--;
    this.componentMatches.delete(p);
  }

  tryGetMatch(): MatchMap | null {
    const componentMap = new Map<string, string>();
    const molMap = new Map<number, number>();

    for (let pMolIdx = 0; pMolIdx < this.corePattern.length; pMolIdx++) {
      const tMolIdx = this.corePattern[pMolIdx];
      if (tMolIdx === -1) continue;
      molMap.set(pMolIdx, tMolIdx);

      const storedMap = this.componentMatches.get(pMolIdx);

      let perMolMap: Map<number, number> | null = null;
      if (storedMap && this.isStoredComponentMapConsistent(pMolIdx, tMolIdx, storedMap)) {
        perMolMap = storedMap;
      } else {
        perMolMap = this.matchComponentsWithBondConsistency(pMolIdx, tMolIdx);
      }

      if (!perMolMap) {
        return null;
      }

      for (const [pCompIdx, tCompIdx] of perMolMap.entries()) {
        componentMap.set(`${pMolIdx}.${pCompIdx}`, `${tMolIdx}.${tCompIdx}`);
      }
    }

    return {
      moleculeMap: molMap,
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
        if (this.corePattern[partnerMolIdx] === -1) continue;

        const targetPartnerMolIdx = this.corePattern[partnerMolIdx];
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
    const profStart = performance.now();
    const patternMol = this.pattern.molecules[pMolIdx];
    const targetMol = this.target.molecules[tMolIdx];
    if (patternMol.components.length === 0) {
      GraphMatcher.matchComponentsTime += performance.now() - profStart;
      GraphMatcher.matchComponentsCount++;
      return new Map();
    }

    // X-1 guard: bitmask overflows for >31 target components
    if (targetMol.components.length > 31) {
      const result = this.matchComponentsWithBondConsistencyLarge(pMolIdx, tMolIdx);
      GraphMatcher.matchComponentsTime += performance.now() - profStart;
      GraphMatcher.matchComponentsCount++;
      return result;
    }

    const cachedOrder = this.componentOrders[pMolIdx];
    // X-2: copy to per-instance scratch so MCV swaps don't mutate the cached order
    const nComps = patternMol.components.length;
    for (let i = 0; i < nComps; i++) this.orderScratch[i] = cachedOrder[i];
    const assignment = this.scratchAssignment;
    for (let i = 0; i < nComps; i++) assignment[i] = -1;
    const iterationCount = this.scratchIterationCount;
    iterationCount.value = 0;

    const success = this.assignComponentsWithFullContext(
      pMolIdx, tMolIdx, this.orderScratch, 0, assignment, 0, iterationCount
    );
    if (!success) {
      GraphMatcher.matchComponentsTime += performance.now() - profStart;
      GraphMatcher.matchComponentsCount++;
      return null;
    }

    const result = new Map<number, number>();
    for (let i = 0; i < nComps; i++) {
      if (assignment[i] !== -1) result.set(i, assignment[i]);
    }
    GraphMatcher.matchComponentsTime += performance.now() - profStart;
    GraphMatcher.matchComponentsCount++;
    return result;
  }

  /**
   * Component assignment backtracking that uses full molecule mapping context.
   */
  private assignComponentsWithFullContext(
    pMolIdx: number,
    tMolIdx: number,
    order: number[],
    orderIdx: number,
    assignment: Int32Array,
    usedTargetsMask: number,
    iterationCount: { value: number }
  ): boolean {
    iterationCount.value++;
    if (iterationCount.value > MAX_COMPONENT_ITERATIONS) {
      return false;
    }

    const nComps = this.pattern.molecules[pMolIdx].components.length;
    if (orderIdx >= nComps) {
      return true;
    }

    const pCompIdx = order[orderIdx];
    const candidates = this.getComponentCandidates(pMolIdx, tMolIdx, pCompIdx, usedTargetsMask);

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

      assignment[pCompIdx] = tCompIdx;
      usedTargetsMask |= (1 << tCompIdx);

      if (this.assignComponentsWithFullContext(
        pMolIdx, tMolIdx, order, orderIdx + 1, assignment, usedTargetsMask, iterationCount
      )) {
        return true;
      }

      assignment[pCompIdx] = -1;
      usedTargetsMask &= ~(1 << tCompIdx);
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
    _currentAssignment: Int32Array
  ): boolean {
    const pComp = this.pattern.molecules[pMolIdx].components[pCompIdx];

    for (const [bondLabel] of pComp.edges.entries()) {
      const partner = this.getBondPartner(pMolIdx, pCompIdx, bondLabel);
      if (!partner) continue;

      const partnerMolIdx = partner.molIdx;

      // Only check inter-molecule bonds (partner is in a DIFFERENT molecule)
      if (partnerMolIdx === pMolIdx) continue;

      // Check if partner molecule is in corePattern (already matched)
      if (this.corePattern[partnerMolIdx] === -1) continue;

      const targetPartnerMolIdx = this.corePattern[partnerMolIdx];

      // Component-level bond feasibility: pattern's (partner.molIdx, partner.compIdx) must map to
      // some compatible component on the already-mapped target partner molecule that is bonded to (tMolIdx,tCompIdx).
      if (!this.hasCompatibleBondedPartnerComponent(tMolIdx, tCompIdx, partner.molIdx, partner.compIdx, targetPartnerMolIdx)) {
        return false;
      }
    }

    return true;
  }

  private assignComponentsWithFullContextLarge(
    pMolIdx: number,
    tMolIdx: number,
    order: number[],
    orderIdx: number,
    assignment: Int32Array,
    usedTargets: Set<number>,
    iterationCount: { value: number }
  ): boolean {
    iterationCount.value++;
    if (iterationCount.value > MAX_COMPONENT_ITERATIONS) {
      return false;
    }

    const nComps = this.pattern.molecules[pMolIdx].components.length;
    if (orderIdx >= nComps) {
      return true;
    }

    const pCompIdx = order[orderIdx];
    const candidates = this.getComponentCandidatesLarge(pMolIdx, tMolIdx, pCompIdx, usedTargets);

    for (const tCompIdx of candidates) {
      if (iterationCount.value > MAX_COMPONENT_ITERATIONS) {
        return false;
      }

      if (!this.isComponentAssignmentValid(pMolIdx, pCompIdx, tMolIdx, tCompIdx, assignment)) {
        continue;
      }

      if (!this.checkInterMoleculeBondConsistency(pMolIdx, pCompIdx, tMolIdx, tCompIdx, assignment)) {
        continue;
      }

      assignment[pCompIdx] = tCompIdx;
      usedTargets.add(tCompIdx);

      if (this.assignComponentsWithFullContextLarge(
        pMolIdx, tMolIdx, order, orderIdx + 1, assignment, usedTargets, iterationCount
      )) {
        return true;
      }

      assignment[pCompIdx] = -1;
      usedTargets.delete(tCompIdx);
    }

    return false;
  }

  private matchComponentsWithBondConsistencyLarge(pMolIdx: number, tMolIdx: number): Map<number, number> | null {
    const patternMol = this.pattern.molecules[pMolIdx];
    const nComps = patternMol.components.length;
    if (nComps === 0) return new Map();

    const cachedOrder = this.componentOrders[pMolIdx];
    for (let i = 0; i < nComps; i++) this.orderScratch[i] = cachedOrder[i];
    const assignment = this.scratchAssignment;
    for (let i = 0; i < nComps; i++) assignment[i] = -1;
    const iterationCount = this.scratchIterationCount;
    iterationCount.value = 0;
    this.largeUsedFlags.clear();

    const success = this.assignComponentsWithFullContextLarge(
      pMolIdx, tMolIdx, this.orderScratch, 0, assignment, this.largeUsedFlags, iterationCount
    );
    if (!success) return null;

    const result = new Map<number, number>();
    for (let i = 0; i < nComps; i++) {
      if (assignment[i] !== -1) result.set(i, assignment[i]);
    }
    return result;
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
    const profStart = performance.now();
    const patternMol = this.pattern.molecules[pMolIdx];
    const targetMol = this.target.molecules[tMolIdx];
    if (patternMol.components.length === 0) {
      GraphMatcher.matchComponentsTime += performance.now() - profStart;
      GraphMatcher.matchComponentsCount++;
      return new Map();
    }

    // X-1 guard: bitmask overflows for >31 target components
    if (targetMol.components.length > 31) {
      const result = this.matchComponentsLarge(pMolIdx, tMolIdx);
      GraphMatcher.matchComponentsTime += performance.now() - profStart;
      GraphMatcher.matchComponentsCount++;
      return result;
    }

    const cachedOrder = this.componentOrders[pMolIdx];
    // X-2: copy to per-instance scratch so MCV swaps don't mutate the cached order
    const nComps = patternMol.components.length;
    for (let i = 0; i < nComps; i++) this.orderScratch[i] = cachedOrder[i];
    const assignment = this.scratchAssignment;
    for (let i = 0; i < nComps; i++) assignment[i] = -1;
    const iterationCount = this.scratchIterationCount;
    iterationCount.value = 0;

    const success = this.assignComponentsBacktrack(
      pMolIdx, tMolIdx, this.orderScratch, 0, assignment, 0, iterationCount
    );
    if (!success) {
      GraphMatcher.matchComponentsTime += performance.now() - profStart;
      GraphMatcher.matchComponentsCount++;
      return null;
    }

    const result = new Map<number, number>();
    for (let i = 0; i < nComps; i++) {
      if (assignment[i] !== -1) result.set(i, assignment[i]);
    }
    GraphMatcher.matchComponentsTime += performance.now() - profStart;
    GraphMatcher.matchComponentsCount++;
    return result;
  }

  private assignComponentsBacktrack(
    pMolIdx: number,
    tMolIdx: number,
    order: number[],
    orderIdx: number,
    assignment: Int32Array,
    usedTargetsMask: number,
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

    const nComps = this.pattern.molecules[pMolIdx].components.length;
    if (orderIdx >= nComps) {
      return true;
    }

    const remaining = nComps - orderIdx;
    let pCompIdx: number;
    let candidates: number[];

    if (remaining <= 4) {
      // Skip MCV for small component counts — reordering can't pay for itself
      pCompIdx = order[orderIdx];
      candidates = this.getComponentCandidates(pMolIdx, tMolIdx, pCompIdx, usedTargetsMask);
    } else {
      let bestPos = orderIdx;
      let minCandidates = Number.POSITIVE_INFINITY;
      this.mcvCandidateCache.clear();

      for (let i = orderIdx; i < nComps; i++) {
        const compIdx = order[i];
        const candidatesForComp = this.getComponentCandidates(pMolIdx, tMolIdx, compIdx, usedTargetsMask);
        this.mcvCandidateCache.set(compIdx, candidatesForComp);

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

      pCompIdx = order[orderIdx];
      candidates = this.mcvCandidateCache.get(pCompIdx) ?? [];
    }

    if (candidates.length === 0) {
      return false;
    }

    for (const tCompIdx of candidates) {
      if (iterationCount.value > MAX_COMPONENT_ITERATIONS) {
        return false;
      }

      if (!this.isComponentAssignmentValid(pMolIdx, pCompIdx, tMolIdx, tCompIdx, assignment)) {
        if (shouldLogGraphMatcher) {
          // console.log(`[GraphMatcher] Assignment invalid: P${pMolIdx}.${pCompIdx} -> T${tMolIdx}.${tCompIdx}`);
        }
        continue;
      }

      assignment[pCompIdx] = tCompIdx;
      usedTargetsMask |= (1 << tCompIdx);

      if (this.assignComponentsBacktrack(
        pMolIdx, tMolIdx, order, orderIdx + 1, assignment, usedTargetsMask, iterationCount
      )) {
        return true;
      }

      assignment[pCompIdx] = -1;
      usedTargetsMask &= ~(1 << tCompIdx);
    }

    return false;
  }

  private getUsedTargetsKey(usedTargets: Set<number>): string {
    this.largeUsedKeyScratch.length = 0;
    for (const value of usedTargets) {
      this.largeUsedKeyScratch.push(value);
    }
    this.largeUsedKeyScratch.sort((a, b) => a - b);
    return this.largeUsedKeyScratch.join(',');
  }

  private getComponentCandidatesLarge(
    pMolIdx: number,
    tMolIdx: number,
    pCompIdx: number,
    usedTargets: Set<number>
  ): number[] {
    const usedKey = this.getUsedTargetsKey(usedTargets);
    let level1 = this.componentCandidateCacheLarge.get(pMolIdx);
    if (!level1) {
      level1 = new Map();
      this.componentCandidateCacheLarge.set(pMolIdx, level1);
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

  private assignComponentsBacktrackLarge(
    pMolIdx: number,
    tMolIdx: number,
    order: number[],
    orderIdx: number,
    assignment: Int32Array,
    usedTargets: Set<number>,
    iterationCount: { value: number }
  ): boolean {
    iterationCount.value++;
    if (iterationCount.value > MAX_COMPONENT_ITERATIONS) {
      return false;
    }

    const nComps = this.pattern.molecules[pMolIdx].components.length;
    if (orderIdx >= nComps) {
      return true;
    }

    const pCompIdx = order[orderIdx];
    const candidates = this.getComponentCandidatesLarge(pMolIdx, tMolIdx, pCompIdx, usedTargets);

    for (const tCompIdx of candidates) {
      if (iterationCount.value > MAX_COMPONENT_ITERATIONS) {
        return false;
      }

      if (!this.isComponentAssignmentValid(pMolIdx, pCompIdx, tMolIdx, tCompIdx, assignment)) {
        continue;
      }

      assignment[pCompIdx] = tCompIdx;
      usedTargets.add(tCompIdx);

      if (this.assignComponentsBacktrackLarge(
        pMolIdx, tMolIdx, order, orderIdx + 1, assignment, usedTargets, iterationCount
      )) {
        return true;
      }

      assignment[pCompIdx] = -1;
      usedTargets.delete(tCompIdx);
    }

    return false;
  }

  private matchComponentsLarge(pMolIdx: number, tMolIdx: number): Map<number, number> | null {
    const patternMol = this.pattern.molecules[pMolIdx];
    const targetMol = this.target.molecules[tMolIdx];
    const nComps = patternMol.components.length;
    if (nComps === 0) return new Map();

    const cachedOrder = this.componentOrders[pMolIdx];
    for (let i = 0; i < nComps; i++) this.orderScratch[i] = cachedOrder[i];
    const assignment = this.scratchAssignment;
    for (let i = 0; i < nComps; i++) assignment[i] = -1;
    const iterationCount = this.scratchIterationCount;
    iterationCount.value = 0;
    this.largeUsedFlags.clear();

    const success = this.assignComponentsBacktrackLarge(
      pMolIdx, tMolIdx, this.orderScratch, 0, assignment, this.largeUsedFlags, iterationCount
    );
    if (!success) return null;

    const result = new Map<number, number>();
    for (let i = 0; i < nComps; i++) {
      if (assignment[i] !== -1) result.set(i, assignment[i]);
    }
    return result;
  }

  private getComponentCandidates(
    pMolIdx: number,
    tMolIdx: number,
    pCompIdx: number,
    usedTargetsMask: number
  ): number[] {
    const usedKey = usedTargetsMask;
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
      if ((usedTargetsMask >> idx) & 1) continue;
      const tComp = targetMol.components[idx];
      if (tComp.name !== pComp.name) continue;
      if (!this.componentStateCompatible(pComp, tComp)) continue;
      candidates.push(idx);
    }

    level3.set(usedKey, candidates);
    return candidates;
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
    assignment: Int32Array
  ): boolean {
    if (!this.componentBondStateCompatible(pMolIdx, pCompIdx, tMolIdx, tCompIdx)) {
      if (shouldLogGraphMatcher) {
        console.log(`[GraphMatcher] Bond state incompatible: P${pMolIdx}.${pCompIdx} vs T${tMolIdx}.${tCompIdx}`);
      }
      return false;
    }

    if (!this.componentBondConsistencySatisfied(pMolIdx, pCompIdx, tMolIdx, tCompIdx, assignment)) {
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
    // BioNetGen compartment matching semantics:
    // - If pattern specifies a compartment, target must be in the same compartment
    // - If pattern does NOT specify a compartment (undefined/null), it matches ANY compartment
    // IMPORTANT: Use getEffectiveCompartment (with graph-level fallback) instead of
    // raw molecule.compartment. Species whose molecules inherit the graph-level
    // compartment (e.g. @CP::TF.TF where each TF.compartment is undefined) must
    // still match observable patterns like TF(d~pY!1)@CP.TF(d~pY!1)@CP.
    const pEffComp = this.getEffectiveCompartment(this.pattern, pMolIdx);
    const tEffComp = this.getEffectiveCompartment(this.target, tMolIdx);
    if (pEffComp && pEffComp !== tEffComp) {
      return false;
    }

    const pComp = this.pattern.molecules[pMolIdx].components[pCompIdx];
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
    const tComp = this.target.molecules[tMolIdx].components[tCompIdx];

    // BioNetGen semantics:
    // - "!+": must be BOUND.
    // - "!?": matches ANY.
    // - "!-" or "!." (parsed as '-') : must be UNBOUND.
    // - No bond label/wildcard (e.g., "A(b)"): site is required to be UNBOUND.
    if (pComp.wildcard === '+') return tComp.edges.size > 0;
    if (pComp.wildcard === '-') return tComp.edges.size === 0;
    if (pComp.wildcard === '?') return true;

    // Default case: no wildcard and no specific bonds means site must be unbound.
    if (pComp.edges.size === 0) {
      return !targetBound;
    }

    // Specific bonds (e.g., !1, !1!2): for strict rule matching we require exact
    // cardinality. For observable matching we allow extra target bonds, as long as
    // all explicit pattern bonds can still be satisfied.
    if (!pComp.wildcard && !this.allowExtraTargetBonds && tComp.edges.size !== pComp.edges.size) {
      return false;
    }
    if (!pComp.wildcard && this.allowExtraTargetBonds && tComp.edges.size < pComp.edges.size) {
      return false;
    }

    // Specific bond partner consistency is handled by VF2 edge mapping.
    return true;
  }

  private componentBondConsistencySatisfied(
    pMolIdx: number,
    pCompIdx: number,
    tMolIdx: number,
    tCompIdx: number,
    assignment: Int32Array
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
        if (assignment[partnerCompIdx] !== -1) {
          const targetPartnerCompIdx = assignment[partnerCompIdx];
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
            return parseInt(neighborKey, 10) === tMolIdx;
          });
          if (!hasSameMolNeighbor) {
            return false;
          }
        }
      } else if (this.corePattern[partnerMolIdx] !== -1) {
        const targetPartnerMolIdx = this.corePattern[partnerMolIdx];

        const hasCompatiblePartner = this.hasCompatibleBondedPartnerComponent(tMolIdx, tCompIdx, partnerMolIdx, partnerCompIdx, targetPartnerMolIdx);

        if (!hasCompatiblePartner) {
          return false;
        }
      } else {
        const neighborKeys = this.target.adjacency.get(this.getAdjacencyKey(tMolIdx, tCompIdx));
        if (!neighborKeys || neighborKeys.length === 0) {
          return false;
        }
        const neighborKey = neighborKeys[0];
        const neighborMolIdx = parseInt(neighborKey, 10);
        if (this.coreTarget[neighborMolIdx] !== -1) {
          const mappedPatternMol = this.coreTarget[neighborMolIdx];
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
    const hasAdj = this.target.componentHasAnyBond(tMolIdx, tCompIdx);

    // Check resolved bonds in adjacency map
    if (hasAdj) {
      return true;
    }
    // Also check for dangling/unresolved bonds in component.edges
    // These have value -1 to indicate the partner wasn't found during parsing
    const comp = this.target.molecules[tMolIdx]?.components[tCompIdx];
    const edgeSize = comp?.edges?.size ?? 0;

    if (shouldLogGraphMatcher && !hasAdj && edgeSize === 0) {
      // console.log(`[GraphMatcher] targetHasBond(${tMolIdx}.${tCompIdx}) failed: adjacency.size=${this.target.adjacency.size}, edges.size=${edgeSize}`);
    }

    if (edgeSize > 0) {
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
    return this.target.hasBondFast(tMolIdxA, tCompIdxA, tMolIdxB, tCompIdxB);
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

  private checkMoleculeWildcard(pMol: any, tMol: any, tMolIdx: number): boolean {
    if (!pMol.wildcard) return true;
    // BioNetGen 2.9.3 semantic: molecule-level !+ and !? are lenient wildcards
    // that always match if the molecule pattern matches.
    if (pMol.wildcard === '+' || pMol.wildcard === '?') return true;
    const targetBound = tMol.components.some((_: any, cIdx: number) => this.targetHasBond(tMolIdx, cIdx));
    if (pMol.wildcard === '-') return !targetBound;
    return true;
  }
}
