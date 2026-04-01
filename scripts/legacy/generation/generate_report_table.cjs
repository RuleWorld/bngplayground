
const fs = require('fs');
const path = require('path');

const jsonPath = 'artifacts/SESSION_2026_01_05_web_output_parity/compare_results.after_refs.json';

try {
  const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const results = report.results;

  // Sort results: Mismatches first, then Missing Refs, then Matches
  results.sort((a, b) => {
    const statusOrder = { 'mismatch': 1, 'missing_reference': 2, 'match': 3 };
    return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99) || a.model.localeCompare(b.model);
  });

  console.log('| Model | Status | Max Rel Error | Max Abs Error | Notes |');
  console.log('| :--- | :--- | :--- | :--- | :--- |');

  results.forEach(r => {
    let statusEmoji = 'PASS';
    if (r.status === 'mismatch') statusEmoji = 'FAIL';
    if (r.status === 'missing_reference') statusEmoji = 'MISSING';

    // Format numbers
    const relErr = r.details && r.details.maxRelativeError !== undefined 
      ? (r.details.maxRelativeError * 100).toExponential(2) + '%' 
      : 'N/A';
    
    const absErr = r.details && r.details.maxAbsoluteError !== undefined
      ? r.details.maxAbsoluteError.toExponential(2)
      : 'N/A';
      
    let notes = '';
    if (r.status === 'mismatch') {
       if (r.details?.errorAtTime !== undefined) {
         notes = `t=${r.details.errorAtTime}, Col: ${r.details.errorColumn || '?'}`;
       } else {
         notes = 'Mismatch';
       }
    } else if (r.status === 'missing_reference') {
      notes = 'Missing .gdat';
    }

    // Clean model name (remove .bngl extension if present)
    const name = r.model.replace('.bngl', '');

    console.log(`| ${name} | ${statusEmoji} ${r.status} | ${relErr} | ${absErr} | ${notes} |`);
  });

} catch (err) {
  console.error('Error generating table:', err);
}
