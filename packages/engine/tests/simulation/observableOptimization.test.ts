import { describe, expect, it } from 'vitest';
import {
  buildCSRObservableMatrix,
  evaluateObservablesCSR,
  shouldUseCSRObservables,
  CSR_OBSERVABLE_THRESHOLD,
  type ObservableDefinition,
} from '../../src/services/simulation/CSRObservableEvaluator';
import { JITCompiler, type JITObservableDefinition } from '../../src/services/analysis/JITCompiler';

// ---------- Helpers ----------

/**
 * Dense (interpreted) observable evaluation -- reference implementation.
 * Matches the fallback path in SimulationLoop.ts.
 */
function denseObservableEval(
  observables: ObservableDefinition[],
  y: Float64Array,
  useAmounts: boolean,
  defaultVolumes?: Float64Array
): Float64Array {
  const output = new Float64Array(observables.length);
  for (let i = 0; i < observables.length; i++) {
    const obs = observables[i];
    let sum = 0;
    for (let j = 0; j < obs.indices.length; j++) {
      const idx = obs.indices[j] as number;
      const coeff = obs.coefficients[j] as number;
      if (useAmounts) {
        const vol = obs.volumes && j < obs.volumes.length
          ? (obs.volumes[j] as number)
          : (defaultVolumes ? defaultVolumes[idx] : 1.0);
        sum += coeff * (y[idx] * vol);
      } else {
        sum += coeff * y[idx];
      }
    }
    output[i] = sum;
  }
  return output;
}

/**
 * Generate a synthetic set of observables for testing.
 * Each observable references `termsPerObs` random species with random coefficients.
 */
function generateObservables(
  numObs: number,
  numSpecies: number,
  termsPerObs: number,
  seed = 42
): ObservableDefinition[] {
  // Simple seeded PRNG (xorshift32)
  let state = seed;
  const rand = () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };

  const observables: ObservableDefinition[] = [];
  for (let i = 0; i < numObs; i++) {
    const actualTerms = Math.min(termsPerObs, numSpecies);
    // Pick distinct random species indices
    const usedIndices = new Set<number>();
    const indices: number[] = [];
    const coefficients: number[] = [];
    for (let j = 0; j < actualTerms; j++) {
      let idx: number;
      do {
        idx = Math.floor(rand() * numSpecies);
      } while (usedIndices.has(idx));
      usedIndices.add(idx);
      indices.push(idx);
      // Coefficients in range [0.1, 5.0]
      coefficients.push(0.1 + rand() * 4.9);
    }
    observables.push({
      name: `Obs_${i}`,
      indices,
      coefficients,
    });
  }
  return observables;
}

/**
 * Generate a random species state vector.
 */
function generateState(numSpecies: number, seed = 123): Float64Array {
  let state = seed;
  const rand = () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
  const y = new Float64Array(numSpecies);
  for (let i = 0; i < numSpecies; i++) {
    y[i] = rand() * 100;
  }
  return y;
}

// ---------- Tests ----------

