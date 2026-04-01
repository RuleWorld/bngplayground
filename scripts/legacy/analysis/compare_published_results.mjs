
import fs from 'fs';
import path from 'path';

const WEB_OUTPUT_DIR = 'web_output';
const BNG_OUTPUT_DIR = 'bng_test_output';
const MODELS_LIST = 'published_models_list.txt';
const REPORT_FILE = 'published_parity_report.md';

const models = fs.readFileSync(MODELS_LIST, 'utf-8').split(',').map(m => m.trim()).filter(m => m);

console.log(`Starting refined parity comparison for ${models.length} models...`);

const results = [];

const webFiles = fs.readdirSync(WEB_OUTPUT_DIR);
const bngFiles = fs.readdirSync(BNG_OUTPUT_DIR);

for (const model of models) {
    // 1. Find CSV (results_model.csv, case-insensitive, dash to underscore, or substring)
    const modelId = model.replace(/-/g, '_').toLowerCase();
    const csvFiles = webFiles.filter(f => {
        const lf = f.toLowerCase();
        return (lf === `results_${modelId}.csv` || lf.includes(`results_${modelId}`) || lf.includes(model.toLowerCase())) && f.endsWith('.csv');
    });

    const csvFile = csvFiles[0];

    // 2. Find ALL GDATs for this model (for multi-phase aggregation)
    const modelLower = model.toLowerCase();
    const otherModels = models.filter(m => m.toLowerCase() !== modelLower).map(m => m.toLowerCase());
    
    const matchingGdats = bngFiles.filter(f => {
        const lf = f.toLowerCase();
        if (lf === `${modelLower}.gdat`) return true;
        if (lf.startsWith(`${modelLower}_`) && lf.endsWith('.gdat')) {
            // Check if this GDAT actually belongs to a LONGER model name
            // e.g., if lf is "abc_scan.gdat" and models has "abc_scan", it belongs there.
            const possibleModelName = lf.replace(/\.gdat$/, '');
            if (otherModels.includes(possibleModelName)) return false;
            
            // Also check for double underscores (often used in BNG2 multi-phase)
            return true;
        }
        return false;
    });
    
    if (!csvFile) {
        results.push({ model, status: 'No CSV', error: 'Web output missing' });
        continue;
    }
    
    if (matchingGdats.length === 0) {
        results.push({ model, status: 'No GDAT', error: 'BNG2 reference missing' });
        continue;
    }

    const csvPath = path.join(WEB_OUTPUT_DIR, csvFile);
    console.log(`Comparing ${model}: ${csvFile} vs ${matchingGdats.join(', ')}`);
    
    try {
        const csvContent = fs.readFileSync(csvPath, 'utf-8').split('\n').filter(l => l.trim());
        const csvRows = csvContent.length - 1; // Subtract header

        // Aggregate rows from all matching GDATs
        let totalGdatRows = 0;
        for (const gdatFile of matchingGdats) {
            const gdatPath = path.join(BNG_OUTPUT_DIR, gdatFile);
            const gdatContent = fs.readFileSync(gdatPath, 'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
            totalGdatRows += gdatContent.length;
        }
        
        const rowDiff = Math.abs(csvRows - totalGdatRows);
        let status = 'MISMATCH';
        if (rowDiff === 0) status = 'MATCH';
        else if (rowDiff <= 5) status = 'CLOSE';

        results.push({ 
            model, 
            status, 
            csvRows, 
            gdatRows: totalGdatRows, 
            rowDiff,
            csvFile,
            gdatFiles: matchingGdats.join(';')
        });
        
    } catch (error) {
        results.push({ model, status: 'Error', error: error.message });
    }
}

// Generate report
let report = '# Published Models Parity Report\n\n';
report += `Generated at: ${new Date().toISOString()}\n\n`;
report += `Total Models evaluated: ${models.length}\n\n`;
report += '| Model | Status | Web Rows | BNG2 Rows | Diff | Matches? | Files |\n';
report += '|---|---|---|---|---|---|---|\n';

results.forEach(r => {
    const matchIcon = r.status === 'MATCH' ? '✅' : (r.status === 'CLOSE' ? '⚠️' : '❌');
    const files = r.csvFile ? `${r.csvFile} / ${r.gdatFile}` : 'N/A';
    report += `| ${r.model} | ${r.status} | ${r.csvRows || 0} | ${r.gdatRows || 0} | ${r.rowDiff || 0} | ${matchIcon} | ${files} |\n`;
});

fs.writeFileSync(REPORT_FILE, report);
console.log(`Report generated: ${REPORT_FILE}`);

const summary = {
    MATCH: results.filter(r => r.status === 'MATCH').length,
    CLOSE: results.filter(r => r.status === 'CLOSE').length,
    MISMATCH: results.filter(r => r.status === 'MISMATCH' && r.csvRows > 0).length,
    EMPTY: results.filter(r => (r.csvRows === 0 || r.gdatRows === 0) && r.status !== 'No CSV' && r.status !== 'No GDAT').length,
    FAIL: results.filter(r => r.status === 'No CSV' || r.status === 'No GDAT' || r.status === 'Error').length
};

console.log('--- SUMMARY ---');
console.table(summary);
