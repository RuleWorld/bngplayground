import fs from 'fs';
import path from 'path';

// Configuration
const GDAT_DIR = "gdat_comparison_output";
const THRESHOLD = 1e-6; // Minimum variance to consider "dynamic"

console.log("Starting Dynamic Behavior Verification...");

if (!fs.existsSync(GDAT_DIR)) {
    console.error(`Error: Directory ${GDAT_DIR} not found. Run parity check first.`);
    process.exit(1);
}

const files = fs.readdirSync(GDAT_DIR).filter(f => f.endsWith('_bng2.gdat'));
let flatModels = [];
let dynamicModels = 0;

console.log(`Analyzing ${files.length} reference output files...`);

for (const file of files) {
    const content = fs.readFileSync(path.join(GDAT_DIR, file), 'utf8');
    const lines = content.trim().split('\n');

    if (lines.length < 2) {
        console.warn(`Warning: ${file} is empty or invalid.`);
        flatModels.push({ name: file, reason: "Empty/Invalid" });
        continue;
    }

    // Parse header and data
    // BNG .gdat format: First line implies headers (starts with #)
    // Columns are space/tab separated

    const dataLines = lines.slice(1); // Skip header logic for now, just look at data columns
    // Determine number of columns from first data line
    const firstLineCols = dataLines[0].trim().split(/\s+/);
    const numCols = firstLineCols.length;

    // Initialize stats
    let colMin = new Array(numCols).fill(Infinity);
    let colMax = new Array(numCols).fill(-Infinity);

    for (const line of dataLines) {
        if (line.startsWith('#')) continue; // Skip comments if any inside data
        const cols = line.trim().split(/\s+/).map(Number);

        for (let i = 0; i < numCols; i++) {
            if (cols[i] < colMin[i]) colMin[i] = cols[i];
            if (cols[i] > colMax[i]) colMax[i] = cols[i];
        }
    }

    // Check variance (skip column 0 which is Time)
    let isDynamic = false;
    let dynamicObservables = [];

    // Start from index 1 (Time is usually index 0)
    for (let i = 1; i < numCols; i++) {
        const range = colMax[i] - colMin[i];
        if (range > THRESHOLD) {
            isDynamic = true;
            // break; // Don't break if we want detailed stats later, but for now speed is key
        }
    }

    if (!isDynamic) {
        flatModels.push({ name: file, reason: "All Observables Constant" });
    } else {
        dynamicModels++;
    }
}

console.log("\n--- Verification Results ---");
console.log(`Total Scanned: ${files.length}`);
console.log(`Dynamic: ${dynamicModels}`);
console.log(`Static/Flat: ${flatModels.length}`);

if (flatModels.length > 0) {
    console.log("\n[WARNING] The following models produced static output (flat lines):");
    flatModels.forEach(m => console.log(`- ${m.name} (${m.reason})`));
    process.exit(1); // Fail the check
} else {
    console.log("\n[SUCCESS] All models exhibit dynamic behavior!");
    process.exit(0);
}
