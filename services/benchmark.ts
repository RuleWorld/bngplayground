/**
 * Timing Benchmark Script for BioNetGen Web Simulator
 * 
 * This script tests all published models and records:
 * - Network generation time
 * - Simulation time  
 * - Success/failure status
 * 
 * Run this from the browser console after opening the app
 */

// Import model list from the example gallery
const PUBLISHED_MODELS = [
  // cell-regulation
  'cell-regulation/Barua_2013.bngl',
  'cell-regulation/Blinov_ran.bngl',
  'cell-regulation/Hat_2016.bngl',
  'cell-regulation/Kocieniewski_2012.bngl',
  'cell-regulation/Pekalski_2013.bngl',
  'cell-regulation/Rule_based_Ran_transport.bngl',
  'cell-regulation/Rule_based_Ran_transport_draft.bngl',
  'cell-regulation/notch.bngl',
  'cell-regulation/vilar_2002.bngl',
  'cell-regulation/vilar_2002b.bngl',
  'cell-regulation/vilar_2002c.bngl',
  'cell-regulation/wnt.bngl',
  // complex-models
  'complex-models/Barua_2007.bngl',
  'complex-models/Barua_2009.bngl',
  'complex-models/Blinov_2006.bngl',
  'complex-models/Chattaraj_2021.bngl',
  'complex-models/Dushek_2011.bngl',
  'complex-models/Dushek_2014.bngl',
  'complex-models/Erdem_2021.bngl',
  'complex-models/Jung_2017.bngl',
  'complex-models/Kesseler_2013.bngl',
  'complex-models/Kozer_2013.bngl',
  'complex-models/Kozer_2014.bngl',
  'complex-models/Massole_2023.bngl',
  'complex-models/McMillan_2021.bngl',
  'complex-models/Nag_2009.bngl',
  'complex-models/Nosbisch_2022.bngl',
  'complex-models/Zhang_2021.bngl',
  'complex-models/Zhang_2023.bngl',
  'complex-models/mapk-dimers.bngl',
  'complex-models/mapk-monomers.bngl',
  // growth-factor-signaling
  'growth-factor-signaling/Blinov_egfr.bngl',
  'growth-factor-signaling/Lang_2024.bngl',
  'growth-factor-signaling/Ligon_2014.bngl',
  'growth-factor-signaling/Mertins_2023.bngl',
  'growth-factor-signaling/Rule_based_egfr_compart.bngl',
  'growth-factor-signaling/Rule_based_egfr_tutorial.bngl',
  // immune-signaling
  'immune-signaling/An_2009.bngl',
  'immune-signaling/BaruaBCR_2012.bngl',
  'immune-signaling/BaruaFceRI_2012.bngl',
  'immune-signaling/ChylekFceRI_2014.bngl',
  'immune-signaling/ChylekTCR_2014.bngl',
  'immune-signaling/Faeder_2003.bngl',
  'immune-signaling/Jaruszewicz-Blonska_2023.bngl',
  'immune-signaling/Korwek_2023.bngl',
  'immune-signaling/Model_ZAP.bngl',
  'immune-signaling/Mukhopadhyay_2013.bngl',
  'immune-signaling/blbr.bngl',
  'immune-signaling/fceri_2003.bngl',
  'immune-signaling/innate_immunity.bngl',
  'immune-signaling/tlbr.bngl',
  // tutorials
  'tutorials/chemistry.bngl',
  'tutorials/polymer.bngl',
  'tutorials/polymer_draft.bngl',
  'tutorials/simple.bngl',
  'tutorials/toy1.bngl',
  'tutorials/toy2.bngl',
];

interface BenchmarkResult {
  model: string;
  status: 'success' | 'failed' | 'timeout' | 'skipped';
  error?: string;
  parseTime?: number;
  networkGenTime?: number;
  simulationTime?: number;
  totalTime?: number;
  numSpecies?: number;
  numReactions?: number;
}

