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

  // No wildcard, no bonds: BNGL "unbound" semantics.
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

  if (pattern.molecules.length === 0 || match.moleculeMap.size === 0) return 1;

  const bondPairs = getPatternBondPairs(pattern);

  const endpoints: PatternEndpoint[] = [];
  for (const [pMolIdx, tMolIdx] of match.moleculeMap.entries()) {
    const pMol = pattern.molecules[pMolIdx];
    const tMol = target.molecules[tMolIdx];
    if (!pMol || !tMol) return 1;

    for (let pCompIdx = 0; pCompIdx < pMol.components.length; pCompIdx++) {
      const pComp = pMol.components[pCompIdx];
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
  if (endpoints.length === 0) return 1;

  // If any component has no valid candidate, there is no embedding.
  if (endpoints.some((e) => e.candidates.length === 0)) return 0;

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

  let count = 0;
  const backtrack = (idx: number): void => {
    if (idx >= endpoints.length) {
      // Final check: ensure ALL pattern bonds are satisfied.
      for (const [pA, pB] of bondPairs) {
        const tA = assignment.get(pA);
        const tB = assignment.get(pB);
        if (!tA || !tB) {
          count = 0;
          return;
        }
        if (!areAdjacent(target, tA, tB) || !areAdjacent(target, tB, tA)) {
          count = 0;
          return;
        }
      }

      count += 1;
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
    }
  };

  backtrack(0);
  return count;
};

