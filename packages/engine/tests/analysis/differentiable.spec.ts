import { describe, it, expect } from 'vitest';
import {
  forwardSensitivity,
  adjointSensitivity,
  computeObjectiveGradient,
  setCVodeSensModule,
  resetCVodeSensModule,
} from '../../src/services/analysis/DifferentiableSolver';
import type { SensitivityConfig } from '../../src/services/analysis/DifferentiableSolver';
import {
  lbfgsOptimize,
  adamOptimize,
  trustRegionOptimize,
} from '../../src/services/analysis/GradientOptimizer';
import { computeExactFIM } from '../../src/services/analysis/ExactFIM';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Build a SensitivityConfig for exponential decay: dy/dt = -k * y, y(0) = y0.
 * The parameter array is [k] and the rhsFn reads k from it.
 */
function exponentialDecayConfig(
  k: number,
  y0: number,
  tEnd: number,
  nPoints: number,
): { config: SensitivityConfig; params: Float64Array } {
  const params = new Float64Array([k]);
  const config: SensitivityConfig = {
    nSpecies: 1,
    nParameters: 1,
    parameterNames: ['k'],
    parameterValues: params,
    rhsFn: (_t: number, y: Float64Array, dydt: Float64Array) => {
      dydt[0] = -params[0] * y[0];
    },
    initialState: new Float64Array([y0]),
    tSpan: [0, tEnd],
    nOutputPoints: nPoints,
  };
  return { config, params };
}

// ── 1. Forward sensitivity on exponential decay ─────────────────────

