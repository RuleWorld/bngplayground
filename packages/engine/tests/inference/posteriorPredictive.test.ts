import { describe, it, expect } from 'vitest';
import {
  posteriorPredictive,
  type PosteriorPredictiveConfig,
} from '../../src/services/inference/PosteriorPredictive';
import type { ABCSMCResult } from '../../src/services/inference/ABCSMC';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Build an ABCSMCResult with the given particles.
 * Fills in required fields with sensible defaults.
 */
function makeResult(
  particles: Array<{ params: Record<string, number>; distance: number; weight: number }>,
): ABCSMCResult {
  const paramNames = Object.keys(particles[0].params);
  const posteriorSummary: ABCSMCResult['posteriorSummary'] = {};
  const marginals: ABCSMCResult['marginals'] = {};
  const posteriorCorrelations: ABCSMCResult['posteriorCorrelations'] = {};

  for (const name of paramNames) {
    const vals = particles.map((p) => p.params[name]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    posteriorSummary[name] = { mean, median: mean, std: 0, ci95: [mean, mean], mode: mean };
    marginals[name] = vals;
    posteriorCorrelations[name] = {};
    for (const other of paramNames) {
      posteriorCorrelations[name][other] = name === other ? 1 : 0;
    }
  }

  return {
    particles,
    posteriorSummary,
    populations: [{ tolerance: 1, acceptanceRate: 0.5, nSimulations: particles.length, effectiveSampleSize: particles.length }],
    totalSimulations: particles.length,
    finalTolerance: 1,
    converged: true,
    marginals,
    posteriorCorrelations,
  };
}

/**
 * Mock simulate function.
 * Parses k from BNGL code and returns exponential decay A = 100 * exp(-k * t).
 */
const mockSimulate = async (
  code: string,
  options: { method: string; t_end: number; n_steps: number },
) => {
  const match = code.match(/k\s+([\d.eE+-]+)/);
  const k = match ? parseFloat(match[1]) : 0.1;

  if (isNaN(k) || k < 0) {
    throw new Error(`Invalid k value: ${k}`);
  }

  const dt = options.t_end / options.n_steps;
  const data: Array<Record<string, number>> = [];
  for (let i = 0; i <= options.n_steps; i++) {
    const t = i * dt;
    data.push({ time: t, A: 100 * Math.exp(-k * t) });
  }
  return { headers: ['time', 'A'], data };
};

/** Simple BNGL-like code template */
const bnglTemplate = (k: number) =>
  `begin parameters\n  k ${k}\nend parameters\n`;

// ── Tests ────────────────────────────────────────────────────────────

describe('posteriorPredictive', () => {
  it('uniform posterior (zero uncertainty) produces near-zero-width bands', async () => {
    const kTrue = 0.1;
    const nParticles = 50;
    const particles = Array.from({ length: nParticles }, () => ({
      params: { k: kTrue },
      distance: 0,
      weight: 1 / nParticles,
    }));
    const posterior = makeResult(particles);

    const result = await posteriorPredictive({
      posterior,
      code: bnglTemplate(kTrue),
      nSamples: 50,
      t_end: 10,
      n_steps: 20,
      credibleLevels: [0.5, 0.9, 0.95],
      simulate: mockSimulate,
      seed: 42,
    });

    expect(result.nSuccessful).toBe(50);
    expect(result.nFailed).toBe(0);
    expect(result.times.length).toBe(21);

    const obsA = result.observables['A'];
    expect(obsA).toBeDefined();

    // All bands should be essentially zero-width since every particle is identical
    for (const band of obsA.bands) {
      for (let t = 0; t < result.times.length; t++) {
        expect(band.upper[t] - band.lower[t]).toBeCloseTo(0, 8);
      }
    }

    // Mean and median should equal the deterministic trajectory
    for (let t = 0; t < result.times.length; t++) {
      const expected = 100 * Math.exp(-kTrue * result.times[t]);
      expect(obsA.mean[t]).toBeCloseTo(expected, 6);
      expect(obsA.median[t]).toBeCloseTo(expected, 6);
    }
  });

  it('spread posterior produces 95% band containing extreme trajectories', async () => {
    // Particles with k uniformly spread in [0.5, 2.0]
    const nParticles = 100;
    const particles = Array.from({ length: nParticles }, (_, i) => {
      const k = 0.5 + (1.5 * i) / (nParticles - 1);
      return { params: { k }, distance: 0.1, weight: 1 / nParticles };
    });
    const posterior = makeResult(particles);

    const result = await posteriorPredictive({
      posterior,
      code: bnglTemplate(1.0),
      nSamples: 200,
      t_end: 5,
      n_steps: 50,
      credibleLevels: [0.5, 0.9, 0.95],
      simulate: mockSimulate,
      seed: 7,
    });

    expect(result.nSuccessful).toBe(200);

    const obsA = result.observables['A'];
    const band95 = obsA.bands.find((b) => b.level === 0.95)!;
    expect(band95).toBeDefined();

    // At t > 0, the 95% band should have non-trivial width
    // because k ranges from 0.5 to 2.0, producing very different decays
    const midIdx = 25; // t = 2.5
    const width = band95.upper[midIdx] - band95.lower[midIdx];
    expect(width).toBeGreaterThan(1);

    // The 95% band should contain the trajectory for k_min and k_max
    // at intermediate times
    const tMid = result.times[midIdx];
    const yMin = 100 * Math.exp(-0.5 * tMid); // slowest decay
    const yMax = 100 * Math.exp(-2.0 * tMid); // fastest decay

    // The 95% band lower should be <= the fastest-decay trajectory
    // and the upper should be >= the slowest-decay trajectory
    // (with some tolerance for resampling variability)
    expect(band95.lower[midIdx]).toBeLessThanOrEqual(yMin);
    expect(band95.upper[midIdx]).toBeGreaterThanOrEqual(yMax);
  });

  it('failed simulations are counted and result remains valid', async () => {
    // Half the particles have negative k, which our mock rejects
    const particles = [
      ...Array.from({ length: 25 }, () => ({
        params: { k: 0.5 },
        distance: 0.1,
        weight: 1,
      })),
      ...Array.from({ length: 25 }, () => ({
        params: { k: -1 },
        distance: 0.1,
        weight: 1,
      })),
    ];
    const posterior = makeResult(particles);

    const failingSimulate = async (
      code: string,
      options: { method: string; t_end: number; n_steps: number },
    ) => {
      const match = code.match(/k\s+([-\d.eE+]+)/);
      const k = match ? parseFloat(match[1]) : 0.1;
      if (k < 0) throw new Error('Negative rate constant');
      return mockSimulate(code, options);
    };

    const result = await posteriorPredictive({
      posterior,
      code: bnglTemplate(0.5),
      nSamples: 50,
      t_end: 5,
      n_steps: 10,
      simulate: failingSimulate,
      seed: 99,
    });

    expect(result.nFailed).toBeGreaterThanOrEqual(1);
    expect(result.nSuccessful).toBeGreaterThanOrEqual(1);
    expect(result.nSuccessful + result.nFailed).toBe(50);

    // Result should still have valid observables from successful runs
    const obsA = result.observables['A'];
    expect(obsA).toBeDefined();
    expect(obsA.mean.length).toBeGreaterThan(0);
  });

  it('weighted resampling: heavy particle dominates the mean', async () => {
    // Particle 0 has weight 0.99; the rest share 0.01
    const nOther = 9;
    const heavyK = 0.1;
    const otherK = 2.0;
    const particles = [
      { params: { k: heavyK }, distance: 0.01, weight: 0.99 },
      ...Array.from({ length: nOther }, () => ({
        params: { k: otherK },
        distance: 0.5,
        weight: 0.01 / nOther,
      })),
    ];
    const posterior = makeResult(particles);

    const result = await posteriorPredictive({
      posterior,
      code: bnglTemplate(heavyK),
      nSamples: 200,
      t_end: 5,
      n_steps: 20,
      simulate: mockSimulate,
      seed: 1234,
    });

    expect(result.nSuccessful).toBe(200);

    const obsA = result.observables['A'];

    // Mean trajectory should be very close to the heavy particle's trajectory
    for (let t = 0; t < result.times.length; t++) {
      const expected = 100 * Math.exp(-heavyK * result.times[t]);
      // Allow 5% relative tolerance since ~99% of samples should come from particle 0
      const relError = Math.abs(obsA.mean[t] - expected) / Math.max(expected, 1e-12);
      expect(relError).toBeLessThan(0.05);
    }
  });

  it('cancellation via signal stops early', async () => {
    const nParticles = 50;
    const particles = Array.from({ length: nParticles }, () => ({
      params: { k: 0.1 },
      distance: 0,
      weight: 1 / nParticles,
    }));
    const posterior = makeResult(particles);

    let callCount = 0;
    const signal = { cancelled: false };

    const countingSimulate = async (
      code: string,
      options: { method: string; t_end: number; n_steps: number },
    ) => {
      callCount++;
      if (callCount >= 5) {
        signal.cancelled = true;
      }
      return mockSimulate(code, options);
    };

    const result = await posteriorPredictive({
      posterior,
      code: bnglTemplate(0.1),
      nSamples: 200,
      t_end: 5,
      n_steps: 10,
      simulate: countingSimulate,
      signal,
      seed: 42,
    });

    // Should have stopped well before 200 simulations
    expect(result.nSuccessful).toBeLessThan(200);
    expect(result.nSuccessful).toBeGreaterThanOrEqual(5);
  });

  it('keepTrajectories option returns individual trajectories', async () => {
    const nParticles = 10;
    const particles = Array.from({ length: nParticles }, (_, i) => ({
      params: { k: 0.1 + i * 0.1 },
      distance: 0,
      weight: 1 / nParticles,
    }));
    const posterior = makeResult(particles);

    const result = await posteriorPredictive({
      posterior,
      code: bnglTemplate(0.1),
      nSamples: 20,
      t_end: 5,
      n_steps: 10,
      simulate: mockSimulate,
      seed: 42,
      keepTrajectories: true,
    });

    const obsA = result.observables['A'];
    expect(obsA.trajectories).toBeDefined();
    expect(obsA.trajectories!.length).toBe(result.nSuccessful);
    expect(obsA.trajectories![0].length).toBe(11); // n_steps + 1
  });
});
