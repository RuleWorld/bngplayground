/**
 * WebGPUSSA.ts - WebGPU-accelerated ensemble Stochastic Simulation Algorithm
 *
 * Provides a GPU-parallel Gillespie SSA implementation that runs thousands of
 * independent trajectories simultaneously on the GPU, plus a faithful CPU
 * fallback when WebGPU is unavailable.
 */

import { isWebGPUReady, getGPUDevice, initWebGPU } from './WebGPUContext';
import { SSA_SHADER_TEMPLATE } from './shaders/ssa.wgsl';
import {
  createSSABuffers,
  initializePRNGState,
  readSSAResults,
  destroySSABuffers,
  computeEnsembleStatistics,
  type GPUBufferSet,
} from './WebGPUBuffers';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SSAReaction {
  reactants: number[];   // species indices (with repeats for stoichiometry)
  products: number[];    // species indices (with repeats for stoichiometry)
  rateConstant: number;
  name?: string;
}

export interface GPUSSAConfig {
  reactions: SSAReaction[];
  nSpecies: number;
  speciesNames: string[];
  initialState: Float64Array;
  nTrajectories: number;       // default 1024
  tEnd: number;
  nOutputPoints: number;
  seed?: number;
  maxStepsPerTrajectory?: number; // default 1_000_000
}

export interface GPUSSAResult {
  trajectories: Float32Array;   // nTrajectories x nOutputPoints x nSpecies
  timePoints: Float32Array;
  totalReactions: Uint32Array;
  statistics: Array<{
    time: number;
    mean: Float32Array;
    variance: Float32Array;
    quantile05: Float32Array;
    quantile95: Float32Array;
  }>;
  gpuTimeMs: number;
  cpuTimeMs: number;
}

// ---------------------------------------------------------------------------
// Shader generation
// ---------------------------------------------------------------------------

/**
 * Build the stoichiometry constant array (net change) as a WGSL string.
 * Layout: stoich[rxn * nSpecies + species] = net change (f32).
 */
function buildStoichiometryData(reactions: SSAReaction[], nSpecies: number): string {
  const nReactions = reactions.length;
  const totalEntries = nReactions * nSpecies;
  const flat = new Array<number>(totalEntries).fill(0);

  for (let r = 0; r < nReactions; r++) {
    // Subtract for each reactant occurrence
    for (const sp of reactions[r].reactants) {
      flat[r * nSpecies + sp] -= 1;
    }
    // Add for each product occurrence
    for (const sp of reactions[r].products) {
      flat[r * nSpecies + sp] += 1;
    }
  }

  const entries = flat.map((v) => `${v.toFixed(1)}`).join(', ');
  return `const stoichiometry = array<f32, ${totalEntries}>(${entries});`;
}

/**
 * Build the propensity computation body as WGSL code.
 *
 * For each reaction j the propensity is:
 *   a_j = k_j * prod_i C(state[i], multiplicity_i)
 *
 * where C(x, 1) = x and C(x, 2) = x*(x-1)/2 for homodimers.
 */
function buildPropensityFunction(reactions: SSAReaction[], nSpecies: number): string {
  const lines: string[] = [];

  // Emit rate constants as local lets (passed via initial_state is wasteful,
  // but since these are baked at shader-gen time we inline them).
  for (let j = 0; j < reactions.length; j++) {
    const rxn = reactions[j];

    // Count multiplicity per species
    const speciesCounts = new Map<number, number>();
    for (const sp of rxn.reactants) {
      speciesCounts.set(sp, (speciesCounts.get(sp) || 0) + 1);
    }

    // Build propensity expression
    let expr = `${rxn.rateConstant}`;

    for (const [sp, count] of speciesCounts.entries()) {
      if (count === 1) {
        expr += ` * (*state)[${sp}u]`;
      } else if (count === 2) {
        // Homodimer: k * x * (x - 1) / 2
        expr += ` * (*state)[${sp}u] * ((*state)[${sp}u] - 1.0) / 2.0`;
      } else {
        // General: falling factorial / count!
        let factorial = 1;
        for (let m = 1; m <= count; m++) factorial *= m;
        for (let m = 0; m < count; m++) {
          expr += ` * ((*state)[${sp}u] - ${m.toFixed(1)})`;
        }
        expr += ` / ${factorial.toFixed(1)}`;
      }
    }

    lines.push(`  (*propensities)[${j}u] = max(${expr}, 0.0);`);
  }

  return lines.join('\n');
}

