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
 * Build a WGSL switch statement that applies only the non-zero stoichiometry
 * entries for the selected reaction. Avoids the generic O(N_SPECIES) loop
 * in the shader for sparse networks.
 */
function buildSparseApplyFunction(reactions: SSAReaction[], nSpecies: number): string {
  const lines: string[] = [];
  lines.push('  switch (selected_rxn) {');

  for (let r = 0; r < reactions.length; r++) {
    // Compute net change per species for this reaction
    const changes = new Map<number, number>();
    for (const sp of reactions[r].reactants) {
      changes.set(sp, (changes.get(sp) || 0) - 1);
    }
    for (const sp of reactions[r].products) {
      changes.set(sp, (changes.get(sp) || 0) + 1);
    }

    lines.push(`    case ${r}u: {`);
    for (const [sp, delta] of changes) {
      if (delta !== 0) {
        const sign = delta > 0 ? '+' : '-';
        const abs = Math.abs(delta);
        lines.push(`      state[${sp}u] = state[${sp}u] ${sign} ${abs.toFixed(1)};`);
      }
    }
    lines.push('    }');
  }

  lines.push('    default: {}');
  lines.push('  }');
  return lines.join('\n');
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

  const sparseApplyFn = buildSparseApplyFunction(reactions, nSpecies);
  const propensityFn = buildPropensityFunction(reactions, nSpecies);

  let shader = SSA_SHADER_TEMPLATE;
  shader = shader.replace(/\{\{N_SPECIES\}\}/g, String(nSpecies));
  shader = shader.replace(/\{\{N_REACTIONS\}\}/g, String(nReactions));
  shader = shader.replace(/\{\{N_OUTPUT_POINTS\}\}/g, String(nOutputPoints));
  shader = shader.replace(/\{\{MAX_STEPS\}\}/g, String(maxSteps));
  shader = shader.replace(/\{\{PROPENSITY_FUNCTION\}\}/g, propensityFn);
  shader = shader.replace(/\{\{SPARSE_APPLY_STOICHIOMETRY\}\}/g, sparseApplyFn);
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

  // ===========================================================================
  // REACTION PRE-CLASSIFICATION
  // ===========================================================================
  // Classify each reaction by its kinetic order so the propensity inner loop
  // can use a branchless fast path per category instead of a generic loop.
  //
  //   Order 0 (source/constitutive):  a = k
  //   Order 1 (unimolecular):         a = k * X[s0]
  //   Order 2 (bimolecular):          a = k * X[s0] * X[s1]
  //   Order 2 (homodimer):            a = k_eff * X[s0] * (X[s0] - 1)
  //   Order 3+ (general):             a = k_eff * falling_factorial(...)
  //
  // This mirrors BioNetGen's compiled rate evaluation but goes further by
  // eliminating the inner multiplicity loop for the common cases.
  // ===========================================================================

  const RXN_ORDER_0 = 0;
  const RXN_ORDER_1 = 1;
  const RXN_BIMOLECULAR = 2;
  const RXN_HOMODIMER = 3;
  const RXN_GENERAL = 4;

  // Per-reaction compiled info, packed into flat typed arrays for cache locality.
  const rxnOrder = new Int32Array(nReactions);       // which fast-path
  const rxnKeff = new Float64Array(nReactions);      // effective rate constant (factorial baked in)
  const rxnSp0 = new Int32Array(nReactions);         // first reactant species index
  const rxnSp1 = new Int32Array(nReactions);         // second reactant species index (bimolecular only)

  // General-order reactions need the full multiplicity list — stored flat.
  // genReactantData: [sp0, count0, sp1, count1, ...] per reaction
  // genReactantOffsets[r] = start index, genReactantLengths[r] = number of pairs
  const genReactantDataBuild: number[] = [];
  const genReactantOffsets = new Int32Array(nReactions);
  const genReactantLengths = new Int32Array(nReactions);

  // Also build the reactant multiplicity map per reaction (needed for dependency graph)
  const reactantSpeciesPerRxn: Array<Int32Array> = [];

  for (let r = 0; r < nReactions; r++) {
    const rxn = reactions[r];

    // Build multiplicity map
    const m = new Map<number, number>();
    for (const sp of rxn.reactants) {
      m.set(sp, (m.get(sp) || 0) + 1);
    }
    const pairs = Array.from(m.entries()); // [[speciesIdx, count], ...]
    reactantSpeciesPerRxn.push(Int32Array.from(pairs.map(p => p[0])));

    // Bake factorial into rate constant
    let k = rxn.rateConstant;
    for (const [, count] of pairs) {
      if (count >= 2) {
        let factorial = 1;
        for (let f = 2; f <= count; f++) factorial *= f;
        k /= factorial;
      }
    }
    rxnKeff[r] = k;

    // Classify
    if (pairs.length === 0) {
      // 0th order: a = k (source reaction, no reactants)
      rxnOrder[r] = RXN_ORDER_0;
      rxnSp0[r] = 0;
      rxnSp1[r] = 0;
    } else if (pairs.length === 1 && pairs[0][1] === 1) {
      // 1st order: a = k * X[s]
      rxnOrder[r] = RXN_ORDER_1;
      rxnSp0[r] = pairs[0][0];
      rxnSp1[r] = 0;
    } else if (pairs.length === 2 && pairs[0][1] === 1 && pairs[1][1] === 1) {
      // Bimolecular: a = k * X[s0] * X[s1]
      rxnOrder[r] = RXN_BIMOLECULAR;
      rxnSp0[r] = pairs[0][0];
      rxnSp1[r] = pairs[1][0];
    } else if (pairs.length === 1 && pairs[0][1] === 2) {
      // Homodimer: a = k_eff * X[s] * (X[s] - 1)  (k_eff already has /2)
      rxnOrder[r] = RXN_HOMODIMER;
      rxnSp0[r] = pairs[0][0];
      rxnSp1[r] = 0;
    } else {
      // General: store full multiplicity list
      rxnOrder[r] = RXN_GENERAL;
      rxnSp0[r] = 0;
      rxnSp1[r] = 0;
      genReactantOffsets[r] = genReactantDataBuild.length;
      genReactantLengths[r] = pairs.length;
      for (const [sp, count] of pairs) {
        genReactantDataBuild.push(sp, count);
      }
    }
  }

  const genReactantData = Int32Array.from(genReactantDataBuild);

  // ===========================================================================
  // FLAT SPARSE STOICHIOMETRY
  // ===========================================================================
  // Instead of Array<Array<[number, number]>>, pack into two flat typed arrays
  // with an offset table. Eliminates JS object/tuple overhead in the hot loop.
  //
  // stoichSpecies[stoichOffsets[r] .. stoichOffsets[r]+stoichLengths[r]]
  //   = species indices with non-zero net change
  // stoichDeltas[same range] = corresponding net change values
  // ===========================================================================

  const stoichSpeciesBuild: number[] = [];
  const stoichDeltasBuild: number[] = [];
  const stoichOffsets = new Int32Array(nReactions);
  const stoichLengths = new Int32Array(nReactions);

  for (let r = 0; r < nReactions; r++) {
    const changes = new Map<number, number>();
    for (const sp of reactions[r].reactants) changes.set(sp, (changes.get(sp) || 0) - 1);
    for (const sp of reactions[r].products) changes.set(sp, (changes.get(sp) || 0) + 1);

    stoichOffsets[r] = stoichSpeciesBuild.length;
    let len = 0;
    for (const [sp, delta] of changes) {
      if (delta !== 0) {
        stoichSpeciesBuild.push(sp);
        stoichDeltasBuild.push(delta);
        len++;
      }
    }
    stoichLengths[r] = len;
  }

  const stoichSpecies = Int32Array.from(stoichSpeciesBuild);
  const stoichDeltas = Float64Array.from(stoichDeltasBuild);

  // ===========================================================================
  // REACTION DEPENDENCY GRAPH (flat packed)
  // ===========================================================================
  // Port of BioNetGen create_update_lists(), stored as flat Int32Array + offsets.
  // ===========================================================================

  const speciesAsReactant: Array<Set<number>> = [];
  for (let s = 0; s < nSpecies; s++) speciesAsReactant.push(new Set());
  for (let r = 0; r < nReactions; r++) {
    const spArr = reactantSpeciesPerRxn[r];
    for (let i = 0; i < spArr.length; i++) speciesAsReactant[spArr[i]].add(r);
  }

  const depListBuild: number[] = [];
  const depOffsets = new Int32Array(nReactions);
  const depLengths = new Int32Array(nReactions);

  for (let r = 0; r < nReactions; r++) {
    const deps = new Set<number>();
    const off = stoichOffsets[r];
    const len = stoichLengths[r];
    for (let i = 0; i < len; i++) {
      const sp = stoichSpecies[off + i];
      for (const depRxn of speciesAsReactant[sp]) deps.add(depRxn);
    }
    depOffsets[r] = depListBuild.length;
    depLengths[r] = deps.size;
    for (const d of deps) depListBuild.push(d);
  }

  const depList = Int32Array.from(depListBuild);

  // ===========================================================================
  // ALLOCATE REUSABLE BUFFERS
  // ===========================================================================

  const output = new Float32Array(nTrajectories * nOutputPoints * nSpecies);
  const totalReactionsArr = new Uint32Array(nTrajectories);
  const propensities = new Float64Array(nReactions);
  // Sorted propensity search order (à la BioNetGen GSP.prop).
  // High-propensity reactions bubble toward the front over time.
  const propOrder = new Int32Array(nReactions);

  // Scratch buffer for recording state to Float32 output
  const stateF32 = new Float32Array(nSpecies);

  // ===========================================================================
  // PRNG STATE — initialized once, used per-trajectory
  // ===========================================================================

  const prng = initializePRNGState(nTrajectories, seed);

  // ===========================================================================
  // PROPENSITY: ORDER-SPECIALIZED FAST PATHS
  // ===========================================================================

  function computePropensity(r: number, state: Float64Array): number {
    switch (rxnOrder[r]) {
      case RXN_ORDER_0:
        return rxnKeff[r];
      case RXN_ORDER_1: {
        const a = rxnKeff[r] * state[rxnSp0[r]];
        return a > 0 ? a : 0;
      }
      case RXN_BIMOLECULAR: {
        const a = rxnKeff[r] * state[rxnSp0[r]] * state[rxnSp1[r]];
        return a > 0 ? a : 0;
      }
      case RXN_HOMODIMER: {
        const x = state[rxnSp0[r]];
        const a = rxnKeff[r] * x * (x - 1);
        return a > 0 ? a : 0;
      }
      default: {
        // General: falling factorial with arbitrary multiplicity
        let a = rxnKeff[r];
        const off = genReactantOffsets[r];
        const len = genReactantLengths[r];
        for (let i = 0; i < len; i++) {
          const sp = genReactantData[off + i * 2];
          const count = genReactantData[off + i * 2 + 1];
          const x = state[sp];
          for (let m = 0; m < count; m++) a *= (x - m);
        }
        return a > 0 ? a : 0;
      }
    }
  }

  // Interval for periodic full a0 recalculation to correct floating-point drift.
  // Matches BioNetGen's rxn_rate_update_interval concept.
  const FULL_RECALC_INTERVAL = 100;

  // ===========================================================================
  // INLINE HELPER: copy state to Float32 output at a given output slot
  // ===========================================================================

  function recordState(state: Float64Array, base: number): void {
    // Narrowing f64 → f32 via the scratch buffer and set() is faster than a
    // per-element write to the output Float32Array for nSpecies > ~8.
    for (let s = 0; s < nSpecies; s++) stateF32[s] = state[s];
    output.set(stateF32, base);
  }

  // ===========================================================================
  // TRAJECTORY LOOP
  // ===========================================================================

  for (let traj = 0; traj < nTrajectories; traj++) {
    // ----- state init -----
    const state = new Float64Array(config.initialState);

    let t = 0;
    let outputIdx = 0;
    let reactionCount = 0;
    const trajBase = traj * nOutputPoints * nSpecies;

    // ----- PRNG: copy to locals for this trajectory (avoid array indexing) -----
    const pb = traj * 4;
    let ps0 = prng[pb];
    let ps1 = prng[pb + 1];
    let ps2 = prng[pb + 2];
    let ps3 = prng[pb + 3];

    // Inline xoshiro128** → uniform (0,1]
    // Doing this inline avoids function-call overhead in the hot loop.
    function nextRand(): number {
      const result = Math.imul(((ps1 * 5) >>> 0) << 7 | ((ps1 * 5) >>> 0) >>> 25, 9) >>> 0;
      const tt = ps1 << 9;
      ps2 ^= ps0; ps3 ^= ps1; ps1 ^= ps2; ps0 ^= ps3;
      ps2 ^= tt;
      ps3 = (ps3 << 11 | ps3 >>> 21) >>> 0;
      ps0 >>>= 0; ps1 >>>= 0; ps2 >>>= 0; ps3 >>>= 0;
      return ((result >>> 9) + 1) / 0x800001;
    }

    // ----- initial output recording -----
    while (outputIdx < nOutputPoints && timePoints[outputIdx] <= t) {
      recordState(state, trajBase + outputIdx * nSpecies);
      outputIdx++;
    }

    // ----- initial propensity computation -----
    let a0 = 0;
    for (let j = 0; j < nReactions; j++) {
      propensities[j] = computePropensity(j, state);
      a0 += propensities[j];
      propOrder[j] = j; // reset sort order per trajectory
    }

    // ----- main SSA loop -----
    for (let step = 0; step < maxSteps; step++) {
      if (t >= tEnd || outputIdx >= nOutputPoints) break;

      // Absorbed state
      if (a0 <= 0) {
        for (let oi = outputIdx; oi < nOutputPoints; oi++) {
          recordState(state, trajBase + oi * nSpecies);
        }
        outputIdx = nOutputPoints;
        break;
      }

      // Exponential wait time
      const tau = -Math.log(nextRand()) / a0;
      const tNext = t + tau;

      // Record at output times between t and tNext
      while (outputIdx < nOutputPoints && timePoints[outputIdx] <= tNext) {
        recordState(state, trajBase + outputIdx * nSpecies);
        outputIdx++;
      }

      // -------------------------------------------------------------------
      // Select reaction: sorted linear search (à la BioNetGen select_next_rxn)
      //
      // The propOrder array is a permutation of [0..nReactions).  During the
      // linear scan, if we discover a neighbouring pair where the later
      // reaction has higher propensity, we swap them.  Over time this moves
      // frequently-firing reactions toward the front, reducing average scan
      // length from O(nReactions/2) toward O(1) for skewed distributions.
      // -------------------------------------------------------------------
      const target = nextRand() * a0;
      let cumsum = 0;
      let selectedRxn = propOrder[0]; // fallback
      for (let j = 0; j < nReactions; j++) {
        const rj = propOrder[j];
        cumsum += propensities[rj];
        if (cumsum > target) {
          selectedRxn = rj;
          break;
        }
        // Adaptive bubble: swap with predecessor if out of order
        if (j > 0 && propensities[rj] > propensities[propOrder[j - 1]]) {
          const tmp = propOrder[j];
          propOrder[j] = propOrder[j - 1];
          propOrder[j - 1] = tmp;
        }
        selectedRxn = rj;
      }

      // -------------------------------------------------------------------
      // Apply sparse stoichiometry — only touch affected species
      // -------------------------------------------------------------------
      const sOff = stoichOffsets[selectedRxn];
      const sLen = stoichLengths[selectedRxn];
      for (let i = 0; i < sLen; i++) {
        state[stoichSpecies[sOff + i]] += stoichDeltas[sOff + i];
      }

      t = tNext;
      reactionCount++;

      // -------------------------------------------------------------------
      // Incremental propensity update via dependency graph
      // -------------------------------------------------------------------
      const dOff = depOffsets[selectedRxn];
      const dLen = depLengths[selectedRxn];
      for (let d = 0; d < dLen; d++) {
        const jrxn = depList[dOff + d];
        const aNew = computePropensity(jrxn, state);
        a0 += aNew - propensities[jrxn];
        propensities[jrxn] = aNew;
      }

      // -------------------------------------------------------------------
      // Periodic full a0 recalculation to correct floating-point drift
      // (matches BioNetGen rxn_rate_update_interval)
      // -------------------------------------------------------------------
      if (a0 < 0 || reactionCount % FULL_RECALC_INTERVAL === 0) {
        a0 = 0;
        for (let j = 0; j < nReactions; j++) a0 += propensities[j];
      }
    }

    // Fill remaining output points
    for (let oi = outputIdx; oi < nOutputPoints; oi++) {
      recordState(state, trajBase + oi * nSpecies);
    }

    totalReactionsArr[traj] = reactionCount;

    // Write PRNG state back (not strictly needed since trajectories are
    // independent, but preserves reproducibility if we ever interleave)
    prng[pb] = ps0;
    prng[pb + 1] = ps1;
    prng[pb + 2] = ps2;
    prng[pb + 3] = ps3;
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