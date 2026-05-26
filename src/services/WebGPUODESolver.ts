/**
 * WebGPUODESolver.ts - GPU-accelerated ODE solver using WebGPU compute shaders
 * 
 * Implements explicit RK4 (Runge-Kutta 4th order) method with GPU-parallel
 * right-hand side (RHS) evaluation. Optimized for:
 * - Large networks (100+ species)
 * - Ensemble simulations (parallel parameter sweeps)
 * - Non-stiff to mildly stiff systems
 * 
 * For very stiff systems, CVODE (implicit methods) is still recommended.
 */

import {
  WebGPUContext,
  initWebGPU,
  getGPUDevice,
  createBuffer,
  createStorageBuffer,
  createUniformBuffer,
  createReadBuffer,
  readBuffer,
  createComputePipeline,
} from './WebGPUContext';

/**
 * Reaction definition for shader generation
 */
export interface GPUReaction {
  // Reactant indices and stoichiometry
  reactantIndices: number[];
  reactantStoich: number[];
  // Product indices and stoichiometry
  productIndices: number[];
  productStoich: number[];
  // Rate constant index
  rateConstantIndex: number;
  // Is reversible (if so, next reaction is reverse)
  isForward: boolean;
}

/**
 * Options for WebGPU ODE solver
 */
export interface WebGPUODESolverOptions {
  dt: number;           // Initial time step
  dtMin: number;        // Minimum time step
  dtMax: number;        // Maximum time step
  atol: number;         // Absolute tolerance
  rtol: number;         // Relative tolerance
  maxSteps: number;     // Maximum number of steps
  adaptiveStep: boolean; // Use adaptive step size
}

const DEFAULT_OPTIONS: WebGPUODESolverOptions = {
  dt: 0.01,
  dtMin: 1e-10,
  dtMax: 1.0,
  atol: 1e-6,
  rtol: 1e-4,
  maxSteps: 100000,
  adaptiveStep: true
};

/**
 * Simulation result from WebGPU solver
 */
export interface WebGPUSimulationResult {
  times: Float32Array;
  concentrations: Float32Array[]; // One array per output time
  success: boolean;
  steps: number;
  gpuTime: number; // milliseconds
}

/**
 * WebGPU-accelerated ODE solver using explicit RK4
 */
export class WebGPUODESolver {
  private ctx: WebGPUContext | null = null;
  private nSpecies: number;
  private nReactions: number;
  private reactions: GPUReaction[];
  private rateConstants: Float32Array;
  private options: WebGPUODESolverOptions;

  // GPU resources
  private rhsPipeline: GPUComputePipeline | null = null;
  private intermediatePipeline: GPUComputePipeline | null = null;
  private rk4Pipeline: GPUComputePipeline | null = null;
  private concentrationBuffer: GPUBuffer | null = null;
  private derivativesBuffer: GPUBuffer | null = null;
  private rateConstantsBuffer: GPUBuffer | null = null;
  private paramsBuffer: GPUBuffer | null = null;
  private rhsBindGroups: GPUBindGroup[] = [];
  private intermediateParamsBuffers: GPUBuffer[] = [];
  private intermediateBindGroups: GPUBindGroup[] = [];
  private rk4BindGroup: GPUBindGroup | null = null;
  private kBuffers: GPUBuffer[] = []; // k1, k2, k3, k4 for RK4
  private tempBuffer: GPUBuffer | null = null;

  private isCompiled: boolean = false;

