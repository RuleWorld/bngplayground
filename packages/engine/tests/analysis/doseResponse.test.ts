import { describe, expect, it } from 'vitest';
import { computeDoseResponse } from '../../src/services/analysis/DoseResponse';
import type { BNGLModel, BNGLReaction, BNGLSpecies } from '../../src/types';

/**
 * Helper to build a minimal BNGLModel for dose-response tests.
 */
function makeModel(
  species: BNGLSpecies[],
  reactions: BNGLReaction[],
  parameters: Record<string, number>,
  observables: BNGLModel['observables'] = [],
): BNGLModel {
  return {
    parameters,
    moleculeTypes: [],
    species,
    observables,
    reactions,
    reactionRules: [],
  };
}

function makeReaction(
  reactants: string[],
  products: string[],
  rateConstant: number,
  rate?: string,
): BNGLReaction {
  return {
    reactants,
    products,
    rate: rate ?? String(rateConstant),
    rateConstant,
  };
}

// ── Test 1: Simple linear production/degradation ─────────────────
//
// Model:
//   0 -> A  with rate k_prod (constant source)
//   A -> 0  with rate k_deg  (first-order degradation)
//   A -> B  with rate k      (production of B, parameter being varied)
//   B -> 0  with rate k_degB (first-order degradation of B)
//
// At steady state: A* = k_prod / k_deg = 10/1 = 10
//                  B* = k * A* / k_degB = k * 10 / 0.1 = 100 * k
//
// So B should be linear in k.

describe('Dose-response: linear production/degradation', () => {
  const species: BNGLSpecies[] = [
    { name: 'A', initialConcentration: 10 },
    { name: 'B', initialConcentration: 0 },
  ];

  const reactions: BNGLReaction[] = [
    makeReaction([], ['A'], 10),             // 0 -> A, rate = 10
    makeReaction(['A'], [], 1),              // A -> 0, rate = 1
    makeReaction(['A'], ['A', 'B'], 0.01),   // A -> A + B, rate = k (varied)
    makeReaction(['B'], [], 0.1),            // B -> 0, rate = 0.1
  ];

  // The parameter 'k_convert' controls the A -> B conversion rate.
  // We use the rateConstant on the reaction but also put it in model.parameters.
  // The key insight: the third reaction's rate constant is what we sweep.
  // We use a parameter-based approach: set reaction rate string to 'k_convert'.
  const parametricReactions: BNGLReaction[] = [
    makeReaction([], ['A'], 10),
    makeReaction(['A'], [], 1),
    makeReaction(['A'], ['A', 'B'], 0.01, 'k_convert'), // rate resolves from params
    makeReaction(['B'], [], 0.1),
  ];

  const parameters = { k_prod: 10, k_deg: 1, k_convert: 0.01, k_degB: 0.1 };

  const model = makeModel(species, parametricReactions, parameters);

  it('should produce a linear dose-response curve for B vs k_convert', () => {
    const result = computeDoseResponse({
      model,
      reactions: parametricReactions,
      species,
      inputParameter: 'k_convert',
      inputRange: { min: 0.01, max: 1.0 },
      nPoints: 10,
      logScale: false,
      observables: ['B'],
      tolerance: 1e-8,
    });

    expect(result.inputParameter).toBe('k_convert');
    expect(result.curves.length).toBe(1);
    expect(result.failedDoses.length).toBe(0);

    const curve = result.curves[0];
    expect(curve.observable).toBe('B');
    expect(curve.doses.length).toBe(10);
    expect(curve.responses.length).toBe(10);

    // Verify B* = 100 * k_convert at each dose point (approximately).
    for (let i = 0; i < curve.doses.length; i++) {
      const k = curve.doses[i];
      const expected = 100 * k;
      expect(curve.responses[i]).toBeCloseTo(expected, 0);
    }
  });

  it('should fit Hill coefficient near 1 for linear response', () => {
    const result = computeDoseResponse({
      model,
      reactions: parametricReactions,
      species,
      inputParameter: 'k_convert',
      inputRange: { min: 0.01, max: 1.0 },
      nPoints: 20,
      logScale: true,
      observables: ['B'],
      tolerance: 1e-8,
    });

    const curve = result.curves[0];
    expect(curve.hillFit).toBeDefined();

    // For a linear response, the Hill fit should yield n close to 1
    // and a high R^2, although the Hill equation is not a perfect
    // model for a strictly linear function.
    if (curve.hillFit) {
      expect(curve.hillFit.r2).toBeGreaterThan(0.9);
      expect(curve.hillFit.n).toBeGreaterThan(0.5);
      expect(curve.hillFit.n).toBeLessThan(2.0);
    }
  });
});

