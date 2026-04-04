import { z } from 'zod';
import { simulationMethods, solverValues, finiteNumber, positiveInt } from './core.js';

export const sobolSensitivityArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    parameters: z.array(z.object({
        name: z.string(),
        min: z.number(),
        max: z.number(),
    })).describe('Parameters to analyze with their bounds'),
    observables: z.array(z.string()).optional().describe('Observable names to analyze (default: all)'),
    n_samples: positiveInt.optional().describe('Number of Saltelli base samples (default: 512)'),
    n_bootstrap: positiveInt.optional().describe('Bootstrap replicates for CIs (default: 500)'),
    log_scale: z.boolean().optional().describe('Use log-uniform sampling'),
    seed: z.number().int().optional().describe('Random seed'),
    method: z.enum(simulationMethods).optional(),
    t_end: finiteNumber.nonnegative().optional(),
    n_steps: positiveInt.optional(),
    solver: z.enum(solverValues).optional(),
    atol: finiteNumber.positive().optional(),
    rtol: finiteNumber.positive().optional(),
    max_agents: positiveInt.optional(),
    max_reactions: positiveInt.optional(),
}).strict();

export const computeFimArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    parameters: z.array(z.string()).optional().describe('Parameter names to include in FIM (default: all)'),
    all_timepoints: z.boolean().optional().describe('Use all timepoints (default: true)'),
    log_parameters: z.boolean().optional().describe('Use log-parameter sensitivities'),
    approx_profile: z.boolean().optional().describe('Run approximate 1D profile scans'),
    compute_collinearity: z.boolean().optional().describe('Compute collinearity index'),
    collinearity_subset_size: positiveInt.optional().describe('Subset size for collinearity (default: 2)'),
    method: z.enum(simulationMethods).optional(),
    t_end: finiteNumber.nonnegative().optional(),
    n_steps: positiveInt.optional(),
    solver: z.enum(solverValues).optional(),
    atol: finiteNumber.positive().optional(),
    rtol: finiteNumber.positive().optional(),
    max_agents: positiveInt.optional(),
    max_reactions: positiveInt.optional(),
}).strict();

export const identifiabilityArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    parameters: z.array(z.string()).optional().describe('Parameters to profile (default: all)'),
    data: z.array(z.object({
        time: z.number(),
        observables: z.record(z.string(), z.number()),
    })).describe('Experimental data for SSR computation'),
    n_grid: positiveInt.optional().describe('Grid points per parameter (default: 20)'),
    range_factor: finiteNumber.positive().optional().describe('Grid range factor (default: 10)'),
    reoptimize: z.boolean().optional().describe('Re-optimize nuisance params (default: true)'),
    alpha: finiteNumber.optional().describe('Confidence level (default: 0.95)'),
    method: z.enum(simulationMethods).optional(),
    t_end: finiteNumber.nonnegative().optional(),
    n_steps: positiveInt.optional(),
    solver: z.enum(solverValues).optional(),
    atol: finiteNumber.positive().optional(),
    rtol: finiteNumber.positive().optional(),
    max_agents: positiveInt.optional(),
    max_reactions: positiveInt.optional(),
}).strict();

export const bayesianInferenceArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    priors: z.array(z.object({
        name: z.string(),
        distribution: z.enum(['uniform', 'log-uniform', 'normal']),
        min: z.number().optional(),
        max: z.number().optional(),
        mean: z.number().optional(),
        std: z.number().optional(),
    })).describe('Prior distribution specifications for each parameter'),
    data: z.array(z.object({
        time: z.number(),
        observables: z.record(z.string(), z.number()),
    })).describe('Experimental data to fit against'),
    observables: z.array(z.string()).optional().describe('Observables to compare'),
    distance: z.enum(['sse', 'rmse', 'weighted_sse', 'chi_squared']).optional().describe('Distance metric (default: sse)'),
    n_particles: positiveInt.optional().describe('Number of particles (default: 500)'),
    n_populations: positiveInt.optional().describe('Number of SMC populations (default: 10)'),
    max_simulations: positiveInt.optional().describe('Max total simulations (default: 100000)'),
    seed: z.number().int().optional().describe('Random seed'),
    method: z.enum(simulationMethods).optional(),
    t_end: finiteNumber.nonnegative().optional(),
    n_steps: positiveInt.optional(),
    solver: z.enum(solverValues).optional(),
    atol: finiteNumber.positive().optional(),
    rtol: finiteNumber.positive().optional(),
    max_agents: positiveInt.optional(),
    max_reactions: positiveInt.optional(),
}).strict();
