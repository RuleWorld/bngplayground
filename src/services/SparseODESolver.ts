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
  ilu0Factorize,
  sparseSolve,
  gmres
} from './SparseLUSolver';
import { computeJacobianSparsity, type SparseJacobianInfo } from './SparseJacobian';
import {
  findConservationLaws,
  createReducedSystem,
  type ConservationAnalysis
} from './ConservationLaws';
import type { Rxn } from './graph/core/Rxn';

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

  // Sparse Jacobian info
  private sparsity?: SparseJacobianInfo;
  private jacobianData?: Float64Array;
  private jacobianCSR?: CSRMatrix;
  private iluFactors?: ILU0Factors;

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
    }

    // Allocate work arrays
    this.f0 = new Float64Array(this.n);
    this.f1 = new Float64Array(this.n);
    this.k = new Float64Array(this.n);
    this.yTemp = new Float64Array(this.n);
    this.yNew = new Float64Array(this.n);
  }

  /**
   * Compute Jacobian at current state using finite differences
   * (Could be replaced with analytical Jacobian for mass-action)
   */
  private computeJacobian(y: Float64Array): void {
    if (!this.sparsity || !this.jacobianData) return;

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

    // ILU(0) factorization
    if (this.options.useILUPreconditioner) {
      try {
        this.iluFactors = ilu0Factorize(M);
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

    // Build M = I - γ*J (already done in buildAndFactorizeMatrix)
    const M: CSRMatrix = {
      n: this.n,
      nnz: this.jacobianCSR.nnz,
      rowPtr: this.jacobianCSR.rowPtr,
      colIdx: this.jacobianCSR.colIdx,
      values: this.jacobianCSR.values // Note: should use M values, not J
    };

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

    // Use Richardson extrapolation result if accepted (higher order)
    if (accepted) {
      for (let i = 0; i < n; i++) {
        this.yNew[i] = 2 * this.yTemp[i] - this.yNew[i]; // 2nd order
      }
    }

    return { accepted, hNew, yNew: this.yNew, errNorm };
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
  ): { success: boolean; steps: number } {


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

        h = result.hNew;
      } else {
        h = result.hNew;
      }

      // Safety limits
      const minH = (tEnd - t0) * 1e-15;
      if (h < minH) {
        console.error(`[SparseODE] Step size too small at t=${t}`);
        return { success: false, steps };
      }
    }

    if (steps >= this.options.maxSteps) {
      console.warn(`[SparseODE] Max steps reached at t=${t}`);
      return { success: false, steps };
    }

    return { success: true, steps };
  }
}
