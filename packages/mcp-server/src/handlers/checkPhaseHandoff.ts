import { ToolArgs, ToolResult } from '../types/index.js';
import { z } from 'zod';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel, cloneExpandedModel, updateMassActionRates } from '../services/engine.js';
import { loadEvaluator, analyzePhaseHandoff } from '@bngplayground/engine';
import { structureError } from '../services/errors.js';

const checkPhaseHandoffArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    parameter: z.string().describe('Parameter to change for phase transition'),
    initial_value: z.number().describe('Initial parameter value'),
    final_value: z.number().describe('Final parameter value after transition'),
    transition_time: z.number().positive().describe('Time for phase 1 (equilibration)'),
    observable: z.string().optional().describe('Observable to track (default: first)'),
    method: z.enum(['ode', 'ssa']).default('ode').describe('Simulation method'),
    t_end: z.number().positive().optional().describe('End time for each phase (default: transition_time)'),
}).strict();

type CheckPhaseHandoffArgs = z.infer<typeof checkPhaseHandoffArgsSchema>;

export async function handleCheckPhaseHandoff(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('check_phase_handoff', checkPhaseHandoffArgsSchema, args) as CheckPhaseHandoffArgs;
        const model = parseModelOrThrow(parsedArgs.code);
        const expandedModel = await expandModel(model);
        
        if (!(parsedArgs.parameter in model.parameters)) {
            throw new Error(`Unknown parameter '${parsedArgs.parameter}'. Available parameters: ${Object.keys(model.parameters).join(', ') || '(none)'}`);
        }
        if (parsedArgs.observable && !model.observables.some((o) => o.name === parsedArgs.observable)) {
            throw new Error(`Unknown observable '${parsedArgs.observable}'. Available observables: ${model.observables.map((o) => o.name).join(', ') || '(none)'}`);
        }

        await loadEvaluator();

        const result = await analyzePhaseHandoff({
            model,
            expandedModel,
            parameter: parsedArgs.parameter,
            initialValue: parsedArgs.initial_value,
            finalValue: parsedArgs.final_value,
            transitionTime: parsedArgs.transition_time,
            observable: parsedArgs.observable,
            method: parsedArgs.method,
            tEnd: parsedArgs.t_end,
            cloneExpandedModel,
            updateMassActionRates,
        });

        return createToolResult(result);
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