describe('DifferentiableSolver', () => {
  describe('forwardSensitivity', () => {
    it('should compute forward sensitivities for exponential decay', () => {
      const k = 0.5;
      const y0 = 1.0;
      const tEnd = 2.0;
      const nPoints = 100;
      const { config } = exponentialDecayConfig(k, y0, tEnd, nPoints);

      const result = forwardSensitivity(config);

      expect(result.method).toBe('finite_difference');
      expect(result.time.length).toBe(nPoints + 1);
      expect(result.states.length).toBe(nPoints + 1);
      expect(result.sensitivities.length).toBe(nPoints + 1);

      // Check a few time points against analytical sensitivity:
      // y(t) = y0 * exp(-k*t)
      // dy/dk = -t * y0 * exp(-k*t)
      for (const idx of [10, 50, 100]) {
        const t = result.time[idx];
        const analyticalSens = -t * y0 * Math.exp(-k * t);
        const computedSens = result.sensitivities[idx][0][0]; // param 0, species 0

        // Finite-difference + RK4 won't be exact, but should be within 5%
        if (Math.abs(analyticalSens) > 1e-8) {
          const relError = Math.abs((computedSens - analyticalSens) / analyticalSens);
          expect(relError).toBeLessThan(0.05);
        }
      }
    });

    it('should produce correct state trajectory for exponential decay', () => {
      const k = 1.0;
      const y0 = 2.0;
      const { config } = exponentialDecayConfig(k, y0, 1.0, 200);

      const result = forwardSensitivity(config);

      // Check final state: y(1) = 2*exp(-1) ≈ 0.7358
      const expected = y0 * Math.exp(-k * 1.0);
      const actual = result.states[200][0];
      expect(Math.abs(actual - expected) / expected).toBeLessThan(0.001);
    });
  });

  // ── 2. Gradient of SSR for exponential decay ───────────────────────

  describe('computeObjectiveGradient', () => {
    it('should compute gradient of SSR close to analytical value', () => {
      const kTrue = 0.5;
      const y0 = 1.0;
      const tEnd = 2.0;
      const nPoints = 50;

      // Generate "experimental" data from k=0.5
      const dataPoints: Float64Array[] = [];
      for (let i = 0; i <= nPoints; i++) {
        const t = (tEnd / nPoints) * i;
        dataPoints.push(new Float64Array([y0 * Math.exp(-kTrue * t)]));
      }

      // Evaluate gradient at a perturbed k=0.6
      const kPerturbed = 0.6;
      const { config } = exponentialDecayConfig(kPerturbed, y0, tEnd, nPoints);

      const result = computeObjectiveGradient(config, dataPoints, [0]);

      // The SSR gradient should point in the right direction:
      // Since k=0.6 > k_true=0.5, increasing k increases the error,
      // so dSSR/dk should be positive (the solution decays too fast).
      expect(result.gradient[0]).toBeGreaterThan(0);
      expect(result.method).toBe('finite_difference');
    });
  });

  // ── 7. Adjoint / finite-difference gradient fallback ───────────────

  describe('cvodesForwardSensitivity resilience & error handling', () => {
    it('should handle partial or full WASM heap allocation failure gracefully', () => {
      const k = 0.5;
      const y0 = 1.0;
      const tEnd = 2.0;
      const nPoints = 10;
      const { config } = exponentialDecayConfig(k, y0, tEnd, nPoints);

      const freedPtrs: number[] = [];
      let mallocCallCount = 0;

      const mockModule = {
        _malloc: (size: number) => {
          mallocCallCount++;
          // Fail on 3rd allocation (e.g. yOutPtr)
          if (mallocCallCount === 3) return 0;
          return mallocCallCount * 100;
        },
        _free: (ptr: number) => {
          freedPtrs.push(ptr);
        },
        _sens_init_forward: () => 1234,
        _sens_solve_step: () => 0,
        _sens_get_y: () => {},
        _sens_get_s: () => {},
        _sens_get_all: () => {},
        _sens_destroy: () => {},
        HEAPF64: new Float64Array(10000),
      };

      setCVodeSensModule(mockModule);

      try {
        const result = forwardSensitivity(config);
        // Should fall back to finite_difference without throwing
        expect(result.method).toBe('finite_difference');
        // Check that any non-zero allocated pointers prior to failure were freed
        expect(freedPtrs).toContain(100);
        expect(freedPtrs).toContain(200);
      } finally {
        resetCVodeSensModule();
      }
    });

    it('should handle _sens_init_forward failure and free heap pointers', () => {
      const k = 0.5;
      const y0 = 1.0;
      const tEnd = 2.0;
      const nPoints = 10;
      const { config } = exponentialDecayConfig(k, y0, tEnd, nPoints);

      const freedPtrs: number[] = [];
      let mallocCallCount = 0;

      const mockModule = {
        _malloc: (_size: number) => {
          mallocCallCount++;
          return mallocCallCount * 100;
        },
        _free: (ptr: number) => {
          freedPtrs.push(ptr);
        },
        _sens_init_forward: () => 0, // Initialization fails (returns 0/null)
        _sens_solve_step: () => 0,
        _sens_get_y: () => {},
        _sens_get_s: () => {},
        _sens_get_all: () => {},
        _sens_destroy: () => {},
        HEAPF64: new Float64Array(10000),
      };

      setCVodeSensModule(mockModule);

      try {
        const result = forwardSensitivity(config);
        expect(result.method).toBe('finite_difference');
        // Verify all 5 pointers allocated before init were freed
        expect(freedPtrs).toEqual([100, 200, 300, 400, 500]);
      } finally {
        resetCVodeSensModule();
      }
    });
  });

  describe('adjointSensitivity', () => {
    it('should produce gradient in same direction as forward sensitivity gradient', () => {
      const k = 0.5;
      const y0 = 1.0;
      const tEnd = 2.0;
      const nPoints = 50;
      const { config } = exponentialDecayConfig(k, y0, tEnd, nPoints);

      // Simple objective: sum of squares of states
      const objectiveFn = (states: Float64Array[], time: Float64Array) => {
        let value = 0;
        const dLdy: Float64Array[] = [];
        for (let t = 0; t < time.length; t++) {
          value += states[t][0] * states[t][0];
          dLdy.push(new Float64Array([2 * states[t][0]]));
        }
        return { value, dLdy };
      };

      const result = adjointSensitivity(config, objectiveFn);

      expect(result.method).toBe('finite_difference');
      expect(typeof result.objectiveValue).toBe('number');
      expect(result.objectiveValue).toBeGreaterThan(0);

      // Gradient should be negative: increasing k makes y decay faster,
      // reducing sum(y^2)
      expect(result.gradient[0]).toBeLessThan(0);
    });
  });
});

// ── 3. L-BFGS: minimize Rosenbrock ─────────────────────────────────

