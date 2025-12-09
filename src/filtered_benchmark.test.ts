/**
 * Benchmark: Test web simulator network generation on all example models
 * These are AI-generated models that should all work
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { parseBNGL } from '../services/parseBNGL';
import { NetworkGenerator } from './services/graph/NetworkGenerator';
import { BNGLParser } from './services/graph/core/BNGLParser';

interface BenchmarkResult {
    model: string;
    status: 'pass' | 'fail' | 'timeout' | 'skip' | 'error';
    timeMs: number;
    speciesCount?: number;
    reactionCount?: number;
    error?: string;
}

const results: BenchmarkResult[] = [];

describe('All Example Models Benchmark', () => {
    const projectRoot = path.resolve(__dirname, '..');
    const exampleModelsDir = path.join(projectRoot, 'example-models');
    
    // Get all .bngl files in example-models
    const exampleModels = fs.existsSync(exampleModelsDir)
        ? fs.readdirSync(exampleModelsDir)
            .filter(f => f.endsWith('.bngl'))
            .map(f => f.replace('.bngl', ''))
            .sort()
        : [];
    
    it.each(exampleModels)('should generate network for %s', async (modelName) => {
        const startTime = Date.now();
        const result: BenchmarkResult = { model: modelName, status: 'error', timeMs: 0 };
        
        try {
            const bnglPath = path.join(exampleModelsDir, `${modelName}.bngl`);
            const bnglContent = fs.readFileSync(bnglPath, 'utf-8');
            const model = parseBNGL(bnglContent);
            
            const seedSpecies = model.species.map(s => BNGLParser.parseSpeciesGraph(s.name));
            const parametersMap = new Map(Object.entries(model.parameters).map(([k, v]) => [k, Number(v)]));
            
            const rules = model.reactionRules.flatMap(r => {
                const rate = BNGLParser.evaluateExpression(r.rate, parametersMap);
                const reverseRate = r.reverseRate ? BNGLParser.evaluateExpression(r.reverseRate, parametersMap) : rate;
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
            
            const generator = new NetworkGenerator({ maxSpecies: 500, maxIterations: 200 });
            const network = await generator.generate(seedSpecies, rules);
            
            result.speciesCount = network.species.length;
            result.reactionCount = network.reactions.length;
            result.timeMs = Date.now() - startTime;
            result.status = 'pass';
            
            console.log(`✓ ${modelName}: ${result.speciesCount} species, ${result.reactionCount} rxns (${result.timeMs}ms)`);
            
        } catch (e: any) {
            result.timeMs = Date.now() - startTime;
            result.status = 'error';
            result.error = e.message || String(e);
            console.log(`✗ ${modelName}: ${result.error?.substring(0, 60)}`);
        }
        
        results.push(result);
    }, 30000);
    
    it('should print summary', () => {
        console.log('\n\n=== BENCHMARK SUMMARY ===\n');
        
        const passed = results.filter(r => r.status === 'pass');
        const errors = results.filter(r => r.status === 'error');
        
        console.log(`Passed: ${passed.length}/${results.length}`);
        console.log(`Errors: ${errors.length}`);
        
        console.log('\n--- All Passed Models (sorted by time) ---');
        for (const r of passed.sort((a, b) => a.timeMs - b.timeMs)) {
            console.log(`  ${r.model}: ${r.speciesCount} sp, ${r.reactionCount} rxns (${r.timeMs}ms)`);
        }
        
        if (errors.length > 0) {
            console.log('\n--- Errors ---');
            for (const r of errors) {
                console.log(`  ${r.model}: ${r.error?.substring(0, 80)}`);
            }
        }
        
        // Write to file
        fs.writeFileSync(
            path.join(projectRoot, 'benchmark_results.json'),
            JSON.stringify(results, null, 2)
        );
        
        expect(passed.length).toBeGreaterThan(0);
    });
});
