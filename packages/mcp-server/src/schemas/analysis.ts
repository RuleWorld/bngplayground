import { z } from 'zod';
import { simulationMethods, solverValues, finiteNumber, positiveInt } from './core.js';

export const sobolSensitivityArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    parameters: z.array(z.object({
        name: z.string(),
        min: z.number(),
        max: z.number(),
    })).min(1).describe('Parameters to analyze with their bounds (must be non-empty)'),
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

export const perturbationScreenArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    observables: z.array(z.string()).min(1)
        .describe('Observable names to track deviation against'),
    perturbations: z.array(z.enum([
        'rule_knockout',
        'species_knockdown',
        'molecule_knockout',
        'pairwise_rules',
    ])).min(1).describe('Perturbation classes to run'),
    t_end: finiteNumber.positive().describe('Simulation end time'),
    n_steps: positiveInt.describe('Output timepoints per simulation'),
    knockdown_fraction: finiteNumber.min(0).max(1).optional()
        .describe('Knockdown fraction for species_knockdown (0 = full KO, default 0)'),
    metric: z.enum(['max_absolute', 'integral_absolute', 'endpoint', 'rmsd']).optional()
        .describe('How to score deviation from wild type (default "rmsd")'),
    max_pairwise: positiveInt.optional()
        .describe('Cap on pairwise-rule pairs to avoid combinatorial blowup (default 500)'),
    method: z.enum(simulationMethods).optional(),
    solver: z.enum(solverValues).optional(),
}).strict();

export const doseResponseArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    input_parameter: z.string()
        .describe('Name of the parameter to sweep (must be declared in model.parameters)'),
    input_min: finiteNumber.describe('Lowest dose value'),
    input_max: finiteNumber.describe('Highest dose value (must be > input_min)'),
    observables: z.array(z.string()).min(1)
        .describe('Observable names to track across the dose sweep'),
    n_points: positiveInt.optional()
        .describe('Number of dose points (default 50)'),
    log_scale: z.boolean().optional()
        .describe('Use logarithmic spacing between input_min and input_max (default true)'),
    method: z.enum(['simulate', 'rootfind']).optional()
        .describe('Steady-state resolution method (default "rootfind")'),
    t_end: finiteNumber.positive().optional()
        .describe('Simulation end time when method="simulate" (default 1e4)'),
    tolerance: finiteNumber.positive().optional()
        .describe('Newton-Raphson convergence tolerance (default 1e-6)'),
    detect_bifurcations: z.boolean().optional()
        .describe('Flag saddle-node / Hopf bifurcations via eigenvalue sign changes (default false)'),
}).strict();

export const firstPassageTimeArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    thresholds: z.array(z.object({
        observable: z.string(),
        value: finiteNumber,
        direction: z.enum(['above', 'below']),
        label: z.string().optional(),
    })).min(1).describe('Threshold-crossing conditions to compute FPT distributions for'),
    n_trajectories: positiveInt.max(500)
        .describe('SSA ensemble size (serial; cap 500)'),
    t_end: finiteNumber.positive().describe('Simulation end time per trajectory'),
    n_steps: positiveInt.describe('Output timepoints per trajectory'),
    seed: z.number().int().optional()
        .describe('Base seed; trajectory i uses seed + i (default 42)'),
}).strict();

export const lnaAnalysisArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    mode: z.enum(['steady_state', 'time_course']).optional()
        .describe('Analysis mode (default "steady_state")'),
    volume: finiteNumber.positive().optional()
        .describe('System volume V; covariance scales as 1/V (default 1)'),
    t_end: finiteNumber.positive().optional()
        .describe('Time-course end time (required when mode="time_course")'),
    n_steps: positiveInt.optional()
        .describe('Output timepoints for time-course mode (default 100)'),
    include_covariance_matrix: z.boolean().optional()
        .describe('Return the full covariance matrix (default true; disable for large systems)'),
}).strict();

export const reactionInformationFlowArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    t_end: finiteNumber.positive().describe('SSA simulation end time'),
    n_steps: positiveInt.describe('Output timepoints'),
    seed: z.number().int().optional()
        .describe('Random seed for SSA'),
    bin_width: finiteNumber.positive().optional()
        .describe('Discretization bin width for firing-event time series (auto if omitted)'),
    n_shuffles: positiveInt.optional()
        .describe('Shuffle replicates for p-value estimation (default 200)'),
    history_length: positiveInt.max(8).optional()
        .describe('Transfer-entropy Markov history length (default 1, max 8)'),
    min_co_firings: z.number().int().nonnegative().optional()
        .describe('Minimum co-firing events to report an MI edge (default 0)'),
    compare_structural_graph: z.boolean().optional()
        .describe('Also compute concordant / structural-only / emergent edge sets by comparing the empirical causal graph to the structural rule graph (default false)'),
    max_firing_events: positiveInt.optional()
        .describe('Cap on the firing log size (default 100000)'),
}).strict();

export const qssaReductionArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    mode: z.enum(['analyze', 'apply']).optional()
        .describe('Analyze candidates (default) or apply a reduction'),
    fast_slow_threshold: finiteNumber.positive().optional()
        .describe('Rate-constant ratio above which a species is treated as fast (default 100)'),
    min_fast_reactions: positiveInt.optional()
        .describe('Minimum fast reactions for QSSA consideration (default 2)'),
    species_to_eliminate: z.array(z.string()).optional()
        .describe('Required when mode="apply": species names to remove via QSSA'),
    generate_reduced_model: z.boolean().optional()
        .describe('In analyze mode, also return an estimated speedup (default false)'),
}).strict().refine(
    (data) => data.mode !== 'apply' || (data.species_to_eliminate && data.species_to_eliminate.length > 0),
    {
        message: 'mode="apply" requires a non-empty species_to_eliminate array',
        path: ['species_to_eliminate'],
    },
);

export const temporalAnalysisArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
    t_end: finiteNumber.positive().optional().describe('SSA simulation end time (default: 100)'),
    n_steps: positiveInt.optional().describe('Output timepoints (default: 200)'),
    bin_width: finiteNumber.positive().optional().describe('Discretization bin width'),
}).strict();

export const symbolicSteadyStateArgsSchema = z.object({
    code: z.string().describe('BNGL model code'),
}).strict();
