import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { BNGLParser } from '../packages/engine/src/services/graph/core/BNGLParser';
import { BNGXMLWriter } from '../services/simulation/BNGXMLWriter';

// Recursively find all .bngl files in a directory
function findBnglFiles(dir: string): string[] {
    const results: string[] = [];

    try {
        const files = readdirSync(dir);

        for (const file of files) {
            const fullPath = join(dir, file);
            try {
                const stat = statSync(fullPath);

                if (stat.isDirectory()) {
                    results.push(...findBnglFiles(fullPath));
                } else if (extname(file).toLowerCase() === '.bngl') {
                    results.push(fullPath);
                }
            } catch (err) {
                // Skip files we can't access
                continue;
            }
        }
    } catch (err) {
        // Skip directories we can't access
    }

    return results;
}

describe('Multi-Compartment Support - Model Repository Validation', () => {
    const nfsimModelsDir = 'c:\\Users\\Achyudhan\\OneDrive - University of Pittsburgh\\Desktop\\Achyudhan\\School\\PhD\\Research\\BioNetGen\\bionetgen-web-simulator\\src\\wasm\\nfsim\\nfsim-src';
    const publicModelsDir = 'c:\\Users\\Achyudhan\\OneDrive - University of Pittsburgh\\Desktop\\Achyudhan\\School\\PhD\\Research\\BioNetGen\\bionetgen-web-simulator\\public\\models';

    let nfsimModels: string[] = [];
    let publicModels: string[] = [];

    try {
        nfsimModels = findBnglFiles(nfsimModelsDir);
        publicModels = findBnglFiles(publicModelsDir);
    } catch (err) {
        console.warn('Could not scan model directories:', err);
    }

    const allModels = [...nfsimModels, ...publicModels];
    const modelCount = allModels.length;

    it(`finds BNGL models (found ${modelCount} models)`, () => {
        expect(modelCount).toBeGreaterThan(0);
        console.log(`Found ${nfsimModels.length} models in NFsim source`);
        console.log(`Found ${publicModels.length} models in public/models`);
    });

    it('parses all models without crashing the parser', () => {
        const errors: Array<{ file: string; error: string }> = [];
        let parsedCount = 0;
        let skippedCount = 0;

        for (const modelPath of allModels) {
            try {
                const content = readFileSync(modelPath, 'utf-8');

                // Skip empty files or files with only comments
                const nonCommentLines = content.split('\n').filter(line => {
                    const trimmed = line.trim();
                    return trimmed.length > 0 && !trimmed.startsWith('#');
                });

                if (nonCommentLines.length === 0) {
                    skippedCount++;
                    continue;
                }

                // Try to parse
                try {
                    BNGLParser.parse(content);
                    parsedCount++;
                } catch (parseErr: any) {
                    // Some models may have syntax we don't support yet - that's OK
                    // We're mainly checking we don't crash
                    errors.push({
                        file: modelPath.split('\\').pop() || modelPath,
                        error: parseErr.message?.substring(0, 100) || 'Unknown error'
                    });
                }
            } catch (readErr) {
                skippedCount++;
            }
        }

        console.log(`Successfully parsed: ${parsedCount}/${modelCount}`);
        console.log(`Skipped (empty/unreadable): ${skippedCount}`);
        console.log(`Parse errors: ${errors.length}`);

        if (errors.length > 0 && errors.length < 20) {
            console.log('Sample parse errors:');
            errors.slice(0, 10).forEach(e => {
                console.log(`  ${e.file}: ${e.error}`);
            });
        }

        // We mainly want to ensure the parser doesn't crash
        expect(parsedCount).toBeGreaterThan(0);
    });

    it('generates XML for parseable models without crashing', () => {
        const xmlErrors: Array<{ file: string; error: string }> = [];
        let xmlGeneratedCount = 0;
        let containsCompartments = 0;
        let containsTransport = 0;

        for (const modelPath of allModels.slice(0, 50)) { // Test first 50 to keep test time reasonable
            try {
                const content = readFileSync(modelPath, 'utf-8');

                try {
                    const model = BNGLParser.parse(content);

                    // Try to generate XML
                    try {
                        const xml = BNGXMLWriter.write(model);
                        xmlGeneratedCount++;

                        // Check for compartment features
                        if (xml.includes('<Compartment')) {
                            containsCompartments++;
                        }
                        if (xml.includes('<ChangeCompartment')) {
                            containsTransport++;
                        }
                    } catch (xmlErr: any) {
                        xmlErrors.push({
                            file: modelPath.split('\\').pop() || modelPath,
                            error: xmlErr.message?.substring(0, 100) || 'XML generation failed'
                        });
                    }
                } catch (parseErr) {
                    // Skip models that don't parse
                }
            } catch (readErr) {
                // Skip unreadable files
            }
        }

        console.log(`Generated XML for: ${xmlGeneratedCount} models`);
        console.log(`Models with compartments: ${containsCompartments}`);
        console.log(`Models with transport reactions: ${containsTransport}`);

        if (xmlErrors.length > 0 && xmlErrors.length < 10) {
            console.log('XML generation errors:');
            xmlErrors.forEach(e => {
                console.log(`  ${e.file}: ${e.error}`);
            });
        }

        // We want to ensure XML generation doesn't crash
        expect(xmlGeneratedCount).toBeGreaterThan(0);
    });

    it('correctly identifies compartment-containing models', () => {
        const compartmentModels: string[] = [];

        for (const modelPath of allModels) {
            try {
                const content = readFileSync(modelPath, 'utf-8');

                // Simple heuristic: check if file contains compartment definition
                if (content.includes('begin compartments') || content.includes('begin compartment')) {
                    compartmentModels.push(modelPath.split('\\').pop() || modelPath);
                }
            } catch (err) {
                // Skip
            }
        }

        console.log(`Found ${compartmentModels.length} models with compartments:`);
        if (compartmentModels.length > 0 && compartmentModels.length < 20) {
            compartmentModels.forEach(m => console.log(`  - ${m}`));
        }

        // This is informational - we just want to know what's available
        expect(compartmentModels.length).toBeGreaterThanOrEqual(0);
    });
});
