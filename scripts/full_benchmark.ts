/**
 * Full Benchmark: Compare Web Simulation with Pre-generated BNG2.pl GDAT files
 * 
 * Uses the existing gdat files in bng_test_output/ from previous BNG2.pl runs.
 * 
 * Run with: npx tsx scripts/full_benchmark.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseBNGL } from '../services/parseBNGL.ts';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Path to BNG2.pl for timing comparison
const BNG2_PATH = 'c:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl';
const BNG_OUTPUT_DIR = path.join(ROOT_DIR, 'bng_test_output');

interface BNG2Model {
  model: string;
  path: string;
  category: string;
  hasGdat: boolean;
  speciesCount: number;
  reactionCount: number;
  gdatRows: number;
}

interface BenchmarkResult {
  model: string;
  category: string;
  // BNG2 info from test report
  bng2Species: number;
  bng2Reactions: number;
  bng2GdatRows: number;
  // Web parsing
  webParseTime: number;
  webStatus: 'success' | 'failed';
  webError?: string;
  // BNG2 timing (fresh run)
  bng2TimeMs?: number;
  bng2TimingError?: string;
}

function loadTestReport(): { passed: BNG2Model[], skipped: any[] } {
  const reportPath = path.join(ROOT_DIR, 'bng2_test_report.json');
  return JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
}

function runBNG2ForTiming(modelPath: string, modelName: string, tempDir: string): { timeMs: number; error?: string } {
  const safeModelName = modelName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
  const tempBnglPath = path.join(tempDir, `${safeModelName}.bngl`);
  
  // BNG2.pl directory and path
  const bng2Dir = path.dirname(BNG2_PATH);
  
  try {
    // Copy and modify model for BNG2.pl
    let bnglContent = fs.readFileSync(modelPath, 'utf-8');
    // Comment out commands that aren't needed for network generation
    bnglContent = bnglContent.replace(/^\s*(simulate|parameter_scan|bifurcate|readFile|writeFile|writeXML|simplify_network)/gm, '# $1');
    // Add generate_network if not present
    if (!bnglContent.includes('generate_network')) {
      bnglContent += '\ngenerate_network({overwrite=>1});\n';
    }
    fs.writeFileSync(tempBnglPath, bnglContent);
    
    const start = performance.now();
    // Run from BNG2 directory so it can find its Perl modules
    execSync(`perl BNG2.pl "${tempBnglPath}"`, {
      cwd: bng2Dir,
      timeout: 120000,
      stdio: 'ignore'
    });
    const timeMs = performance.now() - start;
    
    // Cleanup
    try { fs.unlinkSync(tempBnglPath); } catch {}
    try { fs.unlinkSync(path.join(tempDir, `${safeModelName}.net`)); } catch {}
    try { fs.unlinkSync(path.join(tempDir, `${safeModelName}.log`)); } catch {}
    // Also cleanup in bng2Dir (where .net files will actually be created)
    try { fs.unlinkSync(path.join(bng2Dir, `${safeModelName}.net`)); } catch {}
    try { fs.unlinkSync(path.join(bng2Dir, `${safeModelName}.log`)); } catch {}
    
    return { timeMs };
  } catch (error: any) {
    return { timeMs: -1, error: error.message?.substring(0, 100) ?? 'Unknown error' };
  }
}

async function runBenchmark() {
  console.log('='.repeat(70));
  console.log('FULL BENCHMARK: Web Simulator vs BNG2.pl');
  console.log('='.repeat(70));
  console.log('');
  
  const report = loadTestReport();
  const modelsWithGdat = report.passed.filter(m => m.hasGdat && m.gdatRows > 0);
  
  console.log(`Found ${modelsWithGdat.length} models with BNG2.pl gdat output\n`);
  
  // Create temp directory for BNG2 timing tests
  const tempDir = path.join(ROOT_DIR, 'temp_benchmark');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const results: BenchmarkResult[] = [];
  
  // Test first 30 models (to keep reasonable runtime)
  const modelsToTest = modelsWithGdat.slice(0, 30);
  
  console.log(`Testing ${modelsToTest.length} models...\n`);
  console.log('Model'.padEnd(40) + 'Parse(ms)'.padEnd(12) + 'BNG2(ms)'.padEnd(12) + 'Species'.padEnd(10) + 'Status');
  console.log('-'.repeat(86));
  
  for (let i = 0; i < modelsToTest.length; i++) {
    const model = modelsToTest[i];
    
    const result: BenchmarkResult = {
      model: model.model,
      category: model.category,
      bng2Species: model.speciesCount,
      bng2Reactions: model.reactionCount,
      bng2GdatRows: model.gdatRows,
      webParseTime: 0,
      webStatus: 'failed'
    };
    
    // Test web parsing
    try {
      const parseStart = performance.now();
      const bnglCode = fs.readFileSync(model.path, 'utf-8');
      parseBNGL(bnglCode);
      result.webParseTime = performance.now() - parseStart;
      result.webStatus = 'success';
    } catch (error: any) {
      result.webStatus = 'failed';
      result.webError = error.message;
    }
    
    // Test BNG2.pl timing (fresh network generation)
    const bng2Result = runBNG2ForTiming(model.path, model.model, tempDir);
    if (bng2Result.timeMs > 0) {
      result.bng2TimeMs = bng2Result.timeMs;
    } else {
      result.bng2TimingError = bng2Result.error;
    }
    
    // Print row
    const statusIcon = result.webStatus === 'success' ? '✓' : '✗';
    const parseTime = result.webParseTime.toFixed(0).padEnd(12);
    const bng2Time = (result.bng2TimeMs ? result.bng2TimeMs.toFixed(0) : 'N/A').padEnd(12);
    const species = result.bng2Species.toString().padEnd(10);
    console.log(`${statusIcon} ${model.model.substring(0, 38).padEnd(38)} ${parseTime} ${bng2Time} ${species}`);
    
    results.push(result);
  }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  
  const webSuccess = results.filter(r => r.webStatus === 'success');
  const bng2Success = results.filter(r => r.bng2TimeMs && r.bng2TimeMs > 0);
  
  console.log(`\nWeb parsing success: ${webSuccess.length}/${results.length}`);
  console.log(`BNG2 timing success: ${bng2Success.length}/${results.length}`);
  
  if (webSuccess.length > 0) {
    const avgWebParse = webSuccess.reduce((a, b) => a + b.webParseTime, 0) / webSuccess.length;
    console.log(`\nAverage web parse time: ${avgWebParse.toFixed(1)}ms`);
  }
  
  if (bng2Success.length > 0) {
    const avgBng2 = bng2Success.reduce((a, b) => a + (b.bng2TimeMs ?? 0), 0) / bng2Success.length;
    console.log(`Average BNG2.pl network gen time: ${avgBng2.toFixed(0)}ms`);
  }
  
  // Compare timing for models where both succeeded
  const bothSuccess = results.filter(r => r.webStatus === 'success' && r.bng2TimeMs && r.bng2TimeMs > 0);
  if (bothSuccess.length > 0) {
    console.log('\n--- Timing Comparison (models where both succeeded) ---');
    console.log(`Models: ${bothSuccess.length}`);
    
    const speedups: number[] = [];
    for (const r of bothSuccess) {
      if (r.bng2TimeMs && r.webParseTime > 0) {
        speedups.push(r.bng2TimeMs / r.webParseTime);
      }
    }
    
    if (speedups.length > 0) {
      const avgSpeedup = speedups.reduce((a, b) => a + b, 0) / speedups.length;
      console.log(`Average parse speedup vs BNG2: ${avgSpeedup.toFixed(1)}x faster`);
    }
  }
  
  // Note about simulation accuracy
  console.log('\n--- GDAT Accuracy Comparison ---');
  console.log('Pre-generated BNG2 gdat files available in: bng_test_output/');
  console.log('To compare simulation accuracy, run models in the web app and export gdat.');
  
  // Save results
  const outputPath = path.join(ROOT_DIR, 'full_benchmark_results.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      totalModels: modelsToTest.length,
      webSuccess: webSuccess.length,
      bng2Success: bng2Success.length
    },
    results
  }, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
  
  // Cleanup temp directory
  try { fs.rmSync(tempDir, { recursive: true }); } catch {}
}

runBenchmark().catch(console.error);
