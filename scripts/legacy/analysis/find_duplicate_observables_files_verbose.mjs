import fs from 'fs';
import path from 'path';

const examplesDir = process.env.RULEHUB_ROOT
  ? path.resolve(process.env.RULEHUB_ROOT, 'Contributed', 'BNGPlayground_Examples')
  : path.resolve('..', 'RuleHub', 'Contributed', 'BNGPlayground_Examples');
console.log('examplesDir=', examplesDir);

function collectBnglFiles(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectBnglFiles(full, results);
    else if (entry.isFile() && entry.name.endsWith('.bngl')) results.push(full);
  }
  return results;
}

const entries = collectBnglFiles(examplesDir);
console.log('files count=', entries.length);

const results = [];

for (const [i, full] of entries.entries()) {
  const file = path.relative(examplesDir, full);
  console.log(`processing ${i+1}/${entries.length}: ${file}`);
  let code;
  try {
    code = fs.readFileSync(full, 'utf-8');
  } catch (e) {
    console.error('read error for', full, e);
    continue;
  }
  const m = code.match(/begin\s+observables([\s\S]*?)end\s+observables/i);
  if (!m) continue;
  const body = m[1];
  const names = [];
  for (const line of body.split(/\r?\n/)) {
    const l = line.replace(/#.*$/, '').trim();
    if (!l) continue;
    const parts = l.split(/\s+/);
    if (parts.length >= 2) names.push(parts[1]);
  }
  const counts = {};
  for (const n of names) counts[n] = (counts[n] || 0) + 1;
  const dup = Object.keys(counts).filter(k => counts[k] > 1);
  if (dup.length > 0) results.push({ file, dup });
}

console.log('\nSUMMARY:');
if (results.length === 0) {
  console.log('No duplicates in RuleHub BNGPlayground_Examples folder.');
} else {
  console.log('Found duplicates in RuleHub BNGPlayground_Examples:');
  for (const r of results) {
    console.log(`- ${r.file}: ${r.dup.join(', ')}`);
  }
}
