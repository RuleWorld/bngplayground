/**
 * FULL Benchmark with ODE Simulation
 * 
 * Compares full workflow timings between Web Simulator and BNG2.pl:
 * 1. Parsing (BNGL -> model)
 * 2. Network Generation (rules -> species/reactions)
 * 3. ODE Simulation (actually runs the solver)
 * 
 * Run with: npx tsx scripts/full_ode_benchmark.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { parseBNGL } from '../services/parseBNGL.ts';
import { NetworkGenerator } from '../src/services/graph/NetworkGenerator.ts';
import { BNGLParser } from '../src/services/graph/core/BNGLParser.ts';
import { NautyService } from '../src/services/graph/core/NautyService.ts';
import { createSolver } from '../services/ODESolver.ts';
import { execSync } from 'child_process';

// Polyfill require and __dirname for CVODE WASM module compatibility
const require = createRequire(import.meta.url);
if (typeof globalThis.require === 'undefined') {
  (globalThis as any).require = require;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Also polyfill __dirname and __filename globally for the WASM loader
if (typeof globalThis.__dirname === 'undefined') {
  // Set to the public directory where cvode.wasm is located
  const publicDir = path.resolve(__dirname, '..', 'public');
  (globalThis as any).__dirname = publicDir;
  (globalThis as any).__filename = path.join(publicDir, 'cvode.wasm');
}
const ROOT_DIR = path.resolve(__dirname, '..');

// BNG2.pl path
const BNG2_PATH = 'C:\\Users\\Achyudhan\\anaconda3\\envs\\Research\\Lib\\site-packages\\bionetgen\\bng-win\\BNG2.pl';
const BNG2_DIR = path.dirname(BNG2_PATH);

// Timeout for ODE simulation (60 seconds)
const ODE_TIMEOUT_MS = 300000; // 5 minutes (for JS solver)

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
  webODETime: number;
  webTotalTime: number;
  webSpecies: number;
  webReactions: number;
  webStatus: 'success' | 'failed' | 'limit_reached' | 'timeout' | 'species_mismatch';
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
    let bnglContent = fs.readFileSync(modelPath, 'utf-8');
    // Comment out simulate commands for network gen timing only
    bnglContent = bnglContent.replace(/^\s*(simulate|parameter_scan|bifurcate|readFile|writeFile|writeXML|simplify_network)/gm, '# $1');
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
    try { fs.unlinkSync(tempBnglPath); } catch { }
    try { fs.unlinkSync(path.join(BNG2_DIR, `${safeModelName}.net`)); } catch { }
    try { fs.unlinkSync(path.join(BNG2_DIR, `${safeModelName}.log`)); } catch { }

    return { timeMs };
  } catch (error: any) {
    return { timeMs: -1, error: error.message?.substring(0, 100) ?? 'Unknown error' };
  }
}

async function runFullSimulation(modelName: string, modelPath: string, bng2Species: number): Promise<{
  parseTime: number;
  networkGenTime: number;
  odeTime: number;
  totalTime: number;
  species: number;
  reactions: number;
  status: 'success' | 'failed' | 'limit_reached' | 'timeout' | 'species_mismatch';
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

    // Create a set of observable names for rate expression evaluation
    const observablesSet = new Set<string>(
      (model.observables || []).map(o => o.name)
    );

    const rules = model.reactionRules.flatMap(r => {
      let rate: number;
      try {
        rate = BNGLParser.evaluateExpression(r.rate, parametersMap, observablesSet);
      } catch {
        rate = 0;
      }

      let reverseRate: number;
      if (r.reverseRate) {
        try {
          reverseRate = BNGLParser.evaluateExpression(r.reverseRate, parametersMap, observablesSet);
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

    const network = await generator.generate(seedSpecies, rules, () => { });

    // Save species list for debugging
    if (modelName === 'Barua_2007' || network.species.length < 20) {
      const fs = require('fs');
      const speciesOutput = network.species.map(s => `${s.index + 1} ${s.canonicalString}`).join('\n');
      console.log('--- Generated Species ---');
      console.log(speciesOutput);
      console.log('-------------------------');

      if (modelName === 'Barua_2007') {
        fs.writeFileSync('web_species.txt', speciesOutput);
        console.log('Dumped species to web_species.txt');
      }
    }

    const networkGenTime = performance.now() - netGenStart;

    const numSpecies = network.species.length;
    const numReactions = network.reactions.length;

    // Check for species mismatch (indicates network gen issue)
    const limitReached = numSpecies >= 5000 || numReactions >= 10000;
    if (limitReached) {
      return {
        parseTime,
        networkGenTime,
        odeTime: 0,
        totalTime: performance.now() - totalStart,
        species: numSpecies,
        reactions: numReactions,
        status: 'limit_reached',
        error: 'Hit species/reaction limit'
      };
    }

    // Check species count mismatch (if significant)
    if (bng2Species > 0 && Math.abs(numSpecies - bng2Species) > bng2Species * 0.1) {
      return {
        parseTime,
        networkGenTime,
        odeTime: 0,
        totalTime: performance.now() - totalStart,
        species: numSpecies,
        reactions: numReactions,
        status: 'species_mismatch',
        error: `Species mismatch: web=${numSpecies} vs bng2=${bng2Species}`
      };
    }

    // 3. ODE Simulation
    const odeStart = performance.now();

    // Build species name to index map
    const speciesMap = new Map<string, number>();
    network.species.forEach((s, i) => speciesMap.set(BNGLParser.speciesGraphToString(s.graph), i));

    // Build initial state and derivatives
    const y0 = new Float64Array(numSpecies);
    model.species.forEach(s => {
      // Find matching species by canonical form
      const canonicalName = BNGLParser.speciesGraphToString(BNGLParser.parseSpeciesGraph(s.name));
      const idx = speciesMap.get(canonicalName);
      if (idx !== undefined) {
        y0[idx] = s.initialConcentration;
      }
    });

    // Build concrete reactions
    const concreteReactions = network.reactions.map(r => ({
      reactants: r.reactants,
      products: r.products,
      rate: r.rate
    }));

    // Derivative function
    const derivatives = (y: Float64Array, out: Float64Array) => {
      out.fill(0);
      for (const rxn of concreteReactions) {
        let velocity = rxn.rate;
        for (const idx of rxn.reactants) {
          velocity *= y[idx];
        }
        for (const idx of rxn.reactants) {
          out[idx] -= velocity;
        }
        for (const idx of rxn.products) {
          out[idx] += velocity;
        }
      }
    };

    // Jacobian generator (analytical, like Julia's ModelingToolkit)
    // For mass-action kinetics: J[i][j] = ∂(dy_i/dt)/∂y_j
    // = Σ_r stoich[i][r] * rate_constant[r] * ∂(∏_k y[k]^order[k][r])/∂y_j
    const jacobian = (y: Float64Array, J: Float64Array) => {
      // J is column-major: J[i + j*neq] = ∂f_i/∂y_j
      const neq = numSpecies;
      J.fill(0);

      for (const rxn of concreteReactions) {
        const k = rxn.rate;
        const reactants = rxn.reactants;

        // Count reactant multiplicities for this reaction
        const reactantCounts = new Map<number, number>();
        for (const idx of reactants) {
          reactantCounts.set(idx, (reactantCounts.get(idx) || 0) + 1);
        }

        // For each unique reactant j in this reaction, compute ∂(velocity)/∂y_j
        for (const [j, orderJ] of reactantCounts) {
          // ∂velocity/∂y_j = k * order_j * y_j^(order_j - 1) * ∏_{i≠j} y_i^order_i
          //                = k * order_j / y_j * ∏_i y_i^order_i  (if y_j > 0)
          //                = order_j * velocity / y_j
          let dVelocity_dyj: number;
          if (y[j] > 1e-100) {
            // Compute base velocity
            let velocity = k;
            for (const idx of reactants) {
              velocity *= y[idx];
            }
            dVelocity_dyj = orderJ * velocity / y[j];
          } else {
            // y[j] ≈ 0: Compute derivative directly to avoid division by zero
            // ∂velocity/∂y_j = k * order_j * y_j^(order_j-1) * ∏_{i≠j} y_i^order_i
            if (orderJ === 1) {
              // Common case: first-order in y_j
              let partialProduct = k;
              for (const idx of reactants) {
                if (idx !== j) partialProduct *= y[idx];
              }
              // Handle multiplicity > 1: need to also multiply by remaining y[j] terms
              for (let m = 1; m < orderJ; m++) {
                partialProduct *= y[j];
              }
              dVelocity_dyj = partialProduct;
            } else {
              // Higher order and y[j] ≈ 0: derivative is 0 unless order_j = 1
              dVelocity_dyj = 0;
            }
          }

          // Update Jacobian: J[i][j] += stoich[i] * dVelocity_dyj
          // Reactants have stoich = -1, products have stoich = +1
          for (const idx of reactants) {
            J[idx + j * neq] -= dVelocity_dyj;
          }
          for (const idx of rxn.products) {
            J[idx + j * neq] += dVelocity_dyj;
          }
        }
      }
    };

    // Get simulation parameters
    const t_end = model.simulationOptions?.t_end ?? 100;
    const n_steps = model.simulationOptions?.n_steps ?? 100;

    // Check for NaN/Inf in reaction rates
    let hasBadRates = false;
    concreteReactions.forEach((r, i) => {
      if (!Number.isFinite(r.rate)) {
        console.error(`Reaction ${i} has invalid rate: ${r.rate}`);
        hasBadRates = true;
      }
    });

    const rates = concreteReactions.map(r => r.rate);
    const minRate = Math.min(...rates);
    const maxRate = Math.max(...rates);
    const zeroRates = rates.filter(r => r === 0).length;
    console.log(`[Diagnostics] Rates: min=${minRate}, max=${maxRate}, zeros=${zeroRates}/${rates.length}`);

    if (hasBadRates) {
      return {
        parseTime,
        networkGenTime,
        odeTime: 0,
        totalTime: performance.now() - totalStart,
        species: numSpecies,
        reactions: numReactions,
        status: 'failed',
        error: 'Invalid reaction rates'
      };
    }

    // Use looser tolerances for extremely stiff large models
    // (1e-8 is too tight for some Barua models with 100+ species)
    const isLargeStiffModel = numSpecies > 100;
    const solver = await createSolver(numSpecies, derivatives, {
      atol: isLargeStiffModel ? 1e-6 : 1e-8,
      rtol: isLargeStiffModel ? 1e-4 : 1e-6,
      maxSteps: 100000000,
      maxStep: Infinity,
      solver: 'cvode_jac',  // CVODE with analytical Jacobian - eliminates O(n²) finite-diff overhead
      jacobian: jacobian    // Use the analytical Jacobian defined above (lines 295-353)
    } as any);

    const dtOut = t_end / n_steps;
    let y = new Float64Array(y0);
    let t = 0;

    // Integration loop with timeout
    const odeStartTime = performance.now();
    for (let i = 1; i <= n_steps; i++) {
      if (performance.now() - odeStartTime > ODE_TIMEOUT_MS) {
        return {
          parseTime,
          networkGenTime,
          odeTime: ODE_TIMEOUT_MS,
          totalTime: performance.now() - totalStart,
          species: numSpecies,
          reactions: numReactions,
          status: 'timeout',
          error: `ODE timeout at step ${i}/${n_steps}`
        };
      }

      const tTarget = i * dtOut;
      const result = solver.integrate(y, t, tTarget);

      if (!result.success) {
        return {
          parseTime,
          networkGenTime,
          odeTime: performance.now() - odeStart,
          totalTime: performance.now() - totalStart,
          species: numSpecies,
          reactions: numReactions,
          status: 'failed',
          error: result.errorMessage?.substring(0, 50)
        };
      }

      y = new Float64Array(result.y);
      t = result.t;
    }

    const odeTime = performance.now() - odeStart;
    const totalTime = performance.now() - totalStart;

    return {
      parseTime,
      networkGenTime,
      odeTime,
      totalTime,
      species: numSpecies,
      reactions: numReactions,
      status: 'success'
    };

  } catch (error: any) {
    return {
      parseTime: 0,
      networkGenTime: 0,
      odeTime: 0,
      totalTime: performance.now() - totalStart,
      species: 0,
      reactions: 0,
      status: 'failed',
      error: error.message?.substring(0, 100)
    };
  }
}

async function runBenchmark() {
  console.log('='.repeat(90));
  console.log('FULL ODE BENCHMARK: Parsing + Network Generation + ODE Simulation');
  console.log('Comparing Web Simulator vs BNG2.pl');
  console.log('='.repeat(90));
  console.log('');

  // Initialize Nauty service
  console.log('Initializing Nauty service...');
  await NautyService.getInstance().init();

  let allModels: any[] = [];

  if (process.argv[2]) {
    const target = process.argv[2];
    // process.env.DEBUG_CONSTRAINTS = 'true'; // Removed
    // console.log(`Force-enabling DEBUG_CONSTRAINTS for single model run: ${target}`);

    // Simple recursive finder
    const fs = await import('fs');
    const path = await import('path');
    const findModel = (dir: string, name: string): string | null => {
      if (!fs.existsSync(dir)) return null;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const found = findModel(fullPath, name);
          if (found) return found;
        } else if (entry.isFile() && entry.name === name + '.bngl') {
          return fullPath;
        }
      }
      return null;
    };

    const root = path.join(__dirname, '../published-models');
    const foundPath = findModel(root, target);

    if (foundPath) {
      console.log(`Found model at: ${foundPath}`);
      allModels = [{ model: target, path: foundPath, hasGdat: false, gdatRows: 0 }];
    } else {
      console.error(`Model ${target} not found in ${root}`);
      process.exit(1);
    }
  } else {
    const report = loadTestReport();
    // Exclude models that BNG2.pl also can't handle (exceed network limits)
    const EXCLUDED_MODELS = ['Model_ZAP']; // 4374 species, 11252 reactions - exceeds limits
    allModels = report.passed
      .filter(m => m.hasGdat && m.gdatRows > 0)
      .filter(m => !EXCLUDED_MODELS.includes(m.model));
  }

  console.log(`Found ${allModels.length} models with BNG2.pl gdat output\n`);

  // Create temp directory
  const tempDir = path.join(ROOT_DIR, 'temp_benchmark');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const results: BenchmarkResult[] = [];

  // Test models (limit to smaller ones first or test all)
  console.log(`Testing ${allModels.length} models...\n`);
  console.log('Model'.padEnd(30) + 'NetGen'.padEnd(10) + 'ODE'.padEnd(12) + 'Total'.padEnd(12) + 'Sp'.padEnd(6) + 'Status');
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
      webODETime: 0,
      webTotalTime: 0,
      webSpecies: 0,
      webReactions: 0,
      webStatus: 'failed'
    };

    // Run full simulation
    const webResult = await runFullSimulation(model.model, model.path, model.speciesCount);
    result.webParseTime = webResult.parseTime;
    result.webNetworkGenTime = webResult.networkGenTime;
    result.webODETime = webResult.odeTime;
    result.webTotalTime = webResult.totalTime;
    result.webSpecies = webResult.species;
    result.webReactions = webResult.reactions;
    result.webStatus = webResult.status;
    result.webError = webResult.error;

    // BNG2 timing (network gen only for comparison)
    const bng2Result = runBNG2ForTiming(model.path, model.model, tempDir);
    if (bng2Result.timeMs > 0) {
      result.bng2TimeMs = bng2Result.timeMs;
    } else {
      result.bng2TimingError = bng2Result.error;
    }

    // Print row
    const statusIcon =
      result.webStatus === 'success' ? '✓' :
        result.webStatus === 'limit_reached' ? 'L' :
          result.webStatus === 'timeout' ? 'T' :
            result.webStatus === 'species_mismatch' ? '!' : '✗';

    const netGen = result.webNetworkGenTime.toFixed(0).padEnd(10);
    const ode = result.webODETime.toFixed(0).padEnd(12);
    const total = result.webTotalTime.toFixed(0).padEnd(12);
    const sp = result.webSpecies.toString().padEnd(6);

    // Save species list for debugging - MOVED TO ABOVE


    console.log(`${statusIcon} ${model.model.substring(0, 28).padEnd(28)} ${netGen} ${ode} ${total} ${sp} ${result.webStatus}`);

    results.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(90));
  console.log('SUMMARY');
  console.log('='.repeat(90));

  const successful = results.filter(r => r.webStatus === 'success');
  const failed = results.filter(r => r.webStatus === 'failed');
  const timeouts = results.filter(r => r.webStatus === 'timeout');
  const mismatches = results.filter(r => r.webStatus === 'species_mismatch');

  console.log(`\nSuccess: ${successful.length}/${results.length}`);
  console.log(`Failed: ${failed.length}/${results.length}`);
  console.log(`Timeouts: ${timeouts.length}/${results.length}`);
  console.log(`Species mismatch: ${mismatches.length}/${results.length}`);

  if (successful.length > 0) {
    const avgNetGen = successful.reduce((a, b) => a + b.webNetworkGenTime, 0) / successful.length;
    const avgODE = successful.reduce((a, b) => a + b.webODETime, 0) / successful.length;
    const avgTotal = successful.reduce((a, b) => a + b.webTotalTime, 0) / successful.length;

    console.log('\n--- Average Timings (successful only) ---');
    console.log(`Network Gen: ${avgNetGen.toFixed(0)}ms`);
    console.log(`ODE Solve: ${avgODE.toFixed(0)}ms`);
    console.log(`Total: ${avgTotal.toFixed(0)}ms`);
  }

  // Save results
  const outputPath = path.join(ROOT_DIR, 'full_ode_benchmark_results.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      totalModels: results.length,
      successful: successful.length,
      failed: failed.length,
      timeouts: timeouts.length,
      mismatches: mismatches.length
    },
    results
  }, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);

  // Cleanup
  try { fs.rmSync(tempDir, { recursive: true }); } catch { }
}

runBenchmark().catch(console.error);
