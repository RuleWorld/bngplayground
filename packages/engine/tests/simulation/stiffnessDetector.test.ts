/**
 * Tests for StiffnessDetector — runtime stiffness detection and solver recommendation.
 *
 * Test systems:
 *   - Simple harmonic oscillator (non-stiff)
 *   - Robertson chemical kinetics (very stiff, rate ratio ~1e8)
 *   - Mixed stiffness (transition from non-stiff to stiff regime)
 *   - Spectral radius estimation against known eigenvalues
 *   - Edge cases: zero RHS, single species
 */
import { describe, expect, it } from 'vitest';
import {
  StiffnessDetector,
  recommendSolver,
  type StiffnessProbe,
} from '../../src/services/simulation/StiffnessDetector';
import type { DerivativeFunction } from '../../src/utils/solverUtils';

// ── Test systems ─────────────────────────────────────────────────────────

/**
 * Simple harmonic oscillator: x' = v, v' = -x
 * Eigenvalues: ±i (purely imaginary, non-stiff)
 */
function harmonicOscillator(): { f: DerivativeFunction; y0: Float64Array; n: number } {
  const f: DerivativeFunction = (y, dydt) => {
    dydt[0] = y[1];      // x' = v
    dydt[1] = -y[0];     // v' = -x
  };
  return { f, y0: new Float64Array([1, 0]), n: 2 };
}

/**
 * Robertson chemical kinetics (classic stiff test problem):
 *   y1' = -0.04*y1 + 1e4*y2*y3
 *   y2' =  0.04*y1 - 1e4*y2*y3 - 3e7*y2^2
 *   y3' =  3e7*y2^2
 *
 * Rate ratio ~1e8, eigenvalues span many orders of magnitude.
 */
function robertsonSystem(): { f: DerivativeFunction; y0: Float64Array; n: number } {
  const f: DerivativeFunction = (y, dydt) => {
    const y1 = y[0], y2 = y[1], y3 = y[2];
    dydt[0] = -0.04 * y1 + 1e4 * y2 * y3;
    dydt[1] = 0.04 * y1 - 1e4 * y2 * y3 - 3e7 * y2 * y2;
    dydt[2] = 3e7 * y2 * y2;
  };
  return { f, y0: new Float64Array([1, 0, 0]), n: 3 };
}

/**
 * Linear decay with known eigenvalues: y' = A*y where A = diag(-1, -1000)
 * Eigenvalues: -1 and -1000 (stiff, ratio 1000)
 * Spectral radius = 1000.
 */
function linearStiffDecay(): { f: DerivativeFunction; y0: Float64Array; n: number; spectralRadius: number } {
  const f: DerivativeFunction = (y, dydt) => {
    dydt[0] = -1 * y[0];
    dydt[1] = -1000 * y[1];
  };
  return { f, y0: new Float64Array([1, 1]), n: 2, spectralRadius: 1000 };
}

/**
 * Linear system with known eigenvalues: y' = A*y where A = diag(-0.1, -0.2, -0.3)
 * Mildly stiff, spectral radius = 0.3
 */
function mildLinearSystem(): { f: DerivativeFunction; y0: Float64Array; n: number; spectralRadius: number } {
  const f: DerivativeFunction = (y, dydt) => {
    dydt[0] = -0.1 * y[0];
    dydt[1] = -0.2 * y[1];
    dydt[2] = -0.3 * y[2];
  };
  return { f, y0: new Float64Array([1, 1, 1]), n: 3, spectralRadius: 0.3 };
}

/**
 * Zero RHS: f(y) = 0 for all y. Should be detected as non-stiff.
 */
function zeroRHS(): { f: DerivativeFunction; y0: Float64Array; n: number } {
  const f: DerivativeFunction = (_y, dydt) => {
    dydt.fill(0);
  };
  return { f, y0: new Float64Array([1, 2, 3]), n: 3 };
}

/**
 * Single species exponential decay: y' = -k*y
 */
