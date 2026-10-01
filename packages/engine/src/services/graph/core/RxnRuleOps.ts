// graph/core/RxnRuleOps.ts
//
// Direct transcription of BioNetGen 2.9.3 (akutuva21/bionetgen @ 3513bca7):
//
//   Perl2/SpeciesGraph.pm  buildLabelMap  / buildPointerMap / findMaps
//   Perl2/RxnRule.pm       findMap        (op-list construction, lines 2034-2658)
//   Perl2/RxnRule.pm       find_reaction_center (lines 3416-3504)
//   Perl2/RxnRule.pm       filter_identical_by_rxn_center (lines 3513-3591)
//
// The three functions here exist only to support the reaction centre and the
// identical-match filter. Nothing in here influences network *shape*.
//
// Pointer conventions (Jim's notation, as in BNG2):
//   "iPatt.iMol"      molecule iMol of reactant pattern iPatt
//   "iPatt.iMol.iComp" component iComp of that molecule
// Aggregate ("merged") graph molecule indices are the concatenation of the
// reactant (resp. product) patterns in order, which is what aggMapR / aggMapP
// hold in the Perl source and what RxnRule's op arrays are documented to use.

import { SpeciesGraph } from './SpeciesGraph.ts';
import { MatchMap } from './Matcher.ts';
import type { RxnRule } from './RxnRule.ts';

/** A rule's reactant (or product) patterns merged into one graph. */
export interface MergedRuleGraph {
  graph: SpeciesGraph;
  /** aggMap[i] = "iPatt.iMol" for merged molecule index i. */
  aggMap: string[];
  /** patternOf[i] = index of the pattern merged molecule i came from. */
  patternOf: number[];
}

/**
 * SpeciesGraph::copymerge — concatenate patterns into one graph.
 * Molecule i of pattern p becomes merged molecule `base[p] + i`.
 */
export function mergeRuleGraphs(patterns: SpeciesGraph[]): MergedRuleGraph {
  const molecules = [];
  const aggMap: string[] = [];
  const patternOf: number[] = [];
  let offset = 0;
  const adjacency = new Map<string, string[]>();
  for (let ipatt = 0; ipatt < patterns.length; ipatt++) {
    const src = patterns[ipatt];
    for (let imol = 0; imol < src.molecules.length; imol++) {
      molecules.push(src.molecules[imol]);
      aggMap.push(`${ipatt}.${imol}`);
      patternOf.push(ipatt);
    }
    for (const [key, partners] of src.adjacency) {
      const dot = key.indexOf('.');
      const mol = Number(key.slice(0, dot));
      for (const partner of partners) {
        const pDot = partner.indexOf('.');
        adjacency.set(
          `${offset + mol}.${key.slice(dot + 1)}`,
          [`${offset + Number(partner.slice(0, pDot))}.${partner.slice(pDot + 1)}`]
        );
      }
    }
    offset += src.molecules.length;
  }
  const graph = new SpeciesGraph(molecules);
  graph.adjacency = adjacency;
  return { graph, aggMap, patternOf };
}

