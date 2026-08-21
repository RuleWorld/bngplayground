import { describe, it, expect } from 'vitest';
import { handlePKPD } from '../src/handlers/pkpd.js';

const SIMPLE_PK_MODEL = `
begin model
begin parameters
  k_elim 0.1
  A_init 100
end parameters
begin species
  A() A_init
end species
begin reaction rules
  A() -> 0 k_elim
end reaction rules
begin observables
  Molecules A_obs A()
end observables
end model
`;

describe('handlePKPD MCP Tool Handler', () => {
  it('generates a PK model for valid inputs', async () => {
    const result = await handlePKPD({
      action: 'generate_model',
      model_type: 'one_compartment_iv',
      drug_name: 'TestDrug',
      route: 'iv_bolus',
      dose: 50,
    });

    expect(result.structuredContent).toBeDefined();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.error).toBeUndefined();
    expect(content.bnglCode).toBeDefined();
    expect(typeof content.bnglCode).toBe('string');
  });

  it('simulates dosing with multi-phase simulation phases', async () => {
    const result = await handlePKPD({
      action: 'simulate_dosing',
      code: SIMPLE_PK_MODEL,
      route: 'iv_bolus',
      dose: 100,
      dosing_interval: 12,
      n_doses: 2,
    });

    expect(result.structuredContent).toBeDefined();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.error).toBeUndefined();
    expect(content.results).toBeDefined();
    expect(content.metrics).toBeDefined();
    expect(content.dosing).toBeDefined();
  });

  it('computes PK metrics and non-compartmental analysis', async () => {
    const result = await handlePKPD({
      action: 'compute_metrics',
      code: SIMPLE_PK_MODEL,
      dose: 100,
    });

    expect(result.structuredContent).toBeDefined();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.error).toBeUndefined();
    expect(content.metrics).toBeDefined();
    expect(content.nca).toBeDefined();
  });

  it('executes population simulation with patient profile summaries and parameter variance', async () => {
    const result = await handlePKPD({
      action: 'population_simulation',
      code: SIMPLE_PK_MODEL,
      n_patients: 10,
    });

    expect(result.structuredContent).toBeDefined();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.error).toBeUndefined();
    expect(content.nPatients).toBe(10);
    expect(content.parameterSummary).toBeDefined();
    expect(content.simulationSummary).toBeDefined();

    // Verify 5th percentile, mean, and 95th percentile profiles differ due to updated rates across parameter draws
    const summary = content.simulationSummary as {
      meanProfile: Record<string, number>[];
      percentile5: Record<string, number>[];
      percentile95: Record<string, number>[];
    };
    expect(summary.meanProfile.length).toBeGreaterThan(0);
    const lastIdx = summary.meanProfile.length - 1;

    // Fast-elimination patients (percentile5) vs slow-elimination patients (percentile95) should have distinct endpoint concentrations
    const val5 = summary.percentile5[lastIdx].A_obs;
    const val95 = summary.percentile95[lastIdx].A_obs;
    expect(val5).not.toEqual(val95);
  });

  it('handles errors gracefully when code is missing for simulate_dosing', async () => {
    const result = await handlePKPD({
      action: 'simulate_dosing',
    });

    expect(result.structuredContent).toBeDefined();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.error).toBeDefined();
  });
});
