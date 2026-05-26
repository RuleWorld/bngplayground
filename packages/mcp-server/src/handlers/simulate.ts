import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { NetworkGenerationLimitError, simulate, loadEvaluator, type SimulationResults } from '@bngplayground/engine';
import { ToolArgs, ToolResult } from '../types/index.js';
import { simulateArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, applyNetworkOptions, parseModelOrThrow, buildSimulationOptions, expandModel } from '../services/engine.js';
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

export async function handleSimulate(args: ToolArgs): Promise<ToolResult<any>> {
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
        const results = await simulate(0, expandedModel, simulationOptions, {
            checkCancelled: () => { },
            postMessage: () => { },
        });
        if (outputMode === 'observables_only') {
            return createToolResult(toObservablesOnlyPayload(results));
        }
        return createToolResult(results);
    } catch (error: any) {
        let stage = 'simulation';
        if (error instanceof NetworkGenerationLimitError) {
            stage = 'network_expansion';
            return createToolResult({
                success: false,
                stage,
                error: error.message,
                species_generated: error.speciesCount,
                reactions_generated: error.reactionCount,
                last_rule: error.lastRule,
            });
        }
        const structured = structureError(error instanceof Error ? error : new Error(String(error)));
        return createToolResult(structured);
    }
}
