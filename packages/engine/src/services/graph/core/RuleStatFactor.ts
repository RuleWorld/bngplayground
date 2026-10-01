// graph/core/RuleStatFactor.ts
//
// BioNetGen's per-instance statistical factor, transcribed.
//
// `RxnRule::find_reaction_center` (RxnRule.pm:2659-2849) derives, from the rule's
// OWN patterns only -- never from the network and never from a match:
//
//   multScale = 1 / ( (|RG| / |Stab|) * crg_permutations )
//
// and `build_reaction` (RxnRule.pm:3397) sets `StatFactor = $rr->MultScale`, so
// the value one rule instance contributes to a `.net` entry is `MultScale`, and
// `RxnList::add` (RxnList.pm:88) SUMS the stat factors of the instances that fold
// into one entry. The emitted factor is therefore
//
//   (number of surviving rule instances) * multScale,
//
// where the surviving count is per reactant pattern, one per distinct image of
// that pattern's reaction centre (`filter_identical_by_rxn_center`, which
// `countRxnCenterImages` already computes).
//
// This module supplies `multScale`'s denominator.
//
// * `r_auto`  = automorphisms of the merged REACTANT graph, restricted to those
//               that induce a permutation of the reactant PATTERNS (RxnRule.pm:2681-2717).
// * `p_auto`  = automorphisms of the merged PRODUCT graph, unfiltered.
//
//               A reactant symmetry is a symmetry OF THE REACTION only if relabelling
//               the reactants induces a genuine product-graph symmetry.
// * `RG`      = { alpha in r_auto : map o alpha o map^-1 is in p_auto } (RxnRule.pm:2736-2744).
//
// * `Stab`    = { alpha in RG : alpha fixes every reaction-centre element }
//               (RxnRule.pm:2750-2810). A pointwise stabilizer of the centre, hence a
//               subgroup of RG, so `|RG| / |Stab|` is the orbit-stabilizer index: the
//               number of distinct realisations of the reaction centre.
// * `crg`     = product of `classSize!` over isomorphism classes of PURE-CONTEXT
//               reactant patterns, i.e. those whose `ReactionCenter->[$i]` is empty
//               (RxnRule.pm:2813-2845). Independent of RG/Stab and load-bearing:
//               `brusselator_oscillator`'s `X()+X()+Y()->3X` nets 0.5 from
//               |RG| = |Stab| = 2 AND crg = 2.

import type { Component } from './Component.ts';
import type { Molecule } from './Molecule.ts';
import type { SpeciesGraph } from './SpeciesGraph.ts';
import type { RxnRule } from './RxnRule.ts';
import type { RuleCorrespondence } from './RxnRuleOps.ts';
import { computeRuleCorrespondence, mergeRuleGraphs } from './RxnRuleOps.ts';

/** A graph map in BioNetGen's pointer form: `"im"` / `"im.ic"` -> image. */
export type GraphMap = Map<string, string>;

/**
 * Cap on the number of maps a single `isomorphicToSubgraph` enumeration may
 * materialise. The merged rule graphs are built from the rule's own patterns, so
 * their automorphism groups are small (the largest measured over the acceptance
 * corpus is 24, for `zhang_2021`'s `Ang1_4(tie2bs,tie2bs,tie2bs,tie2bs)`). A cap of
 * 20000 is roughly three orders of magnitude above anything a BNGL rule produces
 * while still bounding a pathological rule. When it is exceeded the caller gets
 * `null` and falls back to `divisor = 1` (see `computeRuleDivisor`).
 */
export const RULE_MAP_BUDGET = 20000;

// ---------------------------------------------------------------------------
// SpeciesGraph::isomorphicToSubgraph (SpeciesGraph.pm:3064-3390)
// ---------------------------------------------------------------------------

/**
 * `@{$comp->Edges}` as BioNetGen sees it after `updateEdges`: the `+`/`?` bond
 * wildcards, followed by one entry per real bond. Our `Component` keeps wildcards
 * in `wildcard` and real bonds in `edges`, so the count is the sum. A `-` bond
 * modifier is NOT a wildcard in BioNetGen (`Component.pm:92` only treats `+`/`?`
 * as such) and is stored as an ordinary labelled edge.
 */
