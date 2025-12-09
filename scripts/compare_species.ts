
import fs from 'fs';
import path from 'path';

// Parse simulator output (plain list of species strings)
const simPath = path.join(process.cwd(), 'barua_sim_species.txt');
const simSpecies = new Set(fs.readFileSync(simPath, 'utf-8').split('\n').map(s => s.trim()).filter(s => s.length > 0));

// Parse BNG2 output (.net file)
// Format:
// begin species
// 1 APC(a15,a20~U,s!1).AXIN(b!1,e,gid,rgs) 3.3
// ...
// end species
const netPath = path.join(process.cwd(), 'published-models/cell-regulation/Barua_2013.net');
const netContent = fs.readFileSync(netPath, 'utf-8');

const bngSpecies = new Set<string>();
let inSpecies = false;
for (const line of netContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed === 'begin species') {
    inSpecies = true;
    continue;
  }
  if (trimmed === 'end species') {
    inSpecies = false;
    break;
  }
  if (inSpecies && trimmed.length > 0 && !trimmed.startsWith('#')) {
    // Format: Index Pattern Conc
    // We need to extract the pattern. It's the second token usually.
    // e.g. "1 A(b) 100" -> "A(b)"
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      // The pattern is parts[1].
      bngSpecies.add(parts[1]);
    }
  }
}

console.log(`Simulator Species: ${simSpecies.size}`);
console.log(`BNG2 Species: ${bngSpecies.size}`);

// Calculate differences
const missing = [...bngSpecies].filter(s => !simSpecies.has(s));
const extra = [...simSpecies].filter(s => !bngSpecies.has(s));

console.log(`Missing species (in BNG2 but not Simulator): ${missing.length}`);
if (missing.length > 0) {
  console.log('--- MISSING EXAMPLES (First 20) ---');
  console.log(missing.sort().slice(0, 20).join('\n'));
}

console.log(`Extra species (in Simulator but not BNG2): ${extra.length}`);
if (extra.length > 0) {
  console.log('--- EXTRA EXAMPLES (First 20) ---');
  console.log(extra.sort().slice(0, 20).join('\n'));
}

// Write full diff to file
fs.writeFileSync('species_diff_missing.txt', missing.sort().join('\n'));
fs.writeFileSync('species_diff_extra.txt', extra.sort().join('\n'));
console.log('Full diffs written to species_diff_missing.txt and species_diff_extra.txt');
