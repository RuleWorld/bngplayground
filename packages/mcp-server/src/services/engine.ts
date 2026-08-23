import {
    BNGLModel,
    BNGLMoleculeType,
    ReactionRule,
    BNGLParser,
    parseBNGLWithANTLR,
    generateExpandedNetwork,
    validateModelForNFsim,
    MassBalance,
    extractMoleculeNames,
    updateMassActionRates,
    findUnreachableRules,
    buildContactMap,
} from '@bngplayground/engine';
import { z } from 'zod';
import {
    ToolArgs,
    ToolResult,
    ContactMap,
    ContactNode,
    ContactEdge,
    ValidateModelResult,
    ValidationMessage,
    ParsedSpeciesGraph,
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
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(data, null, 2),
            },
        ],
        structuredContent: data,
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
export { extractMoleculeNames, findUnreachableRules };

/**
 * Performs a comprehensive validation check on a parsed BioNetGen model.
 *
 * This function aggregates error, warning, and informational feedback from multiple
 * model verification engines:
 *  1. **Observables Check**: Ensures the model has at least one observable pattern.
 *  2. **Parameters Check**: Validates that all parameters are finite numbers and warns
 *     about unusual parameter magnitudes (extremely large or small nonzero values).
 *  3. **Reachable Rules**: Checks for reaction rules that may never fire due to reactant
 *     unreachability from seed species (delegated to the shared engine `findUnreachableRules`).
 *  4. **Observable Patterns**: Validates the syntax of all defined observables.
 *  5. **NFsim Compatibility**: If requested, validates grammar and features for NFsim
 *     compatibility (delegated to the engine's `validateModelForNFsim`).
 *  6. **Mass Balance**: Verifies atom/mass conservation across reaction rules (delegated
 *     to the engine's `MassBalance.checkMassBalance`).
 *
 * @param model - The parsed `BNGLModel` to validate.
 * @param includeNFsim - A flag to enable or disable extra NFsim-specific validation checks.
 * @returns A structured `ValidateModelResult` describing all issues (errors, warnings, info messages) found.
 *
 * @remarks
 * To maintain proper architectural separation and comply with repository-level invariants,
 * this validation helper strictly calls core engine capabilities (such as `findUnreachableRules`
 * and `MassBalance` from `@bngplayground/engine`) instead of reimplementing any BNGL parsing
 * or biological logic itself.
 */
export function validateModel(model: BNGLModel, includeNFsim: boolean): ValidateModelResult {
    const errors: ValidationMessage[] = [];
    const warnings: ValidationMessage[] = [];
    const info: ValidationMessage[] = [];

    if (model.observables.length === 0) {
        errors.push({
            source: 'model',
            code: 'MISSING_OBSERVABLES',
            severity: 'error',
            message: 'No observables defined. Add at least one observable to inspect simulation output.',
            relatedElement: 'observables',
        });
    }

    Object.entries(model.parameters).forEach(([name, value]) => {
        if (!Number.isFinite(value)) {
            errors.push({
                source: 'model',
                code: 'NON_FINITE_PARAMETER',
                severity: 'error',
                message: `Parameter ${name} is not a finite number.`,
                relatedElement: name,
            });
            return;
        }

        if (Math.abs(value) >= 1e6 || (Math.abs(value) > 0 && Math.abs(value) <= 1e-6)) {
            warnings.push({
                source: 'model',
                code: 'UNUSUAL_PARAMETER_MAGNITUDE',
                severity: 'warning',
                message: `Parameter ${name} has an unusual magnitude (${value}).`,
                relatedElement: name,
            });
        }
    });

    const unreachableRules = findUnreachableRules(model);
    if (unreachableRules.length > 0) {
        warnings.push({
            source: 'model',
            code: 'UNREACHABLE_RULES',
            severity: 'warning',
            message: `${unreachableRules.length} rule(s) may never trigger because their reactants are not reachable from seed species.`,
            relatedElement: unreachableRules.join(', '),
        });
    }

    model.observables.forEach((observable) => {
        const patternIssue = BNGLParser.validatePattern(observable.pattern);
        if (patternIssue) {
            errors.push({
                source: 'observable',
                code: 'INVALID_OBSERVABLE_PATTERN',
                severity: 'error',
                message: `Observable ${observable.name} has an invalid pattern: ${patternIssue}`,
                relatedElement: observable.name,
            });
        }
    });

    const nfsim = includeNFsim ? validateModelForNFsim(model) : null;
    if (nfsim) {
        nfsim.errors.forEach((issue: any) => {
            errors.push({
                source: 'nfsim',
                code: issue.type,
                severity: issue.severity ?? 'error',
                message: issue.message,
            });
        });
        nfsim.warnings.forEach((issue: any) => {
            warnings.push({
                source: 'nfsim',
                code: issue.type,
                severity: issue.severity ?? 'warning',
                message: issue.message,
            });
        });
        nfsim.recommendations.forEach((recommendation: any) => {
            info.push({
                source: 'nfsim',
                code: recommendation.type,
                severity: 'info',
                message: recommendation.message,
            });
        });
    }

    const massBalanceIssues = MassBalance.checkMassBalance(model);
    massBalanceIssues.forEach((issue: { ruleName: string; issue: string; severity: 'error' | 'warning' }) => {
        warnings.push({
            source: 'model',
            code: 'MASS_BALANCE_IMBALANCE',
            severity: issue.severity,
            message: `Rule "${issue.ruleName}": ${issue.issue}`,
        });
    });

    return {
        valid: errors.length === 0,
        parseSuccess: true,
        parseErrors: [],
        errors,
        warnings,
        info,
        summary: {
            errors: errors.length,
            warnings: warnings.length,
            info: info.length,
        },
        nfsim: nfsim as any,
    };
}

export { buildContactMap };

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