const bngEdgeCount = (comp: Component): number =>
  comp.edges.size + (comp.wildcard === '+' || comp.wildcard === '?' ? 1 : 0);

const bngFirstEdgeIsWildcard = (comp: Component): '+' | '?' | undefined =>
  comp.wildcard === '+' || comp.wildcard === '?' ? comp.wildcard : undefined;

const moleculeCompatible = (m1: Molecule, m2: Molecule): boolean => {
  if (m1.name !== m2.name) return false;
  if (m1.compartment !== undefined) {
    if (m2.compartment === undefined || m1.compartment !== m2.compartment) return false;
  }
  return true;
};

/** The component predicate of SpeciesGraph.pm:3221-3262. */
const componentCompatible = (c1: Component, c2: Component): boolean => {
  if (c1.name !== c2.name) return false;
  if (c1.state !== undefined) {
    if (c2.state === undefined) return false;
    if (c1.state !== '?' && c1.state !== c2.state) return false;
  }
  const diff = bngEdgeCount(c2) - bngEdgeCount(c1);
  if (diff !== 0) {
    const wild = bngFirstEdgeIsWildcard(c1);
    if (wild === undefined) return false;
    if (wild === '+') {
      if (diff <= 0) return false;
    } else if (diff < -1) {
      return false;
    }
  }
  return true;
};

/**
 * Every subgraph isomorphism `sg1 -> sg2`, in BioNetGen's molecule-then-component
 * backtracking order. Stops early once `budget` maps have been produced and
 * returns `null`, so a caller can distinguish "there are none" from "there are
 * more than the budget".
 *
 * Note this is a *subgraph* map, exactly as in the Perl: a molecule of `sg1` may
 * match a molecule of `sg2` with spare components, and the component assignment
 * need not be onto. For the `X -> X` uses below (the automorphism enumerations)
 * that cannot happen, but the crg classification below relies on it.
 */
export function enumerateSubgraphMaps(
  sg1: SpeciesGraph,
  sg2: SpeciesGraph,
  budget: number
): GraphMap[] | null {
  // Preconditions, SpeciesGraph.pm:3085-3102.
  if (sg1.molecules.length > sg2.molecules.length) return [];
  if (countGraphEdges(sg1) > countGraphEdges(sg2)) return [];
  if (sg1.compartment !== undefined) {
    if (sg2.compartment === undefined || sg1.compartment !== sg2.compartment) return [];
  }
  // The null graph maps trivially into anything.
  if (sg1.molecules.length === 0) return [new Map()];

  const maps: GraphMap[] = [];
  let overflow = false;
  const molAssigned = new Int32Array(sg2.molecules.length).fill(-1);
  const compAssigned: Int32Array[] = sg2.molecules.map(m => new Int32Array(m.components.length).fill(-1));

  const edges1 = collectEdges(sg1);

  const checkEdges = (compImage: Map<string, string>): boolean => {
    for (const [p1, q1] of edges1) {
      const p2 = compImage.get(p1);
      const q2 = compImage.get(q1);
      if (p2 === undefined || q2 === undefined) return false;
      const partners = sg2.adjacency.get(p2);
      if (!partners || !partners.includes(q2)) return false;
    }
    return true;
  };

  // Depth first over sg1's molecules, then over each molecule's components --
  // the same two-level order as SpeciesGraph.pm:3116-3390. Molecules map
  // injectively into sg2 and components injectively within their image
  // molecule, so the search enumerates every subgraph map rather than the first.
  const assignComponents = (im1: number, im2: number, ic1: number): void => {
    if (overflow) return;
    if (ic1 === sg1.molecules[im1].components.length) {
      assignMolecules(im1 + 1);
      return;
    }
    const comps1 = sg1.molecules[im1].components;
    const comps2 = sg2.molecules[im2].components;
    for (let ic2 = 0; ic2 < comps2.length; ic2++) {
      if (compAssigned[im2][ic2] !== -1) continue;
      if (!componentCompatible(comps1[ic1], comps2[ic2])) continue;
      compAssigned[im2][ic2] = ic1;
      assignComponents(im1, im2, ic1 + 1);
      compAssigned[im2][ic2] = -1;
      if (overflow) return;
    }
  };

  const assignMolecules = (im1: number): void => {
    if (overflow) return;
    if (im1 === sg1.molecules.length) {
      const map: GraphMap = new Map();
      const compImage = new Map<string, string>();
      for (let im = 0; im < sg1.molecules.length; im++) {
        const im2 = molAssigned[im];
        map.set(`${im}`, `${im2}`);
        const mol1 = sg1.molecules[im];
        for (let ic = 0; ic < mol1.components.length; ic++) {
          const key = `${im}.${ic}`;
          const image = `${im2}.${compAssigned[im2][ic]}`;
          map.set(key, image);
          compImage.set(key, image);
        }
      }
      if (!checkEdges(compImage)) return;
      maps.push(map);
      if (maps.length > budget) overflow = true;
      return;
    }
    const mol1 = sg1.molecules[im1];
    for (let im2 = 0; im2 < sg2.molecules.length; im2++) {
      if (molAssigned[im2] !== -1) continue;
      const mol2 = sg2.molecules[im2];
      if (!moleculeCompatible(mol1, mol2)) continue;
      if (mol1.components.length > mol2.components.length) continue;
      molAssigned[im2] = im1;
      assignComponents(im1, im2, 0);
      molAssigned[im2] = -1;
      // Unwind the component assignment too: it is indexed by the TARGET
      // molecule, so a leaked entry would block every sibling branch.
      compAssigned[im2].fill(-1);
      if (overflow) return;
    }
  };

  assignMolecules(0);
  return overflow ? null : maps;
}