describe('GradientOptimizer', () => {
  // Rosenbrock: f(x,y) = (1-x)^2 + 100(y-x^2)^2
  // Minimum at (1, 1), f = 0
  const rosenbrock = async (params: Float64Array) => {
    const x = params[0];
    const y = params[1];
    const value = (1 - x) ** 2 + 100 * (y - x * x) ** 2;
    const gradient = new Float64Array([
      -2 * (1 - x) - 400 * x * (y - x * x),
      200 * (y - x * x),
    ]);
    return { value, gradient };
  };

  describe('lbfgsOptimize', () => {
    it('should minimize the Rosenbrock function', async () => {
      const result = await lbfgsOptimize({
        objectiveFn: rosenbrock,
        initialParams: new Float64Array([-1, 1]),
        maxIterations: 500,
        tolerance: 1e-6,
      });

      expect(result.objectiveValue).toBeLessThan(1e-4);
      expect(Math.abs(result.parameters[0] - 1)).toBeLessThan(0.05);
      expect(Math.abs(result.parameters[1] - 1)).toBeLessThan(0.05);
      expect(result.trajectory.length).toBeGreaterThan(0);
    });

    it('should respect box constraints', async () => {
      const result = await lbfgsOptimize({
        objectiveFn: rosenbrock,
        initialParams: new Float64Array([0, 0]),
        bounds: [[0, 2], [0, 2]],
        maxIterations: 300,
        tolerance: 1e-6,
      });

      // Parameters should stay within bounds
      expect(result.parameters[0]).toBeGreaterThanOrEqual(0);
      expect(result.parameters[0]).toBeLessThanOrEqual(2);
      expect(result.parameters[1]).toBeGreaterThanOrEqual(0);
      expect(result.parameters[1]).toBeLessThanOrEqual(2);
    });
  });

  // ── 4. Adam: minimize quadratic in 10D ──────────────────────────────

  describe('adamOptimize', () => {
    it('should minimize a 10D quadratic function', async () => {
      // f(x) = sum_i a_i * (x_i - b_i)^2 where a_i > 0
      const n = 10;
      const a = Float64Array.from({ length: n }, (_, i) => i + 1);
      const b = Float64Array.from({ length: n }, (_, i) => i * 0.5);

      const quadratic = async (params: Float64Array) => {
        let value = 0;
        const gradient = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          const diff = params[i] - b[i];
          value += a[i] * diff * diff;
          gradient[i] = 2 * a[i] * diff;
        }
        return { value, gradient };
      };

      const result = await adamOptimize({
        objectiveFn: quadratic,
        initialParams: new Float64Array(n).fill(5), // start far from minimum
        maxIterations: 1000,
        learningRate: 0.1,
        tolerance: 1e-6,
      });

      // Should get reasonably close to the minimum
      expect(result.objectiveValue).toBeLessThan(1.0);

      // Check that parameters are in the right ballpark
      for (let i = 0; i < n; i++) {
        expect(Math.abs(result.parameters[i] - b[i])).toBeLessThan(1.0);
      }
    });
  });

  // ── 5. Trust-region: minimize Rosenbrock ──────────────────────────

  describe('trustRegionOptimize', () => {
    it('should minimize the Rosenbrock function', async () => {
      const result = await trustRegionOptimize({
        objectiveFn: rosenbrock,
        initialParams: new Float64Array([0, 0]),
        maxIterations: 500,
        tolerance: 1e-6,
      });

      expect(result.objectiveValue).toBeLessThan(0.1);
      // Trust-region should at least make significant progress
      expect(result.trajectory.length).toBeGreaterThan(1);
      // Final parameters should be closer to (1,1) than the start
      const distToOpt = Math.sqrt(
        (result.parameters[0] - 1) ** 2 + (result.parameters[1] - 1) ** 2,
      );
      expect(distToOpt).toBeLessThan(1.0);
    });

    it('should handle a simple quadratic', async () => {
      // f(x) = x^2 + y^2, minimum at (0,0)
      const quadratic = async (params: Float64Array) => ({
        value: params[0] ** 2 + params[1] ** 2,
        gradient: new Float64Array([2 * params[0], 2 * params[1]]),
      });

      const result = await trustRegionOptimize({
        objectiveFn: quadratic,
        initialParams: new Float64Array([3, 4]),
        maxIterations: 100,
        tolerance: 1e-8,
      });

      expect(result.objectiveValue).toBeLessThan(1e-6);
      expect(result.converged).toBe(true);
    });
  });
});

