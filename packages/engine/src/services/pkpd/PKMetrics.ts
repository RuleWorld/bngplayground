/**
 * PKMetrics.ts – Non-compartmental analysis and PK metric computation.
 */

import type { SimulationResults } from '../../types';
import type { DosingRegimen } from './DosingSchedule';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PKMetricsResult {
  Cmax: number;
  Tmax: number;
  AUC_0_t: number;
  AUC_0_inf: number;
  halfLife: number;
  lambdaZ: number;
  clearance: number;
  Vss: number;
  MRT: number;
  bioavailability?: number;
  Ctrough?: number;
  accumulationRatio?: number;
  T_above_MIC?: number;
}

export interface NCAResult extends PKMetricsResult {
  AUMC_0_t: number;
  AUMC_0_inf: number;
}

// ---------------------------------------------------------------------------
// Helper: extract time and concentration arrays from SimulationResults
// ---------------------------------------------------------------------------

function extractTimeConcArrays(
  results: SimulationResults,
  observable: string,
): { time: number[]; conc: number[] } {
  const time: number[] = [];
  const conc: number[] = [];
  for (const row of results.data) {
    time.push(row['time']);
    conc.push(row[observable] ?? 0);
  }
  return { time, conc };
}

// ---------------------------------------------------------------------------
// Trapezoidal AUC
// ---------------------------------------------------------------------------

/**
 * Compute the area under the curve using the linear trapezoidal rule.
 */
export function trapezoidalAUC(time: number[], concentration: number[]): number {
  if (time.length !== concentration.length || time.length < 2) return 0;

  let auc = 0;
  for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    auc += 0.5 * (concentration[i - 1] + concentration[i]) * dt;
  }
  return auc;
}

/**
 * Compute AUMC (area under the first-moment curve) using the trapezoidal rule.
 * AUMC = integral( t * C(t) dt )
 */
function trapezoidalAUMC(time: number[], concentration: number[]): number {
  if (time.length !== concentration.length || time.length < 2) return 0;

  let aumc = 0;
  for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    aumc += 0.5 * (time[i - 1] * concentration[i - 1] + time[i] * concentration[i]) * dt;
  }
  return aumc;
}

// ---------------------------------------------------------------------------
// Terminal half-life estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the terminal elimination rate constant (lambdaZ) and half-life by
 * performing log-linear regression on the terminal phase of the concentration
 * profile. Scans backward from the end to find the longest segment with R^2 >= 0.99.
 *
 * Returns { lambdaZ, halfLife, rSquared } or null if no valid segment is found.
 */
export function estimateTerminalHalfLife(
  time: number[],
  concentration: number[],
): { lambdaZ: number; halfLife: number; rSquared: number } | null {
  // Filter to positive concentrations only
  const pairs: Array<{ t: number; lnC: number }> = [];
  for (let i = 0; i < time.length; i++) {
    if (concentration[i] > 0) {
      pairs.push({ t: time[i], lnC: Math.log(concentration[i]) });
    }
  }

  if (pairs.length < 3) return null;

  // Find Cmax index (start terminal phase search after Cmax)
  let cmaxIdx = 0;
  let cmaxVal = -Infinity;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].lnC > cmaxVal) {
      cmaxVal = pairs[i].lnC;
      cmaxIdx = i;
    }
  }

  // Only use points after Cmax for terminal phase
  const terminalPairs = pairs.slice(cmaxIdx);
  if (terminalPairs.length < 3) return null;

  // Scan from end, increasing number of points, keep best R^2 >= 0.99
  let bestResult: { lambdaZ: number; halfLife: number; rSquared: number } | null = null;
  let bestNPoints = 0;

  for (let nPts = 3; nPts <= terminalPairs.length; nPts++) {
    const subset = terminalPairs.slice(terminalPairs.length - nPts);
    const reg = linearRegression(
      subset.map((p) => p.t),
      subset.map((p) => p.lnC),
    );

    if (reg.rSquared >= 0.99 && reg.slope < 0) {
      if (nPts >= bestNPoints) {
        bestNPoints = nPts;
        const lambdaZ = -reg.slope;
        bestResult = {
          lambdaZ,
          halfLife: Math.LN2 / lambdaZ,
          rSquared: reg.rSquared,
        };
      }
    }
  }

  // If strict R^2 >= 0.99 yields nothing, relax to best available with R^2 >= 0.95
  if (!bestResult) {
    let bestR2 = 0;
    for (let nPts = 3; nPts <= terminalPairs.length; nPts++) {
      const subset = terminalPairs.slice(terminalPairs.length - nPts);
      const reg = linearRegression(
        subset.map((p) => p.t),
        subset.map((p) => p.lnC),
      );
      if (reg.rSquared >= 0.95 && reg.slope < 0 && reg.rSquared > bestR2) {
        bestR2 = reg.rSquared;
        const lambdaZ = -reg.slope;
        bestResult = {
          lambdaZ,
          halfLife: Math.LN2 / lambdaZ,
          rSquared: reg.rSquared,
        };
      }
    }
  }

  return bestResult;
}

/**
 * Simple linear regression: y = slope * x + intercept.
 * Returns slope, intercept, rSquared.
 */
function linearRegression(
  x: number[],
  y: number[],
): { slope: number; intercept: number; rSquared: number } {
  const n = x.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: 0, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R^2
  const yMean = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (y[i] - yMean) ** 2;
    const yPred = slope * x[i] + intercept;
    ssRes += (y[i] - yPred) ** 2;
  }
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared };
}