/**
 * Generate a complete WGSL compute shader that encodes the given reaction
 * network statically and runs the Gillespie SSA.
 */
export function generateSSAShader(
  reactions: SSAReaction[],
  nSpecies: number,
  nOutputPoints: number,
  maxSteps: number,
): string {
  const nReactions = reactions.length;

  const stoichData = buildStoichiometryData(reactions, nSpecies);
  const propensityFn = buildPropensityFunction(reactions, nSpecies);

  let shader = SSA_SHADER_TEMPLATE;
  shader = shader.replace(/\{\{N_SPECIES\}\}/g, String(nSpecies));
  shader = shader.replace(/\{\{N_REACTIONS\}\}/g, String(nReactions));
  shader = shader.replace(/\{\{N_OUTPUT_POINTS\}\}/g, String(nOutputPoints));
  shader = shader.replace(/\{\{MAX_STEPS\}\}/g, String(maxSteps));
  shader = shader.replace(/\{\{STOICHIOMETRY_DATA\}\}/g, stoichData);
  shader = shader.replace(/\{\{PROPENSITY_FUNCTION\}\}/g, propensityFn);
  shader = shader.replace(/\{\{RAW_N_SPECIES\}\}/g, String(nSpecies));
  shader = shader.replace(/\{\{RAW_N_REACTIONS\}\}/g, String(nReactions));

  return shader;
}

// ---------------------------------------------------------------------------
// Compatibility check
// ---------------------------------------------------------------------------

/**
 * Check whether a reaction network is compatible with the GPU SSA solver.
 *
 * Requirements:
 *  - all reactions are mass-action (no functional rates)
 *  - nSpecies <= 256
 *  - nReactions <= 1024
 */
