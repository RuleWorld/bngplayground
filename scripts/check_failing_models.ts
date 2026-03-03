/**
 * Check all failing models with ANTLR parser
 * Searches for models by name in published-models directory
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseBNGLWithANTLR } from '../packages/engine/src/parser/BNGLParserWrapper';

const MODEL_NAMES = [
    // 20 models that pass BNG2.pl but fail ANTLR (as of 2024-12-20)
    'notch',
    'Rule_based_Ran_transport',
    'vilar_2002b',
    'vilar_2002c',
    'wnt',
    'Dushek_2011',
    'Dushek_2014',
    'Erdem_2021',
    'Jung_2017',
    'Kozer_2013',
    'Kozer_2014',
    'Zhang_2021',
    'Mertins_2023',
    'Rule_based_egfr_compart',
    'BaruaBCR_2012',
    'BLBR',
    'organelle_transport',
    'organelle_transport_struct',
    'Creamer_2012',
    'ComplexDegradation',
];

function findModelFile(dir: string, name: string): string | null {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const found = findModelFile(fullPath, name);
            if (found) return found;
        } else if (entry.isFile() && entry.name === `${name}.bngl`) {
            return fullPath;
        }
    }
    return null;
}

async function run() {
    const projectRoot = process.cwd();
    const modelsDir = path.join(projectRoot, 'published-models');
    
    console.log('=== Checking Failing Models with ANTLR Parser ===\n');
    
    const results: { model: string; success: boolean; errors: string[] }[] = [];
    
    for (const modelName of MODEL_NAMES) {
        const fullPath = findModelFile(modelsDir, modelName);
        
        if (!fullPath) {
            console.log(`SKIP: ${modelName} - File not found`);
            results.push({ model: modelName, success: false, errors: ['File not found'] });
            continue;
        }
        
        try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const result = parseBNGLWithANTLR(content);
            
            if (result.success) {
                console.log(`PASS: ${modelName}`);
                results.push({ model: modelName, success: true, errors: [] });
            } else {
                const errorMsgs = result.errors.map(e => `Line ${e.line}:${e.column}: ${e.message}`);
                console.log(`FAIL: ${modelName}`);
                errorMsgs.slice(0, 3).forEach(e => console.log(`  ${e}`));
                results.push({ model: modelName, success: false, errors: errorMsgs });
            }
        } catch (e: any) {
            console.log(`ERROR: ${modelName} - ${e.message}`);
            results.push({ model: modelName, success: false, errors: [e.message] });
        }
    }
    
    // Summary
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const skipped = results.filter(r => r.errors.includes('File not found')).length;
    console.log(`\n=== Summary: ${passed} passed, ${failed - skipped} failed, ${skipped} not found ===`);
    
    // Write detailed results to file
    fs.writeFileSync('failing_models_check.json', JSON.stringify(results, null, 2));
    console.log('\nDetailed results written to failing_models_check.json');
}

run().catch(console.error);
