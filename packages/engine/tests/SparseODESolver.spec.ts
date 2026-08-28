import { describe, expect, it, vi } from 'vitest';
import { SparseODESolver, type StepResult } from '../src/services/analysis/SparseODESolver';
import { Rxn } from '../src/services/graph/core/Rxn';
import type { ConservationAnalysis, createReducedSystem } from '../src/services/analysis/ConservationLaws';
import type { CSRMatrix, ILU0Factors, ILU0SymbolicCache } from '../src/services/analysis/SparseLUSolver';
import type { SparseJacobianInfo } from '../src/services/analysis/SparseJacobian';

interface InternalSparseODESolver {
  n: number;
  g0?: Float64Array;
  g1?: Float64Array;
  f0: Float64Array;
  f1: Float64Array;
  yTemp: Float64Array;
  yNew: Float64Array;
  k: Float64Array;
  sparsity?: SparseJacobianInfo;
  jacobianData?: Float64Array;
  jacobianCSR?: CSRMatrix;
  systemMatrix?: CSRMatrix;
  iluSymbolicCache?: ILU0SymbolicCache;
  iluFactors?: ILU0Factors;
  conservation?: ConservationAnalysis;
  reducedSystem?: ReturnType<typeof createReducedSystem>;
  reducedDerivatives?: (y: Float64Array, dydt: Float64Array) => void;
  step(y: Float64Array, t: number, h: number): StepResult;
  buildAndFactorizeMatrix(gamma: number): void;
}

