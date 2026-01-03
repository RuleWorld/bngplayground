/**
 * Comparison script that outputs JSON
 * Usage: node compare_json.cjs > results.json
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

const FILE_MAPPING = {
  'cheemalavagu_2014': 'Cheemalavagu_JAK_STAT.gdat',
  'pekalski_2013': 'Pekalski_2013_ode1.gdat',
  'lin_2019': 'Lin_ERK_2019_ODE.gdat',
  'toggle': 'bistable-toggle-switch.gdat'
};

function findGdatFile(csvName) {
  const modelName = csvName.replace('results_', '').replace('.csv', '');
  
  // 1. Check explicit mapping
  if (FILE_MAPPING[modelName]) {
    const mappedPath = path.join(BNG_OUTPUT_DIR, FILE_MAPPING[modelName]);
    if (fs.existsSync(mappedPath)) return mappedPath;
  }

  // 2. Standard normalized matching
  const modelNameNorm = modelName.toLowerCase().replace(/[_-]/g, '');
  const gdatFiles = fs.readdirSync(BNG_OUTPUT_DIR).filter(f => f.endsWith('.gdat'));
  
  for (const gdatFile of gdatFiles) {
    const gdatName = gdatFile.replace('.gdat', '').toLowerCase().replace(/[-_]/g, '');
    
    // Check exact match
    if (gdatName === modelNameNorm) {
      return path.join(BNG_OUTPUT_DIR, gdatFile);
    }
    
    // Check if gdat file starts with model name (e.g. model_ode1.gdat)
    if (gdatName.startsWith(modelNameNorm)) {
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
const csvFiles = fs.readdirSync(WEB_OUTPUT_DIR).filter(f => f.endsWith('.csv'));

const results = { 
  summary: { total: csvFiles.length, match: 0, mismatch: 0, missing: 0, error: 0 },
  matches: [],
  mismatches: [],
  missing: [],
  errors: []
};

for (const csvFile of csvFiles) {
  const modelName = csvFile.replace('results_', '').replace('.csv', '');
  const gdatPath = findGdatFile(csvFile);
  
  if (!gdatPath) {
    results.missing.push(modelName);
    results.summary.missing++;
    continue;
  }
  
  try {
    const csvContent = fs.readFileSync(path.join(WEB_OUTPUT_DIR, csvFile), 'utf8');
    const gdatContent = fs.readFileSync(gdatPath, 'utf8');
    
    const webData = parseCSV(csvContent);
    const refData = parseGDAT(gdatContent);
    
    const comparison = compareData(webData, refData);
    
    if (comparison.maxRelError <= 0.01) {  // 1% threshold
      results.matches.push({ model: modelName, maxRelError: comparison.maxRelError });
      results.summary.match++;
    } else {
      results.mismatches.push({ 
        model: modelName, 
        maxRelError: comparison.maxRelError,
        maxAbsError: comparison.maxAbsError,
        details: comparison.errorDetails 
      });
      results.summary.mismatch++;
    }
  } catch (e) {
    results.errors.push({ model: modelName, error: e.message });
    results.summary.error++;
  }
}

// Write JSON to file
fs.writeFileSync('comparison_results.json', JSON.stringify(results, null, 2));
console.log('Results written to comparison_results.json');
console.log('Summary:', JSON.stringify(results.summary));
