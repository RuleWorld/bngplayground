/**
 * SparseODESolver.ts - Sparse implicit ODE solver for stiff systems
 * 
 * Combines:
 * - Sparse Jacobian generation (from SparseJacobian.ts)
 * - ILU(0) preconditioned GMRES (from SparseLUSolver.ts)
 * - Conservation law elimination (from ConservationLaws.ts)
 * - Rosenbrock-type implicit method
 * 
 * Inspired by Catalyst.jl/DifferentialEquations.jl architecture.
 */

import {
  type CSRMatrix,
  type ILU0Factors,
  type ILU0SymbolicCache,
  ilu0Factorize,
  ilu0SymbolicAnalysis,
  ilu0NumericalFactorize,
  sparseSolve,
  gmres
} from './SparseLUSolver';
import { computeJacobianSparsity, type SparseJacobianInfo, generateAnalyticalJacobian } from './SparseJacobian';
import {
  findConservationLaws,
  createReducedSystem,
  type ConservationAnalysis
} from './ConservationLaws';
import type { Rxn } from '../graph/core/Rxn';

/**
 * Options for sparse ODE solver
 */
export interface SparseODEOptions {
  atol: number;
  rtol: number;
  maxSteps: number;
  useConservationLaws: boolean;
  useILUPreconditioner: boolean;
  gmresMaxIter: number;
  numRoots?: number;
  rootFunction?: (t: number, y: Float64Array, gout: Float64Array) => void;
  parameters?: Map<string, number>;
}

const DEFAULT_OPTIONS: SparseODEOptions = {
  atol: 1e-8,
  rtol: 1e-6,
  maxSteps: 100000,
  useConservationLaws: true,
  useILUPreconditioner: true,
  gmresMaxIter: 50
};

/**
 * Sparse implicit ODE solver using Rosenbrock-W method
 * with ILU-preconditioned GMRES for linear solves.
 */
export class SparseODESolver {
  private n: number;        // System size (may be reduced)
  private nFull: number;    // Full system size

  private options: SparseODEOptions;

  // Derivative function
  private derivatives: (y: Float64Array, dydt: Float64Array) => void;

  private sparsity?: SparseJacobianInfo;
  private jacobianData?: Float64Array;
  private jacobianCSR?: CSRMatrix;
  private jacobianEvaluator?: (y: Float64Array, J: Float64Array) => void;
  private iluFactors?: ILU0Factors;
  private iluSymbolicCache?: ILU0SymbolicCache;

  // Conservation law system reduction
  private conservation?: ConservationAnalysis;
  private reducedSystem?: ReturnType<typeof createReducedSystem>;
  private reducedDerivatives?: (y: Float64Array, dydt: Float64Array) => void;

  // Work arrays
  private f0: Float64Array;
  private f1: Float64Array;
  private k: Float64Array;
  private yTemp: Float64Array;
  private yNew: Float64Array;

  // Root findings
  private g0?: Float64Array;
  private g1?: Float64Array;

  constructor(
    nSpecies: number,
    reactions: Rxn[],
    derivatives: (y: Float64Array, dydt: Float64Array) => void,
    y0: Float64Array,
    speciesNames?: string[],
    options: Partial<SparseODEOptions> = {}
  ) {
    this.nFull = nSpecies;

    this.derivatives = derivatives;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    console.log(`[SparseODESolver] Initialized with atol=${this.options.atol}, rtol=${this.options.rtol}, maxSteps=${this.options.maxSteps}`);

    // Conservation law elimination
    if (this.options.useConservationLaws && reactions.length > 0) {
      this.conservation = findConservationLaws(reactions, nSpecies, y0, speciesNames);

      if (this.conservation.laws.length > 0) {
        this.reducedSystem = createReducedSystem(this.conservation, nSpecies);
        this.n = this.reducedSystem.reducedSize;
        this.reducedDerivatives = this.reducedSystem.transformDerivatives(derivatives);
        console.log(`[SparseODE] Reduced system from ${nSpecies} to ${this.n} species using ${this.conservation.laws.length} conservation laws`);
      } else {
        this.n = nSpecies;
      }
    } else {
      this.n = nSpecies;
    }

    // Compute sparsity pattern
    if (reactions.length > 0) {
      this.sparsity = computeJacobianSparsity(reactions, this.nFull);
      this.jacobianData = new Float64Array(this.sparsity.nnz);

      // Initialize analytical Jacobian if possible
      try {
        const params: Record<string, number> = {};
        if (options.parameters) {
          options.parameters.forEach((v, k) => { params[k] = v; });
        }
        this.jacobianEvaluator = generateAnalyticalJacobian(reactions, this.nFull, this.sparsity, params);
        console.log('[SparseODE] Using analytical JIT-compiled Jacobian');
      } catch (e) {
        console.warn('[SparseODE] Failed to generate analytical Jacobian, will use finite differences', e);
      }
    }

    // Allocate work arrays
    this.f0 = new Float64Array(this.n);
    this.f1 = new Float64Array(this.n);
    this.k = new Float64Array(this.n);
    this.yTemp = new Float64Array(this.n);
    this.yNew = new Float64Array(this.n);

    if (this.options.numRoots) {
      this.g0 = new Float64Array(this.options.numRoots);
      this.g1 = new Float64Array(this.options.numRoots);
    }
  }