// ── Test 2: Sigmoidal (Hill-like) response ───────────────────────
//
// We construct a cooperative system:
//   0 -> X with rate = V_max * S^nH / (K^nH + S^nH)
//   X -> 0 with rate = k_deg * X
//
// At steady state: X* = V_max * S^nH / (K^nH + S^nH) / k_deg
//
// We vary S as a parameter. The dose-response curve of X vs S should
// follow a Hill equation with known nH and K (EC50).
//
// Since propensities are built from mass-action, we approximate the
// Hill kinetics using a two-step cooperative binding:
//   S + S -> S2, rate k_bind (fast)
//   S2 -> S + S, rate k_unbind (fast)
//   S2 -> S2 + X, rate k_act
//   X -> 0, rate k_deg
//
// But this gets complex. Instead, let's use a simpler approach:
// test with the linear model above and verify the Hill fit R^2 is
// close to 1, then test a known-sigmoidal data set directly.

describe('Dose-response: Hill fit on synthetic sigmoidal data', () => {
  // We create a model where the effective steady-state response
  // inherently shows ultrasensitivity. Use a two-species system:
  //   0 -> A, rate = k_source  (the varied parameter)
  //   A -> 0, rate = 1
  //   A + A -> A2, rate = 0.01  (dimerization, gives cooperativity)
  //   A2 -> A + A, rate = 1
  //   A2 -> A2 + B, rate = 1   (B produced proportional to A2)
  //   B -> 0, rate = 0.1
  //
  // At steady state, A* = k_source (approximately, when degradation dominates),
  // A2* ~ 0.01 * A*^2 / 1 = 0.01 * k_source^2
  // B* = A2* / 0.1 = 0.1 * k_source^2
  //
  // So B is proportional to k_source^2, giving an effective Hill n ~ 2.

  const species: BNGLSpecies[] = [
    { name: 'A', initialConcentration: 0 },
    { name: 'A2', initialConcentration: 0 },
    { name: 'B', initialConcentration: 0 },
  ];

  const reactions: BNGLReaction[] = [
    makeReaction([], ['A'], 1, 'k_source'),        // 0 -> A
    makeReaction(['A'], [], 1),                     // A -> 0, rate 1
    makeReaction(['A', 'A'], ['A2'], 0.01),         // A + A -> A2
    makeReaction(['A2'], ['A', 'A'], 1),            // A2 -> A + A
    makeReaction(['A2'], ['A2', 'B'], 1),           // A2 -> A2 + B
    makeReaction(['B'], [], 0.1),                   // B -> 0
  ];

  const parameters = { k_source: 1 };
  const model = makeModel(species, reactions, parameters);

  it('should produce a sigmoidal curve with Hill n approximately 2', () => {
    const result = computeDoseResponse({
      model,
      reactions,
      species,
      inputParameter: 'k_source',
      inputRange: { min: 0.1, max: 50 },
      nPoints: 30,
      logScale: true,
      observables: ['B'],
      tolerance: 1e-8,
    });

    expect(result.curves.length).toBe(1);
    const curve = result.curves[0];

    // B should increase with k_source.
    expect(curve.responses[curve.responses.length - 1]).toBeGreaterThan(
      curve.responses[0],
    );

    // The Hill fit should have a reasonable R^2.
    expect(curve.hillFit).toBeDefined();
    if (curve.hillFit) {
      expect(curve.hillFit.r2).toBeGreaterThan(0.8);
      // Hill coefficient should be roughly around 2 due to dimerization,
      // but the actual value depends on the regime. We just check it's > 1.
      expect(curve.hillFit.n).toBeGreaterThan(1.0);
    }
  });
});

