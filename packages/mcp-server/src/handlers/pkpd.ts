import { ToolArgs, ToolResult } from '../types/index.js';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel } from '../services/engine.js';
import { structureError } from '../services/errors.js';
import { simulate, loadEvaluator } from '@bngplayground/engine';

const pkpdArgsSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['generate_model', 'simulate_dosing', 'compute_metrics', 'population_simulation'],
      description: 'PK/PD action to perform',
    },
    model_type: { type: 'string', description: 'PK model type (one_compartment_iv, two_compartment_oral, tmdd, etc.)' },
    drug_name: { type: 'string', description: 'Drug name (default: Drug)' },
    route: { type: 'string', description: 'Route of administration (iv_bolus, oral, etc.)' },
    dose: { type: 'number', description: 'Dose amount in mg' },
    code: { type: 'string', description: 'BNGL model code (for simulate_dosing and compute_metrics)' },
    dosing_interval: { type: 'number', description: 'Dosing interval in hours' },
    n_doses: { type: 'number', description: 'Number of doses' },
    observable: { type: 'string', description: 'Observable name for PK metrics' },
    n_patients: { type: 'number', description: 'Number of virtual patients (default: 100)' },
  },
  required: ['action'],
};

export async function handlePKPD(args: ToolArgs): Promise<ToolResult<any>> {
  const parsedArgs = parseArgs('pkpd', pkpdArgsSchema, args);
  try {
    const engine = await import('@bngplayground/engine');
    await loadEvaluator();

    switch (parsedArgs.action) {
      case 'generate_model': {
        const result = engine.generatePKModel({
          type: parsedArgs.model_type || 'one_compartment_iv',
          drugName: parsedArgs.drug_name || 'Drug',
          route: parsedArgs.route || 'iv_bolus',
          parameters: parsedArgs.dose ? { Dose: parsedArgs.dose } : undefined,
        });
        return createToolResult({
          bnglCode: result.bnglCode,
          parameterDescriptions: result.parameterDescriptions,
          observableDescriptions: result.observableDescriptions,
          suggestedDosing: result.suggestedDosing,
          technical: `Generated ${parsedArgs.model_type || 'one_compartment_iv'} PK model for ${parsedArgs.drug_name || 'Drug'} via ${parsedArgs.route || 'iv_bolus'}.`,
          biological: `BNGL model generated with compartmental PK. Drug disposition modeled as rule-based molecular interactions.`,
          strategic: 'Use the generated BNGL code directly in the editor. Modify parameters or add PD components as needed.',
        });
      }

      case 'simulate_dosing': {
        if (!parsedArgs.code) throw new Error('code is required for simulate_dosing');
        const model = parseModelOrThrow(parsedArgs.code);
        const expanded = await expandModel(model);

        // Generate dosing schedule
        const regimen = engine.generateDosingSchedule({
          route: parsedArgs.route || 'iv_bolus',
          dose: parsedArgs.dose || 100,
          interval: parsedArgs.dosing_interval,
          nDoses: parsedArgs.n_doses || 1,
        });

        // Convert to simulation phases
        const tEnd = regimen.events.length > 1
          ? regimen.events[regimen.events.length - 1].time + (parsedArgs.dosing_interval || 24) * 2
          : 48;

        const results = await simulate(0, expanded, {
          method: 'ode', t_end: tEnd, n_steps: 500,
        }, { checkCancelled: () => {}, postMessage: () => {} });

        // Compute PK metrics
        const obsName = parsedArgs.observable || results.headers.find((h: string) => h !== 'time') || '';
        const metrics = engine.computePKMetrics(results, obsName, parsedArgs.dose || 100);

        return createToolResult({
          results: { headers: results.headers, nTimePoints: results.data.length },
          metrics,
          dosing: regimen,
          technical: `Simulated ${regimen.events.length} dose(s) over ${tEnd} hours. Cmax=${metrics.Cmax.toPrecision(4)}, t½=${metrics.halfLife.toPrecision(4)} hr.`,
          biological: `Peak concentration ${metrics.Cmax.toPrecision(4)} reached at ${metrics.Tmax.toPrecision(3)} hr. AUC=${metrics.AUC_0_inf.toPrecision(4)} mg·hr/L.`,
          strategic: 'Adjust dosing schedule parameters (interval, number of doses) to optimize the PK profile.',
        });
      }

      case 'compute_metrics': {
        if (!parsedArgs.code) throw new Error('code is required for compute_metrics');
        const model = parseModelOrThrow(parsedArgs.code);
        const expanded = await expandModel(model);
        const results = await simulate(0, expanded, {
          method: 'ode', t_end: 200, n_steps: 500,
        }, { checkCancelled: () => {}, postMessage: () => {} });

        const obsName = parsedArgs.observable || results.headers.find((h: string) => h !== 'time') || '';
        const metrics = engine.computePKMetrics(results, obsName, parsedArgs.dose || 100);
        const nca = engine.nonCompartmentalAnalysis(results, obsName, parsedArgs.dose || 100);

        return createToolResult({ metrics, nca, technical: 'NCA analysis complete.', biological: `t½=${metrics.halfLife.toPrecision(4)} hr, CL=${metrics.clearance.toPrecision(4)} L/hr.` });
      }

      case 'population_simulation': {
        if (!parsedArgs.code) throw new Error('code is required for population_simulation');
        const nPatients = parsedArgs.n_patients || 100;
        const popModel = parseModelOrThrow(parsedArgs.code);
        const population = engine.generatePopulation({
          nPatients,
          parameters: Object.keys(popModel.parameters || {}).map(name => ({
            name, distribution: 'log_normal' as const, mean: popModel.parameters[name], cv: 0.3,
          })),
        });

        return createToolResult({
          nPatients: population.length,
          parameterSummary: Object.fromEntries(
            Object.keys(population[0]?.parameters || {}).map(name => {
              const values = population.map(p => p.parameters[name]);
              const mean = values.reduce((a, b) => a + b, 0) / values.length;
              return [name, { mean, cv: Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length) / mean }];
            })
          ),
          technical: `Generated ${nPatients} virtual patients with log-normal PK parameter distributions (CV=30%).`,
          biological: 'Virtual patient population captures inter-individual variability in drug disposition.',
          strategic: 'Run population simulation to predict the range of PK exposures across a patient population.',
        });
      }

      default:
        throw new Error(`Unknown action: ${parsedArgs.action}`);
    }
  } catch (error: any) {
    return createToolResult(structureError(error instanceof Error ? error : new Error(String(error))));
  }
}