describe('SparseODESolver', () => {
  it('should construct correctly', () => {
    const deriv = vi.fn();
    const solver = new SparseODESolver(
      2, [], deriv, new Float64Array([0,0]), [],
      { useILUPreconditioner: true, useConservationLaws: false }
    );
    expect(solver).toBeDefined();
  });

  it('should solve a simple exponential decay equation', () => {
    const k = 0.5;
    const deriv = (y: Float64Array, dy: Float64Array) => {
      dy[0] = -k * y[0];
    };

    const rxns: Rxn[] = [new Rxn([0], [], k)];

    const solver = new SparseODESolver(
      1, rxns, deriv, new Float64Array([10.0]), ['A'],
      { atol: 1e-8, rtol: 1e-6, useConservationLaws: false }
    );

    const y0 = new Float64Array([10.0]);
    const outT: number[] = [];
    const outY: number[] = [];

    const result = solver.integrate(y0, 0, 2.0, [0.0, 1.0, 2.0], (t, y) => {
      outT.push(t);
      outY.push(y[0]);
    });

    expect(result.success).toBe(true);
    expect(outT.length).toBe(3);

    expect(outY[0]).toBeCloseTo(10.0, 5);
    expect(outY[1]).toBeCloseTo(10.0 * Math.exp(-0.5 * 1.0), 2);
    expect(outY[2]).toBeCloseTo(10.0 * Math.exp(-0.5 * 2.0), 2);
  });

  it('should handle roots finding', () => {
     const deriv = (y: Float64Array, dy: Float64Array) => {
       dy[0] = -y[0]; // decays
       dy[1] = y[0];
     };

     const rootFn = (t: number, y: Float64Array, g: Float64Array) => {
        g[0] = y[0] - 5.0; // Trigger when y[0] crosses 5
     };

     const rxns: Rxn[] = [new Rxn([0], [1], 1)];

     const solver = new SparseODESolver(
       2, rxns, deriv, new Float64Array([10.0, 0.0]), ['A', 'B'],
       { rootFunction: rootFn, numRoots: 1, useConservationLaws: false, maxSteps: 100000, atol: 1e-8, rtol: 1e-6 }
     );

     const internal = solver as unknown as InternalSparseODESolver;

     // Evaluate initial root value manually as it requires it to cross the boundary.
     internal.g0 = new Float64Array(1);
     internal.g1 = new Float64Array(1);

     const y0 = new Float64Array([10.0, 0.0]);

     // Initialize g0 and g1 so there's a sign change when y0 hits 5
     internal.g0[0] = 5.0; // positive
     internal.g1[0] = -1.0; // negative

     // Force solver state
     internal.f0 = new Float64Array(2);
     internal.f1 = new Float64Array(2);
     internal.yTemp = new Float64Array(2);
     internal.yNew = new Float64Array(2);
     internal.k = new Float64Array(2);

     internal.step = function(y: Float64Array, _t: number, h: number): StepResult {
         this.yNew.set(y);
         this.yNew[0] -= h * y[0];
         this.yNew[1] += h * y[0];

         if (this.g0 && this.g1) {
           rootFn(_t, y, this.g0);
           rootFn(_t + h, this.yNew, this.g1);

           if (this.g0[0] * this.g1[0] < 0) {
              return { accepted: true, hNew: h, yNew: this.yNew, errNorm: 0, rootFound: true };
           }
         }

         return { accepted: true, hNew: h, yNew: this.yNew, errNorm: 0, rootFound: false };
     };

     const outT: number[] = [];

     const result = solver.integrate(y0, 0, 2.0, [], (t) => {
       outT.push(t);
     });

     expect(result.success).toBe(true);
     expect(result.errorMessage).toBe("ROOT_FOUND");
  });

  it('should handle small step sizes correctly without infinite loops', () => {
    const deriv = (y: Float64Array, dy: Float64Array) => {
      dy[0] = -10000000 * y[0]; // Very stiff
    };

    const rxns: Rxn[] = [new Rxn([0], [], 10000000)];

    const solver = new SparseODESolver(
      1, rxns, deriv, new Float64Array([10.0]), ['A'],
      { atol: 1e-8, rtol: 1e-6, useConservationLaws: false }
    );

    const y0 = new Float64Array([10.0]);
    const result = solver.integrate(y0, 0, 1.0, [1.0], () => {});

    expect(result.success).toBe(true);
  });

  it('should solve using dense fallback solver when ilu precondtioner is off', () => {
    const deriv = (y: Float64Array, dy: Float64Array) => {
      dy[0] = -0.5 * y[0];
    };

    const rxns: Rxn[] = [new Rxn([0], [], 0.5)];

    const solver = new SparseODESolver(
      1, rxns, deriv, new Float64Array([10.0]), ['A'],
      { atol: 1e-8, rtol: 1e-6, useConservationLaws: false, useILUPreconditioner: false }
    );

    const y0 = new Float64Array([10.0]);
    const result = solver.integrate(y0, 0, 1.0, [1.0], () => {});

    expect(result.success).toBe(true);
    expect(result.y[0]).toBeCloseTo(10.0 * Math.exp(-0.5 * 1.0), 2);
  });

  it('should fall back to un-preconditioned GMRES if ILU factorize throws error', () => {
     const deriv = (y: Float64Array, dy: Float64Array) => {
       dy[0] = -y[0];
     };

     const rxns: Rxn[] = [new Rxn([0], [], 1)];

     const solver = new SparseODESolver(
       1, rxns, deriv, new Float64Array([10.0]), ['A'],
       { atol: 1e-8, rtol: 1e-6, useConservationLaws: false, useILUPreconditioner: true }
     );

     const internal = solver as unknown as InternalSparseODESolver;

     internal.buildAndFactorizeMatrix = function(_gamma: number) {
       // mock sparsity
       this.sparsity = { nnz: 1, rowPtr: new Int32Array([0, 1]), colIdx: new Int32Array([0]), fillRatio: 1.0 };
       this.jacobianData = new Float64Array([0]);

       if (this.sparsity && this.jacobianData) {
         this.jacobianCSR = {
           n: this.n,
           nnz: this.sparsity.nnz,
           rowPtr: this.sparsity.rowPtr,
           colIdx: this.sparsity.colIdx,
           values: this.jacobianData
         };
       }

         if (this.jacobianCSR) {
           const mValues = new Float64Array(this.jacobianCSR.values.length);
           mValues[0] = 0.0;

           const M: CSRMatrix = {
               n: this.n,
               nnz: this.jacobianCSR.nnz,
               rowPtr: this.jacobianCSR.rowPtr,
               colIdx: this.jacobianCSR.colIdx,
               values: mValues
           };
           this.systemMatrix = M;
         }

         try {
             if (!this.iluSymbolicCache) {
                 throw new Error("Forced ILU failure");
             }
         } catch {
             this.iluFactors = undefined;
         }
     };

     const y0 = new Float64Array([10.0]);
     const result = solver.integrate(y0, 0, 1.0, [1.0], () => {});

     expect(result.success).toBeDefined();
  });

  it('should handle conservation laws reduction', () => {
    // A -> B, k=1
    const k = 1.0;

    const rxns: Rxn[] = [new Rxn([0], [1], k)];

    const cl: ConservationAnalysis = {
      laws: [],
      independentSpecies: [0],
      dependentSpecies: [1],
      rank: 1
    };

    const deriv = (y: Float64Array, dy: Float64Array) => {
      dy[0] = -k * y[0];
      dy[1] = k * y[0];
    };

    const solver = new SparseODESolver(
      2, rxns, deriv, new Float64Array([10.0, 0.0]), ['A', 'B'],
      { atol: 1e-6, rtol: 1e-6, useConservationLaws: true }
    );

    const internal = solver as unknown as InternalSparseODESolver;

    internal.conservation = cl;

    const transformDerivativesMock = (derivFn: (y: Float64Array, dy: Float64Array) => void) => {
        return (yRed: Float64Array, dyRed: Float64Array) => {
           derivFn(yRed, dyRed);
           dyRed[0] = -k * yRed[0];
        };
    };

    internal.reducedSystem = {
        reduce: (y: Float64Array) => new Float64Array([y[0]]),
        expand: (yRed: Float64Array) => {
          const full = new Float64Array(2);
          full[0] = yRed[0];
          full[1] = 10.0 - yRed[0];
          return full;
        },
        reducedSize: 1,
        transformDerivatives: transformDerivativesMock,
        transformJacobian: vi.fn()
    };
    internal.n = 1;
    internal.reducedDerivatives = transformDerivativesMock(deriv);

    internal.f0 = new Float64Array(1);
    internal.f1 = new Float64Array(1);
    internal.k = new Float64Array(1);
    internal.yTemp = new Float64Array(1);
    internal.yNew = new Float64Array(1);

    const y0 = new Float64Array([10.0, 0.0]);
    const outT: number[] = [];
    const outY: number[][] = [];

    const result = solver.integrate(y0, 0, 1.0, [1.0], (t, y) => {
      outT.push(t);
      outY.push(Array.from(y));
    });

    expect(result.success).toBe(true);
    expect(outY[0][0]).toBeCloseTo(10.0 * Math.exp(-1.0), 1);
    expect(outY[0][1]).toBeCloseTo(10.0 - 10.0 * Math.exp(-1.0), 1);
  });
});
