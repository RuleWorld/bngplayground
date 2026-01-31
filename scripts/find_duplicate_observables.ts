import { EXAMPLES } from '../constants';

interface Result {
  id: string;
  name: string | undefined;
  duplicates: string[];
}

const results: Result[] = [];

for (const ex of EXAMPLES) {
  const code = (ex as any).code as string | undefined;
  if (!code) continue;

  // Extract observables block
  const obsMatch = code.match(/begin\s+observables([\s\S]*?)end\s+observables/i);
  if (!obsMatch) continue;
  const body = obsMatch[1];

  // Each observable line may be: <Type> <Name> <Pattern>
  const names: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const l = line.replace(/#.*$/, '').trim();
    if (!l) continue;
    const parts = l.split(/\s+/);
    if (parts.length >= 2) {
      names.push(parts[1]);
    }
  }

  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) || 0) + 1);
  const dup = Array.from(counts.entries()).filter(([_, c]) => c > 1).map(([n]) => n);
  if (dup.length > 0) results.push({ id: ex.id, name: ex.name, duplicates: dup });
}

if (results.length === 0) {
  console.log('No example models with duplicate observables found.');
  process.exit(0);
}

console.log(`Found ${results.length} example models with duplicate observable names:`);
for (const r of results) {
  console.log(`- ${r.id} (${r.name ?? 'untitled'}): ${r.duplicates.join(', ')}`);
}
