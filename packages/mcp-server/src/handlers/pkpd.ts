import {
  generatePKModel,
  generateDosingSchedule,
  dosingToSimulationPhases,
  computePKMetrics,
  nonCompartmentalAnalysis,
  generatePopulation,
  populationSimulation,
  summarizePopulationParameters,
  simulate,
  loadEvaluator,
} from '@bngplayground/engine';
import type { PKModelType, StandardDosingConfig } from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import {
  createToolResult,
  parseArgs,
  parseModelOrThrow,
  expandModel,
  updateMassActionRates,
} from '../services/engine.js';
import { pkpdArgsSchema } from '../schemas/index.js';
import { structureError } from '../services/errors.js';

function normalizePKModelType(type?: string): PKModelType {
  if (!type) return 'one_compartment_iv';
  switch (type.toLowerCase()) {
    case '1cmt':
    case '1cmt_iv':
    case 'one_compartment':
    case 'one_compartment_iv':
      return 'one_compartment_iv';
    case '1cmt_oral':
    case 'one_compartment_oral':
      return 'one_compartment_oral';
    case '2cmt':
    case '2cmt_iv':
    case 'two_compartment':
    case 'two_compartment_iv':
      return 'two_compartment_iv';
    case '2cmt_oral':
    case 'two_compartment_oral':
      return 'two_compartment_oral';
    case '3cmt':
    case 'three_compartment':
      return 'three_compartment';
    case 'tmdd':
      return 'tmdd';
    case 'pbpk':
    case 'pbpk_minimal':
      return 'pbpk_minimal';
    default:
      return type as PKModelType;
  }
}

function normalizeRoute(route?: string): StandardDosingConfig['route'] {
  if (!route) return 'iv_bolus';
  switch (route.toLowerCase()) {
    case 'iv':
    case 'iv_bolus':
    case 'bolus':
      return 'iv_bolus';
    case 'infusion':
    case 'iv_infusion':
      return 'iv_infusion';
    case 'oral':
    case 'po':
      return 'oral';
    case 'sc':
    case 'subcut':
    case 'subcutaneous':
      return 'subcutaneous';
    default:
      return route as StandardDosingConfig['route'];
  }
}

