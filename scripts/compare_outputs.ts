/**
 * Comparison script to compare web simulator CSV outputs with BNG2.pl GDAT reference files
 * Usage: npx ts-node compare_outputs.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ComparisonResult {
  model: string;
  status: 'match' | 'mismatch' | 'missing_reference' | 'error';
  details: {
    webRows: number;
    refRows: number;
    webColumns: string[];
    refColumns: string[];
    columnMatch: boolean;
    maxRelativeError: number;
    maxAbsoluteError: number;
    errorAtTime?: number;
    errorColumn?: string;
    samples?: { time: number; column: string; web: number; ref: number; relError: number }[];
  } | null;
  error?: string;
}

const WEB_OUTPUT_DIR = path.join(__dirname, 'web_output');
const BNG_OUTPUT_DIR = path.join(__dirname, 'bng_test_output');

// Map CSV filenames to GDAT filenames
function csvToGdatName(csvName: string): string {
  // results_blinov_2006.csv -> Blinov_2006.gdat
  const baseName = csvName
    .replace('results_', '')
    .replace('.csv', '')
    .split('_')
    .map((part, i) => {
      // Handle special cases like numbers at the end
      if (/^\d+$/.test(part)) return part;
      // Capitalize first letter of each word
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('_');
  
  // Try different naming conventions
  const variations = [
    baseName + '.gdat',
    baseName.toLowerCase() + '.gdat',
    baseName.replace(/_/g, '-') + '.gdat',
    baseName.toLowerCase().replace(/_/g, '-') + '.gdat',
  ];
  
  return variations[0]; // Return primary variation; we'll search for all
}

function parseCSV(content: string): { headers: string[]; data: number[][] } {
  const lines = content.trim().split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const headers = lines[0].split(',').map(h => h.trim());
  const data = lines.slice(1).map(line => 
    line.split(',').map(v => parseFloat(v.trim()))
  );
  return { headers, data };
}

function parseGDAT(content: string): { headers: string[]; data: number[][] } {
  const lines = content.trim().split('\n').filter(l => l.trim());
  
  // First line is header with #
  const headerLine = lines.find(l => l.startsWith('#'));
  let headers: string[] = [];
  if (headerLine) {
    headers = headerLine.replace('#', '').trim().split(/\s+/);
  }
  
  // Data lines don't start with #
  const data = lines
    .filter(l => !l.startsWith('#') && l.trim())
    .map(line => line.trim().split(/\s+/).map(v => parseFloat(v)));
  
  return { headers, data };
}

function findGdatFile(csvName: string): string | null {
  const variations = [
    csvName.replace('results_', '').replace('.csv', '.gdat'),
    csvName.replace('results_', '').replace('.csv', '').replace(/_/g, '-') + '.gdat',
  ];
  
  // Also try capitalization variations
  for (const variation of variations) {
    const lowercase = variation.toLowerCase();
    const capitalized = variation.split(/[-_]/).map((part, i) => {
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join('_').replace('.gdat', '.gdat');
    
    // Check all variations
    for (const candidate of [variation, lowercase, capitalized, capitalized.replace(/_/g, '-')]) {
      const fullPath = path.join(BNG_OUTPUT_DIR, candidate);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }
  
  // Try to find any matching file
  if (!fs.existsSync(BNG_OUTPUT_DIR)) return null;
  
  const gdatFiles = fs.readdirSync(BNG_OUTPUT_DIR).filter(f => f.endsWith('.gdat'));
  const modelName = csvName.replace('results_', '').replace('.csv', '').toLowerCase().replace(/_/g, '');
  
  for (const gdatFile of gdatFiles) {
    const gdatName = gdatFile.replace('.gdat', '').toLowerCase().replace(/[-_]/g, '');
    if (gdatName === modelName) {
      return path.join(BNG_OUTPUT_DIR, gdatFile);
    }
  }
  
  return null;
}

function compareData(
  webData: { headers: string[]; data: number[][] },
  refData: { headers: string[]; data: number[][] }
): ComparisonResult['details'] {
  // Normalize headers (lowercase, remove spaces)
  const normalizeHeader = (h: string) => h.toLowerCase().replace(/\s+/g, '_');
  const webHeadersNorm = webData.headers.map(normalizeHeader);
  const refHeadersNorm = refData.headers.map(normalizeHeader);
  
  // Check column match (excluding 'time')
  const webCols = new Set(webHeadersNorm.filter(h => h !== 'time'));
  const refCols = new Set(refHeadersNorm.filter(h => h !== 'time'));
  const columnMatch = [...webCols].every(c => refCols.has(c)) && [...refCols].every(c => webCols.has(c));
  
  let maxRelativeError = 0;
  let maxAbsoluteError = 0;
  let errorAtTime: number | undefined;
  let errorColumn: string | undefined;
  const samples: { time: number; column: string; web: number; ref: number; relError: number }[] = [];
  
  // Find common time points (within tolerance)
  const webTimeIdx = webHeadersNorm.indexOf('time');
  const refTimeIdx = refHeadersNorm.indexOf('time');
  
  if (webTimeIdx === -1 || refTimeIdx === -1) {
    return {
      webRows: webData.data.length,
      refRows: refData.data.length,
      webColumns: webData.headers,
      refColumns: refData.headers,
      columnMatch: false,
      maxRelativeError: -1,
      maxAbsoluteError: -1,
    };
  }
  
  // Build a map of ref times for quick lookup
  const refTimeMap = new Map<string, number>();
  for (let i = 0; i < refData.data.length; i++) {
    const t = refData.data[i][refTimeIdx];
    refTimeMap.set(t.toFixed(6), i);
  }
  
  // Compare at matching time points
  for (let wi = 0; wi < webData.data.length; wi++) {
    const webTime = webData.data[wi][webTimeIdx];
    const webTimeKey = webTime.toFixed(6);
    
    const refRowIdx = refTimeMap.get(webTimeKey);
    if (refRowIdx === undefined) continue;
    
    const refRow = refData.data[refRowIdx];
    
    // Compare each column
    for (let ci = 0; ci < webData.headers.length; ci++) {
      const colName = webData.headers[ci];
      const colNameNorm = normalizeHeader(colName);
      if (colNameNorm === 'time') continue;
      
      // Find matching ref column
      const refColIdx = refHeadersNorm.indexOf(colNameNorm);
      if (refColIdx === -1) continue;
      
      const webVal = webData.data[wi][ci];
      const refVal = refRow[refColIdx];
      
      const absError = Math.abs(webVal - refVal);
      const relError = refVal !== 0 ? absError / Math.abs(refVal) : (webVal !== 0 ? 1 : 0);
      
      if (absError > maxAbsoluteError) {
        maxAbsoluteError = absError;
      }
      if (relError > maxRelativeError) {
        maxRelativeError = relError;
        errorAtTime = webTime;
        errorColumn = colName;
      }
      
      // Sample some data points for display
      if (samples.length < 10 && relError > 0.001) {
        samples.push({ time: webTime, column: colName, web: webVal, ref: refVal, relError });
      }
    }
  }
  
  return {
    webRows: webData.data.length,
    refRows: refData.data.length,
    webColumns: webData.headers,
    refColumns: refData.headers,
    columnMatch,
    maxRelativeError,
    maxAbsoluteError,
    errorAtTime,
    errorColumn,
    samples,
  };
}

async function main() {
  console.log('='.repeat(80));
  console.log('BioNetGen Web Simulator Output Comparison');
  console.log('='.repeat(80));
  console.log();
  
  if (!fs.existsSync(WEB_OUTPUT_DIR)) {
    console.error(`Web output directory not found: ${WEB_OUTPUT_DIR}`);
    return;
  }
  
  if (!fs.existsSync(BNG_OUTPUT_DIR)) {
    console.error(`BNG output directory not found: ${BNG_OUTPUT_DIR}`);
    return;
  }
  
  const csvFiles = fs.readdirSync(WEB_OUTPUT_DIR).filter(f => f.endsWith('.csv'));
  console.log(`Found ${csvFiles.length} web output CSV files\n`);
  
  const results: ComparisonResult[] = [];
  
  for (const csvFile of csvFiles) {
    const gdatPath = findGdatFile(csvFile);
    const modelName = csvFile.replace('results_', '').replace('.csv', '');
    
    if (!gdatPath) {
      results.push({
        model: modelName,
        status: 'missing_reference',
        details: null,
      });
      continue;
    }
    
    try {
      const csvContent = fs.readFileSync(path.join(WEB_OUTPUT_DIR, csvFile), 'utf8');
      const gdatContent = fs.readFileSync(gdatPath, 'utf8');
      
      const webData = parseCSV(csvContent);
      const refData = parseGDAT(gdatContent);
      
      const comparison = compareData(webData, refData);
      
      // Determine status based on error thresholds
      const threshold = 0.01; // 1% relative error threshold
      const status = comparison.maxRelativeError <= threshold ? 'match' : 'mismatch';
      
      results.push({
        model: modelName,
        status,
        details: comparison,
      });
    } catch (error) {
      results.push({
        model: modelName,
        status: 'error',
        details: null,
        error: String(error),
      });
    }
  }
  
  // Print summary
  console.log('Summary of Comparisons:');
  console.log('-'.repeat(80));
  
  const matches = results.filter(r => r.status === 'match');
  const mismatches = results.filter(r => r.status === 'mismatch');
  const missing = results.filter(r => r.status === 'missing_reference');
  const errors = results.filter(r => r.status === 'error');
  
  console.log(`✅ Matching:    ${matches.length}`);
  console.log(`❌ Mismatches:  ${mismatches.length}`);
  console.log(`⚠️  No reference: ${missing.length}`);
  console.log(`💥 Errors:      ${errors.length}`);
  console.log();
  
  // Print match details
  if (matches.length > 0) {
    console.log('Matching Models (max relative error ≤ 1%):');
    for (const r of matches) {
      const err = r.details?.maxRelativeError ?? 0;
      console.log(`  ✅ ${r.model}: max rel error = ${(err * 100).toFixed(4)}%`);
    }
    console.log();
  }
  
  // Print mismatch details
  if (mismatches.length > 0) {
    console.log('Mismatched Models (max relative error > 1%):');
    for (const r of mismatches) {
      console.log(`  ❌ ${r.model}:`);
      if (r.details) {
        console.log(`     Max relative error: ${(r.details.maxRelativeError * 100).toFixed(2)}%`);
        console.log(`     Max absolute error: ${r.details.maxAbsoluteError.toFixed(6)}`);
        console.log(`     At time: ${r.details.errorAtTime}, column: ${r.details.errorColumn}`);
        console.log(`     Web rows: ${r.details.webRows}, Ref rows: ${r.details.refRows}`);
        console.log(`     Columns match: ${r.details.columnMatch}`);
        if (r.details.samples && r.details.samples.length > 0) {
          console.log(`     Sample discrepancies:`);
          for (const s of r.details.samples.slice(0, 3)) {
            console.log(`       t=${s.time}: ${s.column} web=${s.web.toExponential(4)} ref=${s.ref.toExponential(4)} (${(s.relError * 100).toFixed(2)}%)`);
          }
        }
      }
    }
    console.log();
  }
  
  // Print missing references
  if (missing.length > 0) {
    console.log('Models without reference GDAT files:');
    for (const r of missing) {
      console.log(`  ⚠️  ${r.model}`);
    }
    console.log();
  }
  
  // Print errors
  if (errors.length > 0) {
    console.log('Models with errors:');
    for (const r of errors) {
      console.log(`  💥 ${r.model}: ${r.error}`);
    }
    console.log();
  }
  
  console.log('='.repeat(80));
  console.log(`Total: ${results.length} models compared`);
}

main().catch(console.error);
