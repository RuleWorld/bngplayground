import { describe, it, expect } from 'vitest';

import {
  generatePKModel,
  getDefaultPKParameters,
  type PKModelConfig,
} from '../../src/services/pkpd/PKTemplates';

import {
  generateDosingSchedule,
  dosingToSimulationPhases,
  type StandardDosingConfig,
} from '../../src/services/pkpd/DosingSchedule';

import {
  trapezoidalAUC,
  estimateTerminalHalfLife,
  computePKMetrics,
  nonCompartmentalAnalysis,
} from '../../src/services/pkpd/PKMetrics';

import {
  generatePopulation,
  type VirtualPopulationConfig,
} from '../../src/services/pkpd/VirtualPopulation';

import type { SimulationResults } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers: generate analytical one-compartment IV concentration-time data
// ---------------------------------------------------------------------------

function oneCompartmentIVAnalytical(
  dose: number,
  V: number,
  CL: number,
  times: number[],
): SimulationResults {
  const ke = CL / V;
  const C0 = dose / V;
  const data = times.map((t) => ({
    time: t,
    C_plasma: C0 * Math.exp(-ke * t),
  }));
  return { headers: ['time', 'C_plasma'], data };
}

/**
 * Bateman equation for one-compartment oral:
 * C(t) = (F * Dose * ka) / (V * (ka - ke)) * (exp(-ke*t) - exp(-ka*t))
 */
function oneCompartmentOralAnalytical(
  dose: number,
  V: number,
  CL: number,
  ka: number,
  F: number,
  times: number[],
): SimulationResults {
  const ke = CL / V;
  const coeff = (F * dose * ka) / (V * (ka - ke));
  const data = times.map((t) => ({
    time: t,
    C_plasma: coeff * (Math.exp(-ke * t) - Math.exp(-ka * t)),
  }));
  return { headers: ['time', 'C_plasma'], data };
}

// ===================================================================
// Test 1: One-compartment IV analytical match
// ===================================================================

describe('One-compartment IV', () => {
  it('C(t) = (Dose/V)*exp(-ke*t), simulation metrics match within 0.1%', () => {
    const dose = 100;
    const V = 3.0;
    const CL = 0.5;
    const ke = CL / V;
    const times = Array.from({ length: 1001 }, (_, i) => (i / 1000) * 48); // 0 to 48 hr

    const results = oneCompartmentIVAnalytical(dose, V, CL, times);

    // Analytical Cmax = Dose/V at t=0
    const analyticalCmax = dose / V;
    // Analytical AUC(0-inf) = Dose / CL
    const analyticalAUC = dose / CL;
    // Analytical t1/2 = ln(2) / ke
    const analyticalHalfLife = Math.LN2 / ke;

    const metrics = computePKMetrics(results, 'C_plasma', dose);

    // Cmax within 0.1%
    expect(Math.abs(metrics.Cmax - analyticalCmax) / analyticalCmax).toBeLessThan(0.001);
    expect(metrics.Tmax).toBe(0);

    // Half-life within 0.1%
    expect(Math.abs(metrics.halfLife - analyticalHalfLife) / analyticalHalfLife).toBeLessThan(0.001);

    // AUC(0-inf) within 1% (trapezoidal + extrapolation introduces small error)
    expect(Math.abs(metrics.AUC_0_inf - analyticalAUC) / analyticalAUC).toBeLessThan(0.01);

    // Clearance within 1%
    expect(Math.abs(metrics.clearance - CL) / CL).toBeLessThan(0.01);
  });
});

// ===================================================================
// Test 2: Oral absorption – Cmax and Tmax via Bateman equation
// ===================================================================

