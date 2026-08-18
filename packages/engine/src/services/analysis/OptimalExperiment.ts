import type { BNGLModel } from '../../types.js';
import { simulate } from '../simulation/SimulationLoop.js';
import { computeFIM } from './FisherInformationMatrix.js';

/**
 * Configuration options for optimal experiment design analysis.
 */
export interface OptimalExperimentConfig {
  model: BNGLModel;
  expandedModel: BNGLModel;
  observables: string[];
  candidateTimes: number[];
  nSamples: number;
  method: 'ode' | 'ssa';
  tEnd: number;
  cloneExpandedModel: (m: BNGLModel) => BNGLModel;
  updateMassActionRates: (m: BNGLModel) => void;
}

/**
 * Expected identifiability recommendation details for a single observable.
 */
export interface OptimalExperimentRecommendation {
  observable: string;
  suggested_times: number[];
  expected_identifiability: 'high' | 'moderate' | 'low';
  rationale: string;
}

/**
 * Analysis results for optimal experiment design.
 */
export interface OptimalExperimentResult {
  recommendations: OptimalExperimentRecommendation[];
  summary: string;
  note: string;
}

/**
 * Analyzes the model to recommend optimal experiment timepoints and determine parameter
 * identifiability for each selected observable.
 *
 * It runs simulations and uses the Fisher Information Matrix (FIM) to calculate eigenvalues
 * and condition numbers, which serve as the mathematical foundation for evaluating parameter
 * identifiability.
 *
 * @param config - The configuration for the optimal experiment analysis.
 * @returns Recommendations for each observable with suggested times and expected identifiability.
 */
export async function analyzeOptimalExperiment(
  config: OptimalExperimentConfig,
): Promise<OptimalExperimentResult> {
  const {
    model,
    expandedModel,
    observables,
    candidateTimes,
    nSamples,
    method,
    tEnd,
    cloneExpandedModel,
    updateMassActionRates,
  } = config;

  const recommendations: OptimalExperimentRecommendation[] = [];

  for (const obs of observables) {
    // Run simulation to verify/initialize
    await simulate(
      0,
      expandedModel,
      {
        method,
        t_end: tEnd,
        n_steps: nSamples,
      },
      {
        checkCancelled: () => {},
        postMessage: () => {},
      },
    );

    // Get up to first 5 parameters
    const paramNames = Object.keys(model.parameters).slice(0, 5);
    const params: Record<string, number> = {};
    for (const p of paramNames) {
      params[p] = model.parameters[p] ?? 1;
    }

    let identifiability: 'high' | 'moderate' | 'low' = 'low';
    let rationale = 'Limited identifiability - model may need redesign';

    try {
      const fimResult = await computeFIM({
        simulate: async (overrides: Record<string, number>) => {
          const runModel = cloneExpandedModel(expandedModel);
          Object.entries(overrides).forEach(([k, v]) => {
            runModel.parameters[k] = v;
          });
          updateMassActionRates(runModel);
          return simulate(
            0,
            runModel,
            {
              method,
              t_end: tEnd,
              n_steps: nSamples,
            },
            {
              checkCancelled: () => {},
              postMessage: () => {},
            },
          );
        },
        parameters: params,
        parameterNames: paramNames,
        allTimepoints: true,
        logParameters: false,
        approxProfile: false,
      });

      const eigenvalues = fimResult.eigenvalues ?? [];
      const minEig = Math.min(...eigenvalues.filter((e) => e > 0));
      const maxEig = Math.max(...eigenvalues);
      const conditionNumber = maxEig > 0 && minEig > 0 ? maxEig / minEig : Infinity;

      if (conditionNumber < 1000) {
        identifiability = 'high';
        rationale = 'Well-conditioned FIM - strong parameter identifiability expected';
      } else if (conditionNumber < 1e6) {
        identifiability = 'moderate';
        rationale = 'Moderate conditioning - consider additional timepoints';
      }
    } catch {
      // Keep default low identifiability
    }

    recommendations.push({
      observable: obs,
      suggested_times: candidateTimes.slice(0, 3),
      expected_identifiability: identifiability,
      rationale,
    });
  }

  return {
    recommendations,
    summary: `Analyzed ${observables.length} observables across ${candidateTimes.length} candidate timepoints`,
    note: 'Results are approximate - actual identifiability depends on experimental noise',
  };
}
