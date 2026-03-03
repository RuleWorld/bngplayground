
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';
import { parseBNGL as parseNew } from '../services/parseBNGL.ts';
import { parseBNGL as parseOld } from '../services/parseBNGL_Legacy.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TUTORIAL_DIR = path.resolve(__dirname, '../temp_tutorial');

// Find all .bngl files recursively
function findBNGLFiles(dir: string, fileList: string[] = []) {
  if (!fs.existsSync(dir)) return fileList;
  
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory() && !file.startsWith('.')) {
      findBNGLFiles(filePath, fileList);
    } else if (file.endsWith('.bngl')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const files = findBNGLFiles(TUTORIAL_DIR);
console.log(`Found ${files.length} BNGL files in ${TUTORIAL_DIR}`);

console.log('Warmup...');
try { parseNew('begin molecules\nend molecules'); } catch {}
try { parseOld('begin molecules\nend molecules'); } catch {}

console.log('\nRunning Benchmark...\n');
console.log('| Model | Legacy (ms) | ANTLR (ms) | Speedup | Status |');
console.log('|---|---|---|---|---|');

let totalLegacy = 0;
let totalNew = 0;
let successCount = 0;

for (const filePath of files) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const filename = path.basename(filePath);
  
  // Measure Legacy
  let legacyTime = 0;
  let legacySuccess = false;
  try {
    const start = performance.now();
    parseOld(content);
    const end = performance.now();
    legacyTime = end - start;
    legacySuccess = true;
  } catch (e: any) {
    // console.log(`Legacy failed on ${filename}: ${e.message}`);
  }

  // Measure New
  let newTime = 0;
  let newSuccess = false;
  try {
    const start = performance.now();
    parseNew(content);
    const end = performance.now();
    newTime = end - start;
    newSuccess = true;
  } catch (e: any) {
    // console.log(`New parser failed on ${filename}: ${e.message}`);
  }
  
  const speedup = legacyTime > 0 ? (legacyTime / newTime).toFixed(2) + 'x' : '-';
  const status = newSuccess ? (legacySuccess ? '✅ Both' : '✅ ANTLR only') : '❌ Failed';
  
  console.log(`| ${filename.padEnd(25)} | ${legacyTime.toFixed(2).padStart(8)} | ${newTime.toFixed(2).padStart(8)} | ${speedup.padStart(7)} | ${status} |`);
  
  if (newSuccess && legacySuccess) {
    totalLegacy += legacyTime;
    totalNew += newTime;
    successCount++;
  }
}

console.log('\n--- Summary ---');
console.log(`Total Models: ${files.length}`);
console.log(`Successful Comparisons: ${successCount}`);
if (successCount > 0) {
  console.log(`Avg Legacy Time: ${(totalLegacy / successCount).toFixed(2)} ms`);
  console.log(`Avg ANTLR Time: ${(totalNew / successCount).toFixed(2)} ms`);
  console.log(`Avg Speedup: ${(totalLegacy / totalNew).toFixed(2)}x`);
}
