import { Component } from './Component.ts';
import { SpeciesGraph } from './SpeciesGraph.ts';
import type { MatchMap } from './Matcher.ts';

type PatternEndpoint = {
  pKey: string; // "pMol.pComp"
  pMolIdx: number;
  pCompIdx: number;
  tMolIdx: number;
  candidates: number[];
};

function componentMatches(pComp: Component, tComp: Component): boolean {
  if (pComp.name !== tComp.name) return false;

  // State matching
  if (pComp.state && pComp.state !== '?' && pComp.state !== tComp.state) {
    return false;
  }

  const targetBondCount = tComp.edges.size;

  // Bond wildcard semantics (BNGL)
  if (pComp.wildcard === '+') {
    return targetBondCount > 0;
  }
  if (pComp.wildcard === '-') {
    return targetBondCount === 0;
  }
  if (pComp.wildcard === '?') {
    // BNG2 semantics: bond wildcard '?' means the bond state is unconstrained.
    // (See bng2/Perl2/SpeciesGraph.pm: wildcard logic accepts '?' when edge-count differs.)
    return true;
  }

  // Specific bond patterns: if pattern has explicit bonds, target must be bound.
  if (pComp.edges.size > 0) {
    return targetBondCount > 0;
  }

  // No wildcard, no bonds: treat as unbound for statistical-factor counting.
  // This mirrors matcher behavior for plain sites and avoids overcounting
  // assignments that consume already-bound copies of repeated sites.
  return targetBondCount === 0;
}

function areAdjacent(target: SpeciesGraph, a: string, b: string): boolean {
  const neighbors = target.adjacency.get(a);
  return Array.isArray(neighbors) && neighbors.includes(b);
}

function getPatternBondPairs(pattern: SpeciesGraph): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const seen = new Set<string>();

  for (const [a, neighbors] of pattern.adjacency.entries()) {
    for (const b of neighbors) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push(a < b ? [a, b] : [b, a]);
    }
  }

  return pairs;
}

/**
 * Enumerate every injective component assignment of `pattern` into `target` that
 * is consistent with `match`'s molecule mapping and with the pattern's bond
 * structure — the bounded, per-molecule-map counterpart of the embedding set
 * `SpeciesGraph::isomorphicToSubgraph` produces in BioNetGen.
 *
 * `visit` is called once per surviving assignment and returns false to abandon
 * the enumeration. `budget` bounds the number of assignments examined; when it is
 * exhausted the enumeration stops early and `false` is returned, so callers can
 * distinguish a complete answer from a truncated one.
 */
