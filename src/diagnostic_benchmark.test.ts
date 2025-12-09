/**
 * Diagnostic Benchmark: Kozer_2014 Analysis
 * Deep dive into why this model is slow compared to BNG2.pl
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

import { parseBNGL } from '../services/parseBNGL';
import { NetworkGenerator } from './services/graph/NetworkGenerator';
import { BNGLParser } from './services/graph/core/BNGLParser';

describe('Diagnostic Benchmark: Kozer_2014', () => {
    const projectRoot = path.resolve(__dirname, '..');
    const bng2Path = 'C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl';
    const tempDir = path.join(projectRoot, 'temp_diag');

    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    // Target specific slow model
    const models = [
        { name: 'Kozer_2014', path: path.join(projectRoot, 'published-models/complex-models/Kozer_2014.bngl') },
        // Control model (fast)
        { name: 'Michaelis-Menten', path: path.join(projectRoot, 'example-models/michaelis-menten-kinetics.bngl') }
    ];

    it.each(models)('should profile %s', async (modelData) => {
        console.log(`\n\n=== Diagnosing ${modelData.name} ===`);

        const bnglContent = fs.readFileSync(modelData.path, 'utf-8');

        // 1. Parsing Profiles
        const t0 = Date.now();
        const parsedModel = parseBNGL(bnglContent);
        const t1 = Date.now();
        console.log(`Parsing time: ${t1 - t0}ms`);

        const seedSpecies = parsedModel.species.map(s => BNGLParser.parseSpeciesGraph(s.name));
        const parametersMap = new Map(Object.entries(parsedModel.parameters).map(([k, v]) => [k, Number(v)]));

        const rules = parsedModel.reactionRules.flatMap(r => {
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

        console.log(`Rules parsed: ${rules.length}`);

        // 2. Network Generation Profile
        console.log(`Starting Network Generation...`);
        const genStart = Date.now();

        // We'll subclass/mock to peek inside if needed, or just run it
        // Limiting max species to reasonable number for profile
        // FIX: Respect parsed network options (especially maxStoich)
        // Convert maxStoich Record to Map if present
        let maxStoich: number | Map<string, number> = 500; // default
        if (parsedModel.networkOptions?.maxStoich) {
            if (typeof parsedModel.networkOptions.maxStoich === 'object') {
                maxStoich = new Map(Object.entries(parsedModel.networkOptions.maxStoich));
            } else {
                maxStoich = parsedModel.networkOptions.maxStoich;
            }
        }

        const genOptions = { 
            maxSpecies: 3000, 
            maxIterations: 1000,
            ...parsedModel.networkOptions,
            maxStoich
        };
        console.log(`Generator Options:`, JSON.stringify(genOptions, (k, v) => v instanceof Map ? Array.from(v.entries()) : v, 2));
        
        const generator = new NetworkGenerator(genOptions);

        const network = await generator.generate(seedSpecies, rules);
        const genTime = Date.now() - genStart;

        console.log(`Generation Time: ${genTime}ms`);
        console.log(`Generated: ${network.species.length} species, ${network.reactions.length} reactions`);
        console.log(`Avg time per species: ${(genTime / network.species.length).toFixed(2)}ms`);

        // 3. BNG2.pl Comparison
        console.log(`Running BNG2.pl for comparison...`);
        try {
            const tempBngl = path.join(tempDir, `${modelData.name}.bngl`);
            fs.copyFileSync(modelData.path, tempBngl);

            const bngStart = Date.now();
            execSync(`perl "${bng2Path}" "${tempBngl}"`, { cwd: tempDir, timeout: 60000, stdio: 'ignore' });
            const bngTime = Date.now() - bngStart;

            console.log(`BNG2.pl Time: ${bngTime}ms`);
            console.log(`Ratio (Web/BNG): ${(genTime / bngTime).toFixed(2)}x`);
        } catch (e) {
            console.log(`BNG2.pl failed/timeout: ${e}`);
        }

    }, 120000);
});