export function isGPUSSACompatible(
  reactions: SSAReaction[],
  nSpecies: number,
): boolean {
  if (nSpecies > 256) return false;
  if (reactions.length > 1024) return false;
  if (reactions.length === 0) return false;

  for (const rxn of reactions) {
    // Rate constant must be a finite positive number (mass-action)
    if (typeof rxn.rateConstant !== 'number' || !isFinite(rxn.rateConstant) || rxn.rateConstant < 0) {
      return false;
    }
    // All species indices must be in range
    for (const sp of rxn.reactants) {
      if (sp < 0 || sp >= nSpecies || !Number.isInteger(sp)) return false;
    }
    for (const sp of rxn.products) {
      if (sp < 0 || sp >= nSpecies || !Number.isInteger(sp)) return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// GPU ensemble runner
// ---------------------------------------------------------------------------

/**
 * Run an ensemble of SSA trajectories on the GPU.
 *
 * Falls back to CPU if WebGPU is not available.
 */
export async function runGPUSSAEnsemble(
  config: GPUSSAConfig,
  onProgress?: (fraction: number) => void,
): Promise<GPUSSAResult> {
  const cpuStart = performance.now();

  // Defaults
  const nTrajectories = config.nTrajectories || 1024;
  const maxSteps = config.maxStepsPerTrajectory || 1_000_000;
  const seed = config.seed ?? 42;
  const nOutputPoints = config.nOutputPoints;
  const nSpecies = config.nSpecies;
  const reactions = config.reactions;
  const tEnd = config.tEnd;

  // Build uniform time grid
  const timePoints = new Float32Array(nOutputPoints);
  for (let i = 0; i < nOutputPoints; i++) {
    timePoints[i] = (tEnd * (i + 1)) / nOutputPoints;
  }

  // -----------------------------------------------------------------------
  // Check GPU availability
  // -----------------------------------------------------------------------
  let gpuAvailable = isWebGPUReady();
  if (!gpuAvailable) {
    gpuAvailable = await initWebGPU();
  }

  if (!gpuAvailable) {
    console.info('[WebGPUSSA] WebGPU not available, using CPU fallback');
    return runCPUSSAEnsemble({
      ...config,
      nTrajectories,
      maxStepsPerTrajectory: maxSteps,
      seed,
    });
  }

  const device = getGPUDevice();
  if (!device) {
    return runCPUSSAEnsemble({
      ...config,
      nTrajectories,
      maxStepsPerTrajectory: maxSteps,
      seed,
    });
  }

  // -----------------------------------------------------------------------
  // Generate shader & create pipeline
  // -----------------------------------------------------------------------
  const shaderCode = generateSSAShader(reactions, nSpecies, nOutputPoints, maxSteps);

  const shaderModule = device.createShaderModule({ code: shaderCode });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: shaderModule, entryPoint: 'ssa_main' },
  });

  // -----------------------------------------------------------------------
  // Create & fill buffers
  // -----------------------------------------------------------------------
  const fullConfig: GPUSSAConfig = {
    ...config,
    nTrajectories,
    maxStepsPerTrajectory: maxSteps,
    seed,
  };
  const buffers: GPUBufferSet = createSSABuffers(device, fullConfig);

  // Params uniform
  const paramsData = new ArrayBuffer(16);
  const paramsU32 = new Uint32Array(paramsData);
  const paramsF32 = new Float32Array(paramsData);
  paramsU32[0] = nTrajectories;
  paramsF32[1] = tEnd;
  paramsU32[2] = 0;
  paramsU32[3] = 0;
  device.queue.writeBuffer(buffers.params, 0, paramsData);

  // Initial state (convert Float64 -> Float32)
  const initialF32 = new Float32Array(nSpecies);
  for (let i = 0; i < nSpecies; i++) {
    initialF32[i] = config.initialState[i];
  }
  device.queue.writeBuffer(buffers.initialState, 0, initialF32);

  // PRNG state
  const prngData = initializePRNGState(nTrajectories, seed);
  device.queue.writeBuffer(buffers.prngState, 0, prngData as Uint32Array<ArrayBuffer>);

  // Output times
  device.queue.writeBuffer(buffers.outputTimes, 0, timePoints);

  // Zero-initialise output and totalReactions
  const zeroOutput = new Float32Array(nTrajectories * nOutputPoints * nSpecies);
  device.queue.writeBuffer(buffers.output, 0, zeroOutput);
  const zeroReactions = new Uint32Array(nTrajectories);
  device.queue.writeBuffer(buffers.totalReactions, 0, zeroReactions as unknown as Uint32Array<ArrayBuffer>);

  // -----------------------------------------------------------------------
  // Dispatch
  // -----------------------------------------------------------------------
  const gpuStart = performance.now();

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.params } },
      { binding: 1, resource: { buffer: buffers.initialState } },
      { binding: 2, resource: { buffer: buffers.output } },
      { binding: 3, resource: { buffer: buffers.prngState } },
      { binding: 4, resource: { buffer: buffers.outputTimes } },
      { binding: 5, resource: { buffer: buffers.totalReactions } },
    ],
  });

  const commandEncoder = device.createCommandEncoder();
  const pass = commandEncoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  // One invocation per trajectory (workgroup_size(1))
  pass.dispatchWorkgroups(nTrajectories);
  pass.end();
  device.queue.submit([commandEncoder.finish()]);

  // Wait for GPU
  await device.queue.onSubmittedWorkDone();
  const gpuTimeMs = performance.now() - gpuStart;

  if (onProgress) onProgress(0.8);

  // -----------------------------------------------------------------------
  // Read back results
  // -----------------------------------------------------------------------
  const { rawOutput, totalReactions } = await readSSAResults(device, buffers, fullConfig);

  if (onProgress) onProgress(0.9);

  // -----------------------------------------------------------------------
  // Compute statistics on CPU
  // -----------------------------------------------------------------------
  const rawStats = computeEnsembleStatistics(rawOutput, nTrajectories, nOutputPoints, nSpecies);
  const statistics = rawStats.map((s, i) => ({
    time: timePoints[i],
    mean: s.mean,
    variance: s.variance,
    quantile05: s.quantile05,
    quantile95: s.quantile95,
  }));

  // Cleanup GPU resources
  destroySSABuffers(buffers);

  const cpuTimeMs = performance.now() - cpuStart;

  if (onProgress) onProgress(1.0);

  return {
    trajectories: rawOutput,
    timePoints,
    totalReactions,
    statistics,
    gpuTimeMs,
    cpuTimeMs,
  };
}