  constructor(
    nSpecies: number,
    reactions: GPUReaction[],
    rateConstants: number[],
    options: Partial<WebGPUODESolverOptions> = {}
  ) {
    this.nSpecies = nSpecies;
    this.nReactions = reactions.length;
    this.reactions = reactions;
    this.rateConstants = new Float32Array(rateConstants);
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Initialize WebGPU and compile shaders
   */
  async compile(): Promise<boolean> {
    if (this.isCompiled) return true;

    // Initialize WebGPU
    const success = await initWebGPU();
    if (!success) {
      console.warn('[WebGPUODESolver] WebGPU not available, falling back to CPU');
      return false;
    }

    const device = getGPUDevice();
    if (!device) return false;

    this.ctx = new WebGPUContext(device);


    try {
      // Generate and compile RHS shader
      const rhsShaderCode = this.generateRHSShader();
      console.log('[WebGPUODESolver] RHS shader code length:', rhsShaderCode.length, 'chars');
      // Log first few lines for debugging if compilation fails
      if (rhsShaderCode.length < 5000) {
        console.debug('[WebGPUODESolver] RHS shader:\n', rhsShaderCode.substring(0, 1000));
      }
      this.rhsPipeline = createComputePipeline(device, rhsShaderCode, 'compute_rhs');

      if (!this.rhsPipeline) {
        console.error('[WebGPUODESolver] RHS pipeline creation returned null');
        return false;
      }

      // Generate and compile intermediate-state shader
      const intermediateShaderCode = this.generateIntermediateStateShader();
      this.intermediatePipeline = createComputePipeline(device, intermediateShaderCode, 'intermediate_state');

      if (!this.intermediatePipeline) {
        console.error('[WebGPUODESolver] Intermediate-state pipeline creation returned null');
        return false;
      }

      // Generate and compile RK4 shader
      const rk4ShaderCode = this.generateRK4Shader();
      console.log('[WebGPUODESolver] RK4 shader code length:', rk4ShaderCode.length, 'chars');
      this.rk4Pipeline = createComputePipeline(device, rk4ShaderCode, 'rk4_step');

      if (!this.rk4Pipeline) {
        console.error('[WebGPUODESolver] RK4 pipeline creation returned null');
        return false;
      }

      // Create GPU buffers
      this.createBuffers(device);
  this.createBindGroups(device);

      this.isCompiled = true;
      console.info('[WebGPUODESolver] Compiled successfully for', this.nSpecies, 'species,', this.nReactions, 'reactions');
      return true;
    } catch (error) {
      console.error('[WebGPUODESolver] Compilation failed:', error);
      return false;
    }
  }

  /**
   * Generate WGSL shader for RHS (dy/dt) computation
   */
  private generateRHSShader(): string {
    // Build reaction rate computation code
    let reactionCode = '';
    for (let i = 0; i < this.reactions.length; i++) {
      const rxn = this.reactions[i];

      // Compute rate = k * product(conc[reactant]^stoich)
      let rateExpr = "rate_constants[" + rxn.rateConstantIndex + "u]";
      const rLen = rxn.reactantIndices.length;
      for (let j = 0; j < rLen; j++) {
        const idx = rxn.reactantIndices[j];
        const stoich = rxn.reactantStoich[j];
        if (stoich === 1) {
          rateExpr += " * concentrations[" + idx + "u]";
        } else {
          rateExpr += " * pow(concentrations[" + idx + "u], " + stoich.toFixed(1) + ")";
        }
      }
      reactionCode += "  let rate_" + i + " = " + rateExpr + ";\n";
    }

    // Build species derivative computation using if-else (more compatible than switch)
    // Pre-compute derivative expressions for each species
    const derivExprs: string[] = new Array(this.nSpecies);
    for (let s = 0; s < this.nSpecies; s++) {
      derivExprs[s] = "0.0";
    }

    for (let i = 0; i < this.reactions.length; i++) {
      const rxn = this.reactions[i];

      // Subtract for reactants
      const rLen = rxn.reactantIndices.length;
      for (let j = 0; j < rLen; j++) {
        const s = rxn.reactantIndices[j];
        const stoich = rxn.reactantStoich[j];
        derivExprs[s] += " - " + stoich.toFixed(1) + " * rate_" + i;
      }

      // Add for products
      const pLen = rxn.productIndices.length;
      for (let j = 0; j < pLen; j++) {
        const s = rxn.productIndices[j];
        const stoich = rxn.productStoich[j];
        derivExprs[s] += " + " + stoich.toFixed(1) + " * rate_" + i;
      }
    }

    // Generate if-else chain for species index
    let speciesCode = '';
    for (let s = 0; s < this.nSpecies; s++) {
      if (s === 0) {
        speciesCode += "  if (species_idx == 0u) {\n    dydt = " + derivExprs[s] + ";\n  }";
      } else {
        speciesCode += " else if (species_idx == " + s + "u) {\n    dydt = " + derivExprs[s] + ";\n  }";
      }
    }

    return `
// WebGPU ODE RHS Shader - Auto-generated for ${this.nSpecies} species, ${this.nReactions} reactions

struct SimParams {
  dt: f32,
  t: f32,
  n_species: f32,
  n_reactions: f32,
}

@group(0) @binding(0) var<storage, read> concentrations: array<f32>;
@group(0) @binding(1) var<storage, read> rate_constants: array<f32>;
@group(0) @binding(2) var<storage, read_write> derivatives: array<f32>;
@group(0) @binding(3) var<uniform> params: SimParams;

@compute @workgroup_size(64)
fn compute_rhs(@builtin(global_invocation_id) global_id: vec3u) {
  let species_idx = global_id.x;
  if (species_idx >= u32(params.n_species)) {
    return;
  }

  // Compute all reaction rates
${reactionCode}

  // Compute derivative for this species
  var dydt: f32 = 0.0;
${speciesCode}

  derivatives[species_idx] = dydt;
}
`;
  }

  /**
   * Generate WGSL shader for RK4 integration step
   */
  private generateRK4Shader(): string {
    return `
// WebGPU RK4 Integration Shader

struct SimParams {
  dt: f32,
  t: f32,
  n_species: f32,
  n_reactions: f32,
}

@group(0) @binding(0) var<storage, read_write> concentrations: array<f32>;
@group(0) @binding(1) var<storage, read> k1: array<f32>;
@group(0) @binding(2) var<storage, read> k2: array<f32>;
@group(0) @binding(3) var<storage, read> k3: array<f32>;
@group(0) @binding(4) var<storage, read> k4: array<f32>;
@group(0) @binding(5) var<uniform> params: SimParams;

@compute @workgroup_size(64)
fn rk4_step(@builtin(global_invocation_id) global_id: vec3u) {
  let i = global_id.x;
  if (i >= u32(params.n_species)) {
    return;
  }

  // RK4 formula: y_{n+1} = y_n + (h/6) * (k1 + 2*k2 + 2*k3 + k4)
  let dt = params.dt;
  let y_new = concentrations[i] + (dt / 6.0) * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
  
  // Clamp to non-negative (concentrations can't be negative)
  concentrations[i] = max(y_new, 0.0);
}
`;
  }

  /**
   * Generate WGSL shader for RK4 intermediate-state computation.
   */
  private generateIntermediateStateShader(): string {
    return `
// WebGPU RK4 Intermediate-State Shader

struct IntermediateParams {
  scale: f32,
  n_species: f32,
  _pad0: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<storage, read> y: array<f32>;
@group(0) @binding(1) var<storage, read> k: array<f32>;
@group(0) @binding(2) var<storage, read_write> temp: array<f32>;
@group(0) @binding(3) var<uniform> params: IntermediateParams;

@compute @workgroup_size(64)
fn intermediate_state(@builtin(global_invocation_id) global_id: vec3u) {
  let i = global_id.x;
  if (i >= u32(params.n_species)) {
    return;
  }

  temp[i] = max(y[i] + params.scale * k[i], 0.0);
}
`;
  }

  /**
   * Create GPU buffers for simulation
   */
  private createBuffers(device: GPUDevice): void {
    const bufferSize = this.nSpecies * 4; // Float32 = 4 bytes

    this.kBuffers = [];
    this.intermediateParamsBuffers = [];

    // Main concentration buffer (read/write)
    this.concentrationBuffer = createStorageBuffer(device, bufferSize);

    // Derivatives buffer
    this.derivativesBuffer = createStorageBuffer(device, bufferSize);

    // Rate constants buffer (read-only)
    this.rateConstantsBuffer = createBuffer(
      device,
      this.rateConstants,
      GPUBufferUsage.STORAGE
    );

    // k1, k2, k3, k4 buffers for RK4
    for (let i = 0; i < 4; i++) {
      this.kBuffers.push(createStorageBuffer(device, bufferSize));
    }

    // Separate step-parameter buffers let each intermediate dispatch see a stable scale.
    for (let i = 0; i < 3; i++) {
      this.intermediateParamsBuffers.push(createUniformBuffer(device, 16));
    }

    // Temporary buffer for intermediate states
    this.tempBuffer = createStorageBuffer(device, bufferSize);

    // Uniform buffer for simulation parameters
    this.paramsBuffer = createUniformBuffer(device, 16); // 4 floats
  }

  /**
   * Pre-create bind groups for the fixed RK4 dispatch pattern.
   */
  private createBindGroups(device: GPUDevice): void {
    if (!this.rhsPipeline || !this.intermediatePipeline || !this.rk4Pipeline) {
      throw new Error('Pipelines must be compiled before creating bind groups');
    }

    this.rhsBindGroups = this.kBuffers.map((kBuffer) => device.createBindGroup({
      layout: this.rhsPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.concentrationBuffer! } },
        { binding: 1, resource: { buffer: this.rateConstantsBuffer! } },
        { binding: 2, resource: { buffer: kBuffer } },
        { binding: 3, resource: { buffer: this.paramsBuffer! } }
      ]
    }));

    this.intermediateBindGroups = [0, 1, 2].map((stage) => device.createBindGroup({
      layout: this.intermediatePipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.concentrationBuffer! } },
        { binding: 1, resource: { buffer: this.kBuffers[stage] } },
        { binding: 2, resource: { buffer: this.tempBuffer! } },
        { binding: 3, resource: { buffer: this.intermediateParamsBuffers[stage] } }
      ]
    }));

    this.rk4BindGroup = device.createBindGroup({
      layout: this.rk4Pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.concentrationBuffer! } },
        { binding: 1, resource: { buffer: this.kBuffers[0] } },
        { binding: 2, resource: { buffer: this.kBuffers[1] } },
        { binding: 3, resource: { buffer: this.kBuffers[2] } },
        { binding: 4, resource: { buffer: this.kBuffers[3] } },
        { binding: 5, resource: { buffer: this.paramsBuffer! } }
      ]
    });
  }

  /**
   * Integrate ODE from t0 to tEnd
   */
  async integrate(
    y0: Float32Array,
    t0: number,
    tEnd: number,
    outputTimes: number[]
  ): Promise<WebGPUSimulationResult> {
    if (!this.isCompiled || !this.ctx) {
      const compiled = await this.compile();
      if (!compiled) {
        throw new Error('WebGPU compilation failed');
      }
    }

    const device = this.ctx!.getDevice();
    const startTime = performance.now();

    // Upload initial conditions - use buffer property to get ArrayBuffer
    device.queue.writeBuffer(this.concentrationBuffer!, 0, y0.buffer, y0.byteOffset, y0.byteLength);

    const results: Float32Array[] = [];
    const times: number[] = [];
    let t = t0;
    const baseDt = this.options.dt;  // Save the base timestep
    let dt = baseDt;
    let steps = 0;
    let outputIdx = 0;

    // Create a single large read buffer for all required outputs
    // Add 1 in case we need to capture a final state that doesn't align with outputTimes
    const maxOutputs = outputTimes.length + 1;
    const allReadBuf = createReadBuffer(device, maxOutputs * this.nSpecies * 4);
    let capturedOutputs = 0;

    // Main integration loop
    console.log(`[WebGPU] Starting integration: t=${t}, tEnd=${tEnd}, baseDt=${baseDt}, maxSteps=${this.options.maxSteps}, outputTimes.length=${outputTimes.length}`);
    while (t < tEnd && steps < this.options.maxSteps && outputIdx < outputTimes.length) {
      // Check if we need to output at this time
      while (outputIdx < outputTimes.length && outputTimes[outputIdx] <= t) {
        // Queue copy to the large read buffer
        const commandEncoder = device.createCommandEncoder();
        commandEncoder.copyBufferToBuffer(
          this.concentrationBuffer!,
          0,
          allReadBuf,
          capturedOutputs * this.nSpecies * 4,
          this.nSpecies * 4
        );
        device.queue.submit([commandEncoder.finish()]);

        times.push(outputTimes[outputIdx]);
        capturedOutputs++;
        outputIdx++;
      }

      // Reset dt to base each iteration, then adjust to not overshoot
      dt = baseDt;
      const nextOutput = outputIdx < outputTimes.length ? outputTimes[outputIdx] : tEnd;
      const timeToNextOutput = nextOutput - t;
      
      // If we're very close to the next output (floating point precision issue), snap to it
      if (timeToNextOutput <= 1e-10 && timeToNextOutput > -1e-10) {
        t = nextOutput;  // Snap t to exact output time
        continue;  // Let the inner loop collect this output point
      }
      
      dt = Math.min(dt, timeToNextOutput, tEnd - t);
      if (dt <= 1e-12) {
        console.log(`[WebGPU] Breaking due to dt=${dt} <= epsilon, t=${t}, nextOutput=${nextOutput}`);
        break;  // Use epsilon to avoid floating point issues
      }

      // Take RK4 step
      this.rk4Step(device, t, dt);

      t += dt;
      steps++;

      // Yield to the browser occasionally without stalling every few steps.
      if (steps % 100 === 0) {
        console.log(`[WebGPU] Progress: step ${steps}, t=${t.toFixed(4)}/${tEnd}, dt=${dt.toExponential(2)}, output ${outputIdx}/${outputTimes.length}`);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    // Debug: why did loop exit?
    console.log(`[WebGPU] Loop exited: t=${t} >= tEnd=${tEnd}? ${t >= tEnd}; steps=${steps} >= maxSteps=${this.options.maxSteps}? ${steps >= this.options.maxSteps}; outputIdx=${outputIdx} >= outputTimes.length=${outputTimes.length}? ${outputIdx >= outputTimes.length}`);
    console.log(`[WebGPU] Collected ${capturedOutputs} output points`);


    // Capture final state if needed
    if (outputIdx < outputTimes.length) {
      const commandEncoder = device.createCommandEncoder();
      commandEncoder.copyBufferToBuffer(
        this.concentrationBuffer!,
        0,
        allReadBuf,
        capturedOutputs * this.nSpecies * 4,
        this.nSpecies * 4
      );
      device.queue.submit([commandEncoder.finish()]);

      times.push(t);
      capturedOutputs++;
    }

    // Now await the single large buffer read at the end
    const flatStates = await readBuffer(allReadBuf);

    // Slice out the individual states from the flat buffer
    for (let i = 0; i < capturedOutputs; i++) {
      const start = i * this.nSpecies;
      const end = start + this.nSpecies;
      results.push(flatStates.slice(start, end));
    }

    allReadBuf.destroy();

    const gpuTime = performance.now() - startTime;

    return {
      times: new Float32Array(times),
      concentrations: results,
      success: true,
      steps,
      gpuTime
    };
  }

  /**
   * Perform one RK4 step
   */
  private rk4Step(device: GPUDevice, t: number, dt: number): void {
    const workgroups = Math.ceil(this.nSpecies / 64);

    // Update params
    const params = new Float32Array([dt, t, this.nSpecies, this.nReactions]);
    device.queue.writeBuffer(this.paramsBuffer!, 0, params);

    const halfStepParams = new Float32Array([dt / 2, this.nSpecies, 0, 0]);
    const fullStepParams = new Float32Array([dt, this.nSpecies, 0, 0]);
    device.queue.writeBuffer(this.intermediateParamsBuffers[0], 0, halfStepParams);
    device.queue.writeBuffer(this.intermediateParamsBuffers[1], 0, halfStepParams);
    device.queue.writeBuffer(this.intermediateParamsBuffers[2], 0, fullStepParams);

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();

    // k1 = f(t, y)
    this.computeRHS(passEncoder, 0, workgroups);

    // k2 = f(t + dt/2, y + dt/2 * k1)
    this.computeIntermediateState(passEncoder, 0, workgroups);
    this.computeRHS(passEncoder, 1, workgroups);

    // k3 = f(t + dt/2, y + dt/2 * k2)
    this.computeIntermediateState(passEncoder, 1, workgroups);
    this.computeRHS(passEncoder, 2, workgroups);

    // k4 = f(t + dt, y + dt * k3)
    this.computeIntermediateState(passEncoder, 2, workgroups);
    this.computeRHS(passEncoder, 3, workgroups);

    // Final RK4 update
    this.applyRK4Update(passEncoder, workgroups);

    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);
  }

  /**
   * Compute RHS (derivatives) for current state
   */
  private computeRHS(passEncoder: GPUComputePassEncoder, stageIndex: number, workgroups: number): void {
    passEncoder.setPipeline(this.rhsPipeline!);
    passEncoder.setBindGroup(0, this.rhsBindGroups[stageIndex]);
    passEncoder.dispatchWorkgroups(workgroups);
  }

  /**
   * Compute intermediate state: y_temp = y + h * k
   */
  private computeIntermediateState(passEncoder: GPUComputePassEncoder, stageIndex: number, workgroups: number): void {
    passEncoder.setPipeline(this.intermediatePipeline!);
    passEncoder.setBindGroup(0, this.intermediateBindGroups[stageIndex]);
    passEncoder.dispatchWorkgroups(workgroups);
  }

  /**
   * Apply final RK4 update
   */
  private applyRK4Update(passEncoder: GPUComputePassEncoder, workgroups: number): void {
    passEncoder.setPipeline(this.rk4Pipeline!);
    passEncoder.setBindGroup(0, this.rk4BindGroup!);
    passEncoder.dispatchWorkgroups(workgroups);
  }

  /**
   * Run ensemble simulation with multiple parameter sets
   */
  async ensembleSimulate(
    y0: Float32Array,
    t0: number,
    tEnd: number,
    outputTimes: number[],
    parameterSets: Float32Array[] // Each is a set of rate constants
  ): Promise<WebGPUSimulationResult[]> {
    const results: WebGPUSimulationResult[] = [];

    for (const params of parameterSets) {
      // Update rate constants
      this.rateConstants = params;
      if (this.rateConstantsBuffer && this.ctx) {
        this.ctx.getDevice().queue.writeBuffer(this.rateConstantsBuffer, 0, params.buffer, params.byteOffset, params.byteLength);
      }

      // Run simulation
      const result = await this.integrate(y0, t0, tEnd, outputTimes);
      results.push(result);
    }

    return results;
  }

  /**
   * Clean up GPU resources
   */
  dispose(): void {
    this.concentrationBuffer?.destroy();
    this.concentrationBuffer = null;
    this.derivativesBuffer?.destroy();
    this.derivativesBuffer = null;
    this.rateConstantsBuffer?.destroy();
    this.rateConstantsBuffer = null;
    this.paramsBuffer?.destroy();
    this.paramsBuffer = null;
    for (const buf of this.intermediateParamsBuffers) {
      buf.destroy();
    }
    this.intermediateParamsBuffers = [];
    this.tempBuffer?.destroy();
    this.tempBuffer = null;
    for (const buf of this.kBuffers) {
      buf.destroy();
    }
    this.kBuffers = [];
    this.rhsBindGroups = [];
    this.intermediateBindGroups = [];
    this.rk4BindGroup = null;
    this.intermediatePipeline = null;
    this.rhsPipeline = null;
    this.rk4Pipeline = null;
    this.ctx?.dispose();
    this.ctx = null;
    this.isCompiled = false;
  }
}

/**
 * Utility: Convert reaction network to GPU-compatible format
 */
export function convertToGPUReactions(
  reactions: Array<{
    reactants: Array<{ index: number; stoichiometry: number }>;
    products: Array<{ index: number; stoichiometry: number }>;
    rateConstant: number;
  }>
): { gpuReactions: GPUReaction[]; rateConstants: number[] } {
  const gpuReactions: GPUReaction[] = [];
  const rateConstants: number[] = [];

  reactions.forEach((rxn, idx) => {
    gpuReactions.push({
      reactantIndices: rxn.reactants.map(r => r.index),
      reactantStoich: rxn.reactants.map(r => r.stoichiometry),
      productIndices: rxn.products.map(p => p.index),
      productStoich: rxn.products.map(p => p.stoichiometry),
      rateConstantIndex: idx,
      isForward: true
    });
    rateConstants.push(rxn.rateConstant);
  });

  return { gpuReactions, rateConstants };
}

/**
 * Check if WebGPU ODE solver is available
 */
export async function isWebGPUODESolverAvailable(): Promise<boolean> {
  return initWebGPU();
}
