import { abcSMC, simulate, loadEvaluator, type ABCSMCConfig } from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { bayesianInferenceArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, applyNetworkOptions, parseModelOrThrow, expandModel, buildSimulationOptions, withDataOnlySimulationOutput, cloneExpandedModel, updateMassActionRates } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleBayesianInference(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('bayesian_inference', bayesianInferenceArgsSchema, args);
        const model = applyNetworkOptions(parseModelOrThrow(parsedArgs.code), parsedArgs);
        const expandedModel = await expandModel(model);

        const simOptions = withDataOnlySimulationOutput(buildSimulationOptions(parsedArgs));
        await loadEvaluator();

        const experimentalData = parsedArgs.data.map((d: any) => ({
            time: d.time,
            values: d.observables,
        }));

        const result = await abcSMC({
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
            priors: parsedArgs.priors as ABCSMCConfig['priors'],
            experimentalData,
            observables: parsedArgs.observables,
            distance: parsedArgs.distance ?? 'sse',
            nParticles: parsedArgs.n_particles ?? 500,
            nPopulations: parsedArgs.n_populations ?? 10,
            maxSimulations: parsedArgs.max_simulations ?? 100000,
            seed: parsedArgs.seed ?? 42,
        });

        return createToolResult(result);
    } catch (error) {
        const structured = structureError(error instanceof Error ? error : new Error(String(error), { cause: error }));
        return createToolResult(structured);
    }
}
