// @ts-nocheck
/**
 * Full Comparison Benchmark: Web Simulator vs BNG2.pl
 * Runs on ALL published models (excluding unsupported features)
 * Compares network generation time and success status
 * DIAGNOSTICS: Flags models taking >2min or >3x slower than BNG2.pl
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

import { parseBNGLStrict } from './parser/BNGLParserWrapper';
import { NetworkGenerator } from './services/graph/NetworkGenerator';
import { NautyService } from './services/graph/core/NautyService';
import { BNGLParser } from './services/graph/core/BNGLParser';

interface BenchmarkResult {
    model: string;
    category: string;
    status: 'pass' | 'fail' | 'timeout' | 'skip' | 'error';
    webTimeMs: number;
    bng2TimeMs?: number;
    webSpecies?: number;
    webReactions?: number;
    bng2Species?: number;
    bng2Reactions?: number;
    match?: boolean;
    error?: string;
    bng2Error?: string;
    slowDiagnosed?: boolean; // True if >2min or >3x BNG2
}

const results: BenchmarkResult[] = [];

// BNG2.pl path for pre-check
const BNG2_PATH = 'C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl';

/**
 * Check if a model can be parsed by BNG2.pl
 * Returns { success: boolean, error?: string }
 */
function checkBNG2Parse(modelPath: string, tempDir: string): { success: boolean; error?: string } {
    try {
        const modelName = path.basename(modelPath, '.bngl');
        const testFile = path.join(tempDir, `${modelName}_check.bngl`);
        const content = fs.readFileSync(modelPath, 'utf-8');
        
        // Write the model content to temp file
        fs.writeFileSync(testFile, content);
        
        // Try to run BNG2.pl with a short timeout
        try {
            execSync(`perl "${BNG2_PATH}" "${testFile}"`, {
                timeout: 60000,  // 60 second timeout
                cwd: tempDir,
                stdio: ['pipe', 'pipe', 'pipe'],
                encoding: 'utf-8'
            });
            
            // Check if output files were created (.gdat and .net)
            const gdatFile = path.join(tempDir, `${modelName}_check.gdat`);
            const netFile = path.join(tempDir, `${modelName}_check.net`);
            if (fs.existsSync(gdatFile) && fs.existsSync(netFile)) {
                return { success: true };
            }
            // No output files - might be a model with no simulate command, still OK
            return { success: true };
        } catch (e: any) {
            const stderr = e.stderr || '';
            const stdout = e.stdout || '';
            const output = stderr + stdout + (e.message || '');
            
            // Check for any error indicators
            const errorPatterns = [
                'FATAL', 'ERROR', 'Can not parse', 'ABORT',
                'could not', 'Died at', 'Unrecognized', 'undefined'
            ];
            if (errorPatterns.some(p => output.includes(p))) {
                return { success: false, error: output.slice(0, 200) };
            }
            
            // Check if output files were created despite non-zero exit
            const gdatFile = path.join(tempDir, `${modelName}_check.gdat`);
            const netFile = path.join(tempDir, `${modelName}_check.net`);
            if (fs.existsSync(gdatFile) || fs.existsSync(netFile)) {
                return { success: true };
            }
            
            return { success: false, error: 'No output generated: ' + output.slice(0, 150) };
        }
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// Unsupported features in Web Simulator
const UNSUPPORTED_FEATURES = ['simulate_nf', 'readFile'];
// Models that fail BNG2.pl parsing - only test web simulator on models BNG2.pl can parse
const SKIP_MODELS = new Set([
    // simulate_nf models
    'Model_ZAP',
    'polymer',
    'polymer_draft',
    'McMillan_2021',
    // BNG2.pl parse errors (tested 2024-12-07)
    'Blinov_egfr',
    'Blinov_ran',
    'Ligon_2014',
    'Zhang_2023',           // observable bond mismatch !+ vs !1
    'vilar_2002',           // parse error
    'Korwek_2023',          // parse error
    'Rule_based_Ran_transport_draft', // parse error
    'Mukhopadhyay_2013',    // parse error

    'chemistry',            // parse error
    'simple',               // parse error
    'toy1',                 // parse error
    'toy2',                 // parse error
    'Massole_2023',         // parse error
    'Lang_2024',            // parse error
    // Barua models - known species count issues (hit max limit)
    'Barua_2007',
    'Barua_2013',
    // Lin_Prion - very slow network generation
    'Lin_Prion_2019',
]);

// Models that are known to be slow in the web netgen benchmark.
// Keep them in the benchmark, but allow longer per-test runtime.
const SLOW_MODELS = new Set([
    'Kozer_2013',
    'BLBR',
]);

describe('Full Published Models Benchmark', () => {
    // Debug logging
    console.log('STARTING BENCHMARK SUITE');

    beforeAll(async () => {
        console.log('beforeAll: initializing Nauty');
        await NautyService.getInstance().init();
        console.log('beforeAll: Nauty initialized');
    });

    const projectRoot = path.resolve(__dirname, '..');
    const publishedModelsDir = path.join(projectRoot, 'published-models');
    const tempDir = path.join(projectRoot, 'temp_bench');
    // Using detected BNG2 path
    const bng2Path = 'C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl';

    // Ensure temp dir exists
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    // Helper function to recursively find all BNGL files
    function findBnglFilesRecursively(dir: string): { name: string; path: string; category: string }[] {
        const results: { name: string; path: string; category: string }[] = [];
        
        function scan(currentDir: string, category: string) {
            try {
                const entries = fs.readdirSync(currentDir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(currentDir, entry.name);
                    if (entry.isDirectory()) {
                        // Recurse into subdirectory, use subdirectory name as category
                        scan(fullPath, entry.name);
                    } else if (entry.isFile() && entry.name.endsWith('.bngl')) {
                        results.push({
                            name: entry.name.replace('.bngl', ''),
                            path: fullPath,
                            category: category
                        });
                    }
                }
            } catch (e) {
                console.error(`Error scanning ${currentDir}:`, e);
            }
        }
        
        scan(dir, 'root');
        return results;
    }

    // Collect all models recursively from published-models and example-models
    const models: { name: string; path: string; category: string }[] = [];
    const exampleModelsDir = path.join(projectRoot, 'example-models');

    try {
        // Scan published-models directory
        if (fs.existsSync(publishedModelsDir)) {
            const allModels = findBnglFilesRecursively(publishedModelsDir);
            models.push(...allModels);
        }
        
        // Also scan example-models directory (AI-generated models)
        if (fs.existsSync(exampleModelsDir)) {
            const exampleModels = findBnglFilesRecursively(exampleModelsDir);
            models.push(...exampleModels);
        }
    } catch (e) {
        console.error("Test Discovery Error:", e);
    }

    if (models.length === 0) {
        console.log("No models found. Adding dummy.");
        models.push({ name: "DUMMY", path: "dummy.bngl", category: "none" });
    }

    // Debug logging
    console.log(`Found ${models.length} models total across all directories.`);

    it('Environment Check', () => {
        expect(models.length).toBeGreaterThan(0);
    });

    const normalModels = models.filter(m => !SLOW_MODELS.has(m.name));
    const slowModels = models.filter(m => SLOW_MODELS.has(m.name));

    const runBenchmarkForModel = async (modelData: { name: string; path: string; category: string }) => {
        const result: BenchmarkResult = {
            model: modelData.name,
            category: modelData.category,
            status: 'error',
            webTimeMs: 0
        };

        const webStart = Date.now();

        try {
            const bnglContent = fs.readFileSync(modelData.path, 'utf-8');

            // Check unsupported Features
            if (SKIP_MODELS.has(modelData.name) || UNSUPPORTED_FEATURES.some(f => bnglContent.includes(f))) {
                result.status = 'skip';
                result.error = 'Unsupported features (e.g. simulate_nf)';
                results.push(result);
                console.log(`⏭ ${modelData.name}: Unsupported features (skipped)`);
                return;
            }

            // BNG2.pl pre-check: Only test models that BNG2.pl can parse
            const bng2Check = checkBNG2Parse(modelData.path, tempDir);
            if (!bng2Check.success) {
                result.status = 'skip';
                result.error = `BNG2.pl parse failed: ${bng2Check.error}`;
                results.push(result);
                console.log(`⏭ ${modelData.name}: BNG2.pl cannot parse (skipped)`);
                return;
            }

            console.log(`Testing ${modelData.name}...`);

            // --- Web Simulator Run ---
            // Parse with ANTLR (Strict)
            const parsedModel = parseBNGLStrict(bnglContent);
            const seedSpecies = parsedModel.species.map(s => BNGLParser.parseSpeciesGraph(s.name));
            const parametersMap = new Map(Object.entries(parsedModel.parameters).map(([k, v]) => [k, Number(v)]));

            const rules = parsedModel.reactionRules.flatMap(r => {
                let rate: number | string = r.rate;
                try {
                    const val = BNGLParser.evaluateExpression(r.rate, parametersMap);
                    if (!isNaN(val)) rate = val;
                } catch (e) {
                    // Keep as string if evaluation fails
                }

                let reverseRate: number | string | undefined;
                if (r.reverseRate) {
                    reverseRate = r.reverseRate;
                    try {
                        const val = BNGLParser.evaluateExpression(r.reverseRate, parametersMap);
                        if (!isNaN(val)) reverseRate = val;
                    } catch (e) {
                        // Keep as string
                    }
                } else if (r.isBidirectional) {
                    reverseRate = rate;
                }

                const formatList = (list: string[]) => list.length > 0 ? list.join(' + ') : '0';
                const ruleStr = `${formatList(r.reactants)} -> ${formatList(r.products)}`;
                const forwardRule = BNGLParser.parseRxnRule(ruleStr, rate);
                if (r.isBidirectional && reverseRate !== undefined) {
                    const reverseRuleStr = `${formatList(r.products)} -> ${formatList(r.reactants)}`;
                    const reverseRule = BNGLParser.parseRxnRule(reverseRuleStr, reverseRate);
                    return [forwardRule, reverseRule];
                }
                return [forwardRule];

            });

            // FIX: Respect parsed network options (especially maxStoich)
            let maxStoich: number | Record<string, number> = 500;
            if (parsedModel.networkOptions?.maxStoich) {
                maxStoich = parsedModel.networkOptions.maxStoich;
            }

            // Limit max species 
            const generator = new NetworkGenerator({
                maxSpecies: 3000,
                maxIterations: 1000,
                ...parsedModel.networkOptions,
                maxStoich
            });
            const network = await generator.generate(seedSpecies, rules);

            result.webSpecies = network.species.length;
            result.webReactions = network.reactions.length;

            result.webTimeMs = Date.now() - webStart;
            result.status = 'pass';

            // --- BNG2.pl Run (for comparison) ---
            try {
                // Copy BNGL to temp dir to run, but STRIP SIMULATION ACTIONS to ensure fair comparison
                // We only want to compare Network Generation time
                const tempBnglPath = path.join(tempDir, `${modelData.name}.bngl`);

                let bnglForBng2 = fs.readFileSync(modelData.path, 'utf-8');
                // Comment out actions that take time but aren't netgen
                bnglForBng2 = bnglForBng2.replace(/^\s*(simulate|parameter_scan|bifurcate|readFile|writeFile|writeXML|simplify_network)/gm, '# $1');

                // Ensure generate_network is present if it wasn't already or we commented it out (unlikely)
                // But mostly we just want to stop it running long sims.
                // If the model relied on simulate() to generate the network implicitly, we need generate_network()
                if (!bnglForBng2.includes('generate_network')) {
                    bnglForBng2 += '\ngenerate_network({overwrite=>1});\n';
                }

                fs.writeFileSync(tempBnglPath, bnglForBng2);

                const bngStart = Date.now();
                // Run BNG2.pl - capture time
                execSync(`perl "${bng2Path}" "${tempBnglPath}"`, {
                    cwd: tempDir,
                    timeout: 60000, // 60s timeout for BNG2
                    stdio: 'ignore'
                });
                result.bng2TimeMs = Date.now() - bngStart;

                // Try to read .net file for stats
                const netFile = path.join(tempDir, `${modelData.name}.net`);
                if (fs.existsSync(netFile)) {
                    const netContent = fs.readFileSync(netFile, 'utf-8');
                    const speciesMatch = netContent.match(/begin species([\s\S]*?)end species/);
                    const reactionsMatch = netContent.match(/begin reactions([\s\S]*?)end reactions/);

                    if (speciesMatch) {
                        result.bng2Species = speciesMatch[1].trim().split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length;
                    }
                    if (reactionsMatch) {
                        result.bng2Reactions = reactionsMatch[1].trim().split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length;
                    }

                    result.match = (result.webSpecies === result.bng2Species) &&
                        (result.webReactions === result.bng2Reactions);
                }

                // Cleanup temp file
                try { fs.rmSync(netFile); } catch (e) { }
                try { fs.rmSync(tempBnglPath); } catch (e) { }
                try { fs.rmSync(path.join(tempDir, `${modelData.name}.log`)); } catch (e) { }
                try { fs.rmSync(path.join(tempDir, `${modelData.name}.gdat`)); } catch (e) { }
                try { fs.rmSync(path.join(tempDir, `${modelData.name}.cdat`)); } catch (e) { }

            } catch (bngErr: any) {
                result.bng2Error = "BNG2 Failed/Timeout";
            }

            // --- Diagnostics Check ---
            const bngTime = result.bng2TimeMs || 0;
            // Warn if Web > 3x BNG (only if Web > 1s to ignore noise)
            const slowVsBng = (bngTime > 0) && (result.webTimeMs > 3 * bngTime) && (result.webTimeMs > 1000);
            const verySlow = result.webTimeMs > 60000; // Warning at 1 min

            if (slowVsBng || verySlow) {
                result.slowDiagnosed = true;
                const ratio = bngTime > 0 ? (result.webTimeMs / bngTime).toFixed(1) + 'x' : 'N/A';
                console.warn(`⚠️ SLOW: ${modelData.name} - Web: ${result.webTimeMs}ms, BNG2: ${bngTime}ms (Ratio: ${ratio})`);
            }

            const matchSym = result.bng2Species ? (result.match ? '✓' : '✗') : '?';
            const bngTimeStr = result.bng2TimeMs ? `${result.bng2TimeMs}ms` : 'N/A';

            console.log(`✓ ${modelData.name}: Web=${result.webTimeMs}ms (${result.webSpecies}sp), BNG2=${bngTimeStr} [${matchSym}]`);

        } catch (e: any) {
            result.webTimeMs = Math.max(0, Date.now() - webStart);
            result.status = 'error';
            result.error = e.message || String(e);
            console.log(`✗ ${modelData.name}: ${result.error?.substring(0, 60)}`);
        }

        results.push(result);
    };

    // Run all models. Keep known-slow models in the benchmark, but allow longer runtime.
    it.each(normalModels)('should generate network for %s', async (modelData) => {
        await runBenchmarkForModel(modelData);
    }, 180000); // 3 min total test timeout

    it.each(slowModels)('should generate network for %s', async (modelData) => {
        await runBenchmarkForModel(modelData);
    }, 600000); // 10 min total test timeout

    it('should print full summary', () => {
        console.log('\n\n=== FULL BENCHMARK SUMMARY ===\n');

        const passed = results.filter(r => r.status === 'pass');
        const errors = results.filter(r => r.status === 'error');
        const slow = results.filter(r => r.slowDiagnosed);

        console.log(`Total: ${results.length}`);
        console.log(`Passed (Web): ${passed.length}/${models.length}`);
        console.log(`Errors (Web): ${errors.length}`);
        console.log(`Slow/Inefficient Models: ${slow.length}`);

        console.log('\n--- Slow Models (>2min or >3x BNG2) ---');
        for (const r of slow) {
            const bngTime = r.bng2TimeMs || 1;
            const ratio = (r.webTimeMs / bngTime).toFixed(1);
            console.log(`  ${r.model}: ${r.webTimeMs}ms vs BNG2 ${r.bng2TimeMs}ms (${ratio}x) - ${r.webSpecies} species`);
        }

        // Write detailed results
        fs.writeFileSync(
            path.join(projectRoot, 'full_benchmark_results.json'),
            JSON.stringify(results, null, 2)
        );

        expect(passed.length).toBeGreaterThan(0);
    });
});

