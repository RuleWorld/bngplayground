// scripts/phase2_demo.ts
// Demonstration of Phase 2 features: Parameter Estimation & Neural ODE Surrogates

import { VariationalParameterEstimator, ParameterPrior, SimulationData } from '../packages/engine/src/services/ParameterEstimation';
import { NeuralODESurrogate, SurrogateDatasetGenerator, TrainingDataset } from '../packages/engine/src/services/NeuralODESurrogate';
import type { BNGLModel } from '../types';

/**
 * Example 1: Bayesian Parameter Estimation
 * 
 * Scenario: We have experimental data for a simple signaling model
 * and want to estimate the rate constants with uncertainty quantification
 */
async function example1_parameterEstimation() {
  console.log('=== Example 1: Bayesian Parameter Estimation ===\n');
  
  // Mock experimental data (time-course of observables)
  const experimentalData: SimulationData = {
    timePoints: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    observables: new Map([
      ['Receptor_bound', [0, 20, 45, 68, 82, 90, 94, 96, 97, 98, 98]],
      ['Signaling_active', [0, 5, 18, 35, 52, 65, 72, 76, 78, 79, 80]]
    ])
  };
  
  // Define parameters to estimate with priors
  const parameterNames = ['k_bind', 'k_unbind', 'k_activate'];
  const priors = new Map<string, ParameterPrior>([
    ['k_bind', { mean: 0.1, std: 0.05, min: 0.01, max: 1.0 }],
    ['k_unbind', { mean: 0.05, std: 0.02, min: 0.001, max: 0.5 }],
    ['k_activate', { mean: 0.5, std: 0.1, min: 0.1, max: 2.0 }]
  ]);
  
  // Mock BNGL model (in practice, this would be your actual model)
  const model: BNGLModel = {} as BNGLModel;
  
  // Create estimator
  const estimator = new VariationalParameterEstimator(
    model,
    experimentalData,
    parameterNames,
    priors
  );
  
  console.log('Training variational posterior...');
  
  // Fit the model
  const result = await estimator.fit({
    nIterations: 500,
    learningRate: 0.01,
    verbose: true
  });
  
  // Display results
  console.log('\n=== Estimation Results ===');
  console.log(`Convergence: ${result.convergence ? 'Yes' : 'No'}`);
  console.log('\nPosterior Estimates:');
  parameterNames.forEach((name, i) => {
    const prior = priors.get(name)!;
    console.log(`  ${name}:`);
    console.log(`    Prior:     ${prior.mean.toFixed(4)} ± ${prior.std.toFixed(4)}`);
    console.log(`    Posterior: ${result.posteriorMean[i].toFixed(4)} ± ${result.posteriorStd[i].toFixed(4)}`);
  });
  
  // Sample from posterior for uncertainty propagation
  console.log('\nSampling from posterior distribution...');
  const posteriorSamples = await estimator.samplePosterior(100);
  console.log(`Generated ${posteriorSamples.length} samples from posterior`);
  
  // Compute credible intervals
  posteriorSamples[0].forEach((_, i) => {
    const values = posteriorSamples.map(s => s[i]).sort((a, b) => a - b);
    const lower = values[Math.floor(0.025 * values.length)];
    const upper = values[Math.floor(0.975 * values.length)];
    console.log(`  ${parameterNames[i]}: 95% CI = [${lower.toFixed(4)}, ${upper.toFixed(4)}]`);
  });
  
  // Cleanup
  estimator.dispose();
  
  console.log('\n✓ Example 1 complete\n');
}

/**
 * Example 2: Neural ODE Surrogate Training
 * 
 * Scenario: We have a computationally expensive ODE model and want to
 * create a fast surrogate for parameter sweeps
 */
