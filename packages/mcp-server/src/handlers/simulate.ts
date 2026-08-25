import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { NetworkGenerationLimitError, simulate, loadEvaluator, type SimulationResults } from '@bngplayground/engine';
import { ToolArgs, ToolResult } from '../types/index.js';
import { simulateArgsSchema } from '../schemas/index.js';
import { createToolErrorResult, createToolResult, parseArgs, applyNetworkOptions, parseModelOrThrow, buildSimulationOptions, expandModel } from '../services/engine.js';
import { structureError } from '../services/errors.js';

function toObservablesOnlyPayload(results: SimulationResults): Omit<SimulationResults, 'expandedReactions' | 'expandedSpecies' | 'speciesHeaders' | 'speciesData' | 'speciesDataBySuffix'> {
    // Strip expanded network and per-species trajectories for token-efficient MCP responses.
    const {
        expandedReactions,
        expandedSpecies,
        speciesHeaders,
        speciesData,
        speciesDataBySuffix,
        ...observablesOnly
    } = results;
    void expandedReactions;
    void expandedSpecies;
    void speciesHeaders;
    void speciesData;
    void speciesDataBySuffix;
    return observablesOnly;
}

interface SimulationWarning {
    message?: string;
    warning: string;
}

function getSimulationWarning(message: unknown): SimulationWarning | undefined {
    if (typeof message !== 'object' || message === null || !('warning' in message)) return undefined;
    const warning = Reflect.get(message, 'warning');
    if (typeof warning !== 'string') return undefined;
    const detail = Reflect.get(message, 'message');
    return {
        warning,
        ...(typeof detail === 'string' ? { message: detail } : {}),
    };
}

function throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) return;
    const error = new Error('Simulation request was cancelled.');
    error.name = 'AbortError';
    throw error;
}

export async function handleSimulate(args: ToolArgs, signal?: AbortSignal): Promise<ToolResult<any>> {
    const parsedArgs = parseArgs('simulate', simulateArgsSchema, args);
    try {
        let code = '';
        if (parsedArgs.file !== undefined) {
            const baseDir = process.cwd();
            const resolvedPath = resolve(baseDir, parsedArgs.file);
            const safeBase = baseDir.endsWith(sep) ? baseDir : baseDir + sep;

            // SECURITY: Validate boundaries to prevent path traversal
            if (!resolvedPath.startsWith(safeBase) && resolvedPath !== baseDir) {
                throw new Error(`Access denied: Invalid file path`);
            }
            code = readFileSync(resolvedPath, 'utf-8');
        } else {
            code = parsedArgs.code ?? '';
        }

        const model = applyNetworkOptions(parseModelOrThrow(code), parsedArgs);
        const expandedModel = await expandModel(model);
        const simulationOptions = buildSimulationOptions(parsedArgs);
        const outputMode = parsedArgs.output_mode ?? 'full';

        if (parsedArgs.include_species_data !== undefined) {
            simulationOptions.includeSpeciesData = parsedArgs.include_species_data;
        }
        if (outputMode === 'observables_only') {
            simulationOptions.includeSpeciesData = false;
        }

        await loadEvaluator();
        let solverFailure: SimulationWarning | undefined;
        const results = await simulate(0, expandedModel, simulationOptions, {
            checkCancelled: () => throwIfAborted(signal),
            postMessage: (message: unknown) => {
                solverFailure ??= getSimulationWarning(message);
            },
        });

        const payload = outputMode === 'observables_only'
            ? toObservablesOnlyPayload(results)
            : results;

        if (solverFailure) {
            const lastRow = payload.data.at(-1);
            return createToolErrorResult({
                success: false,
                stage: 'simulation',
                error: solverFailure.warning,
                message: solverFailure.message ?? 'The ODE solver stopped before reaching the requested end time.',
                solver: simulationOptions.solver,
                requested_end_time: simulationOptions.t_end,
                last_time: typeof lastRow?.time === 'number' ? lastRow.time : null,
                partial_result: payload,
            });
        }
        return createToolResult(payload);
    } catch (error: any) {
        let stage: string;
        if (error instanceof NetworkGenerationLimitError) {
            stage = 'network_expansion';
            return createToolErrorResult({
                success: false,
                stage,
                error: error.message,
                species_generated: error.speciesCount,
                reactions_generated: error.reactionCount,
                last_rule: error.lastRule,
            });
        }
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolErrorResult(structured);
    }
}
