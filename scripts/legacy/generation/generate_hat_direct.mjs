import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

// 1. Load the worker script from bnglService.ts
const serviceSource = fs.readFileSync(path.join(PROJECT_ROOT, 'services', 'bnglService.ts'), 'utf8');
const workerMatch = serviceSource.match(/const workerScript = `([\s\S]*?)`;/);
if (!workerMatch) throw new Error('workerScript not found');
const workerScript = workerMatch[1];

// 2. Set up a mock environment for the worker script
const mockSelf = {
    postMessage: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    console: console
};
const factory = new Function('self', `${workerScript}; return { parseBNGL, simulate };`);
const { parseBNGL, simulate } = factory(mockSelf);

// 3. Load the model
const modelCode = fs.readFileSync(path.join(PROJECT_ROOT, 'public', 'models', 'Hat_2016.bngl'), 'utf8');
const model = parseBNGL(modelCode);

// 4. Multi-phase execution logic (simplified from batchRunner.ts)
async function executeMultiPhase(model) {
    const allPhases = model.simulationPhases || [];
    let cumulativeTime = 0;
    let allData = [];
    let headers = [];
    let finalState = null;
    let previousEndTime = 0;

    for (let i = 0; i < allPhases.length; i++) {
        const phase = allPhases[i];
        
        // Match our new recordFromIdx = 0 logic
        const shouldIncludeOutput = (phase.n_steps ?? 100) >= 1 && !phase.steady_state;

        const effectiveDuration = phase.continue && i > 0
            ? ((phase.t_end || 0) > previousEndTime ? (phase.t_end || 0) - previousEndTime : (phase.t_end || 100))
            : (phase.t_end || 100);

        const phaseOptions = {
            method: phase.method || 'ode',
            t_end: effectiveDuration,
            n_steps: phase.n_steps || 100,
            solver: 'cvode'
        };

        const currentModel = { ...model, simulationPhases: [phase] };
        if (i > 0 && finalState) {
            currentModel.species = model.species.map((sp, j) => ({
                ...sp,
                initialConcentration: finalState[j] || 0
            }));
        }

        console.log(`Simulating Phase ${i+1}: t_end=${effectiveDuration}, continue=${phase.continue}`);
        const results = simulate(currentModel, phaseOptions);
        headers = results.headers;

        if (shouldIncludeOutput) {
            const skipFirstRow = phase.continue && allData.length > 0;
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
            finalState = model.species.map(sp => lastRow[sp.name] ?? 0);
        }
    }
    return { data: allData, headers };
}

async function run() {
    const results = await executeMultiPhase(model);
    console.log(`Generated ${results.data.length} rows.`);

    const csvLines = [results.headers.join(',')];
    for (const row of results.data) {
        csvLines.push(results.headers.map(h => row[h]).join(','));
    }

    const outPath = path.join(PROJECT_ROOT, 'web_output', 'results_hat_2016.csv');
    fs.writeFileSync(outPath, csvLines.join('\n'));
    console.log(`✅ Saved results to ${outPath}`);
}

run().catch(console.error);