async function example2_neuralODESurrogate() {
  console.log('=== Example 2: Neural ODE Surrogate Training ===\n');
  
  const nParams = 3;
  const nSpecies = 5;
  const nTimePoints = 101;
  
  // Mock simulation function (in practice, this would call ODESolver)
  const mockSimulate = async (params: number[]): Promise<number[][]> => {
    // Simulate some dynamics: exponential approach to steady state
    const timePoints = Array.from({ length: nTimePoints }, (_, i) => i);
    const concentrations: number[][] = [];
    
    for (const t of timePoints) {
      const concs: number[] = [];
      for (let s = 0; s < nSpecies; s++) {
        // Simple dynamics: C(t) = C_ss * (1 - exp(-k*t))
        const k = params[0] + 0.01 * s; // Use first param as rate
        const C_ss = params[1] * (s + 1) * 10; // Use second param for steady state
        const C_t = C_ss * (1 - Math.exp(-k * t));
        concs.push(C_t + Math.random() * 0.1); // Add noise
      }
      concentrations.push(concs);
    }
    
    return concentrations;
  };
  
  // Generate training dataset
  console.log('Generating training dataset...');
  const paramRanges: [number, number][] = [
    [0.01, 0.2],   // k_rate
    [0.5, 2.0],    // amplitude
    [0.0, 1.0]     // unused param
  ];
  const timePoints = Array.from({ length: nTimePoints }, (_, i) => i);
  
  const trainingData = await SurrogateDatasetGenerator.generateDataset(
    paramRanges,
    200, // 200 training samples
    timePoints,
    mockSimulate
  );
  
  console.log(`Generated ${trainingData.parameters.length} training samples\n`);
  
  // Create and train surrogate
  console.log('Training neural ODE surrogate...');
  const surrogate = new NeuralODESurrogate(nParams, nSpecies);
  
  const history = await surrogate.train(trainingData, {
    epochs: 50,
    batchSize: 32,
    validationSplit: 0.1,
    learningRate: 0.001,
    earlyStopping: true,
    patience: 10,
    verbose: true
  });
  
  console.log('\n=== Training Complete ===');
  const finalLoss = history.history.loss[history.history.loss.length - 1];
  const finalValLoss = history.history.val_loss?.[history.history.val_loss.length - 1];
  console.log(`Final training loss: ${finalLoss.toFixed(6)}`);
  console.log(`Final validation loss: ${finalValLoss?.toFixed(6)}\n`);
  
  // Generate test dataset
  console.log('Evaluating surrogate on test data...');
  const testData = await SurrogateDatasetGenerator.generateDataset(
    paramRanges,
    50, // 50 test samples
    timePoints,
    mockSimulate
  );
  
  const metrics = surrogate.evaluate(testData);
  console.log('Test Metrics:');
  console.log(`  MSE: ${metrics.mse.toFixed(6)}`);
  console.log(`  MAE: ${metrics.mae.toFixed(6)}`);
  console.log(`  R² per species: ${metrics.r2.map(r => r.toFixed(3)).join(', ')}\n`);
  
  // Fast prediction example
  console.log('Testing fast prediction...');
  const testParams = [0.1, 1.0, 0.5];
  const testTime = Array.from({ length: 21 }, (_, i) => i * 5); // Every 5 time units
  
  const start = performance.now();
  const prediction = surrogate.predict(testParams, testTime);
  const elapsed = performance.now() - start;
  
  console.log(`Prediction completed in ${elapsed.toFixed(2)}ms`);
  console.log(`Predicted concentrations shape: [${prediction.concentrations.length} timepoints, ${prediction.concentrations[0].length} species]\n`);
  
  // Fast parameter sweep
  console.log('Performing fast parameter sweep...');
  const sweepParams = SurrogateDatasetGenerator.latinHypercubeSample(
    paramRanges,
    1000 // 1000 parameter sets
  );
  
  const sweepStart = performance.now();
  const sweepResults = await surrogate.parameterSweep(sweepParams, testTime);
  const sweepElapsed = performance.now() - sweepStart;
  
  console.log(`Sweep of 1000 parameter sets completed in ${sweepElapsed.toFixed(2)}ms`);
  console.log(`Average time per simulation: ${(sweepElapsed / 1000).toFixed(3)}ms\n`);
  
  // Save model
  console.log('Saving surrogate model...');
  await surrogate.save('example_surrogate');
  console.log('Model saved to browser storage\n');
  
  // Cleanup
  surrogate.dispose();
  
  console.log('✓ Example 2 complete\n');
}

/**
 * Example 3: Combined Workflow
 * 
 * Use neural surrogate for fast parameter estimation
 */
async function example3_combinedWorkflow() {
  console.log('=== Example 3: Combined Workflow ===\n');
  
  // Step 1: Train surrogate on expensive model
  console.log('Step 1: Training surrogate model (as in Example 2)...');
  // [Implementation would follow Example 2]
  console.log('  (Skipped for brevity - see Example 2)\n');
  
  // Step 2: Use surrogate in parameter estimation
  console.log('Step 2: Using surrogate for fast parameter estimation...');
  console.log('  Benefits:');
  console.log('  - 10-100x speedup in likelihood evaluations');
  console.log('  - Enables gradient-based optimization via TensorFlow.js autodiff');
  console.log('  - Allows thousands of posterior samples in seconds\n');
  
  // Step 3: Validate on original model
  console.log('Step 3: Validate best parameters on original ODE solver...');
  console.log('  - Run full simulation with estimated parameters');
  console.log('  - Compare surrogate predictions vs. true ODE solution');
  console.log('  - Refine if necessary\n');
  
  console.log('✓ Example 3 complete\n');
}

/**
 * Main demo runner
 */
async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 2 Features Demo: TensorFlow.js Integration       ║');
  console.log('║  - Bayesian Parameter Estimation (Variational Inference)  ║');
  console.log('║  - Neural ODE Surrogate Models                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  try {
    await example1_parameterEstimation();
    await example2_neuralODESurrogate();
    await example3_combinedWorkflow();
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✓ All examples completed successfully!');
    console.log('═══════════════════════════════════════════════════════════');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Export for use in other contexts
export {
  example1_parameterEstimation,
  example2_neuralODESurrogate,
  example3_combinedWorkflow,
  runAllExamples
};

// Run if executed directly
if (typeof window !== 'undefined') {
  // Browser environment
  (window as any).runPhase2Demo = runAllExamples;
  console.log('Demo loaded! Run with: runPhase2Demo()');
} else if (require.main === module) {
  // Node environment
  runAllExamples();
}