  private computeJacobian(y: Float64Array): void {
    if (!this.sparsity || !this.jacobianData) return;

    if (this.jacobianEvaluator) {
      // Use analytical Jacobian (much faster)
      this.jacobianEvaluator(y, this.jacobianData);
    } else {
      // Fallback: finite differences
      const n = this.n;
      const deriv = this.reducedDerivatives || this.derivatives;
      const eps = 1e-8;

      // Base function evaluation
      deriv(y, this.f0);

      // For each column j, perturb y[j] and compute column of Jacobian
      for (let j = 0; j < n; j++) {
        const h = eps * (Math.abs(y[j]) + 1);
        const yj = y[j];

        this.yTemp.set(y);
        this.yTemp[j] = yj + h;
        deriv(this.yTemp, this.f1);

        // Fill in sparse entries for column j
        for (let i = 0; i < n; i++) {
          // Find entry (i,j) in CSR format
          for (let p = this.sparsity.rowPtr[i]; p < this.sparsity.rowPtr[i + 1]; p++) {
            if (this.sparsity.colIdx[p] === j) {
              this.jacobianData[p] = (this.f1[i] - this.f0[i]) / h;
              break;
            }
          }
        }
      }
    }

    // Build CSR matrix
    this.jacobianCSR = {
      n: this.n,
      nnz: this.sparsity.nnz,
      rowPtr: this.sparsity.rowPtr,
      colIdx: this.sparsity.colIdx,
      values: this.jacobianData
    };
  }

  /**
   * Build matrix M = I - γ*J and factorize
   */
  private buildAndFactorizeMatrix(gamma: number): void {
    if (!this.jacobianCSR) return;

    const n = this.n;

    // M = I - γ*J
    // Create M with same sparsity as J plus diagonal
    const mValues = new Float64Array(this.jacobianCSR.values.length);

    for (let i = 0; i < n; i++) {
      for (let p = this.jacobianCSR.rowPtr[i]; p < this.jacobianCSR.rowPtr[i + 1]; p++) {
        const j = this.jacobianCSR.colIdx[p];
        mValues[p] = -gamma * this.jacobianCSR.values[p];
        if (i === j) {
          mValues[p] += 1.0; // Add identity
        }
      }
    }

    const M: CSRMatrix = {
      n,
      nnz: this.jacobianCSR.nnz,
      rowPtr: this.jacobianCSR.rowPtr,
      colIdx: this.jacobianCSR.colIdx,
      values: mValues
    };

    // Cache the system matrix for use in linear solves
    // (M and the ILU factors must correspond to the same matrix)
    (this as any).systemMatrix = M;

    // ILU(0) factorization with cached symbolic structure
    // For biochemical networks, the sparsity pattern is fixed across steps,
    // so we perform symbolic analysis once and reuse it for numerical-only updates.
    if (this.options.useILUPreconditioner) {
      try {
        if (!this.iluSymbolicCache) {
          // First factorization: perform full symbolic analysis
          this.iluSymbolicCache = ilu0SymbolicAnalysis(M);
          this.iluFactors = ilu0NumericalFactorize(M, this.iluSymbolicCache);
        } else {
          // Subsequent factorizations: reuse symbolic structure, update numerics only
          this.iluFactors = ilu0NumericalFactorize(M, this.iluSymbolicCache);
        }
      } catch (e) {
        console.warn('[SparseODE] ILU factorization failed, using unpreconditioned GMRES');
        this.iluFactors = undefined;
      }
    }
  }