describe('CSRObservableEvaluator', () => {
  it('should match dense evaluation for small model (concentration mode)', () => {
    const numSpecies = 50;
    const observables = generateObservables(10, numSpecies, 5);
    const y = generateState(numSpecies);

    const matrix = buildCSRObservableMatrix(observables, numSpecies, false);
    const csrOutput = new Float64Array(observables.length);
    evaluateObservablesCSR(matrix, y, csrOutput);

    const denseOutput = denseObservableEval(observables, y, false);

    for (let i = 0; i < observables.length; i++) {
      expect(csrOutput[i]).toBeCloseTo(denseOutput[i], 10);
    }
  });

  it('should match dense evaluation for large model (200 observables)', () => {
    const numSpecies = 500;
    const observables = generateObservables(200, numSpecies, 15);
    const y = generateState(numSpecies);

    const matrix = buildCSRObservableMatrix(observables, numSpecies, false);
    const csrOutput = new Float64Array(observables.length);
    evaluateObservablesCSR(matrix, y, csrOutput);

    const denseOutput = denseObservableEval(observables, y, false);

    for (let i = 0; i < observables.length; i++) {
      expect(csrOutput[i]).toBeCloseTo(denseOutput[i], 10);
    }
  });

  it('should match dense evaluation with amount-based volumes', () => {
    const numSpecies = 100;
    const observables = generateObservables(30, numSpecies, 8);
    const y = generateState(numSpecies);
    const volumes = new Float64Array(numSpecies);
    for (let i = 0; i < numSpecies; i++) volumes[i] = 0.5 + Math.random();

    const matrix = buildCSRObservableMatrix(observables, numSpecies, true, volumes);
    const csrOutput = new Float64Array(observables.length);
    evaluateObservablesCSR(matrix, y, csrOutput);

    const denseOutput = denseObservableEval(observables, y, true, volumes);

    for (let i = 0; i < observables.length; i++) {
      expect(csrOutput[i]).toBeCloseTo(denseOutput[i], 10);
    }
  });

  it('should handle zero-coefficient observables', () => {
    const numSpecies = 20;
    const observables: ObservableDefinition[] = [
      { name: 'ZeroObs', indices: [0, 1, 2], coefficients: [0, 0, 0] },
      { name: 'NonZeroObs', indices: [3], coefficients: [2.5] },
    ];
    const y = generateState(numSpecies);

    const matrix = buildCSRObservableMatrix(observables, numSpecies, false);
    const output = new Float64Array(observables.length);
    evaluateObservablesCSR(matrix, y, output);

    // Zero-coeff observable should still be zero (0 * y[i] = 0)
    expect(output[0]).toBeCloseTo(0, 10);
    expect(output[1]).toBeCloseTo(2.5 * y[3], 10);
  });

  it('should handle single-species observables', () => {
    const numSpecies = 10;
    const observables: ObservableDefinition[] = [
      { name: 'SingleA', indices: [0], coefficients: [1] },
      { name: 'SingleB', indices: [5], coefficients: [3.14] },
    ];
    const y = generateState(numSpecies);

    const matrix = buildCSRObservableMatrix(observables, numSpecies, false);
    const output = new Float64Array(observables.length);
    evaluateObservablesCSR(matrix, y, output);

    expect(output[0]).toBeCloseTo(y[0], 10);
    expect(output[1]).toBeCloseTo(3.14 * y[5], 10);
  });

  it('should handle empty observable list', () => {
    const numSpecies = 10;
    const matrix = buildCSRObservableMatrix([], numSpecies, false);
    const output = new Float64Array(0);
    evaluateObservablesCSR(matrix, generateState(numSpecies), output);
    expect(matrix.nnz).toBe(0);
    expect(matrix.numObservables).toBe(0);
  });

  it('shouldUseCSRObservables returns correct threshold behavior', () => {
    expect(shouldUseCSRObservables(10)).toBe(false);
    expect(shouldUseCSRObservables(50)).toBe(false);
    expect(shouldUseCSRObservables(99)).toBe(false);
    expect(shouldUseCSRObservables(100)).toBe(true);
    expect(shouldUseCSRObservables(200)).toBe(true);
    expect(shouldUseCSRObservables(1000)).toBe(true);
  });

  it('CSR_OBSERVABLE_THRESHOLD is 100', () => {
    expect(CSR_OBSERVABLE_THRESHOLD).toBe(100);
  });
});

