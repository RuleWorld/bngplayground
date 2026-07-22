/**
 * SBML `multi` (multistate/multicomponent species) → BNGL molecule types and complexes.
 *
 * The bundled libsbmljs build exposes no getPlugin, so this reads the multi elements directly from
 * the source XML. This extractor was developed and validated against the real, spec-authors' models
 * shipped with libSBML (examples/sample-models/multi/*), not synthetic fixtures.
 *
 * Two structural idioms exist in the wild:
 *
 *  (1) The canonical spec idiom (e.g. multi_example1.xml): binding sites are declared as
 *      <bindingSiteSpeciesType>, a molecule <speciesType> holds them as <speciesTypeInstance>s, and
 *      complexes are speciesTypes whose instances are molecule speciesTypes, bonded via
 *      <inSpeciesTypeBond> through <speciesTypeComponentIndex> (component + identifyingParent).
 *      This idiom is FULLY reconstructed: molecule types like `Ecad(cis,trans)` and complexes like
 *      `Ecad(cis,trans!1).Ecad(cis,trans!1)`.
 *
 *  (2) The Simmune multi-layer idiom (e.g. YeastMAPK.xml): a deeper cps → mol → mcp → bst hierarchy
 *      where the "molecule" boundary is a naming convention, not a structural invariant. There is no
 *      reliable structural rule that finds the molecule boundary for BOTH idioms, so rather than
 *      mis-flatten distinct molecules together, this idiom is DETECTED and reported with molecule
 *      names, but its complexes are not reconstructed. A wrong flatten is worse than an honest gap.
 *
 * Everything produced here is emitted as a commented reference in the BNGL, never fed into the
 * simulated network — that end-to-end wiring needs validation against real models the target engine
 * can actually run, which this environment cannot do.
 */

import type { SBMLImportWarning } from '../config/types';

export interface MultiParseResult {
  present: boolean;
  /** True when the model uses the deep (Simmune-style) idiom that is detected but not reconstructed. */
  deep: boolean;
  /** BNGL molecule-type declaration lines, e.g. "Ecad(cis,trans)" (shallow idiom only). */
  bnglMoleculeTypes: string[];
  /** Reconstructed BNGL complex patterns, e.g. "Ecad(cis,trans!1).Ecad(cis,trans!1)" (shallow only). */
  complexPatterns: Array<{ typeId: string; pattern: string }>;
  /** Retained for interface compatibility; concrete seed patterns are not reconstructed here. */
  seedPatterns: Array<{ species: string; pattern: string }>;
  warnings: SBMLImportWarning[];
}

const A = (attrs: string, name: string): string | null => {
  const m = (attrs || '').match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] ?? m[2] ?? '') : null;
};
const clean = (s: string): string => (s || '').replace(/[^A-Za-z0-9_]/g, '_');

