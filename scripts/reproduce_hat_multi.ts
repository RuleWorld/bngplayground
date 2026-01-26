import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { parseBNGLStrict } from '../src/parser/BNGLParserWrapper.js';
import { simulate } from '../services/simulation/SimulationLoop.js';
import { generateExpandedNetwork } from '../services/simulation/NetworkExpansion.js';
import { loadEvaluator } from '../services/simulation/ExpressionEvaluator.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

async function run() {
    console.log('Loading evaluator...');
    await loadEvaluator();

    console.log('Parsing model...');
    const modelCode = fs.readFileSync(path.join(PROJECT_ROOT, 'public', 'models', 'Hat_2016.bngl'), 'utf8');
    let model = parseBNGLStrict(modelCode);

    console.log('Expanding network...');
    model = await generateExpandedNetwork(model, () => {}, () => {});

    const allPhases = model.simulationPhases || [];
    let cumulativeTime = 0;
    let allData: any[] = [];
    let headers: string[] = [];
    let finalState: number[] | null = null;
    let previousEndTime = 0;

    for (let i = 0; i < allPhases.length; i++) {
        const phase = allPhases[i];
        const shouldIncludeOutput = (phase.n_steps ?? 100) >= 1 && !phase.steady_state;

        const effectiveDuration = phase.continue && i > 0
            ? ((phase.t_end || 0) > previousEndTime ? (phase.t_end || 0) - previousEndTime : (phase.t_end || 100))
            : (phase.t_end || 100);

        const phaseOptions = {
            method: phase.method as any || 'ode',
            t_end: effectiveDuration,
            n_steps: phase.n_steps || 100,
            solver: 'cvode' as any
        };

        const currentModel = JSON.parse(JSON.stringify(model));
        currentModel.simulationPhases = [phase];
        
        if (i > 0 && finalState) {
            currentModel.species = model.species.map((sp: any, j: number) => ({
                ...sp,
                initialConcentration: finalState![j] || 0
            }));
        }

        // Apply changes that occur after the previous phase
        const concChanges = (model.concentrationChanges || []).filter((c: any) => c.afterPhaseIndex === i - 1);
        for (const change of concChanges) {
            const idx = currentModel.species.findIndex((s: any) => s.name === change.species);
            if (idx >= 0) currentModel.species[idx].initialConcentration = change.value;
        }

        const paramChanges = (model.parameterChanges || []).filter((p: any) => p.afterPhaseIndex === i - 1);
        for (const change of paramChanges) {
            currentModel.parameters[change.parameter] = change.value;
            console.log(`Applied setParameter: ${change.parameter} = ${change.value}`);
        }

        // Simple recalculation of dependent parameters (for Hat_2016)
        if (paramChanges.length > 0 && currentModel.paramExpressions) {
             for (const [name, expr] of Object.entries(currentModel.paramExpressions)) {
                 try {
                     // Very simple evaluator for this script
                     let evalExpr = String(expr);
                     for (const [pn, pv] of Object.entries(currentModel.parameters)) {
                         evalExpr = evalExpr.replace(new RegExp(`\\b${pn}\\b`, 'g'), String(pv));
                     }
                     currentModel.parameters[name] = eval(evalExpr);
                 } catch (e) {}
             }
        }

        console.log(`Phase ${i+1}: t_end=${effectiveDuration}, n_steps=${phase.n_steps}`);
        const results = await simulate(0, currentModel, phaseOptions, {
            checkCancelled: () => {},
            postMessage: () => {}
        });
        headers = results.headers;

        if (shouldIncludeOutput) {
            const skipFirstRow = allData.length > 0 && results.data.length > 0 && (results.data[0].time === 0);
            const startIndex = skipFirstRow ? 1 : 0;
            const timeOffset = phase.continue && i > 0 ? previousEndTime : cumulativeTime;

            for (let j = startIndex; j < results.data.length; j++) {
                const row = { ...results.data[j] };
                row.time = timeOffset + (row.time || 0);
                allData.push(row);
            }

            if (!phase.continue) cumulativeTime += effectiveDuration;
            previousEndTime = (phase.continue && i > 0) ? (previousEndTime + effectiveDuration) : cumulativeTime;
        } else {
            previousEndTime += effectiveDuration;
        }

        if (results.speciesData && results.speciesData.length > 0) {
            const lastRow = results.speciesData[results.speciesData.length - 1];
            finalState = model.species.map((sp: any) => lastRow[sp.name] ?? 0);
        }
    }

    console.log(`Generated ${allData.length} rows.`);
    const csvLines = [headers.join(',')];
    for (const row of allData) {
        csvLines.push(headers.map(h => row[h]).join(','));
    }

    const outPath = path.join(PROJECT_ROOT, 'web_output', 'results_hat_2016.csv');
    fs.writeFileSync(outPath, csvLines.join('\n'));
    console.log(`✅ Saved results to ${outPath}`);
}

run().catch(console.error);