function countGraphEdges(graph: SpeciesGraph): number {
  let n = 0;
  for (const partners of graph.adjacency.values()) n += partners.length;
  return n / 2;
}

/** Each bond as an unordered pair, lower ("im", "ic") endpoint first. */
function collectEdges(graph: SpeciesGraph): Array<[string, string]> {
  const seen = new Set<string>();
  const out: Array<[string, string]> = [];
  for (const [key, partners] of graph.adjacency) {
    for (const partner of partners) {
      if (key === partner) continue;
      const a = key < partner ? key : partner;
      const b = key < partner ? partner : key;
      const id = `${a}|${b}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push([a, b]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Map::toString (Map.pm:35-60) -- the equality `find_reaction_center` uses
// ---------------------------------------------------------------------------

/**
 * The canonical string `find_reaction_center` hashes `p_auto` and `candP` into.
 * BioNetGen walks the map's SOURCE graph's molecules and, for each, its source
 * molecule's components, reading the image pointer's two indices.
 */
function mapSignature(graph: SpeciesGraph, map: GraphMap): string {
  let s = '';
  for (let im = 0; im < graph.molecules.length; im++) {
    const imTarget = map.get(`${im}`);
    if (imTarget === undefined) continue;
    s += ` ${Number(im) + 1}->${Number(imTarget) + 1}(`;
    const comps = graph.molecules[im].components;
    for (let ic = 0; ic < comps.length; ic++) {
      const image = map.get(`${im}.${ic}`);
      if (image === undefined) continue;
      const dot = image.indexOf('.');
      s += ` ${ic + 1}->${Number(dot === -1 ? image : image.slice(dot + 1)) + 1}`;
    }
    s += ')';
  }
  return s;
}

// ---------------------------------------------------------------------------
// Map::get_induced_permutation (Map.pm:105-179)
// ---------------------------------------------------------------------------

/**
 * `permP = map o autoR o map^-1` on the image of the rule map, identity on the
 * product nodes the rule creates.
 */
function inducedProductPermutation(
  autoR: GraphMap,
  corr: RuleCorrespondence,
  pg: SpeciesGraph
): GraphMap {
  const perm: GraphMap = new Map();
  for (let imP = 0; imP < pg.molecules.length; imP++) {
    const invMol = corr.molReverse.get(imP);
    const autoMol = invMol === undefined ? undefined : autoR.get(`${invMol}`);
    // `map o autoR o map^-1`; a product node the rule creates (`map^-1` has no
    // entry) is fixed.
    perm.set(`${imP}`, autoMol === undefined ? `${imP}` : `${corr.molForward.get(Number(autoMol))}`);
    const comps = pg.molecules[imP].components;
    for (let icP = 0; icP < comps.length; icP++) {
      const key = `${imP}.${icP}`;
      const invComp = corr.compReverse.get(key);
      const autoComp = invComp === undefined ? undefined : autoR.get(invComp);
      perm.set(key, autoComp === undefined ? key : corr.compForward.get(autoComp)!);
    }
  }
  return perm;
}

// ---------------------------------------------------------------------------
// find_reaction_center (RxnRule.pm:2659-2849)
// ---------------------------------------------------------------------------

export interface RuleDivisorResult {
  /** `( |RG| / |Stab| ) * crg_permutations` -- BioNetGen's `1 / multScale`. */
  divisor: number;
  ruleGroupSize: number;
  stabilizerSize: number;
  crgPermutations: number;
}

/** `RxnRule::factorial`. */
function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

const ruleDivisorCache = new WeakMap<RxnRule, RuleDivisorResult | null>();

/**
 * The divisor `find_reaction_center` applies, from the rule's own patterns.
 *
 * Returns `null` when the map enumeration exceeds `budget`; the caller then
 * treats the rule as carrying no division (divisor 1), which is BioNetGen's own
 * value for the large majority of rule instances (measured: every rule of
 * `zhang_2021`, every `igf1r_fit_all_*` rule, and most of `rafi_ground`).
 */
export function computeRuleDivisor(rule: RxnRule): RuleDivisorResult | null {
  const cached = ruleDivisorCache.get(rule);
  if (cached !== undefined) return cached;
  const result = computeRuleDivisorUncached(rule);
  ruleDivisorCache.set(rule, result);
  return result;
}

function computeRuleDivisorUncached(rule: RxnRule): RuleDivisorResult | null {
  const rg = mergeRuleGraphs(rule.reactants);
  const pg = mergeRuleGraphs(rule.products);
  const corr = computeRuleCorrespondence(rg, pg);

  // ---- r_auto, restricted to automorphisms that permute the reactant patterns
  const allRAuto = enumerateSubgraphMaps(rg.graph, rg.graph, RULE_MAP_BUDGET);
  if (allRAuto === null) return null;
  const rAuto = allRAuto.filter(auto => preservesPatternPartition(auto, rg.aggMap));

  // ---- p_auto
  const pAuto = enumerateSubgraphMaps(pg.graph, pg.graph, RULE_MAP_BUDGET);
  if (pAuto === null) return null;
  const pAutoSignatures = new Set(pAuto.map(m => mapSignature(pg.graph, m)));

  // ---- RG = { alpha in r_auto : map o alpha o map^-1 in p_auto }
  let ruleGroupSize = 0;
  let stabilizerSize = 0;
  const reactionCenter = rule.reactionCenter ?? rule.reactants.map(() => [] as string[]);
  for (const auto of rAuto) {
    const permP = inducedProductPermutation(auto, corr, pg.graph);
    if (!pAutoSignatures.has(mapSignature(pg.graph, permP))) continue;
    ruleGroupSize++;
    if (fixesReactionCenter(auto, rg, reactionCenter)) stabilizerSize++;
  }

  // ---- crg_permutations
  let crgPermutations = 1;
  const context: SpeciesGraph[] = [];
  for (let i = 0; i < rule.reactants.length; i++) {
    if ((reactionCenter[i] ?? []).length === 0) context.push(rule.reactants[i]);
  }
  while (context.length > 0) {
    const crg = context.shift()!;
    let instances = 1;
    let iR = 0;
    while (iR < context.length) {
      if (isSubgraphMap(crg, context[iR]) && isSubgraphMap(context[iR], crg)) {
        context.splice(iR, 1);
        instances++;
      } else {
        iR++;
      }
    }
    crgPermutations *= factorial(instances);
  }
  // The identity automorphism is always in RG and always fixes the centre, so an
  // empty Stab means the search itself is inconsistent. Report "unknown" rather
  // than emitting a NaN divisor.
  if (stabilizerSize === 0) return null;

  // `1 / (@RuleGroup/@StabRxnCntr) / $crg_permutations` -- the Perl divides
  // scalars, so the orbit-stabilizer index is truncated; it is an integer index
  // of a subgroup, so the truncation is exact.
  const index = Math.floor(ruleGroupSize / stabilizerSize);
  return {
    divisor: index * crgPermutations,
    ruleGroupSize,
    stabilizerSize,
    crgPermutations,
  };
}

/** RxnRule.pm:2681-2717 -- the merged graph loses pattern boundaries; keep only the automorphisms that induce a permutation of the patterns. */
function preservesPatternPartition(auto: GraphMap, aggMap: string[]): boolean {
  const patternImage = new Map<number, number>();
  const imagePattern = new Map<number, number>();
  for (const [source, target] of auto) {
    if (!/^\d+$/.test(source)) continue;
    if (!/^\d+$/.test(target)) return false;
    const sourcePattern = Number(aggMap[Number(source)].split('.')[0]);
    const targetPattern = Number(aggMap[Number(target)].split('.')[0]);
    const seenImage = patternImage.get(sourcePattern);
    if (seenImage !== undefined && seenImage !== targetPattern) return false;
    const seenPreimage = imagePattern.get(targetPattern);
    if (seenPreimage !== undefined && seenPreimage !== sourcePattern) return false;
    patternImage.set(sourcePattern, targetPattern);
    imagePattern.set(targetPattern, sourcePattern);
  }
  return true;
}

/**
 * The `p.m` (or `p.m.c`) prefix of a reaction-centre element, matched exactly as
 * `RxnRule.pm:2774` does with `/^(\d+\.\d+)/`.
 */
const AGGREGATE_PREFIX = /^\d+\.\d+/;



/** RxnRule.pm:2750-2810 -- pointwise stabiliser of the reaction centre. */
function fixesReactionCenter(
  auto: GraphMap,
  rg: { aggMap: string[]; patternOf: number[] },
  reactionCenter: string[][]
): boolean {
  const patternMap = new Map<number, number>();
  for (let im = 0; im < rg.patternOf.length; im++) {
    const image = auto.get(`${im}`);
    if (image === undefined || !/^\d+$/.test(image)) return false;
    patternMap.set(rg.patternOf[im], rg.patternOf[Number(image)]);
  }

  for (const center of reactionCenter) {
    for (const element of center) {
      const dot = element.indexOf('.');
      if (dot === -1) {
        // A bare pattern index: tested through the induced pattern map.
        const image = patternMap.get(Number(element));
        if (image === undefined || image !== Number(element)) return false;
        continue;
      }
      // A molecule (`p.m`) or component (`p.m.c`) element, tested in AGGREGATE
      // coordinates: the `p.m` prefix is replaced by the merged molecule index.
      const prefix = AGGREGATE_PREFIX.exec(element)?.[0];
      if (prefix === undefined) return false;
      let mergedPrefix = -1;
      for (let i = 0; i < rg.aggMap.length; i++) {
        if (rg.aggMap[i] === prefix) { mergedPrefix = i; break; }
      }
      if (mergedPrefix === -1) return false;
      const aggregatePointer = `${mergedPrefix}${element.slice(prefix.length)}`;
      if (auto.get(aggregatePointer) !== aggregatePointer) return false;
    }
  }
  return true;
}

/** Non-empty `isomorphicToSubgraph`, short-circuiting on the first map. */
function isSubgraphMap(sg1: SpeciesGraph, sg2: SpeciesGraph): boolean {
  const maps = enumerateSubgraphMaps(sg1, sg2, 1);
  return maps !== null && maps.length > 0;
}