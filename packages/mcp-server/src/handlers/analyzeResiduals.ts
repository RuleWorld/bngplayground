import { ToolArgs, ToolResult } from '../types/index.js';
import { z } from 'zod';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel, updateMassActionRates } from '../services/engine.js';
import { simulate, loadEvaluator } from '@bngplayground/engine';
import { structureError } from '../services/errors.js';

const analyzeResidualsArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    experimental_data: z.array(z.object({
        time: z.number(),
        observables: z.record(z.string(), z.number()),
    })).describe('Experimental data points'),
    parameters: z.record(z.string(), z.number()).optional().describe('Model parameters to use (default: from model)'),
    method: z.enum(['ode', 'ssa']).default('ode').describe('Simulation method'),
    t_end: z.number().positive().optional().describe('End time (default: max experimental time)'),
}).strict();

type AnalyzeResidualsArgs = z.infer<typeof analyzeResidualsArgsSchema>;

export async function handleAnalyzeResiduals(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('analyze_residuals', analyzeResidualsArgsSchema, args) as AnalyzeResidualsArgs;
        const model = parseModelOrThrow(parsedArgs.code);
        const expandedModel = await expandModel(model);
        
        // Override parameters if provided
        if (parsedArgs.parameters) {
            for (const [name, value] of Object.entries(parsedArgs.parameters)) {
                expandedModel.parameters[name] = value;
            }
            updateMassActionRates(expandedModel);
        }
        
        const tEnd = parsedArgs.t_end ?? Math.max(...parsedArgs.experimental_data.map(d => d.time));
        
        await loadEvaluator();
        
        const simResult = await simulate(0, expandedModel, {
            method: parsedArgs.method ?? 'ode',
            t_end: tEnd,
            n_steps: Math.max(100, parsedArgs.experimental_data.length * 2),
        }, {
            checkCancelled: () => {},
            postMessage: () => {},
        });
        
        // Interpolate simulation to experimental timepoints
        const timePoints = parsedArgs.experimental_data.map(d => d.time);
        
        const residualsByObservable: Record<string, {
            times: number[];
            observed: number[];
            simulated: number[];
            residuals: number[];
            statistics: {
                sse: number;
                mse: number;
                rmse: number;
                r_squared: number;
            };
        }> = {};
        
        const observableNames = Object.keys(parsedArgs.experimental_data[0]?.observables ?? {});
        
        for (const obsName of observableNames) {
            const observed: number[] = [];
            const simulated: number[] = [];
            const residuals: number[] = [];
            
            for (const expPoint of parsedArgs.experimental_data) {
                const obsValue = expPoint.observables[obsName] ?? 0;
                observed.push(obsValue);
                
                // Linear interpolation of simulation
                const simData = simResult.data;
                let simValue = 0;
                
                for (let i = 0; i < simData.length - 1; i++) {
                    const t1 = i * (tEnd / (simData.length - 1));
                    const t2 = (i + 1) * (tEnd / (simData.length - 1));
                    if (expPoint.time >= t1 && expPoint.time <= t2) {
                        const v1 = Number(simData[i][obsName] ?? 0);
                        const v2 = Number(simData[i + 1][obsName] ?? 0);
                        const frac = (expPoint.time - t1) / (t2 - t1);
                        simValue = v1 + frac * (v2 - v1);
                        break;
                    }
                }
                
                simulated.push(simValue);
                residuals.push(obsValue - simValue);
            }
            
            const sse = residuals.reduce((sum, r) => sum + r * r, 0);
            const mse = sse / residuals.length;
            const rmse = Math.sqrt(mse);
            
            // R-squared calculation
            const meanObs = observed.reduce((a, b) => a + b, 0) / observed.length;
            const ssTot = observed.reduce((sum, v) => sum + Math.pow(v - meanObs, 2), 0);
            const rSquared = ssTot > 0 ? 1 - sse / ssTot : 0;
            
            residualsByObservable[obsName] = {
                times: timePoints,
                observed,
                simulated,
                residuals,
                statistics: {
                    sse,
                    mse,
                    rmse,
                    r_squared: rSquared,
                },
            };
        }
        
        // Overall statistics
        const allResiduals = Object.values(residualsByObservable).flatMap(r => r.residuals);
        const overallSSE = allResiduals.reduce((sum, r) => sum + r * r, 0);
        const overallRMSE = Math.sqrt(overallSSE / allResiduals.length);
        
        // Normality check (simple skewness)
        const mean = allResiduals.reduce((a, b) => a + b, 0) / allResiduals.length;
        const std = Math.sqrt(allResiduals.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / allResiduals.length);
        const skewness = std > 0 
            ? allResiduals.reduce((sum, r) => sum + Math.pow((r - mean) / std, 3), 0) / allResiduals.length 
            : 0;
        
        return createToolResult({
            by_observable: residualsByObservable,
            overall: {
                sse: overallSSE,
                rmse: overallRMSE,
                n_points: allResiduals.length,
            },
            diagnostics: {
                residual_mean: mean,
                residual_std: std,
                skewness,
                normality_hint: Math.abs(skewness) < 0.5 
                    ? 'Residuals appear approximately symmetric'
                    : Math.abs(skewness) > 1 
                    ? 'Residuals are highly skewed - consider model structure issues'
                    : 'Residuals show moderate asymmetry',
            },
            interpretation: overallRMSE < 0.1 * Math.max(...Object.values(residualsByObservable).flatMap(r => r.observed))
                ? 'Good fit - model captures experimental data well'
                : overallRMSE < 0.5 * Math.max(...Object.values(residualsByObservable).flatMap(r => r.observed))
                ? 'Moderate fit - some model mismatch observed'
                : 'Poor fit - model may be missing key mechanisms or have structural issues',
        });
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error)));
        return createToolResult(structured);
    }
}