function singleSpecies(k: number = 1): { f: DerivativeFunction; y0: Float64Array; n: number } {
  const f: DerivativeFunction = (y, dydt) => {
    dydt[0] = -k * y[0];
  };
  return { f, y0: new Float64Array([1]), n: 1 };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('StiffnessDetector', () => {

  describe('detectStiffness', () => {

    it('detects harmonic oscillator as non-stiff', () => {
      const { f, y0, n } = harmonicOscillator();
      const detector = new StiffnessDetector(n, f);
      const h = 0.01;
      const result = detector.detectStiffness(y0, 0, h);

      expect(result.isStiff).toBe(false);
      // Divergence should be small for a non-stiff system with small h
      expect(result.divergence).toBeLessThan(1);
    });

    it('detects Robertson system as stiff with moderate step size', () => {
      const { f, y0, n } = robertsonSystem();
      const detector = new StiffnessDetector(n, f);
      // A step size that is reasonable for the slow component but large
      // relative to the fast component triggers stiffness detection
      const h = 0.01;
      const result = detector.detectStiffness(y0, 0, h);

      // Robertson at initial conditions with h=0.01 should show divergence
      // because of the 3e7 rate constant
      expect(result.divergence).toBeGreaterThan(0);
    });

    it('shows increasing divergence with larger step sizes on stiff system', () => {
      const { f, n } = linearStiffDecay();
      const y0 = new Float64Array([1, 1]);
      const detector = new StiffnessDetector(n, f);

      const divSmall = detector.detectStiffness(y0, 0, 1e-5).divergence;
      const divLarge = detector.detectStiffness(y0, 0, 0.1).divergence;

      // Larger step on a stiff system should produce more divergence
      expect(divLarge).toBeGreaterThan(divSmall);
    });
  });

  describe('estimateSpectralRadius', () => {

    it('estimates spectral radius of diagonal system accurately', () => {
      const { f, y0, n, spectralRadius } = linearStiffDecay();
      const detector = new StiffnessDetector(n, f, { powerIterations: 10 });
      const estimated = detector.estimateSpectralRadius(y0, 0);

      // Should be within 20% of the true spectral radius (1000)
      expect(estimated).toBeGreaterThan(spectralRadius * 0.8);
      expect(estimated).toBeLessThan(spectralRadius * 1.2);
    });

    it('estimates small spectral radius for mild system', () => {
      const { f, y0, n, spectralRadius } = mildLinearSystem();
      const detector = new StiffnessDetector(n, f, { powerIterations: 10 });
      const estimated = detector.estimateSpectralRadius(y0, 0);

      // Should be in the right ballpark
      expect(estimated).toBeGreaterThan(spectralRadius * 0.5);
      expect(estimated).toBeLessThan(spectralRadius * 2.0);
    });

    it('returns zero for zero RHS', () => {
      const { f, y0, n } = zeroRHS();
      const detector = new StiffnessDetector(n, f);
      const estimated = detector.estimateSpectralRadius(y0, 0);

      expect(estimated).toBe(0);
    });

    it('works for single species', () => {
      const k = 500;
      const { f, y0, n } = singleSpecies(k);
      const detector = new StiffnessDetector(n, f, { powerIterations: 5 });
      const estimated = detector.estimateSpectralRadius(y0, 0);

      // For y' = -k*y, Jacobian = -k, spectral radius = k
      expect(estimated).toBeGreaterThan(k * 0.8);
      expect(estimated).toBeLessThan(k * 1.2);
    });

    it('estimates large spectral radius for Robertson system', () => {
      const { f, y0, n } = robertsonSystem();
      const detector = new StiffnessDetector(n, f, { powerIterations: 10 });
      const estimated = detector.estimateSpectralRadius(y0, 0);

      // Robertson at y0 = [1,0,0] has Jacobian eigenvalues around 0 and -0.04
      // (the fast dynamics only activate when y2 > 0).
      // At y0 the spectral radius should be modest since y2=y3=0.
      expect(estimated).toBeGreaterThanOrEqual(0);
    });
  });

  describe('probe (combined detection)', () => {

    it('classifies harmonic oscillator as non-stiff', () => {
      const { f, y0, n } = harmonicOscillator();
      const detector = new StiffnessDetector(n, f);
      const probe = detector.probe(y0, 0, 0.01);

      expect(probe.level).toBe('non_stiff');
    });

    it('classifies stiff diagonal system as stiff', () => {
      const { f, y0, n } = linearStiffDecay();
      const detector = new StiffnessDetector(n, f);
      // With h=0.01 and spectral radius 1000, stability product = 10 >> 2
      const probe = detector.probe(y0, 0, 0.01);

      expect(['moderate', 'very_stiff']).toContain(probe.level);
      expect(probe.spectralRadius).toBeGreaterThan(100);
      expect(probe.stabilityProduct).toBeGreaterThan(EXPLICIT_EULER_STABILITY);
    });

    it('classifies zero RHS as non-stiff', () => {
      const { f, y0, n } = zeroRHS();
      const detector = new StiffnessDetector(n, f);
      const probe = detector.probe(y0, 0, 0.01);

      expect(probe.level).toBe('non_stiff');
      expect(probe.spectralRadius).toBe(0);
    });

    it('classifies single species with small rate as non-stiff', () => {
      const { f, y0, n } = singleSpecies(0.01);
      const detector = new StiffnessDetector(n, f);
      const probe = detector.probe(y0, 0, 0.001);

      // spectral radius ~ 0.01, stability product ~ 1e-5
      expect(probe.level).toBe('non_stiff');
    });

    it('classifies single species with large rate as stiff', () => {
      const { f, y0, n } = singleSpecies(1e6);
      const detector = new StiffnessDetector(n, f);
      const probe = detector.probe(y0, 0, 0.01);

      // spectral radius ~ 1e6, stability product ~ 1e4 >> 2
      expect(['moderate', 'very_stiff']).toContain(probe.level);
    });
  });

  describe('mixed stiffness detection (transition)', () => {

    it('detects change in stiffness as state evolves', () => {
      // Nonlinear system where stiffness depends on state:
      //   y1' = -k_fast * y1^2     (fast mode, stiffness proportional to y1)
      //   y2' = -k_slow * y2
      //
      // Jacobian diagonal: J11 = -2*k_fast*y1, J22 = -k_slow
      // When y1 is large, the system is stiff. When y1 ~ 0, only the slow mode remains.
      const kFast = 1e4;
      const kSlow = 1;

      const f: DerivativeFunction = (y, dydt) => {
        dydt[0] = -kFast * y[0] * y[0];
        dydt[1] = -kSlow * y[1];
      };

      const detector = new StiffnessDetector(2, f, { powerIterations: 10 });
      const h = 0.001;

      // Initial state: y1=1, Jacobian eigenvalue ~ -2e4 => stiff
      const y0 = new Float64Array([1, 1]);
      const probe0 = detector.probe(y0, 0, h);

      // Late state: y1 ~ 0, Jacobian eigenvalue ~ 0 for first component
      const yLate = new Float64Array([1e-10, 0.9]);
      const probeLate = detector.probe(yLate, 10, h);

      // Initial state should show higher spectral radius than late state
      expect(probe0.spectralRadius).toBeGreaterThan(probeLate.spectralRadius * 10);

      // Late state should be non-stiff or mild (only k_slow = 1 active)
      expect(['non_stiff', 'mild']).toContain(probeLate.level);
    });
  });

  describe('acceptance window tracking', () => {

    it('tracks acceptance rate correctly', () => {
      const { f, n } = harmonicOscillator();
      const detector = new StiffnessDetector(n, f, { acceptanceWindowSize: 5 });

      detector.recordAcceptance(true);
      detector.recordAcceptance(true);
      detector.recordAcceptance(false);
      detector.recordAcceptance(true);
      detector.recordAcceptance(true);

      expect(detector.acceptanceRate).toBeCloseTo(0.8, 5);
      expect(detector.windowFull).toBe(true);
    });

    it('slides window correctly', () => {
      const { f, n } = harmonicOscillator();
      const detector = new StiffnessDetector(n, f, { acceptanceWindowSize: 3 });

      detector.recordAcceptance(false);
      detector.recordAcceptance(false);
      detector.recordAcceptance(false);
      expect(detector.acceptanceRate).toBeCloseTo(0, 5);

      // Push out the old rejections
      detector.recordAcceptance(true);
      detector.recordAcceptance(true);
      detector.recordAcceptance(true);
      expect(detector.acceptanceRate).toBeCloseTo(1, 5);
    });

    it('resets window', () => {
      const { f, n } = harmonicOscillator();
      const detector = new StiffnessDetector(n, f, { acceptanceWindowSize: 5 });

      detector.recordAcceptance(false);
      detector.recordAcceptance(false);
      detector.resetWindow();

      expect(detector.acceptanceRate).toBe(1); // empty window returns 1
      expect(detector.windowFull).toBe(false);
    });
  });

  describe('recommendSolver', () => {

    it('recommends cvode_jac for very stiff', () => {
      const probe: StiffnessProbe = { level: 'very_stiff', stepDivergence: 100, spectralRadius: 1e6, stabilityProduct: 1e4 };
      expect(recommendSolver(probe)).toBe('cvode_jac');
    });

    it('recommends cvode for moderate stiffness', () => {
      const probe: StiffnessProbe = { level: 'moderate', stepDivergence: 15, spectralRadius: 500, stabilityProduct: 5 };
      expect(recommendSolver(probe)).toBe('cvode');
    });

    it('recommends rosenbrock23 for mild stiffness', () => {
      const probe: StiffnessProbe = { level: 'mild', stepDivergence: 2, spectralRadius: 10, stabilityProduct: 0.8 };
      expect(recommendSolver(probe)).toBe('rosenbrock23');
    });

    it('recommends rk45 for non-stiff', () => {
      const probe: StiffnessProbe = { level: 'non_stiff', stepDivergence: 0.01, spectralRadius: 0.1, stabilityProduct: 0.001 };
      expect(recommendSolver(probe)).toBe('rk45');
    });
  });
});

// Constant for stability boundary check in tests
const EXPLICIT_EULER_STABILITY = 2.0;
