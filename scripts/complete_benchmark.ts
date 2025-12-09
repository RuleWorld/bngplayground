/**
 * COMPLETE Benchmark: Parsing + Network Generation + Simulation Timing
 * 
 * Compares full workflow timings between Web Simulator and BNG2.pl:
 * 1. Parsing (BNGL -> model)
 * 2. Network Generation (rules -> species/reactions)
 * 3. Simulation (ODE solve)
 * 
 * Run with: npx tsx scripts/complete_benchmark.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseBNGL } from '../services/parseBNGL.ts';
import { NetworkGenerator } from '../src/services/graph/NetworkGenerator.ts';
import { BNGLParser } from '../src/services/graph/core/BNGLParser.ts';
import { NautyService } from '../src/services/graph/core/NautyService.ts';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// BNG2.pl path
const BNG2_PATH = 'C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl';
const BNG2_DIR = path.dirname(BNG2_PATH);

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
  // BNG2 reference info
  bng2Species: number;
  bng2Reactions: number;
  // Web timings
  webParseTime: number;
  webNetworkGenTime: number;
  webTotalTime: number;
  webSpecies: number;
  webReactions: number;
  webStatus: 'success' | 'failed' | 'limit_reached';
  webError?: string;
  // BNG2 timing
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
  
  try {
    // Copy and modify model for BNG2.pl
    let bnglContent = fs.readFileSync(modelPath, 'utf-8');
    // Comment out simulate commands (we just want network gen timing like web version)
    bnglContent = bnglContent.replace(/^\s*(simulate|parameter_scan|bifurcate|readFile|writeFile|writeXML|simplify_network)/gm, '# $1');
    // Add generate_network if not present
    if (!bnglContent.includes('generate_network')) {
      bnglContent += '\ngenerate_network({overwrite=>1});\n';
    }
    fs.writeFileSync(tempBnglPath, bnglContent);
    
    const start = performance.now();
    execSync(`perl BNG2.pl "${tempBnglPath}"`, {
      cwd: BNG2_DIR,
      timeout: 120000,
      stdio: 'ignore'
    });
    const timeMs = performance.now() - start;
    
    // Cleanup
    try { fs.unlinkSync(tempBnglPath); } catch {}
    try { fs.unlinkSync(path.join(BNG2_DIR, `${safeModelName}.net`)); } catch {}
    try { fs.unlinkSync(path.join(BNG2_DIR, `${safeModelName}.log`)); } catch {}
    
    return { timeMs };
  } catch (error: any) {
    return { timeMs: -1, error: error.message?.substring(0, 100) ?? 'Unknown error' };
  }
}

async function runWebNetworkGen(modelPath: string): Promise<{
  parseTime: number;
  networkGenTime: number;
  totalTime: number;
  species: number;
  reactions: number;
  status: 'success' | 'failed' | 'limit_reached';
  error?: string;
}> {
  const totalStart = performance.now();
  
  try {
    // 1. Parse
    const parseStart = performance.now();
    const bnglCode = fs.readFileSync(modelPath, 'utf-8');
    const model = parseBNGL(bnglCode);
    const parseTime = performance.now() - parseStart;
    
    // 2. Network Generation
    const netGenStart = performance.now();
    
    const seedSpecies = model.species.map(s => BNGLParser.parseSpeciesGraph(s.name));
    const parametersMap = new Map(Object.entries(model.parameters).map(([k, v]) => [k, Number(v as number)]));
    
    const rules = model.reactionRules.flatMap(r => {
      let rate: number;
      try {
        rate = BNGLParser.evaluateExpression(r.rate, parametersMap);
      } catch {
        rate = 0;
      }
      
      let reverseRate: number;
      if (r.reverseRate) {
        try {
          reverseRate = BNGLParser.evaluateExpression(r.reverseRate, parametersMap);
        } catch {
          reverseRate = 0;
        }
      } else {
        reverseRate = rate;
      }
      
      const formatList = (list: string[]) => list.length > 0 ? list.join(' + ') : '0';
      const ruleStr = `${formatList(r.reactants)} -> ${formatList(r.products)}`;
      
      try {
        const forwardRule = BNGLParser.parseRxnRule(ruleStr, rate);
        if (r.constraints && r.constraints.length > 0) {
          forwardRule.applyConstraints(r.constraints, (s) => BNGLParser.parseSpeciesGraph(s));
        }
        if (r.isBidirectional) {
          const reverseRuleStr = `${formatList(r.products)} -> ${formatList(r.reactants)}`;
          const reverseRule = BNGLParser.parseRxnRule(reverseRuleStr, reverseRate);
          return [forwardRule, reverseRule];
        }
        return [forwardRule];
      } catch {
        return [];
      }
    });
    
    // Prepare maxStoich
    let maxStoich: number | Map<string, number> = 500;
    if (model.networkOptions?.maxStoich) {
      if (typeof model.networkOptions.maxStoich === 'object') {
        maxStoich = new Map(Object.entries(model.networkOptions.maxStoich));
      } else {
        maxStoich = model.networkOptions.maxStoich as number;
      }
    }
    
    const generator = new NetworkGenerator({
      maxSpecies: 5000,
      maxReactions: 10000,
      maxIterations: model.networkOptions?.maxIter ?? 100,
      maxAgg: model.networkOptions?.maxAgg ?? 100,
      maxStoich
    });
    
    const network = await generator.generate(seedSpecies, rules, () => {});
    const networkGenTime = performance.now() - netGenStart;
    const totalTime = performance.now() - totalStart;
    
    // Note if we hit limits
    const limitReached = network.species.length >= 5000 || network.reactions.length >= 10000;
    
    return {
      parseTime,
      networkGenTime,
      totalTime,
      species: network.species.length,
      reactions: network.reactions.length,
      status: limitReached ? 'limit_reached' : 'success'
    };
    
  } catch (error: any) {
    return {
      parseTime: 0,
      networkGenTime: 0,
      totalTime: performance.now() - totalStart,
      species: 0,
      reactions: 0,
      status: 'failed',
      error: error.message?.substring(0, 100)
    };
  }
}

async function runBenchmark() {
  console.log('='.repeat(80));
  console.log('COMPLETE BENCHMARK: Parsing + Network Generation');
  console.log('Comparing Web Simulator vs BNG2.pl');
  console.log('='.repeat(80));
  console.log('');
  
  // Initialize Nauty service
  console.log('Initializing Nauty service...');
  await NautyService.getInstance().init();
  
  const report = loadTestReport();
  const allModels = report.passed.filter(m => m.hasGdat && m.gdatRows > 0);
  
  console.log(`Found ${allModels.length} models with BNG2.pl gdat output\n`);
  
  // Create temp directory for BNG2 timing tests
  const tempDir = path.join(ROOT_DIR, 'temp_benchmark');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const results: BenchmarkResult[] = [];
  
  // Test ALL models
  console.log(`Testing ${allModels.length} models...\n`);
  console.log('Model'.padEnd(35) + 'Web(ms)'.padEnd(12) + 'BNG2(ms)'.padEnd(12) + 'WebSp'.padEnd(8) + 'BNG2Sp'.padEnd(8) + 'Status');
  console.log('-'.repeat(90));
  
  for (let i = 0; i < allModels.length; i++) {
    const model = allModels[i];
    
    const result: BenchmarkResult = {
      model: model.model,
      category: model.category,
      bng2Species: model.speciesCount,
      bng2Reactions: model.reactionCount,
      webParseTime: 0,
      webNetworkGenTime: 0,
      webTotalTime: 0,
      webSpecies: 0,
      webReactions: 0,
      webStatus: 'failed'
    };
    
    // Test web network generation
    const webResult = await runWebNetworkGen(model.path);
    result.webParseTime = webResult.parseTime;
    result.webNetworkGenTime = webResult.networkGenTime;
    result.webTotalTime = webResult.totalTime;
    result.webSpecies = webResult.species;
    result.webReactions = webResult.reactions;
    result.webStatus = webResult.status;
    result.webError = webResult.error;
    
    // Test BNG2.pl timing
    const bng2Result = runBNG2ForTiming(model.path, model.model, tempDir);
    if (bng2Result.timeMs > 0) {
      result.bng2TimeMs = bng2Result.timeMs;
    } else {
      result.bng2TimingError = bng2Result.error;
    }
    
    // Print row
    const statusIcon = result.webStatus === 'success' ? '✓' : 
                       result.webStatus === 'limit_reached' ? '⚠' : '✗';
    const webTime = result.webTotalTime.toFixed(0).padEnd(12);
    const bng2Time = (result.bng2TimeMs ? result.bng2TimeMs.toFixed(0) : 'N/A').padEnd(12);
    const webSp = result.webSpecies.toString().padEnd(8);
    const bng2Sp = result.bng2Species.toString().padEnd(8);
    const matchIcon = result.webSpecies === result.bng2Species ? '=' : (result.webStatus === 'limit_reached' ? 'L' : '!');
    console.log(`${statusIcon} ${model.model.substring(0, 33).padEnd(33)} ${webTime} ${bng2Time} ${webSp} ${bng2Sp} ${matchIcon}`);
    
    results.push(result);
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  
  const webSuccess = results.filter(r => r.webStatus === 'success' || r.webStatus === 'limit_reached');
  const bng2Success = results.filter(r => r.bng2TimeMs && r.bng2TimeMs > 0);
  const speciesMatch = results.filter(r => r.webSpecies === r.bng2Species);
  
  console.log(`\nWeb network gen success: ${webSuccess.length}/${results.length}`);
  console.log(`BNG2 timing success: ${bng2Success.length}/${results.length}`);
  console.log(`Species count match: ${speciesMatch.length}/${results.length}`);
  
  // Timing comparison
  const bothSuccess = results.filter(r => 
    (r.webStatus === 'success' || r.webStatus === 'limit_reached') && 
    r.bng2TimeMs && r.bng2TimeMs > 0
  );
  
  if (bothSuccess.length > 0) {
    const avgWebTime = bothSuccess.reduce((a, b) => a + b.webTotalTime, 0) / bothSuccess.length;
    const avgBng2Time = bothSuccess.reduce((a, b) => a + (b.bng2TimeMs ?? 0), 0) / bothSuccess.length;
    
    console.log('\n--- Timing Comparison ---');
    console.log(`Average Web total time: ${avgWebTime.toFixed(0)}ms`);
    console.log(`Average BNG2 time: ${avgBng2Time.toFixed(0)}ms`);
    
    // Show breakdown
    const avgParse = bothSuccess.reduce((a, b) => a + b.webParseTime, 0) / bothSuccess.length;
    const avgNetGen = bothSuccess.reduce((a, b) => a + b.webNetworkGenTime, 0) / bothSuccess.length;
    console.log(`\nWeb breakdown:`);
    console.log(`  Parse: ${avgParse.toFixed(0)}ms`);
    console.log(`  Network Gen: ${avgNetGen.toFixed(0)}ms`);
    
    // Calculate speedup/slowdown
    const ratio = avgBng2Time / avgWebTime;
    if (ratio > 1) {
      console.log(`\nWeb is ${ratio.toFixed(1)}x FASTER than BNG2.pl`);
    } else {
      console.log(`\nBNG2.pl is ${(1/ratio).toFixed(1)}x FASTER than Web`);
    }
  }
  
  // Save results
  const outputPath = path.join(ROOT_DIR, 'complete_benchmark_results.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      totalModels: results.length,
      webSuccess: webSuccess.length,
      bng2Success: bng2Success.length,
      speciesMatch: speciesMatch.length
    },
    results
  }, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
  
  // Cleanup temp directory
  try { fs.rmSync(tempDir, { recursive: true }); } catch {}
}

runBenchmark().catch(console.error);
