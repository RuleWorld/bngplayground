import fs from 'fs';
import path from 'path';

const examplesDir = path.resolve('example-models');
const entries = fs.readdirSync(examplesDir).filter(f => f.endsWith('.bngl'));

const results = [];

for (const file of entries) {
  const full = path.join(examplesDir, file);
  const code = fs.readFileSync(full, 'utf-8');
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

if (results.length === 0) {
  console.log('No duplicates in example-models folder.');
} else {
  console.log('Found duplicates in example-models:');
  for (const r of results) {
    console.log(`- ${r.file}: ${r.dup.join(', ')}`);
  }
}
