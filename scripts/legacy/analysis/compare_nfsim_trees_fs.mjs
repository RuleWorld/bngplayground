import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const roots = {
  src: path.resolve('src/wasm/nfsim/nfsim-src'),
  ruleworld: path.resolve('src/wasm/nfsim/nfsim-ruleworld'),
  mcell: path.resolve('src/wasm/nfsim/nfsim-src-mcell'),
};

function walk(dir, base) {
  const res = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === '.git' || e.name === '.github') continue;
    const p = path.join(dir, e.name);
    const rel = path.relative(base, p).replace(/\\/g, '/');
    if (e.isDirectory()) {
      res.push(...walk(p, base));
    } else if (e.isFile()) {
      res.push(rel);
    }
  }
  return res;
}

function sha1(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha1').update(data).digest('hex');
}

const maps = {};
const presentRoots = Object.entries(roots).filter(([, r]) => fs.existsSync(r));
if (presentRoots.length < 2) {
  const presentNames = presentRoots.map(([k]) => k).join(', ') || 'none';
  console.log(`NFsim tree comparison skipped: expected at least two trees, found: ${presentNames}.`);
  process.exit(0);
}

for (const [k, r] of presentRoots) {
  const list = walk(r, r);
  const m = new Map();
  for (const rel of list) {
    const full = path.join(r, rel);
    m.set(rel, sha1(full));
  }
  maps[k] = m;
}

const allPaths = new Set();
for (const m of Object.values(maps)) for (const p of m.keys()) allPaths.add(p);

const uniqueTo = { src: [], ruleworld: [], mcell: [] };
const modified = [];
const identical = [];

for (const p of Array.from(allPaths).sort()) {
  const s = maps.src?.get(p) || null;
  const r = maps.ruleworld?.get(p) || null;
  const m = maps.mcell?.get(p) || null;
  const present = { src: !!s, ruleworld: !!r, mcell: !!m };
  const count = +present.src + +present.ruleworld + +present.mcell;
  if (count === 1) {
    if (present.src) uniqueTo.src.push(p);
    if (present.ruleworld) uniqueTo.ruleworld.push(p);
    if (present.mcell) uniqueTo.mcell.push(p);
    continue;
  }
  const shas = [s, r, m].filter(Boolean);
  const allEqual = shas.every((x) => x === shas[0]);
  if (allEqual) identical.push(p);
  else modified.push(p);
}

const summary = {
  totals: {
    src: maps.src?.size ?? 0,
    ruleworld: maps.ruleworld?.size ?? 0,
    mcell: maps.mcell?.size ?? 0,
    union: allPaths.size,
  },
  uniqueTo,
  identicalCount: identical.length,
  modifiedCount: modified.length,
  modifiedFiles: modified,
  identicalFiles: identical,
};

const outDir = 'artifacts';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'nfsim-trees-fs-rows.json'), JSON.stringify(Array.from(allPaths).sort(), null, 2));
fs.writeFileSync(path.join(outDir, 'nfsim-trees-fs-summary.json'), JSON.stringify(summary, null, 2));

let human = '';
human += `Filesystem NFsim tree comparison summary\n`;
human += `--------------------------------\n`;
human += `Totals: src=${summary.totals.src}, ruleworld=${summary.totals.ruleworld}, mcell=${summary.totals.mcell}, union=${summary.totals.union}\n`;
human += `Identical files: ${summary.identicalCount}\n`;
human += `Files present in multiple trees but modified: ${summary.modifiedCount}\n`;

human += `\nUnique to src (${summary.uniqueTo.src.length}):\n` + summary.uniqueTo.src.slice(0,200).map(x=>`  - ${x}`).join('\n') + (summary.uniqueTo.src.length>200 ? `\n  ... + ${summary.uniqueTo.src.length-200} more` : '') + '\n';
human += `\nUnique to ruleworld (${summary.uniqueTo.ruleworld.length}):\n` + summary.uniqueTo.ruleworld.slice(0,200).map(x=>`  - ${x}`).join('\n') + (summary.uniqueTo.ruleworld.length>200 ? `\n  ... + ${summary.uniqueTo.ruleworld.length-200} more` : '') + '\n';
human += `\nUnique to mcell (${summary.uniqueTo.mcell.length}):\n` + summary.uniqueTo.mcell.slice(0,200).map(x=>`  - ${x}`).join('\n') + (summary.uniqueTo.mcell.length>200 ? `\n  ... + ${summary.uniqueTo.mcell.length-200} more` : '') + '\n';

human += `\nModified files present in multiple repos (${summary.modifiedCount}):\n` + summary.modifiedFiles.slice(0,500).map(x=>`  - ${x}`).join('\n') + '\n';

fs.writeFileSync(path.join(outDir, 'nfsim-trees-fs-summary.txt'), human);
console.log('Wrote artifacts/nfsim-trees-fs-summary.txt and JSON reports.');
console.log(human.split('\n').slice(0,20).join('\n'));
console.log('Full reports in artifacts/');
