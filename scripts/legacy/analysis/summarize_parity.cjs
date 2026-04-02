const fs = require('fs');
const report = JSON.parse(fs.readFileSync('validation_report.json', 'utf8'));

const summary = {
    match: 0,
    mismatch: 0,
    missing_reference: 0,
    error: 0,
    skipped: 0,
    bng_failed: 0,
    source_missing: 0
};

report.forEach(r => {
    summary[r.status] = (summary[r.status] || 0) + 1;
});

console.log('Summary of Parity Check:');
console.log(JSON.stringify(summary, null, 2));

const mismatches = report.filter(r => r.status === 'mismatch').map(r => ({
    model: r.model,
    maxAbsErr: r.details?.maxAbsoluteError,
    maxRelErr: r.details?.maxRelativeError,
    absTolDominated: r.details?.absTolDominated
}));

console.log('\nMismatches:');
mismatches.slice(0, 20).forEach(m => {
  console.log(`${m.model.padEnd(40)} | AbsErr: ${m.maxAbsErr?.toExponential(2).padEnd(10)} | RelErr: ${((m.maxRelErr || 0) * 100).toFixed(2).padStart(6)}% | AbsDom: ${m.absTolDominated}`);
});

const bngFails = report.filter(r => r.status === 'bng_failed').map(r => r.model);
console.log('\nBNG Fails (20):');
console.log(bngFails.join(', '));
