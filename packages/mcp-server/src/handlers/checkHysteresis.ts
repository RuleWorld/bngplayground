import { ToolArgs, ToolResult } from '../types/index.js';
import { z } from 'zod';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel, cloneExpandedModel, updateMassActionRates } from '../services/engine.js';
import { simulate, loadEvaluator } from '@bngplayground/engine';
import { structureError } from '../services/errors.js';

const checkHysteresisArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    parameter: z.string().describe('Parameter to vary'),
    sweep_range: z.array(z.number()).length(2).describe('Min and max values for parameter sweep'),
    steps: z.number().int().min(2).optional().describe('Number of sweep steps (default: 20)'),
    observable: z.string().optional().describe('Observable to analyze (default: first)'),
    method: z.enum(['ode', 'ssa']).default('ode').describe('Simulation method'),
    t_end: z.number().positive().optional().describe('End time (default: 50)'),
}).strict();

type CheckHysteresisArgs = z.infer<typeof checkHysteresisArgsSchema>;

export async function handleCheckHysteresis(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('check_hysteresis', checkHysteresisArgsSchema, args) as CheckHysteresisArgs;

        if (!parsedArgs.code || parsedArgs.code.trim() === '') {
            throw new Error('Model code cannot be empty.');
        }

        const model = parseModelOrThrow(parsedArgs.code);
        const expandedModel = await expandModel(model);
        
        if (!(parsedArgs.parameter in model.parameters)) {
            throw new Error(`Unknown parameter '${parsedArgs.parameter}'. Available parameters: ${Object.keys(model.parameters).join(', ') || '(none)'}`);
        }

        if (parsedArgs.observable && !model.observables.some((o) => o.name === parsedArgs.observable)) {
            throw new Error(`Unknown observable '${parsedArgs.observable}'. Available observables: ${model.observables.map((o) => o.name).join(', ') || '(none)'}`);
        }

        const [minVal, maxVal] = parsedArgs.sweep_range;
        if (minVal >= maxVal) {
            throw new Error(`Invalid sweep range: min value (${minVal}) must be strictly less than max value (${maxVal}).`);
        }

        const steps = parsedArgs.steps ?? 20;
        if (steps <= 1) {
            throw new Error('Steps must be greater than or equal to 2.');
        }

        const tEnd = parsedArgs.t_end ?? 50;
        if (tEnd <= 0) {
            throw new Error('t_end must be a positive number.');
        }
        
        const forwardValues: number[] = [];
        const backwardValues: number[] = [];
        const paramValues: number[] = [];
        
        const stepSize = (maxVal - minVal) / (steps - 1);
        
        await loadEvaluator();
        
        const obsName = parsedArgs.observable ?? model.observables[0]?.name ?? '';
        if (!obsName) {
            throw new Error('No observables available in the model to analyze.');
        }
        
        // Forward sweep - carry state between parameter changes
        let currentState: Record<string, number> | null = null;
        let finalForwardState: Record<string, number> = {};
        
        for (let i = 0; i < steps; i++) {
            const paramValue = minVal + i * stepSize;
            paramValues.push(paramValue);
            
            const runModel = cloneExpandedModel(expandedModel);
            runModel.parameters[parsedArgs.parameter] = paramValue;
            updateMassActionRates(runModel);
            
            // Carry state from previous step
            if (currentState) {
                for (const sp of runModel.species) {
                    if (currentState[sp.name] !== undefined) {
                        sp.initialConcentration = currentState[sp.name];
                    }
                }
            }
            
            const result = await simulate(0, runModel, {
                method: parsedArgs.method ?? 'ode',
                t_end: tEnd,
                n_steps: 50,
            }, {
                checkCancelled: () => {},
                postMessage: () => {},
            });
            
            const lastPoint = result.data[result.data.length - 1];
            
            // Save endpoint state for next step
            currentState = {};
            for (const key of Object.keys(lastPoint)) {
                if (key !== 'time') currentState[key] = Number(lastPoint[key]);
            }
            
            // Save final state for backward sweep initialization
            if (i === steps - 1) {
                finalForwardState = { ...currentState };
            }
            
            forwardValues.push(Number(lastPoint[obsName] ?? 0));
        }
        
        // Backward sweep - start from LAST forward state (not seed)
        currentState = finalForwardState;
        
        for (let i = 0; i < steps; i++) {
            const paramValue = minVal + (steps - 1 - i) * stepSize;
            
            const runModel = cloneExpandedModel(expandedModel);
            runModel.parameters[parsedArgs.parameter] = paramValue;
            updateMassActionRates(runModel);
            
            // Use carried state from previous step (or final forward state for first step)
            for (const sp of runModel.species) {
                if (currentState[sp.name] !== undefined) {
                    sp.initialConcentration = currentState[sp.name];
                }
            }
            
            const result = await simulate(0, runModel, {
                method: parsedArgs.method ?? 'ode',
                t_end: tEnd,
                n_steps: 50,
            }, {
                checkCancelled: () => {},
                postMessage: () => {},
            });
            
            const lastPoint = result.data[result.data.length - 1];
            
            // Save endpoint state for next step
            currentState = {};
            for (const key of Object.keys(lastPoint)) {
                if (key !== 'time') currentState[key] = Number(lastPoint[key]);
            }
            
            backwardValues.push(Number(lastPoint[obsName] ?? 0));
        }
        
        // Calculate hysteresis: max difference between forward and backward
        let maxDiff = 0;
        let hysteresisRegion: { param: number; diff: number } | null = null;
        
        for (let i = 0; i < forwardValues.length; i++) {
            const diff = Math.abs(forwardValues[i] - backwardValues[i]);
            if (diff > maxDiff) {
                maxDiff = diff;
                hysteresisRegion = { param: paramValues[i], diff };
            }
        }
        
        const scale = Math.max(...forwardValues.map(Math.abs), 1e-9);
        const normalizedDiff = maxDiff / scale;
        
        const hasHysteresis = normalizedDiff > 0.05;
        
        return createToolResult({
            has_hysteresis: hasHysteresis,
            hysteresis_magnitude: normalizedDiff,
            hysteresis_region: hysteresisRegion,
            forward_curve: paramValues.map((p, i) => ({ param: p, value: forwardValues[i] })),
            backward_curve: paramValues.map((p, i) => ({ param: p, value: backwardValues[i] })),
            interpretation: hasHysteresis 
                ? `Detected hysteresis (${(normalizedDiff * 100).toFixed(1)}% difference). The system shows history-dependent behavior - parameter changes produce different steady-states depending on sweep direction.`
                : 'No significant hysteresis detected - system behaves reversibly in parameter range.',
        });
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