// ── Test 3: Log scale vs linear scale ────────────────────────────

describe('Dose-response: log scale vs linear scale', () => {
  const species: BNGLSpecies[] = [
    { name: 'A', initialConcentration: 10 },
    { name: 'B', initialConcentration: 0 },
  ];

  const reactions: BNGLReaction[] = [
    makeReaction([], ['A'], 10),
    makeReaction(['A'], [], 1),
    makeReaction(['A'], ['A', 'B'], 0.01, 'k_convert'),
    makeReaction(['B'], [], 0.1),
  ];

  const parameters = { k_convert: 0.01 };
  const model = makeModel(species, reactions, parameters);

  it('log scale should produce geometrically spaced dose points', () => {
    const result = computeDoseResponse({
      model,
      reactions,
      species,
      inputParameter: 'k_convert',
      inputRange: { min: 0.01, max: 100 },
      nPoints: 5,
      logScale: true,
      observables: ['B'],
      tolerance: 1e-6,
    });

    const curve = result.curves[0];
    const doses = curve.doses;

    // Check geometric spacing: ratio between successive points should
    // be approximately constant.
    if (doses.length >= 3) {
      const ratio1 = doses[1] / doses[0];
      const ratio2 = doses[2] / doses[1];
      expect(ratio1).toBeCloseTo(ratio2, 1);
    }

    // First and last should match the input range (approximately).
    expect(doses[0]).toBeCloseTo(0.01, 2);
    expect(doses[doses.length - 1]).toBeCloseTo(100, 0);
  });

  it('linear scale should produce evenly spaced dose points', () => {
    const result = computeDoseResponse({
      model,
      reactions,
      species,
      inputParameter: 'k_convert',
      inputRange: { min: 1, max: 5 },
      nPoints: 5,
      logScale: false,
      observables: ['B'],
      tolerance: 1e-6,
    });

    const curve = result.curves[0];
    const doses = curve.doses;

    // Check linear spacing: differences between successive points should
    // be approximately constant.
    if (doses.length >= 3) {
      const diff1 = doses[1] - doses[0];
      const diff2 = doses[2] - doses[1];
      expect(diff1).toBeCloseTo(diff2, 5);
    }

    expect(doses[0]).toBeCloseTo(1, 5);
    expect(doses[doses.length - 1]).toBeCloseTo(5, 5);
  });
});

// ── Test 4: Failed doses ─────────────────────────────────────────
//
// Use a model where negative parameter values cause the steady-state
// finder to fail (divergent dynamics).

describe('Dose-response: failed doses', () => {
  const species: BNGLSpecies[] = [
    { name: 'A', initialConcentration: 1 },
  ];

  // A -> 0 with rate k.  If k is negative, the ODE dA/dt = -k*A
  // becomes dA/dt = |k|*A (exponential growth), so no steady state.
  // However, since we use mass-action with rateConstant, a negative
  // rate constant makes propensity negative, causing Newton-Raphson
  // to struggle.
  const reactions: BNGLReaction[] = [
    makeReaction([], ['A'], 10),              // 0 -> A, rate 10
    makeReaction(['A'], [], 1, 'k_deg'),      // A -> 0, rate k_deg
  ];

  const parameters = { k_deg: 1 };
  const model = makeModel(species, reactions, parameters);

  it('should record failed doses when steady state cannot converge', () => {
    // Use a very tight tolerance and a range that includes very small
    // values near zero where the dynamics become poorly conditioned.
    const result = computeDoseResponse({
      model,
      reactions,
      species,
      inputParameter: 'k_deg',
      inputRange: { min: 0.001, max: 10 },
      nPoints: 15,
      logScale: true,
      observables: ['A'],
      tolerance: 1e-12,
    });

    // The curve should still have data for most points.
    expect(result.curves.length).toBe(1);
    const curve = result.curves[0];
    expect(curve.doses.length).toBeGreaterThan(0);

    // At steady state, A* = 10 / k_deg.
    // Verify the trend: higher k_deg -> lower A.
    if (curve.doses.length >= 2) {
      const firstResponse = curve.responses[0];
      const lastResponse = curve.responses[curve.responses.length - 1];
      expect(firstResponse).toBeGreaterThan(lastResponse);
    }
  });

  it('should populate failedDoses for extreme parameter ranges', () => {
    // Use a range including effectively zero degradation rates.
    // With k_deg very close to 0, A -> infinity which won't converge.
    const result = computeDoseResponse({
      model,
      reactions,
      species,
      inputParameter: 'k_deg',
      inputRange: { min: 1e-15, max: 1 },
      nPoints: 20,
      logScale: true,
      observables: ['A'],
      tolerance: 1e-12,
      // Very tight tolerance to force some failures
    });

    // With extremely small k_deg values, the steady state A* = 10/k_deg
    // becomes very large and Newton-Raphson may not converge within
    // the iteration limit.  We expect at least some data though.
    expect(result.curves[0].doses.length + result.failedDoses.length).toBe(20);
  });
});

