/**
 * DosingSchedule.ts – Dosing regimen generation and conversion to BNGL simulation phases.
 */

import type { SimulationPhase, ConcentrationChange } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DosingEvent {
  time: number;
  amount: number;
  compartment: string;
  duration?: number;
  species?: string;
}

export interface DosingRegimen {
  name: string;
  events: DosingEvent[];
  description?: string;
}

export interface StandardDosingConfig {
  route: 'iv_bolus' | 'iv_infusion' | 'oral' | 'subcutaneous';
  dose: number;
  interval?: number;
  nDoses?: number;
  startTime?: number;
  infusionDuration?: number;
  loadingDose?: number;
  escalationFactor?: number;
}

// ---------------------------------------------------------------------------
// Dosing schedule generation
// ---------------------------------------------------------------------------

/**
 * Generate a list of dosing events from a standard dosing configuration.
 *
 * Supports:
 *  - QD (interval=24), BID (interval=12), TID (interval=8)
 *  - Loading doses (first dose is `loadingDose` instead of `dose`)
 *  - Dose escalation (each successive dose multiplied by `escalationFactor`)
 *  - IV infusion with duration
 */
export function generateDosingSchedule(config: StandardDosingConfig): DosingRegimen {
  const {
    route,
    dose,
    interval = 24,
    nDoses = 1,
    startTime = 0,
    infusionDuration,
    loadingDose,
    escalationFactor,
  } = config;

  const compartment = route === 'oral' ? 'gut' : 'central';
  const events: DosingEvent[] = [];

  for (let i = 0; i < nDoses; i++) {
    let currentDose: number;
    if (i === 0 && loadingDose !== undefined) {
      currentDose = loadingDose;
    } else {
      currentDose = dose;
    }

    // Apply dose escalation (multiplicative on top of base dose for dose index > 0)
    if (escalationFactor !== undefined && i > 0) {
      currentDose = dose * Math.pow(escalationFactor, i);
    }

    const event: DosingEvent = {
      time: startTime + i * interval,
      amount: currentDose,
      compartment,
    };

    if (route === 'iv_infusion' && infusionDuration !== undefined && infusionDuration > 0) {
      event.duration = infusionDuration;
    }

    events.push(event);
  }

  // Build a human-readable name
  let freqLabel = '';
  if (nDoses > 1) {
    if (interval === 24) freqLabel = 'QD';
    else if (interval === 12) freqLabel = 'BID';
    else if (interval === 8) freqLabel = 'TID';
    else freqLabel = `Q${interval}H`;
  }
  const routeLabel = route.replace('_', ' ').toUpperCase();
  const name = nDoses === 1
    ? `Single ${routeLabel} ${dose} mg`
    : `${routeLabel} ${dose} mg ${freqLabel} x${nDoses}`;

  return { name, events, description: name };
}

// ---------------------------------------------------------------------------
// Conversion to BNGL multi-phase simulation
// ---------------------------------------------------------------------------

export interface DosingPhaseResult {
  phases: SimulationPhase[];
  concentrationChanges: ConcentrationChange[];
}

/**
 * Convert a dosing regimen into BNGL simulation phases and concentration changes.
 *
 * The first dose (at t=0 or the earliest time) is assumed to be handled by
 * seed species. Every subsequent dose creates:
 *   1. A phase boundary (the previous phase ends, a new phase begins).
 *   2. A ConcentrationChange that adds the dose amount into the appropriate species.
 *
 * @param regimen        The dosing regimen with events sorted by time.
 * @param totalSimTime   Total simulation duration (time units matching the model).
 * @param nStepsPerPhase Number of ODE steps within each phase.
 * @param method         Simulation method (default 'ode').
 */
export function dosingToSimulationPhases(
  regimen: DosingRegimen,
  totalSimTime: number,
  nStepsPerPhase: number,
  method: 'ode' | 'ssa' = 'ode',
): DosingPhaseResult {
  const events = [...regimen.events].sort((a, b) => a.time - b.time);

  if (events.length === 0) {
    return {
      phases: [{ method, t_end: totalSimTime, n_steps: nStepsPerPhase }],
      concentrationChanges: [],
    };
  }

  // Collect unique dose times (excluding the first if at t=0, which is seed species)
  const firstTime = events[0].time;
  const doseTimes: number[] = [];
  for (const ev of events) {
    if (ev.time === firstTime) continue; // first dose handled by seed species
    if (!doseTimes.includes(ev.time)) {
      doseTimes.push(ev.time);
    }
  }
  doseTimes.sort((a, b) => a - b);

  // Build phase boundaries: [0, doseTime1, doseTime2, ..., totalSimTime]
  const boundaries = [firstTime, ...doseTimes, totalSimTime];
  // Deduplicate and ensure ascending
  const uniqueBoundaries: number[] = [];
  for (const b of boundaries) {
    if (uniqueBoundaries.length === 0 || b > uniqueBoundaries[uniqueBoundaries.length - 1]) {
      uniqueBoundaries.push(b);
    }
  }

  const phases: SimulationPhase[] = [];
  const concentrationChanges: ConcentrationChange[] = [];

  for (let i = 0; i < uniqueBoundaries.length - 1; i++) {
    const t_start = i === 0 ? undefined : uniqueBoundaries[i];
    const t_end = uniqueBoundaries[i + 1];
    const phase: SimulationPhase = {
      method,
      t_end,
      n_steps: nStepsPerPhase,
    };
    if (t_start !== undefined) {
      phase.t_start = t_start;
    }
    if (i > 0) {
      phase.continue = true;
    }
    phases.push(phase);
  }

  // Build concentration changes for non-first doses
  for (const ev of events) {
    if (ev.time === firstTime) continue;
    // Find the phase index BEFORE this dose time
    const phaseIdx = phases.findIndex((ph) => ph.t_end === ev.time);
    if (phaseIdx === -1) continue;

    const speciesName = ev.species || `Drug()`;
    const compartmentPrefix = ev.compartment ? `@${ev.compartment}:` : '';

    concentrationChanges.push({
      species: `${compartmentPrefix}${speciesName}`,
      value: ev.amount,
      mode: 'add',
      afterPhaseIndex: phaseIdx,
    });
  }

  return { phases, concentrationChanges };
}