const enumerateComponentAssignments = (
  pattern: SpeciesGraph,
  target: SpeciesGraph,
  match: MatchMap,
  visit: (assignment: ReadonlyMap<string, string>) => boolean,
  budget: number
): boolean => {
  if (pattern.molecules.length === 0 || match.moleculeMap.size === 0) {
    visit(new Map());
    return true;
  }

  const bondPairs = getPatternBondPairs(pattern);

  const endpoints: PatternEndpoint[] = [];
  for (const [pMolIdx, tMolIdx] of match.moleculeMap.entries()) {
    const pMol = pattern.molecules[pMolIdx];
    const tMol = target.molecules[tMolIdx];
    if (!pMol || !tMol) {
      visit(new Map());
      return true;
    }

    for (let pCompIdx = 0; pCompIdx < pMol.components.length; pCompIdx++) {
      const pComp = pMol.components[pCompIdx];

      // Skip '?' wildcard components — they are spectator components that serve as
      // "any-bond-state" witnesses in expanded rule patterns (e.g., H(g,g?,g?,g?,m?,b?)
      // expanded from the rule H(g)). These do NOT contribute distinct embedding choices
      // because any permutation of spectator components that doesn't change the reaction
      // center represents the same physical event. Including them causes the embedding
      // count to be inflated by (n_spectators)! — e.g. 3! = 6 extra factor for H with
      // 3 non-participating g'? sites — leading to overcounting of Arrhenius and other rates.
      if (pComp.wildcard === '?') continue;

      const candidates: number[] = [];
      for (let tCompIdx = 0; tCompIdx < tMol.components.length; tCompIdx++) {
        const tComp = tMol.components[tCompIdx];
        if (componentMatches(pComp, tComp)) {
          candidates.push(tCompIdx);
        }
      }

      endpoints.push({
        pKey: `${pMolIdx}.${pCompIdx}`,
        pMolIdx,
        pCompIdx,
        tMolIdx,
        candidates,
      });
    }
  }

  // If the pattern specifies no components anywhere, degeneracy is 1.
  if (endpoints.length === 0) {
    visit(new Map());
    return true;
  }

  // If any component has no valid candidate, there is no embedding.
  if (endpoints.some((e) => e.candidates.length === 0)) return true;

  // Order by most constrained endpoint first (classic CSP heuristic).
  endpoints.sort((a, b) => a.candidates.length - b.candidates.length || a.pKey.localeCompare(b.pKey));

  const assignment = new Map<string, string>(); // pKey -> tKey
  const usedByTargetMol = new Map<number, Set<number>>();

  const isConsistentWithAssignedBonds = (pKeyA: string, tKeyA: string): boolean => {
    for (const [pA, pB] of bondPairs) {
      if (pA !== pKeyA && pB !== pKeyA) continue;
      const partnerP = pA === pKeyA ? pB : pA;
      const partnerT = assignment.get(partnerP);
      if (!partnerT) continue;
      if (!areAdjacent(target, tKeyA, partnerT) || !areAdjacent(target, partnerT, tKeyA)) {
        return false;
      }
    }
    return true;
  };

  let examined = 0;
  let complete = true;
  const backtrack = (idx: number): void => {
    if (!complete) return;
    if (idx >= endpoints.length) {
      // Final check: ensure ALL pattern bonds are satisfied.
      for (const [pA, pB] of bondPairs) {
        const tA = assignment.get(pA);
        const tB = assignment.get(pB);
        if (!tA || !tB) return;
        if (!areAdjacent(target, tA, tB) || !areAdjacent(target, tB, tA)) return;
      }

      if (++examined > budget) {
        complete = false;
        return;
      }
      if (!visit(assignment)) complete = false;
      return;
    }

    const e = endpoints[idx];
    const used = usedByTargetMol.get(e.tMolIdx) ?? new Set<number>();
    usedByTargetMol.set(e.tMolIdx, used);

    for (const tCompIdx of e.candidates) {
      if (used.has(tCompIdx)) continue;
      const tKey = `${e.tMolIdx}.${tCompIdx}`;

      if (!isConsistentWithAssignedBonds(e.pKey, tKey)) continue;

      used.add(tCompIdx);
      assignment.set(e.pKey, tKey);
      backtrack(idx + 1);
      assignment.delete(e.pKey);
      used.delete(tCompIdx);
      if (!complete) return;
    }
  };

  backtrack(0);
  return complete;
};

export const countEmbeddingDegeneracy = (
  pattern: SpeciesGraph,
  target: SpeciesGraph,
  match: MatchMap
): number => {
  // IMPORTANT: This function must NOT invoke global subgraph isomorphism enumeration.
  // It is only allowed to count symmetry/multiplicity induced by *component assignments*
  // given a fixed molecule mapping (the provided `match`).
  //
  // This keeps the cost bounded by per-molecule component counts, not target size.
  let count = 0;
  enumerateComponentAssignments(
    pattern,
    target,
    match,
    () => {
      count += 1;
      return true;
    },
    Number.POSITIVE_INFINITY
  );
  return count;
};

/**
 * `RxnRule::filter_identical_by_rxn_center` (RxnRule.pm:3501-3592) applied to the
 * component-assignment embeddings of one reactant pattern into one species.
 *
 * BioNetGen enumerates every embedding, projects each onto the rule's reaction
 * centre, and keeps one embedding per distinct image. The survivor count — not
 * the raw embedding count — is that pattern's contribution to the rule's
 * multiplicity. This computes it directly, without materialising the match set.
 *
 * Returns `null` when `budget` assignments are not enough to decide the answer;
 * callers then fall back to the raw embedding count.
 */
export const countRxnCenterImages = (
  pattern: SpeciesGraph,
  target: SpeciesGraph,
  match: MatchMap,
  reactionCenter: string[],
  iPatt: number,
  budget: number
): number | null => {
  const images = new Set<string>();

  const complete = enumerateComponentAssignments(
    pattern,
    target,
    match,
    assignment => {
      let key = '';
      for (const node of reactionCenter) {
        const dot = node.indexOf('.');
        const rest = dot === -1 ? '' : node.slice(dot + 1);
        if (rest === '') {
          key += `${iPatt}|`;
        } else if (rest.indexOf('.') === -1) {
          const tMol = match.moleculeMap.get(Number(rest));
          key += `${iPatt}.${tMol === undefined ? 'undefined' : tMol}|`;
        } else {
          key += `${iPatt}.${assignment.get(rest) ?? match.componentMap.get(rest) ?? 'undefined'}|`;
        }
      }
      images.add(key);
      return true;
    },
    budget
  );

  return complete ? images.size : null;
};