export async function handlePKPD(args: ToolArgs): Promise<ToolResult<any>> {
  try {
    const parsedArgs = parseArgs('pkpd', pkpdArgsSchema, args);
    await loadEvaluator();

    switch (parsedArgs.action) {
      case 'generate_model': {
        const modelType = normalizePKModelType(parsedArgs.model_type);
        const route = normalizeRoute(parsedArgs.route);
        const result = generatePKModel({
          type: modelType,
          drugName: parsedArgs.drug_name || 'Drug',
          route,
          parameters: parsedArgs.dose ? { Dose: parsedArgs.dose } : undefined,
        });
        return createToolResult({
          bnglCode: result.bnglCode,
          parameterDescriptions: result.parameterDescriptions,
          observableDescriptions: result.observableDescriptions,
          suggestedDosing: result.suggestedDosing,
          technical: `Generated ${modelType} PK model for ${parsedArgs.drug_name || 'Drug'} via ${route}.`,
          biological: 'BNGL model generated with compartmental PK. Drug disposition modeled as rule-based molecular interactions.',
          strategic: 'Use the generated BNGL code directly in the editor. Modify parameters or add PD components as needed.',
        });
      }

      case 'simulate_dosing': {
        if (!parsedArgs.code) throw new Error('code is required for simulate_dosing');
        const model = parseModelOrThrow(parsedArgs.code);
        const expanded = await expandModel(model);

        const route = normalizeRoute(parsedArgs.route);
        const regimen = generateDosingSchedule({
          route,
          dose: parsedArgs.dose || 100,
          interval: parsedArgs.dosing_interval,
          nDoses: parsedArgs.n_doses || 1,
        });

        const tEnd = regimen.events.length > 1
          ? regimen.events[regimen.events.length - 1].time + (parsedArgs.dosing_interval || 24) * 2
          : 48;

        const { phases, concentrationChanges } = dosingToSimulationPhases(regimen, tEnd, 500, 'ode');
        expanded.simulationPhases = phases;
        expanded.concentrationChanges = concentrationChanges;

        const results = await simulate(0, expanded, {
          method: 'ode',
          t_end: tEnd,
          n_steps: 500,
        }, { checkCancelled: () => {}, postMessage: () => {} });

        const obsName = parsedArgs.observable || results.headers.find((h) => h !== 'time') || '';
        const metrics = computePKMetrics(results, obsName, parsedArgs.dose || 100);

        return createToolResult({
          results: { headers: results.headers, nTimePoints: results.data.length },
          metrics,
          dosing: regimen,
          technical: `Simulated ${regimen.events.length} dose(s) over ${tEnd} hours. Cmax=${metrics.Cmax.toPrecision(4)}, t\u00BD=${metrics.halfLife.toPrecision(4)} hr.`,
          biological: `Peak concentration ${metrics.Cmax.toPrecision(4)} reached at ${metrics.Tmax.toPrecision(3)} hr. AUC=${metrics.AUC_0_inf.toPrecision(4)} mg\u00B7hr/L.`,
          strategic: 'Adjust dosing schedule parameters (interval, number of doses) to optimize the PK profile.',
        });
      }

      case 'compute_metrics': {
        if (!parsedArgs.code) throw new Error('code is required for compute_metrics');
        const model = parseModelOrThrow(parsedArgs.code);
        const expanded = await expandModel(model);
        const results = await simulate(0, expanded, {
          method: 'ode',
          t_end: 200,
          n_steps: 500,
        }, { checkCancelled: () => {}, postMessage: () => {} });

        const obsName = parsedArgs.observable || results.headers.find((h) => h !== 'time') || '';
        const metrics = computePKMetrics(results, obsName, parsedArgs.dose || 100);
        const nca = nonCompartmentalAnalysis(results, obsName, parsedArgs.dose || 100);

        return createToolResult({
          metrics,
          nca,
          technical: 'NCA analysis complete.',
          biological: `t\u00BD=${metrics.halfLife.toPrecision(4)} hr, CL=${metrics.clearance.toPrecision(4)} L/hr.`,
        });
      }

      case 'population_simulation': {
        if (!parsedArgs.code) throw new Error('code is required for population_simulation');
        const nPatients = parsedArgs.n_patients || 100;
        const popModel = parseModelOrThrow(parsedArgs.code);
        const population = generatePopulation({
          nPatients,
          parameters: Object.keys(popModel.parameters || {}).map((name) => ({
            name,
            distribution: 'log_normal' as const,
            mean: popModel.parameters[name],
            cv: 0.3,
          })),
        });

        const expanded = await expandModel(popModel);
        const obsName = parsedArgs.observable || expanded.observables?.[0]?.name || expanded.species?.[0]?.name || 'time';

        const popSimResult = await populationSimulation(
          parsedArgs.code,
          population,
          obsName,
          async (code: string, paramOverrides: Record<string, number>) => {
            const patientModel = parseModelOrThrow(code);
            const patientExpanded = await expandModel(patientModel);
            for (const [k, v] of Object.entries(paramOverrides)) {
              patientExpanded.parameters[k] = v;
            }
            updateMassActionRates(patientExpanded);
            return simulate(0, patientExpanded, {
              method: 'ode',
              t_end: 200,
              n_steps: 100,
            }, { checkCancelled: () => {}, postMessage: () => {} });
          },
        );

        return createToolResult({
          nPatients: population.length,
          parameterSummary: summarizePopulationParameters(population),
          simulationSummary: popSimResult.summary,
          technical: `Generated and simulated ${nPatients} virtual patients with log-normal PK parameter distributions (CV=30%).`,
          biological: 'Virtual patient population captures inter-individual variability in drug disposition.',
          strategic: 'Run population simulation to predict the range of PK exposures across a patient population.',
        });
      }

      default:
        throw new Error(`Unknown action: ${(parsedArgs as { action: string }).action}`);
    }
  } catch (error: unknown) {
    return createToolResult(structureError(error instanceof Error ? error : new Error(String(error), { cause: error })));
  }
}