async function fetchModel(path: string): Promise<string> {
  const url = `/bngplayground/published-models/${path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }
  return response.text();
}

export async function runBenchmark(timeoutMs: number = 60000): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  console.log('='.repeat(60));
  console.log('BIONETGEN WEB SIMULATOR BENCHMARK');
  console.log('='.repeat(60));
  console.log(`Testing ${PUBLISHED_MODELS.length} models with ${timeoutMs / 1000}s timeout`);
  console.log('');

  for (let i = 0; i < PUBLISHED_MODELS.length; i++) {
    const modelPath = PUBLISHED_MODELS[i];
    const modelName = modelPath.split('/').pop() || modelPath;

    console.log(`[${i + 1}/${PUBLISHED_MODELS.length}] Testing: ${modelName}`);

    const result: BenchmarkResult = {
      model: modelPath,
      status: 'skipped'
    };

    try {
      const overallStart = performance.now();

      // Fetch model
      const bnglCode = await fetchModel(modelPath);

      // Parse
      const parseStart = performance.now();
      const { parseBNGL } = await import('./parseBNGL');
      const model = parseBNGL(bnglCode);
      result.parseTime = performance.now() - parseStart;

      // Get default t_end and n_steps from model or use defaults
      const t_end = model.simulationOptions?.t_end ?? 100;
      const n_steps = model.simulationOptions?.n_steps ?? 100;

      // Network generation & simulation via worker
      const { bnglService } = await import('./bnglService');

      const simStart = performance.now();

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), timeoutMs);
      });

      // Run simulation with timeout using the singleton service
      const simResult = await Promise.race([
        bnglService.simulate(model, { method: 'ode', t_end, n_steps }),
        timeoutPromise
      ]);

      const simEnd = performance.now();

      result.simulationTime = simEnd - simStart;
      result.totalTime = performance.now() - overallStart;
      result.numSpecies = model.species?.length ?? 0;
      result.numReactions = model.reactions?.length ?? 0;
      result.status = 'success';

      // Get data point count as sanity check
      const dataPoints = simResult.data?.length ?? 0;
      console.log(`  ✓ Success: ${result.numSpecies} species, ${result.numReactions} rxns, ${dataPoints} pts, ${result.totalTime.toFixed(0)}ms`);

    } catch (error: any) {
      if (error.message === 'Timeout') {
        result.status = 'timeout';
        result.error = `Timeout after ${timeoutMs}ms`;
        console.log(`  ✗ TIMEOUT after ${timeoutMs / 1000}s`);
      } else {
        result.status = 'failed';
        result.error = error.message;
        console.log(`  ✗ FAILED: ${error.message?.substring(0, 80)}`);
      }
    }

    results.push(result);
  }

  // Summary
  console.log('');
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status === 'failed');
  const timedOut = results.filter(r => r.status === 'timeout');

  console.log(`Total: ${results.length}`);
  console.log(`Success: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Timeout: ${timedOut.length}`);

  if (failed.length > 0) {
    console.log('\nFailed models:');
    for (const r of failed) {
      console.log(`  - ${r.model}: ${r.error?.substring(0, 60)}`);
    }
  }

  if (timedOut.length > 0) {
    console.log('\nTimed out models:');
    for (const r of timedOut) {
      console.log(`  - ${r.model}`);
    }
  }

  // Performance stats for successful models
  if (successful.length > 0) {
    const times = successful.map(r => r.totalTime!).sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    const min = Math.min(...times);

    console.log('\nTiming stats for successful models:');
    console.log(`  Min: ${min.toFixed(0)}ms`);
    console.log(`  Median: ${median.toFixed(0)}ms`);
    console.log(`  Mean: ${mean.toFixed(0)}ms`);
    console.log(`  Max: ${max.toFixed(0)}ms`);
  }

  return results;
}

// Export for console usage
if (typeof window !== 'undefined') {
  (window as any).runBenchmark = runBenchmark;
}
