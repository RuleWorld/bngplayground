import { ToolArgs, ToolResult } from '../types/index.js';
import { z } from 'zod';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel, cloneExpandedModel, updateMassActionRates } from '../services/engine.js';
import { loadEvaluator, analyzeHysteresis } from '@bngplayground/engine';
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
        
        await loadEvaluator();
        
        const result = await analyzeHysteresis({
            model,
            expandedModel,
            parameter: parsedArgs.parameter,
            sweepRange: parsedArgs.sweep_range as [number, number],
            steps,
            observable: parsedArgs.observable ?? '',
            method: parsedArgs.method ?? 'ode',
            tEnd,
            cloneExpandedModel,
            updateMassActionRates,
        });

        return createToolResult(result);
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
