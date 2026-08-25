import { describe, expect, it } from 'vitest';

import { handleSimulate } from '../src/handlers/simulate.js';
import { buildSimulationOptions } from '../src/services/engine.js';

const RECEPTOR_MODEL = `begin model
begin parameters
  kon_L 0.001
  koff_L 0.05
  kon_dim 0.0005
  koff_dim 0.02
  k_phos 0.2
  k_dephos 0.03
  kon_A 0.002
  koff_A 0.08
end parameters
begin molecule types
  Lig(r)
  Rec(l,d,Y~U~P)
  Adapt(sh2)
end molecule types
begin seed species
  Lig(r) 120
  Rec(l,d,Y~U) 60
  Adapt(sh2) 80
end seed species
begin observables
  Molecules FreeLigand Lig(r)
  Molecules BoundReceptor Rec(l!+)
  Molecules ReceptorDimers Rec(d!1).Rec(d!1)
  Molecules Phosphorylated Rec(Y~P)
  Molecules RecruitedAdaptor Rec(Y~P!1).Adapt(sh2!1)
end observables
begin reaction rules
  ligand_bind: Lig(r) + Rec(l,d,Y) -> Lig(r!1).Rec(l!1,d,Y) kon_L
  ligand_unbind: Lig(r!1).Rec(l!1,d,Y) -> Lig(r) + Rec(l,d,Y) koff_L
  receptor_dimerize: Lig(r!1).Rec(l!1,d,Y) + Lig(r!1).Rec(l!1,d,Y) -> Lig(r!1).Rec(l!1,d!2,Y).Rec(l!3,d!2,Y).Lig(r!3) kon_dim
  receptor_undimerize: Lig(r!1).Rec(l!1,d!2,Y).Rec(l!3,d!2,Y).Lig(r!3) -> Lig(r!1).Rec(l!1,d,Y) + Lig(r!1).Rec(l!1,d,Y) koff_dim
  trans_phosphorylate: Rec(d!1,Y~U).Rec(d!1) -> Rec(d!1,Y~P).Rec(d!1) k_phos
  dephosphorylate: Rec(Y~P) -> Rec(Y~U) k_dephos
  adaptor_bind: Rec(Y~P) + Adapt(sh2) -> Rec(Y~P!1).Adapt(sh2!1) kon_A
  adaptor_unbind: Rec(Y~P!1).Adapt(sh2!1) -> Rec(Y~P) + Adapt(sh2) koff_A
end reaction rules
end model`;

describe('simulate ODE solver behavior', () => {
  it('defaults ODE requests to the auto solver', () => {
    expect(buildSimulationOptions({ method: 'ode' }).solver).toBe('auto');
  });

  it('completes the complicated receptor model with the default auto solver', async () => {
    const result = await handleSimulate({
      code: RECEPTOR_MODEL,
      method: 'ode',
      t_end: 100,
      n_steps: 100,
      output_mode: 'observables_only',
    });

    expect(result.isError).not.toBe(true);
    const payload = result.structuredContent as { data: Array<Record<string, number>> };
    expect(payload.data).toHaveLength(101);
    expect(payload.data.at(-1)?.time).toBeCloseTo(100);
  });

  it('reports an explicit MCP error when RK4 stops before the requested end time', async () => {
    const result = await handleSimulate({
      code: RECEPTOR_MODEL,
      method: 'ode',
      solver: 'rk4',
      t_end: 100,
      n_steps: 100,
      output_mode: 'observables_only',
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      success: false,
      stage: 'simulation',
      error: 'STIFF_DETECTED',
      solver: 'rk4',
      requested_end_time: 100,
      last_time: 0,
      partial_result: {
        data: [{ time: 0 }],
      },
    });
  });

  it('honors an MCP request that is already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await handleSimulate({
      code: RECEPTOR_MODEL,
      method: 'ode',
      t_end: 1,
      n_steps: 1,
    }, controller.signal);

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: 'Simulation request was cancelled.',
    });
  });
});
