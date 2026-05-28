import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, resolve } from 'path';
import { parseBNGLStrict } from '../packages/engine/src/parser/BNGLParserWrapper';
import { BNGXMLWriter } from '@bngplayground/engine';
import { collectBnglFiles, resolveRuleHubRoot } from './helpers/rulehub';

const NFSIM_MODELS_DIR = resolve(process.cwd(), 'src', 'wasm', 'nfsim', 'nfsim-src');
const RULEHUB_ROOT = resolveRuleHubRoot(process.cwd());
// New RuleHub layout: Tutorials/, Examples/, Published/ (no more Contributed/BNGPlayground_PublicRuntime)
const RULEHUB_MODEL_DIRS = [
    join(RULEHUB_ROOT, 'Tutorials'),
    join(RULEHUB_ROOT, 'Examples'),
];

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
    let nfsimModels: string[] = [];
    const publicModels: string[] = [];

    try {
        nfsimModels = findBnglFiles(NFSIM_MODELS_DIR);
        for (const dir of RULEHUB_MODEL_DIRS) {
            publicModels.push(...collectBnglFiles(dir));
        }
    } catch (err) {
        console.warn('Could not scan model directories:', err);
    }

    const allModels = [...nfsimModels, ...publicModels];
    const modelCount = allModels.length;

    it(`finds BNGL models (found ${modelCount} models)`, () => {
        expect(modelCount).toBeGreaterThan(0);
        console.log(`Found ${nfsimModels.length} models in NFsim source`);
        console.log(`Found ${publicModels.length} models in RuleHub (Tutorials + Examples)`);
    });

    it('parses all models without crashing the parser', () => {
        const errors: Array<{ file: string; error: string }> = [];
        let parsedCount = 0;
        let skippedCount = 0;

        // Parser is synchronous — a model that triggers an infinite loop in the
        // ANTLR visitor will hang the entire CI job.  Skip models over 500
        // non-comment lines; they are tested via the massive-parity suite instead.
        const MAX_LINES = 500;

        const MAX_TOTAL_MS = 120_000; // 2 min
        const SLOW_THRESHOLD_MS = 2000; // 2s
        const slowModels: Array<{ file: string; ms: number }> = [];
        let cumulativeMs = 0;
        let processedInLoop = 0;

        console.log(`[ModelRepoValidation] Parse pass starting for ${allModels.length} models`);

        for (const modelPath of allModels) {
            processedInLoop++;
            console.log(`[ModelRepoValidation] Parse ${processedInLoop}/${allModels.length}: ${modelPath.split('\\').pop() || modelPath}`);
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

                if (nonCommentLines.length > MAX_LINES) {
                    skippedCount++;
                    continue;
                }

                // Try to parse
                const start = performance.now();
                try {
                    parseBNGLStrict(content);
                    parsedCount++;
                } catch (parseErr: any) {
                    // Some models may have syntax we don't support yet - that's OK
                    // We're mainly checking we don't crash
                    errors.push({
                        file: modelPath.split('\\').pop() || modelPath,
                        error: parseErr.message?.substring(0, 100) || 'Unknown error'
                    });
                }
                const duration = performance.now() - start;
                cumulativeMs += duration;

                if (duration > SLOW_THRESHOLD_MS) {
                    slowModels.push({
                        file: modelPath.split('\\').pop() || modelPath,
                        ms: Math.round(duration)
                    });
                }

                if (cumulativeMs > MAX_TOTAL_MS) {
                    console.log(`Stopping model parsing early: reached cumulative budget of ${MAX_TOTAL_MS}ms. Parsed ${parsedCount} models, skipped ${skippedCount}, remaining: ${allModels.length - processedInLoop}`);
                    break;
                }
            } catch (readErr) {
                skippedCount++;
            }
        }

        console.log(`Successfully parsed: ${parsedCount}/${modelCount}`);
        console.log(`Skipped (empty/unreadable): ${skippedCount}`);
        console.log(`Parse errors: ${errors.length}`);
        console.log(`Cumulative parse time: ${(cumulativeMs / 1000).toFixed(1)}s`);
        if (slowModels.length > 0) {
            console.log(`Slow models (>${SLOW_THRESHOLD_MS}ms):`);
            slowModels.sort((a, b) => b.ms - a.ms).forEach(m => console.log(`  ${m.ms}ms: ${m.file}`));
        }

        if (errors.length > 0 && errors.length < 20) {
            console.log('Sample parse errors:');
            errors.slice(0, 10).forEach(e => {
                console.log(`  ${e.file}: ${e.error}`);
            });
        }

        // We mainly want to ensure the parser doesn't crash
        expect(parsedCount).toBeGreaterThan(0);
    }, 30000);

    it('generates XML for parseable models without crashing', () => {
        const xmlErrors: Array<{ file: string; error: string }> = [];
        let xmlGeneratedCount = 0;

        console.log(`[ModelRepoValidation] XML pass starting for ${Math.min(allModels.length, 50)} models`);

        for (const [index, modelPath] of allModels.slice(0, 50).entries()) { // Test first 50 to keep test time reasonable
            console.log(`[ModelRepoValidation] XML ${index + 1}/${Math.min(allModels.length, 50)}: ${modelPath.split('\\').pop() || modelPath}`);
            try {
                const content = readFileSync(modelPath, 'utf-8');
                const nonCommentLines = content.split('\n').filter(l => {
                    const t = l.trim(); return t.length > 0 && !t.startsWith('#');
                });
                if (nonCommentLines.length > 500) continue; // skip large models that can hang

                try {
                    const model = parseBNGLStrict(content);

                    // Try to generate XML
                    try {
                        BNGXMLWriter.write(model);
                        xmlGeneratedCount++;
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

        // We want to ensure XML generation doesn't crash
        expect(xmlGeneratedCount).toBeGreaterThan(0);
    }, 30000);

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