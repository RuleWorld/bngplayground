import {
    BNGLModel,
    parseBNGLWithANTLR,
    generateExpandedNetwork,
    extractMoleculeNames,
    updateMassActionRates,
    findUnreachableRules,
    buildContactMap,
    validateModel,
} from '@bngplayground/engine';
import { z } from 'zod';
import {
    ToolArgs,
    ToolResult,
} from '../types/index.js';

/**
 * Wraps a payload into a standardized Model Context Protocol (MCP) tool response format.
 *
 * MCP clients expect a text representation for human readability and optionally a structured
 * payload for programmatic use. This function takes data (often the output of engine operations),
 * stringifies it into a text array for the `content` field, and embeds the raw data into
 * `structuredContent`.
 *
 * @param data - The structured payload to return to the client.
 * @returns An MCP `ToolResult` containing both a JSON-stringified text representation and the raw structured data.
 *
 * @remarks
 * This function strictly formats responses for the MCP server boundary and contains no engine
 * or BNGL logic. Handlers should use engine functions to perform calculations and pass the result here.
 */
export function createToolResult<T>(data: T): ToolResult<T> {
    const safeData = sanitizeForMcp(data) as T;
    const serialized = JSON.stringify(safeData, null, 2) ?? 'null';
    const result: ToolResult<T> = {
        content: [
            {
                type: 'text',
                text: serialized,
            },
        ],
        structuredContent: safeData,
    };
    if (isStructuredError(safeData)) {
        return { ...result, isError: true };
    }
    return result;
}

/**
 * JSON-RPC cannot carry NaN or infinities. Preserve their meaning at the MCP
 * boundary instead of allowing JSON.stringify to silently turn them into
 * null, which looks like a missing measurement or metric.
 */
export function sanitizeForMcp(value: unknown): unknown {
    if (typeof value === 'number') {
        if (Number.isFinite(value)) return value;
        if (Number.isNaN(value)) return 'NaN';
        return value > 0 ? 'Infinity' : '-Infinity';
    }
    if (Array.isArray(value)) {
        return value.map((entry) => sanitizeForMcp(entry));
    }
    if (value !== null && typeof value === 'object') {
        const sanitized: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value)) {
            sanitized[key] = sanitizeForMcp(entry);
        }
        return sanitized;
    }
    return value;
}

function isStructuredError(value: unknown): value is { code: string; error: string; diagnosis: string; recovery: string } {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.code === 'string'
        && typeof candidate.error === 'string'
        && typeof candidate.diagnosis === 'string'
        && typeof candidate.recovery === 'string';
}

/**
 * Formats an MCP tool failure while preserving a structured diagnostic payload.
 */
export function createToolErrorResult<T>(data: T): ToolResult<T> {
    return {
        ...createToolResult(data),
        isError: true,
    };
}

function formatZodError(toolName: string, args: ToolArgs, error: z.ZodError): Error {
    const issues = error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'arguments';
        return `${path}: ${issue.message}`;
    }).join('; ');
    const received = args === undefined ? 'undefined' : JSON.stringify(args);
    return new Error(`Invalid arguments for ${toolName}: ${issues}. Received: ${received}`);
}

/**
 * Parses and validates tool arguments against a Zod schema.
 *
 * @param toolName - The name of the tool, used for formatting error messages.
 * @param schema - The Zod schema to validate the arguments against.
 * @param args - The unvalidated tool arguments.
 * @returns The parsed and validated arguments.
 * @throws {Error} If validation fails, throws an error formatted with the issues.
 */
export function parseArgs<T extends z.ZodTypeAny>(toolName: string, schema: T, args: ToolArgs): z.infer<T> {
    const parsed = schema.safeParse(args ?? {});
    if (!parsed.success) {
        throw formatZodError(toolName, args, parsed.error);
    }
    return parsed.data;
}

/**
 * Parses a string of BNGL code into a structured BNGLModel.
 *
 * This function attempts to parse the provided BNGL code using the internal
 * `parseBNGLWithANTLR` engine function. If the parsing is successful and a
 * model is produced, it returns the parsed model. If the parsing fails or
 * results in no model, it constructs an error string from the ANTLR parsing
 * errors (combining line, column, and message for each error) and throws a
 * standard Error.
 *
 * @param code The plain text string containing the BNGL code to parse.
 * @returns The parsed BNGLModel object.
 * @throws {Error} If parsing fails, throws an Error containing details about the parse failures.
 */
export function parseModelOrThrow(code: string): BNGLModel {
    const result = parseBNGLWithANTLR(code);
    if (!result.success || !result.model) {
        const message = result.errors.length > 0
            ? result.errors.map((error: any) => `line ${error.line}:${error.column} ${error.message}`).join('; ')
            : 'Unknown BNGL parse failure';
        throw new Error(`BNGL parse failed: ${message}`);
    }
    return result.model;
}

