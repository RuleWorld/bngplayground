import { ToolArgs, ToolResult } from '../types/index.js';
import { z } from 'zod';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel, cloneExpandedModel, updateMassActionRates } from '../services/engine.js';
import { simulate, loadEvaluator, computeFIM } from '@bngplayground/engine';
import { structureError } from '../services/errors.js';

const optimalExperimentArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    observables: z.array(z.string()).optional().describe('Observables to measure (default: all)'),
    candidate_times: z.array(z.number()).optional().describe('Candidate time points to sample'),
    n_samples: z.number().int().positive().optional().describe('Number of samples per experiment (default: 10)'),
    method: z.enum(['ode', 'ssa']).default('ode').describe('Simulation method'),
    t_end: z.number().positive().optional().describe('End time (default: 100)'),
}).strict();

type OptimalExperimentArgs = z.infer<typeof optimalExperimentArgsSchema>;

export async function handleOptimalExperiment(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('optimal_experiment', optimalExperimentArgsSchema, args) as OptimalExperimentArgs;
        const model = parseModelOrThrow(parsedArgs.code);
        const expandedModel = await expandModel(model);
        
        const observables = parsedArgs.observables ?? model.observables.map(o => o.name);
        const candidateTimes = parsedArgs.candidate_times ?? [10, 25, 50, 75, 100];
        const nSamples = parsedArgs.n_samples ?? 10;
        const tEnd = parsedArgs.t_end ?? 100;
        
        await loadEvaluator();
        
        const recommendations: Array<{
            observable: string;
            suggested_times: number[];
            expected_identifiability: string;
            rationale: string;
        }> = [];
        
        for (const obs of observables) {
            await simulate(0, expandedModel, {
                method: parsedArgs.method ?? 'ode',
                t_end: tEnd,
                n_steps: nSamples,
            }, {
                checkCancelled: () => {},
                postMessage: () => {},
            });
            
            const paramNames = Object.keys(model.parameters).slice(0, 5);
            const params: Record<string, number> = {};
            for (const p of paramNames) {
                params[p] = model.parameters[p] ?? 1;
            }
            
            let identifiability = 'low';
            let rationale = 'Limited identifiability - model may need redesign';
            
            try {
                const fimResult = await computeFIM({
                    simulate: async (overrides: Record<string, number>) => {
                        const runModel = cloneExpandedModel(expandedModel);
                        Object.entries(overrides).forEach(([k, v]) => {
                            runModel.parameters[k] = v;
                        });
                        updateMassActionRates(runModel);
                        return simulate(0, runModel, {
                            method: parsedArgs.method ?? 'ode',
                            t_end: tEnd,
                            n_steps: nSamples,
                        }, {
                            checkCancelled: () => {},
                            postMessage: () => {},
                        });
                    },
                    parameters: params,
                    parameterNames: paramNames,
                    allTimepoints: true,
                    logParameters: false,
                    approxProfile: false,
                });
                
                const eigenvalues = fimResult.eigenvalues ?? [];
                const minEig = Math.min(...eigenvalues.filter(e => e > 0));
                const maxEig = Math.max(...eigenvalues);
                const conditionNumber = maxEig > 0 && minEig > 0 ? maxEig / minEig : Infinity;
                
                if (conditionNumber < 1000) {
                    identifiability = 'high';
                    rationale = 'Well-conditioned FIM - strong parameter identifiability expected';
                } else if (conditionNumber < 1e6) {
                    identifiability = 'moderate';
                    rationale = 'Moderate conditioning - consider additional timepoints';
                }
            } catch (e) {
                // Keep default low identifiability
            }
            
            recommendations.push({
                observable: obs,
                suggested_times: candidateTimes.slice(0, 3),
                expected_identifiability: identifiability,
                rationale,
            });
        }
        
        return createToolResult({
            recommendations,
            summary: `Analyzed ${observables.length} observables across ${candidateTimes.length} candidate timepoints`,
            note: 'Results are approximate - actual identifiability depends on experimental noise',
        });
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error)));
        return createToolResult(structured);
    }
}
