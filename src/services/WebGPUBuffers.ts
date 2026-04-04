/**
 * WebGPUBuffers.ts - GPU buffer management for SSA ensemble simulations
 *
 * Creates, initializes, reads back, and destroys GPU buffers used by the
 * WebGPU SSA compute shader.
 */

import type { GPUSSAConfig } from './WebGPUSSA';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GPUBufferSet {
  params: GPUBuffer;
  initialState: GPUBuffer;
  output: GPUBuffer;
  prngState: GPUBuffer;
  outputTimes: GPUBuffer;
  totalReactions: GPUBuffer;
  readbackBuffer: GPUBuffer;
  readbackReactionsBuffer: GPUBuffer;
}

// ---------------------------------------------------------------------------
// Buffer creation
// ---------------------------------------------------------------------------

/**
 * Create all GPU buffers required by the SSA shader.
 */
export function createSSABuffers(device: GPUDevice, config: GPUSSAConfig): GPUBufferSet {
  const { nSpecies, nTrajectories, nOutputPoints } = config;

  // Params uniform: n_trajectories (u32), t_end (f32), 2 x pad (u32)
  const paramsSize = 16; // 4 x 4 bytes, 16-byte aligned
  const params = device.createBuffer({
    size: paramsSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Initial state: nSpecies x f32
  const initialStateSize = nSpecies * 4;
  const initialState = device.createBuffer({
    size: Math.max(initialStateSize, 4),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Output: nTrajectories * nOutputPoints * nSpecies x f32
  const outputSize = nTrajectories * nOutputPoints * nSpecies * 4;
  const output = device.createBuffer({
    size: Math.max(outputSize, 4),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });

  // PRNG state: nTrajectories * 4 x u32
  const prngSize = nTrajectories * 4 * 4;
  const prngState = device.createBuffer({
    size: prngSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Output times: nOutputPoints x f32
  const outputTimesSize = nOutputPoints * 4;
  const outputTimes = device.createBuffer({
    size: Math.max(outputTimesSize, 4),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Total reactions: nTrajectories x u32
  const totalReactionsSize = nTrajectories * 4;
  const totalReactions = device.createBuffer({
    size: totalReactionsSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });

  // Readback buffer for output
  const readbackBuffer = device.createBuffer({
    size: Math.max(outputSize, 4),
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // Readback buffer for total reactions
  const readbackReactionsBuffer = device.createBuffer({
    size: totalReactionsSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  return {
    params,
    initialState,
    output,
    prngState,
    outputTimes,
    totalReactions,
    readbackBuffer,
    readbackReactionsBuffer,
  };
}

// ---------------------------------------------------------------------------
// PRNG initialisation
// ---------------------------------------------------------------------------

/**
 * Produce initial xoshiro128** state for every trajectory.
 *
 * Each trajectory gets 4 x u32. We derive them from the base seed plus the
 * trajectory index using a simple SplitMix32-style hash so that every
 * trajectory begins with a different, well-distributed state.
 */
export function initializePRNGState(nTrajectories: number, seed: number): Uint32Array {
  const state = new Uint32Array(nTrajectories * 4);

  for (let i = 0; i < nTrajectories; i++) {
    // SplitMix32-style seeding: hash(seed + trajectory_id) four times
    let z = (seed + i * 0x9E3779B9) >>> 0;

    for (let k = 0; k < 4; k++) {
      z = (z + 0x9E3779B9) >>> 0;
      let h = z;
      h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
      h = (h ^ (h >>> 16)) >>> 0;
      // Avoid all-zero state
      state[i * 4 + k] = h === 0 ? 1 : h;
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// Readback
// ---------------------------------------------------------------------------

/**
 * Read simulation results back from GPU buffers.
 */
export async function readSSAResults(
  device: GPUDevice,
  buffers: GPUBufferSet,
  config: GPUSSAConfig,
): Promise<{ rawOutput: Float32Array; totalReactions: Uint32Array }> {
  const { nSpecies, nTrajectories, nOutputPoints } = config;

  const outputSize = nTrajectories * nOutputPoints * nSpecies * 4;
  const reactionsSize = nTrajectories * 4;

  // Copy from device buffers to readback (mappable) buffers
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(buffers.output, 0, buffers.readbackBuffer, 0, outputSize);
  encoder.copyBufferToBuffer(buffers.totalReactions, 0, buffers.readbackReactionsBuffer, 0, reactionsSize);
  device.queue.submit([encoder.finish()]);

  // Map and copy
  await buffers.readbackBuffer.mapAsync(GPUMapMode.READ);
  const rawOutput = new Float32Array(buffers.readbackBuffer.getMappedRange().slice(0));
  buffers.readbackBuffer.unmap();

  await buffers.readbackReactionsBuffer.mapAsync(GPUMapMode.READ);
  const totalReactions = new Uint32Array(buffers.readbackReactionsBuffer.getMappedRange().slice(0));
  buffers.readbackReactionsBuffer.unmap();

  return { rawOutput, totalReactions };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Destroy all GPU buffers in the set.
 */
export function destroySSABuffers(buffers: GPUBufferSet): void {
  buffers.params.destroy();
  buffers.initialState.destroy();
  buffers.output.destroy();
  buffers.prngState.destroy();
  buffers.outputTimes.destroy();
  buffers.totalReactions.destroy();
  buffers.readbackBuffer.destroy();
  buffers.readbackReactionsBuffer.destroy();
}

// ---------------------------------------------------------------------------
// Ensemble statistics
// ---------------------------------------------------------------------------

/**
 * Compute per-time-point, per-species ensemble statistics from raw trajectory
 * data laid out as: rawData[traj * nOutputPoints * nSpecies + tp * nSpecies + sp].
 */
export function computeEnsembleStatistics(
  rawData: Float32Array,
  nTrajectories: number,
  nOutputPoints: number,
  nSpecies: number,
): Array<{
  mean: Float32Array;
  variance: Float32Array;
  quantile05: Float32Array;
  quantile95: Float32Array;
}> {
  const stats: Array<{
    mean: Float32Array;
    variance: Float32Array;
    quantile05: Float32Array;
    quantile95: Float32Array;
  }> = [];

  // Scratch buffer for sorting per-species values
  const scratch = new Float32Array(nTrajectories);

  for (let tp = 0; tp < nOutputPoints; tp++) {
    const mean = new Float32Array(nSpecies);
    const variance = new Float32Array(nSpecies);
    const quantile05 = new Float32Array(nSpecies);
    const quantile95 = new Float32Array(nSpecies);

    for (let sp = 0; sp < nSpecies; sp++) {
      // Gather values for this (time-point, species) across trajectories
      let sum = 0;
      for (let tr = 0; tr < nTrajectories; tr++) {
        const val = rawData[tr * nOutputPoints * nSpecies + tp * nSpecies + sp];
        scratch[tr] = val;
        sum += val;
      }

      const m = sum / nTrajectories;
      mean[sp] = m;

      // Variance (two-pass for numerical stability)
      let sumSq = 0;
      for (let tr = 0; tr < nTrajectories; tr++) {
        const d = scratch[tr] - m;
        sumSq += d * d;
      }
      variance[sp] = nTrajectories > 1 ? sumSq / (nTrajectories - 1) : 0;

      // Sort for quantiles
      scratch.sort();
      quantile05[sp] = percentile(scratch, nTrajectories, 0.05);
      quantile95[sp] = percentile(scratch, nTrajectories, 0.95);
    }

    stats.push({ mean, variance, quantile05, quantile95 });
  }

  return stats;
}

/**
 * Linear interpolation percentile from a *sorted* array.
 */
function percentile(sorted: Float32Array, n: number, p: number): number {
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  const rank = p * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const frac = rank - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}