describe('One-compartment oral (Bateman equation)', () => {
  it('Cmax and Tmax match analytical values', () => {
    const dose = 100;
    const V = 3.0;
    const CL = 0.5;
    const ka = 1.0;
    const F = 1.0;
    const ke = CL / V;

    // Analytical Tmax = ln(ka/ke) / (ka - ke)
    const analyticalTmax = Math.log(ka / ke) / (ka - ke);
    // Analytical Cmax at Tmax
    const coeff = (F * dose * ka) / (V * (ka - ke));
    const analyticalCmax = coeff * (Math.exp(-ke * analyticalTmax) - Math.exp(-ka * analyticalTmax));

    const times = Array.from({ length: 2001 }, (_, i) => (i / 2000) * 48);
    const results = oneCompartmentOralAnalytical(dose, V, CL, ka, F, times);
    const metrics = computePKMetrics(results, 'C_plasma', dose);

    // Tmax within 5% (limited by time resolution)
    expect(Math.abs(metrics.Tmax - analyticalTmax) / analyticalTmax).toBeLessThan(0.05);

    // Cmax within 1%
    expect(Math.abs(metrics.Cmax - analyticalCmax) / analyticalCmax).toBeLessThan(0.01);
  });
});

// ===================================================================
// Test 3: TMDD model – nonlinear PK (dose-dependent clearance)
// ===================================================================

describe('TMDD model', () => {
  it('generates valid BNGL with drug-target binding rules', () => {
    const config: PKModelConfig = {
      type: 'tmdd',
      drugName: 'mAb',
      targetName: 'Receptor',
      route: 'iv_bolus',
    };
    const result = generatePKModel(config);

    // Must contain binding rule
    expect(result.bnglCode).toContain('mAb(r) + ');
    expect(result.bnglCode).toContain('Receptor(d,state~free)');
    expect(result.bnglCode).toContain('kon');
    expect(result.bnglCode).toContain('koff');
    expect(result.bnglCode).toContain('kint');
    expect(result.bnglCode).toContain('ksyn');
    expect(result.bnglCode).toContain('kdeg');
    expect(result.bnglCode).toContain('state~free~bound~internal');

    // Must have proper observables for free/bound/total
    expect(result.bnglCode).toContain('C_drug_free');
    expect(result.bnglCode).toContain('C_complex');
    expect(result.bnglCode).toContain('C_drug_total');
  });
});

// ===================================================================
// Test 4: Dosing schedule – QD x7
// ===================================================================

describe('Dosing schedule generation', () => {
  it('QD x7 produces 7 events at correct times', () => {
    const config: StandardDosingConfig = {
      route: 'iv_bolus',
      dose: 100,
      interval: 24,
      nDoses: 7,
      startTime: 0,
    };

    const regimen = generateDosingSchedule(config);
    expect(regimen.events).toHaveLength(7);

    for (let i = 0; i < 7; i++) {
      expect(regimen.events[i].time).toBe(i * 24);
      expect(regimen.events[i].amount).toBe(100);
      expect(regimen.events[i].compartment).toBe('central');
    }
  });

  it('BID x5 produces 5 events every 12 hours', () => {
    const config: StandardDosingConfig = {
      route: 'oral',
      dose: 50,
      interval: 12,
      nDoses: 5,
    };

    const regimen = generateDosingSchedule(config);
    expect(regimen.events).toHaveLength(5);
    expect(regimen.events[2].time).toBe(24);
    expect(regimen.events[2].compartment).toBe('gut');
  });

  it('loading dose is applied on first event', () => {
    const config: StandardDosingConfig = {
      route: 'iv_bolus',
      dose: 100,
      interval: 24,
      nDoses: 3,
      loadingDose: 200,
    };

    const regimen = generateDosingSchedule(config);
    expect(regimen.events[0].amount).toBe(200);
    expect(regimen.events[1].amount).toBe(100);
    expect(regimen.events[2].amount).toBe(100);
  });
});

// ===================================================================
// Test 5: PK metrics – analytical 1-compartment
// ===================================================================

