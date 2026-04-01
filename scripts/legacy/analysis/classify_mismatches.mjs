import fs from 'fs';
const path = 'artifacts/SESSION_2026_01_05_web_output_parity/compare_results.after_refs.json';
const raw = fs.readFileSync(path, 'utf8');
const data = JSON.parse(raw);
const results = data.results.filter(r => r.status === 'mismatch');

const categories = {
  zeroObservable: [],
  timeGrid: [],
  largeNumeric: [],
  smallNumeric: [],
};

for (const r of results) {
  const d = r.details || {};
  let placed = false;

  // time/grid mismatches
  if (d.timeMatch === false || d.webRows !== d.refRows) {
    categories.timeGrid.push(r.model);
    placed = true;
  }

  // check for zero observable entries (samples where web==0 && ref!=0)
  const samples = d.samples || [];
  if (!placed && samples.some(s => s.web === 0 && s.ref !== 0)) {
    categories.zeroObservable.push(r.model);
    placed = true;
  }

  // numeric differences
  if (!placed) {
    const maxRel = d.maxRelativeError ?? 0;
    if (maxRel >= 0.01) categories.largeNumeric.push(r.model);
    else categories.smallNumeric.push(r.model);
  }
}

console.log('Mismatches total:', results.length);
console.log('Categories counts:');
console.log(' zeroObservable:', categories.zeroObservable.length);
console.log(' timeGrid:', categories.timeGrid.length);
console.log(' largeNumeric:', categories.largeNumeric.length);
console.log(' smallNumeric:', categories.smallNumeric.length);

console.log('\nTop zeroObservable examples (first 20):');
console.log(categories.zeroObservable.slice(0, 20).join('\n'));
console.log('\nTop timeGrid examples (first 20):');
console.log(categories.timeGrid.slice(0, 20).join('\n'));
console.log('\nTop largeNumeric examples (first 20):');
console.log(categories.largeNumeric.slice(0, 20).join('\n'));
console.log('\nTop smallNumeric examples (first 20):');
console.log(categories.smallNumeric.slice(0, 20).join('\n'));
