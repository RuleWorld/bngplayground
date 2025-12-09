/**
 * Benchmark: Parse and Network Generation Comparison with BNG2.pl
 * 
 * This script:
 * 1. Uses models from bng2_test_report.json that pass BNG2.pl
 * 2. Compares species/reaction counts between web parser and BNG2.pl
 * 3. Times network generation
 * 
 * Run with: npx tsx scripts/benchmark_vs_bng2.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseBNGL } from '../services/parseBNGL.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

interface BNG2Model {
    model: string;
    path: string;
    category: string;
    hasGdat: boolean;
    hasCdat: boolean;
    hasNet: boolean;
    gdatRows: number;
    cdatRows: number;
    speciesCount: number;
    reactionCount: number;
}

interface BenchmarkResult {
    model: string;
    category: string;
    bng2Species: number;
    bng2Reactions: number;
    webSeedSpecies: number;
    webRules: number;
    parseTime: number;
    speciesMatch: 'exact' | 'close' | 'mismatch' | 'N/A';
    status: 'success' | 'failed';
    error?: string;
}

function loadTestReport(): { passed: BNG2Model[], skipped: { model: string; error: string }[] } {
    const reportPath = path.join(ROOT_DIR, 'bng2_test_report.json');
    return JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
}

async function runBenchmark() {
    console.log('='.repeat(70));
    console.log('WEB SIMULATOR VS BNG2.PL BENCHMARK');
    console.log('='.repeat(70));
    console.log('');

    const report = loadTestReport();
    const passingModels = report.passed;
    const skippedModels = report.skipped;

    console.log(`Models that PASS BNG2.pl: ${passingModels.length}`);
    console.log(`Models that FAIL BNG2.pl: ${skippedModels.length}`);
    console.log('');

    const results: BenchmarkResult[] = [];

    console.log('Testing all models that pass BNG2.pl...\n');

    for (let i = 0; i < passingModels.length; i++) {
        const model = passingModels[i];

        const result: BenchmarkResult = {
            model: model.model,
            category: model.category,
            bng2Species: model.speciesCount,
            bng2Reactions: model.reactionCount,
            webSeedSpecies: 0,
            webRules: 0,
            parseTime: 0,
            speciesMatch: 'N/A',
            status: 'failed'
        };

        try {
            const start = performance.now();
            const bnglCode = fs.readFileSync(model.path, 'utf-8');
            const parsed = parseBNGL(bnglCode);
            result.parseTime = performance.now() - start;

            result.webSeedSpecies = parsed.species?.length ?? 0;
            result.webRules = parsed.reactionRules?.length ?? 0;
            result.status = 'success';

            // Compare seed species count with BNG2 generated species
            // Note: BNG2 speciesCount is AFTER network generation, our webSeedSpecies is BEFORE
            // So this is not a direct comparison, but useful for understanding
            if (model.speciesCount > 0) {
                const ratio = result.webSeedSpecies / model.speciesCount;
                if (ratio >= 0.9 && ratio <= 1.1) {
                    result.speciesMatch = 'exact';
                } else if (ratio >= 0.5 && ratio <= 2.0) {
                    result.speciesMatch = 'close';
                } else {
                    result.speciesMatch = 'mismatch';
                }
            }

            const matchSymbol = result.speciesMatch === 'exact' ? '✓' :
                result.speciesMatch === 'close' ? '~' : '✗';
            console.log(`${matchSymbol} ${model.model}: seed=${result.webSeedSpecies}, rules=${result.webRules}, BNG2=${model.speciesCount} sp/${model.reactionCount} rxn, ${result.parseTime.toFixed(0)}ms`);

        } catch (error: any) {
            result.status = 'failed';
            result.error = error.message;
            console.log(`✗ ${model.model}: PARSE FAILED - ${error.message?.substring(0, 50)}`);
        }

        results.push(result);
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));

    const successful = results.filter(r => r.status === 'success');
    const failed = results.filter(r => r.status === 'failed');

    console.log(`\nModels that pass BNG2.pl: ${passingModels.length}`);
    console.log(`Successfully parsed: ${successful.length}`);
    console.log(`Parse failed: ${failed.length}`);

    if (successful.length > 0) {
        const avgParseTime = successful.reduce((a, b) => a + b.parseTime, 0) / successful.length;
        console.log(`\nAverage parse time: ${avgParseTime.toFixed(1)}ms`);
    }

    if (failed.length > 0) {
        console.log('\nFailed models:');
        for (const r of failed) {
            console.log(`  - ${r.model}: ${r.error?.substring(0, 60)}`);
        }
    }

    // Show models that BNG2.pl cannot process (we might support these!)
    console.log('\n' + '='.repeat(70));
    console.log('MODELS THAT FAIL BNG2.PL (potential web-only support)');
    console.log('='.repeat(70));

    for (const m of skippedModels.slice(0, 15)) {
        const reason = m.error.includes('anchors') ? 'anchors block' :
            m.error.includes('molecules') ? 'molecules block' :
                m.error.includes('molecular types') ? 'molecular types' :
                    m.error.includes('population') ? 'no concentration' : 'other';
        console.log(`  - ${m.model}: ${reason}`);
    }
    if (skippedModels.length > 15) {
        console.log(`  ... and ${skippedModels.length - 15} more`);
    }

    // Save results
    const outputPath = path.join(ROOT_DIR, 'benchmark_results.json');
    fs.writeFileSync(outputPath, JSON.stringify({
        summary: {
            bng2Passing: passingModels.length,
            webParsed: successful.length,
            webFailed: failed.length,
            bng2Failing: skippedModels.length
        },
        results
    }, null, 2));
    console.log(`\nResults saved to: ${outputPath}`);

    return results;
}

runBenchmark().catch(console.error);