describe('PK metrics for 1-compartment IV', () => {
  it('Cmax, AUC, and half-life match analytical values', () => {
    const dose = 500;
    const V = 5.0;
    const CL = 1.0;
    const ke = CL / V;
    const times = Array.from({ length: 5001 }, (_, i) => (i / 5000) * 100);

    const results = oneCompartmentIVAnalytical(dose, V, CL, times);
    const metrics = computePKMetrics(results, 'C_plasma', dose);

    // Analytical values
    const expectedCmax = dose / V;           // 100 mg/L
    const expectedAUC = dose / CL;           // 500 hr*mg/L
    const expectedHalfLife = Math.LN2 / ke;  // ln(2) / 0.2 = 3.466 hr
    const expectedClearance = CL;

    expect(metrics.Cmax).toBeCloseTo(expectedCmax, 1);
    expect(metrics.AUC_0_inf).toBeCloseTo(expectedAUC, 0);
    expect(metrics.halfLife).toBeCloseTo(expectedHalfLife, 1);
    expect(metrics.clearance).toBeCloseTo(expectedClearance, 1);
  });
});

// ===================================================================
// Test 6: Trapezoidal AUC – known integral
// ===================================================================

describe('Trapezoidal AUC', () => {
  it('computes correct AUC for linear function f(t) = 2t over [0, 5]', () => {
    // Integral of 2t from 0 to 5 = 25
    const time = [0, 1, 2, 3, 4, 5];
    const conc = [0, 2, 4, 6, 8, 10];
    expect(trapezoidalAUC(time, conc)).toBeCloseTo(25, 10);
  });

  it('computes correct AUC for constant function f(t) = 10 over [0, 4]', () => {
    const time = [0, 1, 2, 3, 4];
    const conc = [10, 10, 10, 10, 10];
    expect(trapezoidalAUC(time, conc)).toBeCloseTo(40, 10);
  });

  it('computes correct AUC for exponential decay', () => {
    // C(t) = 100*exp(-0.1*t), AUC(0-100) = 100/0.1 * (1 - exp(-10)) ~= 999.955
    const time = Array.from({ length: 10001 }, (_, i) => (i / 10000) * 100);
    const conc = time.map((t) => 100 * Math.exp(-0.1 * t));
    const expected = (100 / 0.1) * (1 - Math.exp(-10));
    expect(Math.abs(trapezoidalAUC(time, conc) - expected) / expected).toBeLessThan(1e-6);
  });
});

// ===================================================================
// Test 7: Terminal half-life – mono-exponential recovery
// ===================================================================

describe('Terminal half-life estimation', () => {
  it('recovers exact ke from mono-exponential decay', () => {
    const ke = 0.2;
    const C0 = 100;
    const times = Array.from({ length: 501 }, (_, i) => (i / 500) * 50);
    const conc = times.map((t) => C0 * Math.exp(-ke * t));

    const result = estimateTerminalHalfLife(times, conc);
    expect(result).not.toBeNull();
    expect(result!.lambdaZ).toBeCloseTo(ke, 3);
    expect(result!.halfLife).toBeCloseTo(Math.LN2 / ke, 3);
    expect(result!.rSquared).toBeGreaterThanOrEqual(0.99);
  });

  it('recovers terminal phase from bi-exponential', () => {
    // C(t) = 50*exp(-2*t) + 50*exp(-0.1*t)
    // Terminal phase: ke = 0.1
    const times = Array.from({ length: 1001 }, (_, i) => (i / 1000) * 100);
    const conc = times.map((t) => 50 * Math.exp(-2 * t) + 50 * Math.exp(-0.1 * t));

    const result = estimateTerminalHalfLife(times, conc);
    expect(result).not.toBeNull();
    // After the fast phase dies out, terminal lambdaZ should be close to 0.1
    expect(Math.abs(result!.lambdaZ - 0.1) / 0.1).toBeLessThan(0.05);
  });
});

// ===================================================================
// Test 8: Virtual population – log-normal CL with CV=30%
// ===================================================================