  /**
   * Solve M * k = rhs using preconditioned GMRES
   */
  private solveLinearSystem(rhs: Float64Array, k: Float64Array): boolean {
    if (!this.jacobianCSR) {
      k.set(rhs);
      return true;
    }

    // Use the system matrix M = I - γ*J built in buildAndFactorizeMatrix
    const M = (this as any).systemMatrix as CSRMatrix | undefined;
    if (!M) {
      // Fallback: behave as before but this should not happen if buildAndFactorizeMatrix was called
      const fallbackM: CSRMatrix = {
        n: this.n,
        nnz: this.jacobianCSR.nnz,
        rowPtr: this.jacobianCSR.rowPtr,
        colIdx: this.jacobianCSR.colIdx,
        values: this.jacobianCSR.values
      };
      k.fill(0); // Initial guess
      if (this.iluFactors) {
        sparseSolve(this.iluFactors, rhs, k);
        return true;
      } else {
        const iters = gmres(fallbackM, rhs, k, undefined, 1e-10, this.options.gmresMaxIter);
        return iters >= 0;
      }
    }

    k.fill(0); // Initial guess

    if (this.iluFactors) {
      // Use ILU as direct solver for small residuals
      sparseSolve(this.iluFactors, rhs, k);
      return true;
    } else {
      // Use GMRES without preconditioner
      const iters = gmres(M, rhs, k, undefined, 1e-10, this.options.gmresMaxIter);
      return iters >= 0;
    }
  }

  /**
   * Take one step using implicit Euler (Rosenbrock-W deferred)
   */
  step(y: Float64Array, _t: number, h: number): {
    accepted: boolean;
    hNew: number;
    yNew: Float64Array;
    errNorm: number;
  } {
    const n = this.n;
    const deriv = this.reducedDerivatives || this.derivatives;
    const { atol, rtol } = this.options;

    // Compute f(t, y)
    deriv(y, this.f0);

    // Compute Jacobian
    this.computeJacobian(y);

    // Build and factorize M = I - h*J
    this.buildAndFactorizeMatrix(h);

    // Implicit Euler step: y_new = y + h*k where (I - h*J)*k = f(y)
    if (!this.solveLinearSystem(this.f0, this.k)) {
      // Linear solve failed - reject step and reduce h
      return { accepted: false, hNew: h * 0.5, yNew: y, errNorm: Infinity };
    }

    // y_new = y + h * k
    for (let i = 0; i < n; i++) {
      this.yNew[i] = y[i] + h * this.k[i];
      if (this.yNew[i] < 0) this.yNew[i] = 0; // Clamp concentrations
    }

    // Error estimate using step doubling (Richardson extrapolation)
    // Take two half steps
    const hHalf = h / 2;
    this.buildAndFactorizeMatrix(hHalf);

    // First half step
    this.solveLinearSystem(this.f0, this.k);
    for (let i = 0; i < n; i++) {
      this.yTemp[i] = y[i] + hHalf * this.k[i];
      if (this.yTemp[i] < 0) this.yTemp[i] = 0;
    }

    // Second half step
    deriv(this.yTemp, this.f1);
    this.solveLinearSystem(this.f1, this.k);
    for (let i = 0; i < n; i++) {
      this.yTemp[i] = this.yTemp[i] + hHalf * this.k[i];
      if (this.yTemp[i] < 0) this.yTemp[i] = 0;
    }

    // Error estimate: err = |y_new - y_2half| / (atol + rtol * |y_new|)
    let errNorm = 0;
    for (let i = 0; i < n; i++) {
      const scale = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(this.yNew[i]));
      const err = (this.yNew[i] - this.yTemp[i]) / scale;
      errNorm += err * err;
    }
    errNorm = Math.sqrt(errNorm / n);

