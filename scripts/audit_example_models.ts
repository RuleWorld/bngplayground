
/**
 * Audit all example models to find ones with "dead" observables (always 0)
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseBNGL } from '../services/parseBNGL.ts';
import { NetworkGenerator } from '../packages/engine/src/services/graph/NetworkGenerator.ts';
import { BNGLParser } from '../packages/engine/src/services/graph/core/BNGLParser.ts';
import { createSolver } from '@bngplayground/engine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AuditResult {
    name: string;
    status: 'PASS' | 'WARN' | 'FAIL';
    observables: { name: string; final: number }[];
    deadObservables: string[];
    error?: string;
}

async function auditModel(filePath: string): Promise<AuditResult> {
    const name = path.basename(filePath, '.bngl');
    
    try {
        const code = fs.readFileSync(filePath, 'utf-8');
        const model = parseBNGL(code);
        
        if (model.observables.length === 0) {
            return { name, status: 'WARN', observables: [], deadObservables: [], error: 'No observables' };
        }
        
        // Generate network
        const seedSpecies = model.species.map(s => BNGLParser.parseSpeciesGraph(s.name));
        const parametersMap = new Map(Object.entries(model.parameters).map(([k, v]) => [k, Number(v)]));
        const observablesSet = new Set<string>(model.observables.map(o => o.name));

        const rules = model.reactionRules.flatMap(r => {
            let rate = 0;
            try { rate = BNGLParser.evaluateExpression(r.rate, parametersMap, observablesSet); } catch {}
            
            let reverseRate = 0;
            if (r.reverseRate) {
                try { reverseRate = BNGLParser.evaluateExpression(r.reverseRate, parametersMap, observablesSet); } catch {}
            }

            const formatList = (list: string[]) => list.length > 0 ? list.join(' + ') : '0';
            const ruleStr = `${formatList(r.reactants)} -> ${formatList(r.products)}`;

            try {
                const forwardRule = BNGLParser.parseRxnRule(ruleStr, rate);
                if (r.isBidirectional) {
                    const rvStr = `${formatList(r.products)} -> ${formatList(r.reactants)}`;
                    return [forwardRule, BNGLParser.parseRxnRule(rvStr, reverseRate)];
                }
                return [forwardRule];
            } catch { return []; }
        });

        const generator = new NetworkGenerator({
            maxSpecies: 200,
            maxReactions: 500,
            maxIterations: 10,
            maxStoich: 50
        });
        
        const network = await generator.generate(seedSpecies, rules, () => {});
        
        if (network.species.length === 0) {
            return { name, status: 'FAIL', observables: [], deadObservables: [], error: 'Zero species generated' };
        }
        
        // Set up simulation
        const speciesMap = new Map<string, number>();
        network.species.forEach((s, i) => speciesMap.set(BNGLParser.speciesGraphToString(s.graph), i));
        
        const y0 = new Float64Array(network.species.length);
        model.species.forEach(s => {
            const canonicalName = BNGLParser.speciesGraphToString(BNGLParser.parseSpeciesGraph(s.name));
            const idx = speciesMap.get(canonicalName);
            if (idx !== undefined) y0[idx] = s.initialConcentration;
        });
        
        // Match observables to species (simple pattern matching)
        const observableMatches = model.observables.map(obs => {
            const patterns = obs.pattern.split(',').map(p => p.trim());
            const indices: number[] = [];
            network.species.forEach((s, i) => {
                const speciesStr = BNGLParser.speciesGraphToString(s.graph);
                for (const pat of patterns) {
                    // Simple substring match for state patterns like "state~active"
                    const cleanPat = pat.replace(/[()]/g, '').replace(/!/g, '');
                    if (speciesStr.includes(cleanPat.split('(')[0])) {
                        // Check state if specified
                        const stateMatch = pat.match(/~(\w+)/);
                        if (stateMatch) {
                            if (speciesStr.includes(`~${stateMatch[1]}`)) {
                                indices.push(i);
                                break;
                            }
                        } else {
                            indices.push(i);
                            break;
                        }
                    }
                }
            });
            return { name: obs.name, indices };
        });
        
        const concreteReactions = network.reactions.map(r => ({
            reactants: r.reactants,
            products: r.products,
            rate: r.rate
        }));

        const derivatives = (y: Float64Array, out: Float64Array) => {
            out.fill(0);
            for (const rxn of concreteReactions) {
                let velocity = rxn.rate;
                for (const idx of rxn.reactants) velocity *= y[idx];
                for (const idx of rxn.reactants) out[idx] -= velocity;
                for (const idx of rxn.products) out[idx] += velocity;
            }
        };

        const solver = await createSolver(network.species.length, derivatives, {
            atol: 1e-6,
            rtol: 1e-3,
            maxSteps: 10000,
            solver: 'auto'
        } as any);

        // Simulate to t=100
        let y = new Float64Array(y0);
        const res = solver.integrate(y, 0, 100);
        if (res.success) y = new Float64Array(res.y);
        
        // Evaluate observables
        const observables: { name: string; final: number }[] = [];
        const deadObservables: string[] = [];
        
        for (const obs of observableMatches) {
            let sum = 0;
            for (const idx of obs.indices) sum += y[idx];
            observables.push({ name: obs.name, final: sum });
            if (sum < 1e-9 && obs.indices.length > 0) {
                deadObservables.push(obs.name);
            }
        }
        
        const status = deadObservables.length === model.observables.length ? 'FAIL' 
                     : deadObservables.length > 0 ? 'WARN' 
                     : 'PASS';
        
        return { name, status, observables, deadObservables };
        
    } catch (e: any) {
        return { name, status: 'FAIL', observables: [], deadObservables: [], error: e.message };
    }
}

async function main() {
    const modelsDir = path.join(__dirname, '../example-models');
    const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.bngl'));
    
    console.log(`Auditing ${files.length} example models...\n`);
    
    const results: AuditResult[] = [];
    
    for (const file of files) {
        const result = await auditModel(path.join(modelsDir, file));
        results.push(result);
        
        const color = result.status === 'PASS' ? '\x1b[32m' 
                    : result.status === 'WARN' ? '\x1b[33m' 
                    : '\x1b[31m';
        const reset = '\x1b[0m';
        
        if (result.status !== 'PASS') {
            console.log(`${color}[${result.status}]${reset} ${result.name}`);
            if (result.deadObservables.length > 0) {
                console.log(`       Dead observables: ${result.deadObservables.join(', ')}`);
            }
            if (result.error) {
                console.log(`       Error: ${result.error}`);
            }
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY:');
    console.log(`  PASS: ${results.filter(r => r.status === 'PASS').length}`);
    console.log(`  WARN: ${results.filter(r => r.status === 'WARN').length}`);
    console.log(`  FAIL: ${results.filter(r => r.status === 'FAIL').length}`);
    
    const needsFix = results.filter(r => r.status === 'WARN' || r.status === 'FAIL');
    if (needsFix.length > 0) {
        console.log('\nModels needing attention:');
        needsFix.forEach(r => {
            console.log(`  - ${r.name}: ${r.deadObservables.join(', ') || r.error}`);
        });
    }
}

main().catch(console.error);
