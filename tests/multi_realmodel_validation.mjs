/**
 * multi_realmodel_validation.mjs
 *
 * Validates the TS-ported multi-package parser against the two canonical
 * libSBML multi-package example models:
 *   1. multi_example1.xml — shallow multi with Ecad dimers/trimers
 *   2. YeastMAPK.xml — deep/multilayer (Simmune-style)
 *
 * Self-contained — no external imports beyond Node builtins.
 *
 * Usage:
 *   node tests/multi_realmodel_validation.mjs                       # fetches from GitHub if needed
 *   MULTI_EXAMPLES_DIR=/path/to/multi node tests/multi_realmodel_validation.mjs
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

// ── Config ──────────────────────────────────────────────────────────
const MULTI_DIR = process.env.MULTI_EXAMPLES_DIR || path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.cache', 'multi-examples'
);
const MULTI_EXAMPLE1_URL = 'https://raw.githubusercontent.com/sbmlteam/libsbml/master/examples/sample-models/multi/multi_example1.xml';
const YEAST_MAPK_URL = 'https://raw.githubusercontent.com/sbmlteam/libsbml/master/examples/sample-models/multi/YeastMAPK.xml';

// ── Fetch helper ────────────────────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'multi_realmodel_validator/1.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchUrl(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function ensureFixture(name, url) {
  const dest = path.join(MULTI_DIR, name);
  try {
    const content = fs.readFileSync(dest, 'utf8');
    if (content.length > 1000) return content;
  } catch {}
  fs.mkdirSync(MULTI_DIR, { recursive: true });
  console.error(`  Downloading ${name} from libSBML repo...`);
  const content = await fetchUrl(url);
  fs.writeFileSync(dest, content, 'utf8');
  return content;
}

// ── Multi-package parser (faithful TS-port mirror) ──────────────────
const A = (attrs, name) => { const m = (attrs || '').match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')); return m ? (m[1] ?? m[2] ?? '') : null; };
const clean = s => (s || '').replace(/[^A-Za-z0-9_]/g, '_');
function multiPrefix(xml) { const m = xml.match(/xmlns:([A-Za-z0-9_]+)\s*=\s*["']http:\/\/www\.sbml\.org\/sbml\/level3\/version\d+\/multi\/version\d+["']/i); return m ? m[1] : null; }
function block(scope, pfx, tag) { const p = pfx ? pfx + ':' : ''; const m = scope.match(new RegExp(`<${p}${tag}\\b[^>]*>([\\s\\S]*?)</${p}${tag}>`, 'i')); return m ? m[1] : null; }
function* elements(scope, pfx, tag) { const p = pfx ? pfx + ':' : ''; const re = new RegExp(`<${p}${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${p}${tag}>)`, 'gi'); let m; while ((m = re.exec(scope)) !== null) yield { attrs: m[1] || '', inner: m[2] || '' }; }

function parseMultiPackage(sbmlString) {
  const warnings = [];
  const empty = { present: false, deep: false, bnglMoleculeTypes: [], complexPatterns: [], seedPatterns: [], warnings };
  if (!sbmlString) return empty;
  const pfx = multiPrefix(sbmlString); if (!pfx) return empty;
  const listTypes = block(sbmlString, pfx, 'listOfSpeciesTypes');
  if (!listTypes) { warnings.push({ category: 'package:multi', message: 'no listOfSpeciesTypes', count: 1, severity: 'info' }); return { ...empty, present: true }; }
  const bst = new Set();
  for (const b of elements(listTypes, pfx, 'bindingSiteSpeciesType')) { const id = A(b.attrs, 'id'); if (id) bst.add(id); }
  const types = new Map();
  for (const st of elements(listTypes, pfx, 'speciesType')) {
    const id = A(st.attrs, 'id'); if (!id) continue; const name = clean(A(st.attrs, 'name') || id);
    const features = []; const ftB = block(st.inner, pfx, 'listOfSpeciesFeatureTypes');
    if (ftB) for (const ft of elements(ftB, pfx, 'speciesFeatureType')) { const states = []; const poss = block(ft.inner, pfx, 'listOfPossibleSpeciesFeatureValues'); if (poss) for (const pv of elements(poss, pfx, 'possibleSpeciesFeatureValue')) { const lab = clean(A(pv.attrs, 'name') || A(pv.attrs, 'id') || ''); if (lab) states.push(lab); } features.push({ name: clean(A(ft.attrs, 'name') || A(ft.attrs, 'id') || ''), states }); }
    const inst = []; const ib = block(st.inner, pfx, 'listOfSpeciesTypeInstances');
    if (ib) for (const i of elements(ib, pfx, 'speciesTypeInstance')) { const iid = A(i.attrs, 'id'); const ity = A(i.attrs, 'speciesType'); if (iid && ity) inst.push({ id: iid, typeId: ity, name: clean(A(i.attrs, 'name') || iid) }); }
    const ci = new Map(); const cib = block(st.inner, pfx, 'listOfSpeciesTypeComponentIndexes');
    if (cib) for (const c of elements(cib, pfx, 'speciesTypeComponentIndex')) { const cid = A(c.attrs, 'id'); if (cid) ci.set(cid, { component: A(c.attrs, 'component') || '', parent: A(c.attrs, 'identifyingParent') || '' }); }
    const bonds = []; const bb = block(st.inner, pfx, 'listOfInSpeciesTypeBonds');
    if (bb) for (const bd of elements(bb, pfx, 'inSpeciesTypeBond')) { const s1 = A(bd.attrs, 'bindingSite1'); const s2 = A(bd.attrs, 'bindingSite2'); if (s1 && s2) bonds.push({ s1, s2 }); }
    types.set(id, { id, name, features, inst, ci, bonds });
  }
  const isContainer = t => t.inst.some(i => types.has(i.typeId));
  const topTypes = new Set([...sbmlString.matchAll(new RegExp(`${pfx}:speciesType="([^"]+)"`, 'g'))].map(m => m[1]).filter(id => types.has(id)));
  let deep = false;
  for (const tid of topTypes) { const t = types.get(tid); if (t.inst.some(i => { const it = types.get(i.typeId); return it && isContainer(it); })) { deep = true; break; } }
  const sitesOf = t => t.inst.filter(i => bst.has(i.typeId)).map(i => ({ keys: new Set([i.id, i.typeId, i.name]), label: clean(i.name || i.id) }));
  const declOf = t => { const feats = t.features.map(f => `${f.name}~${f.states.join('~')}`); const sites = sitesOf(t).map(s => s.label); return `${t.name}(${[...feats, ...sites].join(',')})`; };
  if (deep) {
    const names = [...new Set([...types.values()].map(t => t.name).filter(n => !/^(mcp|bst|cps|mol)[_-]?\d/i.test(n)))];
    warnings.push({ category: 'package:multi', message: `Simmune multilayer; names: ${names.slice(0, 20).join(', ')}`, count: 1, severity: 'approximated' });
    return { present: true, deep: true, bnglMoleculeTypes: [], complexPatterns: [], seedPatterns: [], warnings, names };
  }
  const molTypeIds = new Set();
  for (const tid of topTypes) { const t = types.get(tid); const subs = t.inst.filter(i => types.has(i.typeId)); if (subs.length === 0) molTypeIds.add(tid); else subs.forEach(i => molTypeIds.add(i.typeId)); }
  const bnglMoleculeTypes = [...new Set([...molTypeIds].map(id => declOf(types.get(id))))];
  const complexPatterns = []; let unresolved = 0;
  for (const tid of topTypes) {
    const t = types.get(tid); const subs = t.inst.filter(i => types.has(i.typeId)); if (subs.length === 0) continue;
    const sub = iid => subs.find(x => x.id === iid);
    const sofi = iid => { const s = sub(iid); return s ? sitesOf(types.get(s.typeId)) : []; };
    const mn = iid => { const s = sub(iid); return s ? types.get(s.typeId).name : clean(iid); };
    const resolve = ref => { const c = t.ci.get(ref); const comp = c ? c.component : ref; const parent = c ? c.parent : ''; let inst = ''; if (parent && sub(parent)) inst = parent; else if (sub(comp)) inst = comp; if (!inst) return null; const ss = sofi(inst); let site = ss.find(x => x.keys.has(comp)); if (!site && ss.length === 1) site = ss[0]; if (!site) return null; return { inst, label: site.label }; };
    const bmap = new Map(); const add = (i, l, b) => { const m = bmap.get(i) || new Map(); m.set(l, b); bmap.set(i, m); };
    let ok = true, bn = 0;
    for (const bd of t.bonds) { const e1 = resolve(bd.s1); const e2 = resolve(bd.s2); if (!e1 || !e2) { ok = false; break; } bn += 1; add(e1.inst, e1.label, bn); add(e2.inst, e2.label, bn); }
    if (!ok) { unresolved += 1; continue; }
    const mols = subs.map(i => { const ss = sofi(i.id); const bm = bmap.get(i.id) || new Map(); return `${mn(i.id)}(${ss.map(s => bm.has(s.label) ? `${s.label}!${bm.get(s.label)}` : s.label).join(',')})`; });
    complexPatterns.push({ typeId: tid, pattern: mols.join('.') });
  }
  return { present: true, deep: false, bnglMoleculeTypes, complexPatterns, seedPatterns: [], warnings, unresolved };
}

// ── Run validation ──────────────────────────────────────────────────
let P = 0, F = 0;
const chk = (n, c, g) => { c ? P++ : (F++, console.log('FAIL ' + n + '  got: ' + g)); };

async function main() {
  fs.mkdirSync(MULTI_DIR, { recursive: true });

  console.log(`Fixture directory: ${MULTI_DIR}`);

  // multi_example1.xml
  let ex1;
  try {
    ex1 = await ensureFixture('multi_example1.xml', MULTI_EXAMPLE1_URL);
  } catch (e) {
    console.error(`ERROR: Could not obtain multi_example1.xml: ${e.message}`);
    console.error(`Set MULTI_EXAMPLES_DIR to a directory containing the libSBML multi examples.`);
    process.exit(1);
  }

  const ec = parseMultiPackage(ex1);
  chk('present', ec.present === true, '');
  chk('shallow', ec.deep === false, ec.deep);
  chk('Ecad molecule', ec.bnglMoleculeTypes.includes('st_Ecad(cis,trans)'), ec.bnglMoleculeTypes.join('|'));
  chk('trans_dimer', ec.complexPatterns.some(c => c.pattern === 'st_Ecad(cis,trans!1).st_Ecad(cis,trans!1)'), '');
  chk('trimer', ec.complexPatterns.some(c => c.pattern === 'st_Ecad(cis!1,trans!2).st_Ecad(cis!1,trans).st_Ecad(cis,trans!2)'), '');
  chk('one unresolved (file id mismatch)', ec.unresolved === 1, ec.unresolved);

  // YeastMAPK.xml
  let ym;
  try {
    ym = await ensureFixture('YeastMAPK.xml', YEAST_MAPK_URL);
  } catch (e) {
    console.error(`ERROR: Could not obtain YeastMAPK.xml: ${e.message}`);
    process.exit(1);
  }

  const ymk = parseMultiPackage(ym);
  chk('YeastMAPK deep', ymk.deep === true, ymk.deep);
  chk('YeastMAPK no complexes', ymk.complexPatterns.length === 0, ymk.complexPatterns.length);
  chk('YeastMAPK names has Fus3', ymk.names.includes('Fus3'), ymk.names.slice(0, 5).join(','));

  console.log(`\nmulti_realmodel_validation: ${P} passed, ${F} failed`);
  if (F > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
