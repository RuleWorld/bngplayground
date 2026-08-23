import { z } from 'zod';

export const fitParametersArgsSchema = z.object({
    code: z.string().describe('BNGL code containing the model and observables'),
    parameters: z.record(z.string(), z.object({
        min: z.number(),
        max: z.number(),
        initial: z.number().optional(),
    })).describe('Map of parameter names to their fitting bounds { min, max, initial? }'),
    data: z.array(z.object({
        time: z.number(),
        observables: z.record(z.string(), z.number()),
    })).describe('Experimental data points: list of { time, observables: { obsName: value } }'),
    method: z.enum(['ode', 'ssa']).default('ode').describe('Simulation method to use during fitting'),
    algorithm: z.enum(['nelder-mead', 'sbplx']).default('nelder-mead').describe('Optimization algorithm'),
    max_iterations: z.number().optional().describe('Maximum iterations for the optimizer'),
}).strict();

export const diagnoseArgsSchema = z.object({
    code: z.string().describe('BNGL code to analyze'),
}).strict();

export const importPetabArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    petab_parameters: z.string().describe('PEtab parameters TSV content'),
    petab_measurements: z.string().describe('PEtab measurements TSV content'),
    petab_conditions: z.string().optional().describe('PEtab conditions TSV content'),
    algorithm: z.enum(['nelder-mead', 'sbplx', 'de']).default('nelder-mead'),
    max_iterations: z.number().optional(),
}).strict();

export const reduceModelArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    parameters: z.record(z.string(), z.object({
        min: z.number(),
        max: z.number(),
        initial: z.number().optional(),
    })).describe('Parameters to fit (same as fit_parameters)'),
    data: z.array(z.object({
        time: z.number(),
        observables: z.record(z.string(), z.number()),
    })).describe('Experimental data'),
    lambda: z.number().default(0.01).describe('Regularization strength'),
    regularization: z.enum(['l1', 'l2', 'elastic-net']).default('l1'),
    prune_threshold: z.number().default(0.01).describe('Relative threshold for pruning (0.01 = 1% of nominal)'),
    method: z.enum(['ode', 'ssa']).default('ode'),
    max_iterations: z.number().default(1000),
}).strict();

export const pkpdArgsSchema = z.object({
    action: z.enum(['generate_model', 'simulate_dosing', 'compute_metrics', 'population_simulation']),
    model_type: z.string().optional(),
    drug_name: z.string().optional(),
    route: z.string().optional(),
    dose: z.number().finite().positive().max(1000000).optional(),
    code: z.string().optional(),
    observable: z.string().optional(),
    n_patients: z.number().int().positive().max(1000).optional(),
    dosing_interval: z.number().finite().positive().max(1000).optional(),
    n_doses: z.number().int().positive().max(100).optional(),
}).strict();