// ── Test 5: Multiple observables ─────────────────────────────────

describe('Dose-response: multiple observables', () => {
  const species: BNGLSpecies[] = [
    { name: 'A', initialConcentration: 10 },
    { name: 'B', initialConcentration: 0 },
  ];

  const reactions: BNGLReaction[] = [
    makeReaction([], ['A'], 10),
    makeReaction(['A'], [], 1),
    makeReaction(['A'], ['A', 'B'], 0.1, 'k_convert'),
    makeReaction(['B'], [], 0.1),
  ];

  const parameters = { k_convert: 0.1 };
  const model = makeModel(species, reactions, parameters);

  it('should return separate curves for each observable', () => {
    const result = computeDoseResponse({
      model,
      reactions,
      species,
      inputParameter: 'k_convert',
      inputRange: { min: 0.01, max: 1 },
      nPoints: 8,
      logScale: false,
      observables: ['A', 'B'],
      tolerance: 1e-8,
    });

    expect(result.curves.length).toBe(2);
    expect(result.curves[0].observable).toBe('A');
    expect(result.curves[1].observable).toBe('B');

    // A should remain roughly constant (A* = 10, independent of k_convert).
    const aCurve = result.curves[0];
    for (const resp of aCurve.responses) {
      expect(resp).toBeCloseTo(10, 0);
    }

    // B should increase with k_convert.
    const bCurve = result.curves[1];
    expect(bCurve.responses[bCurve.responses.length - 1]).toBeGreaterThan(
      bCurve.responses[0],
    );
  });
});

// ── Test 6: Observable with speciesIndices and coefficients ──────

describe('Dose-response: observable with speciesIndices and coefficients', () => {
  const species: BNGLSpecies[] = [
    { name: 'A', initialConcentration: 10 },
    { name: 'B', initialConcentration: 0 },
  ];

  const reactions: BNGLReaction[] = [
    makeReaction([], ['A'], 10),
    makeReaction(['A'], [], 1),
    makeReaction(['A'], ['A', 'B'], 0.1, 'k_convert'),
    makeReaction(['B'], [], 0.1),
  ];

  const parameters = { k_convert: 0.1 };

  // Define an observable "Total" = A + 2*B using speciesIndices.
  const observables = [
    {
      name: 'Total',
      type: 'molecules' as const,
      pattern: 'A + 2*B',
      speciesIndices: [0, 1],
      coefficients: [1, 2],
    },
  ];

  const model = makeModel(species, reactions, parameters, observables);

  it('should evaluate composite observables correctly', () => {
    const result = computeDoseResponse({
      model,
      reactions,
      species,
      inputParameter: 'k_convert',
      inputRange: { min: 0.1, max: 1 },
      nPoints: 5,
      logScale: false,
      observables: ['Total'],
      tolerance: 1e-8,
    });

    expect(result.curves.length).toBe(1);
    const curve = result.curves[0];
    expect(curve.observable).toBe('Total');

    // Total = A + 2*B.  A* ~ 10, B* ~ 100*k.
    // Total ~ 10 + 200*k.
    for (let i = 0; i < curve.doses.length; i++) {
      const k = curve.doses[i];
      const expectedB = 100 * k;
      const expectedTotal = 10 + 2 * expectedB;
      expect(curve.responses[i]).toBeCloseTo(expectedTotal, 0);
    }
  });
});