/**
 * Constructs a standardized simulation options object from raw tool arguments.
 *
 * This utility parses and formats simulation parameter keys (such as `method`,
 * `t_end`, `n_steps`, `solver`, `atol`, `rtol`, `max_steps`, `seed`, and `sparse`)
 * to match internal engine configurations, providing sensible defaults where necessary.
 *
 * @param args - An object containing optional simulation settings:
 *   - `method` (string): 'ode', 'ssa', or 'nfsim' (defaults to 'ode')
 *   - `t_end` (number): The end time of the simulation (defaults to 10)
 *   - `n_steps` (number): Number of reporting intervals (defaults to 100)
 *   - `solver` (string): The mathematical solver name (e.g., 'auto', 'cvode')
 *   - `atol` (number): Absolute tolerance limit
 *   - `rtol` (number): Relative tolerance limit
 *   - `max_steps` (number): Maximum integration steps
 *   - `seed` (number): Random number generator seed
 *   - `sparse` (boolean): Flag to enable sparse solver optimizations
 * @returns A structured simulation options object configured for the execution loop.
 *
 * @remarks
 * For ODE simulations, if the solver parameter is not explicitly defined, it defaults
 * to 'auto'. This is a server service-layer mapping utility and does not execute or
 * run the actual simulation.
 */
export function buildSimulationOptions(args: any) {
    const simulationOptions: any = {
        method: args.method ?? 'ode',
        t_end: args.t_end ?? 10,
        n_steps: args.n_steps ?? 100,
        ...(args.solver !== undefined ? { solver: args.solver } : {}),
        ...(args.atol !== undefined ? { atol: args.atol } : {}),
        ...(args.rtol !== undefined ? { rtol: args.rtol } : {}),
        ...(args.max_steps !== undefined ? { maxSteps: args.max_steps } : {}),
        ...(args.seed !== undefined ? { seed: args.seed } : {}),
        ...(args.sparse !== undefined ? { sparse: args.sparse } : {}),
    };

    if (simulationOptions.method === 'ode' && simulationOptions.solver === undefined) {
        simulationOptions.solver = 'auto';
    }

    return simulationOptions;
}

/**
 * Marks an internal simulation as consuming observable headers/data only.
 * Public simulation defaults remain unchanged; this is for high-volume analysis loops.
 */
export function withDataOnlySimulationOutput<const T extends Record<string, unknown>>(options: T): T & {
    includeSpeciesData: false;
    includeExpandedNetwork: false;
} {
    return {
        ...options,
        includeSpeciesData: false,
        includeExpandedNetwork: false,
    };
}

/**
 * Merges network generation limits from MCP tool arguments into the model's configuration.
 * Adapts user-provided MCP arguments (e.g., max_agents) to internal engine configuration structures (e.g., maxSpecies).
 * If no overrides are provided, it returns the exact same model instance.
 * Otherwise, it returns a shallow clone with a newly created `networkOptions` object containing the merged limits.
 *
 * @param model - The parsed BNGLModel object.
 * @param args - An object containing optional network generation override values (max_agents, max_reactions, max_iterations, max_agg).
 * @returns The original model if no overrides exist, otherwise a cloned model with updated networkOptions.
 */
export function applyNetworkOptions<T extends { max_agents?: number; max_reactions?: number; max_iterations?: number; max_agg?: number }>(
    model: BNGLModel,
    args: T,
): BNGLModel {
    const hasOverrides = args.max_agents !== undefined
        || args.max_reactions !== undefined
        || args.max_iterations !== undefined
        || args.max_agg !== undefined;

    if (!hasOverrides) {
        return model;
    }

    return {
        ...model,
        networkOptions: {
            ...(model.networkOptions ?? {}),
            ...(args.max_agents !== undefined ? { maxSpecies: args.max_agents } : {}),
            ...(args.max_reactions !== undefined ? { maxReactions: args.max_reactions } : {}),
            ...(args.max_iterations !== undefined ? { maxIter: args.max_iterations } : {}),
            ...(args.max_agg !== undefined ? { maxAgg: args.max_agg } : {}),
        },
    };
}

/**
 * Asynchronously expands a BNGL model's reaction network by generating all possible species and reactions.
 *
 * This function calls the underlying engine's `generateExpandedNetwork` using empty progress and
 * cancellation callbacks, meaning it does not report progress and cannot be interrupted midway.
 * It is primarily used when network expansion must be fully completed before subsequent steps
 * (like simulation or analysis) can proceed.
 *
 * @param model The unexpanded or partially expanded BNGLModel object.
 * @returns A promise that resolves to the fully expanded BNGLModel.
 */
export async function expandModel(model: BNGLModel): Promise<BNGLModel> {
    return generateExpandedNetwork(
        model,
        () => { },
        () => { },
    );
}

// Molecule-name extraction and unreachable rules analysis live in `@bngplayground/engine`;
// re-exported here so existing importers of this module keep working.
export { extractMoleculeNames, findUnreachableRules, validateModel, buildContactMap };

export function assertScannableParameter(model: BNGLModel, parameter: string): void {
    if (!(parameter in model.parameters)) {
        throw new Error(`Unknown parameter for parameter_scan: ${parameter}`);
    }
}

/**
 * Mutates the model in-place by evaluating symbolic functional rates and updating
 * the reaction's concrete `rateConstant`. Fails silently and preserves the existing
 * rate if evaluation fails. Clears evaluator caches after processing.
 *
 * Note: This currently reimplements logic from the engine package (`DoseResponse.ts`),
 * whereas MCP tools should ideally call engine functions instead of duplicating logic.
 *
 * @param model - The BNGLModel to update.
 */

/**
 * Creates a deep copy of a BNGLModel using structuredClone.
 *
 * Note: This currently reimplements logic from the engine package (`DoseResponse.ts`),
 * whereas MCP tools should ideally call engine functions instead of duplicating logic.
 *
 * @param model - The expanded BNGLModel to clone.
 * @returns A deep copy of the provided model.
 */
export function cloneExpandedModel(model: BNGLModel): BNGLModel {
    return structuredClone(model);
}

export { updateMassActionRates };