function multiPrefix(xml: string): string | null {
  const m = xml.match(/xmlns:([A-Za-z0-9_]+)\s*=\s*["']http:\/\/www\.sbml\.org\/sbml\/level3\/version\d+\/multi\/version\d+["']/i);
  return m ? m[1] : null;
}

/** Inner text of the first `<pfx:tag ...> ... </pfx:tag>` (empty pfx = core namespace element). */
function block(scope: string, pfx: string, tag: string): string | null {
  const p = pfx ? pfx + ':' : '';
  const m = scope.match(new RegExp(`<${p}${tag}\\b[^>]*>([\\s\\S]*?)</${p}${tag}>`, 'i'));
  return m ? m[1] : null;
}

/** Iterate `<pfx:tag ...>...</pfx:tag>` or self-closing `<pfx:tag .../>` (empty pfx = core ns). */
function* elements(scope: string, pfx: string, tag: string): Generator<{ attrs: string; inner: string }> {
  const p = pfx ? pfx + ':' : '';
  const re = new RegExp(`<${p}${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${p}${tag}>)`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(scope)) !== null) yield { attrs: m[1] || '', inner: m[2] || '' };
}

interface TypeDef {
  id: string;
  name: string;
  features: Array<{ name: string; states: string[] }>;
  inst: Array<{ id: string; typeId: string; name: string }>;
  ci: Map<string, { component: string; parent: string }>;
  bonds: Array<{ s1: string; s2: string }>;
}

export function parseMultiPackage(sbmlString: string): MultiParseResult {
  const warnings: SBMLImportWarning[] = [];
  const empty: MultiParseResult = {
    present: false, deep: false, bnglMoleculeTypes: [], complexPatterns: [], seedPatterns: [], warnings,
  };
  if (!sbmlString) return empty;
  const pfx = multiPrefix(sbmlString);
  if (!pfx) return empty;

  const listTypes = block(sbmlString, pfx, 'listOfSpeciesTypes');
  if (!listTypes) {
    warnings.push({ category: 'package:multi', message: 'multi package present but no <listOfSpeciesTypes> found.', count: 1, severity: 'info' });
    return { ...empty, present: true };
  }

  // Binding-site species types (leaf sites).
  const bst = new Set<string>();
  for (const b of elements(listTypes, pfx, 'bindingSiteSpeciesType')) {
    const id = A(b.attrs, 'id'); if (id) bst.add(id);
  }

  // Every regular speciesType.
  const types = new Map<string, TypeDef>();
  for (const st of elements(listTypes, pfx, 'speciesType')) {
    const id = A(st.attrs, 'id'); if (!id) continue;
    const name = clean(A(st.attrs, 'name') || id);
    const features: TypeDef['features'] = [];
    const ftB = block(st.inner, pfx, 'listOfSpeciesFeatureTypes');
    if (ftB) {
      for (const ft of elements(ftB, pfx, 'speciesFeatureType')) {
        const states: string[] = [];
        const poss = block(ft.inner, pfx, 'listOfPossibleSpeciesFeatureValues');
        if (poss) {
          for (const pv of elements(poss, pfx, 'possibleSpeciesFeatureValue')) {
            const lab = clean(A(pv.attrs, 'name') || A(pv.attrs, 'id') || '');
            if (lab) states.push(lab);
          }
        }
        features.push({ name: clean(A(ft.attrs, 'name') || A(ft.attrs, 'id') || ''), states });
      }
    }
    const inst: TypeDef['inst'] = [];
    const ib = block(st.inner, pfx, 'listOfSpeciesTypeInstances');
    if (ib) {
      for (const i of elements(ib, pfx, 'speciesTypeInstance')) {
        const iid = A(i.attrs, 'id'); const ity = A(i.attrs, 'speciesType');
        if (iid && ity) inst.push({ id: iid, typeId: ity, name: clean(A(i.attrs, 'name') || iid) });
      }
    }
    const ci = new Map<string, { component: string; parent: string }>();
    const cib = block(st.inner, pfx, 'listOfSpeciesTypeComponentIndexes');
    if (cib) {
      for (const c of elements(cib, pfx, 'speciesTypeComponentIndex')) {
        const cid = A(c.attrs, 'id');
        if (cid) ci.set(cid, { component: A(c.attrs, 'component') || '', parent: A(c.attrs, 'identifyingParent') || '' });
      }
    }
    const bonds: TypeDef['bonds'] = [];
    const bb = block(st.inner, pfx, 'listOfInSpeciesTypeBonds');
    if (bb) {
      for (const bd of elements(bb, pfx, 'inSpeciesTypeBond')) {
        const s1 = A(bd.attrs, 'bindingSite1'); const s2 = A(bd.attrs, 'bindingSite2');
        if (s1 && s2) bonds.push({ s1, s2 });
      }
    }
    types.set(id, { id, name, features, inst, ci, bonds });
  }

  // A "container" is a speciesType with at least one speciesType (non-bst) instance.
  const isContainer = (t: TypeDef): boolean => t.inst.some(i => types.has(i.typeId));
  // Top types = those species reference directly.
  const topTypes = new Set(
    [...sbmlString.matchAll(new RegExp(`${pfx}:speciesType="([^"]+)"`, 'g'))].map(m => m[1]).filter(id => types.has(id))
  );
  // Deep (Simmune) idiom: a top type contains an instance whose type is itself a container.
  let deep = false;
  for (const tid of topTypes) {
    const t = types.get(tid)!;
    if (t.inst.some(i => { const it = types.get(i.typeId); return it && isContainer(it); })) { deep = true; break; }
  }

  const sitesOf = (t: TypeDef): Array<{ keys: Set<string>; label: string }> =>
    t.inst.filter(i => bst.has(i.typeId)).map(i => ({ keys: new Set([i.id, i.typeId, i.name]), label: clean(i.name || i.id) }));
  const declOf = (t: TypeDef): string => {
    const feats = t.features.map(f => `${f.name}~${f.states.join('~')}`);
    const sites = sitesOf(t).map(s => s.label);
    return `${t.name}(${[...feats, ...sites].join(',')})`;
  };

  if (deep) {
    const names = [...new Set(
      [...types.values()].map(t => t.name).filter(n => !/^(mcp|bst|cps|mol)[_-]?\d/i.test(n))
    )];
    warnings.push({
      category: 'package:multi',
      message: `multi package uses a multi-layer (Simmune-style: complex → molecule → component → binding-site) hierarchy. The molecule boundary in that idiom is a naming convention, not a structural invariant, so complexes are NOT reconstructed (a wrong flatten would merge distinct molecules). Molecule names present: ${names.slice(0, 20).join(', ')}${names.length > 20 ? ', …' : ''}.`,
      count: 1, severity: 'approximated',
    });
    return { present: true, deep: true, bnglMoleculeTypes: [], complexPatterns: [], seedPatterns: [], warnings };
  }

  // Shallow (canonical spec) idiom — full reconstruction.
  const molTypeIds = new Set<string>();
  for (const tid of topTypes) {
    const t = types.get(tid)!;
    const subs = t.inst.filter(i => types.has(i.typeId));
    if (subs.length === 0) molTypeIds.add(tid);          // top type is itself a single molecule
    else subs.forEach(i => molTypeIds.add(i.typeId));    // its instances are molecules (complex)
  }
  const bnglMoleculeTypes = [...new Set([...molTypeIds].map(id => declOf(types.get(id)!)))];

  const complexPatterns: Array<{ typeId: string; pattern: string }> = [];
  let unresolved = 0;
  for (const tid of topTypes) {
    const t = types.get(tid)!;
    const subs = t.inst.filter(i => types.has(i.typeId));
    if (subs.length === 0) continue; // single molecule, no complex
    const sub = (iid: string) => subs.find(x => x.id === iid);
    const sofi = (iid: string) => { const s = sub(iid); return s ? sitesOf(types.get(s.typeId)!) : []; };
    const mn = (iid: string) => { const s = sub(iid); return s ? types.get(s.typeId)!.name : clean(iid); };
    const resolve = (ref: string): { inst: string; label: string } | null => {
      const c = t.ci.get(ref); const comp = c ? c.component : ref; const parent = c ? c.parent : '';
      let inst = '';
      if (parent && sub(parent)) inst = parent;
      else if (sub(comp)) inst = comp;
      if (!inst) return null;
      const ss = sofi(inst);
      let site = ss.find(x => x.keys.has(comp));
      if (!site && ss.length === 1) site = ss[0];
      if (!site) return null;
      return { inst, label: site.label };
    };
    const bmap = new Map<string, Map<string, number>>();
    const add = (i: string, l: string, b: number) => { const m = bmap.get(i) || new Map(); m.set(l, b); bmap.set(i, m); };
    let ok = true; let bn = 0;
    for (const bd of t.bonds) {
      const e1 = resolve(bd.s1); const e2 = resolve(bd.s2);
      if (!e1 || !e2) { ok = false; break; }
      bn += 1; add(e1.inst, e1.label, bn); add(e2.inst, e2.label, bn);
    }
    if (!ok) { unresolved += 1; continue; }
    const mols = subs.map(i => {
      const ss = sofi(i.id); const bm = bmap.get(i.id) || new Map();
      return `${mn(i.id)}(${ss.map(s => bm.has(s.label) ? `${s.label}!${bm.get(s.label)}` : s.label).join(',')})`;
    });
    complexPatterns.push({ typeId: tid, pattern: mols.join('.') });
  }

  if (unresolved > 0) {
    warnings.push({
      category: 'package:multi',
      message: `${unresolved} multi complex type(s) had bonds left unreconstructed (a component-index referenced an instance/site that could not be resolved — sometimes an internal id inconsistency in the source). Molecule types were still extracted.`,
      count: 1, severity: 'approximated',
    });
  }
  if (bnglMoleculeTypes.length > 0) {
    const cnote = complexPatterns.length ? ` Reconstructed ${complexPatterns.length} bonded complex pattern(s).` : '';
    warnings.push({
      category: 'package:multi',
      message: `multi package: extracted ${bnglMoleculeTypes.length} molecule type(s) with binding sites and states.${cnote} Emitted as a commented reference (species pattern semantics — bound/unbound/either — and rules are not translated into the simulated network).`,
      count: 1, severity: 'approximated',
    });
  }

  return { present: true, deep: false, bnglMoleculeTypes, complexPatterns, seedPatterns: [], warnings };
}
