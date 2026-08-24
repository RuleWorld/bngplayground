import { z } from 'zod';

export const simulationMethods = ['ode', 'ssa', 'nf', 'default'] as const;
export const solverValues = ['auto', 'cvode', 'cvode_auto', 'cvode_sparse', 'cvode_jac', 'rosenbrock23', 'rk45', 'rk4', 'webgpu_rk4'] as const;
const simulateOutputModes = ['full', 'observables_only'] as const;

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
    code: z.string().optional(),
    file: z.string().optional()
        .describe('Path to local BNGL file. If provided, overrides code.'),
    output_mode: z.enum(simulateOutputModes).optional()
        .describe('Response payload mode. Use "observables_only" for LLM clients unless expanded network data is required.'),
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
}).strict().refine((value) => value.code !== undefined || value.file !== undefined, {
    message: 'Provide code or file.',
});

export const parameterScanArgsSchema = z.object({
    code: z.string().refine(
        (value) => value.trim().length > 0,
        'Model code must be a non-empty string',
    ),
    parameter: z.string().trim().min(1, 'Parameter name must be a non-empty string'),
    start: finiteNumber,
    end: finiteNumber,
    steps: positiveInt,
    parameter2: z.string().trim().min(1, 'parameter2 must be a non-empty string').optional(),
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
}).strict().superRefine((value, context) => {
    const hasParameter2 = value.parameter2 !== undefined;
    const hasAnySecondaryRange =
        value.start2 !== undefined || value.end2 !== undefined || value.steps2 !== undefined;

    if (hasParameter2) {
        if (value.parameter2 === value.parameter) {
            context.addIssue({
                code: 'custom',
                path: ['parameter2'],
                message: 'parameter_scan requires two distinct parameters for 2D scans',
            });
        }
        if (value.start2 === undefined || value.end2 === undefined || value.steps2 === undefined) {
            context.addIssue({
                code: 'custom',
                path: ['parameter2'],
                message: 'parameter_scan requires start2, end2, and steps2 when parameter2 is provided',
            });
        }
    } else if (hasAnySecondaryRange) {
        context.addIssue({
            code: 'custom',
            path: ['parameter2'],
            message: 'parameter2 is required when start2, end2, or steps2 is provided',
        });
    }

    if (value.logarithmic === true) {
        if (value.start <= 0 || value.end <= 0) {
            context.addIssue({
                code: 'custom',
                path: ['logarithmic'],
                message: 'Logarithmic parameter scans require positive start and end bounds',
            });
        }
        if (hasParameter2 && (
            value.start2 === undefined || value.end2 === undefined ||
            value.start2 <= 0 || value.end2 <= 0
        )) {
            context.addIssue({
                code: 'custom',
                path: ['logarithmic'],
                message: 'Logarithmic 2D parameter scans require positive start2 and end2 bounds',
            });
        }
    }

    const combinations = value.steps * (hasParameter2 && value.steps2 !== undefined ? value.steps2 : 1);
    if (combinations > 400) {
        context.addIssue({
            code: 'custom',
            path: ['steps'],
            message: 'parameter_scan supports at most 400 simulation combinations per request',
        });
    }
});

export const validateModelArgsSchema = z.object({
    code: z.string(),
    include_nfsim: z.boolean().optional(),
}).strict();

export const getContactMapArgsSchema = z.object({
    code: z.string(),
}).strict();

export const verifyModelArgsSchema = z.object({
    code: z.string(),
    query: z.string(),
    maxSpecies: z.number().int().positive().optional(),
}).strict();

const flatStructureDataPointSchema = z.object({
    time: finiteNumber,
    observable: z.string().trim().min(1),
    value: finiteNumber,
    error: finiteNumber.positive().optional(),
}).strict();

const groupedStructureDataPointSchema = z.object({
    time: finiteNumber,
    observables: z.record(z.string(), finiteNumber)
        .refine((observables) => Object.keys(observables).length > 0, 'At least one observable is required'),
}).strict();

export const searchStructureArgsSchema = z.object({
    code: z.string().trim().min(1),
    experimental_data: z.array(z.union([
        flatStructureDataPointSchema,
        groupedStructureDataPointSchema,
    ])).min(1),
    inclusion_prior: finiteNumber.min(0).max(1).optional(),
    n_particles: positiveInt.optional(),
    n_generations: positiveInt.optional(),
}).strict();