// ---------------------------------------------------------------------------
// CPU fallback (complete Gillespie SSA)
// ---------------------------------------------------------------------------

/**
 * Run an ensemble of Gillespie SSA trajectories on the CPU.
 *
 * This is a faithful, complete implementation that produces the same result
 * format as the GPU path.
 */
export function runCPUSSAEnsemble(config: GPUSSAConfig): GPUSSAResult {
  const cpuStart = performance.now();

  const nTrajectories = config.nTrajectories || 1024;
  const maxSteps = config.maxStepsPerTrajectory || 1_000_000;
  const seed = config.seed ?? 42;
  const nOutputPoints = config.nOutputPoints;
  const nSpecies = config.nSpecies;
  const reactions = config.reactions;
  const nReactions = reactions.length;
  const tEnd = config.tEnd;

  // Uniform output times
  const timePoints = new Float32Array(nOutputPoints);
  for (let i = 0; i < nOutputPoints; i++) {
    timePoints[i] = (tEnd * (i + 1)) / nOutputPoints;
  }

  // Pre-compute stoichiometry net change: stoich[rxn][species]
  const stoich: number[][] = [];
  for (let r = 0; r < nReactions; r++) {
    const row = new Array<number>(nSpecies).fill(0);
    for (const sp of reactions[r].reactants) row[sp] -= 1;
    for (const sp of reactions[r].products) row[sp] += 1;
    stoich.push(row);
  }

  // Pre-compute reactant multiplicity per reaction
  // Stored as arrays of [speciesIndex, multiplicity] for faster iteration during propensity calculation
  const reactantMultPairs: Array<Array<[number, number]>> = reactions.map((rxn) => {
    const m = new Map<number, number>();
    for (const sp of rxn.reactants) {
      m.set(sp, (m.get(sp) || 0) + 1);
    }
    return Array.from(m.entries());
  });

  // Output array: nTrajectories * nOutputPoints * nSpecies
  const output = new Float32Array(nTrajectories * nOutputPoints * nSpecies);
  const totalReactionsArr = new Uint32Array(nTrajectories);

  // -----------------------------------------------------------------------
  // Simple seedable PRNG (xoshiro128** in JS)
  // -----------------------------------------------------------------------
  const prng = initializePRNGState(nTrajectories, seed);

  function xoshiro128ss(tid: number): number {
    const b = tid * 4;
    let s0 = prng[b];
    let s1 = prng[b + 1];
    let s2 = prng[b + 2];
    let s3 = prng[b + 3];

    const result = Math.imul(((s1 * 5) >>> 0) << 7 | ((s1 * 5) >>> 0) >>> 25, 9) >>> 0;
    const t = s1 << 9;

    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = (s3 << 11 | s3 >>> 21) >>> 0;

    prng[b] = s0 >>> 0;
    prng[b + 1] = s1 >>> 0;
    prng[b + 2] = s2 >>> 0;
    prng[b + 3] = s3 >>> 0;

    return result;
  }

  function randUniform(tid: number): number {
    const bits = xoshiro128ss(tid);
    // Match GPU shader: (bits >> 9) + 1) / 0x800001 → maps to (0, 1], avoids log(0)
    return ((bits >>> 9) + 1) / 0x800001;
  }

  // -----------------------------------------------------------------------
  // Propensity computation
  // -----------------------------------------------------------------------
  function computePropensity(rxnIdx: number, state: Float64Array): number {
    const rxn = reactions[rxnIdx];
    const mults = reactantMultPairs[rxnIdx];
    let a = rxn.rateConstant;

    for (let i = 0; i < mults.length; i++) {
      const pair = mults[i];
      const sp = pair[0];
      const count = pair[1];
      const x = state[sp];
      if (count === 1) {
        a *= x;
      } else if (count === 2) {
        a *= x * (x - 1) / 2;
      } else {
        // General falling factorial / count!
        let factorial = 1;
        for (let m = 1; m <= count; m++) factorial *= m;
        let ff = 1;
        for (let m = 0; m < count; m++) ff *= (x - m);
        a *= ff / factorial;
      }
    }

    return Math.max(a, 0);
  }

  // -----------------------------------------------------------------------
  // Run trajectories
  // -----------------------------------------------------------------------
  for (let traj = 0; traj < nTrajectories; traj++) {
    // Copy initial state
    const state = new Float64Array(nSpecies);
    for (let i = 0; i < nSpecies; i++) {
      state[i] = config.initialState[i];
    }

    let t = 0;
    let outputIdx = 0;
    let reactionCount = 0;
    const trajBase = traj * nOutputPoints * nSpecies;

    // Record state at any output times <= 0
    while (outputIdx < nOutputPoints && timePoints[outputIdx] <= t) {
      for (let s = 0; s < nSpecies; s++) {
        output[trajBase + outputIdx * nSpecies + s] = state[s];
      }
      outputIdx++;
    }

    for (let step = 0; step < maxSteps; step++) {
      if (t >= tEnd || outputIdx >= nOutputPoints) break;

      // Compute propensities
      let a0 = 0;
      const propensities = new Float64Array(nReactions);
      for (let j = 0; j < nReactions; j++) {
        propensities[j] = computePropensity(j, state);
        a0 += propensities[j];
      }

      // Absorbed state
      if (a0 <= 0) {
        for (let oi = outputIdx; oi < nOutputPoints; oi++) {
          for (let s = 0; s < nSpecies; s++) {
            output[trajBase + oi * nSpecies + s] = state[s];
          }
        }
        outputIdx = nOutputPoints;
        break;
      }

      // Exponential wait time
      const u1 = randUniform(traj);
      const tau = -Math.log(u1) / a0;
      const tNext = t + tau;

      // Record at output times between t and tNext
      while (outputIdx < nOutputPoints && timePoints[outputIdx] <= tNext) {
        for (let s = 0; s < nSpecies; s++) {
          output[trajBase + outputIdx * nSpecies + s] = state[s];
        }
        outputIdx++;
      }

      // Select reaction
      const r = randUniform(traj) * a0;
      let cumsum = 0;
      let selectedRxn = 0;
      for (let j = 0; j < nReactions; j++) {
        cumsum += propensities[j];
        if (cumsum > r) {
          selectedRxn = j;
          break;
        }
        selectedRxn = j;
      }

      // Apply stoichiometry
      const delta = stoich[selectedRxn];
      for (let s = 0; s < nSpecies; s++) {
        state[s] += delta[s];
      }

      t = tNext;
      reactionCount++;
    }

    // Fill remaining output points
    for (let oi = outputIdx; oi < nOutputPoints; oi++) {
      for (let s = 0; s < nSpecies; s++) {
        output[trajBase + oi * nSpecies + s] = state[s];
      }
    }

    totalReactionsArr[traj] = reactionCount;
  }

  // -----------------------------------------------------------------------
  // Compute ensemble statistics
  // -----------------------------------------------------------------------
  const rawStats = computeEnsembleStatistics(output, nTrajectories, nOutputPoints, nSpecies);
  const statistics = rawStats.map((s, i) => ({
    time: timePoints[i],
    mean: s.mean,
    variance: s.variance,
    quantile05: s.quantile05,
    quantile95: s.quantile95,
  }));

  const cpuTimeMs = performance.now() - cpuStart;

  return {
    trajectories: output,
    timePoints,
    totalReactions: totalReactionsArr,
    statistics,
    gpuTimeMs: 0,
    cpuTimeMs,
  };
}
