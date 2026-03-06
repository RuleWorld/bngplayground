
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

const modelsDir = path.join(process.cwd(), 'example-models');
const outputDir = path.join(process.cwd(), 'web_output');

// Configuration
const THRESHOLD = 1e-4; // Normalized rate of change threshold for steady state
const WINDOW_SIZE = 10;   // Number of points to check for stability
const MIN_REDUCTION = 0.2; // Only optimize if we can reduce by at least 20%
const BUFFER = 1.2;      // Add 20% buffer after steady state

function getModels(): string[] {
    return fs.readdirSync(modelsDir).filter(f => f.endsWith('.bngl'));
}

function parseCSV(filePath: string): { headers: string[], data: number[][] } {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const data: number[][] = [];

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',').map(Number);
        if (row.length === headers.length && !row.some(isNaN)) {
            data.push(row);
        }
    }
    return { headers, data };
}

function findSteadyStateTime(data: number[][]): number | null {
    if (data.length < WINDOW_SIZE + 5) return null;

    const numCols = data[0].length;
    // Normalize data for each column to handle different scales
    const normalizedData: number[][] = [];

    for (let col = 1; col < numCols; col++) { // Skip time column (0)
        const colData = data.map(row => row[col]);
        const min = Math.min(...colData);
        const max = Math.max(...colData);
        const range = max - min;

        if (range < 1e-9) {
            // Flat line - steady state since beginning
            normalizedData.push(new Array(data.length).fill(0));
        } else {
            normalizedData.push(colData.map(v => (v - min) / range));
        }
    }

    // Check for steady state
    // We want the earliest time T such that for all t > T, change is minimal
    // Actually, simple slope check at the end is better? No, we want to find WHERE it plateaued.
    // Iterating backwards is efficient.

    let steadyStateIndex = data.length - 1;

    // Check if the END is stable first (last window)
    for (let col = 0; col < normalizedData.length; col++) {
        const series = normalizedData[col];
        // Calculate variations in the last window
        const lastWindow = series.slice(-WINDOW_SIZE);
        const variance = lastWindow.reduce((a, b) => a + Math.abs(b - lastWindow[0]), 0) / WINDOW_SIZE;
        if (variance > THRESHOLD) {
            console.log(`[Optimize] Column ${col} not stable at end. Variance: ${variance}`);
            return null; // Model hasn't reached steady state yet, can't trim.
        }
    }

    // Move backwards to find where stability breaks
    for (let i = data.length - 1; i >= WINDOW_SIZE; i--) {
        let isStable = true;
        for (let col = 0; col < normalizedData.length; col++) {
            const series = normalizedData[col];
            // Compare current value to the final value (approximate steady state value)
            // If difference > tolerance, we are not in steady state.
            const finalVal = series[series.length - 1];
            const currentVal = series[i];
            if (Math.abs(currentVal - finalVal) > THRESHOLD * 5) { // Slightly looser for "reached" vs "stayed"
                isStable = false;
                break;
            }
        }
        if (!isStable) {
            steadyStateIndex = i + 1; // The point AFTER instability is steady
            break;
        }
        if (i === WINDOW_SIZE) steadyStateIndex = 0; // Stable all the way?
    }

    return data[steadyStateIndex][0];
}

function getCsvPath(modelName: string): string | null {
    const baseName = modelName.replace('.bngl', '');
    // Try various patterns: original, underscores, etc.
    const patterns = [
        `results_${baseName}.csv`,
        `results_${baseName.replace(/-/g, '_')}.csv`,
        `results_${baseName.replace(/ /g, '_')}.csv`
    ];

    for (const p of patterns) {
        const fullPath = path.join(outputDir, p);
        if (fs.existsSync(fullPath)) return fullPath;
    }
    return null;
}

function optimizeModel(modelName: string) {
    let csvPath = getCsvPath(modelName);

    if (!csvPath) {
        console.log(`[Optimize] Generating output for ${modelName}...`);
        try {
            // Run generation for this specific model
            execSync(`npm run generate:web-output -- --models ${modelName.replace('.bngl', '')}`, { stdio: 'ignore' });
            csvPath = getCsvPath(modelName);
        } catch (e) {
            console.error(`[Optimize] Failed to generate output for ${modelName}`);
            return;
        }
    }

    if (!csvPath) {
        console.log(`[Optimize] CSV still not found for ${modelName} after generation.`);
        return;
    }

    const { headers, data } = parseCSV(csvPath);
    if (data.length === 0) return;

    const steadyTime = findSteadyStateTime(data);

    if (steadyTime === null) {
        // console.log(`[Optimize] ${modelName}: Steady state not detected or not reached.`);
        return;
    }

    const lastTime = data[data.length - 1][0];
    // Optimize if steady state is reached significantly earlier (e.g. at 70% of total time)
    // Add small buffer
    const optimalTime = steadyTime * BUFFER;

    if (optimalTime < lastTime * (1 - MIN_REDUCTION) && optimalTime > 0) {
        // Round to nice number
        let roundedTime: number;
        if (optimalTime > 100) roundedTime = Math.ceil(optimalTime / 50) * 50;
        else if (optimalTime > 10) roundedTime = Math.ceil(optimalTime / 10) * 10;
        else roundedTime = Math.ceil(optimalTime);

        // Ensure we don't accidentally extend it or make it 0
        if (roundedTime >= lastTime) return;

        console.log(`[Optimize] ${modelName}: Reducing t_end ${lastTime} -> ${roundedTime} (Steady @ ${steadyTime.toFixed(1)})`);
        updateBNGL(modelName, roundedTime);
    }
}

function updateBNGL(modelName: string, newTEnd: number) {
    const filePath = path.join(modelsDir, modelName);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Look for simulate command. Use regex.
    // simulate({method=>"ode",t_end=>X,...})
    // Single phase optimization for now.

    // Check if multi-phase
    const simulateCount = (content.match(/simulate\(/g) || []).length;
    if (simulateCount > 1) {
        console.log(`[Optimize] ${modelName}: Skipped (Multi-phase models require manual review).`);
        return;
    }

    // Replace t_end
    const newContent = content.replace(/t_end=>[\d\.]+/, `t_end=>${newTEnd}`);

    if (newContent !== content) {
        fs.writeFileSync(filePath, newContent);
        console.log(`[Optimize] ${modelName}: Updated t_end to ${newTEnd}`);
    } else {
        console.log(`[Optimize] ${modelName}: Failed to update regex.`);
    }
}

function main() {
    const models = getModels();
    console.log(`Found ${models.length} models.`);

    // 1. Identify missing CSVs
    const missingModels: string[] = [];
    for (const model of models) {
        if (!getCsvPath(model)) {
            missingModels.push(model.replace('.bngl', ''));
        }
    }

    // 2. Batch generate if needed
    if (missingModels.length > 0) {
        console.log(`[Optimize] Generating output for ${missingModels.length} models...`);
        // Split into chunks to avoid command line length limits
        const chunkSize = 20;
        for (let i = 0; i < missingModels.length; i += chunkSize) {
            const chunk = missingModels.slice(i, i + chunkSize);
            console.log(`[Optimize] Processing batch ${i / chunkSize + 1}...`);
            try {
                execSync(`npm run generate:web-output -- --models "${chunk.join(' ')}"`, { stdio: 'inherit' });
            } catch (e) {
                console.error(`[Optimize] Batch generation failed for chunk starting with ${chunk[0]}`);
            }
        }
    }

    // 3. Optimize loop
    for (const model of models) {
        // Now CSVs should exist
        optimizeModel(model);
    }
}

main();
