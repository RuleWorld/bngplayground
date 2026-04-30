
import fs from 'fs';
import path from 'path';

const LOG_PATH = 'published_csv_generation_v3_utf8.log';
const MODELS_LIST = 'viable_published_models.txt';
const WEB_OUTPUT_DIR = 'web_output';
const BNG_OUTPUT_DIR = 'bng_test_output';

const models = fs.readFileSync(MODELS_LIST, 'utf-8').split(',').map(m => m.trim()).filter(m => m);
const logContent = fs.readFileSync(LOG_PATH, 'utf-8');

const analysis = [];

for (const model of models) {
    const modelId = model.replace(/-/g, '_').toLowerCase();
    const csvFile = `results_${modelId}.csv`;
    const csvExists = fs.readdirSync(WEB_OUTPUT_DIR).some(f => f.toLowerCase() === csvFile.toLowerCase());
    
    // Find log entries for this model (case-insensitive)
    const regex = new RegExp(`Processing: ${model}`, 'i');
    const matchStart = logContent.search(regex);
    let error = 'None';
    let category = 'Success';

    if (matchStart === -1) {
        category = 'Not Processed';
    } else {
        const nextLogSection = logContent.indexOf('Processing:', matchStart + 20);
        const section = logContent.substring(matchStart, nextLogSection === -1 ? logContent.length : nextLogSection);
        
        if (section.includes('Failed: Error: BNGL parse error')) {
            category = 'Parse Error';
            const match = section.match(/BNGL parse error: (.*)/);
            error = match ? match[1].substring(0, 100) : 'Unknown parse error';
        } else if (section.includes('Failed: Error:')) {
            category = 'Runtime Error';
            const match = section.match(/Failed: Error: (.*)/);
            error = match ? match[1].substring(0, 100) : 'Unknown runtime error';
        } else if (section.includes('Success: 0, Failed: 0')) {
            category = 'No Actions?';
            error = 'Batch completed with 0 success/fail';
        } else if (!csvExists) {
            category = 'Missing File';
            error = 'Reported success but file not found';
        }
    }

    // Check GDAT for reference
    const gdatFile = `${model}.gdat`;
    const gdatExists = fs.existsSync(path.join(BNG_OUTPUT_DIR, gdatFile)) || 
                      fs.readdirSync(BNG_OUTPUT_DIR).some(f => f.startsWith(model) && f.endsWith('.gdat'));

    analysis.push({ model, category, error, csvExists, gdatExists });
}

console.log('| Model | Category | Error Snippet | CSV? | GDAT? |');
console.log('|---|---|---|---|---|');
analysis.forEach(a => {
    const escapedError = a.error
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|');
    console.log(`| ${a.model} | ${a.category} | ${escapedError} | ${a.csvExists ? '✅' : '❌'} | ${a.gdatExists ? '✅' : '❌'} |`);
});
