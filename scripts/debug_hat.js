import fs from 'fs';
import path from 'path';

const webPath = 'web_output/results_hat_2016.csv';
const refPath = 'bng_test_output/Hat_2016_ode_3_relax.gdat';

function parseCSV(content) {
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const data = lines.slice(1).map(l => l.split(',').map(Number));
    return { headers, data };
}

function parseGDAT(content) {
    const lines = content.trim().split('\n');
    const headers = lines[0].replace(/^#/, '').trim().split(/\s+/);
    const data = lines.slice(1).map(l => l.trim().split(/\s+/).map(Number));
    return { headers, data };
}

if (!fs.existsSync(webPath) || !fs.existsSync(refPath)) {
    console.error('Missing files');
    console.error('Web:', fs.existsSync(webPath));
    console.error('Ref:', fs.existsSync(refPath));
    process.exit(1);
}

const web = parseCSV(fs.readFileSync(webPath, 'utf8'));
const ref = parseGDAT(fs.readFileSync(refPath, 'utf8'));

console.log(`Web Rows: ${web.data.length}, Last T: ${web.data[web.data.length-1][0]}`);
console.log(`Ref Rows: ${ref.data.length}, Last T: ${ref.data[ref.data.length-1][0]}`);

const commonCols = web.headers.filter(h => ref.headers.includes(h));
console.log('Common Columns:', commonCols.slice(0, 5));

function printRow(label, data, headers, rowIdx) {
    const row = data[rowIdx];
    if (!row) return;
    console.log(`${label} [Row ${rowIdx}]:`);
    commonCols.slice(0, 5).forEach(col => {
        const idx = headers.indexOf(col);
        console.log(`  ${col}: ${row[idx]}`);
    });
}

printRow('WEB', web.data, web.headers, 0);
printRow('REF', ref.data, ref.headers, 0);
