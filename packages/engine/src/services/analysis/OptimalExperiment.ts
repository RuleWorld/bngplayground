import type { BNGLModel } from '../../types.js';
import { simulate } from '../simulation/SimulationLoop.js';
import { computeFIM } from './FisherInformationMatrix.js';
import { updateMassActionRates as engineUpdateMassActionRates } from './DoseResponse.js';

function defaultCloneExpandedModel(model: BNGLModel): BNGLModel {
  return structuredClone(model);
}

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
  cloneExpandedModel?: (m: BNGLModel) => BNGLModel;
  updateMassActionRates?: (m: BNGLModel) => void;
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
    cloneExpandedModel = defaultCloneExpandedModel,
    updateMassActionRates = engineUpdateMassActionRates,
  } = config;

  const recommendations: OptimalExperimentRecommendation[] = [];

  for (const obs of observables) {
    const baseSimResult = await simulate(
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

    const paramNames = Object.keys(model.parameters).slice(0, 5);
    const params: Record<string, number> = {};
    for (const p of paramNames) {
      params[p] = model.parameters[p] ?? 1;
    }

    let identifiability: 'high' | 'moderate' | 'low' = 'low';
    let rationale = 'Limited identifiability - model may need redesign';
    let bestSuggestedTimes = candidateTimes.slice(0, 3);

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

      // Rank candidateTimes for this observable based on dynamic change in simulation data
      if (candidateTimes.length > 0 && baseSimResult.data.length > 0) {
        const simTimes = baseSimResult.data.map((d) => Number(d.time ?? 0));
        const obsValues = baseSimResult.data.map((d) => Number(d[obs] ?? 0));

        const scoredTimes = candidateTimes.map((tc) => {
          let bestIdx = 0;
          let minDiff = Math.abs(simTimes[0] - tc);
          for (let i = 1; i < simTimes.length; i++) {
            const diff = Math.abs(simTimes[i] - tc);
            if (diff < minDiff) {
              minDiff = diff;
              bestIdx = i;
            }
          }
          const prevVal = obsValues[Math.max(0, bestIdx - 1)];
          const nextVal = obsValues[Math.min(obsValues.length - 1, bestIdx + 1)];
          const dt =
            simTimes[Math.min(simTimes.length - 1, bestIdx + 1)] -
            simTimes[Math.max(0, bestIdx - 1)] || 1e-6;
          const slope = Math.abs(nextVal - prevVal) / dt;
          const magnitude = Math.abs(obsValues[bestIdx]);
          const score = slope * 10 + magnitude;
          return { time: tc, score };
        });

        scoredTimes.sort((a, b) => b.score - a.score);
        const topTimes = scoredTimes.map((st) => st.time).slice(0, 3);
        topTimes.sort((a, b) => a - b);
        bestSuggestedTimes = topTimes;
      }
    } catch {
      // Keep default low identifiability
    }

    recommendations.push({
      observable: obs,
      suggested_times: bestSuggestedTimes,
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