// ---------------------------------------------------------------------------
// Compute PK metrics
// ---------------------------------------------------------------------------

/**
 * Compute standard PK metrics from simulation results.
 */
export function computePKMetrics(
  results: SimulationResults,
  observable: string,
  dose: number,
  MIC?: number,
): PKMetricsResult {
  const { time, conc } = extractTimeConcArrays(results, observable);

  // Cmax, Tmax
  let Cmax = 0;
  let Tmax = 0;
  for (let i = 0; i < conc.length; i++) {
    if (conc[i] > Cmax) {
      Cmax = conc[i];
      Tmax = time[i];
    }
  }

  // AUC(0-t)
  const AUC_0_t = trapezoidalAUC(time, conc);

  // Terminal half-life
  const terminalResult = estimateTerminalHalfLife(time, conc);
  const lambdaZ = terminalResult?.lambdaZ ?? 0;
  const halfLife = terminalResult?.halfLife ?? 0;

  // AUC(0-inf) = AUC(0-t) + Clast/lambdaZ
  const Clast = conc[conc.length - 1];
  const AUC_0_inf = lambdaZ > 0 ? AUC_0_t + Clast / lambdaZ : AUC_0_t;

  // Clearance = Dose / AUC_0_inf
  const clearance = AUC_0_inf > 0 ? dose / AUC_0_inf : 0;

  // AUMC for MRT calculation
  const AUMC_0_t = trapezoidalAUMC(time, conc);
  const AUMC_0_inf = lambdaZ > 0
    ? AUMC_0_t + Clast * time[time.length - 1] / lambdaZ + Clast / (lambdaZ * lambdaZ)
    : AUMC_0_t;

  // MRT = AUMC / AUC
  const MRT = AUC_0_inf > 0 ? AUMC_0_inf / AUC_0_inf : 0;

  // Vss = CL * MRT
  const Vss = clearance * MRT;

  // Ctrough (last concentration)
  const Ctrough = Clast;

  // T above MIC
  let T_above_MIC: number | undefined;
  if (MIC !== undefined) {
    let timeAbove = 0;
    for (let i = 1; i < time.length; i++) {
      const c0 = conc[i - 1];
      const c1 = conc[i];
      const dt = time[i] - time[i - 1];
      if (c0 >= MIC && c1 >= MIC) {
        timeAbove += dt;
      } else if (c0 >= MIC && c1 < MIC) {
        // Linear interpolation for crossing point
        const frac = (c0 - MIC) / (c0 - c1);
        timeAbove += frac * dt;
      } else if (c0 < MIC && c1 >= MIC) {
        const frac = (MIC - c0) / (c1 - c0);
        timeAbove += (1 - frac) * dt;
      }
    }
    T_above_MIC = timeAbove;
  }

  return {
    Cmax,
    Tmax,
    AUC_0_t,
    AUC_0_inf,
    halfLife,
    lambdaZ,
    clearance,
    Vss,
    MRT,
    Ctrough,
    T_above_MIC,
  };
}

// ---------------------------------------------------------------------------
// Full non-compartmental analysis
// ---------------------------------------------------------------------------

/**
 * Full NCA including AUMC and MRT.
 */
export function nonCompartmentalAnalysis(
  results: SimulationResults,
  observable: string,
  dose: number,
  dosingRegimen?: DosingRegimen,
): NCAResult {
  const { time, conc } = extractTimeConcArrays(results, observable);

  // Cmax, Tmax
  let Cmax = 0;
  let Tmax = 0;
  for (let i = 0; i < conc.length; i++) {
    if (conc[i] > Cmax) {
      Cmax = conc[i];
      Tmax = time[i];
    }
  }

  const AUC_0_t = trapezoidalAUC(time, conc);
  const AUMC_0_t = trapezoidalAUMC(time, conc);

  const terminalResult = estimateTerminalHalfLife(time, conc);
  const lambdaZ = terminalResult?.lambdaZ ?? 0;
  const halfLife = terminalResult?.halfLife ?? 0;

  const Clast = conc[conc.length - 1];
  const Tlast = time[time.length - 1];

  const AUC_0_inf = lambdaZ > 0 ? AUC_0_t + Clast / lambdaZ : AUC_0_t;
  const AUMC_0_inf = lambdaZ > 0
    ? AUMC_0_t + Clast * Tlast / lambdaZ + Clast / (lambdaZ * lambdaZ)
    : AUMC_0_t;

  const MRT = AUC_0_inf > 0 ? AUMC_0_inf / AUC_0_inf : 0;
  const clearance = AUC_0_inf > 0 ? dose / AUC_0_inf : 0;
  const Vss = clearance * MRT;

  // Accumulation ratio (for multiple dosing)
  let accumulationRatio: number | undefined;
  if (dosingRegimen && dosingRegimen.events.length >= 2) {
    const tau = dosingRegimen.events[1].time - dosingRegimen.events[0].time;
    if (tau > 0 && lambdaZ > 0) {
      accumulationRatio = 1 / (1 - Math.exp(-lambdaZ * tau));
    }
  }

  return {
    Cmax,
    Tmax,
    AUC_0_t,
    AUC_0_inf,
    halfLife,
    lambdaZ,
    clearance,
    Vss,
    MRT,
    Ctrough: Clast,
    accumulationRatio,
    AUMC_0_t,
    AUMC_0_inf,
  };
}