describe('JITCompiler chunked observables', () => {
  const compiler = new JITCompiler();

  it('chunked JIT matches unchunked for small model (< chunk size)', () => {
    const numSpecies = 50;
    const observables = generateObservables(20, numSpecies, 5);
    const y = generateState(numSpecies);

    const compiled = compiler.compileObservables(
      observables as JITObservableDefinition[],
      numSpecies,
      false
    );

    const jitOutput = new Float64Array(observables.length);
    compiled.evaluate(y, jitOutput);

    const denseOutput = denseObservableEval(observables, y, false);

    for (let i = 0; i < observables.length; i++) {
      expect(jitOutput[i]).toBeCloseTo(denseOutput[i], 10);
    }
  });

  it('chunked JIT matches dense for 200 observables (exceeds chunk size)', () => {
    const numSpecies = 500;
    const numObs = 200;
    const observables = generateObservables(numObs, numSpecies, 15);
    const y = generateState(numSpecies);

    // Force a new compiler to avoid cache
    const freshCompiler = new JITCompiler();
    const compiled = freshCompiler.compileObservables(
      observables as JITObservableDefinition[],
      numSpecies,
      false
    );

    const jitOutput = new Float64Array(numObs);
    compiled.evaluate(y, jitOutput);

    const denseOutput = denseObservableEval(observables, y, false);

    for (let i = 0; i < numObs; i++) {
      expect(jitOutput[i]).toBeCloseTo(denseOutput[i], 10);
    }
  });

  it('chunked JIT matches dense for exactly one chunk boundary (64 observables)', () => {
    const numSpecies = 200;
    const numObs = 64; // Exactly the chunk size
    const observables = generateObservables(numObs, numSpecies, 10);
    const y = generateState(numSpecies);

    const freshCompiler = new JITCompiler();
    const compiled = freshCompiler.compileObservables(
      observables as JITObservableDefinition[],
      numSpecies,
      false
    );

    const jitOutput = new Float64Array(numObs);
    compiled.evaluate(y, jitOutput);

    const denseOutput = denseObservableEval(observables, y, false);

    for (let i = 0; i < numObs; i++) {
      expect(jitOutput[i]).toBeCloseTo(denseOutput[i], 10);
    }
  });

  it('chunked JIT matches dense for 65 observables (just over chunk size)', () => {
    const numSpecies = 200;
    const numObs = 65; // One over the chunk size -- triggers chunking
    const observables = generateObservables(numObs, numSpecies, 10);
    const y = generateState(numSpecies);

    const freshCompiler = new JITCompiler();
    const compiled = freshCompiler.compileObservables(
      observables as JITObservableDefinition[],
      numSpecies,
      false
    );

    const jitOutput = new Float64Array(numObs);
    compiled.evaluate(y, jitOutput);

    const denseOutput = denseObservableEval(observables, y, false);

    for (let i = 0; i < numObs; i++) {
      expect(jitOutput[i]).toBeCloseTo(denseOutput[i], 10);
    }
  });

  it('chunked JIT handles amount-based mode with volumes', () => {
    const numSpecies = 100;
    const numObs = 130; // Requires chunking
    const observables = generateObservables(numObs, numSpecies, 8);
    const y = generateState(numSpecies);
    const volumes = new Float64Array(numSpecies);
    for (let i = 0; i < numSpecies; i++) volumes[i] = 1.0; // Unit volumes for simple comparison

    const freshCompiler = new JITCompiler();
    const compiled = freshCompiler.compileObservables(
      observables as JITObservableDefinition[],
      numSpecies,
      true // useAmounts
    );

    const jitOutput = new Float64Array(numObs);
    compiled.evaluate(y, jitOutput, volumes);

    const denseOutput = denseObservableEval(observables, y, true, volumes);

    for (let i = 0; i < numObs; i++) {
      expect(jitOutput[i]).toBeCloseTo(denseOutput[i], 10);
    }
  });

  it('chunk size constant is 64', () => {
    expect(JITCompiler.OBSERVABLE_CHUNK_SIZE).toBe(64);
  });

  it('chunked JIT handles zero-coefficient and single-species observables', () => {
    const numSpecies = 50;
    const observables: ObservableDefinition[] = [
      { name: 'Zero1', indices: [0, 1], coefficients: [0, 0] },
      { name: 'Single', indices: [10], coefficients: [1] },
      { name: 'Multi', indices: [2, 3, 4], coefficients: [1.5, 2.5, 0.5] },
    ];
    const y = generateState(numSpecies);

    const freshCompiler = new JITCompiler();
    const compiled = freshCompiler.compileObservables(
      observables as JITObservableDefinition[],
      numSpecies,
      false
    );

    const jitOutput = new Float64Array(observables.length);
    compiled.evaluate(y, jitOutput);

    const denseOutput = denseObservableEval(observables, y, false);

    for (let i = 0; i < observables.length; i++) {
      expect(jitOutput[i]).toBeCloseTo(denseOutput[i], 10);
    }
  });
});

