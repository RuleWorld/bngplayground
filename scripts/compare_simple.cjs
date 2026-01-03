/**
 * Simple comparison script - CommonJS version
 * Usage: node compare_simple.js
 */

const fs = require('fs');
const path = require('path');

const WEB_OUTPUT_DIR = path.join(__dirname, 'web_output');
const BNG_OUTPUT_DIR = path.join(__dirname, 'bng_test_output');

function parseCSV(content) {
  const lines = content.trim().split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const headers = lines[0].split(',').map(h => h.trim());
  const data = lines.slice(1).map(line => 
    line.split(',').map(v => parseFloat(v.trim()))
  );
  return { headers, data };
}

function parseGDAT(content) {
  const lines = content.trim().split('\n').filter(l => l.trim());
  const headerLine = lines.find(l => l.startsWith('#'));
  let headers = [];
  if (headerLine) {
    headers = headerLine.replace('#', '').trim().split(/\s+/);
  }
  const data = lines
    .filter(l => !l.startsWith('#') && l.trim())
    .map(line => line.trim().split(/\s+/).map(v => parseFloat(v)));
  return { headers, data };
}

function findGdatFile(csvName) {
  const modelName = csvName.replace('results_', '').replace('.csv', '').toLowerCase().replace(/[_-]/g, '');
  const gdatFiles = fs.readdirSync(BNG_OUTPUT_DIR).filter(f => f.endsWith('.gdat'));
  
  for (const gdatFile of gdatFiles) {
    const gdatName = gdatFile.replace('.gdat', '').toLowerCase().replace(/[-_]/g, '');
    if (gdatName === modelName) {
      return path.join(BNG_OUTPUT_DIR, gdatFile);
    }
  }
  return null;
}

function compareData(webData, refData) {
  const normalizeHeader = h => h.toLowerCase().replace(/\s+/g, '_');
  const webHeadersNorm = webData.headers.map(normalizeHeader);
  const refHeadersNorm = refData.headers.map(normalizeHeader);
  
  const webTimeIdx = webHeadersNorm.indexOf('time');
  const refTimeIdx = refHeadersNorm.indexOf('time');
  
  if (webTimeIdx === -1 || refTimeIdx === -1) {
    return { error: 'No time column', maxRelError: -1 };
  }
  
  // Build ref time map
  const refTimeMap = new Map();
  for (let i = 0; i < refData.data.length; i++) {
    const t = refData.data[i][refTimeIdx];
    refTimeMap.set(t.toFixed(4), i);
  }
  
  let maxRelError = 0;
  let maxAbsError = 0;
  let errorDetails = null;
  
  for (let wi = 0; wi < webData.data.length; wi++) {
    const webTime = webData.data[wi][webTimeIdx];
    const refRowIdx = refTimeMap.get(webTime.toFixed(4));
    if (refRowIdx === undefined) continue;
    
    const refRow = refData.data[refRowIdx];
    
    for (let ci = 0; ci < webData.headers.length; ci++) {
      const colNameNorm = normalizeHeader(webData.headers[ci]);
      if (colNameNorm === 'time') continue;
      
      const refColIdx = refHeadersNorm.indexOf(colNameNorm);
      if (refColIdx === -1) continue;
      
      const webVal = webData.data[wi][ci];
      const refVal = refRow[refColIdx];
      
      const absError = Math.abs(webVal - refVal);
      const relError = refVal !== 0 ? absError / Math.abs(refVal) : (webVal !== 0 ? 1 : 0);
      
      if (absError > maxAbsError) maxAbsError = absError;
      if (relError > maxRelError) {
        maxRelError = relError;
        errorDetails = { time: webTime, col: webData.headers[ci], web: webVal, ref: refVal };
      }
    }
  }
  
  return { maxRelError, maxAbsError, errorDetails, webRows: webData.data.length, refRows: refData.data.length };
}

// Main
console.log('='.repeat(80));
console.log('BioNetGen Web Simulator Output Comparison');
console.log('='.repeat(80));
console.log();

const csvFiles = fs.readdirSync(WEB_OUTPUT_DIR).filter(f => f.endsWith('.csv'));
console.log(`Found ${csvFiles.length} web output CSV files\n`);

const results = { match: [], mismatch: [], missing: [], error: [] };

for (const csvFile of csvFiles) {
  const modelName = csvFile.replace('results_', '').replace('.csv', '');
  const gdatPath = findGdatFile(csvFile);
  
  if (!gdatPath) {
    results.missing.push(modelName);
    continue;
  }
  
  try {
    const csvContent = fs.readFileSync(path.join(WEB_OUTPUT_DIR, csvFile), 'utf8');
    const gdatContent = fs.readFileSync(gdatPath, 'utf8');
    
    const webData = parseCSV(csvContent);
    const refData = parseGDAT(gdatContent);
    
    const comparison = compareData(webData, refData);
    
    if (comparison.maxRelError <= 0.01) {  // 1% threshold
      results.match.push({ name: modelName, err: comparison.maxRelError });
    } else {
      results.mismatch.push({ 
        name: modelName, 
        err: comparison.maxRelError,
        absErr: comparison.maxAbsError,
        details: comparison.errorDetails 
      });
    }
  } catch (e) {
    results.error.push({ name: modelName, error: e.message });
  }
}

// Print summary
console.log('SUMMARY');
console.log('-'.repeat(80));
console.log(`Match (<=1% error): ${results.match.length}`);
console.log(`Mismatch (>1% error): ${results.mismatch.length}`);
console.log(`No reference: ${results.missing.length}`);
console.log(`Errors: ${results.error.length}`);
console.log();

if (results.match.length > 0) {
  console.log('\n=== MATCHING MODELS ===');
  for (const r of results.match.slice(0, 20)) {
    console.log(`  ${r.name}: ${(r.err * 100).toFixed(4)}% max error`);
  }
  if (results.match.length > 20) console.log(`  ... and ${results.match.length - 20} more`);
}

if (results.mismatch.length > 0) {
  console.log('\n=== MISMATCHED MODELS ===');
  for (const r of results.mismatch) {
    console.log(`  ${r.name}: ${(r.err * 100).toFixed(2)}% max error (abs: ${r.absErr.toExponential(2)})`);
    if (r.details) {
      console.log(`    at t=${r.details.time}, col=${r.details.col}, web=${r.details.web.toExponential(4)}, ref=${r.details.ref.toExponential(4)}`);
    }
  }
}

if (results.missing.length > 0) {
  console.log('\n=== MISSING REFERENCES ===');
  console.log(results.missing.slice(0, 20).map(m => `  ${m}`).join('\n'));
  if (results.missing.length > 20) console.log(`  ... and ${results.missing.length - 20} more`);
}

if (results.error.length > 0) {
  console.log('\n=== ERRORS ===');
  for (const r of results.error) {
    console.log(`  ${r.name}: ${r.error}`);
  }
}

console.log('\n' + '='.repeat(80));
console.log(`Total: ${csvFiles.length} models processed`);