describe('Virtual population generation', () => {
  it('log-normal CL with CV=30% yields approximately correct population statistics', () => {
    const config: VirtualPopulationConfig = {
      nPatients: 5000,
      parameters: [
        {
          name: 'CL',
          distribution: 'log_normal',
          mean: 0.5,
          cv: 0.3,
        },
        {
          name: 'V',
          distribution: 'log_normal',
          mean: 3.0,
          cv: 0.2,
        },
      ],
      seed: 12345,
    };

    const patients = generatePopulation(config);
    expect(patients).toHaveLength(5000);

    // Check CL statistics
    const clValues = patients.map((p) => p.CL ?? p.parameters['CL']);
    const clMean = clValues.reduce((s, v) => s + v, 0) / clValues.length;
    const clVariance = clValues.reduce((s, v) => s + (v - clMean) ** 2, 0) / (clValues.length - 1);
    const clCV = Math.sqrt(clVariance) / clMean;

    // Mean should be close to 0.5 (within 10%)
    expect(Math.abs(clMean - 0.5) / 0.5).toBeLessThan(0.1);
    // CV should be close to 0.3 (within 20% relative tolerance for finite sample)
    expect(Math.abs(clCV - 0.3) / 0.3).toBeLessThan(0.2);

    // Since AUC = Dose / CL for 1-compartment, CV of AUC ~ CV of CL for log-normal
    // (this is approximate; for log-normal CV of 1/X has a known relationship)
    const dose = 100;
    const aucValues = clValues.map((cl) => dose / cl);
    const aucMean = aucValues.reduce((s, v) => s + v, 0) / aucValues.length;
    const aucVariance = aucValues.reduce((s, v) => s + (v - aucMean) ** 2, 0) / (aucValues.length - 1);
    const aucCV = Math.sqrt(aucVariance) / aucMean;

    // CV of AUC should be in the same ballpark as CV of CL (~30%)
    // For log-normal: CV(1/X) = sqrt(exp(sigma^2) - 1) where sigma^2 = log(1 + CV_X^2)
    // With CV_X = 0.3: sigma^2 = log(1.09) = 0.0862, CV(1/X) = sqrt(exp(0.0862) - 1) = 0.302
    expect(Math.abs(aucCV - 0.3) / 0.3).toBeLessThan(0.25);
  });
});

// ===================================================================
// Test 9: BNGL code generation – correct begin/end blocks
// ===================================================================

describe('BNGL code generation structure', () => {
  const modelTypes: Array<{ type: PKModelConfig['type']; name: string }> = [
    { type: 'one_compartment_iv', name: 'one-compartment IV' },
    { type: 'one_compartment_oral', name: 'one-compartment oral' },
    { type: 'two_compartment_iv', name: 'two-compartment IV' },
    { type: 'two_compartment_oral', name: 'two-compartment oral' },
    { type: 'three_compartment', name: 'three-compartment' },
    { type: 'tmdd', name: 'TMDD' },
    { type: 'pbpk_minimal', name: 'PBPK minimal' },
  ];

  for (const { type, name } of modelTypes) {
    it(`${name} model has correct begin/end blocks`, () => {
      const config: PKModelConfig = {
        type,
        drugName: 'TestDrug',
        targetName: 'TestTarget',
        route: 'iv_bolus',
      };
      const result = generatePKModel(config);
      const code = result.bnglCode;

      // Must have begin/end model
      expect(code).toContain('begin model');
      expect(code).toContain('end model');

      // Must have all required blocks
      const requiredBlocks = [
        'parameters',
        'compartments',
        'molecule types',
        'seed species',
        'observables',
        'reaction rules',
      ];

      for (const block of requiredBlocks) {
        expect(code).toContain(`begin ${block}`);
        expect(code).toContain(`end ${block}`);
      }

      // Begin must come before end for each block
      for (const block of requiredBlocks) {
        const beginIdx = code.indexOf(`begin ${block}`);
        const endIdx = code.indexOf(`end ${block}`);
        expect(beginIdx).toBeLessThan(endIdx);
      }

      // Must contain drug name
      expect(code).toContain('TestDrug');
    });
  }
});

// ===================================================================
// Test 10: Dosing to phases – multiple doses create correct number of phases
// ===================================================================

