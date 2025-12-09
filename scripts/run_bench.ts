import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { parseBNGL } from '../services/parseBNGL';
import { NetworkGenerator } from '../src/services/graph/NetworkGenerator';
import { NautyService } from '../src/services/graph/core/NautyService';
import { BNGLParser } from '../src/services/graph/core/BNGLParser';

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
    slowDiagnosed?: boolean;
}

const SKIP_MODELS = new Set([
    'Model_ZAP', 'polymer', 'polymer_draft', 'McMillan_2021',
    'Blinov_egfr', 'Blinov_ran', 'Ligon_2014', 'Zhang_2023',
    'vilar_2002', 'Korwek_2023', 'Rule_based_Ran_transport_draft',
    'Mukhopadhyay_2013', 
    // 'tlbr' - UN-SKIPPED
    'chemistry', 'simple', 'toy1', 'toy2', 'Massole_2023', 'Lang_2024'
]);

const UNSUPPORTED_FEATURES = ['simulate_nf', 'readFile'];

async function runBenchmarks() {
    console.log("Starting Manual Benchmark Runner (Bypassing Vitest)...");
    
    // Init Nauty
    await NautyService.getInstance().init();
    
    const projectRoot = process.cwd();
    const publishedModelsDir = path.join(projectRoot, 'published-models');
    const tempDir = path.join(projectRoot, 'temp_bench_manual');
    const bng2Path = 'C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl';

    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    let categories: string[] = [];
    const models: { name: string; path: string; category: string }[] = [];

    try {
        if (fs.existsSync(publishedModelsDir)) {
            categories = fs.readdirSync(publishedModelsDir, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name);
                
            for (const cat of categories) {
                const catDir = path.join(publishedModelsDir, cat);
                const bnglFiles = fs.readdirSync(catDir).filter(f => f.endsWith('.bngl'));
                for (const f of bnglFiles) {
                    models.push({
                        name: f.replace('.bngl', ''),
                        path: path.join(catDir, f),
                        category: cat
                    });
                }
            }
        }
    } catch (e) {
        console.error("Discovery error:", e);
    }
    
    console.log(`Found ${models.length} models.`);
    const results: BenchmarkResult[] = [];

    for (const modelData of models) {
        // console.log(`Testing ${modelData.name}...`);
        const result: BenchmarkResult = {
            model: modelData.name,
            category: modelData.category,
            status: 'error',
            webTimeMs: 0
        };

        try {
            const bnglContent = fs.readFileSync(modelData.path, 'utf-8');
            
            if (SKIP_MODELS.has(modelData.name) || UNSUPPORTED_FEATURES.some(f => bnglContent.includes(f))) {
                result.status = 'skip';
                console.log(`⏭ Skipped: ${modelData.name}`);
                results.push(result);
                continue;
            }

            const webStart = Date.now();
            
            // Web Sim Logic
            let parsedModel: any;
            try {
                parsedModel = parseBNGL(bnglContent);
            } catch (parseErr: any) {
                console.error(`[DEBUG ${modelData.name}] parseBNGL threw:`, parseErr.message);
                throw parseErr;
            }
            
            let seedSpecies: any[];
            try {
                seedSpecies = parsedModel.species.map((s: any) => BNGLParser.parseSpeciesGraph(s.name));
            } catch (seedErr: any) {
                console.error(`[DEBUG ${modelData.name}] seed species parsing threw:`, seedErr.message);
                throw seedErr;
            }
            
            const parametersMap = new Map(Object.entries(parsedModel.parameters).map(([k, v]) => [k, Number(v as number)]));

            let rules: any[] = [];
            try {
                rules = parsedModel.reactionRules.flatMap(r => {
                    let rate: number;
                    try {
                        rate = BNGLParser.evaluateExpression(r.rate, parametersMap);
                    } catch (e) {
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
            } catch (rulesErr: any) {
                console.error(`[DEBUG] Rule parsing error for ${modelData.name}:`, rulesErr.message);
                throw rulesErr;
            }

            let maxStoich: any = 500;
            if (parsedModel.networkOptions?.maxStoich) {
                if (typeof parsedModel.networkOptions.maxStoich === 'object') {
                    maxStoich = new Map(Object.entries(parsedModel.networkOptions.maxStoich));
                } else {
                    maxStoich = parsedModel.networkOptions.maxStoich;
                }
            }

            const generator = new NetworkGenerator({
                maxSpecies: 3000,
                maxIterations: 1000,
                ...parsedModel.networkOptions,
                maxStoich
            });
            
            let network: any;
            try {
                network = await generator.generate(seedSpecies, rules);
            } catch (genErr: any) {
                console.error(`[DEBUG ${modelData.name}] generator.generate() threw:`, genErr.message);
                throw genErr;
            }
            
            result.webTimeMs = Date.now() - webStart;
            result.webSpecies = network.species.length;
            result.webReactions = network.reactions.length;
            result.status = 'pass';
            
            // BNG2.pl Logic
             try {
                const tempBnglPath = path.join(tempDir, `${modelData.name}.bngl`);
                let bnglForBng2 = fs.readFileSync(modelData.path, 'utf-8');
                bnglForBng2 = bnglForBng2.replace(/^\s*(simulate|parameter_scan|bifurcate|readFile|writeFile|writeXML|simplify_network)/gm, '# $1');
                if (!bnglForBng2.includes('generate_network')) {
                    bnglForBng2 += '\ngenerate_network({overwrite=>1});\n';
                }
                fs.writeFileSync(tempBnglPath, bnglForBng2);

                const bngStart = Date.now();
                execSync(`perl "${bng2Path}" "${tempBnglPath}"`, {
                    cwd: tempDir,
                    timeout: 60000, 
                    stdio: 'ignore'
                });
                result.bng2TimeMs = Date.now() - bngStart;

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
                 try { fs.rmSync(netFile); } catch (e) { }
                 try { fs.rmSync(tempBnglPath); } catch (e) { }
                 try { fs.rmSync(path.join(tempDir, `${modelData.name}.log`)); } catch (e) { }
                 try { fs.rmSync(path.join(tempDir, `${modelData.name}.gdat`)); } catch (e) { }
                 try { fs.rmSync(path.join(tempDir, `${modelData.name}.cdat`)); } catch (e) { }

            } catch (bngErr: any) {
                result.bng2Error = "BNG2 Failed/Timeout";
            }
            
            const matchSym = result.bng2Species ? (result.match ? '✓' : '✗') : '?';
            const bngTimeStr = result.bng2TimeMs ? `${result.bng2TimeMs}ms` : 'N/A';
            console.log(`✓ ${modelData.name}: Web=${result.webTimeMs}ms (${result.webSpecies}sp), BNG2=${bngTimeStr} [${matchSym}]`);
            results.push(result);

        } catch (e: any) {
             result.status = 'error';
             result.error = e.message;
             console.log(`✗ Error: ${modelData.name} - ${e.message}`);
             results.push(result);
        }
    }
    
    // Summary
    console.log('\n\n=== FULL BENCHMARK SUMMARY ===\n');
    const passed = results.filter(r => r.status === 'pass');
    const errors = results.filter(r => r.status === 'error');
    console.log(`Total: ${results.length}`);
    console.log(`Passed (Web): ${passed.length}/${models.length}`);
    console.log(`Errors (Web): ${errors.length}`);
    
    fs.writeFileSync(path.join(projectRoot, 'full_benchmark_results_manual.json'), JSON.stringify(results, null, 2));
}

runBenchmarks().catch(console.error);
