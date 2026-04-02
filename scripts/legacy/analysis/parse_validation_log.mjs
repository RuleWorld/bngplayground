
import fs from 'fs';
import path from 'path';

const logPath = 'published_csv_generation_v2_utf8.log';
const content = fs.readFileSync(logPath, 'utf-8');
const lines = content.split('\n');

let currentModel = null;
const failures = [];
const successes = [];

for (const line of lines) {
    // [generate:web-output] Processing: ModelName
    const procMatch = line.match(/\[generate:web-output\] Processing: (.+)/);
    if (procMatch) {
        currentModel = procMatch[1].trim();
        continue;
    }

    // [browser] ❌ Failed: Error: ...
    if (line.includes('Failed: Error:') || line.includes('Batch Run Complete. Success: 0, Failed: 1')) {
        if (currentModel) {
            failures.push({ model: currentModel, error: line.trim() });
            currentModel = null; // Reset
        }
    }
    
    // [browser] Batch Run Complete. Success: 1, Failed: 0
    if (line.includes('Batch Run Complete. Success: 1')) {
        if (currentModel) {
            successes.push(currentModel);
            currentModel = null; // Reset
        }
    }
}

console.log('--- ANALYSIS ---');
console.log(`Total Success: ${successes.length}`);
console.log(`Total Failures: ${failures.length}`);
console.log('');
console.log('Failed Models:');
failures.forEach(f => console.log(`- ${f.model}: ${f.error}`));

console.log('');
console.log('Checking for missing Success files:');
const outputDir = 'web_output';
if (fs.existsSync(outputDir)) {
    const files = fs.readdirSync(outputDir);
    const missingSuccess = successes.filter(m => {
        // Try various case combinations or likely filenames
        const nameUpper = `results_${m}.csv`;
        const nameLower = `results_${m.toLowerCase()}.csv`;
        const nameOriginal = `results_${m}.csv`; 
        
        return !files.includes(nameUpper) && !files.includes(nameLower);
    });
    
    if (missingSuccess.length > 0) {
        console.log(`WARNING: ${missingSuccess.length} models reported success but have no CSV file:`);
        missingSuccess.forEach(m => console.log(`- ${m}`));
    } else {
        console.log('All successful models have corresponding CSV files.');
    }
}