/** All bonds of a graph as unordered pairs of "mol.comp" pointers. */
function graphEdges(graph: SpeciesGraph): Array<[string, string]> {
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

/** Does the graph have a bond between these two "mol.comp" pointers? */
function hasEdge(graph: SpeciesGraph, a: string, b: string): boolean {
  const partners = graph.adjacency.get(a);
  if (!partners) return false;
  return partners.includes(b);
}

/**
 * SpeciesGraph::buildLabelMap (SpeciesGraph.pm:3508).
 * label -> merged molecule index, or "mol.comp" for components.
 * A molecule's label is `Name_<sorted component names>_<replicate>`, so
 * interchangeable molecules are paired in index order (replicate k <-> k),
 * and so are repeated component names within a molecule.
 */
export function buildLabelMap(graph: SpeciesGraph): Map<string, number | string> {
  const labelMap = new Map<string, number | string>();
  const seen = new Map<string, number>();
  const bump = (key: string): number => {
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n;
  };
  for (let im = 0; im < graph.molecules.length; im++) {
    const mol = graph.molecules[im];
    const clabels: string[] = mol.components.map(c => c.name);
    let mlabel: string;
    if (mol.label) {
      mlabel = `%${mol.label}`;
    } else {
      mlabel = `${mol.name}_${[...clabels].sort().join('_')}_`;
      mlabel += bump(mlabel);
    }
    labelMap.set(mlabel, im);
    for (let ic = 0; ic < clabels.length; ic++) {
      let clabel = clabels[ic];
      if (!clabel.startsWith('%')) {
        clabel = `${mlabel}|${clabel}_`;
        clabel += bump(clabel);
      }
      labelMap.set(clabel, `${im}.${ic}`);
    }
  }
  return labelMap;
}

/** SpeciesGraph::buildPointerMap (SpeciesGraph.pm:3472). */
export function buildPointerMap(
  labelMap1: Map<string, number | string>,
  labelMap2: Map<string, number | string>
): Map<string | number, number | string> {
  const pmap = new Map<string | number, number | string>();
  for (const [label, index1] of labelMap1) {
    pmap.set(index1, labelMap2.has(label) ? (labelMap2.get(label) as number | string) : -1);
  }
  return pmap;
}

const pointerPattern = /^\d+\.?\d*(?:\.\d+)?$/;

/**
 * SpeciesGraph::findMaps (SpeciesGraph.pm:3437) applied to the merged reactant
 * and product graphs, exactly as RxnRule::findMap does at line 2078.
 *
 * Note this is NOT a graph search: it is a label-to-label pairing, so the
 * correspondence is fully determined (interchangeable molecules and repeated
 * component names pair up in index order).
 *
 * Keys and values are merged-graph pointers `"im"` / `"im.ic"`. Rule pointers
 * (`"iPatt.iMol[.iComp]"`) share that shape and would collide with them, so the
 * conversion happens only when an op is emitted.
 */
export interface RuleCorrespondence {
  /** Merged reactant molecule index -> merged product molecule index. */
  molForward: Map<number, number>;
  /** Merged product molecule index -> merged reactant molecule index. */
  molReverse: Map<number, number>;
  /** `"imR.icR"` -> `"imP.icP"`. */
  compForward: Map<string, string>;
  /** `"imP.icP"` -> `"imR.icR"`. */
  compReverse: Map<string, string>;
}

export function computeRuleCorrespondence(rg: MergedRuleGraph, pg: MergedRuleGraph): RuleCorrespondence {
  const forward = buildPointerMap(buildLabelMap(rg.graph), buildLabelMap(pg.graph));
  const reverse = buildPointerMap(buildLabelMap(pg.graph), buildLabelMap(rg.graph));

  const molForward = new Map<number, number>();
  const molReverse = new Map<number, number>();
  const compForward = new Map<string, string>();
  const compReverse = new Map<string, string>();

  for (let imR = 0; imR < rg.graph.molecules.length; imR++) {
    const target = forward.get(imR);
    if (typeof target === 'number' && target >= 0) {
      molForward.set(imR, target);
      molReverse.set(target, imR);
    }
  }
  for (let imR = 0; imR < rg.graph.molecules.length; imR++) {
    const nR = rg.graph.molecules[imR].components.length;
    for (let icR = 0; icR < nR; icR++) {
      const target = forward.get(`${imR}.${icR}`);
      if (typeof target === 'string' && target !== '-1') compForward.set(`${imR}.${icR}`, target);
    }
  }
  for (let imP = 0; imP < pg.graph.molecules.length; imP++) {
    const nP = pg.graph.molecules[imP].components.length;
    for (let icP = 0; icP < nP; icP++) {
      const target = reverse.get(`${imP}.${icP}`);
      if (typeof target === 'string' && target !== '-1') compReverse.set(`${imP}.${icP}`, target);
    }
  }
  return { molForward, molReverse, compForward, compReverse };
}

const patternOfPointer = (ptr: string): number => Number(ptr.split('.')[0]);
const moleculeOfPointer = (ptr: string): number => Number(ptr.slice(ptr.indexOf('.') + 1).split('.')[0]);


/**
 * RxnRule::findMap op-list construction (RxnRule.pm:2034-2658), restricted to
 * the five lists `find_reaction_center` reads.
 */
export interface RuleOperations {
  edgeAdd: Array<[string, string]>;
  /** The same additions, as merged-product-graph "im.ic" pointers. */
  edgeAddMerged: Array<[string, string]>;
  edgeDel: Array<[string, string]>;
  molDel: string[];
  speciesDel: number[];
  compStateChange: Array<[string, string | undefined, string | undefined]>;
  changeCompartment: Array<[string, string]>;
  speciesCompartmentChange: number[];
  /** Merged product molecule index -> merged reactant molecule index, or -1. */
  productMoleculeSource: number[];
  corr: RuleCorrespondence;
  rg: MergedRuleGraph;
  pg: MergedRuleGraph;
}

export function computeRuleOperations(rule: RxnRule): RuleOperations {
  const rg = mergeRuleGraphs(rule.reactants);
  const pg = mergeRuleGraphs(rule.products);
  const corr = computeRuleCorrespondence(rg, pg);

  // Merged molecule index -> "iPatt.iMol" rule pointer.
  const ptrR = (im: number): string => rg.aggMap[im];
  // Merged "im.ic" -> "iPatt.iMol.iComp" rule pointer.
  const ptrRc = (im: number, ic: number): string => `${rg.aggMap[im]}.${ic}`;
  const ptrPc = (im: number, ic: number): string => `${pg.aggMap[im]}.${ic}`;

  // ---- MolDel (RxnRule.pm:2088-2113) ----
  const molDel: string[] = [];
  const speciesDel: number[] = [];
  const deletedMergedMols = new Set<number>();
  const base = new Array<number>(rule.reactants.length).fill(-1);
  for (let im = 0; im < rg.patternOf.length; im++) {
    if (base[rg.patternOf[im]] === -1) base[rg.patternOf[im]] = im;
  }
  for (let iR = 0; iR < rule.reactants.length; iR++) {
    const nMol = rule.reactants[iR].molecules.length;
    const deleted: number[] = [];
    for (let m = 0; m < nMol; m++) {
      const im = base[iR] + m;
      if (corr.molForward.has(im)) continue;
      deleted.push(im);
      deletedMergedMols.add(im);
    }
    if (deleted.length === 0) continue;
    // RxnRule.pm:2103-2112 — the two forms are alternatives, never both: either
    // per-molecule pointers (DeleteMolecules keyword, or only some of the
    // pattern's molecules are consumed) or, when every molecule is consumed
    // without the keyword, a single bare species pointer.
    if (rule.isDeleteMolecules || deleted.length < nMol) {
      for (const im of deleted) molDel.push(ptrR(im));
    } else {
      speciesDel.push(iR);
    }
  }

  // ---- EdgeDel / EdgeAdd (RxnRule.pm:2149-2212) ----
  const edgeDel: Array<[string, string]> = [];
  const edgeAdd: Array<[string, string]> = [];
  const eused = new Set<string>();
  for (const [p1R, p2R] of graphEdges(rg.graph)) {
    const p1P = corr.compForward.get(p1R);
    const p2P = corr.compForward.get(p2R);
    if (p1P === undefined || p2P === undefined) continue;
    if (hasEdge(pg.graph, p1P, p2P)) {
      eused.add([p1P, p2P].sort().join('|'));
      continue;
    }
    const im1 = Number(p1R.slice(0, p1R.indexOf('.')));
    const im2 = Number(p2R.slice(0, p2R.indexOf('.')));
    // Edges inside a deleted molecule or deleted species disappear as a
    // side-effect and are not separate operations.
    if (deletedMergedMols.has(im1) || deletedMergedMols.has(im2)) continue;
    if (speciesDel.includes(rg.patternOf[im1])) continue;
    edgeDel.push([
      ptrRc(im1, Number(p1R.slice(p1R.indexOf('.') + 1))),
      ptrRc(im2, Number(p2R.slice(p2R.indexOf('.') + 1))),
    ]);
  }
  const edgeAddMerged: Array<[string, string]> = [];
  for (const [p1P, p2P] of graphEdges(pg.graph)) {
    if (eused.has([p1P, p2P].sort().join('|'))) continue;
    edgeAddMerged.push([p1P, p2P]);
    edgeAdd.push([
      ptrPc(Number(p1P.slice(0, p1P.indexOf('.'))), Number(p1P.slice(p1P.indexOf('.') + 1))),
      ptrPc(Number(p2P.slice(0, p2P.indexOf('.'))), Number(p2P.slice(p2P.indexOf('.') + 1))),
    ]);
  }

  // ---- CompStateChange (RxnRule.pm:2253-2290) ----
  const compStateChange: Array<[string, string | undefined, string | undefined]> = [];
  for (let imR = 0; imR < rg.graph.molecules.length; imR++) {
    for (let icR = 0; icR < rg.graph.molecules[imR].components.length; icR++) {
      const image = corr.compForward.get(`${imR}.${icR}`);
      if (image === undefined) continue;
      const dot = image.indexOf('.');
      const imP = Number(image.slice(0, dot));
      const icP = Number(image.slice(dot + 1));
      const stateR = rg.graph.molecules[imR].components[icR].state;
      const stateP = pg.graph.molecules[imP]?.components[icP]?.state;
      if ((stateR ?? '') !== (stateP ?? '')) {
        compStateChange.push([ptrRc(imR, icR), stateR, stateP]);
      }
    }
  }

  // ---- ChangeCompartment ----
  // Pattern-level (species transport), RxnRule.pm:2501-2556: a reactant pattern
  // whose compartment differs from its product pattern's.
  const mapPattR = patternCorrespondence(rule, rg, pg, corr);
  const speciesCompartmentChange: number[] = [];
  for (let i = 0; i < rule.reactants.length; i++) {
    const target = mapPattR[i];
    if (target < 0) continue;
    const compR = rule.reactants[i].compartment;
    const compP = rule.products[target].compartment;
    if (compR === undefined || compP === undefined || compR === compP) continue;
    speciesCompartmentChange.push(i);
  }
  // Molecule-level transport, RxnRule.pm:2641-2648.
  const changeCompartment: Array<[string, string]> = [];
  for (let imR = 0; imR < rg.graph.molecules.length; imR++) {
    const imP = corr.molForward.get(imR);
    if (imP === undefined) continue;
    const compR = rg.graph.molecules[imR].compartment;
    const compP = pg.graph.molecules[imP]?.compartment;
    if (compR === undefined || compP === undefined || compR === compP) continue;
    changeCompartment.push([ptrR(imR), compP]);
  }

  const productMoleculeSource: number[] = [];
  for (let imP = 0; imP < pg.graph.molecules.length; imP++) {
    productMoleculeSource.push(corr.molReverse.get(imP) ?? -1);
  }

  return {
    edgeAdd, edgeAddMerged, edgeDel, molDel, speciesDel, compStateChange,
    changeCompartment, speciesCompartmentChange, productMoleculeSource,
    corr, rg, pg,
  };
}

/**
 * The `mapPattR` of RxnRule.pm:2425-2480: reactant pattern -> product pattern,
 * -1 when deleted, -2 when the molecule-level map is inconsistent.
 */
function patternCorrespondence(
  rule: RxnRule,
  rg: MergedRuleGraph,
  pg: MergedRuleGraph,
  corr: RuleCorrespondence
): number[] {
  const nR = rule.reactants.length;
  const mapPattR: number[] = new Array(nR).fill(-2);
  for (let i = 0; i < nR; i++) {
    let assigned: number | null = null;
    for (let im = 0; im < rg.patternOf.length; im++) {
      if (rg.patternOf[im] !== i) continue;
      const imP = corr.molForward.get(im);
      const iP = imP === undefined ? -1 : pg.patternOf[imP];
      if (assigned === null) assigned = iP;
      else if (assigned !== iP) assigned = -2;
    }
    mapPattR[i] = assigned === null ? -2 : assigned;
  }
  // Reverse direction, then cross-check (steps ii and iii).
  const mapPattP: number[] = new Array(rule.products.length).fill(-2);
  for (let p = 0; p < rule.products.length; p++) {
    let assigned: number | null = null;
    for (let im = 0; im < pg.patternOf.length; im++) {
      if (pg.patternOf[im] !== p) continue;
      const imR = corr.molReverse.get(im);
      if (imR === undefined) continue;
      const iR = rg.patternOf[imR];
      if (assigned === null) assigned = iR;
      else if (assigned !== iR) assigned = -2;
    }
    mapPattP[p] = assigned === null ? -2 : assigned;
  }
  for (let i = 0; i < nR; i++) {
    if (mapPattR[i] < 0) continue;
    if (i !== mapPattP[mapPattR[i]]) mapPattR[i] = -2;
  }
  return mapPattR;
}

/**
 * RxnRule::find_reaction_center (RxnRule.pm:3416-3504).
 * Returns, per reactant pattern, the list of reaction-centre node pointers:
 * the components whose bond or state changes, the molecules whose compartment
 * changes, and the molecules or species the rule deletes.
 */
export function reactionCenterFromOperations(rule: RxnRule, ops: RuleOperations): string[][] {
  const { corr, rg } = ops;

  const sets: Array<Set<string>> = rule.reactants.map(() => new Set<string>());
  const add = (ptr: string) => {
    if (!pointerPattern.test(ptr)) return;
    const iP = patternOfPointer(ptr);
    if (!(iP >= 0) || iP >= sets.length) return;
    sets[iP].add(ptr);
  };
  // Edge additions live in product space (merged "im.ic" pointers); map each
  // endpoint back to the reactant pointer it came from.
  const toReactantPointer = (ptr: string): string | undefined => {
    const dot = ptr.indexOf('.');
    const im = Number(ptr.slice(0, dot));
    const ic = Number(ptr.slice(dot + 1));
    const imR = corr.molReverse.get(im);
    if (imR === undefined) return undefined;
    const target = corr.compReverse.get(`${im}.${ic}`);
    if (target === undefined) return rg.aggMap[imR];
    const tDot = target.indexOf('.');
    return `${rg.aggMap[Number(target.slice(0, tDot))]}.${target.slice(tDot + 1)}`;
  };
  for (const [t1, t2] of ops.edgeAddMerged) {
    const r1 = toReactantPointer(t1);
    const r2 = toReactantPointer(t2);
    if (r1 !== undefined) add(r1);
    if (r2 !== undefined) add(r2);
  }
  for (const [t1, t2] of ops.edgeDel) {
    add(t1);
    add(t2);
  }
  for (const ptr of ops.molDel) add(ptr);
  for (const p of ops.speciesDel) add(String(p));
  for (const [ptr] of ops.compStateChange) add(ptr);
  for (const [ptr] of ops.changeCompartment) add(ptr);
  for (const p of ops.speciesCompartmentChange) add(String(p));

  // Stored-order list; the Perl original emits `keys %hash`, whose order does
  // not affect the filter (every match is projected through the same list).
  return sets.map(s => [...s]);
}

/**
 * RxnRule::filter_identical_by_rxn_center (RxnRule.pm:3513-3591).
 *
 * Keeps one match per distinct image of the reaction centre. The images are
 * compared element by element in stored order, so a pure reordering is NOT a
 * match. Matches are spliced out of `matches` in place, mirroring the Perl.
 */
export function filterIdenticalByRxnCenter(
  matches: MatchMap[],
  reactionCenter: string[],
  iPatt: number
): void {
  if (matches.length <= 1) return;

  const images: string[][] = matches.map(match => {
    const image: string[] = [];
    for (const node of reactionCenter) {
      const rest = node.slice(node.indexOf('.') + 1);
      const iMC = node.indexOf('.') === -1 ? '' : rest;
      if (iMC !== '') {
        const dot = iMC.indexOf('.');
        if (dot === -1) {
          // molecule node
          const targetMol = match.moleculeMap.get(Number(iMC));
          image.push(targetMol === undefined ? `${iPatt}.undefined` : `${iPatt}.${targetMol}`);
        } else {
          const target = match.componentMap.get(iMC);
          image.push(target === undefined ? `${iPatt}.undefined` : `${iPatt}.${target}`);
        }
      } else {
        image.push(`${iPatt}`);
      }
    }
    return image;
  });

  for (let iMatch = 0; iMatch < images.length; iMatch++) {
    const template = images[iMatch];
    for (let jMatch = iMatch + 1; jMatch < images.length; jMatch++) {
      const image = images[jMatch];
      let same = true;
      for (let k = 0; k < template.length; k++) {
        if (template[k] !== image[k]) {
          same = false;
          break;
        }
      }
      if (!same) continue;
      matches.splice(jMatch, 1);
      images.splice(jMatch, 1);
      jMatch--;
    }
  }
}