describe('CSR vs chunked JIT cross-validation', () => {
  it('CSR and chunked JIT produce identical results for 200 observables', () => {
    const numSpecies = 500;
    const numObs = 200;
    const observables = generateObservables(numObs, numSpecies, 15);
    const y = generateState(numSpecies);

    // CSR path
    const matrix = buildCSRObservableMatrix(observables, numSpecies, false);
    const csrOutput = new Float64Array(numObs);
    evaluateObservablesCSR(matrix, y, csrOutput);

    // JIT path
    const compiler = new JITCompiler();
    const compiled = compiler.compileObservables(
      observables as JITObservableDefinition[],
      numSpecies,
      false
    );
    const jitOutput = new Float64Array(numObs);
    compiled.evaluate(y, jitOutput);

    for (let i = 0; i < numObs; i++) {
      expect(csrOutput[i]).toBeCloseTo(jitOutput[i], 10);
    }
  });
});

describe('Observable evaluation benchmarks', () => {
  const numSpecies = 500;
  const numObs = 200;
  const termsPerObs = 15;
  const iterations = 10000;
  const observables = generateObservables(numObs, numSpecies, termsPerObs);
  const y = generateState(numSpecies);

  // Pre-build all evaluators
  const csrMatrix = buildCSRObservableMatrix(observables, numSpecies, false);
  const csrOutput = new Float64Array(numObs);

  const compiler = new JITCompiler();
  const compiledChunked = compiler.compileObservables(
    observables as JITObservableDefinition[],
    numSpecies,
    false
  );
  const jitOutput = new Float64Array(numObs);

  it(`benchmark: dense vs chunked JIT vs CSR (${numObs} obs, ${termsPerObs} terms, ${iterations} iterations)`, () => {
    // Warm up
    for (let w = 0; w < 100; w++) {
      denseObservableEval(observables, y, false);
      compiledChunked.evaluate(y, jitOutput);
      evaluateObservablesCSR(csrMatrix, y, csrOutput);
    }

    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) {
      denseObservableEval(observables, y, false);
    }
    const denseMs = performance.now() - t0;

    const t1 = performance.now();
    for (let i = 0; i < iterations; i++) {
      compiledChunked.evaluate(y, jitOutput);
    }
    const jitMs = performance.now() - t1;

    const t2 = performance.now();
    for (let i = 0; i < iterations; i++) {
      evaluateObservablesCSR(csrMatrix, y, csrOutput);
    }
    const csrMs = performance.now() - t2;

    console.log(`\n  Observable Evaluation Benchmark (${numObs} obs, ${termsPerObs} terms, ${iterations} iters):`);
    console.log(`    Dense interpreted: ${denseMs.toFixed(1)} ms (${(denseMs / iterations * 1000).toFixed(1)} us/eval)`);
    console.log(`    Chunked JIT:      ${jitMs.toFixed(1)} ms (${(jitMs / iterations * 1000).toFixed(1)} us/eval)`);
    console.log(`    CSR sparse:       ${csrMs.toFixed(1)} ms (${(csrMs / iterations * 1000).toFixed(1)} us/eval)`);
    console.log(`    Speedup JIT/Dense:  ${(denseMs / jitMs).toFixed(2)}x`);
    console.log(`    Speedup CSR/Dense:  ${(denseMs / csrMs).toFixed(2)}x`);

    // Sanity: all methods should complete without error
    expect(denseMs).toBeGreaterThan(0);
    expect(jitMs).toBeGreaterThan(0);
    expect(csrMs).toBeGreaterThan(0);
  });
});
