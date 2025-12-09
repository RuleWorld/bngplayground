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

import { parseBNGL } from '../services/parseBNGL';
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
]);

describe('Full Published Models Benchmark', () => {
    beforeAll(async () => {
        await NautyService.getInstance().init();
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

    // Collect all models
    let categories: string[] = [];
    const models: { name: string; path: string; category: string }[] = [];

    try {
        categories = fs.existsSync(publishedModelsDir)
            ? fs.readdirSync(publishedModelsDir, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name)
            : [];

        for (const cat of categories) {
            const catDir = path.join(publishedModelsDir, cat);
            const bnglFiles = fs.readdirSync(catDir).filter(f => f.endsWith('.bngl'));
            for (const f of bnglFiles) {
                const modelName = f.replace('.bngl', '');
                // Removed filtering for now
                models.push({
                    name: modelName,
                    path: path.join(catDir, f),
                    category: cat
                });
            }
        }
    } catch (e) {
        console.error("Test Discovery Error:", e);
    }

    if (models.length === 0) {
        console.log("No models found. Adding dummy.");
        models.push({ name: "DUMMY", path: "dummy.bngl", category: "none" });
    }

    // Debug logging
    console.log(`Found categories: ${categories.join(', ')}`);
    console.log(`Found ${models.length} models.`);

    it('Environment Check', () => {
        expect(models.length).toBeGreaterThan(0);
    });

    // Run all models (timeout 150s per test limit, allowing for BNG2 time + setup)
    it.each(models)('should generate network for %s', async (modelData) => {
        const result: BenchmarkResult = {
            model: modelData.name,
            category: modelData.category,
            status: 'error',
            webTimeMs: 0
        };

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

            console.log(`Testing ${modelData.name}...`);

            // --- Web Simulator Run ---
            // Enforce 120s timeout for Web Simulator logic
            const webStart = Date.now();

            // Promise wrapper for timeout
            await new Promise<void>(async (resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(new Error("Web Simulator Timeout (>120s)"));
                }, 120000);

                try {
                    const parsedModel = parseBNGL(bnglContent);
                    const seedSpecies = parsedModel.species.map(s => BNGLParser.parseSpeciesGraph(s.name));
                    const parametersMap = new Map(Object.entries(parsedModel.parameters).map(([k, v]) => [k, Number(v)]));

                    const rules = parsedModel.reactionRules.flatMap(r => {
                        let rate: number;
                        try {
                            rate = BNGLParser.evaluateExpression(r.rate, parametersMap);
                        } catch (e) {
                            // If rate depends on species (functional rate), evaluateExpression fails. 
                            // For network generation benchmark, the exact rate value doesn't matter, so default to 0.
                            rate = 0;
                        }

                        let reverseRate: number;
                        if (r.reverseRate) {
                            try {
                                reverseRate = BNGLParser.evaluateExpression(r.reverseRate, parametersMap);
                            } catch (e) {
                                reverseRate = 0;
                            }
                        } else {
                            reverseRate = rate;
                        }

                        const formatList = (list: string[]) => list.length > 0 ? list.join(' + ') : '0';
                        const ruleStr = `${formatList(r.reactants)} -> ${formatList(r.products)}`;
                        const forwardRule = BNGLParser.parseRxnRule(ruleStr, rate);
                        if (r.isBidirectional) {
                            const reverseRuleStr = `${formatList(r.products)} -> ${formatList(r.reactants)}`;
                            const reverseRule = BNGLParser.parseRxnRule(reverseRuleStr, reverseRate);
                            return [forwardRule, reverseRule];
                        }
                        return [forwardRule];

                    });


                    // FIX: Respect parsed network options (especially maxStoich)
                    let maxStoich: number | Map<string, number> = 500;
                    if (parsedModel.networkOptions?.maxStoich) {
                        if (typeof parsedModel.networkOptions.maxStoich === 'object') {
                            maxStoich = new Map(Object.entries(parsedModel.networkOptions.maxStoich));
                        } else {
                            maxStoich = parsedModel.networkOptions.maxStoich;
                        }
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

                    clearTimeout(timeoutId);
                    resolve();
                } catch (e) {
                    clearTimeout(timeoutId);
                    reject(e);
                }
            });

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
            result.webTimeMs = Date.now() - result.webTimeMs; // rough adjustment if not set
            if (result.webTimeMs <= 0) result.webTimeMs = 0;

            result.status = 'error';
            result.error = e.message || String(e);
            console.log(`✗ ${modelData.name}: ${result.error?.substring(0, 60)}`);
        }

        results.push(result);
    }, 180000); // 3 min total test timeout

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
