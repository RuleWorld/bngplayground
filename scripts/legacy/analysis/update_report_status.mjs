import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = 'artifacts/SESSION_2026_01_05_web_output_parity';
// Find latest JSON
const files = fs.readdirSync(ARTIFACT_DIR).filter(f => f.endsWith('.json'));
const latestJson = files.sort().reverse()[0]; 
const jsonPath = path.join(ARTIFACT_DIR, latestJson);
const reportPath = process.argv[2];
if (!reportPath) {
    console.error('Please provide path to validation_report.md');
    process.exit(1);
}

console.log(`Reading JSON from ${jsonPath}`);
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Map model name -> status
const statusMap = new Map();
data.results.forEach(r => {
    let icon = '❓';
    let text = 'No Reference';
    if (r.status === 'match') {
        icon = '✅';
        text = 'Passed';
    } else if (r.status === 'mismatch') {
        icon = '❌';
        text = 'Failed';
    }
    
    // Normalize model name key (lowercase)
    statusMap.set(r.model.toLowerCase(), `${icon} ${text}`);
});

const reportContent = fs.readFileSync(reportPath, 'utf8');
const lines = reportContent.split('\n');

function safeName(str) {
    return str.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

let inTable = false;
let newLines = [];

for (const line of lines) {
    if (line.includes('| # | Name | Filename | Description |')) {
        inTable = true;
        newLines.push('| # | Name | Filename | Status | Description |');
        newLines.push('| --- | --- | --- | --- | --- |');
        continue;
    }
    
    if (inTable) {
        if (line.trim().startsWith('| ---')) continue; // Skip separator repeated check
        if (!line.trim().startsWith('|')) {
            inTable = false;
            newLines.push(line);
            continue;
        }

        // Parse row
        // | 1 | AB | AB.bngl | No description available |
        const parts = line.split('|').map(p => p.trim());
        if (parts.length >= 5) {
            const num = parts[1];
            const name = parts[2];
            const filename = parts[3];
            const desc = parts.slice(4, parts.length - 1).join('|'); 
            
            const lowerName = name.toLowerCase();
            let status = statusMap.get(lowerName);

            if (!status) {
                const safe = safeName(name);
                for (const key of statusMap.keys()) {
                     if (key.includes(safe) || safe.includes(key)) {
                         status = statusMap.get(key);
                         break;
                     }
                }
            }
            
            status = status || '➖ Untested'; 
            
            newLines.push(`| ${num} | ${name} | ${filename} | ${status} | ${desc} |`);
        } else {
            newLines.push(line);
        }
    } else {
        newLines.push(line);
    }
}

const outputPath = 'validation_report_updated.md';
fs.writeFileSync(outputPath, newLines.join('\n'));
console.log(`Wrote updated report to ${outputPath}`);
