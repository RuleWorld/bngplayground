import type { BNGLModel, SimulationOptions, SimulationPhase } from '../../types';

const DEFAULT_TIMECOURSE = { t_end: 100, n_steps: 100 };

/**
 * For multi-phase ODE models (like Hat_2016), aggregate all phases.
 * Returns a synthetic phase with cumulative t_end and total n_steps.
 */
function aggregateOdePhases(phases: SimulationPhase[]): SimulationPhase | undefined {
  const odePhases = phases.filter((p) => p.method === 'ode');
  if (odePhases.length === 0) return undefined;

  // For single phase, return as-is
  if (odePhases.length === 1) return odePhases[0];

  // For multiple phases, aggregate:
  // - sum all t_end values (cumulative time)
  // - sum all n_steps (total output points from all phases)
  let cumulative_t_end = 0;
  let total_n_steps = 0;
  let atol: number | undefined;
  let rtol: number | undefined;

  for (const phase of odePhases) {
    cumulative_t_end += phase.t_end ?? 0;
    total_n_steps += phase.n_steps ?? 100; // default 100 per phase
    // Use the tightest tolerance across all phases
    if (phase.atol !== undefined && (atol === undefined || phase.atol < atol)) {
      atol = phase.atol;
    }
    if (phase.rtol !== undefined && (rtol === undefined || phase.rtol < rtol)) {
      rtol = phase.rtol;
    }
  }

  return {
    method: 'ode',
    t_end: cumulative_t_end,
    n_steps: total_n_steps,
    ...(atol !== undefined ? { atol } : {}),
    ...(rtol !== undefined ? { rtol } : {}),
  };
}

function pickPhase(model: BNGLModel, method: SimulationOptions['method']): SimulationPhase | undefined {
  const phases = model.simulationPhases ?? [];
  if (phases.length === 0) return undefined;

  if (method === 'ode') {
    // Aggregate all ODE phases for multi-phase models
    return aggregateOdePhases(phases);
  }

  if (method === 'ssa') {
    const exact = phases.find((p) => p.method === method);
    return exact ?? phases[0];
  }

  // method === 'default': pick the first authored phase (BNG interprets phases in order).
  return phases[0];
}

export function getSimulationOptionsFromParsedModel(
  model: BNGLModel,
  method: SimulationOptions['method'],
  overrides?: Partial<SimulationOptions>
): SimulationOptions {
  const phase = pickPhase(model, method);

  const fallbackFromModelOptions = model.simulationOptions ?? {};
  const t_end =
    overrides?.t_end ??
    phase?.t_end ??
    (typeof fallbackFromModelOptions.t_end === 'number' ? fallbackFromModelOptions.t_end : undefined) ??
    DEFAULT_TIMECOURSE.t_end;

  const n_steps =
    overrides?.n_steps ??
    phase?.n_steps ??
    (typeof fallbackFromModelOptions.n_steps === 'number' ? fallbackFromModelOptions.n_steps : undefined) ??
    DEFAULT_TIMECOURSE.n_steps;

  const atol = overrides?.atol ?? phase?.atol ?? (typeof fallbackFromModelOptions.atol === 'number' ? fallbackFromModelOptions.atol : undefined);
  const rtol = overrides?.rtol ?? phase?.rtol ?? (typeof fallbackFromModelOptions.rtol === 'number' ? fallbackFromModelOptions.rtol : undefined);

  const options: SimulationOptions = {
    method,
    t_end,
    n_steps,
    ...(atol !== undefined ? { atol } : {}),
    ...(rtol !== undefined ? { rtol } : {}),
    ...(overrides?.solver ? { solver: overrides.solver } : {}),
    ...(overrides?.maxSteps ? { maxSteps: overrides.maxSteps } : {}),
    ...(overrides?.steadyState ? { steadyState: overrides.steadyState } : {}),
    ...(overrides?.steadyStateTolerance ? { steadyStateTolerance: overrides.steadyStateTolerance } : {}),
    ...(overrides?.steadyStateWindow ? { steadyStateWindow: overrides.steadyStateWindow } : {}),
  };

  return options;
}