    // Step size control
    const accepted = errNorm <= 1.0;
    const safety = 0.9;
    const minScale = 0.1;
    const maxScale = 5.0;

    let scale: number;
    if (errNorm === 0) {
      scale = maxScale;
    } else {
      scale = safety * Math.pow(1 / errNorm, 0.5); // Order 1 method
    }
    scale = Math.max(minScale, Math.min(maxScale, scale));

    const hNew = h * scale;

    const hNext = h * scale;

    // Root detection
    if (accepted && this.options.rootFunction && this.options.numRoots && this.g0 && this.g1) {
      const g0 = this.g0;
      const g1 = this.g1;
      const tStart = _t;
      const tEnd = _t + h;

      this.options.rootFunction(tStart, y, g0);
      this.options.rootFunction(tEnd, this.yNew, g1);

      let rootFound = false;
      for (let i = 0; i < this.options.numRoots; i++) {
        // Check for sign change
        if (g0[i] * g1[i] < 0) {
          rootFound = true;
          break;
        }
      }

      if (rootFound) {
        // Signal root found. Solver will return this state and SimulationLoop can re-evaluate conditions.
        return { accepted: true, hNew: h, yNew: this.yNew, errNorm, rootFound: true } as any;
      }
    }

    return { accepted, hNew: hNext, yNew: this.yNew, errNorm };
  }

  /**
   * Integrate from t0 to tEnd
   */
  integrate(
    y0: Float64Array,
    t0: number,
    tEnd: number,
    outputTimes: number[],
    output: (t: number, y: Float64Array) => void
  ): { success: boolean; steps: number; y: Float64Array; t: number } {


    // Get initial state (reduced if conservation laws used)
    let y: Float64Array;
    if (this.reducedSystem) {
      y = this.reducedSystem.reduce(y0);
    } else {
      y = new Float64Array(y0);
    }

    let t = t0;
    let h = (tEnd - t0) / 100; // Initial step size
    h = Math.min(h, (tEnd - t0) / 10);

    let steps = 0;
    let outputIdx = 0;

    // Output initial state
    while (outputIdx < outputTimes.length && outputTimes[outputIdx] <= t0) {
      if (this.reducedSystem) {
        output(outputTimes[outputIdx], this.reducedSystem.expand(y));
      } else {
        output(outputTimes[outputIdx], y);
      }
      outputIdx++;
    }

    while (t < tEnd && steps < this.options.maxSteps) {
      // Limit step to output time
      let hActual = h;
      if (outputIdx < outputTimes.length && t + h > outputTimes[outputIdx]) {
        hActual = outputTimes[outputIdx] - t;
      }
      if (t + hActual > tEnd) {
        hActual = tEnd - t;
      }

      const result = this.step(y, t, hActual);
      steps++;

      if (result.accepted) {
        t += hActual;
        y.set(result.yNew);

        // Output at requested times
        while (outputIdx < outputTimes.length && t >= outputTimes[outputIdx] - 1e-10) {
          if (this.reducedSystem) {
            output(outputTimes[outputIdx], this.reducedSystem.expand(y));
          } else {
            output(outputTimes[outputIdx], y);
          }
          outputIdx++;
        }

        if ((result as any).rootFound) {
          return { success: true, steps, errorMessage: "ROOT_FOUND", t, y: this.reducedSystem ? this.reducedSystem.expand(y) : y } as any;
        }

        h = result.hNew;
      } else {
        h = result.hNew;
      }

      // Safety limits
      const minH = (tEnd - t0) * 1e-15;
      if (h < minH) {
        console.error(`[SparseODE] Step size too small at t=${t}`);
        const finalY = this.reducedSystem ? this.reducedSystem.expand(y) : new Float64Array(y);
        return { success: false, steps, y: finalY, t };
      }
    }

    const finalY = this.reducedSystem ? this.reducedSystem.expand(y) : new Float64Array(y);

    if (steps >= this.options.maxSteps) {
      console.warn(`[SparseODE] Max steps reached at t=${t}`);
      return { success: false, steps, y: finalY, t };
    }

    return { success: true, steps, y: finalY, t };
  }
}