describe('Dosing to simulation phases', () => {
  it('QD x3 creates 3 phases with correct boundaries', () => {
    const config: StandardDosingConfig = {
      route: 'iv_bolus',
      dose: 100,
      interval: 24,
      nDoses: 3,
    };

    const regimen = generateDosingSchedule(config);
    const { phases, concentrationChanges } = dosingToSimulationPhases(regimen, 72, 100);

    // 3 doses at t=0, 24, 48 -> phase boundaries at 0, 24, 48, 72 -> 3 phases
    expect(phases).toHaveLength(3);

    // Phase 1: [0, 24]
    expect(phases[0].t_end).toBe(24);
    expect(phases[0].continue).toBeUndefined();

    // Phase 2: [24, 48]
    expect(phases[1].t_start).toBe(24);
    expect(phases[1].t_end).toBe(48);
    expect(phases[1].continue).toBe(true);

    // Phase 3: [48, 72]
    expect(phases[2].t_start).toBe(48);
    expect(phases[2].t_end).toBe(72);
    expect(phases[2].continue).toBe(true);

    // 2 concentration changes (doses at t=24 and t=48; first dose at t=0 is seed species)
    expect(concentrationChanges).toHaveLength(2);
    expect(concentrationChanges[0].afterPhaseIndex).toBe(0);
    expect(concentrationChanges[0].mode).toBe('add');
    expect(concentrationChanges[1].afterPhaseIndex).toBe(1);
  });

  it('single dose creates 1 phase with no concentration changes', () => {
    const config: StandardDosingConfig = {
      route: 'oral',
      dose: 50,
    };
    const regimen = generateDosingSchedule(config);
    const { phases, concentrationChanges } = dosingToSimulationPhases(regimen, 24, 200);

    expect(phases).toHaveLength(1);
    expect(phases[0].t_end).toBe(24);
    expect(concentrationChanges).toHaveLength(0);
  });

  it('all phases use the specified method', () => {
    const config: StandardDosingConfig = {
      route: 'iv_bolus',
      dose: 100,
      interval: 12,
      nDoses: 4,
    };
    const regimen = generateDosingSchedule(config);
    const { phases } = dosingToSimulationPhases(regimen, 72, 50, 'ssa');

    for (const phase of phases) {
      expect(phase.method).toBe('ssa');
    }
  });
});

// ===================================================================
// Additional: NCA full analysis
// ===================================================================

describe('Non-compartmental analysis', () => {
  it('computes AUMC and MRT correctly for 1-compartment IV', () => {
    const dose = 100;
    const V = 3.0;
    const CL = 0.5;
    const ke = CL / V;
    const times = Array.from({ length: 5001 }, (_, i) => (i / 5000) * 100);
    const results = oneCompartmentIVAnalytical(dose, V, CL, times);

    const nca = nonCompartmentalAnalysis(results, 'C_plasma', dose);

    // MRT for 1-compartment IV = 1/ke
    const expectedMRT = 1 / ke;
    expect(Math.abs(nca.MRT - expectedMRT) / expectedMRT).toBeLessThan(0.05);

    // Vss = CL * MRT = V for 1-compartment
    expect(Math.abs(nca.Vss - V) / V).toBeLessThan(0.05);
  });
});

// ===================================================================
// Additional: Default parameters
// ===================================================================

describe('Default PK parameters', () => {
  it('returns valid defaults for all model types', () => {
    const types: PKModelConfig['type'][] = [
      'one_compartment_iv', 'one_compartment_oral', 'two_compartment_iv',
      'two_compartment_oral', 'three_compartment', 'tmdd', 'pbpk_minimal',
    ];
    for (const type of types) {
      const params = getDefaultPKParameters(type);
      expect(Object.keys(params).length).toBeGreaterThan(0);
      for (const val of Object.values(params)) {
        expect(typeof val).toBe('number');
        expect(val).toBeGreaterThan(0);
      }
    }
  });
});
