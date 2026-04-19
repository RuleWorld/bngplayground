import { z } from 'zod';

export const simulationMethods = ['ode', 'ssa', 'nf', 'default'] as const;
export const solverValues = ['auto', 'cvode', 'cvode_auto', 'cvode_sparse', 'cvode_jac', 'rosenbrock23', 'rk45', 'rk4', 'webgpu_rk4'] as const;

export const finiteNumber = z.number().finite();
export const positiveInt = z.number().int().positive();

export const parseBnglArgsSchema = z.object({
    code: z.string(),
}).strict();

export const generateNetworkArgsSchema = z.object({
    code: z.string(),
    max_agents: positiveInt.optional(),
    max_reactions: positiveInt.optional(),
    max_iterations: positiveInt.optional(),
    max_agg: positiveInt.optional(),
}).strict();

export const simulateArgsSchema = z.object({
    code: z.string(),
    method: z.enum(simulationMethods).optional(),
    t_end: finiteNumber.nonnegative().optional(),
    n_steps: positiveInt.optional(),
    solver: z.enum(solverValues).optional(),
    atol: finiteNumber.positive().optional(),
    rtol: finiteNumber.positive().optional(),
    max_steps: positiveInt.optional(),
    seed: z.number().int().optional(),
    sparse: z.boolean().optional(),
    include_species_data: z.boolean().optional(),
    max_agents: positiveInt.optional(),
    max_reactions: positiveInt.optional(),
    max_iterations: positiveInt.optional(),
    max_agg: positiveInt.optional(),
    record_firings: z.boolean().optional()
        .describe('Record reaction firing events during SSA (enables reaction_information_flow downstream). Only meaningful when method="ssa".'),
    max_firing_events: positiveInt.optional()
        .describe('Cap on the SSA firing log size (default 100000)'),
}).strict();

export const parameterScanArgsSchema = z.object({
    code: z.string(),
    parameter: z.string(),
    start: finiteNumber,
    end: finiteNumber,
    steps: positiveInt,
    parameter2: z.string().optional(),
    start2: finiteNumber.optional(),
    end2: finiteNumber.optional(),
    steps2: positiveInt.optional(),
    logarithmic: z.boolean().optional(),
    method: z.enum(simulationMethods).optional(),
    t_end: finiteNumber.nonnegative().optional(),
    n_steps: positiveInt.optional(),
    solver: z.enum(solverValues).optional(),
    atol: finiteNumber.positive().optional(),
    rtol: finiteNumber.positive().optional(),
    max_steps: positiveInt.optional(),
    seed: z.number().int().optional(),
    sparse: z.boolean().optional(),
    max_agents: positiveInt.optional(),
    max_reactions: positiveInt.optional(),
    max_iterations: positiveInt.optional(),
    max_agg: positiveInt.optional(),
}).strict();

export const validateModelArgsSchema = z.object({
    code: z.string(),
    include_nfsim: z.boolean().optional(),
}).strict();

export const getContactMapArgsSchema = z.object({
    code: z.string(),
}).strict();
