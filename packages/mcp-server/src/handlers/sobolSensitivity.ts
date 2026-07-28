import { sobolSensitivity, simulate, loadEvaluator } from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { sobolSensitivityArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, applyNetworkOptions, parseModelOrThrow, expandModel, buildSimulationOptions, cloneExpandedModel, updateMassActionRates } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleSobolSensitivity(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('sobol_sensitivity', sobolSensitivityArgsSchema, args);
        const model = applyNetworkOptions(parseModelOrThrow(parsedArgs.code), parsedArgs);
        const expandedModel = await expandModel(model);

        const modelParameterNames = new Set(Object.keys(expandedModel.parameters));
        const unknownParameters = parsedArgs.parameters
            .map((p: any) => p.name)
            .filter((name: string) => !modelParameterNames.has(name));
        if (unknownParameters.length > 0) {
            throw new Error(`Unknown Sobol parameters: ${unknownParameters.join(', ')}. Available parameters: ${Array.from(modelParameterNames).join(', ')}`);
        }

        const invalidBounds = parsedArgs.parameters.filter((p: any) => !Number.isFinite(p.min) || !Number.isFinite(p.max) || p.min >= p.max);
        if (invalidBounds.length > 0) {
            const details = invalidBounds.map((p: any) => `${p.name} [min=${p.min}, max=${p.max}]`).join('; ');
            throw new Error(`Invalid Sobol parameter bounds (expected finite min < max): ${details}`);
        }

        const modelObservableNames = new Set(expandedModel.observables.map((o) => o.name));
        if (parsedArgs.observables && parsedArgs.observables.length > 0) {
            const unknownObservables = parsedArgs.observables.filter((name: string) => !modelObservableNames.has(name));
            if (unknownObservables.length > 0) {
                throw new Error(`Unknown Sobol observables: ${unknownObservables.join(', ')}. Available observables: ${Array.from(modelObservableNames).join(', ')}`);
            }
        }

        const simOptions = buildSimulationOptions(parsedArgs);
        await loadEvaluator();

        const results = await sobolSensitivity({
            simulate: async (overrides) => {
                const runModel = cloneExpandedModel(expandedModel);
                Object.entries(overrides).forEach(([k, v]) => {
                    runModel.parameters[k] = v;
                });
                updateMassActionRates(runModel);
                return simulate(0, runModel, simOptions, {
                    checkCancelled: () => { },
                    postMessage: () => { },
                });
            },
            params: parsedArgs.parameters.map((p: any) => ({
                name: p.name,
                min: p.min,
                max: p.max,
            })),
            observables: parsedArgs.observables,
            N: parsedArgs.n_samples ?? 512,
            seed: parsedArgs.seed ?? 42,
            nBootstrap: parsedArgs.n_bootstrap ?? 500,
            logScale: parsedArgs.log_scale,
        });

        if (!results || results.length === 0) {
            throw new Error('Sobol sensitivity produced no results. Check that requested observables exist and simulation output is non-empty.');
        }

        return createToolResult(results);
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