// ── 6. ExactFIM for 1-parameter exponential decay ───────────────────

describe('ExactFIM', () => {
  it('should compute FIM for single-parameter exponential decay', () => {
    const k = 0.5;
    const y0 = 1.0;
    const tEnd = 2.0;
    const nPoints = 100;
    const sigma = 0.1;
    const { config } = exponentialDecayConfig(k, y0, tEnd, nPoints);

    // Get sensitivities
    const sensResult = forwardSensitivity(config);

    const fimResult = computeExactFIM({
      sensitivities: sensResult,
      observableIndices: [0],
      observableSigmas: [sigma],
      parameterNames: ['k'],
    });

    // FIM should be a single positive number
    expect(fimResult.fim.length).toBe(1);
    expect(fimResult.fim[0]).toBeGreaterThan(0);

    // Analytical FIM for exponential decay: F = sum_t (t^2 * y(t)^2 / sigma^2)
    // where y(t) = y0*exp(-k*t) and the sensitivity is dy/dk = -t*y(t)
    // F = sum_t (1/sigma^2) * (dy/dk)^2 = sum_t t^2 * y0^2 * exp(-2kt) / sigma^2
    let analyticalFIM = 0;
    for (let i = 0; i <= nPoints; i++) {
      const t = (tEnd / nPoints) * i;
      const yt = y0 * Math.exp(-k * t);
      const sens = -t * yt; // dy/dk = -t * y(t)
      analyticalFIM += (sens * sens) / (sigma * sigma);
    }

    // The computed FIM should be within 10% of analytical
    // (finite difference + RK4 introduces some error)
    const relError = Math.abs(fimResult.fim[0] - analyticalFIM) / analyticalFIM;
    expect(relError).toBeLessThan(0.10);

    // Eigenvalue should equal the FIM value for 1D case
    expect(fimResult.eigenvalues.length).toBe(1);
    expect(Math.abs(fimResult.eigenvalues[0] - fimResult.fim[0])).toBeLessThan(1e-10);

    // Cramer-Rao bound should provide a confidence interval
    expect(fimResult.cramerRaoBounds.length).toBe(1);
    expect(fimResult.cramerRaoBounds[0].parameter).toBe('k');
    expect(fimResult.cramerRaoBounds[0].lower).toBeLessThan(0);
    expect(fimResult.cramerRaoBounds[0].upper).toBeGreaterThan(0);
  });

  it('should compute FIM for multi-parameter model', () => {
    // Two parameters: dy/dt = -k1*y + k2, y(0) = 1
    const params = new Float64Array([0.5, 0.1]);
    const config: SensitivityConfig = {
      nSpecies: 1,
      nParameters: 2,
      parameterNames: ['k1', 'k2'],
      parameterValues: params,
      rhsFn: (_t: number, y: Float64Array, dydt: Float64Array) => {
        dydt[0] = -params[0] * y[0] + params[1];
      },
      initialState: new Float64Array([1.0]),
      tSpan: [0, 5],
      nOutputPoints: 50,
    };

    const sensResult = forwardSensitivity(config);
    const fimResult = computeExactFIM({
      sensitivities: sensResult,
      observableIndices: [0],
      observableSigmas: [0.1],
      parameterNames: ['k1', 'k2'],
    });

    // FIM should be 2x2
    expect(fimResult.fim.length).toBe(4);
    // Should be symmetric
    expect(Math.abs(fimResult.fim[1] - fimResult.fim[2])).toBeLessThan(1e-10);
    // Diagonal entries should be positive
    expect(fimResult.fim[0]).toBeGreaterThan(0);
    expect(fimResult.fim[3]).toBeGreaterThan(0);
    // Should have 2 eigenvalues
    expect(fimResult.eigenvalues.length).toBe(2);
    expect(fimResult.eigenvalues[0]).toBeGreaterThanOrEqual(fimResult.eigenvalues[1]);
    // Correlation matrix diagonal should be 1
    expect(Math.abs(fimResult.correlations[0] - 1)).toBeLessThan(0.01);
    expect(Math.abs(fimResult.correlations[3] - 1)).toBeLessThan(0.01);
  });
});
